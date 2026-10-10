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
[FX VITESSE 2s  ] [0.5s][1s][2s][4s][8s]                    [RE-CUISINER]
[FX FONDU 1s    ] [0s][0.5s][1s][2s][4s]
```

## Ce qui change en v9 (après les retours console sur la v8)

| Retour | v8 | v9 |
|---|---|---|
| « Une tuile mettait une éternité à réagir » | chaque tuile = une macro de 40 à 100 lignes (Goto, Off, repeinture de toutes les tuiles) | les tuiles sont **les séquences elles-mêmes** : zéro ligne, réaction immédiate ; l'état visuel est tenu par la console (`PreferCueAppearance`) |
| « Les FX allaient super vite, c'était horrible » | balayage 1 s, fondu 0, figés à la génération | vagues **MAtricks** (`DelayFromX/DelayToX`, `XWings`, `XGroup`, `InvertX`), défauts 2 s / 1 s, rangées **FX VITESSE** et **FX FONDU** en live |
| « Il faut que ce soit des recipes » | cues stockées depuis le programmer | chaque cue est une **recipe** `Group → Preset 4.x` (+ timings), cuisinée par `Cook /Overwrite` |
| « Des trucs font n'importe quoi » | le retour de `Cmd()` n'était jamais lu | **chaque commande est vérifiée** (`Ok` ou erreur), chaque ligne de recipe et chaque cue cuisinée sont relues ; le bilan compte et cite les refus |

## Comment ça marche

### Les tuiles sont des séquences
- Chaque case couleur / FX du layout est `Sequence N` (élément `Action = Go+`).
- `PreferCueAppearance = Yes` : séquence éteinte → appearance de la séquence (couleur sombre
  à 30 %) ; séquence qui joue → appearance de sa cue (couleur pleine). Aucune repeinture,
  état exact même après rechargement du show.
- `OffWhenOverridden = Yes` partout : la couleur tapée prend toutes les valeurs de l'ancienne
  couleur de la ligne **et** de la boucle FX du même groupe → elles s'éteignent seules (LTP).
  ALL reste allumée tant qu'elle tient encore des machines.
- Les boucles FX des **autres** groupes qui partagent des machines (SPOT dans GENERAL) sont
  coupées par la colonne **CMD de la cue** : `Off Sequence 159 Thru 163 Fade 1`. Une tuile FX
  coupe de la même façon toutes les boucles chevauchantes **sauf la sienne** (`Go+` la démarre,
  ou l'avance si elle tourne déjà).

### Les cues sont des recipes (zéro programmer)
```
Store Sequence 113 Cue 1 /Overwrite /NoConfirmation     -- crée séquence + cue vide
Assign Group 1 At Sequence 113 Cue 1 Part 0.1           -- ligne de recipe 1 : Selection
Assign Preset 4.101 At Sequence 113 Cue 1 Part 0.1      -- Values
Cook Sequence 113 /Overwrite                            -- la console cuisine la cue
```
- Ligne ALL : une ligne de recipe par groupe du board (`Part 0.1`, `0.2`, …). Si la console
  ne crée pas la ligne 2 par commande, repli par l'API objet (`part:Acquire("StandardRecipe")`
  + `Set Selection / Values`), vérifié par `Count()`.
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
  temps de la vague : la suivante attend qu'elle soit finie.
- Les pastilles C1/C2 : `Copy Preset 4.<couleur> At Preset 4.113 /Overwrite` — la cue cuisinée
  **référence** le preset, la boucle change de couleur en direct.
- `FX VITESSE` : réécrit `DelayToX` des 30 cues FX puis `Cook /Overwrite` les 15 boucles
  (possible en cours de lecture). `FX FONDU` : réécrit le `CueInFade` des 30 cues.
- `FADE couleur` : une seule commande par plage (`Set Sequence 101 Thru 148 Cue 1 Property
  "CueInFade"`) + la réécriture du CMD de chaque ligne. `FADE arrêt` : réécrit `Off All`.
- `RE-CUISINER` : `Cook /Overwrite` de toutes les séquences du board — après un repatch ou un
  groupe modifié, pas besoin de régénérer.
- **Programmer** : un `ClearAll` au départ, et le stockage des presets couleur universels
  s'ils n'existent pas encore (un preset ne se crée pas sans valeurs), suivi d'un `ClearAll`.
  Rien d'autre. Les membres des groupes sont lus sans programmer (`Group.selectiondata`).

### Vérification à la génération
Le plugin lit le retour de **chaque** commande (`Ok` / `Illegal object` / `Illegal property` /
`Syntax Error` …), compte le nombre de lignes de recipe de chaque cue, relit `OwnDataPresent`
après la cuisson et `TrigType` sur les boucles, et teste **une fois** qu'un CMD de cue
s'exécute bien au `Go+` (séquence de test vide : `SetUserVar` → `GetVar`, puis suppression).
L'écran final affiche :
```
CONTROLES
  Commandes refusees : 0
  Lignes de recipe : 102/102   Cues cuisinees : 78/78
  Boucles en Follow : 30/30   Groupes enumeres : 3/3
  CMD de cue : OK
