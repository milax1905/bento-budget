# Color Picker LIVE — Plugin grandMA3 (v2.x)

Un **color picker de busking** : un board de layout où **chaque case est une
macro** qui lance une mini-séquence **en restitution** (LTP) avec un fondu,
**sans jamais toucher au programmer**.

```
┌──────────────────────────────────────────────────────────────┐
│                  C O L O R   P I C K E R                     │
│ [ ALL  ] [Red][Orange][Amber][Yellow]…[White]                │
│ [ SPOT ] [Red][Orange]…[White]  [J>C][C>J][E>I][I>E][1/2]    │
│ [ WASH ] [Red][Orange]…[White]  [J>C][C>J][E>I][I>E][1/2]    │
│ [════════════ Off All (barre rouge) ════════════]            │
│ [FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]                 │
│ [FADE arrêt 2s  ] [0][0.5][1][2][3][4]                       │
│ [FX C1 Red      ] [○][○][●][○]…  (pastilles couleur)         │
│ [FX C2 Blue     ] [○][○][○][●]…                              │
│ [FX FONDU 1s    ] [FX 0][FX 0.2][FX 0.5][FX 1][FX 2]         │
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

- **Case de gauche** = le vrai groupe (ou la machine) : on y voit sa **couleur
  live**, mais elle est **inerte** (`Action = None`) — la taper ne sélectionne
  rien, pour qu'un coup de pouce en plein show ne charge pas le programmer.
  Icônes et barres masquées : juste le nom.
- **Tuiles couleur** : contour néon au repos, **remplies** quand elles jouent.
  `Off When Overridden` relâche la couleur précédente toute seule.
- **Presets couleur universels** (pool Color 4, IDs `4.101`+) : les cues les
  **référencent** → modifie un preset (ton rouge, ton ambre…) et **tout le
  board suit**. S'ils existent déjà ils sont **réutilisés**, jamais effacés.
- **Bloc FX — 5 formes d'effet par ligne de groupe** :

  | Tuile | Effet                                                        |
  |-------|--------------------------------------------------------------|
  | `J>C` | balayage **jardin → cour**                                    |
  | `C>J` | balayage **cour → jardin**                                    |
  | `E>I` | **extérieur → intérieur** : les bords partent, le centre suit |
  | `I>E` | **intérieur → extérieur** : le centre part, les bords suivent |
  | `1/2` | **damier** : une machine sur deux en C1, l'autre moitié en C2, et elles **échangent** à chaque cue |

  - Chaque forme est une séquence à **2 cues** (`At Preset` slot C1, puis
    slot C2) en *TrigType Follow* + *WrapAround* → **boucle infinie**.
  - Les quatre balayages posent un **delay individuel** machine par machine
    (`Delay <t>` sur chaque fixture, dans l'ordre du groupe) : même couleur
    pour tout le monde, décalée dans le temps.
  - Le damier `1/2` ne **balaie** pas : il met directement les deux couleurs
    dans la **même cue**, une machine sur deux, et la cue suivante les
    inverse. Les deux moitiés sont donc toujours en couleurs opposées (le
    vrai déphasage, pas une approximation par le temps). Il porte un délai
    **uniforme** — même valeur pour tout le monde, donc aucun décalage
    visible — qui sert seulement à donner une **durée** à la cue.
  - **`FX C1` / `FX C2`** : deux rangées de pastilles pour choisir les deux
    couleurs de la boucle. `Copy Preset … /Merge` dans deux presets *slots*
    **référencés par les cues** → la boucle change de couleurs **en direct**,
    même en cours de route.
  - **`FX FONDU`** (dernière rangée) : la **transition** entre les deux
    couleurs de la boucle. `FX 0` = **passage sec**, façon `1 1 1 1` ;
    les autres valeurs fondent d'une couleur à l'autre. Ça réécrit le
    `CueInFade` des cues FX — donc ça marche **en cours de boucle**.
  - Le **battement** (la vitesse de la boucle) vient des délais, qui sont
    figés à la génération : `Options > Vitesse FX / battement (s)`,
    1 s par défaut.
  - **Arrêter un FX** : taper une couleur de la ligne, taper un autre sens,
    ou `Off All`.
  - **Groupes imbriqués gérés** : le plugin relève les machines de chaque
    groupe à la génération et sait donc qui recouvre qui. Taper une couleur
    sur `SPOT` coupe aussi la boucle d'un `GENERAL` qui contient les spots —
    sinon elle reprendrait la couleur à sa cue suivante. Quand il ne peut pas
    énumérer un groupe, il coupe **toutes** les boucles (prudent plutôt que
    joli).
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
  - `FADE arrêt` → réécrit la commande du bouton `Off All` (`Off … Fade X`).
    C'est **là** que vit le fondu d'arrêt : `OffFade` n'existe pas comme
    propriété de séquence (voir Notes techniques).
  - Le bouton actif est **surligné** et le titre affiche la valeur courante.
- **`Off All`** relâche tout (avec le fondu d'arrêt) **et** remet toutes les
  cases au repos. C'est aussi le **bouton de resynchro** : si l'affichage des
  cases te semble faux (par exemple après avoir rechargé le show — les cases
  sont des données sauvegardées, les restitutions non), un `Off All` remet
  tout d'aplomb.
- **Après un repatch ou une modif de groupe** : régénère le board. Les cues
  contiennent les machines telles qu'elles étaient à la génération.

## Le workflow live

1. (Il faut de l'intensité pour voir la couleur : ton show, ou `Full`.)
2. Tape une tuile → la ligne passe à cette couleur (fondu), la tuile se remplit.
3. Autre tuile de la même ligne → la couleur change, l'ancienne se relâche.
4. Tape une forme de FX sur une ligne de groupe (`J>C`, `C>J`, `E>I`, `I>E`,
   `1/2`) → boucle 2 couleurs sur le groupe. Change `C1`/`C2` en bas quand
   tu veux, même en cours de boucle.
5. `Off All` → tout se relâche. **Zéro programmer.**

## Objets créés (à partir de l'ID de départ, défaut 101)

| Pool        | Contenu                                                        |
|-------------|----------------------------------------------------------------|
| Appearances | 2 par couleur (active/repos) + 6 utilitaires                   |
| Sequences   | 1 par (ligne × couleur) + **5 par groupe** (les 5 formes de FX)|
| Macros      | toutes les cases du board : tuiles couleur, tuiles FX, `Off All`, en-têtes, rangées FADE, pastilles C1/C2 |
| Images      | tuiles néon générées : 1 contour + 1 plein par couleur + 4      |
| Presets 4.x | couleurs universelles + 2 slots FX (**jamais effacés**)         |

**Une seule confirmation, jamais une par objet** : toutes les commandes du
plugin portent `/NoConfirmation` (l'option a été **renommée en v1.9** —
`/NoConfirm` ne suffit plus, et `Import Image` / `Copy Preset` en avaient
besoin aussi, sinon la console redemandait à chaque image). Les slots
d'images sont vidés avant import pour la même raison. Le seul dialogue est
celui du plugin, au début.

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
| Vitesse FX (s)       | `1`     | Battement de la boucle FX / étalement du balayage.  |
| ID de départ         | `101`   | Début de numérotation (seq / macro / appearance).   |
| Layout (No)          | `1`     | Numéro du Layout généré.                            |

La virgule décimale est acceptée (`0,5` = `0.5`).

## Palette (12, toutes utilisées par défaut)

`Red · Orange · Amber · Yellow · Green · Cyan · Azure · Blue · Violet ·
Magenta · Pink · White`

## Notes techniques

Points vérifiés dans le manuel MA3 2.3/2.4 (et sur du vrai code de plugins),
parce que chacun était un échec silencieux dans les versions précédentes :

- **Tap d'une case de layout** : la propriété s'appelle **`Action`**
  (`Go+`, `Toggle`, `Select`, `None`…). `PlaybackFunction` / `Function`
  **n'existent pas** — les poser ne faisait rien. Le défaut est
  `<Layout Default>`, qui dépend du profil utilisateur : le plugin pose donc
  `Action = "Go+"` explicitement sur chaque case de macro.
- **Pourquoi une tuile-séquence ne se remplissait jamais** : un élément de
  layout affiche l'appearance de la **séquence**, pas celle de la cue active,
  sauf si le réglage de séquence **`PreferCueAppearance`** est activé (il est
  **Off** par défaut). D'où le passage à un board 100 % macros, où l'image de
  l'appearance est réellement rendue.
- **`Goto` n'enchaîne pas les cues `Follow`** — seul **`Go+`** déclenche les
  cues suivantes en follow/timed. Les boucles FX partent donc en `Go+` ; les
  couleurs (une seule cue) partent en `Goto … Fade …`, qui accepte
  officiellement l'option `Fade`.
- **`Go+` avance d'une cue** si la séquence tourne déjà → chaque tuile FX fait
  d'abord un `Off` des 3 sens de sa ligne.
- **`ImageMode`** de l'appearance : `Bar` (image entière, aspect conservé)
  plutôt que `Stretch` (le défaut, qui déformerait les coins arrondis).
- **Balayage FX** : `Delay <t>` en mot-clé de départ pose un délai
  **individuel** sur la sélection courante, et le programmer **accumule** les
  machines — d'où la construction machine par machine (elle permet aussi de
  donner une couleur différente à une machine sur deux pour le damier).
  `Delay 0 Thru 1 Thru 0` (fan symétrique multi-points) est du **MA2**,
  invalide en MA3 : les formes symétriques sont calculées en Lua.
- **`SelectionFirst()` / `SelectionNext()`** renvoient un **index de
  subfixture**, pas un numéro de machine : conversion obligatoire par
  `GetSubfixture(idx).FID` (ou l'adresse de cellule).
- Les délais individuels rallongent la **Duration** de la cue, et un trigger
  `Follow` attend la Duration complète → le balayage a le temps de finir avant
  la cue suivante.
- Cues écrites via `ColorRGB_R/G/B` (%) **puis** `At Preset 4.x` — la cue est
  liée au preset ; la console convertit vers les autres systèmes de couleur
  (RGBW, CMY…).
- ⚠️ **`OffFade` n'est PAS une propriété de séquence** sur 2.5 : chaque
  `Set Sequence X Property "OffFade"` produisait une notification rouge
  *Illegal property* — une par séquence à la génération, et **48 par appui**
  sur un bouton `FADE arrêt`, en plein show. Supprimé : le fondu d'arrêt est
  porté par le `Fade` de la commande `Off`, qui lui est valide.
- Le damier `1/2` porte un **délai uniforme** égal au battement. Sans lui, un
  `FX FONDU 0` donnerait une cue de durée nulle et la boucle s'emballerait.
- Trigger de cue : propriété **`TrigType`** (valeur `Follow`, sensible à la
  casse) — pas `Trigger`. Boucle = les 2 cues en `Follow` + `WrapAround`.
  ⚠️ `WrapAround` est **désactivé automatiquement si l'`OffCue` a un
  trigger** — le plugin n'y touche pas, mais c'est le premier truc à vérifier
  si une boucle s'arrête après un tour.
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
