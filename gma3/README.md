# Color Picker LIVE — plugin grandMA3 onPC 2.5 (v9.2, recipes + tuiles néon)

Un plugin Lua qui construit un **board de busking couleur** dans un Layout :
une ligne par groupe (+ ALL), 12 couleurs, 5 vagues FX par groupe, pastilles
C1/C2, rangées FADE, vitesse et fondu FX réglables **en live**. Tout en
**restitution** : le programmer n'est jamais touché pendant le show. Un seul
écran avant la construction.

```
[ C O L O R  P I C K E R ]
[ ALL  ] [Red][Orange][Amber][Yellow][Green][Cyan][Azure][Blue][Violet][Magenta][Pink][White]
[ SPOT ] [… 12 tuiles néon …]  [J>C][C>J][E>I][I>E][1/2]
[ WASH ] [… 12 tuiles néon …]  [J>C][C>J][E>I][I>E][1/2]
[═══════════════════════ Off All ═══════════════════════]
[FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]
[FADE arrêt 2s  ] [0][0.5][1][2][3][4]
[FX C1 Red      ] [●][○]…
[FX C2 Blue     ] [○][●]…
[FX VITESSE 2s  ] [0.5s][1s][2s][4s][8s]
[FX FONDU 1s    ] [0s][0.5s][1s][2s][4s]
```

## Ce qui change en v9.2 (après les retours console sur la v9.0)

| Retour | v9.0 | v9.2 |
|---|---|---|
| « J'ai plus le style que j'avais demandé » (aplats sombres, une tuile pleine) | une séquence posée dans le layout ne rend que la couleur de fond de son appearance, pas l'image néon | chaque tuile = la **séquence** (sombre / pleine, état tenu par la console) **recouverte d'une macro d'une ligne** (`Go+ Sequence N`) dont l'appearance porte l'image **contour néon** au centre quasi transparent : contour au repos, **la couleur de la séquence remplit le contour** quand elle joue |
| « Ça demande trop de trucs au début » | accueil + 3 écrans + récapitulatif | **un seul écran** : le rig, le plan complet (lignes, ALL, plages, presets, programmer, ce qui serait supprimé) et `Construire`. `Regler` ouvre les 3 écrans seulement si tu le veux |
| « Quand je clique sur les fades il met mille ans » | 16 lignes par bouton FADE (CMD de chaque ligne réécrit + 6 surbrillances), 16 par pastille | **5 lignes** : une écriture **par plage**, l'en-tête, et une surbrillance en **3 lignes** grâce à une variable globale (`$cp_fc` = le bouton actif). Le fondu de relâche des boucles est fixe (`RELEASE_FADE`), plus rien à réécrire. Pastilles **8** lignes, FX VITESSE **7**, FX FONDU **6** |
| « ALL indisponible » (la console ne crée pas de 2ᵉ ligne de recipe, ni par `Assign … Part 0.2` ni par `Acquire`) | ligne ALL à lignes multiples, retirée quand la console refuse | un **groupe union `CP ALL`** stocké par le plugin (`Group 1 + 2 + 3` → `Store Group 101`), **vérifié par ses membres**, puis une recipe simple comme les autres lignes |

Tout le reste de la v9 est conservé : recipes partout, `Cook /Overwrite`, chaque commande vérifiée et
chaque propriété relue, probes à la génération, bilan par état le plus grave, 100 % restitution.

## Comment ça marche

### Les tuiles : une séquence + une macro néon par-dessus
- La **séquence** est posée dans le layout avec `PreferCueAppearance = Yes` : éteinte → appearance
  sombre (`CP Dark`), en lecture → appearance de sa cue (couleur pleine, à plat). Aucune repeinture,
  état exact même après rechargement du show.
- La **macro** `Sequence + 56` (une ligne : `Go+ Sequence N`) est posée **juste après**, à la même
  place : elle se dessine par-dessus. Son appearance (`CP <Couleur> Dim`) porte l'image contour néon
  (fond alpha 0, centre à 10 %) : au repos on voit le contour sur le fond sombre ; quand la séquence
  joue, sa couleur pleine remplit le contour. Les **coins extérieurs** de l'image sont peints de la
  couleur de fond du layout, opaques (`LAYOUT_BG`, le gris MA3 par défaut) : l'aplat carré de la séquence
  reste caché dans les coins, la tuile allumée est un pavé arrondi comme une pastille. La tape touche la
  macro → une ligne → réaction immédiate.
  Les tuiles FX ont un contour violet (`CP FX Dim`) et le texte de la forme (`J>C`…).
