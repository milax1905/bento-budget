#!/usr/bin/env python3
"""Tous les profils de console / de rig, d'un coup.

Chaque scenario instancie une console factice (voir mock_test.py), la
deforme un peu (pas de groupes, pas d'API de selection, cellules, panne en
pleine generation, presets d'une autre palette, options personnalisees,
annulation...) et verifie que le plugin reagit comme prevu.

Usage :  python3 test/all_scenarios.py      -> "TOUS LES SCENARIOS OK" / liste
"""
import os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_test as mt   # noqa: E402

fails = []


def check(name, cond, msg):
    if not cond:
        fails.append("%s: %s" % (name, msg))


def run(name, patch="", presets="{}", labels_readable=True):
    d = os.path.join(mt.HERE, "_img_" + name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    lua, main = mt.make_runtime(d, presets=presets, labels_readable=labels_readable)
    if patch:
        lua.execute(patch)
    main(None)
    cmds = mt.lua_list(lua.eval("__cmds"))
    macs = {int(k): mt.lua_list(v) for k, v in lua.eval("__macs").items()}
    n = lua.eval("#__layout()")
    elems = [lua.eval("__layout()[%d]" % i) for i in range(1, n + 1)]
    return lua, cmds, macs, elems


# MessageBox qui ENREGISTRE ce qu'il affiche, et repond selon le titre.
RECORDING_BOX = r'''
_G.__boxes = {}
_G.MessageBox = function(t)
    local inputs = {}
    if t.inputs then
        for _, inp in ipairs(t.inputs) do inputs[inp.name] = inp.value end
    end
    local shown = {}
    for k, v in pairs(inputs) do shown[k] = v end
    __boxes[#__boxes + 1] = { title = t.title or "", message = t.message or "", inputs = shown }
    local r = BOX_ANSWER and BOX_ANSWER(t, inputs) or 1
    return { result = r, inputs = inputs }
end
'''


def count_prefix(cmds, prefix):
    return sum(1 for c in cmds if c.startswith(prefix))


def boxes(lua):
    out = []
    for b in mt.lua_list(lua.eval("__boxes")):
        out.append((b["title"], b["message"]))
    return out


def box_inputs(lua):
    """[(titre, {champ: valeur pre-remplie})] dans l'ordre d'affichage."""
    out = []
    for b in mt.lua_list(lua.eval("__boxes")):
        inp = b["inputs"]
        out.append((b["title"], {k: v for k, v in inp.items()} if inp is not None else {}))
    return out


def recap_of(lua):
    return [m for t, m in boxes(lua) if "Recapitulatif" in t]


# 1) rig imbrique de reference : toute la batterie de mock_test
cmds, macs, elems = mt.run_default()
errs = mt.check(cmds, macs, elems)
check("rig de reference", not errs, "; ".join(errs[:5]))

# 2) aucun groupe -> une ligne par machine, aucun FX, aucune rangee C1/C2
lua, cmds, macs, elems = run("nogrp", '''
local prev = _G.ObjectList
_G.ObjectList = function(a)
    if a:match("^Group %d+$") then return {} end
    return prev(a)
end''')
check("mode machines", len(elems) == 1 + 9 * 13 + 1 + 14, "%d cases" % len(elems))
check("mode machines", not any(re.match(r'^Label Macro \d+ "FX ', c) for c in cmds), "des FX ont ete crees sans groupe")
check("mode machines", not any(re.match(r'^Label Macro \d+ "C1 ', c) for c in cmds), "rangee C1 creee sans FX")
check("mode machines", not any(re.match(r"^Store Sequence \d+ Cue 2 ", c) for c in cmds), "une boucle a ete creee sans groupe")
check("mode machines", cmds[-1] == "ClearAll", "programmer sale")
check("mode machines", 'Label Sequence 113 "Fix 1 Red"' in cmds, "la premiere machine n'a pas sa ligne")

# 3) console sans API de selection -> repli sur le fan par plage
lua, cmds, macs, elems = run("nosel", "_G.SelectionFirst = nil\n_G.GetSubfixture = nil\n")
i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % mt.seq_fx(1, 1))
check("sans API selection", cmds[i - 3:i] == ["Group 1", "At Preset 4.%d" % mt.P_FX1, "Delay 0 Thru 1"],
      "repli incorrect : %s" % cmds[i - 3:i])
