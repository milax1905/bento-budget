# Color Picker LIVE — Plugin grandMA3 (v2.x)

Un **color picker de busking** : un board de layout où **chaque case est une
macro** qui lance une mini-séquence **en restitution** (LTP) avec un fondu,
**sans jamais toucher au programmer**.

```
┌──────────────────────────────────────────────────────────────┐
│                  C O L O R   P I C K E R                     │
│ [ ALL  ] [Red][Orange][Amber][Yellow]…[White]                │
│ [ SPOT ] [Red][Orange][Amber][Yellow]…[White]  [J>C][C>J][SYM]│
│ [ WASH ] [Red][Orange][Amber][Yellow]…[White]  [J>C][C>J][SYM]│
│ [════════════ Off All (barre rouge) ════════════]            │
│ [FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]                 │
│ [FADE arrêt 2s  ] [0][0.5][1][2][3][4]                       │
│ [FX C1 Red      ] [○][○][●][○]…  (pastilles couleur)         │
│ [FX C2 Blue     ] [○][○][○][●]…                              │
└──────────────────────────────────────────────────────────────┘
```

## Pourquoi tout est en macros (v7)

Une tuile qui pointe une **séquence** ne peut pas « se remplir » proprement :
la console n'utilise que la **couleur de fond** de l'appearance de cue et
ignore son image → on obtenait une **case pleine rectangulaire** (moche), ou
rien du tout. Une tuile qui pointe une **macro** affiche, elle, l'**image**
de son appearance — c'est ce qui marche déjà pour les pastilles `FX C1/C2`.

Donc chaque case du board est une macro qui, en une frappe :

1. **lance la séquence** de sa couleur en restitution
   (`Goto Sequence … Cue 1 Fade …`),
2. **coupe le FX** de sa ligne (la ligne `ALL` coupe tous les FX),
3. **repeint la ligne** : la case tapée passe en **pavé arrondi plein**, les
   autres redeviennent des **contours** (vrai comportement radio, visible).

## Ce que fait le board

- **Case de gauche** = le vrai groupe (ou la machine) : la taper **sélectionne**
  la machine (seule action du board qui touche le programmer, et elle est
  volontaire). Icônes et barres masquées : juste le nom.
- **Tuiles couleur** : contour néon au repos, **remplies** quand elles jouent.
  `Off When Overridden` relâche la couleur précédente toute seule.
- **Presets couleur universels** (pool Color 4, IDs `4.101`+) : les cues les
  **référencent** → modifie un preset (ton rouge, ton ambre…) et **tout le
  board suit**. S'ils existent déjà ils sont **réutilisés**, jamais effacés.
- **Bloc FX — 3 sens de balayage par ligne de groupe** :
  - `J>C` **jardin → cour**, `C>J` **cour → jardin**, `SYM` **symétrique**.
  - Chaque sens est une séquence à **2 cues** (`At Preset` slot C1, puis slot
    C2) en *TrigType Follow* + *WrapAround* → **boucle infinie**, avec un
    **delay individuel réparti sur le groupe** (`Delay 0 Thru 1`,
    `Delay 1 Thru 0`, `Delay 0 Thru 1 Thru 0`) qui donne le balayage.
  - **`FX C1` / `FX C2`** : deux rangées de pastilles pour choisir les deux
    couleurs de la boucle. `Copy Preset … /Merge` dans deux presets *slots*
    **référencés par les cues** → la boucle change de couleurs **en direct**,
    même en cours de route.
  - **Arrêter un FX** : taper une couleur de la ligne, taper un autre sens,
    ou `Off All`.
  - ⚠️ Les lignes doivent être des groupes **disjoints** : une machine
    présente dans deux groupes se fera reprendre par la boucle de l'autre
    ligne (chaque tuile ne coupe que le FX de SA ligne).
- **Tuiles néon générées** : le plugin **fabrique lui-même** ses images PNG
  (pur Lua, zéro fichier à copier), les écrit dans la *User Image Library*,
  les importe dans le pool Images et les pose sur les appearances : **contour
  arrondi** au repos, **pavé arrondi plein** en actif. Le fond de l'appearance
  passe en alpha 0 **seulement si l'image est bien en place** (sinon on garde
  un aplat de couleur comme repli visible). Icône, barre-témoin et bordure des
  cases : masquées.
