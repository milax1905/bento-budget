# Cubeland Métiers

Mod Forge 1.19.2 pour le serveur français **Cubeland**. Il tient les six métiers des joueurs, la cuisine en cinq paliers, le carnet de recettes et ses commandes, et (quand elle est là) le pont avec la boutique `cubeboutique`.

**Modid :** `cubelandmetiers`
**Version :** 2.0.0
**Minecraft / Forge :** 1.19.2 / 43.4.4
**Java :** 17 (ne pas compiler avec le JDK 21)

## Les six métiers

Chaque geste compte : miner, couper, cultiver, chasser, pêcher. Le sixième métier, le **cuisinier**, progresse autrement : ce sont les *recettes différentes* qui font monter les paliers, pas la quantité cuisinée.

Touche **J** (configurable), `/metiers`, ou le bouton de l'inventaire de la boutique ouvre le panneau.

## La cuisine

Cinq paliers, un poste par palier :

1. Apprenti cuisinier — feu de camp, fourneau, planche
2. Cuisinier en herbe — poêle (dès 4 recettes)
3. Cuisinier confirmé — marmite (10)
4. Artisan cuisinier — bouilloire (18)
5. Maître cuisinier — Nether (28)

Chaque plat a une **famille** (féculents, viandes, poissons, soupes, légumes, desserts, boissons) qui donne son effet quand on le mange, une **qualité** tirée au sort (Ordinaire → Signature) qui allonge l'effet et fait le prix, et une valeur de vente.

**Un plat compte quand il sort d'un atelier.** Un plat trouvé dans un coffre, acheté ou reçu garde un effet minimal mais n'entre pas au carnet.

### Le carnet et ses commandes

Trois commandes sont toujours ouvertes dans l'onglet Cuisine, une de chaque sorte, et aucune ne peut échouer :

- **Découverte** — des plats qu'on ne connaît pas encore, dans une famille ou à un poste. Fait monter les paliers.
- **Livraison** — des plats connus, en quantité, avec une qualité minimale. Payée 150 % du prix par la boutique, sans commission. Une livraison sur quatre est un **défi** du palier au-dessus : la réussir débloque le plat.
- **Maîtrise** — sortir une qualité, cuisiner sa favorite, faire manger un autre joueur.

À la première connexion, cinq **premiers pas** guident le joueur (allumer le feu, première fournée, goûter, vendre, première commande) et offrent un couteau en fer.

### Commandes

```
/metiers                    ouvre le panneau
/metiers cuisine            ouvre le carnet
/cuisinier vendre [tout]    vend le plat en main, ou tous les plats
/cuisinier prix             estime le plat en main
/cuisinier livrer           livre la commande de livraison en cours
/metiers recharger          relit réglages et catalogue, les renvoie aux joueurs (op)
/metiers xp <joueur> <métier> <n>   (op)
/cuisinier palier <joueur> <0-5>    force un palier, 0 pour l'annuler (op)
```

## Réglages

Le serveur est le seul à lire `config/cubeland-metiers/` :

- `reglages.json` — XP, seuils de paliers, chances de qualité, prix, commandes. Des nombres et des interrupteurs, pas de texte.
- `plats.json` — le catalogue : `id`, `fam`, `poste`, `pal`, `val`, et `variante_de` pour qu'une part de tarte compte avec sa tarte.

Il envoie tout ça aux joueurs à la connexion. Les clients ne lisent aucun fichier ; ce qu'ils affichent est exactement ce que le serveur applique. Les textes sont dans `assets/cubelandmetiers/lang/` (`fr_fr`, `en_us`).

## Boutique `cubeboutique` (optionnelle)

Dépendance **non obligatoire**. Si le mod boutique est chargé : reprise unique de l'expérience, reflet de l'XP pour ses bonus de prix, vente et livraisons créditées sur ses comptes. Une vente ne retire jamais les plats tant que la boutique n'a pas crédité.

## Compiler

