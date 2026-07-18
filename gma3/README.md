# Color Picker LIVE — Plugin grandMA3 (v2.x)

Un **color picker de busking** : chaque tuile couleur est une **mini-séquence**
posée sur le layout. Taper = la couleur part **en restitution** (LTP), avec un
fondu, **sans jamais toucher au programmer**. C'est le pattern busking
standard de grandMA3.

```
  MACHINE           COULEURS (tuiles colorées, tappables) →
[   ALL      ]   [Red][Orange][Yellow][Green][Cyan][Blue]...[White]
[ Fixture 1  ]   [Red][Orange][Yellow][Green][Cyan][Blue]...[White]
[ Fixture 2  ]   [Red][Orange][Yellow][Green][Cyan][Blue]...[White]
[Off All] [Highlight] [Full]
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
- **Outils** : `Off All` (tout relâcher), `Highlight`, `Full`.
- **Rangées FADE** en bas du layout :
  - `FADE couleur` → `0s · 0.5s · 1s · 2s · 3s · 4s` : fondu **entre les
    couleurs** (et au lancement). Taper une valeur la règle pour tout le board.
  - `FADE arrêt` → mêmes valeurs : fondu au **relâché** (off).

## Le workflow live

1. (Il faut de l'intensité pour voir la couleur : ton show, ou `Full`.)
2. Tape une tuile → la ligne passe à cette couleur (fondu).
3. Autre tuile de la même ligne → la couleur change, l'ancienne se
   relâche toute seule.
4. `Off All` → tout se relâche (fondu d'arrêt). **Zéro programmer.**

## Objets créés (à partir de l'ID de départ, défaut 101)

| Pool        | Contenu                                            |
|-------------|----------------------------------------------------|
| Appearances | 1 par couleur + 1 sombre (`CP Red`, `CP Dark`, …)  |
| Sequences   | 1 par (ligne × couleur), label `<machine> <couleur>` |
| Macros      | `Off All`, `Highlight`, `Full`, `ALL` (4 en tout)  |

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