```
Un refus = compté, le premier est cité en clair. Jamais un board qui « fait n'importe quoi »
en silence.

## Ce que le board écrit (base 101, modifiable)

| Pool | Numéros | Contenu |
|---|---|---|
| Sequences | 101 … 101 + lignes×couleurs + groupes×5 − 1 | 1 cue par couleur, 2 cues par vague FX |
| Macros | 101 … 156 | Off All, en-têtes, FADE ×2, C1/C2, FX VITESSE, FX FONDU, RE-CUISINER |
| Appearances | 101 … 154 | pastilles (images) + tuiles (aplats) + utilitaires |
| Images 3.x | 101 … 126 | contours / pavés néon des boutons |
| Presets 4.x | 101 … 112 + slots 113 / 114 | couleurs universelles (**jamais effacées**) |
| Layout | au choix (défaut 1) | le board |

**Une seule confirmation, jamais une par objet** : toutes les commandes portent une option
(`/NoConfirmation`, `/Overwrite`…) — un popup ne peut pas s'ouvrir depuis un plugin. Le
nettoyage couvre des **plages larges** (empreinte max, versions précédentes comprises).

## Installation

`ColorPicker.xml` **et** `ColorPicker.lua` ensemble dans le dossier plugins :
- onPC Mac : `~/MALightingTechnology/gma3_library/datapools/plugins/`
- onPC Windows : `C:\ProgramData\MALightingTechnology\gma3_library\datapools\plugins\`

Console : pool **Plugins** → case vide → **Import** → `ColorPicker`.

> **Après chaque modification du `.lua`** : `ReloadAllPlugins` (`RP`). Le plugin affiche sa
> version au lancement (= le fichier chargé) et dans la bannière du board (= la version qui a
> généré ce layout) : si elles diffèrent, régénère.

**Il faut des groupes** (une recipe sélectionne un Group) : SPOT, WASH… dans l'ordre jardin →
cour pour que les vagues aient un sens. Sans groupe, le plugin le dit et s'arrête.

## L'assistant (au lancement)

1. **Accueil** — le rig détecté (groupes par leur nom), ce qui va être construit.
   `Regler` / `Reglages par defaut` / `Annuler`.
2. **1/3 Lignes et couleurs** — les groupes du board (pré-remplis ; `1 + 2`, `1 Thru 8`, 12 max ;
   les numéros inexistants sont ignorés et cités, une liste vide est redemandée), nombre de couleurs.
3. **2/3 Temps** — fade couleur (`1`), fade arrêt (`2`), vitesse FX (`2`), fondu FX (`1`).
   Les quatre restent réglables sur le board.
4. **3/3 Emplacement** — ID de départ (`101` minimum), numéro de Layout (`1`).
5. **Récapitulatif** — lignes, vagues, plages exactes, sort des presets, usage du programmer.
   Plages libres → aucun `Delete` ; sinon `ATTENTION` + la liste exacte de ce qui sera supprimé.
   `Construire` / `Modifier` (écrans pré-remplis) / `Annuler`. C'est la **seule** confirmation.
6. **Écran final** — bilan, **contrôles**, mode d'emploi.

Annuler à n'importe quel écran = aucune commande. Virgule décimale acceptée (`0,5`).

## En live

- **Tuile couleur** : la ligne prend la couleur (fade couleur), la tuile s'allume, l'ancienne
  s'éteint. Les boucles FX qui touchaient ces machines s'arrêtent.
- **`J>C` `C>J` `E>I` `I>E` `1/2`** : vague C1↔C2 sur le groupe ; retaper = la boucle continue.
  Une couleur sur la ligne l'arrête. `Off All` arrête tout.
- **C1 / C2** : les deux couleurs de la vague, changeables en cours.
- **FX VITESSE / FX FONDU** : battement et douceur de la vague (recuisson, à faire entre deux
  looks plutôt qu'en plein effet).
- **FADE couleur / FADE arrêt** : le bouton actif est surligné.
- **RE-CUISINER** : après un repatch ou un groupe modifié.

## Vérification (`test/`)

```
pip install lupa
python3 gma3/test/mock_test.py       # rig imbriqué de référence, ~250 vérifications
python3 gma3/test/all_scenarios.py   # 30 scénarios : repli Acquire, sans selectiondata,
                                     # Set par plage refusé, CMD inerte, commande refusée,
                                     # panne, palettes, annulations, plages occupées,
                                     # listes fausses, petits groupes, Modifier…
