# Color Picker LIVE — plugin grandMA3 (onPC 2.5)

Un **color picker de busking** : un board de layout où **chaque case est une
macro** qui lance une mini-séquence **en restitution**, avec un fondu,
**sans jamais toucher au programmer** pendant le show.

```
┌──────────────────────────────────────────────────────────────┐
│                  C O L O R   P I C K E R   -   v8.0          │
│ [ ALL  ] [Red][Orange][Amber][Yellow]…[White]                │
│ [ SPOT ] [Red][Orange]…[White]  [J>C][C>J][E>I][I>E][1/2]    │
│ [ WASH ] [Red][Orange]…[White]  [J>C][C>J][E>I][I>E][1/2]    │
│ [════════════ Off All (barre rouge) ════════════]            │
│ [FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]                 │
│ [FADE arrêt 2s  ] [0][0.5][1][2][3][4]                       │
│ [FX C1 Red      ] [●][○][○][○]…  (pastilles couleur)         │
│ [FX C2 Blue     ] [○][○][○][●]…                              │
│ [FX FONDU 0s    ] [FX 0][FX 0.1][FX 0.2][FX 0.5][FX 1]       │
└──────────────────────────────────────────────────────────────┘
```

**v8 = uniquement ce qui a été vu marcher sur une console 2.5.0.3.** Le
moteur FX « phaser + Speed Master » des versions 7.x, jamais validé (il
produisait des erreurs et une rangée absente), a été retiré, ainsi que sa
sonde et l'outil de diagnostic qui n'existaient que pour lui.

## Ce que fait le board

- **Case de gauche** = le vrai groupe (ou la machine) : on y voit sa couleur
  live, mais elle est **inerte** (`Action = None`) — la taper ne sélectionne
  rien.
