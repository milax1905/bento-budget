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
  board suit**. S'ils existent déjà ils sont **réutilisés**, jamais effacés —
  **à une condition** : que leur **label** corresponde à la couleur attendue.
  Un preset qui s'appelle encore `Yellow` là où le plugin attend `Amber` vient
  d'une **ancienne palette** : la tuile afficherait une couleur et en jouerait
  une autre. Ces presets-là sont **remis à la couleur du plugin** (et signalés
  dans la confirmation). Retoucher la teinte d'un preset en gardant son nom
  reste parfaitement sûr.
- **Bloc FX — 5 formes d'effet par ligne de groupe** :

  | Tuile | Effet                                                        |
  |-------|--------------------------------------------------------------|
  | `J>C` | balayage **jardin → cour**                                    |
  | `C>J` | balayage **cour → jardin**                                    |
  | `E>I` | **extérieur → intérieur** : les bords partent, le centre suit |
  | `I>E` | **intérieur → extérieur** : le centre part, les bords suivent |
  | `1/2` | **damier** : une machine sur deux en C1, l'autre moitié en C2, et elles **échangent** à chaque cue |

  - **Moteur par défaut : phaser piloté par un Speed Master.** Chaque forme
    est **une cue** contenant une *recette de phaser* : le groupe, deux pas
    (les presets slots C1/C2) et la **phase répartie le long du groupe**
    (`PhaseX '0 Thru 360'` = le balayage ; `XWings 2` = symétrique ;
    `XGroup 2` = une machine sur deux). La vitesse suit le **Speed Master**
    choisi à l'écran dédié (défaut 1) : tu la règles **en live**
    au fader, à l'encodeur, ou en ligne de commande
    (`Master 3.1 At BPM 120`, ou `At Hz 2`, ou `At Seconds 0.5`).
    Cette construction **ne touche pas au programmer**.
  - ⚠️ **Un Speed Master ne peut pas piloter autre chose qu'un phaser.** La
    propriété `SpeedMaster` d'une séquence ne s'applique qu'aux phasers
    contenus dans ses cues : l'assigner à une boucle *Follow* est accepté par
    la console et **ne fait rien**. C'est pour ça que le moteur a changé.
  - **Moteur de secours** : le bouton *Sans master* de cet écran rebascule sur
    l'ancienne construction — une séquence à **2 cues** en *TrigType Follow*
    + *WrapAround*, dont le balayage vient de **délais individuels** posés
    machine par machine. Vitesse figée à la génération, mais éprouvée.
  - *(Moteur classique uniquement)* les quatre balayages posent un **delay
    individuel** machine par machine (`Delay <t>` dans l'ordre du groupe) ;
    le damier `1/2`, lui, met les deux couleurs dans la **même cue** (une
    machine sur deux) et la cue suivante les inverse, avec un délai
    **uniforme** qui sert seulement à donner une durée à la cue.
  - **`FX C1` / `FX C2`** : deux rangées de pastilles pour choisir les deux
    couleurs de la boucle. `Copy Preset … /Overwrite` dans deux presets
    *slots* **référencés par les cues** (ou par les pas du phaser) → la
    boucle change de couleurs **en direct**, même en cours de route.
  - **La vitesse est un FADER, pas des boutons.** Au lancement, un écran
    dédié demande **quel Speed Master** pilote les FX (`1`–`15` = `Speed1`…
    `Speed15`, `16` = `BPM` qui suit l'entrée son, ou *Sans master*). Tous
    les effets suivent ensuite ce seul master. Pour l'avoir sous la main :
    `Assign Master 3.1 At Page 1.201` (ou via la fenêtre *Assign*). En
    ligne de commande : `Master 3.1 At BPM 120`, `At Hz 2`, `At Seconds 0.5`.
    Le board n'a donc **aucune** rangée de vitesse en mode phaser.
  - **Dernière rangée : le passage d'une couleur FX à l'autre**, de *sec* à
    *smooth*. Même rangée, même place, mais chaque moteur a son propre
    réglage — un phaser n'a pas de « fondu de cue » entre ses deux couleurs.

    | Moteur | Rangée | Ce qu'elle écrit |
    | --- | --- | --- |
    | phaser (Speed Master) | **`FX TRANSIT`** — `NET` `25%` `50%` `75%` `SMOOTH` | `Transition` des **deux pas**, en % de la durée du pas |
    | classique (*Sans master*) | **`FX FONDU`** — `FX 0` … `FX 1` | `CueInFade` des **deux cues** de la boucle |

    - **`NET` / `FX 0` (défaut)** = la couleur tient tout le pas puis
      **bascule** — le « 1 1 1 1 ». La vague se lit et **aucune couleur
      intermédiaire** n'apparaît.
    - **`SMOOTH` / `> 0`** = fondu enchaîné. ⚠️ La console interpole les
      **composantes RVB** : entre deux couleurs opposées (jaune/bleu,
      rouge/cyan) le point milieu est **gris-blanc**. Et si le fondu est
      long devant l'étalement du balayage, la moitié du groupe est en
      transition en permanence — la vague se brouille et on ne voit plus
      qu'un « tout bleu / tout blanc ». En classique, garde-le **court
      devant l'étalement** (0.1–0.2 s pour un étalement de 1 s).
    - **`25 / 50 / 75 %`** (phaser) = la couleur glisse sur le **début** du
      pas, puis tient jusqu'à la fin. C'est le juste milieu.
  - **La propriété `Transition` est SONDÉE, jamais devinée.** Sur la
    première recette construite, le plugin ouvre le pas
    (`Sequence N Cue 1 Part 0.1.'PhaserRecipeSteps'.1`), **liste** ses
    propriétés (`PropertyCount` / `PropertyName`), écrit une valeur **par le
    handle** (muet — pas de ligne de commande, donc pas de notification),
    puis vérifie qu'une écriture **en ligne de commande** — la forme que les
    boutons du board utiliseront — change bien la valeur relue. Si l'une des
    étapes échoue, **la rangée n'est pas construite du tout** : mieux vaut un
    bouton absent qu'un bouton qui sort une notification rouge en plein show.
    (C'est ce qui était arrivé avec `Set Sequence 137 Cue 2 …` : un phaser
    n'a **qu'une** cue.)
  - Les pastilles copient en **`/Overwrite`** : le slot contient **exactement**
    la couleur choisie. (En `/Merge`, tout attribut déjà dans le slot — canal
    blanc, reste d'une couleur précédente — survivait et se mélangeait :
    c'était une source de couleurs « pas demandées ».)
  - *(Moteur classique)* le **battement** vient des délais, figés à la
    génération : `Options > Vitesse FX / battement (s)`, 1 s par défaut.
    *(Moteur phaser)* le battement vient du **Speed Master**, en live.
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
>
> **Deux versions à ne pas confondre** — le plugin affiche son numéro à deux
> endroits, et ils peuvent différer :
> - le **titre du dialogue** au lancement = la version du `.lua` que la
>   console vient de charger ;
> - la **bannière du board** = la version qui a **généré** ce layout.
>
> Les boutons sont des **macros stockées dans le show** : corriger le `.lua`
> ne change rien tant que tu n'as pas **régénéré**. Si le dialogue annonce la
> bonne version mais que la bannière est en retard → régénère. Si le
> **dialogue lui-même** est en retard → la console lit encore un ancien
> fichier : refais `ReloadAllPlugins`, et au besoin supprime l'objet du pool
> Plugins puis ré-importe.

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
| Fondu FX (s)         | `0`     | Transition des boucles (moteur classique).          |
| ID de départ         | `101`   | Début de numérotation (seq / macro / appearance).   |
| Layout (No)          | `1`     | Numéro du Layout généré.                            |

La virgule décimale est acceptée (`0,5` = `0.5`).

Le **Speed Master** ne se règle pas ici : il a son **propre écran** au
lancement (1–15, 16 = BPM, ou *Sans master* pour l'ancien moteur). La
**transition** des FX, elle, se règle sur le board, en live.

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
- **Transition d'un pas de phaser** : c'est une *Step Layer* documentée
  (manuel 2.4, *Phasers*), exprimée en **% de la durée du pas** — 0 % = la
  valeur bascule net, 100 % = elle glisse pendant tout le pas. Le plugin ne
  **suppose** pas son nom : il liste les propriétés de l'objet
  (`PropertyCount` / `PropertyName`) et ne construit la rangée que si
  l'écriture par handle **et** l'écriture en ligne de commande passent
  toutes les deux. Une propriété devinée, c'est soit un no-op silencieux,
  soit une notification rouge en plein show.
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
