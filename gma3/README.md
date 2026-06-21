# Color Board — Plugin grandMA3 (v2.x)

Plugin Lua qui construit une **table de couleurs** dans un Layout grandMA3,
pensée pour **peindre des tableaux** (looks) — donner une couleur différente
à chaque groupe / machine — au lieu de mettre une seule couleur partout.

```
┌─────────────────────────────────────────────────────────┐
│  GROUPES                                                  │
│  [G1] [G2] [G3] [G4] [G5] [G6] [G7] [G8]    ← sélection   │
│                                                           │
│  MACHINES (option)                                        │
│  [1] [2] [3] [4] [5] [6] [7] [8] ...                      │
│                                                           │
│  COULEURS                                                 │
│  [Red][Orange][Yellow][Green][Cyan][Blue][Violet]...      │
│                                                           │
│  OUTILS                                                   │
│  [Clear] [All] [Highlight] [Full]                         │
└─────────────────────────────────────────────────────────┘
```

## Le workflow

1. Tape un **Groupe** (ou une **Machine**, ou **All**) → ça sélectionne.
2. Tape une **Couleur** → elle s'applique à la sélection.
3. Passe au groupe suivant, autre couleur… tu **construis ton tableau**
   multicolore dans le programmer.
4. **Store** le programmer en cue / preset quand le look te plaît.

`All` sélectionne toutes les machines (pour tout colorer d'un coup),
`Clear` vide le programmer.

## Ce qui est généré

- **Groupes** : tes groupes de machines, posés sur le layout. Vide dans la
  config = **auto-détection** des groupes existants (change ton patch, le
  board suit).
- **Machines** (optionnel) : des fixtures une à une, pour choisir **par
  machine**.
- **Palette de couleurs principales** : une dizaine de couleurs (max 12),
  chacune un **preset couleur universel** — non lié à une machine, s'applique
  à n'importe quelle sélection (RGB, RGBW, RGBA, CMY…).
- **Outils** : macros **Clear / All / Highlight / Full** — persistantes et
  éditables.
- **Sécurité anti-écrasement** : si la plage de presets/macros est déjà
  occupée, le plugin **demande** avant d'écraser et regénérer.
- Layout thémé sombre + **appearance** sur chaque preset.

## Fichiers

| Fichier            | Rôle                                                   |
|--------------------|--------------------------------------------------------|
| `ColorPicker.xml`  | Manifest du plugin (format natif 2 fichiers).          |
| `ColorPicker.lua`  | Code source Lua, référencé par le XML (`ComponentLua`).|
| `README.md`        | Ce fichier.                                            |

> 💡 **Après chaque modification du `.lua`** : taper **`ReloadAllPlugins`**
> (raccourci `RP`) dans la ligne de commande grandMA3. La console ne recharge
> **pas** automatiquement les fichiers Lua externes — sans ça tu continues
> d'exécuter l'ancienne version en cache.

## Installation

> ⚠️ **Deux fichiers obligatoires** : `ColorPicker.xml` **et** `ColorPicker.lua`
> doivent être ensemble dans le **même dossier**. Le XML référence le `.lua`
> (`FileName="ColorPicker.lua"`) — c'est le format natif de grandMA3.

1. Copier **les deux fichiers** dans le dossier plugins :
   - onPC (Mac) : `~/MALightingTechnology/gma3_library/datapools/plugins/`
   - onPC (Windows) : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`
   - via USB : `gma3/library/datapools/plugins/`
2. Console : pool **Plugins** → emplacement vide → **Import** →
   choisir `ColorPicker` (il charge automatiquement le `.lua` à côté).

## Utilisation

1. Lancer le plugin.
2. Remplir la fenêtre de configuration :

   | Champ                       | Défaut       | Description                                       |
   |-----------------------------|--------------|---------------------------------------------------|
   | Groupes                     | *(vide)*     | `1 Thru 8`, `1 + 3`, … Vide = auto-détection.      |
   | Machines (par fixture)      | *(vide)*     | Fixtures une à une, ex. `1 Thru 12`. Vide = aucune.|
   | Nb couleurs                 | `10`         | Nombre de couleurs principales (max 12).           |
   | Preset départ (ID)          | `1`          | Premier ID de preset couleur.                      |
   | Layout (No)                 | `1`          | Numéro du Layout généré.                            |
   | Universel (1/0)             | `1`          | `1` = presets universels (recommandé).             |
   | Boutons utilitaires (1/0)   | `1`          | `1` = ajoute Clear/All/Highlight/Full.             |
   | Macro départ (ID)           | `1`          | Premier ID de macro pour les boutons.              |

   > Si la plage de presets **ou de macros** est déjà occupée, une fenêtre
   > demande confirmation **« Écraser »** avant de regénérer.

3. **Générer**, puis ouvrir le **Layout View** sur le numéro choisi.

## Palette par défaut (12 couleurs, 10 utilisées)

`Red · Orange · Yellow · Green · Cyan · Blue · Violet · Magenta · Pink ·
White` — puis `Amber · Warm` si tu montes à 12.

## Notes techniques

- Couleurs écrites via `ColorRGB_R/G/B` (en %) puis `Store Preset 4.x` ;
  grandMA3 convertit automatiquement vers les autres systèmes de couleur.
- Placement layout : handle `DataPool().Layouts[n]` récupéré **une seule
  fois**, puis après chaque `Assign … At Layout` on prend `layout[#layout]`
  et on règle position/taille (`posx/posy/positionw/positionh` +
  `:Set("PositionX"/"PositionY"/"DimensionW"/"DimensionH")`, sous `pcall`).
- **Coordonnées ≥ 0 obligatoires** : les positions de layout sont des
  entiers non signés (`-5` → `65531` = hors champ). La grille part de `(0,0)`.
- **Échelle auto-mesurée** : la taille native du premier élément assigné sert
  de pas de grille → visible quelle que soit l'unité interne du layout.

## Nettoyage

```
Delete Preset 4.1 Thru   (adapter à la plage générée)
Delete Macro 1 Thru 4    (adapter à la plage générée)
Delete Layout 1          (adapter le numéro)
```
