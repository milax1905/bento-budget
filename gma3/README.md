# Color Picker LIVE — Plugin grandMA3 (v2.x)

Un **color picker pensé pour le live** : tu tapes une couleur, ton groupe
passe à cette couleur **en restitution** (playback, LTP), avec un fondu, et
**sans jamais toucher au programmer**. Fait pour busker des couleurs proprement.

Chaque **ligne** = une cible (ALL, un groupe, ou une machine). La case de
gauche **montre la machine** (icône / faisceau + couleur en direct). Chaque
**colonne** = une couleur, en vraie **pastille colorée** (pas d'icône de macro).

```
          Red Org Yel Grn Cya Blu Vio Mag Pnk Wht   Off
[ALL]    [🟥][🟧][🟨][🟩][🟦][🟦][🟪][🟪][🟪][⬜]  [✕]
[Spot1]🔦[🟥][🟧][🟨][🟩][🟦][🟦][🟪][🟪][🟪][⬜]  [✕]   ← icône machine à gauche
[Spot2]🔦[🟥][🟧][🟨][🟩][🟦][🟦][🟪][🟪][🟪][⬜]  [✕]
[Off All] [Highlight] [Full]
```

- **Pastilles colorées** : on voit la couleur directement (appearance de fond).
- **Case de gauche** = la machine/groupe (son icône + sa couleur live).
- **Case de droite** = `Off` de la ligne. En bas : `Off All` / `Highlight` / `Full`.

## Pourquoi pas le programmer ?

Sur grandMA3, taper un preset/couleur écrit dans le **programmer** (valeurs
manuelles). En live on ne veut pas ça : il faut clear/store en permanence.
Ici chaque couleur est une **cue de séquence** jouée en `Goto` → elle part
direct en sortie (LTP), se mélange au reste du show, et ne laisse **rien**
dans le programmer. `Off` relâche.

## Comment ça marche

- **1 séquence par cible** : `All` (toutes les fixtures) + une par groupe
  détecté. Chaque séquence a **une cue par couleur**. Très peu d'objets.
- **Matrice de macros** sur le Layout :
  - **Colonne de gauche** = `Off <groupe>` (relâche ce groupe ; sert aussi
    d'étiquette de ligne).
  - **Pastilles couleur** = `Goto Sequence <groupe> Cue <couleur> Fade <t>`
    → le groupe passe à la couleur, **en live, avec fondu**.
- **Outils** : `Off All`, `Highlight`, `Full`.

> 🔆 **Intensité** : le picker ne touche **que la couleur**. Tes fixtures
> doivent avoir de l'intensité (autre playback, ou `Full`) pour qu'on voie
> la couleur. C'est volontaire — tu gardes ton dimmer indépendant.

## Le workflow live

1. (Les spots/wash sont allumés par ton show, ou tape `Full`.)
2. Tape une **pastille couleur** sur la ligne du groupe → il passe à cette
   couleur avec un fondu.
3. Autre couleur = ça refond (LTP). `Off <groupe>` = relâche ce groupe.
4. `Off All` = relâche tout. **Zéro programmer à gérer.**

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
2. Console : pool **Plugins** → emplacement vide → **Import** → `ColorPicker`.

## Configuration (fenêtre au lancement)

| Champ                       | Défaut       | Description                                       |
|-----------------------------|--------------|---------------------------------------------------|
| Groupes                     | *(vide)*     | `1 Thru 8`, … Vide = **auto-détection** des groupes.|
| Nb couleurs                 | `10`         | Couleurs principales (max 12).                     |
| Fade couleur (s)            | `1`          | Fondu au changement / lancement de couleur.        |
| Fade arrêt (s)              | `2`          | Fondu au relâché (best-effort selon le build).     |
| Preset départ (ID)          | `1`          | Premier ID de preset couleur (palette universelle).|
| Sequence départ (ID)        | `1`          | Premier ID de séquence.                            |
| Macro départ (ID)           | `1`          | Premier ID de macro.                               |
| Layout (No)                 | `1`          | Numéro du Layout généré.                            |

> **Sécurité** : si une plage de presets / séquences / macros est déjà
> occupée, le plugin **demande confirmation** avant d'écraser et regénérer.

## Palette par défaut (12, 10 utilisées)

`Red · Orange · Yellow · Green · Cyan · Blue · Violet · Magenta · Pink ·
White` (+ `Amber · Warm` si tu montes à 12).

## Notes techniques

- Les couleurs sont écrites dans les cues via `ColorRGB_R/G/B` (en %) — la
  console convertit vers les autres systèmes (RGBW, CMY…).
- Déclenchement live : `Goto Sequence X Cue Y Fade Z` (les séquences se
  jouent **sans executor**). Aucune écriture programmer.
- Placement layout (mécanisme validé sur console) : handle
  `DataPool().Layouts[n]` récupéré **une seule fois**, dernier enfant après
  chaque `Assign … At Layout`, position via `posx/posy/positionw/positionh`,
  coordonnées ≥ 0 (entiers non signés), pas de grille = taille native
  **auto-mesurée** + petit écart entre cases.
- Fond coloré des cases : une **Appearance** par couleur (`BackR/G/B`),
  assignée à l'élément de layout (best-effort — si ton build l'ignore, les
  cases restent des macros colorées fonctionnelles).
- Objets par défaut rangés à partir du **101** (séquences, macros,
  appearances) pour ne pas toucher tes objets 1–100.

## Nettoyage

```
Delete Sequence 101 Thru …    (adapter aux plages affichées au bilan)
Delete Macro 101 Thru …
Delete Appearance 101 Thru …
Delete Layout 1
```
