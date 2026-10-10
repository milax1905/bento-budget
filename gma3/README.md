# Color Picker LIVE — plugin grandMA3 onPC 2.5 (v9, recipes)

Un plugin Lua qui construit un **board de busking couleur** dans un Layout :
une ligne par groupe (+ ALL), 12 couleurs, 5 vagues FX par groupe, pastilles
C1/C2, rangées FADE, vitesse et fondu FX réglables **en live**. Tout en
**restitution** : le programmer n'est jamais touché pendant le show.

```
[ C O L O R  P I C K E R ]
[ ALL  ] [Red][Orange][Amber][Yellow][Green][Cyan][Azure][Blue][Violet][Magenta][Pink][White]
[ SPOT ] [… 12 couleurs …]  [J>C][C>J][E>I][I>E][1/2]
[ WASH ] [… 12 couleurs …]  [J>C][C>J][E>I][I>E][1/2]
[═══════════════════════ Off All ═══════════════════════]
[FADE couleur 1s] [0s][0.5s][1s][2s][3s][4s]
[FADE arrêt 2s  ] [0][0.5][1][2][3][4]
[FX C1 Red      ] [●][○]…
[FX C2 Blue     ] [○][●]…
[FX VITESSE 2s  ] [0.5s][1s][2s][4s][8s]
[FX FONDU 1s    ] [0s][0.5s][1s][2s][4s]
```

## Ce qui change en v9 (après les retours console sur la v8)

| Retour | v8 | v9 |
|---|---|---|
| « Une tuile mettait une éternité à réagir » | chaque tuile = une macro de 40 à 100 lignes (Goto, Off, repeinture de toutes les tuiles) | les tuiles sont **les séquences elles-mêmes** : zéro ligne, réaction immédiate ; l'état visuel est tenu par la console (`PreferCueAppearance`) |
| « Les FX allaient super vite, c'était horrible » | balayage 1 s, fondu 0, figés à la génération | vagues **MAtricks** (`DelayFromX/DelayToX`, `XWings`, `XGroup`, `InvertX`), défauts 2 s / 1 s, rangées **FX VITESSE** et **FX FONDU** en live (une seule commande par plage, recuisson par plage) |
| « Il faut que ce soit des recipes » | cues stockées depuis le programmer | chaque cue est une **recipe** `Group → Preset 4.x` (+ timings), cuisinée par `Cook /Overwrite` |
| « Des trucs font n'importe quoi » | le retour de `Cmd()` n'était jamais lu | **chaque commande est vérifiée et chaque propriété relue** ; le bilan dit l'état le plus grave (refus / mode dégradé / contrôles partiels / tout passe), cite le premier refus et la conséquence en live de chaque dégradation |

## Comment ça marche

### Les tuiles sont des séquences
- Chaque case couleur / FX du layout est `Sequence N` (élément `Action = Go+`).
- `PreferCueAppearance = Yes` : séquence éteinte → appearance de la séquence (couleur sombre
  à 30 %) ; séquence qui joue → appearance de sa cue (couleur pleine). Aucune repeinture,
  état exact même après rechargement du show.
- `OffWhenOverridden = Yes` partout : la couleur tapée prend toutes les valeurs de l'ancienne
  couleur de la ligne → elle s'éteint seule (LTP). ALL reste allumée tant qu'elle tient encore
  des machines. `WrapAround` sur toutes les séquences : retaper une tuile allumée = la relancer,
  jamais l'éteindre.