JDK **17** obligatoire.

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew build          # jar dans build/libs/cubeland-metiers-2.0.0.jar
./gradlew test           # tests de la logique pure (niveaux, paliers, tirage)
```

## Regarder les écrans sans serveur (mode démo)

```bash
./gradlew runClient -Pdemo=0                          # onglet Métiers
./gradlew runClient -Pdemo=1                          # onglet Cuisine, avec trois commandes
./gradlew runClient -Pdemo=2                          # le Livre
./gradlew runClient -PdemoFiche=minecraft:rabbit_stew # une fiche
```

Le mode démo vit dans `src/demo` : il n'est jamais dans le jar livré.

## Logo

`src/main/resources/logo.png` est un logo de remplacement. Remplace-le par le logo Cubeland (carré, 128 × 128 ou plus) : c'est lui qui apparaît dans la liste des mods.

## Structure

```
fr.cubeland.metiers
├── CubelandMetiers   démarrage, cycle de vie, synchronisation
├── Reglages          les réglages, lus par le serveur, envoyés aux clients
├── Progression       niveaux et paliers, sans Minecraft (testé)
├── metier/           Metier, Metiers, DonneesMetiers (sauvegarde), EvenementsMetiers, PontBoutique
├── cuisine/          Plat, Famille, Catalogue, Qualite, Tirage (testé), Couteaux, Postes,
│                     Provenance (d'où vient un plat), Cuisine, Vente, Recettes, EvenementsCuisine
├── quete/            Quete, TypeQuete, Quetes (génération, suivi, livraison), PremiersPas, TextesQuete
├── reseau/           Reseau et les paquets (Sync, Etat, Cuisine, Quetes, Fiche, Repas, Annonce, Ouvrir,
│                     Demande, DemandeFiche, Livrer)
├── commande/         Commandes
└── client/           EtatClient, HudCuisine, Dessin, Palette, Txt, Ateliers, Touches, Redirection
    └── ecran/        EcranCubeland, Contexte (zones cliquables), Page, Widgets,
                      PageMetiers, PageCuisine, PageLivre, PageFiche, PageGuide
```

## Changelog

### 2.0.0

Refonte complète, sauvegardes et réglages de la 1.4 relus tels quels. **Protocole réseau 2** : serveur et clients passent ensemble.

Corrections
- `/cuisinier vendre tout` ne détruit plus les plats si la boutique ne crédite pas.
- L'XP de mineur, bûcheron, chasseur n'est plus donnée quand un mod de protection annule la casse ou la mort. Les animaux apprivoisés ne rapportent rien.
- Un palier forcé par un administrateur est stocké à part : plus de recettes fantômes dans le carnet.
- Le mode démo n'est plus dans le jar.

Règle de cuisine
- Un plat compte quand il sort d'un atelier (établi, four, menu de cuisine, ramassage près d'un poste). Un coffre de plats ne fait plus monter de palier.
- Chaque plat porte son auteur et sa provenance.

Synchronisation
- Le serveur envoie ses réglages et son catalogue à la connexion : HUD, guide, infobulles et prix affichent ce que le serveur applique. Les clients ne lisent ni n'écrivent plus de fichiers.
- Le panneau ne redemande plus les 291 plats à chaque ouverture.

Le carnet
- Trois commandes permanentes (découverte, livraison, maîtrise), un défi sur quatre, livraison depuis le panneau ou `/cuisinier livrer`.
- Cinq premiers pas guidés à la première connexion.
- Catalogue nettoyé : 207 plats au lieu de 291, variantes reliées à leur plat.

Interface et textes
- Écran découpé en pages avec des zones cliquables déclarées au dessin.
- Textes dans des fichiers de langue avec accents, français et anglais ; noms des plats traduits par le jeu ; chiffres tirés des réglages.
- Titres de métiers proportionnels au niveau maximum.

### 1.4.x

Voir l'historique git : refontes successives de l'interface client.

## Licence

Tous droits réservés — Cubeland.