i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % mt.seq_fx(1, 2))
check("sans API selection", cmds[i - 1] == "Delay 1 Thru 0", "C>J en repli : %s" % cmds[i - 1])
i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % mt.seq_fx(1, 5))
check("sans API selection", cmds[i - 1] == "Delay 1", "damier en repli : %s" % cmds[i - 1])
check("sans API selection", not any("Thru 1 Thru" in c for c in cmds), "fan multi-points (syntaxe MA2) emis")
# le reste du board ne doit pas changer : memes macros, memes cases
_, _, macs2, elems2 = run("nosel2", "_G.SelectionFirst = nil\n")
check("sans API selection", len(elems2) == 115, "%d cases au lieu de 115" % len(elems2))
# sans enumeration, le plugin ne sait pas qui chevauche qui : prudence, une
# tuile FX coupe tout le bloc FX (sauf sa propre boucle) avant de la lancer
check("sans API selection", macs2.get(mt.m_fx(1, 1), [])[:2] == mt.off_split(mt.SEQ_FX0, mt.SEQ_LAST, 149, "1") + ["Go+ Sequence 149"],
      "tuile FX en repli : %s" % macs2.get(mt.m_fx(1, 1), [])[:3])

# 4) machines a cellules : les adresses de cellules sont respectees
lua, cmds, macs, elems = run("cells", '''
_G.GetSubfixture = function(idx)
    local fid = (idx - 7) / 10
    return { ToAddr = function(self) return string.format("301.%d", fid) end }
end''')
i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % mt.seq_fx(1, 1))
j = i
while cmds[j] != "ClearAll":
    j -= 1
sel = [c for c in cmds[j + 1:i] if c.startswith("Fixture ")]
check("cellules", sel == ["Fixture 301.1", "Fixture 301.2", "Fixture 301.3"], "adresses : %s" % sel)

# 5) panne en pleine generation -> programmer vide, message d'echec, pas de board
lua, cmds, macs, elems = run("boom", RECORDING_BOX + '''
local prev = _G.Cmd
_G.Cmd = function(s)
    if s == "Store Sequence 120 Cue 1 /NoConfirmation" then error("console en vrac") end
    return prev(s)
end''')
check("panne", cmds[-1] == "ClearAll", "le programmer n'a pas ete vide apres la panne")
check("panne", not any(c.startswith("Store Macro") for c in cmds), "des macros ont ete construites apres la panne")
check("panne", any("interrompue" in m for _, m in boxes(lua)), "pas de message d'echec")
check("panne", len(elems) == 0, "des cases ont ete posees apres la panne")

# 6) presets d'une AUTRE palette : seuls les labels faux sont re-stockes
OLD = {101: "Red", 102: "Orange", 103: "Yellow", 104: "Green", 105: "Cyan", 106: "Blue",
       107: "Violet", 108: "Magenta", 109: "Pink", 110: "White", 111: "Amber", 112: "Azure"}
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in OLD.items()) + " }"
lua, cmds, macs, elems = run("stale", RECORDING_BOX, presets=pl)
stored = sorted(int(m.group(1)) for c in cmds for m in [re.match(r"^Store Preset 4\.(\d+) ", c)] if m)
want = sorted(no for no, nm in OLD.items() if nm != mt.COLOR_NAMES[no - 101])
check("palette perimee", stored == want, "re-stockes %s != %s" % (stored, want))
check("palette perimee", all("/Overwrite" in c for c in cmds if c.startswith("Store Preset")), "re-stockage sans /Overwrite")
check("palette perimee", any("autre palette" in m for _, m in boxes(lua)), "le recapitulatif ne signale pas la palette")
check("palette perimee", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds,
      "slots FX non re-seedes apres correction")

# 7) palette a jour : rien n'est reecrit, tout est reutilise
cur = "{ " + ", ".join("[%d] = '%s'" % (101 + i, n) for i, n in enumerate(mt.COLOR_NAMES)) + " }"
lua, cmds, macs, elems = run("current", RECORDING_BOX, presets=cur)
check("palette a jour", not any(c.startswith("Store Preset") for c in cmds), "des presets ont ete reecrits")
check("palette a jour", any("12 reutilises" in m for _, m in boxes(lua)), "le bilan ne compte pas 12 reutilises")