- **Tuiles couleur** : contour néon au repos, **remplies** quand elles jouent.
  Une par ligne : `Off When Overridden` relâche la précédente toute seule.
  Chaque tuile, en une frappe : lance sa séquence (`Goto … Fade …`), coupe
  les boucles FX qui touchent ses machines, repeint sa ligne (et la ligne
  `ALL`, qui n'a plus la main partout).
- **Presets couleur universels** (`Preset 4.101`+) référencés par les cues :
  modifie un preset et **tout le board suit**. Ils sont **réutilisés, jamais
  effacés** — à condition que leur **label** soit celui de la couleur
  attendue. Un label d'une autre palette (`Yellow` là où `Amber` est attendu)
  est signalé dans la confirmation et **remis à la couleur du plugin**
  (`Store … /Overwrite`), sinon la tuile jouerait une autre couleur que celle
  qu'elle affiche.
- **FX — 5 formes par ligne de groupe**, chacune une boucle C1 ↔ C2 :

  | Tuile | Effet |
  |-------|-------|
  | `J>C` | balayage **jardin → cour** |
  | `C>J` | balayage **cour → jardin** |
  | `E>I` | **extérieur → intérieur** : les bords partent, le centre suit |
  | `I>E` | **intérieur → extérieur** : le centre part, les bords suivent |
  | `1/2` | **damier** : une machine sur deux en C1, l'autre moitié en C2, elles échangent à chaque cue |

  Mécanique : une séquence à **2 cues** (`TrigType Follow` + `WrapAround`),
  cue 1 = C1, cue 2 = C2, le balayage venant de **délais individuels** posés
  machine par machine dans l'ordre du groupe. La tuile part en **`Go+`**
  (seul `Go+` enchaîne les cues Follow) après un `Off … Fade` des 5 formes
  de sa ligne (sinon le groupe retombe à sa couleur par défaut : flash).
  - **`FX C1` / `FX C2`** : les pastilles copient la couleur choisie
    (`Copy Preset … /Overwrite`) dans deux presets *slots* **référencés par
    les cues** → la boucle change de couleurs **en direct**.
  - **`FX FONDU`** (dernière rangée) : fondu entre les deux couleurs
    (`CueInFade` des deux cues). **`FX 0` (défaut) = passage sec** : chaque
    machine bascule net à son tour, aucune couleur intermédiaire. Un fondu
    `> 0` fait passer la console par le mélange RVB des deux couleurs
    (jaune + bleu = gris-blanc) : garde-le **court** devant l'étalement.
  - **Vitesse** (battement / étalement du balayage) : `Options > Vitesse FX`,
    **fixée à la génération** (1 s par défaut). La changer = régénérer.
  - **Groupes imbriqués gérés** : le plugin relève les machines de chaque
    groupe et sait qui recouvre qui. Une couleur sur `SPOT` coupe aussi la
    boucle d'un `GENERAL` qui contient les spots. S'il ne peut pas énumérer
    un groupe, il coupe **toutes** les boucles (prudent).
- **Rangées FADE** : `FADE couleur` réécrit la ligne 1 (le `Goto`) de
  **toutes** les tuiles ; `FADE arrêt` réécrit la commande d'`Off All`
  (`Off … Fade X` — c'est là que vit le fondu d'arrêt). Bouton actif surligné,
  en-tête relabellée.
- **`Off All`** : relâche tout avec le fondu d'arrêt **et** remet toutes les
  cases au repos. C'est aussi le **bouton de resynchro** si l'affichage te
  semble faux (après rechargement du show, par exemple).
- **Tuiles néon générées** : PNG fabriqués en pur Lua, écrits dans la *User
  Image Library*, importés dans le pool Images, posés sur les appearances
  (contour arrondi au repos, pavé plein en actif). Le fond passe en alpha 0
  **seulement** si l'image est en place.

## Workflow live

1. (Il faut de l'intensité pour voir la couleur.)
2. Tape une tuile → la ligne passe à cette couleur, la tuile se remplit.
3. Tape une forme FX sur une ligne de groupe → boucle C1 ↔ C2. Change
   C1 / C2 en bas quand tu veux, même en cours de boucle. `FX FONDU` règle
   sec / fondu.
4. `Off All` → tout se relâche. **Zéro programmer.**

## Objets créés (à partir de l'ID de départ, défaut 101)

| Pool        | Contenu |
|-------------|---------|
| Sequences   | 1 par (ligne × couleur) + **5 par groupe** |
| Macros      | toutes les cases : tuiles, FX, `Off All`, en-têtes, FADE, C1/C2, FX FONDU |
| Appearances | 2 par couleur + 6 utilitaires |
| Images 3.x  | 1 contour + 1 plein par couleur + 4 |
| Presets 4.x | couleurs universelles + 2 slots FX (**jamais effacés**) |
| Layout      | le board (numéro au choix, défaut 1) |

**Une seule confirmation, jamais une par objet** : toutes les commandes
portent `/NoConfirmation` (nom depuis la v1.9 ; `/NoConfirm` ne suffit plus,
`Import Image` et `Copy Preset` en ont besoin aussi). Le nettoyage couvre des
**plages larges** (l'empreinte max possible) pour qu'une régénération plus
petite ne laisse jamais d'orphelins ; les numéros de slots (presets FX,
images, appearances) sont **stables** quel que soit le nombre de couleurs.

## Installation

`ColorPicker.xml` **et** `ColorPicker.lua` ensemble dans le dossier plugins :
- onPC Mac : `~/MALightingTechnology/gma3_library/datapools/plugins/`
- onPC Windows : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`

Console : pool **Plugins** → case vide → **Import** → `ColorPicker`.

> **Après chaque modification du `.lua`** : `ReloadAllPlugins` (`RP`). La
> console met les `.lua` externes en cache. Le plugin affiche sa version au
> lancement (= le fichier chargé) **et** dans la bannière du board (= la
> version qui a généré ce layout) : si elles diffèrent, régénère.

## L'assistant (au lancement)

1. **Accueil** — le rig détecté (groupes par leur nom), ce qui va être
   construit. `Regler` ouvre les trois écrans ; `Reglages par defaut` saute
   directement au récapitulatif.
2. **1/3 Lignes et couleurs** — les groupes qui deviennent une ligne
   (pré-rempli avec ceux détectés, `1 + 2` ou `1 Thru 8`, 12 max ; sans
   groupe : les machines), nombre de couleurs (1–12).
3. **2/3 Temps** — fade couleur (`1`), fade arrêt (`2`), vitesse FX =
   étalement du balayage (`1`), fondu FX initial (`0` = sec).
4. **3/3 Emplacement** — ID de départ (`101`), numéro de Layout (`1`).
5. **Récapitulatif** — lignes par leur nom, couleurs, nombre de boucles FX,
   temps, plages exactes qui seront écrites, sort des presets (réutilisés /
   créés / corrigés), et **ce qui sera écrasé** si les plages sont occupées.
   `Construire` / `Modifier` (retour aux écrans) / `Annuler`. C'est la
   **seule** confirmation : jamais une question par objet.
6. **Écran final** — le bilan en quatre lignes et le mode d'emploi en six.

Annuler à n'importe quel écran = **aucune** commande envoyée. La virgule
décimale est acceptée (`0,5` = `0.5`).

Palette : `Red · Orange · Amber · Yellow · Green · Cyan · Azure · Blue ·
Violet · Magenta · Pink · White`.

## Vérification (`test/`)

Le plugin est rejoué dans une **console factice** (Lua via `lupa`) avant
chaque livraison :

```
pip install lupa
python3 gma3/test/mock_test.py       # rig imbriqué de référence, ~200 vérifications
python3 gma3/test/all_scenarios.py   # 12 profils : sans groupes, sans API de
                                     # sélection, cellules, panne, palettes
                                     # périmée / à jour / illisible, annulations,
                                     # options personnalisées…
```

Vérifié : objets et plages de nettoyage, contenu **exact** de chaque macro
du board, aucune commande programmer sur le board, `/NoConfirmation`
partout, aucune propriété de séquence non validée, forme des délais pour
les 5 FX, PNG décodés octet par octet, placement du layout.

## Notes techniques (chaque point a été un échec silencieux avant)

- **Tap d'une case** : propriété **`Action`** (`Go+`, `None`…).
  `PlaybackFunction` / `Function` n'existent pas. Le défaut dépend du profil
  utilisateur → posé explicitement.
- **Pourquoi des macros** : un élément de layout affiche l'appearance de
  la *séquence*, pas de la cue active (sauf `PreferCueAppearance`, Off par
  défaut), et seulement la couleur de fond — l'image n'est rendue que pour
  une macro.
- **`Goto` n'enchaîne pas les cues `Follow`** : seul `Go+` le fait. `Go+`
  avance d'une cue si la séquence tourne déjà → chaque tuile FX commence par
  un `Off` des 5 formes de sa ligne.
- **`OffFade` n'est pas une propriété de séquence** sur 2.5 (notification
  *Illegal property* à chaque écriture — 48 par appui en plein show). Le
  fondu d'arrêt est porté par `Off … Fade X`.
- Trigger de cue : **`TrigType`** = `Follow` (sensible à la casse). Boucle =
  2 cues Follow + `WrapAround`.
- **`Delay <t>`** en mot-clé de départ pose un délai **individuel** sur la
  sélection ; le programmer **accumule** → construction machine par machine.
  `Delay 0 Thru 1 Thru 0` est du MA2 : les formes symétriques sont calculées
  en Lua.
- **`SelectionFirst()` / `SelectionNext()`** renvoient un index de
  **subfixture**, pas un FID → `GetSubfixture(idx).FID` (ou `ToAddr()` pour
  une cellule). Sans cette API : repli sur `Delay a Thru b`.
- Les délais individuels rallongent la **Duration** de la cue, que le
  `Follow` attend → le balayage finit avant la cue suivante. Le damier porte
  un délai uniforme pour la même raison (une cue de durée nulle emballerait
  la boucle).
- `/NoConfirmation` partout ; ranged delete d'images avec le mot-clé répété
  (`Delete Image 3.101 Thru Image 3.128`).
- Cues écrites via `ColorRGB_R/G/B` **puis** `At Preset 4.x` : la cue est
  liée au preset, la console convertit vers les autres systèmes de couleur.
- **`Copy Preset … /Overwrite`** pour les slots FX : `/Merge` laissait des
  attributs de l'ancienne couleur (source de couleurs « pas demandées »).
- `ImageMode = Bar` sur l'appearance (image entière, aspect conservé).
- Layout : handle `DataPool().Layouts[n]` pris une fois, dernier enfant après
  chaque `Assign … At Layout`, `posx/posy/positionw/positionh`, échelle
  native auto-mesurée, coordonnées ≥ 0, axe Y inversé en fin.
- **La génération utilise le programmer** (impossible autrement pour stocker
  des cues) — après confirmation, sous `pcall`, avec un `ClearAll` garanti à
  la fin même en cas de panne. À faire avant le show.

## Nettoyage manuel

```
Delete Sequence 101 Thru …    (plages exactes affichées dans la confirmation)
Delete Macro 101 Thru …
Delete Appearance 101 Thru …
Delete Image 3.101 Thru Image 3.…
Delete Layout 1
```
