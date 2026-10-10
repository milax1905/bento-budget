#!/usr/bin/env python3
"""Tous les profils de console / de rig, d'un coup (v9, recipes).

Chaque scenario instancie une console factice (voir mock_test.py), la
deforme un peu (ligne 2 de recipe non creee par Assign, pas de
selectiondata, Set ou Cook par plage refuses, "Off ... Fade" refuse, CMD
de cue inerte, propriete inconnue ou mal stockee, build muet, groupe vide,
copie qui casse les references, nettoyage qui laisse un objet, panne,
palettes, annulations, listes fausses...) et verifie que le plugin reagit
comme prevu : repli propre, ou refus COMPTE et affiche au bilan avec le
bon TITRE — jamais un board qui "fait n'importe quoi" en silence.

Usage :  python3 test/all_scenarios.py      -> "TOUS LES SCENARIOS OK" / liste
"""
import os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_test as mt   # noqa: E402

fails = []
OK = mt.HEADLINE_OK
DEGRADED = "Board construit - MODE DEGRADE"
PARTIAL = "Board construit - controles partiels"
REFUSED = "Board construit AVEC DES REFUS"


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


def headline(lua):
    f = final_of(lua)
    return f.splitlines()[0] if f else ""


# 1) rig imbrique de reference : toute la batterie de mock_test
cmds, macs, elems, seqs = mt.run_default()
errs = mt.check(cmds, macs, elems, seqs)
check("rig de reference", not errs, "; ".join(errs[:5]))

# 2) bilan nominal : tous les controles passent
lua, cmds, macs, elems, seqs = run("final", RECORDING_BOX)
final = final_of(lua)
for frag in (OK, "Commandes refusees : 0", "Commandes sans retour : 0", "Habillage refuse : 0",
             "Proprietes non verifiables : 0", "Lignes de recipe : 102/102", "Cues cuisinees : 78/78",
             "Boucles en Follow : 30/30", "Groupes enumeres : 3/3", "CMD de cue : OK", "Off ... Fade : accepte",
             "Colonnes de cue apres Cook : conservees", "C1/C2 : Copy + Recast", "ALL : lignes multiples",
             "Set par plage : couleurs oui, FX oui, Cook oui",
             "Macros live : FADE couleur 12 lignes, FX VITESSE 9, FX FONDU 8, C1/C2 16",
             "Layout 1 : 121/121", "Images 3.101-3.126 : 26/26", "12 crees"):
    check("bilan", frag in final, "manque '%s' dans : %s" % (frag, final[:600]))
check("bilan", lua.eval("__vars['cp_cmd']") == "1", "la probe CMD n'a pas lu la variable")

# 3) la ligne 2 de recipe n'est pas creee par Assign -> repli Lua (Acquire), bilan propre
lua, cmds, macs, elems, seqs = run("line2lua", RECORDING_BOX + "ASSIGN_CREATES_LINE2 = false\n")
errs = [e for e in mt.check(cmds, macs, elems, seqs) if "refusee(s) par la console" not in e]
check("repli Acquire", not errs, "; ".join(errs[:5]))
check("repli Acquire", headline(lua) == OK and "Lignes de recipe : 102/102" in final_of(lua), final_of(lua)[:300])
check("repli Acquire", any("Part 0.2  ##" in c for c in refused(cmds)), "l'Assign de la ligne 2 aurait du etre refuse")

# 4) ni Assign ni Acquire pour la ligne 2 -> pas de demi-ALL : ligne ALL retiree, MODE DEGRADE
lua, cmds, macs, elems, seqs = run("line2none", RECORDING_BOX + "ASSIGN_CREATES_LINE2 = false\nACQUIRE_OK = false\n")
final = final_of(lua)
check("ALL indisponible", headline(lua).startswith(DEGRADED) and "ALL indisponible" in final and "ALL : INDISPONIBLE" in final, final[:500])
check("ALL indisponible", "Commandes refusees : 0" in final and "Lignes de recipe : 66/66" in final, final[:500])
check("ALL indisponible", not any(101 <= no <= 112 for no in seqs), "des sequences ALL ont survecu : %s" % sorted(no for no in seqs if no <= 112))
check("ALL indisponible", len(elems) == 121 - 12 and not any(getattr(e, "__object", "") == "Sequence 101" for e in elems), "%d cases" % len(elems))
check("ALL indisponible", 'Label Macro 102 "ALL indisponible"' in cmds, "en-tete ALL non relabellee")
check("ALL indisponible", macs[mt.M_FC0][0] == 'Set Sequence 113 Thru 148 Cue 1 Property "CueInFade" 0', macs[mt.M_FC0][:1])