# 8) labels illisibles : on ne touche a rien (prudence)
lua, cmds, macs, elems = run("noname", presets=cur, labels_readable=False)
check("labels illisibles", not any(c.startswith("Store Preset") for c in cmds), "presets reecrits sans pouvoir lire leur nom")

# 9) annulation au premier ecran : AUCUNE commande
lua, cmds, macs, elems = run("cancel", RECORDING_BOX + "BOX_ANSWER = function() return 0 end\n")
check("annulation", len(cmds) == 0, "%d commandes envoyees apres Annuler" % len(cmds))

# 10) annulation a la confirmation d'ecrasement : rien n'est supprime
lua, cmds, macs, elems = run("cancel2", RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("Recapitulatif") then return 0 end
    return 1
end''')
check("annulation ecrasement", not any(c.startswith("Delete ") for c in cmds), "des objets ont ete supprimes")
check("annulation ecrasement", not any(c.startswith("Store ") for c in cmds), "des objets ont ete crees")

# 11) Options personnalisees : tout suit (fondus, vitesse, IDs, layout, couleurs)
lua, cmds, macs, elems = run("options", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    local title = t.title or ""
    if title:match("1/3") then inputs["Nb couleurs (1-12)"] = "6" end
    if title:match("2/3") then
        inputs["Fade couleur (s)"] = "2"
        inputs["Fade arret (s)"] = "3"
        inputs["Balayage FX (s)"] = "2"
        inputs["Fondu FX (s, 0 = sec)"] = "0,2"
    end
    if title:match("3/3") then
        inputs["ID de depart (101+)"] = "501"
        inputs["Layout (No)"] = "3"
    end
    return 1
end''')
check("options", "Store Sequence 501 Cue 1 /NoConfirmation" in cmds, "ID de depart ignore")
check("options", 'Set Sequence 501 Cue 1 Property "CueInFade" "2"' in cmds, "fade couleur ignore")
check("options", "Store Layout 3 /NoConfirmation" in cmds and any(c.endswith(" At Layout 3") for c in cmds),
      "numero de layout ignore")
check("options", not any(c.startswith("Delete ") for c in cmds), "plages libres : rien ne doit etre supprime")
nColorSeq = sum(1 for c in cmds if re.match(r"^Label Sequence \d+ \"(ALL|SPOT|WASH|GENERAL) ", c))
check("options", nColorSeq == 4 * 6, "%d sequences couleur pour 6 couleurs" % nColorSeq)
fx1 = 501 + 4 * 6
i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % fx1)
j = i
while cmds[j] != "ClearAll":
    j -= 1
dl = [c for c in cmds[j + 1:i] if c.startswith("Delay ")]
check("options", dl == ["Delay 0", "Delay 1", "Delay 2"], "vitesse FX 2 s ignoree : %s" % dl)
check("options", 'Set Sequence %d Cue 1 Property "CueInFade" "0.2"' % fx1 in cmds, "fondu FX 0,2 (virgule) ignore")
off = macs.get(501, [])
check("options", off and off[0].endswith("Fade 3"), "fade arret 3 s ignore : %s" % off[:1])
tile = macs.get(501 + 8 + 2 * 6 + 5 + 2 * 12, [])
check("options", tile and tile[0] == "Goto Sequence 501 Cue 1 Fade 2", "tuile 1 : %s" % tile[:1])
# les slots FX ne bougent pas avec le nombre de couleurs (capacite 12)
check("options", "Copy Preset 4.501 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % (501 + 12) in cmds,
      "slot C1 decale par le nombre de couleurs")

