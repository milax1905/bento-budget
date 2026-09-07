# Cubeland Métiers

Mod Forge 1.19.2 pour le serveur français **Cubeland**. Il tient les six métiers des joueurs, le palier de cuisine, le livre des plats et (quand elle est là) le pont avec la boutique `cubeboutique`.

**Modid :** `cubelandmetiers`  
**Version :** 1.4.2  
**Minecraft / Forge :** 1.19.2 / 43.4.4  
**Java :** 17 (ne pas compiler avec le JDK 21)

## Les six métiers

Chaque geste compte : miner, couper, cultiver, chasser, pêcher. Le sixième métier, le **cuisinier**, progresse autrement : ce sont les *recettes différentes* qui font monter les paliers, pas la quantité cuisinée.

| Métier     | Comment progresser                          |
|------------|---------------------------------------------|
| Mineur     | Casser de la pierre et des minerais         |
| Bûcheron   | Abattre des arbres                          |
| Fermier    | Récolter des cultures arrivées à maturité   |
| Chasseur   | Abattre des créatures                       |
| Pêcheur    | Sortir des prises de l'eau                  |
| Cuisinier  | Cuisiner, découvrir, monter de palier       |

Touche **J** (configurable) ou `/metiers` ouvre le panneau.

## Cuisine

Cinq paliers, du feu de camp aux plats à effet :

1. Apprenti cuisinier — fourneau, planche
2. Cuisinier en herbe — poêle
3. Cuisinier confirmé — marmite
4. Artisan cuisinier — bouilloire
5. Maître cuisinier — nether

Chaque plat appartient à une **famille** (féculents, viandes, poissons, soupes, légumes, desserts, boissons). Manger un plat donne l'effet de sa famille ; plus la **qualité** (1 à 5 : ordinaire → signature) est haute, plus l'effet dure. Un prix de base, multiplié par la qualité, sert à la vente (`/cuisinier vendre`, `/cuisinier vendre tout`, `/cuisinier prix`).

Les réglages vivent dans `config/cubeland-metiers/` (paliers, XP, chances, postes, commission…).

## Boutique `cubeboutique` (optionnelle)

Dépendance **non obligatoire**. Si le mod boutique est chargé :

- reprise unique des métiers déjà enregistrés côté boutique (réglage `importerBoutique`) ;
- l'expérience des métiers peut être reflétée vers la boutique pour ses bonus de prix (`refleterVersBoutique`) ;
- la vente des plats passe par les comptes de la boutique (commission configurable).

Sans boutique, les métiers et la cuisine fonctionnent tout seuls ; il n'y a simplement pas d'argent.

Le code de la boutique vit dans le dossier [`boutique/`](boutique/) (mod `cubeboutique` 3.3.1, projet Gradle séparé). Voir [`boutique/README.md`](boutique/README.md) pour l'achat à l'unité et la note de protocole.

## Compiler

JDK **17** obligatoire. Le JDK 21 (souvent le défaut système) ne convient pas à Forge 1.19.2.

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew build
```

Le jar se trouve dans `build/libs/cubeland-metiers-1.4.2.jar`. Une copie est aussi dans `releases/`.

## Tester les interfaces (mode démo)

Pour regarder les écrans **sans serveur**, depuis le menu titre :

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew runClient -Pdemo=0   # onglet Métiers
./gradlew runClient -Pdemo=1   # onglet Cuisine
./gradlew runClient -Pdemo=2   # Le Livre
```

Cela pose `-Dcubeland.demo=true` et `-Dcubeland.demo.ecran=N`, remplit le panneau de données factices et ouvre l'écran choisi. La fenêtre de démo fait 1600×900. Un bouton « Metiers (demo) » reste aussi sur le menu titre, au cas où.

Sans `-Pdemo`, le mode démo est totalement inerte : aucun effet en jeu normal.

## Compatibilité 1.3.4 → 1.4.2

Les 1.4.x **ne touchent pas** au protocole réseau, aux paquets, aux NBT ni aux identifiants. Un client 1.4.2 peut parler à un serveur qui tourne encore en 1.3.4 (et l'inverse). Seul le client a besoin de la mise à jour pour profiter des nouveaux écrans.

## Changelog 1.3.4 → 1.4.0

Refonte **client uniquement** (interfaces). Rien côté métier, cuisine, commandes, sauvegarde ou réseau.

- **Chevauchements corrigés** : les noms autour du cadran (métiers et idées cuisine) sont placés par quadrant, tronqués ou coupés sur deux lignes pour ne plus se marcher dessus. Le HUD repas/cuisinier réserve la place des étoiles de qualité avant de tronquer le nom du plat.
- **Livre réorganisé** : grille 4×3 avec recherche, pastilles de familles, défilement, compteur, vignettes connues/inconnues (palier + prix).
- **Fiches plat** : recette en cercle (≤ 4 ingrédients) ou en liste, colonne atelier / effet / chances et prix par qualité. Les plats inconnus le disent clairement, sur deux lignes.
- **Guide du cuisinier** : cinq sections (Débuter, Paliers, Familles, Qualités, Vendre) accessibles depuis le bouton GUIDE du livre.
- **Mode démo** : `./gradlew runClient -Pdemo=N` pour inspecter les UIs hors serveur.

## Changelog 1.4.0 → 1.4.1

Toujours **client uniquement**.

- **Fiche plat** : deux onglets **FAIRE** (étapes concrètes : ingrédients, atelier, clic-droit sur le poste, inventaire / première découverte / palier) et **VALEUR** (atelier, effet, chances et prix). L'onglet FAIRE s'ouvre par défaut.

## Changelog 1.4.1 → 1.4.2

Toujours **client uniquement**.

- **Onglet FAIRE** de chaque fiche : plus un texte générique. Le poste est nommé (marmite, four, planche…), puis les gestes **de cet atelier** : poser le bloc, remplir, attendre, récupérer, clic-droit pour que le carnet note la recette.

## Licence

Tous droits réservés — Cubeland.

## Captures des interfaces (v1.4.0)

Les captures des ecrans retravailles sont dans [docs/captures/](docs/captures/) : onglets Metiers et Cuisine, le Livre, fiches de plat (connue/inconnue) et les pages du guide du cuisinier.
