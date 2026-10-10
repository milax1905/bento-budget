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
    __boxes[#__boxes + 1] = { title = t.title or "", message = t.message or "" }
    local r = BOX_ANSWER and BOX_ANSWER(t, inputs) or 1
    return { result = r, inputs = inputs }
end
'''


def boxes(lua):
    out = []
    for b in mt.lua_list(lua.eval("__boxes")):
        out.append((b["title"], b["message"]))
    return out


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
check("sans API selection", macs2.get(mt.m_fx(1, 1), [])[:2] == ["Off Sequence 149 Thru 153 Fade 1", "Go+ Sequence 149"], "tuile FX changee en repli")

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
check("palette perimee", any("AUTRE palette" in m for _, m in boxes(lua)), "la confirmation ne signale pas la palette")
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
    if (t.message or ""):match("Tout ecraser") then return 0 end
    return 1
end''')
check("annulation ecrasement", not any(c.startswith("Delete ") for c in cmds), "des objets ont ete supprimes")
check("annulation ecrasement", not any(c.startswith("Store ") for c in cmds), "des objets ont ete crees")

# 11) Options personnalisees : tout suit (fondus, vitesse, IDs, layout, couleurs)
lua, cmds, macs, elems = run("options", RECORDING_BOX + '''
BOX_ANSWER = function(t, inputs)
    if (t.title or ""):match("Options") then
        inputs["Nb couleurs (max 12)"] = "6"
        inputs["Fade couleur (s)"] = "2"
        inputs["Fade arret (s)"] = "3"
        inputs["Vitesse FX / battement (s)"] = "2"
        inputs["Fondu FX (s, 0 = sec)"] = "0,2"
        inputs["ID de depart (seq/macro/appearance)"] = "501"
        inputs["Layout (No)"] = "3"
        return 1
    end
    if not t.inputs and (t.title or ""):match("v%d") and not (t.message or ""):match("pret") then
        return 2          -- "Options" au premier ecran
    end
    return 1
end''')
check("options", "Store Sequence 501 Cue 1 /NoConfirmation" in cmds, "ID de depart ignore")
check("options", 'Set Sequence 501 Cue 1 Property "CueInFade" "2"' in cmds, "fade couleur ignore")
check("options", "Delete Layout 3 /NoConfirmation" in cmds, "numero de layout ignore")
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

# 12) la generation ne laisse jamais le programmer charge, meme en nominal
lua, cmds, macs, elems = run("clean")
last_sel = max(i for i, c in enumerate(cmds) if re.match(r"^(Fixture|Group) ", c))
check("programmer propre", "ClearAll" in cmds[last_sel:], "pas de ClearAll apres la derniere selection")

print("\n".join(fails) if fails else "TOUS LES SCENARIOS OK")
sys.exit(1 if fails else 0)
