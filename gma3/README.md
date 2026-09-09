# Color Picker LIVE — Plugin grandMA3 (v2.x)

Un **color picker de busking** : chaque tuile couleur est une **mini-séquence**
posée sur le layout. Taper = la couleur part **en restitution** (LTP), avec un
fondu, **sans jamais toucher au programmer**. C'est le pattern busking
standard de grandMA3.

```
┌────────────────────────────────────────────────────┐
│           C O L O R   P I C K E R                  │
│ [ ALL  ] [Red][Orange][Yellow][Cyan]…[White]       │
│ [ SPOT ] [Red][Orange][Yellow][Cyan]…[White] [FX]  │
│ [ WASH ] [Red][Orange][Yellow][Cyan]…[White] [FX]  │
│ [═════════ Off All (barre rouge) ═════════]        │
│ [FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]       │
│ [FADE arrêt 2s  ] [0][0.5][1][2][3][4]             │
│ [FX C1 Red ] [○][○][●][○]… (pastilles couleur)     │
│ [FX C2 Blue] [○][○][○][●]…                          │
└────────────────────────────────────────────────────┘
```

- **Case de gauche** = la vraie machine (ou le groupe) : icône, nom,
  **couleur live**. La taper sélectionne la machine.
- **Tuiles couleur** = séquences avec une vraie **Appearance** couleur
  (`Assign Appearance N At Sequence M`) → tuiles pleines couleur.
- **Off When Overridden** : changer de couleur relâche l'ancienne → une
  seule tuile active par ligne (comportement radio).
- **Presets couleur universels** (pool Color 4, IDs `4.101`+) : les cues du
  board les **référencent** → modifie un preset (ton rouge, ton ambre…) et
  **tout le board suit**. S'ils existent déjà, ils sont **réutilisés tels
  quels** — régénérer n'efface jamais tes presets.
- **Bloc FX (boucle 2 couleurs)** — sur les lignes de groupes, une tuile
  **`FX`** en bout de ligne lance une **boucle C1↔C2 qui balaie le groupe**
  en restitution :
  - Construction **par commandes** (le chemin fiable sur console) :
    2 cues stockées `At Preset <slot C1/C2>` avec un **delay individuel
    réparti sur le groupe** (`Delay 0 Thru 1` → balayage jardin→cour),
    les deux cues en *Trigger Follow* + *WrapAround* → boucle infinie.
  - **`FX C1` / `FX C2`** : deux rangées de pastilles pour choisir les deux
    couleurs (pastille choisie = remplie). Mécanique : `Copy Preset … /Merge`
    dans deux presets *slots* **référencés par les cues FX** →
    changement instantané, même en cours de boucle.
  - **La couleur reprend toujours la main** : chaque cue couleur porte une
    commande (colonne CMD) qui **coupe la boucle FX de sa ligne** (la ligne
    ALL coupe toutes les boucles). Sans ça, une boucle Follow ré-affirme
    ses valeurs en LTP à chaque cue et « reprend » la couleur au tap
    suivant — les tuiles semblaient mortes tant qu'un FX tournait.
- **Tuiles néon générées** : le plugin **fabrique lui-même** ses images PNG
  (pur Lua, zéro fichier à copier), les écrit dans la *User Image Library*,
  les importe dans le pool Images et les pose sur les appearances :
  **contour arrondi** au repos, **pavé arrondi plein** quand actif (le fond
  de l'appearance passe en alpha 0 → les coins restent ronds, pas de
  rectangle brut). Icône, barre-témoin et bordure des tuiles : masquées.
- **Outils** : `Off All` (relâche les couleurs, playback). L'intensité reste
  à ton fader de dimmer. **Aucune action de ce board ne touche le
  programmer** — c'est un layout de restitution, pas de construction.
- **Tuiles « fill-on-active »** (style MA2) : sombres au repos, **pleine
  couleur quand elles jouent** (appearance sombre sur la séquence, pleine
  sur la cue).
- **Rangées FADE** en bas du layout :
  - `FADE couleur` → `0s · 0.5s · 1s · 2s · 3s · 4s` : fondu **entre les
    couleurs** (et au lancement). Taper une valeur la règle pour tout le board.
  - `FADE arrêt` → `0 · 0.5 · 1 · 2 · 3 · 4` : fondu au **relâché** (off).
    Le fade est écrit directement dans la commande du bouton `Off All`
    (`Off … Fade X`) — fiable quel que soit le build.
  - **Le bouton actif est surligné en blanc** et le titre affiche la valeur
    courante (ex. `FADE couleur 2s`) — tu vois toujours sur quel fade tu es.