# 5) pas de selectiondata -> membres lus par la selection (lecture seule, ClearAll)
lua, cmds, macs, elems, seqs = run("nosel", RECORDING_BOX + "SELDATA_OK = false\n")
check("repli selection", headline(lua) == OK and "Groupes enumeres : 3/3" in final_of(lua), final_of(lua)[:300])
i = [k for k, c in enumerate(cmds) if c == "Group 1"]
check("repli selection", len(i) == 1 and cmds[i[0] + 1] == "ClearAll", "Group 1 doit etre suivi d'un ClearAll")
check("repli selection", "lecture des groupes par la selection" in recap_of(lua)[0], "repli non annonce au recap")
# ... et sans aucune API : prudence (toutes les boucles coupees), MODE DEGRADE
lua, cmds, macs, elems, seqs = run("nosel2", RECORDING_BOX + "SELDATA_OK = false\n_G.SelectionFirst = nil\n")
check("sans API", headline(lua).startswith(DEGRADED) and "Groupes enumeres : 0/3" in final_of(lua)
      and "chaque couleur coupe TOUTES les boucles FX" in final_of(lua), final_of(lua)[:400])
check("sans API", seqs[mt.seq_c(2, 1)]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d Fade 1" % (mt.SEQ_FX0, mt.SEQ_LAST),
      "sans membres, une couleur doit couper tout le bloc FX")
check("sans API", seqs[mt.seq_fx(1, 1)]["cues"][1]["props"]["Command"] == "Off Sequence 150 Thru 163 Fade 1",
      "sans membres, une tuile FX coupe tout sauf elle")

# 6) Set par plage refuse -> rangees detaillees, MODE DEGRADE (rangees longues), aucun refus compte
lua, cmds, macs, elems, seqs = run("noranged", RECORDING_BOX + "RANGED_SET_OK = false\n")
lc = macs[mt.M_FC0]
check("sans plage", len([l for l in lc if 'Property "CueInFade"' in l]) == 48 and len(lc) == 48 + 48 + 1 + 6, "%d lignes" % len(lc))
check("sans plage", not any(re.match(r"^Set Sequence \d+ Thru \d+ Cue", l) for l in lc), "une ligne par plage a survecu")
check("sans plage", headline(lua).startswith(DEGRADED) and "Set par plage : couleurs non" in final_of(lua)
      and "Rangees de reglage longues" in final_of(lua) and "FADE couleur 103 lignes" in final_of(lua), final_of(lua)[:500])
check("sans plage", "Commandes refusees : 0" in final_of(lua), "la probe par plage ne doit pas compter comme refus")

# 7) CMD de cue inerte -> NON, MODE DEGRADE
lua, cmds, macs, elems, seqs = run("nocmd", RECORDING_BOX + "CMD_EXEC_OK = false\n")
check("CMD inerte", headline(lua).startswith(DEGRADED) and "CMD de cue : NON" in final_of(lua), final_of(lua)[:400])
check("CMD inerte", mt.SEQ_PROBE not in seqs, "sequence de test non supprimee")
# ... canal variable indisponible -> non verifiable, controles partiels
lua, cmds, macs, elems, seqs = run("novar", RECORDING_BOX + "_G.GetVar = function() return nil end\n")
check("CMD non verifiable", headline(lua).startswith(PARTIAL) and "CMD de cue : non verifiable (canal variable" in final_of(lua), final_of(lua)[:400])