# 12) "Reglages par defaut" saute les trois ecrans et construit pareil
lua, cmds, macs, elems = run("defaults", RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("v%d") and not (t.message or ""):match("Board construit") then return 2 end
    return 1
end''')
titles = [t for t, _ in boxes(lua)]
check("reglages par defaut", not any("1/3" in t or "2/3" in t or "3/3" in t for t in titles),
      "les ecrans de reglage ont ete montres : %s" % titles)
check("reglages par defaut", any("Recapitulatif" in t for t in titles), "pas de recapitulatif")
check("reglages par defaut", len(elems) == 115 and "Store Sequence 101 Cue 1 /NoConfirmation" in cmds,
      "board different du nominal (%d cases)" % len(elems))

# 13) "Modifier" au recapitulatif : on repasse par les ecrans, les nouvelles valeurs comptent
lua, cmds, macs, elems = run("modify", RECORDING_BOX + '''
local recaps = 0
BOX_ANSWER = function(t, inputs)
    local title = t.title or ""
    if title:match("Recapitulatif") then
        recaps = recaps + 1
        if recaps == 1 then return 2 end     -- Modifier
        return 1                              -- Construire
    end
    if recaps == 1 and title:match("2/3") then inputs["Fade couleur (s)"] = "4" end
    return 1
end''')
titles = [t for t, _ in boxes(lua)]
check("modifier", sum(1 for t in titles if "Recapitulatif" in t) == 2, "le recapitulatif doit s'afficher deux fois")
check("modifier", sum(1 for t in titles if "2/3" in t) == 2, "l'ecran 2/3 doit s'afficher deux fois")
check("modifier", 'Set Sequence 101 Cue 1 Property "CueInFade" "4"' in cmds, "la valeur du second passage n'est pas prise")
check("modifier", count_prefix(cmds, "Store Sequence 101 Cue 1 ") == 1, "la sequence 101 stockee plusieurs fois")
recap_msgs = [m for t, m in boxes(lua) if "Recapitulatif" in t]
check("modifier", all("Fade couleur 1s" in recap_msgs[0] and "Fade couleur 4s" in recap_msgs[1] for _ in [0]),
      "le recapitulatif ne reflete pas les valeurs")

# 14) le recapitulatif dit la verite sur les lignes et les plages
lua, cmds, macs, elems = run("recap", RECORDING_BOX)
recap = [m for t, m in boxes(lua) if "Recapitulatif" in t][0]
for frag in ("LIGNES (4) : ALL, SPOT, WASH, GENERAL", "COULEURS : 12", "15 boucles",
             "Balayage FX 1s - Fondu FX 0s", "Sequences 101-163", "Macros 101-212",
             "Presets 4.101-4.112", "Layout 1", "slots FX 4.113 et 4.114", "Plages libres"):
    check("recapitulatif", frag in recap, "manque '%s'" % frag)
check("recapitulatif", "ATTENTION" not in recap and "Ignores" not in recap, "faux avertissement : %s" % recap)
final = [m for t, m in boxes(lua) if "Board construit" in m]
check("ecran final", final and "115/115" in final[0] and "12 reutilises" not in final[0] and "12 crees" in final[0]
      and "Images 3.101-3.128 : 28/28" in final[0] and "non enumerable" not in final[0],
      "bilan final faux : %s" % (final[0][:300] if final else "absent"))

# 15) la generation ne laisse jamais le programmer charge, meme en nominal
lua, cmds, macs, elems = run("clean")
last_sel = max(i for i, c in enumerate(cmds) if re.match(r"^(Fixture|Group) ", c))
check("programmer propre", "ClearAll" in cmds[last_sel:], "pas de ClearAll apres la derniere selection")

# 16) annulation a CHAQUE ecran de reglage : aucune commande, aucun objet
for step in ("1/3", "2/3", "3/3"):
    lua, cmds, macs, elems = run("cancel_" + step.replace("/", ""), RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("%s") then return 0 end
    return 1
end''' % step)
    check("annulation %s" % step, len(cmds) == 0, "%d commandes envoyees" % len(cmds))
    check("annulation %s" % step, not recap_of(lua), "le recapitulatif s'affiche quand meme")

