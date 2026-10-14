#!/usr/bin/env python3
"""Tous les profils de console / de rig, d'un coup (v9.2, recipes + tuiles neon).

Chaque scenario instancie une console factice (voir mock_test.py), la
deforme un peu (Store Group refuse ou faux, pas de selectiondata, Set ou
Cook par plage refuses, "Off ... Fade" refuse, CMD de cue inerte,
substitution "$var" absente, propriete inconnue ou mal stockee, build
muet, groupe vide, copie qui casse les references, nettoyage qui laisse
un objet, panne, palettes, annulations, listes fausses...) et verifie que
le plugin reagit comme prevu : repli propre, ou refus COMPTE et affiche
au bilan avec le bon TITRE — jamais un board qui "fait n'importe quoi"
en silence. Les boutons du board sont aussi PRESSES (Go+ Macro) pour
verifier que leurs lignes passent sur la console factice.

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


def run(name, patch="", presets="{}", labels_readable=True, runs=1):
    d = os.path.join(mt.HERE, "_img_" + name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    lua, main = mt.make_runtime(d, presets=presets, labels_readable=labels_readable)
    if patch:
        lua.execute(patch)
    for _ in range(runs):
        main(None)
    cmds, macs, elems, seqs, vars_ = mt.snapshot(lua)
    return lua, cmds, macs, elems, seqs, vars_


# MessageBox qui ENREGISTRE ce qu'il affiche (et les champs pre-remplis),
# et repond selon le titre. __welcome(t) = l'ecran d'accueil (un seul).
RECORDING_BOX = r'''
_G.__boxes = {}
_G.__welcome = function(t)
    local title = t.title or ""
    return title:match("v%d") ~= nil and not title:match("Bilan") and (t.message or ""):match("^Rig : ") ~= nil
end
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

# "Regler" a l'accueil, "Suivant"/"Construire" partout ailleurs (REGLER_HOOK affine).
REGLER = RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if __welcome(t) then return 2 end
    if REGLER_HOOK then return REGLER_HOOK(t, inputs) or 1 end
    return 1
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


def plans_of(lua):
    """Les textes du plan : ecran d'accueil (commence par 'Rig : ') et recapitulatifs."""
    return [m for t, m in boxes(lua) if "ECRIT DANS LE SHOW" in m]


def final_of(lua):
    f = [m for t, m in boxes(lua) if "Board construit" in m]
    return f[0] if f else ""


def refused(cmds):
    return [c for c in cmds if "  ## " in c]


def headline(lua):
    f = final_of(lua)
    return f.splitlines()[0] if f else ""


def press(lua, macro):
    """Appuie sur un bouton du board et renvoie les lignes executees (ligne, reponse)."""
    before = len(mt.mac_runs(lua))
    lua.execute('Cmd("Go+ Macro %d")' % macro)
    return [(l, r) for _, l, r in mt.mac_runs(lua)[before:]]


# 1) rig imbrique de reference : toute la batterie de mock_test
cmds, macs, elems, seqs, vars_ = mt.run_default()
errs = mt.check(cmds, macs, elems, seqs, vars_)
check("rig de reference", not errs, "; ".join(errs[:5]))

# 2) bilan nominal : tous les controles passent
lua, cmds, macs, elems, seqs, vars_ = run("final", RECORDING_BOX)
final = final_of(lua)
for frag in (OK, "Commandes refusees : 0", "Commandes sans retour : 0", "Habillage refuse : 0",
             "Proprietes non verifiables : 0", "Lignes de recipe : 78/78", "Cues cuisinees : 78/78",
             "Boucles en Follow : 30/30", "Groupes enumeres : 3/3", "CMD de cue : OK", "Off ... Fade : accepte",
             "Substitution $var : OK", "Variables : 8/8",
             "Colonnes de cue apres Cook : conservees", "C1/C2 : Copy + Recast",
             "ALL : groupe CP ALL (Group 101, 6 machines)",
             "Set par plage : couleurs oui, FX oui, Cook oui",
             "Macros live : tuiles 1 ligne, FADE 5 lignes, C1/C2 8, FX VITESSE 7, FX FONDU 6",
             "Layout 1 : 184/184", "Images 3.101-3.127 : 27/27", "12 crees",
             "Sequences 101-163 - Macros 101-155 (tuiles 157-219)"):
    check("bilan", frag in final, "manque '%s' dans : %s" % (frag, final[:900]))
check("bilan", vars_.get("cp_cmd") == "7", "la probe CMD / substitution n'a pas lu la variable")
errs = mt.check(cmds, macs, elems, seqs, vars_, groups=mt.groups_of(lua))
check("bilan", not errs, "; ".join(errs[:5]))
# un seul ecran avant la construction, puis le bilan
titles = [t for t, _ in boxes(lua)]
check("un seul ecran", len(titles) == 2 and titles[0].startswith("Color Picker LIVE  v9.2") and "Bilan" in titles[1], titles)

# 3) le groupe union : Store Group refuse -> pas de demi-ALL, ligne retiree, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("unionrefused", RECORDING_BOX + '''REFUSE['^Store Group'] = "Illegal command"\n''')
final = final_of(lua)
check("ALL indisponible", headline(lua).startswith(DEGRADED) and "ALL indisponible : Store Group 101 refuse" in final
      and "ALL : INDISPONIBLE" in final, final[:600])
check("ALL indisponible", "Commandes refusees : 0" in final and "Lignes de recipe : 66/66" in final, final[:500])
check("ALL indisponible", not any(101 <= no <= 112 for no in seqs), "des sequences ALL ont survecu : %s" % sorted(no for no in seqs if no <= 112))
check("ALL indisponible", len(elems) == 184 - 24 and not any(getattr(e, "__object", "") == "Sequence 101" for e in elems), "%d cases" % len(elems))
check("ALL indisponible", 'Label Macro 102 "ALL indisponible"' in cmds, "en-tete ALL non relabellee")
check("ALL indisponible", macs[mt.M_FC0][0] == 'Set Sequence 113 Thru 148 Cue 1 Property "CueInFade" 0', macs[mt.M_FC0][:1])
check("ALL indisponible", not any(mt.M_TILE0 <= no < mt.mac_tile(113) for no in macs), "des tuiles ALL ont ete posees")
# ... le groupe stocke est FAUX (membres relus != union) -> refus compte, pas de ligne ALL
lua, cmds, macs, elems, seqs, vars_ = run("unionwrong", RECORDING_BOX + '''
local prev = _G.Cmd
_G.Cmd = function(s)
    local r = prev(s)
    if s:match("^Store Group 101 ") then GROUPS[101] = { 1 } end
    return r
end''')
final = final_of(lua)
check("groupe union faux", headline(lua).startswith(REFUSED) and "1ere : Group 101 CP ALL : 1 machine(s) lue(s), 6 attendue(s)" in final, final[:600])
check("groupe union faux", not any(101 <= no <= 112 for no in seqs) and "ALL : INDISPONIBLE" in final, final[:600])