# 8) relecture : la console stocke "Go" quoi qu'on ecrive -> refus comptes, 1er cite
lua, cmds, macs, elems, seqs = run("trigbroken", RECORDING_BOX + "STORE_TRIG_AS_GO = true\n")
final = final_of(lua)
check("relecture", headline(lua).startswith(REFUSED) and "Boucles en Follow : 0/30" in final, final[:400])
check("relecture", '1ere : Set Sequence 149 Cue 1 Property "TrigType" "Follow" : ecrit Follow, lu Go' in final, final[:600])
check("relecture", "Colonnes de cue apres Cook : PERDUES" in final, final[:600])
check("relecture", len(elems) == 121, "le board doit quand meme etre pose (%d cases)" % len(elems))
# ... propriete inconnue de la console (commande refusee, handle silencieux) -> non verifiable
lua, cmds, macs, elems, seqs = run("unknownprop", RECORDING_BOX + "LINE_PROPS.XWings = nil\n")
final = final_of(lua)
check("propriete inconnue", headline(lua).startswith(PARTIAL) and "Proprietes non verifiables : 12" in final, final[:500])
check("propriete inconnue", "Commandes refusees : 0" in final, final[:500])
# ... refus d'affichage -> MODE DEGRADE avec la ligne Affichage
lua, cmds, macs, elems, seqs = run("refuse2", RECORDING_BOX + '''REFUSE['^Assign Appearance %d+ At Sequence'] = "Illegal object"\n''')
final = final_of(lua)
check("affichage", headline(lua).startswith(DEGRADED) and "Affichage : PreferCueAppearance 63/63, apparences de cue 0/78, de sequence 0/63" in final, final[:500])
lua, cmds, macs, elems, seqs = run("noprefer", RECORDING_BOX + "SEQ_PROPS.PreferCueAppearance = nil\n")
check("affichage", headline(lua).startswith(DEGRADED) and "PreferCueAppearance 0/63" in final_of(lua), final_of(lua)[:500])

# 9) WrapAround 1 refuse par la commande -> pose par le handle, aucun refus compte, bilan propre
lua, cmds, macs, elems, seqs = run("wrap1", RECORDING_BOX + '''REFUSE['Property "WrapAround" 1$'] = "Illegal value"\n''')
check("WrapAround", all(s["props"].get("WrapAround") in ("Yes", "1") for s in seqs.values()), "WrapAround non pose")
check("WrapAround", headline(lua) == OK, final_of(lua)[:300])

# 10) build muet (Cmd() ne renvoie rien) -> controles partiels, board complet
lua, cmds, macs, elems, seqs = run("mute", RECORDING_BOX + "CMD_RETURNS_NIL = true\n")
check("build muet", headline(lua).startswith(PARTIAL) and re.search(r"Commandes sans retour : [1-9]\d*", final_of(lua)), final_of(lua)[:400])
check("build muet", len(elems) == 121, "%d cases" % len(elems))

# 11) "Off ... Fade" refuse -> Off nus partout, MODE DEGRADE
lua, cmds, macs, elems, seqs = run("nooffade", RECORDING_BOX + "OFF_FADE_OK = false\n")
final = final_of(lua)
check("Off sans fade", headline(lua).startswith(DEGRADED) and "Off ... Fade : REFUSE" in final and "SANS fondu" in final, final[:500])
check("Off sans fade", macs[mt.M_OFFALL] == ["Off Sequence 101 Thru 163"], macs.get(mt.M_OFFALL))
check("Off sans fade", seqs[113]["cues"][1]["props"]["Command"] == "Off Sequence 149 Thru 153 + 159 Thru 163", seqs[113]["cues"][1]["props"].get("Command"))
check("Off sans fade", not any(" Fade " in l for l in macs[mt.M_FC0]) and len(macs[mt.M_FC0]) == 1 + 1 + 6, macs[mt.M_FC0])
check("Off sans fade", "Commandes refusees : 0" in final, final[:400])

# 12) Cook par plage refuse -> 15 cuissons par appui ; Set FX par plage refuse -> 30 lignes, rangee longue
lua, cmds, macs, elems, seqs = run("norangecook", RECORDING_BOX + "RANGE_COOK_OK = false\n")
fxv = macs[mt.M_FXV0]
check("sans Cook par plage", len(fxv) == 2 + 15 + 1 + 5 and sum(1 for l in fxv if l.startswith("Cook Sequence") and l.endswith("/MergeLowPriority")) == 15, "%d lignes" % len(fxv))
check("sans Cook par plage", headline(lua) == OK and "Set par plage : couleurs oui, FX oui, Cook non" in final_of(lua), final_of(lua)[:400])
lua, cmds, macs, elems, seqs = run("norangefx", RECORDING_BOX + "RANGED_FX_OK = false\n")
fxv = macs[mt.M_FXV0]
check("sans Set FX par plage", len(fxv) == 30 + 1 + 1 + 5, "%d lignes" % len(fxv))
check("sans Set FX par plage", headline(lua).startswith(DEGRADED) and "FX VITESSE 37 lignes" in final_of(lua), final_of(lua)[:500])

