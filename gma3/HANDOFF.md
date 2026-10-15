# Color Picker LIVE — passation (v9.2.3, 15 octobre 2026)

Document de reprise pour continuer le travail dans une nouvelle conversation. Tout ce qui est
établi, tout ce qui reste ouvert, et comment tester.

## 1. Le projet en trois lignes

- **Quoi** : un plugin Lua pour grandMA3 onPC **2.5.0.3** qui construit un **board de busking couleur**
  dans un Layout (une ligne par groupe + ALL, 12 couleurs, 5 vagues FX par groupe, pastilles C1/C2,
  rangées FADE, vitesse / fondu FX en live). Opérateur : Axel, francophone, exigeant sur le style
  « MA2 néon » et la réactivité en show.
- **Où** : dépôt `milax1905/bento-budget`, branche `claude/grandma3-lua-color-picker-dqrwhl`, PR #1
  (brouillon). Fichiers : `gma3/ColorPicker.lua` (le plugin, ~2770 lignes), `gma3/ColorPicker.xml`,
  `gma3/README.md` (mode d'emploi), `gma3/test/mock_test.py` + `all_scenarios.py` + `mutations.py`
  (simulateur), ce `HANDOFF.md`.
- **Comment on travaille** : chaque version est testée sur le simulateur (3 suites), commitée avec les
  lignes d'attribution, poussée, puis les deux fichiers du plugin sont envoyés à Axel qui les copie dans
  le dossier plugins, fait `ReloadAllPlugins`, relance et envoie des captures d'écran. Les captures sont
  analysées **pixel par pixel** (décodeur PNG maison dans la conversation : pas de PIL dans
  l'environnement) : c'est ce qui a permis de comprendre la géométrie des cases.

## 2. Exigences permanentes d'Axel

- 100 % restitution en show : le programmer n'est jamais touché pendant le show.
- Une seule confirmation, jamais de popup ni d'erreur pendant un show (toutes les commandes ont une
  option `/NoConfirmation`, `/Overwrite`…).
- Tout en **recipes** (Group + Preset + timings MAtricks), cuisinées par la console (`Cook /Overwrite`).
- Presets couleur universels `4.101+` réutilisés, **jamais effacés**.
- Tuiles **néon** : sombre avec contour coloré au repos, **remplie** quand elle joue (le style des
  pastilles C1/C2, qu'il trouve « nickel »).
- Rangées FADE avec état visible (bouton actif surligné), réaction **immédiate** à l'appui.
- 5 formes de vague par ligne de groupe (`J>C`, `C>J`, `E>I`, `I>E`, `1/2`), pastilles C1/C2.
- Ne livrer les fichiers que lorsqu'ils sont vraiment finis et testés.
- Il préfère un assistant court : **un seul écran** avant la construction.

## 3. Conventions du dépôt

- Commits : message clair, puis en fin de message :
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` et
  `Claude-Session: https://claude.ai/code/session_01WXLotR1ZHcFfVJPmEBaSaD` (remplacer par l'URL de la
  nouvelle session). Jamais de nom de modèle dans le code ou les titres de PR.
- Push : `git push -u origin claude/grandma3-lua-color-picker-dqrwhl`. PR #1 : corps terminé par
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + l'URL de session.
- Le check **Vercel** de la PR échoue à chaque commit : c'est l'app web `urbex-map` du dépôt, sans lien
  avec `gma3/`. Un commentaire l'explique déjà sur la PR ; ne pas en rajouter.
- Dépendance de test : `pip install lupa` (Lua 5.5 via lupa 2.8 : les variables de boucle sont `const`).

## 4. État au 15 octobre : v9.2.3

### Vérifié sur la console d'Axel (captures)

- Le board se construit (9 lignes : ALL + 8 groupes, 12 couleurs, 40 vagues, 184 cases).
- **Groupe union `CP ALL`** (Group 101) stocké et vérifié ; la ligne ALL fonctionne.
- **Substitution `$var`** dans les macros : OK (la surbrillance en 3 lignes marche : FADE couleur et
  C1 ont changé d'état à l'appui). Variables globales semées.
- Style néon de retour : contour coloré + intérieur sombre à 10 % de teinte (identique sur toutes les
  lignes, mesuré). Pastilles C1/C2 et boutons FADE / FX en images : rendu correct.
- Les boutons FADE affichent `0.5s` (texte de case : la console **retire les points des noms**).
- Les presets `4.103-4.112` venaient d'une ancienne palette : « 10 corrigés » au plan, re-stockés.

### Le bilan de la v9.2 sur sa console (texte exact)

```
Board construit AVEC DES REFUS : regarde les controles.
 - C1/C2 par Assign Preset (la copie casse la reference) : pastilles plus lentes.
 - Rangees de reglage longues (formes par plage refusees sur ce build) : FADE 112 lignes,
   FX FONDU 84 lignes, C1/C2 45 lignes -> quelques secondes par appui, pas en rafale.
 - Cues non cuisinees, 1ere : Sequence 125 "FACE Red" (groupe vide ou preset non applicable ?)
Vagues pulsees : ALPHA SPOT ... E>I / I>E, BLINDER E>I / I>E, PAR LED SCENE ..., AYRA ..., PAR LED BOULE ...
Sequences 101-248 - Macros 101-155 (tuiles 157-304)
```

Le bloc CONTROLES (sous la barre de défilement) n'a **pas** été vu : il manque la ligne
`Commandes refusees : N / 1ere : ...` et `Set par plage : couleurs ?, FX oui, Cook oui`. Axel doit
envoyer une capture de la fenêtre **System Monitor** (les lignes `[ColorPickerLive]` et `[CP]`) après
une construction.

### La géométrie des cases, mesurée (le point qui a coûté trois versions)

Mesures en pixels écran sur les captures (zoom ≈ 1:1, pas natif P = 42 détecté sur la case titre) :

| Élément | Demandé | Tracé | Note |
|---|---|---|---|
| Case w=1 (séquence, macro) | 42×42 | **38×38** | 2 px de marge de chaque côté |
| Image d'une macro (mode `Bar`) | — | **30×29** à (+4, +8) de la case tracée | 4 px à gauche/droite, 8 px en haut (bande du nom, même cachée), 1 px en bas |
| Séquence sous la macro (v9.2) | 42×42 | 38×38 | remplit toute la case → la couleur **déborde** autour du contour, tuile allumée carrée |
| Séquence rétrécie (v9.2.1, retrait 4 px) | 34×34 à (+4,+4) | 30×30 | la **position et la taille** demandées sont bien appliquées (tracé = demandé − 2 px par côté) |
| Pas entre cases | 1,16 P | 49 px | |

Conclusion : le contour (image) est plus petit que la case ; il faut **caler la séquence sur la zone
image**. v9.2.3 demande pour chaque séquence sous une macro :
`SEQ_UNDER_MACRO = { dx = 6/42, dy = 3/42, w = 30/42, h = 29/42 }` (fractions de P, axe Y vers le
haut : `dy` = marge basse) → zone tracée 26×25 px, 2 px **à l'intérieur** du trait du contour (le trait
fait ~3 px à l'écran). Les coins de l'image contour sont redevenus transparents.

**Non encore vérifié sur la console.** À regarder sur la capture d'Axel (v9.2.3) :
- tuile allumée = pavé arrondi entièrement coloré, sans débordement ;
- au repos, aucun liseré de couleur ni de sombre autour du contour ;
- si un liseré apparaît d'un côté, corriger la constante correspondante de `SEQ_UNDER_MACRO`
  (1/42 ≈ 1 px) ; les deux lignes mesurées différaient déjà de 2 px (arrondis de position), d'où la
  marge de sécurité de 2 px.

## 5. Problèmes ouverts pour la v9.3 (par priorité)

1. **Lignes sans couleur** (FACE, probablement BLINDER : projecteurs conventionnels ?). Leurs cues ne
   cuisent pas → titre « AVEC DES REFUS ». Plan : après le nettoyage et les presets, **probe par
   groupe** sur la séquence de test (`Store Sequence P Cue 1` → `Assign Group g … Part 0.1` →
   `Assign Preset 4.101 …` → `Cook /Overwrite` → lire `OwnDataPresent`) ; si « No », retirer la ligne
   et l'annoncer (« Lignes retirées : FACE, BLINDER (aucune cue cuisinée : groupe sans couleur ?) »),
   recalculer le plan (`computePlan()` est pur lecture) avant le groupe union. Ne pas compter ces cues
   comme des refus. À confirmer avec Axel que FACE et BLINDER sont bien sans couleur.
2. **FADE 112 lignes / FX FONDU 84** : la probe R1 (`Set Sequence 101 Thru 208 Cue 1 Property
   "CueInFade" 0.07` puis relecture sur la séquence 208) échoue sur sa console, alors que R3
   (`Set Sequence 149 Thru 188 Cue k Part 0.1 Property "DelayToX"`) et R2 (`Cook … Thru …`) passent.
   Cause inconnue (commande refusée ? relecture différente ?). Plan : `Printf` de la réponse et de la
   relecture de chaque probe ; essayer la forme **`Part 0`** par plage (`Set Sequence a Thru b Cue 1
   Part 0 Property "CueInFade" x`, R1b) avant de retomber sur le détail par séquence. C'est ce qui
   rendait déjà les FADE lents en v9.0 (même probe, même repli).
3. **C1/C2 par Assign Preset (45 lignes)** : la probe 4d (`Copy Preset 4.101 At Preset 4.113
   /Overwrite` + `Recast`, relecture de `Values` de la ligne de recipe et de `OwnDataPresent`) a conclu
   « la copie casse la référence ». Hypothèse : `OwnDataPresent` passe à « No » après la copie tant
   que la cue n'est pas recuite. Plan : après Copy + Recast, si la cue est vide → `Cook Sequence a
   Thru b /MergeLowPriority` et relire ; si OK → pastille = Copy + Recast + Label + Cook par plage +
   en-tête + 4 lignes de surbrillance (9 lignes). Sinon probe R4 : `Assign Preset 4.c At Sequence a
   Thru b Cue 1 Part 0.1` par plage (1 ligne + Cook) ; en dernier recours l'Assign par boucle (45).
4. **Bilan** : mettre la raison du titre « AVEC DES REFUS » juste sous le titre (nombre de refus et
   première commande, cues non cuisinées) ; le bloc CONTROLES est trop bas pour être lu sans défiler.
5. Informations attendues d'Axel : capture **System Monitor** après construction ; FACE / BLINDER
   sans couleur ? ; capture des tuiles v9.2.3 (une allumée, une au repos, en gros plan).

## 6. Architecture (ce qu'il faut savoir pour modifier le code)

- **Fichier unique** `ColorPicker.lua` : en-tête (constantes, palette, `FX_DIRS`, `fmtNum`), générateur
  PNG pur Lua (`tilePng` : contour / pavé plein, 96 px, trait 9, rayon 18, centre alpha 26),
  utilitaires (`toNum`, `parseRange`, `objectExists`, `scanGroups`, `groupName`, `presetName`,
  `breathe`), constructeurs (`makeAppearance`, `makeMacro` avec relance des lignes), **commandes
  vérifiées** (`CP`, `run`, `cmdOk`, `setProp` avec relecture, `setPropTry`, `setDisplayProp`), recipes
  (`addRecipeLine`, `setLineProp`, `cook`, `cueHasData`), membres des groupes (`groupMembers` par
  `selectiondata`, repli sélection), `probeOnScratch(seq, macro)` (canal variable, CMD de cue, `Off …
  Fade`, substitution `$var`), `fillLayout` (placement ; `fit` = calage sous une macro), puis `main` :
  `computePlan()` (pur lecture : groupes, membres, mode ALL, numérotation, occupation, texte du plan)
  → accueil (Construire / Regler / Re-cuisiner / Annuler) → nettoyage → groupe union → appearances →
  images → presets → slots C1/C2 → probes → séquences couleur → séquences FX → probes par plage →
  probe copie → macros → tuiles → layout → variables → bilan.
- **Numérotation** (base B = 101, NC = 12) : séquences couleur `B + (ligne−1)·nColors + (ci−1)`, FX
  `seqFx0 = B + lignes·nColors`, 5 par groupe ; macros de réglage `B..B+54` (Off All, en-têtes, FADE
  ×2, C1/C2, FX VITESSE, FX FONDU), **tuiles = séquence + 56** ; appearances `B..` (pleines, images),
  `B+12..` (contours « Dim », images : pastilles au repos **et** tuiles), `B+24` sombre, `+25` gris,
  `+26` accent, `+27` rouge Off All, `+28` FX dort, `+29` FX joue, `+30` contour FX, `+31..` cue couleur
  à plat ; images 3.`B..` ; presets 4.`B..B+11` + slots `B+12`, `B+13` ; groupe union = premier numéro
  libre ≥ B (ou un « CP ALL » existant). Plages réservées (nettoyées) : Seq `B..B+215`, Macro
  `B..B+271`, App `B..B+53`, Img `B..B+27`.
- **Macros live** (lignes) : tuile 1 ; FADE couleur 5 (Set par plage, Label, 3 surbrillance) ; FADE
  arrêt 5 ; C1/C2 8 ; FX VITESSE 7 (+2 si vagues pulsées) ; FX FONDU 6. Surbrillance :
  `Assign Appearance <gris> At Macro $cp_fc` / `Assign Appearance <accent> At Macro <moi>` /
  `SetGlobalVariable "cp_fc" <moi>` ; variables `cp_fc cp_fo cp_fv cp_ff cp_c1m cp_c1a cp_c2m cp_c2a`,
  plus `cp_all_src` / `cp_all_slot` pour Re-cuisiner.
- **Principe** : chaque commande lit le retour de `Cmd()` ; chaque propriété écrite est relue ; une
  relecture impossible = « non vérifiable », jamais un succès ; les probes écrivent une valeur
  temporaire, relisent, restaurent. Bilan par état le plus grave : REFUS / MODE DEGRADE / contrôles
  partiels / tout passe.
- **Simulateur** (`gma3/test/`) : console factice en Lua (`MOCK`) avec boutons de scénario
  (`ASSIGN_CREATES_LINE2`, `SELDATA_OK`, `RANGED_SET_OK`, `RANGED_FX_OK`, `RANGE_COOK_OK`,
  `OFF_FADE_OK`, `CMD_EXEC_OK`, `CMD_RETURNS_NIL`, `HANDLE_SET_SILENT`, `COPY_KEEPS_REF`,
  `STORE_TRIG_AS_GO`, `MACRO_SUB_OK`, `REFUSE[motif] = réponse`, `DELETE_LEAVES`) ; `Go+ Macro` exécute
  les lignes avec substitution ; `check()` vérifie tout (recipes, CMD, macros exactes, layout, calage,
  variables, images). `python3 gma3/test/mock_test.py` ; `all_scenarios.py` (37 scénarios, boutons
  pressés) ; `mutations.py` (32 bugs réintroduits, 32 attrapés sur la v9.2.3).
  Les cibles de mutation sont des chaînes exactes du source : les mettre à jour quand on édite ces lignes.

## 7. Faits console établis (ne pas re-découvrir)

- Tap d'une case = propriété `Action` (`Go+` / `None`). Un élément de layout pour une **séquence** ne
  rend que la couleur de fond de son appearance (pas l'image) ; une **macro** rend l'image.
- `PreferCueAppearance = Yes` : la case de la séquence montre l'appearance de la cue quand elle joue.
- Sur 2.5.0.3, **aucune 2ᵉ ligne de recipe** ne se crée (`Assign … Part 0.2` et `Acquire` refusés) →
  groupe union.
- `Goto` n'enchaîne pas les `Follow`, `Go+` oui. `OffFade` n'existe pas, `Off … Fade X` oui.
- Valeurs sensibles à la casse (`"Follow"`, `"Yes"`) ; nombres nus ; `WrapAround 1` ; `Cook` / `Store`
  sans option = popup (impossible depuis Lua).
- Le handle objet accepte en silence une propriété inconnue → toujours relire.
- `SelectionFirst()` renvoie un index de subfixture ; `Group.selectiondata[*].sf_index` →
  `GetSubfixture(idx).fixture.fid`.
- Les variables **globales** (`SetGlobalVariable`) sont sauvées avec le show ; `$var` est substitué dans
  une ligne de macro (prouvé).
- La console **retire les points** des noms d'objets (`0.5s` → `05s`, `v9.0` → `v90`) : textes de case
  pour les valeurs décimales, bannière `v9`.
- Géométrie des cases : voir §4.

## 8. Fichiers à transférer

`gma3/ColorPicker.lua`, `gma3/ColorPicker.xml`, `gma3/README.md`, `gma3/HANDOFF.md`,
`gma3/test/mock_test.py`, `gma3/test/all_scenarios.py`, `gma3/test/mutations.py`.
