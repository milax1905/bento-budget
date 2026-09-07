# Cubeland Métiers

Le mod `cubelandmetiers` (Forge 43, Minecraft 1.19.2) du serveur Cubeland, et ce qui l'entoure.

## Contenu

- `mod/` : **le projet Gradle du mod, version 2.0.0.** Sources, ressources, tests, mode démo. Voir [`mod/README.md`](mod/README.md) pour compiler, la structure du code et le changelog.
- `config/plats.json` : le catalogue de cuisine nettoyé (207 plats, variantes reliées). C'est le même que celui livré dans le jar 2.0 ; il se pose aussi tel quel sur un serveur 1.4.2.
- `scripts/curer_plats.py` : le script qui produit ce catalogue à partir de l'original, reproductible :

  ```
  python3 scripts/curer_plats.py scripts/plats-1.4.2-origine.json config/plats.json --detail
  ```

- `scripts/plats-1.4.2-origine.json` : le catalogue livré dans le jar 1.4.2, pour référence.

## Le jar, sans rien installer

À chaque poussée qui touche `mod/`, GitHub compile le mod, lance les tests et dépose le jar dans `releases/` sur la branche (workflow `.github/workflows/cubeland-metiers.yml`). Le jar est aussi dans l'onglet Actions de GitHub, comme artefact de l'exécution.

## Compiler le mod soi-même

Sur une machine avec le JDK 17 et l'accès aux serveurs de Forge et Mojang :

```
cd mod
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew test build
```

Le jar sort dans `mod/build/libs/cubeland-metiers-2.0.0.jar`. La 2.0 change le protocole réseau : serveur et clients (launcher) passent ensemble.

## Installer seulement le catalogue sur un serveur 1.4.2

```
cp cubeland-metiers/config/plats.json <serveur>/config/cubeland-metiers/plats.json
```

puis `/metiers recharger`. Les recettes déjà découvertes restent acquises.

## Documents

- Audit du code 1.4.2 : https://claude.ai/code/artifact/80585fa6-f833-48eb-b723-f1f403c3f703
- Le Carnet du cuisinier, design de la progression 2.0 : https://claude.ai/code/artifact/da6ccddf-f632-46f5-a365-c3b8eb663480
