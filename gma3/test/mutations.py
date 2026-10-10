#!/usr/bin/env python3
"""Test de mutation : on casse le plugin volontairement, la batterie doit crier.

Chaque mutation reintroduit un bug reel (vu sur console, trouve en revue,
ou typique des recipes MA3) dans une copie du plugin, puis rejoue
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
     'return run(string.format("Cook Sequence %d /Overwrite", sq))',
     'return run(string.format("Cook Sequence %d", sq))'),
    ("Store sans /Overwrite /NoConfirmation (popup a la regeneration)",
     "run(string.format('Store Sequence %d Cue 1 /Overwrite /NoConfirmation', sq))\n                for k, gid in ipairs(rowGroupIds(ti)) do",
     "run(string.format('Store Sequence %d Cue 1', sq))\n                for k, gid in ipairs(rowGroupIds(ti)) do"),
    ("TrigType en minuscules (valeur sensible a la casse -> Illegal value)",
     'setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "Follow")',
     'setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "follow")'),
    ("la tuile FX coupe sa propre boucle (CMD sans exception)",
     "local killCmd = offListCmd(killRanges(ti, sq), FX_KILL_FADE)",
     "local killCmd = offListCmd(killRanges(ti), FX_KILL_FADE)"),
    ("aucun CMD sur les cues couleur (les boucles d'autres groupes continuent)",
     'if cmd then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end',
     'if false then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end'),
    ("E>I / I>E sans XWings (vagues identiques a J>C)",
     'if dir.wings  then setLineProp(sq, k, 1, "XWings", "2") end',
     'if false then setLineProp(sq, k, 1, "XWings", "2") end'),
    ("C>J / I>E sans InvertX (sens jamais inverse)",
     "if dir.invert then\n                        setLineProp(sq, k, 1, \"InvertX\", \"Yes\")",
     "if false then\n                        setLineProp(sq, k, 1, \"InvertX\", \"Yes\")"),
    ("PreferCueAppearance oublie sur les couleurs (tuiles sans etat)",
     'setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")\n                setProp("Sequence " .. sq, "PreferCueAppearance", "Yes", true)\n                setProp(string.format("Sequence %d Cue 1", sq), "CueInFade"',
     'setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")\n                setProp(string.format("Sequence %d Cue 1", sq), "CueInFade"'),
    ("battement FX fige a 1 s (le reglage de l'assistant est ignore)",
     'setLineProp(sq, k, 1, "DelayToX", fmtNum(fxSweep))',
     'setLineProp(sq, k, 1, "DelayToX", "1")'),
    ("retour de Cmd() ignore (le bug de la v8 : refus silencieux)",
     'return s:sub(1, 2) == "ok"\nend',
     'return true\nend'),
    ("plage de nettoyage des macros decalee de 1",
     "+ MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1\n    local appDelEnd",
     "+ MAX_ROWS * NC + MAX_GROUP_ROWS * nDir\n    local appDelEnd"),
    ("ligne ALL reduite a son premier groupe",
     "for k, gid in ipairs(rowGroupIds(ti)) do",
     "for k, gid in ipairs({ rowGroupIds(ti)[1] }) do"),
    ("probe du CMD de cue supprimee (plus de verification)",
     "local cmdProbe = probeCueCommand(seqProbe)",
     "local cmdProbe = nil"),
    ("FADE couleur reecrit aussi les boucles FX (mauvaise plage)",
     "'Set Sequence %d Thru %d Cue 1 Property \"CueInFade\" \"%s\"', baseId, seqEnd, vs)",
     "'Set Sequence %d Thru %d Cue 1 Property \"CueInFade\" \"%s\"', baseId, seqLast, vs)"),
    ("WrapAround oublie (la boucle s'arrete apres la cue 2)",
     'setPropTry("Sequence " .. sq, "WrapAround", { "Yes", "1" })',
     '-- (WrapAround oublie)'),
    ("image neon posee sur l'appearance d'une TUILE (une sequence ne la rend pas)",
     "attach(imgFill(i), appOn(i))",
     "attach(imgFill(i), appSeqOn(i))"),
    ("en-tete de groupe tappable (selectionne le groupe en plein show)",
     'pcall(function() elem:Set("Action", "None") end)',
     'pcall(function() elem:Set("Action", "Go+") end)'),
]


def run(script, env):
    r = subprocess.run([sys.executable, os.path.join(HERE, script)], env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600)
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