# 13) la copie dans le slot casse la reference -> pastilles par Assign Preset, MODE DEGRADE
lua, cmds, macs, elems, seqs = run("copybreaks", RECORDING_BOX + "COPY_KEEPS_REF = false\n")
final = final_of(lua)
check("C1/C2 Assign", headline(lua).startswith(DEGRADED) and "C1/C2 : Assign Preset" in final, final[:500])
c1 = macs[mt.M_C1_0]
check("C1/C2 Assign", c1[0] == "Assign Preset 4.101 At Sequence 149 Cue 1 Part 0.1" and len(c1) == 15 + 1 + 12
      and not any(l.startswith("Copy Preset") for l in c1), c1[:3])
check("C1/C2 Assign", macs[mt.M_C2_0][0] == "Assign Preset 4.101 At Sequence 149 Cue 2 Part 0.1", macs[mt.M_C2_0][:1])

# 14) panne en pleine generation -> programmer vide, message d'echec, pas de board
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

# 15) presets d'une AUTRE palette : seuls les labels faux sont re-stockes
OLD = {101: "Red", 102: "Orange", 103: "Yellow", 104: "Green", 105: "Cyan", 106: "Blue",
       107: "Violet", 108: "Magenta", 109: "Pink", 110: "White", 111: "Amber", 112: "Azure"}
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in OLD.items()) + " }"
lua, cmds, macs, elems, seqs = run("stale", RECORDING_BOX, presets=pl)
stored = sorted(int(m.group(1)) for c in cmds for m in [re.match(r"^Store Preset 4\.(\d+) ", c)] if m)
want = sorted(no for no, nm in OLD.items() if nm != mt.COLOR_NAMES[no - 101])
check("palette perimee", stored == want, "re-stockes %s != %s" % (stored, want))
check("palette perimee", any("autre palette" in m for m in recap_of(lua)), "le recapitulatif ne signale pas la palette")

# 16) palette a jour : ZERO programmer (hors ClearAll), tout reutilise
cur = "{ " + ", ".join("[%d] = '%s'" % (101 + i, n) for i, n in enumerate(mt.COLOR_NAMES)) + " }"
lua, cmds, macs, elems, seqs = run("current", RECORDING_BOX, presets=cur)
check("palette a jour", not any(re.match(r"^(Fixture|Group|Attribute|At |Store Preset)", c) for c in cmds), "le programmer a servi")
check("palette a jour", "12 reutilises" in recap_of(lua)[0] and "12 reutilises" in final_of(lua), "bilan presets")
check("palette a jour", "Programmer : un ClearAll au depart." in recap_of(lua)[0], recap_of(lua)[0])
check("palette a jour", headline(lua) == OK, final_of(lua)[:300])

# 17) labels illisibles : on ne touche a rien (prudence)
lua, cmds, macs, elems, seqs = run("noname", presets=cur, labels_readable=False)
check("labels illisibles", not any(c.startswith("Store Preset") for c in cmds), "presets reecrits sans pouvoir lire leur nom")

# 18) annulation a chaque ecran : AUCUNE commande
for step in ("v%d", "1/3", "2/3", "3/3", "Recapitulatif"):
    lua, cmds, macs, elems, seqs = run("cancel_" + step.replace("/", "").replace("%", ""), RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("%s") then return 0 end
    return 1
end''' % step)
    check("annulation %s" % step, len(cmds) == 0, "%d commandes envoyees" % len(cmds))

# 19) Options personnalisees : tout suit
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
check("options", headline(lua) == OK, final_of(lua)[:300])

# 20) "Reglages par defaut" saute les trois ecrans et construit pareil
lua, cmds, macs, elems, seqs = run("defaults", RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if (t.title or ""):match("v%d") and not (t.message or ""):match("Board construit") then return 2 end
    return 1
end''')
titles = [t for t, _ in boxes(lua)]
check("reglages par defaut", not any("1/3" in t or "2/3" in t or "3/3" in t for t in titles), "ecrans montres : %s" % titles)
check("reglages par defaut", len(elems) == 121 and 101 in seqs, "board different du nominal")

# 21) "Modifier" au recapitulatif : ecrans pre-remplis, nouvelles valeurs prises
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