# 4) pas de selectiondata -> membres lus par la selection (lecture seule, ClearAll), union verifiee pareil
lua, cmds, macs, elems, seqs, vars_ = run("nosel", RECORDING_BOX + "SELDATA_OK = false\n")
check("repli selection", headline(lua) == OK and "Groupes enumeres : 3/3" in final_of(lua)
      and "ALL : groupe CP ALL (Group 101, 6 machines)" in final_of(lua), final_of(lua)[:400])
i = [k for k, c in enumerate(cmds) if c == "Group 1"]
check("repli selection", len(i) == 1 and cmds[i[0] + 1] == "ClearAll", "Group 1 doit etre suivi d'un ClearAll")
check("repli selection", "lecture des groupes par la selection" in plans_of(lua)[0], "repli non annonce a l'accueil")
# ... et sans aucune API : prudence (toutes les boucles coupees), MODE DEGRADE, union non verifiable
lua, cmds, macs, elems, seqs, vars_ = run("nosel2", RECORDING_BOX + "SELDATA_OK = false\n_G.SelectionFirst = nil\n")
final = final_of(lua)
check("sans API", headline(lua).startswith(DEGRADED) and "Groupes enumeres : 0/3" in final
      and "chaque couleur coupe TOUTES les boucles FX" in final and "membres non verifiables" in final, final[:500])
check("sans API", seqs[mt.seq_c(2, 1)]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d Fade 1" % (mt.SEQ_FX0, mt.SEQ_LAST),
      "sans membres, une couleur doit couper tout le bloc FX")
check("sans API", seqs[mt.seq_fx(1, 1)]["cues"][1]["props"]["Command"] == "Off Sequence 150 Thru 163 Fade 1",
      "sans membres, une tuile FX coupe tout sauf elle")
check("sans API", all(seqs[mt.seq_c(1, ci)]["cues"][1]["lines"][0]["sel"] == 101 for ci in range(1, 13)), "la ligne ALL doit rester (groupe stocke)")

# 5) Set par plage refuse -> rangee FADE detaillee, MODE DEGRADE (rangee longue), aucun refus compte
lua, cmds, macs, elems, seqs, vars_ = run("noranged", RECORDING_BOX + "RANGED_SET_OK = false\n")
lc = macs[mt.M_FC0]
check("sans plage", len([l for l in lc if 'Property "CueInFade"' in l]) == 48 and len(lc) == 48 + 1 + 3, "%d lignes" % len(lc))
check("sans plage", not any(re.match(r"^Set Sequence \d+ Thru \d+ Cue", l) for l in lc), "une ligne par plage a survecu")
check("sans plage", headline(lua).startswith(DEGRADED) and "Set par plage : couleurs non" in final_of(lua)
      and "Rangees de reglage longues" in final_of(lua) and "FADE 52 lignes" in final_of(lua), final_of(lua)[:600])
check("sans plage", "Commandes refusees : 0" in final_of(lua), "la probe par plage ne doit pas compter comme refus")
check("sans plage", macs[mt.M_FO0] == mt.fade_o_lines(0, "0"), "FADE arret ne depend pas de la plage : %s" % macs[mt.M_FO0])

# 6) CMD de cue inerte -> NON, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("nocmd", RECORDING_BOX + "CMD_EXEC_OK = false\n")
check("CMD inerte", headline(lua).startswith(DEGRADED) and "CMD de cue : NON" in final_of(lua), final_of(lua)[:400])
check("CMD inerte", mt.SEQ_PROBE not in seqs and mt.MAC_PROBE not in macs, "objets de test non supprimes")
# ... canal variable indisponible -> CMD non verifiable, surbrillance en lignes explicites, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("novar", RECORDING_BOX + "_G.GetVar = function() return nil end\n")
final = final_of(lua)
check("canal variable", headline(lua).startswith(DEGRADED) and "CMD de cue : non verifiable (canal variable" in final
      and "Substitution $var : non verifiable (canal variable)" in final and "Variables : sans (lignes explicites)" in final, final[:700])
check("canal variable", len(macs[mt.M_FC0]) == 1 + 1 + 6 and not any("$" in l for ls in macs.values() for l in ls), "lignes explicites attendues : %s" % macs[mt.M_FC0])
# ... "$var" non substitue dans les macros -> NON, lignes explicites, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("nosub", RECORDING_BOX + "MACRO_SUB_OK = false\n")
final = final_of(lua)
check("sans substitution", headline(lua).startswith(DEGRADED) and "Substitution $var : NON" in final
      and "surbrillance des rangees en lignes" in final and "FADE 8 lignes, C1/C2 16, FX VITESSE 9, FX FONDU 8" in final, final[:700])
check("sans substitution", not any("$" in l for ls in macs.values() for l in ls), "une ligne avec $ a survecu")
check("sans substitution", macs[mt.M_FC0][2:] == ["Assign Appearance %d At Macro %d" % (mt.APP_ACC if vj == 0 else mt.APP_GREY, mt.M_FC0 + vj) for vj in range(6)], macs[mt.M_FC0])
check("sans substitution", macs[mt.M_C1_0 + 1][4:] == ["Assign Appearance %d At Macro %d" % (mt.app_on(cj) if cj == 2 else mt.app_off(cj), mt.M_C1_0 + cj - 1) for cj in range(1, 13)], macs[mt.M_C1_0 + 1][4:])
check("sans substitution", "Commandes refusees : 0" in final, final[:400])