# 17) ID de depart trop bas : rien n'est ecrit sous 101 (les 1-100 sont a l'utilisateur)
lua, cmds, macs, elems = run("lowid", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("3/3") then inputs["ID de depart (101+)"] = "50" end
    return 1
end''')
nums = [int(m.group(1)) for c in cmds for m in [re.match(r"^(?:Store|Delete|Label) (?:Sequence|Macro|Appearance) (\d+)", c)] if m]
nums += [int(m.group(1)) for c in cmds for m in [re.match(r"^(?:Store|Copy|Label) Preset 4\.(\d+)", c)] if m]
nums += [int(m.group(1)) for c in cmds for m in [re.match(r"^Import Image 'Images'\.(\d+) ", c)] if m]
check("ID bas", nums and min(nums) >= 101, "objet ecrit sous 101 : %s" % sorted(set(n for n in nums if n < 101))[:5])
check("ID bas", "Store Sequence 101 Cue 1 /NoConfirmation" in cmds, "l'ID n'a pas ete ramene a 101")

# 18) plages OCCUPEES (une macro a nous dans la plage) : avertissement, Off
#     avec fondu, nettoyage large, puis un board identique au nominal
lua, cmds, macs, elems = run("occupied", RECORDING_BOX + "__macStored[150] = true\n")
recap = recap_of(lua)[0]
check("plages occupees", "ATTENTION" in recap and "SUPPRIMES" in recap, "le recapitulatif ne previent pas")
check("plages occupees", "Sequence 101-%d, Macro 101-%d" % (mt.SEQ_DEL, mt.MAC_DEL) in recap,
      "plages de nettoyage absentes du recapitulatif : %s" % recap)
check("plages occupees", "MAtricks" not in recap, "MAtricks annonce alors qu'il n'en existe pas")
errs = mt.check(cmds, macs, elems, cleanup=True)
check("plages occupees", not errs, "; ".join(errs[:5]))
check("plages occupees", len(recap_of(lua)) == 1 and not any("craser" in t for t, _ in boxes(lua)),
      "plus d'une confirmation")

# 18b) une sequence a nous au BORD de la plage large (au-dela du board) compte aussi
lua, cmds, macs, elems = run("occupied2", RECORDING_BOX + "__seqNames[%d] = 'ma seq'\n" % mt.SEQ_DEL)
check("plages occupees (bord)", "ATTENTION" in recap_of(lua)[0], "sequence %d non detectee" % mt.SEQ_DEL)
# 18c) juste APRES la plage large : libre
lua, cmds, macs, elems = run("free_edge", RECORDING_BOX + "__seqNames[%d] = 'ma seq'\n__macStored[%d] = true\n"
                             % (mt.SEQ_DEL + 1, mt.MAC_DEL + 1))
check("plages libres (bord)", "Plages libres" in recap_of(lua)[0] and not any(c.startswith("Delete ") for c in cmds),
      "des objets hors plage ont declenche le nettoyage")
# 18d) un MAtricks d'une ancienne version : annonce ET supprime
lua, cmds, macs, elems = run("matricks", RECORDING_BOX + '''
local prev = _G.ObjectList
_G.ObjectList = function(a)
    if a == "MAtricks 101" then return { { Children = function() return {} end, Get = function() return "CPFX" end, Set = function() end } } end
    return prev(a)
end''')
check("vieux MAtricks", "MAtricks 101" in recap_of(lua)[0], "MAtricks non annonce")
check("vieux MAtricks", "Delete MAtricks 101 /NoConfirmation" in cmds, "MAtricks non supprime")

# 19) petits groupes (1 et 2 machines) : aucune boucle de duree nulle
# (GROUPS/GROUP_NAMES sont locaux au mock : on greffe les deux groupes par-dessus)
lua, cmds, macs, elems = run("small", RECORDING_BOX + '''
local prevOL, prevCmd = _G.ObjectList, _G.Cmd
local EXTRA = { [4] = { name = "SOLO", fix = { 7 } }, [5] = { name = "PAIR", fix = { 7, 8 } } }
_G.ObjectList = function(a)
    local g = a:match("^Group (%d+)$")
    if g and EXTRA[tonumber(g)] then
        local h = { Children = function() return {} end, Set = function() end,
                    Get = function() return EXTRA[tonumber(g)].name end }
        return { h }
    end
    return prevOL(a)
end
_G.__extraSel = nil
_G.Cmd = function(s)
    prevCmd(s)
    local g = s:match("^Group (%d+)$")
    if g and EXTRA[tonumber(g)] then
        __extraSel = EXTRA[tonumber(g)].fix
    elseif s == "ClearAll" or s:match("^Group ") or s:match("^Fixture ") then
        __extraSel = nil
    end
end
local prevFirst, prevNext = _G.SelectionFirst, _G.SelectionNext
_G.SelectionFirst = function()
    if __extraSel then return __extraSel[1] * 10 + 7, 1, 0, 0 end
    return prevFirst()
end
_G.SelectionNext = function(idx)
    if __extraSel then
        local fid = (idx - 7) / 10
        for i, v in ipairs(__extraSel) do
            if v == fid and __extraSel[i + 1] then return __extraSel[i + 1] * 10 + 7, i + 1, 0, 0 end
        end
        return nil
    end
    return prevNext(idx)
end''')
T5, NFX5 = 6, 5
check("petits groupes", len(elems) == 1 + T5 * 13 + NFX5 * 5 + 1 + 14 + 26 + 6, "%d cases" % len(elems))
fx0 = 101 + T5 * 12
for gi in (4, 5):
    for di in range(1, 6):
        no = fx0 + (gi - 1) * 5 + (di - 1)
        for k in (1, 2):
            i = cmds.index("Store Sequence %d Cue %d /NoConfirmation" % (no, k))
            j = i
            while cmds[j] != "ClearAll":
                j -= 1
            dl = [float(c.split()[1]) for c in cmds[j + 1:i] if re.match(r"^Delay [\d.]+$", c)]
            check("petits groupes", dl and max(dl) > 0,
                  "boucle %d cue %d : duree nulle (delays %s)" % (no, k, dl))
            nsel = sum(1 for c in cmds[j + 1:i] if c.startswith("Fixture "))
            check("petits groupes", nsel == len({4: [7], 5: [7, 8]}[gi]), "boucle %d : %d machines" % (no, nsel))
check("petits groupes", not any(re.match(r"^Delay [\d.]+ Thru", c) for c in cmds), "repli par plage utilise")
final = [m for t, m in boxes(lua) if "Board construit" in m][0]
check("petits groupes", "25 boucles FX" in final and "non enumerable" not in final, final[:300])

# 20) liste de groupes invalide : on le dit, on redemande, puis board normal
lua, cmds, macs, elems = run("badlist", RECORDING_BOX + '''
local asked = 0
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") and t.inputs then
        asked = asked + 1
        if asked == 1 then inputs["Groupes du board"] = "99 + abc" end
    end
    return 1
end''')
msgs = [m for _, m in boxes(lua)]
check("liste invalide", sum(1 for m in msgs if "Aucun numero valide dans : 99 + abc" in m) == 1, "pas de message d'erreur")
check("liste invalide", any("Inconnus : abc, 99" in m for m in msgs), "les jetons rejetes ne sont pas cites : %s" % [m for m in msgs if "Inconnus" in m])
check("liste invalide", sum(1 for t, i in box_inputs(lua) if "1/3" in t and i) == 2, "l'ecran 1/3 doit etre redemande")
check("liste invalide", len(elems) == 115, "board incomplet apres la relance (%d cases)" % len(elems))

# 21) liste partiellement valide : les inconnus sont ignores ET cites au recap
lua, cmds, macs, elems = run("partlist", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1, 99" end
    return 1
end''')
recap = recap_of(lua)[0]
check("liste partielle", "LIGNES (2) : ALL, SPOT" in recap, "lignes : %s" % recap.splitlines()[0])
check("liste partielle", "Ignores (inexistants) : 99" in recap, "le groupe 99 n'est pas signale")
check("liste partielle", len(elems) == 1 + 2 * 13 + 5 + 1 + 14 + 26 + 6, "%d cases" % len(elems))
check("liste partielle", 'Label Sequence 101 "ALL Red"' in cmds and 'Label Sequence 113 "SPOT Red"' in cmds, "sequences")

