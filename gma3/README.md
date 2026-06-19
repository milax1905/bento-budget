# Color Picker Generator — Plugin grandMA3

Plugin Lua pour **grandMA3** (onPC & consoles, v1.9+ / v2) qui génère
automatiquement un **color picker entièrement fonctionnel** :

- une grille de **presets couleur** (Pool 4 / *Color*) construite à partir
  d'une rampe **HSV** (teintes × niveaux de luminosité + une ligne de gris) ;
- l'**appearance** (couleur d'affichage) de chaque preset, pour un rendu
  visuel correct dans le pool et le layout ;
- un **Layout** qui place tous les presets dans une grille cliquable.

Les presets couleur de grandMA3 sont stockés de façon **générique**
(= « recipe » couleur) : un appui applique la couleur à **n'importe quelle
sélection de projecteurs**, quel que soit leur système de couleur
(RGB, RGBW, RGBA, CMY…).

## Fichiers

| Fichier            | Rôle                                                        |
|--------------------|-------------------------------------------------------------|
| `ColorPicker.xml`  | Plugin prêt à importer dans la console (Lua embarqué).      |
| `ColorPicker.lua`  | Code source Lua, lisible / modifiable.                      |
| `README.md`        | Ce fichier.                                                 |

## Installation

1. Copier `ColorPicker.xml` dans le dossier des plugins :
   - **onPC / Console** : `gma3_library/datapools/plugins/`
     (ou via une clé USB : `gma3/library/datapools/plugins/`).
2. Dans la console : **Menu → Plugins** (ou pool *Plugins*).
3. Sélectionner un emplacement de plugin vide → **Import** → choisir
   `ColorPicker`.

> Alternative manuelle : créer un plugin vide, ouvrir l'éditeur Lua et
> coller le contenu de `ColorPicker.lua`.

## Utilisation

1. **Sélectionner** des projecteurs disposant d'attributs de couleur
   (ColorRGB) — par ex. `Fixture 1 Thru 10`.
2. Lancer le plugin (appui sur le bouton du pool *Plugins*).
3. Renseigner la fenêtre de configuration :

   | Champ                  | Défaut | Description                                  |
   |------------------------|--------|----------------------------------------------|
   | Teintes (colonnes)     | 12     | Nombre de teintes réparties sur 360°.        |
   | Niveaux (lignes)       | 4      | Variations de luminosité (100 % → ~25 %).    |
   | Preset départ (ID)     | 1      | Premier ID de preset couleur utilisé.        |
   | Layout (No)            | 1      | Numéro du Layout généré.                      |
   | Ligne de gris (1/0)    | 1      | Ajoute une ligne blanc → noir.               |

4. Valider **Générer**. Un récapitulatif s'affiche à la fin.

Ouvrir ensuite le **Layout View** sur le numéro choisi : la grille de
couleurs est cliquable. Sélectionner des fixtures puis taper une case
applique la couleur correspondante.

## Notes techniques

- Le plugin écrit les couleurs dans le programmer via les attributs
  `ColorRGB_R/G/B` (en %), puis `Store Preset 4.x` — grandMA3 convertit
  automatiquement vers les autres systèmes de couleur des fixtures.
- Le placement dans le layout passe par l'API objet (`ObjectList`,
  `Layout:Append`) et est protégé par `pcall` ; si une version ne le
  supporte pas, les presets restent créés et le message final l'indique
  (placement manuel possible).
- Aucune donnée existante n'est supprimée hors des emplacements ciblés
  (presets à partir de l'ID de départ + le layout choisi).

## Désinstallation / nettoyage

```
Delete Preset 4.1 Thru   (adapter la plage générée)
Delete Layout 1          (adapter le numéro)
```