# 7) relecture : la console stocke "Go" quoi qu'on ecrive -> refus comptes, 1er cite
lua, cmds, macs, elems, seqs, vars_ = run("trigbroken", RECORDING_BOX + "STORE_TRIG_AS_GO = true\n")
final = final_of(lua)
check("relecture", headline(lua).startswith(REFUSED) and "Boucles en Follow : 0/30" in final, final[:400])
check("relecture", '1ere : Set Sequence 149 Cue 1 Property "TrigType" "Follow" : ecrit Follow, lu Go' in final, final[:600])
check("relecture", "Colonnes de cue apres Cook : PERDUES" in final, final[:600])
check("relecture", len(elems) == 184, "le board doit quand meme etre pose (%d cases)" % len(elems))
# ... propriete inconnue de la console (commande refusee, handle silencieux) -> non verifiable
lua, cmds, macs, elems, seqs, vars_ = run("unknownprop", RECORDING_BOX + "LINE_PROPS.XWings = nil\n")
final = final_of(lua)
check("propriete inconnue", headline(lua).startswith(PARTIAL) and "Proprietes non verifiables : 12" in final, final[:500])
check("propriete inconnue", "Commandes refusees : 0" in final, final[:500])
# ... refus d'affichage -> MODE DEGRADE avec la ligne Affichage
lua, cmds, macs, elems, seqs, vars_ = run("refuse2", RECORDING_BOX + '''REFUSE['^Assign Appearance %d+ At Sequence'] = "Illegal object"\n''')
final = final_of(lua)
check("affichage", headline(lua).startswith(DEGRADED) and "Affichage : PreferCueAppearance 63/63, apparences de cue 0/78, de sequence 0/63" in final, final[:500])
lua, cmds, macs, elems, seqs, vars_ = run("noprefer", RECORDING_BOX + "SEQ_PROPS.PreferCueAppearance = nil\n")
check("affichage", headline(lua).startswith(DEGRADED) and "PreferCueAppearance 0/63" in final_of(lua), final_of(lua)[:500])

# 8) WrapAround 1 refuse par la commande -> pose par le handle, aucun refus compte, bilan propre
lua, cmds, macs, elems, seqs, vars_ = run("wrap1", RECORDING_BOX + '''REFUSE['Property "WrapAround" 1$'] = "Illegal value"\n''')
check("WrapAround", all(s["props"].get("WrapAround") in ("Yes", "1") for s in seqs.values()), "WrapAround non pose")
check("WrapAround", headline(lua) == OK, final_of(lua)[:300])

# 9) build muet (Cmd() ne renvoie rien) -> controles partiels, board complet
lua, cmds, macs, elems, seqs, vars_ = run("mute", RECORDING_BOX + "CMD_RETURNS_NIL = true\n")
check("build muet", headline(lua).startswith(PARTIAL) and re.search(r"Commandes sans retour : [1-9]\d*", final_of(lua)), final_of(lua)[:400])
check("build muet", len(elems) == 184, "%d cases" % len(elems))

# 10) "Off ... Fade" refuse -> Off nus partout, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("nooffade", RECORDING_BOX + "OFF_FADE_OK = false\n")
final = final_of(lua)
check("Off sans fade", headline(lua).startswith(DEGRADED) and "Off ... Fade : REFUSE" in final and "SANS fondu" in final, final[:500])
check("Off sans fade", macs[mt.M_OFFALL] == ["Off Sequence 101 Thru 163"], macs.get(mt.M_OFFALL))
check("Off sans fade", seqs[113]["cues"][1]["props"]["Command"] == "Off Sequence 149 Thru 153 + 159 Thru 163", seqs[113]["cues"][1]["props"].get("Command"))
check("Off sans fade", macs[mt.M_FC0] == mt.fade_c_lines(0, "0") and macs[mt.M_FO0] == mt.fade_o_lines(0, "0", fade_ok=False), (macs[mt.M_FC0], macs[mt.M_FO0]))
check("Off sans fade", "Commandes refusees : 0" in final, final[:400])

# 11) Cook par plage refuse -> 15 cuissons par appui ; Set FX par plage refuse -> 30 lignes, rangee longue
lua, cmds, macs, elems, seqs, vars_ = run("norangecook", RECORDING_BOX + "RANGE_COOK_OK = false\n")
fxv = macs[mt.M_FXV0]
check("sans Cook par plage", len(fxv) == 2 + 15 + 1 + 3 and sum(1 for l in fxv if l.startswith("Cook Sequence") and l.endswith("/MergeLowPriority")) == 15, "%d lignes" % len(fxv))
check("sans Cook par plage", headline(lua) == OK and "Set par plage : couleurs oui, FX oui, Cook non" in final_of(lua), final_of(lua)[:400])
lua, cmds, macs, elems, seqs, vars_ = run("norangefx", RECORDING_BOX + "RANGED_FX_OK = false\n")
fxv = macs[mt.M_FXV0]
check("sans Set FX par plage", len(fxv) == 30 + 1 + 1 + 3, "%d lignes" % len(fxv))
check("sans Set FX par plage", headline(lua).startswith(DEGRADED) and "FX VITESSE 35 lignes" in final_of(lua), final_of(lua)[:600])

# 12) la copie dans le slot casse la reference -> pastilles par Assign Preset, MODE DEGRADE
lua, cmds, macs, elems, seqs, vars_ = run("copybreaks", RECORDING_BOX + "COPY_KEEPS_REF = false\n")
final = final_of(lua)
check("C1/C2 Assign", headline(lua).startswith(DEGRADED) and "C1/C2 : Assign Preset" in final, final[:500])
c1 = macs[mt.M_C1_0]
check("C1/C2 Assign", c1[0] == "Assign Preset 4.101 At Sequence 149 Cue 1 Part 0.1" and len(c1) == 15 + 1 + 4
      and not any(l.startswith("Copy Preset") for l in c1), c1[:3])
check("C1/C2 Assign", macs[mt.M_C2_0][0] == "Assign Preset 4.101 At Sequence 149 Cue 2 Part 0.1", macs[mt.M_C2_0][:1])