- `OffWhenOverridden = Yes` partout : la couleur tapée prend toutes les valeurs de l'ancienne
  couleur de la ligne → elle s'éteint seule (LTP). `WrapAround` : retaper une tuile allumée = la
  relancer, jamais l'éteindre.
- Les boucles FX qui touchent les machines d'une couleur (son groupe **et** les groupes qui le
  chevauchent, SPOT dans GENERAL) sont coupées par la colonne **CMD de la cue** :
  `Off Sequence 149 Thru 153 + 159 Thru 163 Fade 1` (fondu fixe `RELEASE_FADE = 1`). Une tuile FX
  coupe de la même façon toutes les boucles chevauchantes **sauf la sienne**.

### Les cues sont des recipes (zéro programmer)
```
Store Sequence 113 Cue 1 /Overwrite /NoConfirmation     -- crée séquence + cue vide
Assign Group 1 At Sequence 113 Cue 1 Part 0.1           -- ligne de recipe : Selection
Assign Preset 4.101 At Sequence 113 Cue 1 Part 0.1      -- Values
Cook Sequence 113 /Overwrite                            -- la console cuisine la cue
```
- **Ligne ALL** : le plugin stocke un groupe union `CP ALL` (`ClearAll`, `Group 1 + 2 + 3`,
  `Store Group 101 /Overwrite /NoConfirmation`, `Label`, `ClearAll` — sélection seule, aucune
  valeur) au premier numéro de groupe libre à partir de l'ID de départ (un `CP ALL` existant est
  réutilisé), puis **relit ses membres** et les compare à l'union de tes groupes. Groupe refusé ou
  faux → **pas de demi-ALL** : la ligne est retirée et le bilan le dit. Si tu as déjà un groupe
  « toutes machines », donne-le dans `Regler` : recipe simple dessus, pas de groupe union. Avec un
  seul groupe, pas de ligne ALL. Le groupe `CP ALL` n'est jamais une ligne du board (même tapé à
  la main) et n'est jamais supprimé ; `Re-cuisiner` le re-stocke (la liste des groupes est
  mémorisée dans les variables globales `cp_all_src` / `cp_all_slot`).
