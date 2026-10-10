#!/usr/bin/env python3
"""Tous les profils de console / de rig, d'un coup (v9, recipes).

Chaque scenario instancie une console factice (voir mock_test.py), la
deforme un peu (ligne 2 de recipe non creee par Assign, pas de
selectiondata, Set par plage refuse, CMD de cue inerte, commande refusee,
panne, palettes, annulations, plages occupees, listes fausses...) et
verifie que le plugin reagit comme prevu : repli propre, ou refus COMPTE
et affiche au bilan — jamais un board qui "fait n'importe quoi" en silence.

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
    cmds, macs, elems, seqs = mt.snapshot(lua)
    return lua, cmds, macs, elems, seqs


# MessageBox qui ENREGISTRE ce qu'il affiche (et les champs pre-remplis),
# et repond selon le titre.
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

NO_GROUPS = '''
local prev = _G.ObjectList
_G.ObjectList = function(a)
    if a:match("^Group %d+$") then return {} end
    return prev(a)
end'''


def boxes(lua):
    return [(b["title"], b["message"]) for b in mt.lua_list(lua.eval("__boxes"))]


def box_inputs(lua):
    out = []
    for b in mt.lua_list(lua.eval("__boxes")):
        inp = b["inputs"]
        out.append((b["title"], {k: v for k, v in inp.items()} if inp is not None else {}))
    return out


def recap_of(lua):
    return [m for t, m in boxes(lua) if "Recapitulatif" in t]


def final_of(lua):
    f = [m for t, m in boxes(lua) if "Board construit" in m]
    return f[0] if f else ""


def refused(cmds):
    return [c for c in cmds if "  ## " in c]


# 1) rig imbrique de reference : toute la batterie de mock_test
cmds, macs, elems, seqs = mt.run_default()
errs = mt.check(cmds, macs, elems, seqs)
check("rig de reference", not errs, "; ".join(errs[:5]))

# 2) bilan nominal : zero refus, tout verifie, CMD OK
lua, cmds, macs, elems, seqs = run("final", RECORDING_BOX)
final = final_of(lua)
for frag in ("Board construit.", "Commandes refusees : 0", "Lignes de recipe : 102/102",
             "Cues cuisinees : 78/78", "Boucles en Follow : 30/30", "Groupes enumeres : 3/3",
             "CMD de cue : OK", "122/122", "Images 3.101-3.126 : 26/26", "12 crees"):
    check("bilan", frag in final, "manque '%s' dans : %s" % (frag, final[:400]))
check("bilan", "AVEC DES REFUS" not in final and "non verifiable" not in final, final[:300])
check("bilan", lua.eval("__vars['cp_cmd']") == "1", "la probe CMD n'a pas lu la variable")

# 3) la ligne 2 de recipe n'est pas creee par Assign -> repli Lua (Acquire)
lua, cmds, macs, elems, seqs = run("line2lua", RECORDING_BOX + "ASSIGN_CREATES_LINE2 = false\n")
errs = [e for e in mt.check(cmds, macs, elems, seqs) if "refusee(s) par la console" not in e]
check("repli Acquire", not errs, "; ".join(errs[:5]))
check("repli Acquire", "Lignes de recipe : 102/102" in final_of(lua) and "Board construit." in final_of(lua)
      and "Commandes refusees : 0" in final_of(lua), final_of(lua)[:300])
check("repli Acquire", any("Part 0.2  ##" in c for c in refused(cmds)), "l'Assign de la ligne 2 aurait du etre refuse")

# 4) ni Assign ni Acquire pour la ligne 2 -> refus comptes, bilan honnete
lua, cmds, macs, elems, seqs = run("line2none", RECORDING_BOX + "ASSIGN_CREATES_LINE2 = false\nACQUIRE_OK = false\n")
final = final_of(lua)
check("ligne 2 impossible", "AVEC DES REFUS" in final and "Lignes de recipe : 78/102" in final, final[:400])
check("ligne 2 impossible", "ligne de recipe 2 de Sequence 101 Cue 1 non creee" in final, final[:400])
# les lignes de groupe, elles, sont completes
check("ligne 2 impossible", all(len(seqs[mt.seq_c(ti, ci)]["cues"][1]["lines"]) == 1 for ti in (2, 3, 4) for ci in range(1, 13)),
      "les lignes de groupe ont souffert")

# 5) pas de selectiondata -> membres lus par la selection (lecture seule, ClearAll)
lua, cmds, macs, elems, seqs = run("nosel", RECORDING_BOX + "SELDATA_OK = false\n")
check("repli selection", "Groupes enumeres : 3/3" in final_of(lua), final_of(lua)[:300])
i = [k for k, c in enumerate(cmds) if c == "Group 1"]
check("repli selection", len(i) == 1 and cmds[i[0] + 1] == "ClearAll", "Group 1 doit etre suivi d'un ClearAll")
check("repli selection", seqs[mt.seq_c(2, 1)]["cues"][1]["props"]["Command"] == mt.row_kill_cmd(2, "1"), "CMD different en repli")
# ... et sans aucune API : prudence (toutes les boucles coupees), bilan 0/3
lua, cmds, macs, elems, seqs = run("nosel2", RECORDING_BOX + "SELDATA_OK = false\n_G.SelectionFirst = nil\n")
check("sans API", "Groupes enumeres : 0/3" in final_of(lua), final_of(lua)[:300])
check("sans API", seqs[mt.seq_c(2, 1)]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d Fade 1" % (mt.SEQ_FX0, mt.SEQ_LAST),
      "sans membres, une couleur doit couper tout le bloc FX")
check("sans API", seqs[mt.seq_fx(1, 1)]["cues"][1]["props"]["Command"] == "Off Sequence 150 Thru 163 Fade 1",
      "sans membres, une tuile FX coupe tout sauf elle")

# 6) Set par plage refuse -> rangees FADE detaillees, bilan le dit
lua, cmds, macs, elems, seqs = run("noranged", RECORDING_BOX + "RANGED_SET_OK = false\n")
lc = macs[mt.M_FC0]
check("sans plage", len([l for l in lc if 'Property "CueInFade"' in l]) == 48, "%d lignes CueInFade" % len(lc))
check("sans plage", not any(re.match(r"^Set Sequence \d+ Thru \d+ Cue", l) for l in lc), "une ligne par plage a survecu")
check("sans plage", "Set par plage refuse" in final_of(lua), final_of(lua)[:300])
check("sans plage", "Commandes refusees : 1" in final_of(lua), "le Set par plage refuse doit etre compte une fois")

# 7) CMD de cue inerte -> le bilan dit NON
lua, cmds, macs, elems, seqs = run("nocmd", RECORDING_BOX + "CMD_EXEC_OK = false\n")
check("CMD inerte", "CMD de cue : NON" in final_of(lua), final_of(lua)[:300])
check("CMD inerte", mt.SEQ_PROBE not in seqs, "sequence de test non supprimee")

# 8) une propriete refusee par la console : comptee, citee, board termine
# (la console refuse la propriete par commande ET par handle : rien a replier)
lua, cmds, macs, elems, seqs = run("refuse", RECORDING_BOX + "CUE_PROPS.TrigType = nil\n")
final = final_of(lua)
check("refus compte", "AVEC DES REFUS" in final and "Commandes refusees : 30" in final, final[:400])
check("refus compte", '1ere : Set Sequence 149 Cue 1 Property "TrigType" "Follow"  ->  Illegal property' in final, final[:500])
check("refus compte", "Boucles en Follow : 0/30 (30 non verifiables)" in final, final[:400])
check("refus compte", len(elems) == 122, "le board doit quand meme etre pose (%d cases)" % len(elems))
# un refus cosmetique (appearance) n'alarme pas
lua, cmds, macs, elems, seqs = run("refuse2", RECORDING_BOX + '''REFUSE['^Assign Appearance %d+ At Sequence'] = "Illegal object"\n''')
check("refus cosmetique", "Board construit." in final_of(lua) and "Commandes refusees : 0" in final_of(lua), final_of(lua)[:300])

# 9) WrapAround "Yes" refuse par la commande -> pose par le handle (ou "1"), aucun refus compte
lua, cmds, macs, elems, seqs = run("wrap1", RECORDING_BOX + '''REFUSE['Property "WrapAround" "Yes"'] = "Illegal value"\n''')
check("WrapAround", all(s["props"].get("WrapAround") in ("Yes", "1") for no, s in seqs.items() if no >= mt.SEQ_FX0), "WrapAround non pose")
check("WrapAround", "Commandes refusees : 0" in final_of(lua) and "Board construit." in final_of(lua), final_of(lua)[:300])
check("WrapAround", any('WrapAround" "Yes"  ## Illegal value' in c for c in cmds), "la commande aurait du etre refusee")

# 10) panne en pleine generation -> programmer vide, message d'echec, pas de board
lua, cmds, macs, elems, seqs = run("boom", RECORDING_BOX + '''
local prev = _G.Cmd
_G.Cmd = function(s)
    if s == "Store Sequence 120 Cue 1 /Overwrite /NoConfirmation" then error("console en vrac") end
    return prev(s)
end''')
check("panne", cmds[-1] == "ClearAll", "le programmer n'a pas ete vide apres la panne")
check("panne", not any(c.startswith("Store Macro") for c in cmds), "des macros ont ete construites apres la panne")
check("panne", any("interrompue" in m for _, m in boxes(lua)), "pas de message d'echec")
check("panne", len(elems) == 0, "des cases ont ete posees apres la panne")

# 11) presets d'une AUTRE palette : seuls les labels faux sont re-stockes
OLD = {101: "Red", 102: "Orange", 103: "Yellow", 104: "Green", 105: "Cyan", 106: "Blue",
       107: "Violet", 108: "Magenta", 109: "Pink", 110: "White", 111: "Amber", 112: "Azure"}
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in OLD.items()) + " }"
lua, cmds, macs, elems, seqs = run("stale", RECORDING_BOX, presets=pl)
stored = sorted(int(m.group(1)) for c in cmds for m in [re.match(r"^Store Preset 4\.(\d+) ", c)] if m)
want = sorted(no for no, nm in OLD.items() if nm != mt.COLOR_NAMES[no - 101])
check("palette perimee", stored == want, "re-stockes %s != %s" % (stored, want))
check("palette perimee", any("autre palette" in m for m in recap_of(lua)), "le recapitulatif ne signale pas la palette")

# 12) palette a jour : ZERO programmer (hors ClearAll), tout reutilise
cur = "{ " + ", ".join("[%d] = '%s'" % (101 + i, n) for i, n in enumerate(mt.COLOR_NAMES)) + " }"
lua, cmds, macs, elems, seqs = run("current", RECORDING_BOX, presets=cur)
check("palette a jour", not any(re.match(r"^(Fixture|Group|Attribute|At |Store Preset)", c) for c in cmds), "le programmer a servi")
check("palette a jour", any("12 reutilises" in m for m in recap_of(lua)) and "12 reutilises" in final_of(lua), "bilan presets")
check("palette a jour", "rien d'autre" in recap_of(lua)[0], recap_of(lua)[0])
errs = mt.check(cmds, macs, elems, seqs) if False else []

# 13) labels illisibles : on ne touche a rien (prudence)
lua, cmds, macs, elems, seqs = run("noname", presets=cur, labels_readable=False)
check("labels illisibles", not any(c.startswith("Store Preset") for c in cmds), "presets reecrits sans pouvoir lire leur nom")

# 14) annulation a chaque ecran : AUCUNE commande
for step in ("v9", "1/3", "2/3", "3/3", "Recapitulatif"):
    lua, cmds, macs, elems, seqs = run("cancel_" + step.replace("/", ""), RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("%s") then return 0 end
    return 1
end''' % step.replace("v9", "v%d"))
    check("annulation %s" % step, len(cmds) == 0, "%d commandes envoyees" % len(cmds))

# 15) Options personnalisees : tout suit
lua, cmds, macs, elems, seqs = run("options", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    local title = t.title or ""
    if title:match("1/3") then inputs["Nb couleurs (1-12)"] = "6" end
    if title:match("2/3") then
        inputs["Fade couleur (s)"] = "2"
        inputs["Fade arret (s)"] = "3"
        inputs["Vitesse FX (s)"] = "4"
        inputs["Fondu FX (s)"] = "0,5"
    end
    if title:match("3/3") then
        inputs["ID de depart (101+)"] = "501"
        inputs["Layout (No)"] = "3"
    end
    return 1
end''')
check("options", 501 in seqs and seqs[501]["name"] == "ALL Red", "ID de depart ignore")
check("options", seqs[501]["cues"][1]["props"]["CueInFade"] == "2", "fade couleur ignore")
check("options", "Store Layout 3 /NoConfirmation" in cmds and any(c.endswith(" At Layout 3") for c in cmds), "layout ignore")
nColorSeq = sum(1 for s in seqs.values() if re.match(r"^(ALL|SPOT|WASH|GENERAL) ", s["name"]))
check("options", nColorSeq == 4 * 6, "%d sequences couleur pour 6 couleurs" % nColorSeq)
fx1 = 501 + 4 * 6
check("options", seqs[fx1]["cues"][1]["lines"][0]["props"]["DelayToX"] == "4", "vitesse FX 4 s ignoree")
check("options", seqs[fx1]["cues"][1]["props"]["CueInFade"] == "0.5", "fondu FX 0,5 (virgule) ignore")
check("options", macs[501] == ["Off Sequence 501 Thru %d Fade 3" % (fx1 + 14)], "Off All : %s" % macs.get(501))
check("options", "Copy Preset 4.501 At Preset 4.513 /Overwrite /NoConfirmation /NoOops" in cmds, "slot C1 decale")
check("options", "Assign Appearance %d At Macro %d" % (501 + 2 * 12 + 2, 501 + 44 + 3) in cmds, "bouton FX VITESSE 4 non surligne")

# 16) "Reglages par defaut" saute les trois ecrans et construit pareil
lua, cmds, macs, elems, seqs = run("defaults", RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("v%d") and not (t.message or ""):match("Board construit") then return 2 end
    return 1
end''')
titles = [t for t, _ in boxes(lua)]
check("reglages par defaut", not any("1/3" in t or "2/3" in t or "3/3" in t for t in titles), "ecrans montres : %s" % titles)
check("reglages par defaut", len(elems) == 122 and 101 in seqs, "board different du nominal")

# 17) "Modifier" au recapitulatif : ecrans pre-remplis, nouvelles valeurs prises
lua, cmds, macs, elems, seqs = run("modify", RECORDING_BOX + '''
local recaps = 0
BOX_ANSWER = function(t, inputs)
    local title = t.title or ""
    if title:match("Recapitulatif") then
        recaps = recaps + 1
        return (recaps == 1) and 2 or 1
    end
    if recaps == 0 and title:match("1/3") then inputs["Groupes du board"] = "2 + 3"; inputs["Nb couleurs (1-12)"] = "7" end
    if recaps == 0 and title:match("2/3") then inputs["Fade couleur (s)"] = "4"; inputs["Vitesse FX (s)"] = "2,5" end
    if recaps == 0 and title:match("3/3") then inputs["Layout (No)"] = "4" end
    return 1
end''')
shown = box_inputs(lua)
second = [i for t, i in shown if "1/3" in t and i][1]
check("modifier", second.get("Groupes du board") == "2 + 3" and second.get("Nb couleurs (1-12)") == "7", "1/3 : %s" % second)
second = [i for t, i in shown if "2/3" in t][1]
check("modifier", second.get("Fade couleur (s)") == "4" and second.get("Vitesse FX (s)") == "2.5", "2/3 : %s" % second)
recap = recap_of(lua)[1]
check("modifier", "LIGNES (3) : ALL, WASH, GENERAL" in recap and "COULEURS : 7" in recap and "Vitesse FX 2.5s" in recap and "Layout 4" in recap, recap)
check("modifier", seqs[101]["cues"][1]["props"]["CueInFade"] == "4", "la valeur du second passage n'est pas prise")
check("modifier", sum(1 for c in cmds if c == "Store Sequence 101 Cue 1 /Overwrite /NoConfirmation") == 1, "sequence 101 stockee plusieurs fois")

# 18) le recapitulatif dit la verite
lua, cmds, macs, elems, seqs = run("recap", RECORDING_BOX)
recap = recap_of(lua)[0]
for frag in ("LIGNES (4) : ALL, SPOT, WASH, GENERAL", "COULEURS : 12", "15 vagues", "Fade couleur 1s - Fade arret 2s",
             "Vitesse FX 2s - Fondu FX 1s", "Sequences 101-163", "Macros 101-156", "Appearances 101-154",
             "Images 3.101-3.126", "Presets 4.101-4.112", "slots FX 4.113 et 4.114", "Plages libres",
             "12 preset(s) a stocker (puis ClearAll)"):
    check("recapitulatif", frag in recap, "manque '%s' dans : %s" % (frag, recap))
check("recapitulatif", "ATTENTION" not in recap, recap)

# 19) plages OCCUPEES : avertissement, Off avec fondu, nettoyage large, board identique
lua, cmds, macs, elems, seqs = run("occupied", RECORDING_BOX + "__macStored[150] = true\n")
recap = recap_of(lua)[0]
check("plages occupees", "ATTENTION" in recap and "Sequence 101-%d, Macro 101-%d" % (mt.SEQ_DEL, mt.MAC_DEL) in recap, recap)
errs = mt.check(cmds, macs, elems, seqs, cleanup=True)
check("plages occupees", not errs, "; ".join(errs[:5]))
check("plages occupees", len(recap_of(lua)) == 1, "plus d'une confirmation")
# bord de plage : une sequence a nous sur le dernier numero reserve -> occupee ; juste apres -> libre
lua, cmds, macs, elems, seqs = run("occ_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n" % mt.SEQ_DEL)
check("plages occupees (bord)", "ATTENTION" in recap_of(lua)[0], "sequence %d non detectee" % mt.SEQ_DEL)
lua, cmds, macs, elems, seqs = run("free_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n__macStored[%d] = true\n" % (mt.SEQ_DEL + 1, mt.MAC_DEL + 1))
check("plages libres (bord)", "Plages libres" in recap_of(lua)[0] and not any(c.startswith("Delete Macro") for c in cmds), "hors plage")

# 20) un preset A NOUS sur un slot FX : avertissement, puis le slot est pris
mine = dict((101 + i, n) for i, n in enumerate(mt.COLOR_NAMES))
mine[mt.P_FX1] = "MonPreset"
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in mine.items()) + " }"
lua, cmds, macs, elems, seqs = run("foreign", RECORDING_BOX, presets=pl)
check("slot FX occupe", "ATTENTION" in recap_of(lua)[0] and "4.%d (MonPreset)" % mt.P_FX1 in recap_of(lua)[0], recap_of(lua)[0])
check("slot FX occupe", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds, "slot non re-seede")
check("slot FX occupe", not any(c.startswith("Delete Preset") for c in cmds), "un preset a ete supprime")

# 21) pas de groupe : message clair, zero commande
lua, cmds, macs, elems, seqs = run("nogroups", RECORDING_BOX + NO_GROUPS)
check("sans groupe", len(cmds) == 0, "%d commandes" % len(cmds))
check("sans groupe", any("Aucun groupe" in m and "Cree tes groupes" in m for _, m in boxes(lua)), "pas de message")

# 22) liste invalide / partielle
lua, cmds, macs, elems, seqs = run("badlist", RECORDING_BOX + '''
local asked = 0
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") and t.inputs then
        asked = asked + 1
        if asked == 1 then inputs["Groupes du board"] = "99 + abc" end
    end
    return 1
end''')
msgs = [m for _, m in boxes(lua)]
check("liste invalide", any("Aucun numero valide dans : 99 + abc" in m and "Inconnus : abc, 99" in m for m in msgs), "pas de message d'erreur")
check("liste invalide", len(elems) == 122, "board incomplet apres la relance (%d cases)" % len(elems))
lua, cmds, macs, elems, seqs = run("partlist", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1, 99" end
    return 1
end''')
recap = recap_of(lua)[0]
check("liste partielle", "LIGNES (2) : ALL, SPOT" in recap and "Ignores (inexistants) : 99" in recap, recap)
check("liste partielle", seqs[101]["cues"][1]["lines"][0]["sel"] == 1 and len(seqs[101]["cues"][1]["lines"]) == 1, "ALL = le seul groupe")
check("liste partielle", seqs[101]["cues"][1]["props"]["Command"] == "Off Sequence 125 Thru 129 Fade 1", seqs[101]["cues"][1]["props"].get("Command"))

# 23) petits groupes (1 et 2 machines) : recipes identiques, CMD coherents
lua, cmds, macs, elems, seqs = run("small", RECORDING_BOX + '''
GROUPS[4] = { 7 }
GROUPS[5] = { 7, 8 }
GROUP_NAMES[4] = "SOLO"
GROUP_NAMES[5] = "PAIR"
''')
T5 = 6
check("petits groupes", len(elems) == 1 + T5 * 13 + 5 * 5 + 1 + 14 + 26 + 12 + 1, "%d cases" % len(elems))
fx0 = 101 + T5 * 12
solo, pair = fx0 + 3 * 5, fx0 + 4 * 5
check("petits groupes", seqs[solo]["cues"][1]["lines"][0]["sel"] == 4 and seqs[solo]["cues"][1]["lines"][0]["props"]["DelayToX"] == "2", "SOLO")
# SOLO (7) chevauche PAIR (7, 8) mais pas SPOT/WASH/GENERAL
check("petits groupes", seqs[solo]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d + %d Thru %d Fade 1" % (solo + 1, solo + 4, pair, pair + 4),
      seqs[solo]["cues"][1]["props"].get("Command"))
check("petits groupes", seqs[101 + 4 * 12]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d + %d Thru %d Fade 1" % (solo, solo + 4, pair, pair + 4),
      seqs[101 + 4 * 12]["cues"][1]["props"].get("Command"))
check("petits groupes", "Lignes de recipe : %d/%d" % (12 * 5 + 5 * 12 + 25 * 2, 12 * 5 + 5 * 12 + 25 * 2) in final_of(lua), final_of(lua)[:300])

# 24) 12 groupes max : au-dela, le recapitulatif le dit
lua, cmds, macs, elems, seqs = run("many", RECORDING_BOX + '''
for g = 4, 14 do GROUPS[g] = { 7, 8 }; GROUP_NAMES[g] = "G" .. g end
''')
recap = recap_of(lua)[0]
check("12 groupes max", "LIGNES (13)" in recap and "limitees a 12" in recap, recap.splitlines()[0])

# 25) la generation ne laisse jamais le programmer charge
lua, cmds, macs, elems, seqs = run("clean")
sel = [i for i, c in enumerate(cmds) if re.match(r"^(Fixture|Group|Attribute) ", c)]
check("programmer propre", not sel or "ClearAll" in cmds[max(sel):max(sel) + 4], "pas de ClearAll apres le dernier usage du programmer")

print("\n".join(fails) if fails else "TOUS LES SCENARIOS OK")
sys.exit(1 if fails else 0)