# 13) panne en pleine generation -> programmer vide, message d'echec, pas de board
lua, cmds, macs, elems, seqs, vars_ = run("boom", RECORDING_BOX + '''
local prev = _G.Cmd
_G.Cmd = function(s)
    if s == "Store Sequence 120 Cue 1 /Overwrite /NoConfirmation" then error("console en vrac") end
    return prev(s)
end''')
check("panne", cmds[-1] == "ClearAll", "le programmer n'a pas ete vide apres la panne")
check("panne", not any(c.startswith("Store Macro") and c != "Store Macro %d /NoConfirmation" % mt.MAC_PROBE for c in cmds), "des macros ont ete construites apres la panne")
check("panne", any("interrompue" in m for _, m in boxes(lua)), "pas de message d'echec")
check("panne", len(elems) == 0, "des cases ont ete posees apres la panne")

# 14) presets d'une AUTRE palette : seuls les labels faux sont re-stockes
OLD = {101: "Red", 102: "Orange", 103: "Yellow", 104: "Green", 105: "Cyan", 106: "Blue",
       107: "Violet", 108: "Magenta", 109: "Pink", 110: "White", 111: "Amber", 112: "Azure"}
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in OLD.items()) + " }"
lua, cmds, macs, elems, seqs, vars_ = run("stale", RECORDING_BOX, presets=pl)
stored = sorted(int(m.group(1)) for c in cmds for m in [re.match(r"^Store Preset 4\.(\d+) ", c)] if m)
want = sorted(no for no, nm in OLD.items() if nm != mt.COLOR_NAMES[no - 101])
check("palette perimee", stored == want, "re-stockes %s != %s" % (stored, want))
check("palette perimee", any("autre palette" in m for m in plans_of(lua)), "l'accueil ne signale pas la palette")

# 15) palette a jour : programmer = ClearAll + la selection du groupe union, tout reutilise
cur = "{ " + ", ".join("[%d] = '%s'" % (101 + i, n) for i, n in enumerate(mt.COLOR_NAMES)) + " }"
lua, cmds, macs, elems, seqs, vars_ = run("current", RECORDING_BOX, presets=cur)
check("palette a jour", not any(re.match(r"^(Fixture|Group \d+$|Attribute|At |Store Preset)", c) for c in cmds), "le programmer a servi")
check("palette a jour", "12 reutilises" in plans_of(lua)[0] and "12 reutilises" in final_of(lua), "bilan presets")
check("palette a jour", "Programmer : un ClearAll au depart, selection des groupes pour stocker CP ALL (puis ClearAll)." in plans_of(lua)[0], plans_of(lua)[0])
check("palette a jour", headline(lua) == OK, final_of(lua)[:300])

# 16) labels illisibles : on ne touche a rien (prudence)
lua, cmds, macs, elems, seqs, vars_ = run("noname", presets=cur, labels_readable=False)
check("labels illisibles", not any(c.startswith("Store Preset") for c in cmds), "presets reecrits sans pouvoir lire leur nom")

# 17) annulation a chaque ecran : AUCUNE commande
lua, cmds, macs, elems, seqs, vars_ = run("cancel_accueil", RECORDING_BOX + "BOX_ANSWER = function(t) return 0 end")
check("annulation accueil", len(cmds) == 0 and len(boxes(lua)) == 1, "%d commandes, %d ecrans" % (len(cmds), len(boxes(lua))))
for step in ("1/3", "2/3", "3/3", "Recapitulatif"):
    lua, cmds, macs, elems, seqs, vars_ = run("cancel_" + step.replace("/", ""), REGLER + '''
REGLER_HOOK = function(t)
    if (t.title or ""):match("%s") then return 0 end
    return 1
end''' % step)
    check("annulation %s" % step, len(cmds) == 0, "%d commandes envoyees" % len(cmds))
lua, cmds, macs, elems, seqs, vars_ = run("cancel_recook", RECORDING_BOX + '''
BOX_ANSWER = function(t)
    if __welcome(t) then return 3 end
    return 0
end''')
check("annulation re-cuisiner", len(cmds) == 0 and any("Re-cuisiner" in t for t, _ in boxes(lua)), "%d commandes" % len(cmds))

