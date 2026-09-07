# Cubeland Métiers

Dossier de travail autour du mod `cubelandmetiers` (Forge 43, Minecraft 1.19.2) du serveur Cubeland.

## Contenu

- `config/plats.json` : catalogue de cuisine nettoyé, **utilisable tel quel avec la 1.4.2**.
  207 plats au lieu de 291 : plus de buissons, de sacs ni de variantes de couleur ;
  familles corrigées ; palier 1 garni (grillades, salades) ; paliers 1 à 5 racontés
  par poste de cuisine (feu de camp, poêle, marmite, bouilloire, Nether).
- `scripts/curer_plats.py` : le script qui produit ce catalogue à partir de l'original,
  avec les règles et la liste des corrections à la main. Reproductible :

  ```
  python3 scripts/curer_plats.py scripts/plats-1.4.2-origine.json config/plats.json --detail
  ```

- `scripts/plats-1.4.2-origine.json` : le catalogue livré dans le jar 1.4.2, pour référence.

## Installer le catalogue sur le serveur

```
cp cubeland-metiers/config/plats.json <serveur>/config/cubeland-metiers/plats.json
```

puis, en jeu ou dans la console : `/metiers recharger`.

Les recettes déjà découvertes par les joueurs restent acquises. Les objets retirés du
catalogue redeviennent de simples aliments (plus d'infobulle, de qualité ni de valeur).

## Documents

- Audit du code 1.4.2 : https://claude.ai/code/artifact/80585fa6-f833-48eb-b723-f1f403c3f703
- Le Carnet du cuisinier, design de la progression 2.0 : https://claude.ai/code/artifact/da6ccddf-f632-46f5-a365-c3b8eb663480

## Suite

Le code source du mod n'est pas encore dans ce dépôt. Quand le projet Gradle y sera
poussé, la 2.0 (corrections de l'audit, commandes, premiers pas) se fera ici.