# 22) le recapitulatif dit la verite
lua, cmds, macs, elems, seqs = run("recap", RECORDING_BOX)
recap = recap_of(lua)[0]
for frag in ("LIGNES (4) : ALL, SPOT, WASH, GENERAL", "COULEURS : 12   FX : 15 vagues", "ALL : une ligne de recipe par groupe du board",
             "Fade couleur 1s - Fade arret 2s", "Vitesse FX 2s - Fondu FX 1s", "Sequences 101-163   Macros 101-155",
             "Appearances 101-154", "Images 3.101-3.126", "Presets 4.101-4.112", "slots FX 4.113 et 4.114",
             "Plages reservees : Seq 101-316, Macro 101-156, App 101-154, Img 3.101-3.128",
             "Programmer : un ClearAll au depart, 12 preset(s) a stocker (puis ClearAll).", "Plages libres"):
    check("recapitulatif", frag in recap, "manque '%s' dans : %s" % (frag, recap))
check("recapitulatif", "ATTENTION" not in recap and "Vagues pulsees" not in recap, recap)

# 23) plages OCCUPEES : avertissement, objets a toi nommes, Off avec fondu, nettoyage, board identique
lua, cmds, macs, elems, seqs = run("occupied", RECORDING_BOX + "__macStored[150] = true\n__macNames[150] = 'Blinder'\n")
recap = recap_of(lua)[0]
check("plages occupees", "ATTENTION" in recap and "Sequence 101-%d, Macro 101-%d" % (mt.SEQ_DEL, mt.MAC_DEL) in recap, recap)
check("plages occupees", 'Objets A TOI qui seraient supprimes : Macro 150 "Blinder"' in recap, recap)
check("plages occupees", "executors" in recap, "note executors absente")
errs = mt.check(cmds, macs, elems, seqs, cleanup=True)
check("plages occupees", not errs, "; ".join(errs[:5]))
check("plages occupees", len(recap_of(lua)) == 1 and headline(lua) == OK, "plus d'une confirmation / bilan : %s" % headline(lua))
# nos propres objets ne sont pas listes comme "a toi"
lua, cmds, macs, elems, seqs = run("occupied_ours", RECORDING_BOX + "__macStored[101] = true\n__macNames[101] = 'Off All'\n")
check("plages occupees (a nous)", "ATTENTION" in recap_of(lua)[0] and "Objets A TOI" not in recap_of(lua)[0], recap_of(lua)[0])
# board v8 detecte (une macro-tuile au-dela de +55) -> nettoyage large des macros
lua, cmds, macs, elems, seqs = run("v8board", RECORDING_BOX + "__macStored[157] = true\n")
errs = mt.check_cleanup(cmds, mac_del=mt.MAC_DEL_V8)
check("board v8", not errs and "Macro 101-%d" % mt.MAC_DEL_V8 in recap_of(lua)[0], "; ".join(errs[:3]))
# bord de plage : une sequence a nous sur le dernier numero reserve -> occupee ; juste apres -> libre
lua, cmds, macs, elems, seqs = run("occ_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n" % mt.SEQ_DEL)
check("plages occupees (bord)", "ATTENTION" in recap_of(lua)[0], "sequence %d non detectee" % mt.SEQ_DEL)
lua, cmds, macs, elems, seqs = run("free_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n__macStored[%d] = true\n" % (mt.SEQ_DEL + 1, mt.MAC_DEL + 2))
check("plages libres (bord)", "Plages libres" in recap_of(lua)[0] and not any(c.startswith("Delete Macro") for c in cmds), "hors plage")
# un objet survit au nettoyage -> rien n'est construit
lua, cmds, macs, elems, seqs = run("leftover", RECORDING_BOX + "Cmd('Store Sequence 112 Cue 1 /Overwrite /NoConfirmation')\nDELETE_LEAVES[112] = true\n")
check("nettoyage incomplet", any("Impossible de nettoyer : Sequence 112" in m for _, m in boxes(lua)), "pas de message d'arret")
check("nettoyage incomplet", not any(c.startswith("Store Macro") or c == "Store Sequence 101 Cue 1 /Overwrite /NoConfirmation" for c in cmds), "construction lancee malgre le reste")

