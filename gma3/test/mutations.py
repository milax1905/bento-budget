#!/usr/bin/env python3
"""Test de mutation : on casse le plugin volontairement, la batterie doit crier.

Chaque mutation reintroduit un bug reel (vu sur console, trouve en revue,
ou typique des recipes / tuiles neon MA3) dans une copie du plugin, puis rejoue
mock_test.py et all_scenarios.py sur cette copie. Une mutation qui PASSE
les tests signale un trou dans le filet.

Usage :  python3 test/mutations.py      -> "TOUTES LES MUTATIONS ATTRAPEES" / liste
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.join(HERE, "..", "ColorPicker.lua")
MUTDIR = os.path.join(HERE, "_mut")

# (nom, texte d'origine (unique), texte mutant)
MUTATIONS = [
    ("Cook sans option (popup impossible depuis Lua : rien n'est cuisine)",
     'return run(string.format("Cook Sequence %d /%s", sq, mode or "Overwrite"))',
     'return run(string.format("Cook Sequence %d", sq))'),
    ("Store sans /Overwrite /NoConfirmation (popup a la regeneration)",
     "run(string.format('Store Sequence %d Cue 1 /Overwrite /NoConfirmation', sq))\n                    noteLine(addRecipeLine(sq, 1, 1, rowGroupId(ti), PT, baseId + ci - 1))",
     "run(string.format('Store Sequence %d Cue 1', sq))\n                    noteLine(addRecipeLine(sq, 1, 1, rowGroupId(ti), PT, baseId + ci - 1))"),
    ("TrigType en minuscules (valeur sensible a la casse -> Illegal value)",
     'setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "Follow")',
     'setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "follow")'),
    ("la tuile FX coupe sa propre boucle (CMD sans exception)",
     "local killCmd = offListCmd(killRanges(ti, sq), FX_KILL_FADE)",
     "local killCmd = offListCmd(killRanges(ti), FX_KILL_FADE)"),
    ("aucun CMD sur les cues couleur (les boucles d'autres groupes continuent)",
     'if cmd then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end',
     'if false then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end'),
    ("le CMD des cues couleur suit le fade couleur (la rangee FADE devrait alors le reecrire)",
     "local cmd = rowKillCmd(ti, RELEASE_FADE)",
     "local cmd = rowKillCmd(ti, colorFade * 2)"),
    ("E>I / I>E sans XWings (vagues identiques a J>C)",
     'if dir.wings  then setLineProp(sq, k, 1, "XWings", 2) end',
     'if false then setLineProp(sq, k, 1, "XWings", 2) end'),
    ("C>J / I>E sans InvertX (sens jamais inverse)",
     "if dir.invert then\n                        setLineProp(sq, k, 1, \"InvertX\", \"Yes\")",
     "if false then\n                        setLineProp(sq, k, 1, \"InvertX\", \"Yes\")"),
    ("PreferCueAppearance oublie sur les couleurs (tuiles sans etat)",
     'setDisplayProp("prefer", "Sequence " .. sq, "PreferCueAppearance", "Yes")\n                    setProp(string.format("Sequence %d Cue 1", sq), "CueInFade", colorFade)',
     'setProp(string.format("Sequence %d Cue 1", sq), "CueInFade", colorFade)'),
    ("FX VITESSE ignore la valeur du bouton (toutes les vitesses = 1 s)",
     "'Set Sequence %d Thru %d Cue %d Part 0.1 Property \"DelayToX\" %s',\n                        seqFx(1, 1), seqLast, k, fmtNum(v))",
     "'Set Sequence %d Thru %d Cue %d Part 0.1 Property \"DelayToX\" %s',\n                        seqFx(1, 1), seqLast, k, fmtNum(1))"),
    ("retour de Cmd() ignore (le bug de la v8 : refus silencieux)",
     'local s = tostring(r):lower()\n    return s:sub(1, 2) == "ok"',
     'return true'),
    ("Cmd() sans retour pris pour un succes",
     "if r == nil then return nil end\n    local s = tostring(r):lower()",
     "if r == nil then return true end\n    local s = tostring(r):lower()"),
    ("plage de nettoyage des macros trop courte (les tuiles neon d'un vieux board restent)",
     "P.macDelEnd = P.seqDelEnd + TILE_OFFSET",
     "P.macDelEnd = P.macSetEnd + 1"),
    ("groupe union reduit au premier groupe du board (ALL = SPOT)",
     'local rSel = Cmd("Group " .. srcExpr)',
     'local rSel = Cmd("Group " .. tostring(P.groupIds[1]))'),
    ("membres du groupe union jamais compares (un groupe faux passe)",
     "if #list == 0 or (unionKnown and #list ~= union) then",
     "if false then"),
    ("le groupe CP ALL d'une generation precedente devient une ligne du board",
     'if groupName(gid) ~= ALL_GROUP_NAME then kept[#kept + 1] = gid end',
     'kept[#kept + 1] = gid'),
    ("le groupe CP ALL tape dans Regler devient une ligne du board",
     "if groupName(gid) == ALL_GROUP_NAME then\n                selfGroups[#selfGroups + 1] = tostring(gid)",
     "if false then\n                selfGroups[#selfGroups + 1] = tostring(gid)"),
    ("probes supprimees (plus de verification du CMD, du Off ... Fade ni de $var)",
     "local probe = probeOnScratch(seqProbe, macProbe)",
     "local probe = { cmd = true, offFade = true, sub = true, varChannel = true, leftover = false, leftoverMac = false }"),
    ("resultat de la probe de substitution ignore (macros avec $var sur une console qui ne substitue pas)",
     "if probe.sub == false or probe.varChannel == false then SUB_OK = false end",
     "SUB_OK = true"),
    ("FADE couleur reecrit aussi les boucles FX (mauvaise plage)",
     "'Set Sequence %d Thru %d Cue 1 Property \"CueInFade\" %s', seqColor(firstColorTi, 1), seqEnd, fmtNum(v))",
     "'Set Sequence %d Thru %d Cue 1 Property \"CueInFade\" %s', seqColor(firstColorTi, 1), seqLast, fmtNum(v))"),
    ("variable de surbrillance jamais ecrite par le bouton (le suivant eteint le mauvais)",
     "lines[#lines + 1] = string.format('SetGlobalVariable \"%s\" %d', var, me)",
     "-- (variable oubliee)"),
    ("variables de surbrillance non semees (premier appui : $cp_fc vide)",
     "run(string.format('SetGlobalVariable \"%s\" %d', s[1], s[2]), true)",
     "-- (seed oublie)"),
    ("WrapAround oublie sur les boucles (la boucle s'arrete apres la cue 2)",
     '                setPropTry("Sequence " .. sq, "WrapAround", { 1, "Yes" })\n                setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")',
     '                setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")'),
    ("image pleine posee sur l'appearance de CUE (une sequence ne la rend pas : tuile active invisible)",
     "attach(imgFill(i), appOn(i))",
     "attach(imgFill(i), appSeqOn(i))"),
    ("tuile neon avec l'appearance PLEINE (plus de contour : toutes les tuiles ont l'air allumees)",
     'makeMacro(macTile(sq), t.label .. " " .. c.name, appOff(ci), { "Go+ Sequence " .. sq })',
     'makeMacro(macTile(sq), t.label .. " " .. c.name, appOn(ci), { "Go+ Sequence " .. sq })'),
    ("macro neon posee AVANT sa sequence (la sequence la recouvre : contour cache, tape sur la sequence)",
     "elements[#elements + 1] = { object = \"Macro \" .. macTile(sq), x = 2 + ci - 1, y = row, clean = true }",
     "table.insert(elements, #elements, { object = \"Macro \" .. macTile(sq), x = 2 + ci - 1, y = row, clean = true })"),
    ("en-tete de groupe tappable (selectionne le groupe en plein show)",
     'pcall(function() elem:Set("Action", "None") end)',
     'pcall(function() elem:Set("Action", "Go+") end)'),
    ("vague etalee sur un groupe d'1 machine (cue de duree nulle, boucle emballee)",
     "local fromX = pulsed[sq] and fxSweep or 0",
     "local fromX = 0"),
    ("relecture des proprietes supprimee (la console peut dire oui et faire non)",
     "    local got = getProp(addr, name)\n    local tally = CP.display and kind == \"display\"",
     "    local got = tostring(value)\n    local tally = CP.display and kind == \"display\""),
    ("Recast oublie apres la copie dans le slot (la cue garde l'ancienne couleur)",
     "lines[#lines + 1] = string.format('Recast Preset %d.%d', PT, slotNo)",
     "-- (Recast oublie)"),
    ("plus de re-verification apres le nettoyage (on construit par-dessus un reste)",
     "        if left then\n            MessageBox({ title = \"Color Picker LIVE  v\" .. VERSION,\n                message = string.format(\"Impossible de nettoyer",
     "        if false then\n            MessageBox({ title = \"Color Picker LIVE  v\" .. VERSION,\n                message = string.format(\"Impossible de nettoyer"),
    ("groupe vide garde sur le board (ligne morte qui ne cuit jamais)",
     "if known and #list == 0 then\n                    emptyRows[#emptyRows + 1] = string.format('Group %d \"%s\"', gid, groupName(gid))",
     "if false then\n                    emptyRows[#emptyRows + 1] = string.format('Group %d \"%s\"', gid, groupName(gid))"),
]


def run(script, env):
    r = subprocess.run([sys.executable, os.path.join(HERE, script)], env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=900)
    return r.returncode, r.stdout


def main():
    src = open(PLUGIN, encoding="utf-8").read()
    os.makedirs(MUTDIR, exist_ok=True)
    survivors = []
    for i, (name, old, new) in enumerate(MUTATIONS, 1):
        if src.count(old) != 1:
            print("[%2d] CIBLE INTROUVABLE (%d occurrence(s)) : %s" % (i, src.count(old), name))
            survivors.append(name)
            continue
        mut = os.path.join(MUTDIR, "mut%02d.lua" % i)
        open(mut, "w", encoding="utf-8").write(src.replace(old, new))
        env = dict(os.environ, COLORPICKER_LUA=mut)
        rc, out = run("mock_test.py", env)
        caught_by = "mock_test" if rc != 0 else None
        if not caught_by:
            rc, out = run("all_scenarios.py", env)
            caught_by = "all_scenarios" if rc != 0 else None
        if caught_by:
            lines = out.splitlines()
            first = next((l[3:] for l in lines if l.startswith(" - ")),
                         next((l for l in lines if ": " in l and not l.startswith("commandes")), ""))
            print("[%2d] attrapee (%s) : %s\n       -> %s" % (i, caught_by, name, first[:110]))
        else:
            print("[%2d] SURVIT : %s" % (i, name))
            survivors.append(name)
    print()
    if survivors:
        print("MUTATIONS SURVIVANTES :\n - " + "\n - ".join(survivors))
        sys.exit(1)
    print("TOUTES LES MUTATIONS ATTRAPEES (%d/%d)" % (len(MUTATIONS), len(MUTATIONS)))


if __name__ == "__main__":
    main()