# 22) l'accueil et le recapitulatif ne promettent des FX qu'avec des groupes
lua, cmds, macs, elems = run("welcome_grp", RECORDING_BOX)
welcome = boxes(lua)[0][1]
check("accueil (groupes)", "3 groupe(s) : SPOT, WASH, GENERAL" in welcome and "5 formes FX" in welcome, welcome[:200])
lua, cmds, macs, elems = run("welcome_nogrp", RECORDING_BOX + '''
local prev = _G.ObjectList
_G.ObjectList = function(a)
    if a:match("^Group %d+$") then return {} end
    return prev(a)
end''')
welcome = boxes(lua)[0][1]
recap = recap_of(lua)[0]
check("accueil (machines)", "aucun groupe -> 8 machine(s)" in welcome and "pas de FX" in welcome
      and "formes FX" not in welcome, welcome[:200])
check("recap (machines)", "FX : aucune" in recap and "Balayage" not in recap and "slots FX" not in recap, recap)
temps = [i for t, i in box_inputs(lua) if "2/3" in t][0]
check("ecran 2/3 (machines)", "Balayage FX (s)" not in temps and "Fade couleur (s)" in temps, "champs : %s" % sorted(temps))
final = [m for t, m in boxes(lua) if "Board construit" in m][0]
check("final (machines)", "0 boucles FX" in final, final[:200])

