# Color Picker — Plugin grandMA3 (v2.x)

Plugin Lua qui construit un **color picker complet et soigné** dans un
Layout grandMA3, en un clic.

```
┌───────────────────────────────────────────────┐
│  ● ● ● ● ● ● ● ●        ← les SPOTS (live)      │
│                                                │
│  ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦   tints (clair)       │
│  ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦                        │
│  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■   teintes PURES         │
│  ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦                        │
│  ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦   shades (foncé)       │
│                                                │
│  ◻ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ▦ ◼   rampe de GRIS         │
│                                                │
│  [Clear] [White] [Full] [Highlight]  ← BOUTONS │
└───────────────────────────────────────────────┘
```

## Ce qui est généré

- **Les spots en haut** : les fixtures choisies sont posées sur le layout.
  Elles **affichent leur couleur en live** — tape un swatch et elles
  changent immédiatement de couleur.
- **Le nuancier** : pour chaque teinte, une colonne avec des nuances
  claires (*tints*) en haut, la **couleur pure** au milieu, des nuances
  foncées (*shades*) en bas — façon nuancier Photoshop.
- **Une rampe de gris** blanc → noir.
- **Des boutons utilitaires** (optionnels) sous le nuancier : **Clear**
  (vide le programmateur), **White** (sélection en blanc plein), **Full**
  (dimmer à 100 %), **Highlight**. Ce sont de vraies **macros** — donc
  persistantes et éditables si une commande diffère sur ta version.
- Chaque case est un **preset couleur universel**, donc **non lié à une
  machine** : la couleur est générique et s'applique à **n'importe quelle
  sélection**, quel que soit le système de couleur (RGB, RGBW, RGBA, CMY…).
- **Sécurité anti-écrasement** : avant d'écrire, le plugin vérifie si des
  presets existent déjà dans la plage ciblée. Si oui, il **demande**
  s'il faut tout écraser et regénérer à neuf ; sinon il génère directement.
- Le **Layout est thémé** (couleur sombre) et chaque preset reçoit son
  **appearance** pour un rendu propre.

## Fichiers

| Fichier            | Rôle                                                   |
|--------------------|--------------------------------------------------------|
| `ColorPicker.xml`  | Plugin prêt à importer (Lua embarqué).                 |
| `ColorPicker.lua`  | Code source Lua, lisible / modifiable.                 |
| `README.md`        | Ce fichier.                                            |

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
   | Spots (optionnel)           | `1 Thru 8`   | Fixtures posées sur le layout (couleur live). Vide = pas de spots. |
   | Teintes (colonnes)          | `12`         | Nombre de teintes réparties sur 360°.             |
   | Niveaux par teinte          | `5`          | Hauteur de chaque colonne (tints + pure + shades). |
   | Preset départ (ID)          | `1`          | Premier ID de preset couleur.                     |
   | Layout (No)                 | `1`          | Numéro du Layout généré.                           |
   | Universel (1/0)             | `1`          | `1` = presets universels (non liés aux machines). `0` = presets normaux. |
   | Boutons utilitaires (1/0)   | `1`          | `1` = ajoute les macros Clear/White/Full/Highlight. `0` = aucun bouton. |
   | Macro départ (ID)           | `1`          | Premier ID de macro pour les boutons.             |

   > Si la plage de presets **ou de macros** est déjà occupée, une fenêtre
   > demande confirmation **« Écraser »** avant de regénérer à neuf.

3. **Générer**. Un récapitulatif s'affiche.

Ouvrir le **Layout View** sur le numéro choisi : sélectionner des
fixtures (ou utiliser les spots affichés) puis taper un swatch applique
la couleur. Les spots du haut reflètent la sortie en temps réel.

> Le champ *Fixtures* accepte `1 Thru 8`, `1 + 3 + 5`, ou un mélange
> `1 Thru 4 + 9`. Laisser vide pour utiliser la sélection courante
> (les spots ne seront alors pas posés sur le layout).

## Notes techniques

- Couleurs écrites via `ColorRGB_R/G/B` (en %) puis `Store Preset 4.x` ;
  grandMA3 convertit automatiquement vers les autres systèmes de couleur.
- Placement layout via l'API objet (`ObjectList`, `Layout:Append`),
  protégé par `pcall` : en cas d'écart d'API selon le build, les presets
  restent créés et le message final l'indique.
- Le fond de layout est tenté via des propriétés d'objet (sans danger si
  ignorées) ; la couleur d'identité du tile de layout est posée via
  `Appearance Layout`.

## Nettoyage

```
Delete Preset 4.1 Thru   (adapter à la plage générée)
Delete Layout 1          (adapter le numéro)
```