python3 gma3/test/mutations.py       # 17 bugs réintroduits volontairement : 17 attrapés
```

La console factice répond `Ok` ou une **erreur** à chaque commande (toute commande hors modèle =
`Syntax Error`), modélise les lignes de recipe, la cuisson, le CMD de cue, les membres des
groupes. Vérifié : zéro programmer hors `ClearAll` et presets, options sur tout ce qui pourrait
ouvrir un popup, contenu exact de chaque recipe et de chaque CMD (ce qu'une tuile coupe, ce
qu'elle épargne), macros courtes (aucune au-dessus de 60 lignes en live), appearances des tuiles
sans image, placement du layout, textes de l'assistant et du bilan.

## À observer sur ta console (ce que le simulateur ne peut pas prouver)

1. `Assign Group … Part 0.2` crée bien la 2ᵉ ligne (sinon le repli Lua prend le relais — le
   bilan le dit si aucun des deux ne marche).
2. Tuile séquence : couleur pleine quand elle joue, sombre sinon (`PreferCueAppearance`).
3. Sens de `InvertX`, extrémité de la vague, `XGroup 2` = alternance.
4. `CMD de cue : OK` au bilan.
5. `Copy Preset A At B /Overwrite` : la boucle change de couleur sans recuisson.

## Notes techniques (chaque point a été un échec silencieux avant)

- Tap d'une case : propriété **`Action`** (`Go+`, `None`). Un en-tête de groupe reste inerte.
- Un layout ne rend l'**image** d'une appearance que pour une macro → les tuiles-séquences
  utilisent des appearances à plat (`BackR/G/B`), les boutons gardent les PNG néon.
- `Goto` n'enchaîne pas les cues `Follow` ; seul `Go+` le fait.
- `OffFade` n'existe pas sur 2.5 ; le fondu d'arrêt vit dans `Off … Fade X`.
- Valeurs de propriétés **sensibles à la casse** (`"Follow"`, `"Yes"`), grilles MAtricks
  remises à `"None"` (jamais `0`).
- Un `Cook` ou un `Store` sans option ouvre un popup, impossible depuis un plugin → options partout.
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