- **Rangées FADE** :
  - `FADE couleur` → `0s · 0.5s · 1s · 2s · 3s · 4s` : réécrit la ligne 1
    (le `Goto`) de **toutes** les tuiles couleur.
  - `FADE arrêt` → réécrit la commande du bouton `Off All` et le `OffFade`
    de chaque séquence.
  - Le bouton actif est **surligné** et le titre affiche la valeur courante.
- **`Off All`** relâche tout (avec le fondu d'arrêt) **et** remet toutes les
  cases au repos.

## Le workflow live

1. (Il faut de l'intensité pour voir la couleur : ton show, ou `Full`.)
2. Tape une tuile → la ligne passe à cette couleur (fondu), la tuile se remplit.
3. Autre tuile de la même ligne → la couleur change, l'ancienne se relâche.
4. Tape `J>C`, `C>J` ou `SYM` sur une ligne de groupe → boucle 2 couleurs qui
   balaie le groupe. Change `C1`/`C2` en bas quand tu veux.
5. `Off All` → tout se relâche. **Zéro programmer.**

## Objets créés (à partir de l'ID de départ, défaut 101)

| Pool        | Contenu                                                        |
|-------------|----------------------------------------------------------------|
| Appearances | 2 par couleur (active/repos) + 6 utilitaires                   |
| Sequences   | 1 par (ligne × couleur) + **3 par groupe** (les 3 sens de FX)  |
| Macros      | toutes les cases du board : tuiles couleur, tuiles FX, `Off All`, en-têtes, rangées FADE, pastilles C1/C2 |
| Images      | tuiles néon générées : 1 contour + 1 plein par couleur + 4      |
| Presets 4.x | couleurs universelles + 2 slots FX (**jamais effacés**)         |

Les pools 1–100 ne sont pas touchés. Si une plage est occupée, le plugin
**demande confirmation** avant d'écraser — et le nettoyage couvre des
**plages larges** (l'empreinte max possible, versions précédentes du plugin
comprises), pour qu'une régénération plus petite ne laisse jamais d'orphelins
(labels `#2`, boucles FX fantômes). Les numéros de slots (presets FX, images,
appearances) sont **stables** quel que soit le nombre de couleurs choisi.

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
| Groupes              | *(vide)*| `1 Thru 8`, … Vide = **auto-détection** (max 12).   |
| Machines             | *(vide)*| Si aucun groupe : fixtures (vide = auto, max 12).   |
| Nb couleurs          | `12`    | Couleurs principales (max 12).                      |
| Fade couleur (s)     | `1`     | Fondu au changement de couleur.                     |
| Fade arrêt (s)       | `2`     | Fondu au relâché.                                   |
| ID de départ         | `101`   | Début de numérotation (seq / macro / appearance).   |
| Layout (No)          | `1`     | Numéro du Layout généré.                            |

La virgule décimale est acceptée (`0,5` = `0.5`).

## Palette (12, toutes utilisées par défaut)

`Red · Orange · Amber · Yellow · Green · Cyan · Azure · Blue · Violet ·
Magenta · Pink · White`

## Notes techniques

- Cues écrites via `ColorRGB_R/G/B` (%) **puis** `At Preset 4.x` — la cue est
  liée au preset ; la console convertit vers les autres systèmes de couleur
  (RGBW, CMY…).
- Trigger de cue : propriété **`TrigType`** (valeur `Follow`, sensible à la
  casse) — pas `Trigger`. Boucle = les 2 cues en `Follow` + `WrapAround`.
- Fade de cue écrit à la fois en commande cue-level et sur le handle
  **`Part 0`** (le modèle MA3 y range les temps).
- Placement layout (mécanisme validé sur console) : handle
  `DataPool().Layouts[n]` récupéré une seule fois, dernier enfant après chaque
  `Assign … At Layout`, `posx/posy/positionw/positionh`, échelle native
  auto-mesurée, coordonnées ≥ 0, l'axe Y est inversé en fin de construction.
- Génération : elle **utilise** le programmer (impossible autrement pour
  stocker des cues), mais seulement **après ta confirmation**, et elle le
  rend propre (`ClearAll`) à la fin. À faire avant le show, pas pendant.

## Nettoyage

```
Delete Sequence 101 Thru …    (plages exactes affichées au bilan)
Delete Macro 101 Thru …
Delete Appearance 101 Thru …
Delete Image 3.101 Thru 3.…
Delete Layout 1
```