# 23) un preset A NOUS sur un slot FX : avertissement, puis le slot est pris
mine = dict((101 + i, n) for i, n in enumerate(mt.COLOR_NAMES))
mine[mt.P_FX1] = "MonPreset"
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in mine.items()) + " }"
lua, cmds, macs, elems = run("foreign", RECORDING_BOX, presets=pl)
recap = recap_of(lua)[0]
check("slot FX occupe", "ATTENTION" in recap and "4.%d (MonPreset)" % mt.P_FX1 in recap, "slot non signale : %s" % recap)
check("slot FX occupe", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds, "slot non re-seede")
check("slot FX occupe", not any(c.startswith("Delete Preset") for c in cmds), "un preset a ete supprime")
# ... et nos propres slots ("CP FX ...") ne declenchent rien
mine[mt.P_FX1] = "CP FX C1"
mine[mt.P_FX2] = "CP FX C2"
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in mine.items()) + " }"
lua, cmds, macs, elems = run("ownslots", RECORDING_BOX, presets=pl)
check("slots FX a nous", "Plages libres" in recap_of(lua)[0], "nos propres slots declenchent l'avertissement")
check("slots FX a nous", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds, "slots non re-seedes")

# 24) Modifier : les ecrans sont PRE-REMPLIS avec ce qui a ete tape
lua, cmds, macs, elems = run("prefill", RECORDING_BOX + '''
local recaps = 0
BOX_ANSWER = function(t, inputs)
    local title = t.title or ""
    if title:match("Recapitulatif") then
        recaps = recaps + 1
        return (recaps == 1) and 2 or 1
    end
    if recaps == 0 and title:match("1/3") then inputs["Groupes du board"] = "2 + 3"; inputs["Nb couleurs (1-12)"] = "7" end
    if recaps == 0 and title:match("2/3") then inputs["Fade couleur (s)"] = "4"; inputs["Balayage FX (s)"] = "2,5" end
    if recaps == 0 and title:match("3/3") then inputs["Layout (No)"] = "4" end
    return 1
end''')
shown = box_inputs(lua)
second = [i for t, i in shown if "1/3" in t and i][1]
check("pre-remplissage", second.get("Groupes du board") == "2 + 3" and second.get("Nb couleurs (1-12)") == "7",
      "1/3 : %s" % second)
second = [i for t, i in shown if "2/3" in t][1]
check("pre-remplissage", second.get("Fade couleur (s)") == "4" and second.get("Balayage FX (s)") == "2.5", "2/3 : %s" % second)
second = [i for t, i in shown if "3/3" in t][1]
check("pre-remplissage", second.get("Layout (No)") == "4", "3/3 : %s" % second)
recap = recap_of(lua)[1]
check("pre-remplissage", "LIGNES (3) : ALL, WASH, GENERAL" in recap and "COULEURS : 7" in recap
      and "Balayage FX 2.5s" in recap and "Layout 4" in recap, recap)

# 25) 12 groupes max : au-dela, le recapitulatif le dit
lua, cmds, macs, elems = run("many", RECORDING_BOX + '''
local prev = _G.ObjectList
_G.ObjectList = function(a)
    local g = a:match("^Group (%d+)$")
    if g and tonumber(g) <= 14 then
        local h = { Children = function() return {} end, Set = function() end, Get = function() return "G" .. g end }
        return { h }
    end
    return prev(a)
end''')
recap = recap_of(lua)[0]
check("12 groupes max", "LIGNES (13)" in recap and "limitees a 12" in recap, recap.splitlines()[0])

print("\n".join(fails) if fails else "TOUS LES SCENARIOS OK")
sys.exit(1 if fails else 0)