- Les boucles FX qui touchent les machines d'une couleur (son groupe **et** les groupes qui le
  chevauchent, SPOT dans GENERAL) sont coupées par la colonne **CMD de la cue** :
  `Off Sequence 149 Thru 153 + 159 Thru 163 Fade 1`. Une tuile FX coupe de la même façon toutes les
  boucles chevauchantes **sauf la sienne** (`Go+` la démarre, ou l'avance si elle tourne déjà).

### Les cues sont des recipes (zéro programmer)
```
Store Sequence 113 Cue 1 /Overwrite /NoConfirmation     -- crée séquence + cue vide
Assign Group 1 At Sequence 113 Cue 1 Part 0.1           -- ligne de recipe 1 : Selection
Assign Preset 4.101 At Sequence 113 Cue 1 Part 0.1      -- Values
Cook Sequence 113 /Overwrite                            -- la console cuisine la cue
```
- Ligne ALL : si tu donnes un groupe « toutes machines » (`Groupe ALL` dans l'assistant), une
  recipe simple ; sinon une ligne de recipe par groupe du board (`Part 0.1`, `0.2`, …). Si la
  console ne crée pas la ligne 2 par commande, repli par l'API objet (`part:Acquire("StandardRecipe")`
  + `Set Selection / Values`) ; si rien ne marche, **pas de demi-ALL** : la ligne ALL est retirée
  et le bilan le dit. Avec un seul groupe, pas de ligne ALL.
- FX : deux cues (`C1` = preset slot `4.113`, `C2` = `4.114`), une ligne de recipe chacune,
  avec les timings MAtricks de la forme :

  | Forme | Timings sur la ligne de recipe |
  |---|---|
  | `J>C` | `DelayFromX 0`, `DelayToX <vitesse>` |
  | `C>J` | idem + `InvertX Yes`, `InvertStyle All` |
  | `E>I` | idem + `XWings 2` (les deux bords partent en premier) |
  | `I>E` | `XWings 2` + `InvertX Yes` (le centre d'abord) |
  | `1/2` | `XGroup 2` (une machine sur deux part en premier : damier qui s'échange à chaque cue) |

  `TrigType Follow` sur les deux cues, `WrapAround`, `CueInFade` = fondu FX. La cue dure le
  temps de la vague : la suivante attend qu'elle soit finie. Un groupe d'**1 machine** (ou de 2
  avec `XWings`) n'a rien à étaler : sa vague est **pulsée** (`DelayFromX = DelayToX =
  vitesse`) pour que la cue garde une durée — sinon la boucle s'emballerait. Le récapitulatif
  nomme ces tuiles.
- Les pastilles C1/C2 : `Copy Preset 4.<couleur> At Preset 4.113 /Overwrite` + `Recast Preset
  4.113` — la cue cuisinée **référence** le preset, la boucle change de couleur en direct. Le plugin
  vérifie à la génération que la copie conserve la référence ; sinon les pastilles passent par
  `Assign Preset` sur chaque boucle.
- `FX VITESSE` : une commande par plage (`Set Sequence 149 Thru 163 Cue 1 Part 0.1 Property
  "DelayToX" 4`, idem cue 2) puis `Cook Sequence 149 Thru 163 /MergeLowPriority` — 9 lignes. `FX FONDU` :
  deux commandes par plage (`CueInFade`), 8 lignes. `FADE couleur` : une commande par plage + le
  CMD de chaque ligne, 12 lignes. Les formes par plage sont **testées à la génération** (valeur
  temporaire écrite, relue, restaurée) ; si ce build les refuse, les rangées se détaillent
  séquence par séquence et le bilan annonce « rangées longues ».
- **Re-cuisiner** (bouton de l'assistant, pas du board) : `Cook /Overwrite` de toutes les
  séquences d'un board existant — après un repatch. Un groupe ajouté ou retiré → régénère.
- **Programmer** : un `ClearAll` au départ, et le stockage des presets couleur universels
  s'ils n'existent pas encore (un preset ne se crée pas sans valeurs), suivi d'un `ClearAll`.
  Rien d'autre. Les membres des groupes sont lus sans programmer (`Group.selectiondata` ; repli :
  sélection lue puis `ClearAll`, annoncé au récapitulatif).

### Vérification à la génération
Le plugin lit le retour de **chaque** commande (`Ok` / `Illegal object` / `Illegal property` /
`Syntax Error` …) **et relit chaque propriété écrite** (ce que la console a stocké fait foi, pas ce
qu'elle a répondu). Il compte les lignes de recipe de chaque cue et relit leur contenu, relit
`OwnDataPresent` après la cuisson, `TrigType` / `CueInFade` / `Command` sur les boucles après
`Cook /Overwrite`, et teste sur une séquence vide qu'un CMD de cue s'exécute au `Go+` et à la
retape (`SetGlobalVariable` → `GetVar`) et que `Off … Fade` est accepté. L'écran final :
```
Board construit - tous les controles passent.
...
CONTROLES
  Commandes refusees : 0
  Commandes sans retour : 0   Habillage refuse : 0   Proprietes non verifiables : 0
  Lignes de recipe : 102/102   Cues cuisinees : 78/78
  Boucles en Follow : 30/30   Groupes enumeres : 3/3
  CMD de cue : OK   Off ... Fade : accepte
  Colonnes de cue apres Cook : conservees   C1/C2 : Copy + Recast
  ALL : lignes multiples   Set par plage : couleurs oui, FX oui, Cook oui
  Macros live : FADE couleur 12 lignes, FX VITESSE 9, FX FONDU 8, C1/C2 16
```
Le titre dit l'état le plus grave : `AVEC DES REFUS` (une commande refusée ou une relecture
différente de ce qui a été écrit — le premier cas est cité en clair), `MODE DEGRADE` (une
mécanique de ce build manque : CMD de cue inerte, `Off … Fade` refusé, affichage des tuiles,
groupes non énumérés, ALL indisponible, rangées longues… chaque cause est suivie de sa
**conséquence en live** et du remède), `controles partiels` (certaines lectures impossibles),
ou `tous les controles passent`. Tout est aussi écrit dans la ligne de commande (`Printf`).

## Ce que le board écrit (base 101, modifiable)

| Pool | Numéros | Contenu |
|---|---|---|
| Sequences | 101 … 101 + lignes×couleurs + groupes×5 − 1 | 1 cue par couleur, 2 cues par vague FX |
| Macros | 101 … 155 (156 réservé) | Off All, en-têtes, FADE ×2, C1/C2, FX VITESSE, FX FONDU |
| Appearances | 101 … 154 | pastilles (images) + tuiles (aplats) + utilitaires |
| Images 3.x | 101 … 126 | contours / pavés néon des boutons |
| Presets 4.x | 101 … 112 + slots 113 / 114 | couleurs universelles (**jamais effacées**) |
| Layout | au choix (défaut 1) | le board |

**Une seule confirmation, jamais une par objet** : toutes les commandes portent une option
(`/NoConfirmation`, `/Overwrite`…) — un popup ne peut pas s'ouvrir depuis un plugin. Les plages
réservées sont affichées au récapitulatif ; si elles sont occupées, les objets **à toi** qui
seraient supprimés sont **nommés** (`Macro 150 "Blinder"`), les séquences sont relâchées avec
fondu avant suppression, et si quelque chose survit au nettoyage, **rien n'est construit**. Un
board v8 (une macro par tuile) est reconnu et nettoyé en entier.

## Installation

`ColorPicker.xml` **et** `ColorPicker.lua` ensemble dans le dossier plugins :
- onPC Mac : `~/MALightingTechnology/gma3_library/datapools/plugins/`
- onPC Windows : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`

Console : pool **Plugins** → case vide → **Import** → `ColorPicker`.

> **Après chaque modification du `.lua`** : `ReloadAllPlugins` (`RP`). Le plugin affiche sa
> version au lancement (= le fichier chargé) et dans la bannière du board (= la version qui a
> généré ce layout) : si elles diffèrent, régénère.

**Il faut des groupes** (une recipe sélectionne un Group) : `Group SPOT`, `WASH`… avec les
machines dans l'ordre jardin → cour (c'est le sens des vagues). Sans groupe, ou si tous les groupes
du board sont vides, le plugin le dit et s'arrête. Un groupe vide parmi d'autres est retiré du
board et annoncé.

## L'assistant (au lancement)

1. **Accueil** — le rig détecté (groupes par leur nom), ce qui va être construit.
   `Regler` / `Reglages par defaut` / `Re-cuisiner` / `Annuler`.
2. **1/3 Lignes et couleurs** — les groupes du board (pré-remplis ; `1 + 2`, `1 Thru 8`, 12 max ;
   les numéros inexistants sont ignorés et cités, une liste vide est redemandée), un groupe ALL
   optionnel, nombre de couleurs.
3. **2/3 Temps** — fade couleur (`1`), fade arrêt (`2`), vitesse FX (`2`), fondu FX (`1`).
   Les quatre restent réglables sur le board.
4. **3/3 Emplacement** — ID de départ (`101` minimum), numéro de Layout (`1`).
5. **Récapitulatif** — lignes, vagues (et vagues pulsées), mode de la ligne ALL, plages réservées,
   sort des presets, usage du programmer. Plages libres → aucun `Delete` ; sinon `ATTENTION` + la
   liste exacte de ce qui sera supprimé, objets à toi nommés. `Construire` / `Modifier` (écrans
   pré-remplis) / `Annuler`. C'est la **seule** confirmation.
6. **Écran final** — titre d'état, causes de dégradation et leurs conséquences, bilan,
   **contrôles**, mode d'emploi.

Annuler à n'importe quel écran = aucune commande. Virgule décimale acceptée (`0,5`).

## En live

- **Tuile couleur** : la ligne prend la couleur (fade couleur), la tuile s'allume, l'ancienne
  s'éteint. Les boucles FX qui touchaient ces machines s'arrêtent. Retaper = relancer.
- **`J>C` `C>J` `E>I` `I>E` `1/2`** : vague C1↔C2 sur le groupe ; retaper = la boucle continue.
  Une couleur sur la ligne l'arrête. `Off All` arrête tout. Pendant que ALL est allumée, une ligne
  sans tuile allumée est à la couleur de ALL.
- **C1 / C2** : les deux couleurs de la vague, changeables en cours.
- **FX VITESSE / FX FONDU** : battement et douceur de la vague ; la nouvelle vitesse prend à la cue
  suivante (si rien ne change, retape la tuile FX). `1/2` : damier net seulement avec FX FONDU 0.
- **FADE couleur / FADE arrêt** : le bouton actif est surligné.
- **Repatch** : plugin → `Re-cuisiner`. Groupe modifié → régénère.

## Vérification (`test/`)

```
pip install lupa
python3 gma3/test/mock_test.py       # rig imbriqué de référence, ~300 vérifications
python3 gma3/test/all_scenarios.py   # 32 scénarios : repli Acquire, ALL indisponible, sans
                                     # selectiondata, Set/Cook par plage refusés, Off … Fade
                                     # refusé, CMD inerte, propriété mal stockée / inconnue, build
                                     # muet, copie qui casse la référence, groupe vide, nettoyage
                                     # incomplet, board v8, petits groupes, 12 groupes, Re-cuisiner…
python3 gma3/test/mutations.py       # 24 bugs réintroduits volontairement : 24 attrapés
```

La console factice répond `Ok` ou une **erreur** à chaque commande (toute commande hors modèle =
`Syntax Error`), modélise les lignes de recipe, la cuisson (par plage, `/Remove`,
`/MergeLowPriority`), le CMD de cue au `Go+`, les membres des groupes, un handle objet qui accepte
en silence une propriété inconnue (seule la relecture l'attrape). Vérifié : zéro programmer hors
`ClearAll` et presets, options sur tout ce qui pourrait ouvrir un popup, contenu exact de chaque
recipe et de chaque CMD, macros de live ≤ 25 lignes quel que soit le nombre de groupes, appearances
des tuiles sans image, placement du layout, textes et **titre** du bilan dans chaque situation.

## À observer sur ta console (ce que le simulateur ne peut pas prouver)

1. `Assign Group … Part 0.2` crée bien la 2ᵉ ligne (sinon repli Lua ; sinon ALL retirée, dit au bilan).
2. Tuile séquence : couleur pleine quand elle joue, sombre sinon ; tuile FX allumée sur la cue 2 aussi.
3. Sens de `InvertX`, extrémité de la vague (dernier délai = vitesse ou vitesse·(n−1)/n), `XGroup 2`
   = alternance.
4. `CMD de cue : OK` au bilan — et au passage d'une cue Follow (non testable à la génération).
5. C1 tapée pendant qu'une vague tourne : la couleur change tout de suite (Copy + Recast).
6. `Off … Fade` fond vraiment (la probe prouve l'acceptation de la syntaxe).
7. FX VITESSE pendant qu'une vague tourne : la nouvelle vitesse prend à la cue suivante, sans flash.
8. Démarrer SPOT J>C puis taper SPOT C>J autour de l'instant Follow : la nouvelle forme tient.

## Notes techniques (chaque point a été un échec silencieux avant)

- Tap d'une case : propriété **`Action`** (`Go+`, `None`). Un en-tête de groupe reste inerte.
- Un layout ne rend l'**image** d'une appearance que pour une macro → les tuiles-séquences
  utilisent des appearances à plat (`BackR/G/B`), les boutons gardent les PNG néon.
- `Goto` n'enchaîne pas les cues `Follow` ; seul `Go+` le fait.
- `OffFade` n'existe pas sur 2.5 ; le fondu d'arrêt vit dans `Off … Fade X`.
- Valeurs de propriétés **sensibles à la casse** (`"Follow"`, `"Yes"`) ; nombres écrits nus
  (`CueInFade 2`, `WrapAround 1`), textes entre guillemets ; grilles MAtricks remises à `"None"`
  (jamais `0`).
- Un `Cook` ou un `Store` sans option ouvre un popup, impossible depuis un plugin → options partout.
- Le handle objet peut accepter en silence une propriété qu'il ignore → toujours relire.
- `SelectionFirst()` renvoie un index de subfixture, pas un FID ; `Group.selectiondata[*].sf_index`
  → `GetSubfixture(idx)`.

## Nettoyage manuel

```
Delete Sequence 101 Thru …    (plages exactes affichées dans le récapitulatif)
Delete Macro 101 Thru …
Delete Appearance 101 Thru …
Delete Image 3.101 Thru Image 3.…
Delete Layout 1
```

Les presets `4.101+` sont à toi : le plugin ne les supprime jamais.