# 24) un preset A NOUS sur un slot FX : avertissement, puis le slot est pris
mine = dict((101 + i, n) for i, n in enumerate(mt.COLOR_NAMES))
mine[mt.P_FX1] = "MonPreset"
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in mine.items()) + " }"
lua, cmds, macs, elems, seqs = run("foreign", RECORDING_BOX, presets=pl)
check("slot FX occupe", "ATTENTION" in recap_of(lua)[0] and "4.%d (MonPreset)" % mt.P_FX1 in recap_of(lua)[0], recap_of(lua)[0])
check("slot FX occupe", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds, "slot non re-seede")
check("slot FX occupe", not any(c.startswith("Delete Preset") for c in cmds), "un preset a ete supprime")

# 25) pas de groupe : message clair, zero commande ; groupes tous vides : idem
lua, cmds, macs, elems, seqs = run("nogroups", RECORDING_BOX + NO_GROUPS)
check("sans groupe", len(cmds) == 0 and any("Aucun groupe" in m and "Cree Group SPOT" in m for _, m in boxes(lua)), "%d commandes" % len(cmds))
lua, cmds, macs, elems, seqs = run("allempty", RECORDING_BOX + "GROUPS[1] = {}; GROUPS[2] = {}; GROUPS[3] = {}\n")
check("groupes vides", len(cmds) == 0 and any("Tous les groupes du board sont vides" in m for _, m in boxes(lua)), "%d commandes" % len(cmds))

# 26) un groupe VIDE sur le board : ligne retiree et annoncee, le reste identique
lua, cmds, macs, elems, seqs = run("emptygroup", RECORDING_BOX + "GROUPS[4] = {}; GROUP_NAMES[4] = 'SPARE'\n")
recap = recap_of(lua)[0]
check("groupe vide", 'Lignes ignorees (groupe vide) : Group 4 "SPARE"' in recap and "LIGNES (4) : ALL, SPOT, WASH, GENERAL" in recap, recap)
check("groupe vide", len(elems) == 121 and headline(lua) == OK, "%d cases, %s" % (len(elems), headline(lua)))

# 27) groupe ALL donne : la ligne ALL est une recipe simple, jamais de Part 0.2
lua, cmds, macs, elems, seqs = run("allgroup", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupe ALL (optionnel)"] = "3" end
    return 1
end''')
recap = recap_of(lua)[0]
check("groupe ALL", 'ALL : Group 3 "GENERAL" (recipe simple)' in recap, recap)
check("groupe ALL", all(len(seqs[mt.seq_c(1, ci)]["cues"][1]["lines"]) == 1 and seqs[mt.seq_c(1, ci)]["cues"][1]["lines"][0]["sel"] == 3 for ci in range(1, 13)), "lignes ALL")
check("groupe ALL", not any("Part 0.2" in c for c in cmds), "une 2e ligne a ete tentee")
check("groupe ALL", "Lignes de recipe : 78/78" in final_of(lua) and headline(lua) == OK, final_of(lua)[:300])

# 28) liste invalide / partielle (un seul groupe = pas de ligne ALL)
lua, cmds, macs, elems, seqs = run("badlist", RECORDING_BOX + '''
local asked = 0
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") and t.inputs then
        asked = asked + 1
        if asked == 1 then inputs["Groupes du board"] = "99 + abc"; inputs["Groupe ALL (optionnel)"] = "77" end
    end
    return 1
end''')
msgs = [m for _, m in boxes(lua)]
check("liste invalide", any("Aucun numero valide dans : 99 + abc" in m and "Inconnus : abc, 99, ALL=77" in m for m in msgs), "pas de message d'erreur")
check("liste invalide", len(elems) == 121, "board incomplet apres la relance (%d cases)" % len(elems))
lua, cmds, macs, elems, seqs = run("partlist", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1, 99" end
    return 1
end''')
recap = recap_of(lua)[0]
check("liste partielle", "LIGNES (1) : SPOT" in recap and "Ignores (inexistants) : 99" in recap and "pas de ligne ALL (un seul groupe)" in recap, recap)
check("liste partielle", seqs[101]["name"] == "SPOT Red" and seqs[101]["cues"][1]["props"]["Command"] == "Off Sequence 113 Thru 117 Fade 1",
      seqs[101]["cues"][1]["props"].get("Command"))
check("liste partielle", len(elems) == 1 + 13 + 5 + 1 + 14 + 26 + 12 and headline(lua) == OK, "%d cases" % len(elems))