## Le workflow live

1. (Il faut de l'intensité pour voir la couleur : ton show, ou `Full`.)
2. Tape une tuile → la ligne passe à cette couleur (fondu).
3. Autre tuile de la même ligne → la couleur change, l'ancienne se
   relâche toute seule.
4. `Off All` → tout se relâche (fondu d'arrêt). **Zéro programmer.**

## Objets créés (à partir de l'ID de départ, défaut 101)

| Pool        | Contenu                                                       |
|-------------|---------------------------------------------------------------|
| Appearances | 2 par couleur (active/repos) + utilitaires (`CP Dark`, …)     |
| Sequences   | 1 par (ligne × couleur) + 1 FX par groupe                     |
| Macros      | `Off All`, `ALL`, bannière, rangées FADE, pastilles C1/C2     |
| Images      | tuiles néon générées (contours + pavés remplis)               |
| Presets 4.x | couleurs universelles + 2 slots FX (jamais effacés)           |

Les pools 1–100 ne sont pas touchés. Si une plage est occupée, le plugin
**demande confirmation** avant d'écraser.

## Fichiers

| Fichier            | Rôle                                                   |
|--------------------|--------------------------------------------------------|
| `ColorPicker.xml`  | Manifest du plugin (format natif 2 fichiers).          |
| `ColorPicker.lua`  | Code source Lua, référencé par le XML (`ComponentLua`).|
| `README.md`        | Ce fichier.                                            |

> 💡 **Après chaque modification du `.lua`** : taper **`ReloadAllPlugins`**
> (raccourci `RP`) dans la ligne de commande grandMA3. La console ne recharge
> **pas** automatiquement les fichiers Lua externes.

## Installation

> ⚠️ `ColorPicker.xml` **et** `ColorPicker.lua` ensemble dans le **même
> dossier** (le XML référence le `.lua`).

1. Copier les deux fichiers dans le dossier plugins :
   - onPC (Mac) : `~/MALightingTechnology/gma3_library/datapools/plugins/`
   - onPC (Windows) : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`
   - via USB : `gma3_library/datapools/plugins/`
2. Console : pool **Plugins** → case vide → **Import** → `ColorPicker`.

## Configuration (fenêtre au lancement)

| Champ                | Défaut  | Description                                        |
|----------------------|---------|----------------------------------------------------|
| Groupes              | *(vide)*| `1 Thru 8`, … Vide = **auto-détection** des groupes.|
| Machines             | *(vide)*| Si aucun groupe : fixtures (vide = auto, max 12).   |
| Nb couleurs          | `10`    | Couleurs principales (max 12).                      |
| Fade couleur (s)     | `1`     | Fondu au changement de couleur.                     |
| Fade arrêt (s)       | `2`     | Fondu au relâché.                                   |
| ID de départ         | `101`   | Début de numérotation (seq / macro / appearance).   |
| Layout (No)          | `1`     | Numéro du Layout généré.                             |

## Palette (12, 10 utilisées par défaut)

`Red · Orange · Yellow · Green · Cyan · Blue · Violet · Magenta · Pink ·
White` (+ `Amber · Warm` à 12).

## Notes techniques

- Cues écrites via `ColorRGB_R/G/B` (%) — la console convertit vers les
  autres systèmes de couleur (RGBW, CMY…).
- Tuiles colorées : objets **Appearance** (`BackR/G/B`, 0–255) assignés aux
  séquences par `Assign Appearance N At Sequence M` — les éléments de layout
  affichent l'appearance de l'objet assigné (comportement natif).
- Placement layout (mécanisme validé sur console) : handle
  `DataPool().Layouts[n]` récupéré une seule fois, dernier enfant après
  chaque `Assign … At Layout`, `posx/posy/positionw/positionh`, échelle
  native auto-mesurée, coordonnées ≥ 0, petit écart entre cases.
- Timings (`CueInFade`, `OffFade`, `OffWhenOverridden`) posés en
  best-effort (commande `Set … Property` + handle) — sans effet de bord si
  le build les nomme autrement.

## Nettoyage

```
Delete Sequence 101 Thru …    (plages exactes affichées au bilan)
Delete Macro 101 Thru …
Delete Appearance 101 Thru …
Delete Layout 1
```
