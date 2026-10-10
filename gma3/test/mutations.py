#!/usr/bin/env python3
"""Test de mutation : on casse le plugin volontairement, la batterie doit crier.

Chaque mutation reintroduit un bug reel (vu sur console ou trouve en revue)
dans une copie du plugin, puis rejoue mock_test.py et all_scenarios.py sur
cette copie. Une mutation qui PASSE les tests signale un trou dans le filet.

Usage :  python3 test/mutations.py      -> "TOUTES LES MUTATIONS ATTRAPEES" / liste
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.join(HERE, "..", "ColorPicker.lua")
MUTDIR = os.path.join(HERE, "_mut")

# (nom, texte d'origine (unique), texte mutant)
MUTATIONS = [
    ("Goto au lieu de Go+ (la boucle reste bloquee sur la cue 1)",
     'return string.format("Go+ Sequence %d", sq)',
     'return string.format("Goto Sequence %d Cue 1", sq)'),
    ("/NoConfirmation oublie sur Store Macro (popup en pleine generation)",
     "Cmd(string.format('Store Macro %d /NoConfirmation', no))",
     "Cmd(string.format('Store Macro %d', no))"),
    ("sens de balayage inverse (J>C part de cour)",
     '{ lbl = "J>C", fan = "fwd",    fb = "Delay 0 Thru %s" },\n    { lbl = "C>J", fan = "rev",    fb = "Delay %s Thru 0" },',
     '{ lbl = "J>C", fan = "rev",    fb = "Delay 0 Thru %s" },\n    { lbl = "C>J", fan = "fwd",    fb = "Delay %s Thru 0" },'),
    ("OffFade reintroduit (propriete inexistante sur 2.5)",
     """Cmd(string.format('Set Sequence %d Property "OffWhenOverridden" "Yes"', no))
            pcall(function()
                local s = ObjectList("Sequence " .. no)[1]
                if s then
                    for ki = 1, 2 do""",
     """Cmd(string.format('Set Sequence %d Property "OffWhenOverridden" "Yes"', no))
            Cmd(string.format('Set Sequence %d Property "OffFade" "1"', no))
            pcall(function()
                local s = ObjectList("Sequence " .. no)[1]
                if s then
                    for ki = 1, 2 do"""),
    ("ligne ALL non repeinte quand un groupe prend la main",
     "if not seen[1] then rows[#rows + 1] = 1; seen[1] = true end",
     "if false then rows[#rows + 1] = 1; seen[1] = true end"),
    ("FADE couleur partiel (les Off des tuiles gardent l'ancien fondu)",
     "for k = 1, (tileOffCount[m2] or 0) do",
     "for k = 1, 0 do"),
    ("la tuile FX coupe sa propre boucle avant de la lancer",
     "killFxLines(ti, lines, colorFade, seqFx(gi, di))",
     "killFxLines(ti, lines, colorFade)"),
    ("plage de nettoyage des macros decalee de 1",
     "+ MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1\n    local appDelEnd",
     "+ MAX_ROWS * NC + MAX_GROUP_ROWS * nDir\n    local appDelEnd"),
    ("boucle de duree nulle sur un petit groupe (plus de plancher)",
     "if maxD <= 0 then",
     "if false then"),
    ("nettoyage meme sur plages libres (le recap ment)",
     "local occupied, detectOk = false, true",
     "local occupied, detectOk = true, true"),
    ("slot FX etranger non detecte (preset utilisateur ecrase sans avertir)",
     'if nm == nil or not nm:match("^CP FX") then',
     'if false then'),
    ("ID de depart sous 101 accepte",
     'baseId = math.floor(toNum(box.inputs["ID de depart (101+)"], 101, 101, 100000))',
     'baseId = math.floor(toNum(box.inputs["ID de depart (101+)"], 101, 1, 100000))'),
    ("numeros de groupes tapes non verifies",
     "if objectExists(kind .. id) then kept[#kept + 1] = id",
     "if true then kept[#kept + 1] = id"),
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