# 29) petits groupes (1 et 2 machines) : vagues PULSEES (DelayFromX = battement), FX VITESSE les suit
lua, cmds, macs, elems, seqs = run("small", RECORDING_BOX + '''
GROUPS[4] = { 7 }
GROUPS[5] = { 7, 8 }
GROUP_NAMES[4] = "SOLO"
GROUP_NAMES[5] = "PAIR"
''')
T5 = 6
check("petits groupes", len(elems) == 1 + T5 * 13 + 5 * 5 + 1 + 14 + 26 + 12, "%d cases" % len(elems))
fx0 = 101 + T5 * 12
solo, pair = fx0 + 3 * 5, fx0 + 4 * 5
for di in range(5):
    for k in (1, 2):
        check("petits groupes", seqs[solo + di]["cues"][k]["lines"][0]["props"]["DelayFromX"] == "2", "SOLO %d non pulsee" % (solo + di))
        want = "2" if di in (2, 3) else "0"
        check("petits groupes", seqs[pair + di]["cues"][k]["lines"][0]["props"]["DelayFromX"] == want, "PAIR %d : DelayFromX" % (pair + di))
        check("petits groupes", seqs[fx0 + di]["cues"][k]["lines"][0]["props"]["DelayFromX"] == "0", "SPOT %d pulsee a tort" % (fx0 + di))
fxv = macs[101 + 44]
pulsed_expr = " + ".join(str(n) for n in [solo + d for d in range(5)] + [pair + 2, pair + 3])
check("petits groupes", [l for l in fxv if 'Property "DelayFromX"' in l] ==
      ['Set Sequence %s Cue %d Part 0.1 Property "DelayFromX" 0.5' % (pulsed_expr, k) for k in (1, 2)] and len(fxv) == 11,
      "FX VITESSE : %s" % fxv[:4])
check("petits groupes", "Vagues pulsees (groupe de 1-2 machines, rien a etaler) : FX SOLO J>C" in recap_of(lua)[0], recap_of(lua)[0])
check("petits groupes", headline(lua) == OK and "Vagues pulsees : FX SOLO J>C" in final_of(lua), final_of(lua)[:400])
# SOLO (7) chevauche PAIR (7, 8) mais pas SPOT/WASH/GENERAL
check("petits groupes", seqs[solo]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d + %d Thru %d Fade 1" % (solo + 1, solo + 4, pair, pair + 4),
      seqs[solo]["cues"][1]["props"].get("Command"))

# 30) 12 groupes : les rangees de reglage ne grossissent pas avec le nombre de boucles
lua, cmds, macs, elems, seqs = run("many", RECORDING_BOX + '''
for g = 4, 14 do GROUPS[g] = { 7, 8 }; GROUP_NAMES[g] = "G" .. g end
''')
recap = recap_of(lua)[0]
check("12 groupes max", "LIGNES (13)" in recap and "limitees a 12" in recap, recap.splitlines()[0])
longest = max((len(l), no) for no, l in macs.items())
check("12 groupes max", longest[0] <= 25, "macro %d : %d lignes" % (longest[1], longest[0]))
check("12 groupes max", "Macros live : FADE couleur 21 lignes, FX VITESSE" in final_of(lua), final_of(lua)[:500])

# 31) Re-cuisiner (bouton de l'assistant) : recuit un board existant, rien d'autre
lua, cmds, macs, elems, seqs = run("recook", RECORDING_BOX + '''
for i = 101, 103 do Cmd("Store Sequence " .. i .. " Cue 1 /Overwrite /NoConfirmation") end
BOX_ANSWER = function(t)
    if (t.title or ""):match("v%d") then return 3 end
    return 1
end''')
cooks = [c for c in cmds if c.startswith("Cook Sequence")]
check("re-cuisiner", cooks == ["Cook Sequence %d /Overwrite" % i for i in (101, 102, 103)], cooks)
check("re-cuisiner", any("3 sequence(s) recuisinee(s)" in m for _, m in boxes(lua)), "pas de bilan")
check("re-cuisiner", not any(c.startswith("Store ") or c.startswith("Delete ") for c in cmds[3:]), "autre chose que des Cook")

# 32) la generation ne laisse jamais le programmer charge
lua, cmds, macs, elems, seqs = run("clean")
sel = [i for i, c in enumerate(cmds) if re.match(r"^(Fixture|Group|Attribute) ", c)]
check("programmer propre", not sel or "ClearAll" in cmds[max(sel):max(sel) + 4], "pas de ClearAll apres le dernier usage du programmer")

print("\n".join(fails) if fails else "TOUS LES SCENARIOS OK")
sys.exit(1 if fails else 0)