- **FX** : deux cues (`C1` = preset slot `4.113`, `C2` = `4.114`), une ligne de recipe chacune,
  avec les timings MAtricks de la forme :

  | Forme | Timings sur la ligne de recipe |
  |---|---|
  | `J>C` | `DelayFromX 0`, `DelayToX <vitesse>` |
  | `C>J` | idem + `InvertX Yes`, `InvertStyle All` |
  | `E>I` | idem + `XWings 2` (les deux bords partent en premier) |
  | `I>E` | `XWings 2` + `InvertX Yes` (le centre d'abord) |
  | `1/2` | `XGroup 2` (une machine sur deux part en premier : damier qui s'échange à chaque cue) |

  `TrigType Follow` sur les deux cues, `WrapAround`, `CueInFade` = fondu FX. Un groupe d'**1 machine**
  (ou de 2 avec `XWings`) n'a rien à étaler : sa vague est **pulsée** (`DelayFromX = DelayToX`) pour
  que la cue garde une durée. L'accueil nomme ces tuiles.
- **Pastilles C1/C2** : `Copy Preset 4.<couleur> At Preset 4.113 /Overwrite` + `Recast Preset 4.113`
  — la cue cuisinée **référence** le preset, la boucle change de couleur en direct (vérifié à la
  génération ; sinon `Assign Preset` sur chaque boucle).

### Les rangées de réglage : courtes, grâce à une variable
Chaque rangée note son bouton actif dans une variable globale (`cp_fc`, `cp_fo`, `cp_fv`,
`cp_ff`, `cp_c1m`/`cp_c1a`, `cp_c2m`/`cp_c2a`, semées à la génération et relues) ; un bouton
éteint le précédent sans le connaître :
```
Set Sequence 101 Thru 148 Cue 1 Property "CueInFade" 2    -- FADE couleur 2s (toutes les cues couleur)
Label Macro 104 "FADE couleur 2s"
Assign Appearance 125 At Macro $cp_fc                       -- l'ancien bouton actif redevient gris
Assign Appearance 126 At Macro 108                          -- celui-ci s'allume
SetGlobalVariable "cp_fc" 108
```
La substitution `$var` est **prouvée à la génération** (une macro de test d'une ligne, exécutée,
variable relue) ; si ce build ne la fait pas, la surbrillance passe en lignes explicites (8 lignes
au lieu de 5) et le bilan le dit. `FX VITESSE` : `DelayToX` par plage sur les deux cues + `Cook
Sequence 149 Thru 163 /MergeLowPriority` + en-tête + surbrillance = 7 lignes. `FX FONDU` : 6.
`FADE arrêt` réécrit la ligne 1 d'`Off All` : 5. Les formes par plage sont testées à la génération
(valeur temporaire écrite, relue, restaurée) ; refusées → rangées détaillées, « rangées longues »
au bilan.

### Vérification à la génération
Le plugin lit le retour de **chaque** commande (`Ok` / `Illegal object` / `Illegal property` /
`Syntax Error` …) **et relit chaque propriété écrite**. Il compte les lignes de recipe de chaque
cue et relit leur contenu, relit `OwnDataPresent` après la cuisson, `TrigType` / `CueInFade` /
`Command` sur les boucles après `Cook /Overwrite`, les membres du groupe `CP ALL`, et teste sur des
objets vides (dernière séquence et dernière macro des plages réservées, effacés ensuite) le canal
des variables, qu'un CMD de cue s'exécute au `Go+` et à la retape, que `Off … Fade` est accepté et
que `$var` est substitué dans une ligne de macro. L'écran final :
```
Board construit - tous les controles passent.
...
CONTROLES
  Commandes refusees : 0
  Commandes sans retour : 0   Habillage refuse : 0   Proprietes non verifiables : 0
  Lignes de recipe : 78/78   Cues cuisinees : 78/78
  Boucles en Follow : 30/30   Groupes enumeres : 3/3
  CMD de cue : OK   Off ... Fade : accepte
  Substitution $var : OK   Variables : 8/8
  Colonnes de cue apres Cook : conservees   C1/C2 : Copy + Recast
  ALL : groupe CP ALL (Group 101, 6 machines)
  Set par plage : couleurs oui, FX oui, Cook oui
  Macros live : tuiles 1 ligne, FADE 5 lignes, C1/C2 8, FX VITESSE 7, FX FONDU 6
```
Le titre dit l'état le plus grave : `AVEC DES REFUS` (une commande refusée ou une relecture
différente de ce qui a été écrit — le premier cas est cité en clair, un groupe `CP ALL` faux en
fait partie), `MODE DEGRADE` (une mécanique de ce build manque : CMD de cue inerte, `Off … Fade`
refusé, `$var` non substitué, affichage des tuiles, groupes non énumérés, ALL indisponible, rangées
longues… chaque cause est suivie de sa **conséquence en live** et du remède), `controles partiels`
(certaines lectures impossibles), ou `tous les controles passent`. Tout est aussi écrit dans la
ligne de commande (`Printf`).

## Ce que le board écrit (base 101, modifiable)

| Pool | Numéros | Contenu |
|---|---|---|
| Sequences | 101 … 101 + lignes×couleurs + groupes×5 − 1 | 1 cue par couleur, 2 cues par vague FX |
| Macros | 101 … 155 (156 libre) | Off All, en-têtes, FADE ×2, C1/C2, FX VITESSE, FX FONDU |
| Macros | séquence + 56 (157 …) | les **tuiles néon** (une ligne chacune) |
| Appearances | 101 … 142 | contours et pavés (images), aplats des séquences, utilitaires |
| Images 3.x | 101 … 127 | contours / pavés néon, contour FX |
| Presets 4.x | 101 … 112 + slots 113 / 114 | couleurs universelles (**jamais effacées**) |
| Groups | premier libre ≥ 101 | `CP ALL` (union de tes groupes, **jamais supprimé**) |
| Layout | au choix (défaut 1) | le board |

Plages **réservées** (nettoyées à la régénération, affichées à l'accueil) : `Seq 101-316`,
`Macro 101-372`, `App 101-154`, `Img 3.101-3.128` — assez larges pour effacer un board plus gros
qu'avant, et les boards v8 / v9.0 / v9.1. **Une seule confirmation, jamais une par objet** : toutes
les commandes portent une option (`/NoConfirmation`, `/Overwrite`…). Si les plages sont occupées,
les objets **à toi** qui seraient supprimés sont **nommés** (`Macro 150 "Blinder"`), les séquences
sont relâchées avec fondu avant suppression, et si quelque chose survit au nettoyage, **rien n'est
construit**.

## Installation

`ColorPicker.xml` **et** `ColorPicker.lua` ensemble dans le dossier plugins :
- onPC Mac : `~/MALightingTechnology/gma3_library/datapools/plugins/`
- onPC Windows : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`

Console : pool **Plugins** → case vide → **Import** → `ColorPicker`.

> **Après chaque modification du `.lua`** : `ReloadAllPlugins` (`RP`). Le plugin affiche sa
> version à l'accueil (= le fichier chargé) et le numéro majeur dans la bannière du board.

**Il faut des groupes** (une recipe sélectionne un Group) : `Group SPOT`, `WASH`… avec les
machines dans l'ordre jardin → cour (c'est le sens des vagues). Sans groupe, ou si tous les groupes
du board sont vides, le plugin le dit et s'arrête. Un groupe vide parmi d'autres est retiré du
board et annoncé.

## L'assistant

**Un écran** : le rig détecté (groupes par leur nom) et le **plan** — lignes, couleurs, vagues,
mode de la ligne ALL, temps, tout ce qui sera écrit (numéros exacts), sort des presets, plages
réservées, usage du programmer, vagues pulsées, groupes vides ignorés, et `ATTENTION` + la liste de
ce qui serait supprimé si les plages sont occupées (objets à toi nommés).

- `Construire` — lance avec les réglages par défaut (12 couleurs, fades 1 s / 2 s, FX 2 s / 1 s,
  ID 101, Layout 1). C'est la **seule** confirmation.
- `Regler` — 3 écrans (groupes du board, groupe ALL optionnel, couleurs ; temps ; ID de départ,
  Layout) puis un récapitulatif avec `Construire` / `Modifier` (pré-rempli) / `Annuler`.
- `Re-cuisiner` — après un repatch : re-stocke le groupe `CP ALL` et recuit toutes les séquences
  d'un board existant. Groupe ajouté ou retiré → régénère plutôt.
- `Annuler` — aucune commande envoyée (à n'importe quel écran).

Puis l'**écran final** : titre d'état, causes et conséquences, bilan, contrôles, mode d'emploi.
Virgule décimale acceptée (`0,5`).

## En live

- **Tuile couleur** : contour néon au repos, pleine quand elle joue. La ligne prend la couleur
  (fade couleur), l'ancienne tuile s'éteint seule. Les boucles FX qui touchaient ces machines
  s'arrêtent. Retaper = relancer.
- **`J>C` `C>J` `E>I` `I>E` `1/2`** : vague C1↔C2 sur le groupe ; retaper = la boucle continue.
  Une couleur sur la ligne l'arrête. `Off All` arrête tout.
- **C1 / C2** : les deux couleurs de la vague, changeables en cours.
- **FX VITESSE / FX FONDU** : battement et douceur de la vague ; la nouvelle vitesse prend à la cue
  suivante. `1/2` : damier net seulement avec FX FONDU 0.
- **FADE couleur / FADE arrêt** : le bouton actif est surligné.
- **Repatch** : plugin → `Re-cuisiner`. Groupe modifié → régénère.

## Vérification (`test/`)

```
pip install lupa
python3 gma3/test/mock_test.py       # rig imbriqué de référence, ~350 vérifications
python3 gma3/test/all_scenarios.py   # 37 scénarios : groupe union refusé / faux, sans
                                     # selectiondata, Set/Cook par plage refusés, Off … Fade
                                     # refusé, CMD inerte, $var non substitué, canal variable
                                     # absent, propriété mal stockée / inconnue, build muet,
                                     # copie qui casse la référence, groupe vide, nettoyage
                                     # incomplet, régénération, petits groupes, 12 groupes,
                                     # Re-cuisiner, et les BOUTONS PRESSÉS (Go+ Macro)
python3 gma3/test/mutations.py       # 32 bugs réintroduits volontairement : 32 attrapés
```

La console factice répond `Ok` ou une **erreur** à chaque commande (toute commande hors modèle =
`Syntax Error`), modélise les lignes de recipe, la cuisson (par plage, `/Remove`,
`/MergeLowPriority`), le CMD de cue au `Go+`, `Group a + b` / `Store Group`, `Go+ Macro` avec
substitution `$var`, les membres des groupes, un handle objet qui accepte en silence une propriété
inconnue (seule la relecture l'attrape). Vérifié : zéro programmer hors `ClearAll`, presets et
sélection du groupe union, options sur tout ce qui pourrait ouvrir un popup, contenu exact de
chaque recipe, de chaque CMD et de chaque macro, chaque tuile recouverte par sa macro, aucune
macro de réglage au-dessus de 8 lignes, textes et **titre** du bilan dans chaque situation, et
l'effet de chaque bouton pressé.

## À observer sur ta console (ce que le simulateur ne peut pas prouver)

1. La macro néon posée après la séquence se dessine **par-dessus** et laisse voir la couleur de la
   séquence à travers son centre (fond alpha 0). Si le centre reste opaque, la tuile montre le
   contour sans l'état — dis-le, il y a un plan B (CMD de cue qui repeint).
2. `Store Group 101` depuis `Group 1 + 2 + 3` : le bilan dit `ALL : groupe CP ALL (Group 101,
   N machines)` avec le bon N.
3. `Substitution $var : OK` au bilan ; puis presse deux boutons FADE de suite : le premier redevient
   gris.
4. Sens de `InvertX`, extrémité de la vague, `XGroup 2` = alternance.
5. `CMD de cue : OK` au bilan — et au passage d'une cue Follow (non testable à la génération).
6. C1 tapée pendant qu'une vague tourne : la couleur change tout de suite (Copy + Recast).
7. `Off … Fade` fond vraiment (la probe prouve l'acceptation de la syntaxe).
8. FX VITESSE pendant qu'une vague tourne : la nouvelle vitesse prend à la cue suivante.

## Notes techniques (chaque point a été un échec silencieux avant)

- Tap d'une case : propriété **`Action`** (`Go+`, `None`). Un en-tête de groupe reste inerte.
- Un layout ne rend l'**image** d'une appearance que pour une macro → la séquence porte l'aplat,
  la macro posée par-dessus porte le contour néon. La console ne laisse pas **réduire** la taille d'une
  case d'une colonne (la position bouge, pas la taille) → les coins de l'image masquent le carré.
- Sur onPC 2.5.0.3, ni `Assign … Part 0.2` ni `part:Acquire("StandardRecipe")` ne créent une
  2ᵉ ligne de recipe → groupe union.
- `Goto` n'enchaîne pas les cues `Follow` ; seul `Go+` le fait.
- `OffFade` n'existe pas sur 2.5 ; le fondu d'arrêt vit dans `Off … Fade X`.
- Valeurs de propriétés **sensibles à la casse** (`"Follow"`, `"Yes"`) ; nombres écrits nus
  (`CueInFade 2`, `WrapAround 1`), textes entre guillemets.
- Un `Cook` ou un `Store` sans option ouvre un popup, impossible depuis un plugin → options partout.
- Le handle objet peut accepter en silence une propriété qu'il ignore → toujours relire.
- `SelectionFirst()` renvoie un index de subfixture, pas un FID ; `Group.selectiondata[*].sf_index`
  → `GetSubfixture(idx)`.
- Les variables **globales** (`SetGlobalVariable`) sont sauvées avec le show, pas les variables
  utilisateur : c'est pour ça que la surbrillance et `Re-cuisiner` s'appuient sur elles.

## Nettoyage manuel

```
Delete Sequence 101 Thru 316    (plages exactes affichées à l'accueil)
Delete Macro 101 Thru 372
Delete Appearance 101 Thru 154
Delete Image 3.101 Thru Image 3.128
Delete Layout 1
Delete Group 101                (le groupe CP ALL, si tu n'en veux plus)
```

Les presets `4.101+` sont à toi : le plugin ne les supprime jamais.