# 18) Regler : options personnalisees, tout suit ; le CMD des cues couleur garde son fondu fixe
lua, cmds, macs, elems, seqs, vars_ = run("options", REGLER + '''
REGLER_HOOK = function(t, inputs)
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
check("options", seqs[501]["cues"][1]["props"]["Command"] == "Off Sequence 525 Thru 539 Fade 1", "le CMD doit garder RELEASE_FADE : %s" % seqs[501]["cues"][1]["props"].get("Command"))
check("options", "Store Layout 3 /NoConfirmation" in cmds and any(c.endswith(" At Layout 3") for c in cmds), "layout ignore")
nColorSeq = sum(1 for s in seqs.values() if re.match(r"^(ALL|SPOT|WASH|GENERAL) ", s["name"]))
check("options", nColorSeq == 4 * 6, "%d sequences couleur pour 6 couleurs" % nColorSeq)
fx1 = 501 + 4 * 6
check("options", seqs[fx1]["cues"][1]["lines"][0]["props"]["DelayToX"] == "4", "vitesse FX 4 s ignoree")
check("options", seqs[fx1]["cues"][1]["props"]["CueInFade"] == "0.5", "fondu FX 0,5 (virgule) ignore")
check("options", macs[501] == ["Off Sequence 501 Thru %d Fade 3" % (fx1 + 14)], "Off All : %s" % macs.get(501))
check("options", "Copy Preset 4.501 At Preset 4.513 /Overwrite /NoConfirmation /NoOops" in cmds, "slot C1 decale")
check("options", "Assign Appearance %d At Macro %d" % (501 + 2 * 12 + 2, 501 + 44 + 3) in cmds, "bouton FX VITESSE 4 non surligne")
check("options", vars_.get("cp_fv") == str(501 + 44 + 3) and vars_.get("cp_fc") == str(501 + 4 + 3) and vars_.get("cp_all_slot") == "501", vars_)
check("options", macs[501 + 56] == ["Go+ Sequence 501"] and "Assign Appearance %d At Macro %d" % (501 + 12, 501 + 56) in cmds, "tuile neon decalee")
check("options", mt.groups_of(lua).get(501, (None, None))[1] == "CP ALL", "groupe union au premier numero libre >= 501")
check("options", headline(lua) == OK and len(elems) == mt.n_elements(4, 6, 3), "%s / %d cases" % (headline(lua), len(elems)))

# 19) "Construire" direct : aucun ecran de reglage, meme board que le nominal
lua, cmds, macs, elems, seqs, vars_ = run("defaults", RECORDING_BOX)
titles = [t for t, _ in boxes(lua)]
check("construire direct", not any("1/3" in t or "2/3" in t or "3/3" in t or "Recapitulatif" in t for t in titles), "ecrans montres : %s" % titles)
check("construire direct", len(elems) == 184 and 101 in seqs, "board different du nominal")

# 20) "Modifier" au recapitulatif : ecrans pre-remplis, nouvelles valeurs prises
lua, cmds, macs, elems, seqs, vars_ = run("modify", REGLER + '''
local recaps = 0
REGLER_HOOK = function(t, inputs)
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
recap = plans_of(lua)[2]      # accueil, recap 1, recap 2
check("modifier", "LIGNES (3) : ALL, WASH, GENERAL" in recap and "COULEURS : 7" in recap and "Vitesse FX 2.5s" in recap and "Layout 4" in recap, recap)
check("modifier", seqs[101]["cues"][1]["props"]["CueInFade"] == "4", "la valeur du second passage n'est pas prise")
check("modifier", sum(1 for c in cmds if c == "Store Sequence 101 Cue 1 /Overwrite /NoConfirmation") == 1, "sequence 101 stockee plusieurs fois")
check("modifier", sorted(mt.groups_of(lua)[101][0]) == [1, 2, 3, 4, 5, 6], "union de 2 + 3 (= GENERAL) attendue")

# 21) l'accueil dit la verite (le plan complet, en un ecran)
lua, cmds, macs, elems, seqs, vars_ = run("plan", RECORDING_BOX)
plan = plans_of(lua)[0]
for frag in ("Rig : 3 groupe(s) : SPOT, WASH, GENERAL", "LIGNES (4) : ALL, SPOT, WASH, GENERAL", "COULEURS : 12   FX : 15 vagues",
             'ALL : groupe "CP ALL" = Group 101 (cree, union de tes groupes)',
             "Fade couleur 1s - Fade arret 2s - Vitesse FX 2s - Fondu FX 1s",
             "Sequences 101-163   Macros 101-155 (tuiles 157-219)",
             "Appearances 101-154", "Images 3.101-3.127", "Presets 4.101-4.112", "slots FX 4.113 et 4.114",
             "Plages reservees : Seq 101-316, Macro 101-372, App 101-154, Img 3.101-3.128",
             "Programmer : un ClearAll au depart, 12 preset(s) a stocker (puis ClearAll), selection des groupes pour stocker CP ALL (puis ClearAll).",
             "Plages libres", "Construire :", "Regler :", "Re-cuisiner :"):
    check("accueil", frag in plan, "manque '%s' dans : %s" % (frag, plan))
check("accueil", "ATTENTION" not in plan and "Vagues pulsees" not in plan, plan)

# 22) plages OCCUPEES : avertissement, objets a toi nommes, Off avec fondu, nettoyage, board identique
lua, cmds, macs, elems, seqs, vars_ = run("occupied", RECORDING_BOX + "__macStored[150] = true\n__macNames[150] = 'Blinder'\n")
plan = plans_of(lua)[0]
check("plages occupees", "ATTENTION" in plan and "Sequence 101-%d, Macro 101-%d" % (mt.SEQ_DEL, mt.MAC_DEL) in plan, plan)
check("plages occupees", 'Objets A TOI qui seraient supprimes : Macro 150 "Blinder"' in plan, plan)
check("plages occupees", "executors" in plan, "note executors absente")
errs = mt.check(cmds, macs, elems, seqs, vars_, cleanup=True, groups=mt.groups_of(lua))
check("plages occupees", not errs, "; ".join(errs[:5]))
check("plages occupees", len(plans_of(lua)) == 1 and headline(lua) == OK, "plus d'une confirmation / bilan : %s" % headline(lua))
# nos propres objets (dont une tuile neon d'un board precedent) ne sont pas listes comme "a toi"
lua, cmds, macs, elems, seqs, vars_ = run("occupied_ours", RECORDING_BOX + "__macStored[101] = true\n__macNames[101] = 'Off All'\n__macStored[160] = true\n__macNames[160] = 'SPOT Yellow'\n__macStored[300] = true\n__macNames[300] = 'FX WASH 1/2'\n")
check("plages occupees (a nous)", "ATTENTION" in plans_of(lua)[0] and "Objets A TOI" not in plans_of(lua)[0], plans_of(lua)[0])
# bord de plage : une sequence a nous sur le dernier numero reserve -> occupee ; juste apres -> libre
lua, cmds, macs, elems, seqs, vars_ = run("occ_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n" % mt.SEQ_DEL)
check("plages occupees (bord)", "ATTENTION" in plans_of(lua)[0], "sequence %d non detectee" % mt.SEQ_DEL)
lua, cmds, macs, elems, seqs, vars_ = run("free_edge", RECORDING_BOX + "Cmd('Store Sequence %d Cue 1 /Overwrite /NoConfirmation')\n__macStored[%d] = true\n" % (mt.SEQ_DEL + 1, mt.MAC_DEL + 1))
check("plages libres (bord)", "Plages libres" in plans_of(lua)[0] and not any(c.startswith("Delete Macro %d Thru" % mt.B) for c in cmds), "hors plage")
# un objet survit au nettoyage -> rien n'est construit
lua, cmds, macs, elems, seqs, vars_ = run("leftover", RECORDING_BOX + "Cmd('Store Sequence 112 Cue 1 /Overwrite /NoConfirmation')\nDELETE_LEAVES[112] = true\n")
check("nettoyage incomplet", any("Impossible de nettoyer : Sequence 112" in m for _, m in boxes(lua)), "pas de message d'arret")
check("nettoyage incomplet", not any(c.startswith("Store Macro") or c == "Store Sequence 101 Cue 1 /Overwrite /NoConfirmation" for c in cmds), "construction lancee malgre le reste")

# 23) REGENERATION par-dessus un board v9.2 : le groupe CP ALL n'est pas une ligne, son slot est reutilise
lua, cmds, macs, elems, seqs, vars_ = run("regen", RECORDING_BOX, runs=2)
plans = plans_of(lua)
check("regeneration", len(plans) == 2 and "LIGNES (4) : ALL, SPOT, WASH, GENERAL" in plans[1]
      and 'ALL : groupe "CP ALL" = Group 101 (mis a jour, union de tes groupes)' in plans[1] and "ATTENTION" in plans[1], plans[-1])
check("regeneration", "Objets A TOI" not in plans[1] and "Ignores (groupe CP ALL" not in plans[1], plans[1])
first_end = [i for i, c in enumerate(cmds) if c == "Store Layout 1 /NoConfirmation"][0]
second = cmds[first_end + 1:]
second = second[[i for i, c in enumerate(second) if c.startswith("Off Sequence 101 Thru")][0]:]
errs = [e for e in mt.check(second, macs, elems, seqs, vars_, cleanup=True, groups=mt.groups_of(lua))
        if not e.startswith("presets : 0 'Fixture Thru'")]        # les presets existent deja : reutilises
check("regeneration", not errs, "; ".join(errs[:5]))
check("regeneration", "12 reutilises" in plans[1] and not any(c.startswith("Store Preset") for c in second), "presets re-stockes a la regeneration")
check("regeneration", headline(lua) == OK and len(elems) == 184, "%s / %d cases" % (headline(lua), len(elems)))

# ... le groupe CP ALL tape a la main dans Regler n'est pas une ligne non plus (annonce)
lua, cmds, macs, elems, seqs, vars_ = run("selfgroup", RECORDING_BOX + '''
local n = 0
BOX_ANSWER = function(t, inputs)
    if __welcome(t) then n = n + 1; return (n == 2) and 2 or 1 end
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1 + 2 + 3 + 101" end
    return 1
end''', runs=2)
plan = plans_of(lua)[-1]
check("groupe CP ALL tape", "LIGNES (4) : ALL, SPOT, WASH, GENERAL" in plan and "Ignores (groupe CP ALL du plugin) : 101" in plan, plan)
check("groupe CP ALL tape", len(elems) == 184 and headline(lua) == OK and "Group 1 + 2 + 3" in cmds, "%d cases, %s" % (len(elems), headline(lua)))

# 24) un preset A NOUS sur un slot FX : avertissement, puis le slot est pris
mine = dict((101 + i, n) for i, n in enumerate(mt.COLOR_NAMES))
mine[mt.P_FX1] = "MonPreset"
pl = "{ " + ", ".join("[%d] = '%s'" % kv for kv in mine.items()) + " }"
lua, cmds, macs, elems, seqs, vars_ = run("foreign", RECORDING_BOX, presets=pl)
check("slot FX occupe", "ATTENTION" in plans_of(lua)[0] and "4.%d (MonPreset)" % mt.P_FX1 in plans_of(lua)[0], plans_of(lua)[0])
check("slot FX occupe", "Copy Preset 4.101 At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % mt.P_FX1 in cmds, "slot non re-seede")
check("slot FX occupe", not any(c.startswith("Delete Preset") for c in cmds), "un preset a ete supprime")

# 25) pas de groupe : message clair, zero commande ; groupes tous vides : idem
lua, cmds, macs, elems, seqs, vars_ = run("nogroups", RECORDING_BOX + NO_GROUPS)
check("sans groupe", len(cmds) == 0 and any("Aucun groupe" in m and "Cree Group SPOT" in m for _, m in boxes(lua)), "%d commandes" % len(cmds))
lua, cmds, macs, elems, seqs, vars_ = run("allempty", RECORDING_BOX + "GROUPS[1] = {}; GROUPS[2] = {}; GROUPS[3] = {}\n")
check("groupes vides", len(cmds) == 0 and any("Tous les groupes du board sont vides" in m for _, m in boxes(lua)), "%d commandes" % len(cmds))

# 26) un groupe VIDE sur le board : ligne retiree et annoncee, le reste identique
lua, cmds, macs, elems, seqs, vars_ = run("emptygroup", RECORDING_BOX + "GROUPS[4] = {}; GROUP_NAMES[4] = 'SPARE'\n")
plan = plans_of(lua)[0]
check("groupe vide", 'Lignes ignorees (groupe vide) : Group 4 "SPARE"' in plan and "LIGNES (4) : ALL, SPOT, WASH, GENERAL" in plan, plan)
check("groupe vide", len(elems) == 184 and headline(lua) == OK, "%d cases, %s" % (len(elems), headline(lua)))
check("groupe vide", "Group 1 + 2 + 3" in cmds, "l'union ne doit pas contenir le groupe vide")

# 27) groupe ALL donne : la ligne ALL est une recipe simple sur CE groupe, pas de groupe union
lua, cmds, macs, elems, seqs, vars_ = run("allgroup", REGLER + '''
REGLER_HOOK = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupe ALL (optionnel)"] = "3" end
    return 1
end''')
plan = plans_of(lua)[-1]
check("groupe ALL", 'ALL : Group 3 "GENERAL" (recipe simple)' in plan, plan)
check("groupe ALL", all(len(seqs[mt.seq_c(1, ci)]["cues"][1]["lines"]) == 1 and seqs[mt.seq_c(1, ci)]["cues"][1]["lines"][0]["sel"] == 3 for ci in range(1, 13)), "lignes ALL")
check("groupe ALL", not any(c.startswith("Store Group") or c.startswith("Group ") for c in cmds), "un groupe union a ete stocke")
check("groupe ALL", "Lignes de recipe : 78/78" in final_of(lua) and 'ALL : Group 3 "GENERAL" (recipe simple)' in final_of(lua) and headline(lua) == OK, final_of(lua)[:600])

# 28) liste invalide / partielle (un seul groupe = pas de ligne ALL)
lua, cmds, macs, elems, seqs, vars_ = run("badlist", REGLER + '''
local asked = 0
REGLER_HOOK = function(t, inputs)
    if (t.title or ""):match("1/3") and t.inputs then
        asked = asked + 1
        if asked == 1 then inputs["Groupes du board"] = "99 + abc"; inputs["Groupe ALL (optionnel)"] = "77" end
    end
    return 1
end''')
msgs = [m for _, m in boxes(lua)]
check("liste invalide", any("Aucun numero valide dans : 99 + abc" in m and "Inconnus : abc, 99, ALL=77" in m for m in msgs), "pas de message d'erreur")
check("liste invalide", len(elems) == 184, "board incomplet apres la relance (%d cases)" % len(elems))
lua, cmds, macs, elems, seqs, vars_ = run("partlist", REGLER + '''
REGLER_HOOK = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1, 99" end
    return 1
end''')
plan = plans_of(lua)[-1]
check("liste partielle", "LIGNES (1) : SPOT" in plan and "Ignores (inexistants) : 99" in plan and "pas de ligne ALL (un seul groupe)" in plan, plan)
check("liste partielle", seqs[101]["name"] == "SPOT Red" and seqs[101]["cues"][1]["props"]["Command"] == "Off Sequence 113 Thru 117 Fade 1",
      seqs[101]["cues"][1]["props"].get("Command"))
check("liste partielle", len(elems) == mt.n_elements(1, 12, 1) and headline(lua) == OK and "ALL : sans (un seul groupe)" in final_of(lua), "%d cases" % len(elems))
check("liste partielle", not any(c.startswith("Store Group") for c in cmds), "pas de groupe union pour une seule ligne")

# 29) aucun numero de groupe libre pour l'union -> ALL INDISPONIBLE des l'accueil, board sans ALL
lua, cmds, macs, elems, seqs, vars_ = run("nogroupslot", REGLER + '''
for g = 101, 200 do GROUPS[g] = { 1 }; GROUP_NAMES[g] = "USER" .. g end
REGLER_HOOK = function(t, inputs)
    if (t.title or ""):match("1/3") then inputs["Groupes du board"] = "1 + 2 + 3" end
    return 1
end''')
plan = plans_of(lua)[-1]
check("sans numero libre", "LIGNES (3) : SPOT, WASH, GENERAL" in plan and "ALL : INDISPONIBLE (aucun numero de groupe libre entre 101 et 200)" in plan, plan)
check("sans numero libre", headline(lua).startswith(DEGRADED) and "ALL indisponible : aucun numero de groupe libre" in final_of(lua), final_of(lua)[:500])
check("sans numero libre", len(elems) == mt.n_elements(3, 12, 3) and not any(c.startswith("Store Group") for c in cmds), "%d cases" % len(elems))

# 30) petits groupes (1 et 2 machines) : vagues PULSEES (DelayFromX = battement), FX VITESSE les suit
lua, cmds, macs, elems, seqs, vars_ = run("small", RECORDING_BOX + '''
GROUPS[4] = { 7 }
GROUPS[5] = { 7, 8 }
GROUP_NAMES[4] = "SOLO"
GROUP_NAMES[5] = "PAIR"
''')
T5 = 6
check("petits groupes", len(elems) == mt.n_elements(T5, 12, 5), "%d cases" % len(elems))
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
      ['Set Sequence %s Cue %d Part 0.1 Property "DelayFromX" 0.5' % (pulsed_expr, k) for k in (1, 2)] and len(fxv) == 9,
      "FX VITESSE : %s" % fxv[:4])
check("petits groupes", "Vagues pulsees (groupe de 1-2 machines, rien a etaler) : FX SOLO J>C" in plans_of(lua)[0], plans_of(lua)[0])
check("petits groupes", headline(lua) == OK and "Vagues pulsees : FX SOLO J>C" in final_of(lua), final_of(lua)[:400])
# SOLO (7) chevauche PAIR (7, 8) mais pas SPOT/WASH/GENERAL
check("petits groupes", seqs[solo]["cues"][1]["props"]["Command"] == "Off Sequence %d Thru %d + %d Thru %d Fade 1" % (solo + 1, solo + 4, pair, pair + 4),
      seqs[solo]["cues"][1]["props"].get("Command"))
check("petits groupes", sorted(mt.groups_of(lua)[101][0]) == [1, 2, 3, 4, 5, 6, 7, 8], "union des 5 groupes")

# 31) 12 groupes : les rangees de reglage ne grossissent pas avec le nombre de boucles
lua, cmds, macs, elems, seqs, vars_ = run("many", RECORDING_BOX + '''
for g = 4, 14 do GROUPS[g] = { 7, 8 }; GROUP_NAMES[g] = "G" .. g end
''')
plan = plans_of(lua)[0]
check("12 groupes max", "LIGNES (13)" in plan and "limitees a 12" in plan, plan.splitlines()[0])
longest = max((len(l), no) for no, l in macs.items())
check("12 groupes max", longest[0] <= 9, "macro %d : %d lignes" % (longest[1], longest[0]))
check("12 groupes max", "Macros live : tuiles 1 ligne, FADE 5 lignes, C1/C2 8, FX VITESSE 9, FX FONDU 6" in final_of(lua), final_of(lua)[:700])
check("12 groupes max", len(elems) == mt.n_elements(13, 12, 12) and headline(lua) == OK, "%d cases, %s" % (len(elems), headline(lua)))

# 32) Re-cuisiner (bouton de l'accueil) : recuit un board existant, rien d'autre
lua, cmds, macs, elems, seqs, vars_ = run("recook", RECORDING_BOX + '''
for i = 101, 103 do Cmd("Store Sequence " .. i .. " Cue 1 /Overwrite /NoConfirmation") end
BOX_ANSWER = function(t)
    if __welcome(t) then return 3 end
    return 1
end''')
cooks = [c for c in cmds if c.startswith("Cook Sequence")]
check("re-cuisiner", cooks == ["Cook Sequence %d /Overwrite" % i for i in (101, 102, 103)], cooks)
check("re-cuisiner", any("3 sequence(s) recuisinee(s)" in m and "re-stocke : non" in m for _, m in boxes(lua)), "pas de bilan")
check("re-cuisiner", not any(c.startswith("Store ") or c.startswith("Delete ") for c in cmds[3:]), "autre chose que des Cook")
# ... apres une generation : le groupe CP ALL est re-stocke (variables memorisees), puis tout recuit
lua, cmds, macs, elems, seqs, vars_ = run("recook2", RECORDING_BOX + '''
local n = 0
BOX_ANSWER = function(t)
    if __welcome(t) then n = n + 1; return (n == 2) and 3 or 1 end
    return 1
end''', runs=2)
tail = cmds[[i for i, c in enumerate(cmds) if c == "Store Layout 1 /NoConfirmation"][0] + 1:]
tail = tail[[i for i, c in enumerate(tail) if c == "Group 1 + 2 + 3"][0] - 1:]
check("re-cuisiner apres generation", tail[:5] == ["ClearAll", "Group 1 + 2 + 3", "Store Group 101 /Overwrite /NoConfirmation", "ClearAll", "Cook Sequence 101 /Overwrite"], tail[:8])
check("re-cuisiner apres generation", sum(1 for c in tail if c.startswith("Cook Sequence")) == 63, "%d cuissons" % sum(1 for c in tail if c.startswith("Cook Sequence")))
check("re-cuisiner apres generation", any("63 sequence(s) recuisinee(s)" in m and "re-stocke : oui (Group 101 = 1 + 2 + 3)" in m for _, m in boxes(lua)), [m for _, m in boxes(lua)][-1])
check("re-cuisiner apres generation", not refused(tail), refused(tail)[:3])

# 33) la generation ne laisse jamais le programmer charge
lua, cmds, macs, elems, seqs, vars_ = run("clean")
sel = [i for i, c in enumerate(cmds) if re.match(r"^(Fixture|Group|Attribute) ", c)]
check("programmer propre", not sel or "ClearAll" in cmds[max(sel):max(sel) + 4], "pas de ClearAll apres le dernier usage du programmer")

# 34) ON APPUIE sur les boutons du board : chaque ligne passe, l'etat suit
lua, cmds, macs, elems, seqs, vars_ = run("press", RECORDING_BOX)
runs_ = press(lua, mt.M_FC0 + 3)                      # FADE couleur 2s
check("appui FADE couleur", all(r == "Ok" for _, r in runs_) and len(runs_) == 5, runs_)
_, _, _, seqs, vars_ = mt.snapshot(lua)
check("appui FADE couleur", all(seqs[mt.seq_c(ti, ci)]["cues"][1]["props"]["CueInFade"] == "2" for ti in range(1, 5) for ci in range(1, 13)), "CueInFade non reecrit")
check("appui FADE couleur", vars_.get("cp_fc") == str(mt.M_FC0 + 3), vars_.get("cp_fc"))
check("appui FADE couleur", ("Assign Appearance %d At Macro %d" % (mt.APP_GREY, mt.DEF_FC), "Ok") in runs_, "l'ancien bouton actif n'est pas eteint : %s" % runs_)
check("appui FADE couleur", all(seqs[mt.seq_c(ti, ci)]["cues"][1]["props"]["Command"].endswith("Fade 1") for ti in range(1, 5) for ci in range(1, 13)), "le CMD ne doit pas bouger")
runs_ = press(lua, mt.M_FC0 + 1)                      # FADE couleur 0.5s : le precedent (2s) s'eteint
check("appui FADE couleur 2", ("Assign Appearance %d At Macro %d" % (mt.APP_GREY, mt.M_FC0 + 3), "Ok") in runs_ and all(r == "Ok" for _, r in runs_), runs_)
runs_ = press(lua, mt.M_FO0 + 5)                      # FADE arret 4
_, macs, _, _, vars_ = mt.snapshot(lua)
check("appui FADE arret", all(r == "Ok" for _, r in runs_) and macs[mt.M_OFFALL] == ["Off Sequence 101 Thru 163 Fade 4"] and vars_.get("cp_fo") == str(mt.M_FO0 + 5), (runs_, macs[mt.M_OFFALL]))
runs_ = press(lua, mt.M_C1_0 + 7)                     # C1 Blue
_, _, _, _, vars_ = mt.snapshot(lua)
check("appui C1", all(r == "Ok" for _, r in runs_) and len(runs_) == 8, runs_)
check("appui C1", ("Assign Appearance %d At Macro %d" % (mt.app_off(1), mt.DEF_C1), "Ok") in runs_, "la pastille Red ne revient pas a son contour : %s" % runs_)
check("appui C1", vars_.get("cp_c1m") == str(mt.M_C1_0 + 7) and vars_.get("cp_c1a") == str(mt.app_off(8)), vars_)
check("appui C1", lua.eval("__presets[%d]" % mt.P_FX1) == "CP FX C1", "slot C1 relabellise")
runs_ = press(lua, mt.M_C1_0 + 2)                     # C1 Amber : Blue revient a son contour
check("appui C1 2", ("Assign Appearance %d At Macro %d" % (mt.app_off(8), mt.M_C1_0 + 7), "Ok") in runs_, runs_)
runs_ = press(lua, mt.M_FXV0 + 3)                     # FX VITESSE 4s
_, _, _, seqs, vars_ = mt.snapshot(lua)
check("appui FX VITESSE", all(r == "Ok" for _, r in runs_) and len(runs_) == 7, runs_)
check("appui FX VITESSE", all(seqs[mt.seq_fx(gi, di)]["cues"][k]["lines"][0]["props"]["DelayToX"] == "4" for gi in range(1, 4) for di in range(1, 6) for k in (1, 2)), "DelayToX non reecrit")
check("appui FX VITESSE", all(seqs[mt.seq_fx(gi, di)]["cues"][1]["cookCount"] >= 3 for gi in range(1, 4) for di in range(1, 6)), "pas de recuisson")
runs_ = press(lua, mt.M_FXF0 + 4)                     # FX FONDU 4s
_, _, _, seqs, _ = mt.snapshot(lua)
check("appui FX FONDU", all(r == "Ok" for _, r in runs_) and len(runs_) == 6
      and all(seqs[mt.seq_fx(gi, di)]["cues"][k]["props"]["CueInFade"] == "4" for gi in range(1, 4) for di in range(1, 6) for k in (1, 2)), runs_)
runs_ = press(lua, mt.mac_tile(mt.seq_c(2, 1)))      # tuile SPOT Red
check("appui tuile", runs_ == [("Go+ Sequence %d" % mt.seq_c(2, 1), "Ok")] and lua.eval("__running[%d]" % mt.seq_c(2, 1)) is True, runs_)
runs_ = press(lua, mt.mac_tile(mt.seq_fx(1, 3)))     # tuile FX SPOT E>I
check("appui tuile FX", runs_ == [("Go+ Sequence %d" % mt.seq_fx(1, 3), "Ok")] and lua.eval("__running[%d]" % mt.seq_fx(1, 3)) is True, runs_)
runs_ = press(lua, mt.M_OFFALL)
check("appui Off All", runs_ == [("Off Sequence 101 Thru 163 Fade 4", "Ok")] and not lua.eval("__running[%d]" % mt.seq_c(2, 1)), runs_)

print("\n".join(fails) if fails else "TOUS LES SCENARIOS OK")
sys.exit(1 if fails else 0)
