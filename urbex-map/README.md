# 🏚️ Urbex Atlas

Carte collaborative d'exploration urbaine — référencez vos spots **faits**, **à faire**,
**repérés** ou **perdus**, à deux (ou plus), en temps réel.

![statuts](https://img.shields.io/badge/statuts-fait%20·%20à%20faire%20·%20repéré%20·%20perdu-f59e0b)

## ✨ Fonctionnalités

- 🗺️ **Carte plein écran** avec 4 fonds : satellite mondial (Esri, imagerie mise à jour
  très régulièrement), **satellite IGN haute résolution** (France), plan OSM et topo,
  plus une surcouche « noms de lieux » pour se repérer en vue satellite
- 📍 **Spots** : statut (Fait ✅ / À faire 🎯 / Repéré 👀 / Perdu 🚫), catégorie (usine,
  château, hôpital, bunker…), niveau de danger, description, notes d'accès, photos, date de visite
- 🔎 **Recherche & filtres** : par nom, statut, catégorie ; recherche d'adresse ou de
  coordonnées GPS ; distance depuis ta position
- 🥾 **Itinéraire d'approche** par spot : place le parking 🅿️ et les étapes, le tracé
  suit automatiquement **les sentiers** (routage piéton BRouter/OpenStreetMap, sans clé),
  avec distance, temps de marche, navigation Google Maps/Waze jusqu'au parking, et
  repli « à vol d'oiseau » hors connexion
- 👥 **Collaboration temps réel** : chaque spot ajouté ou modifié apparaît instantanément
  chez l'autre (Supabase, gratuit), avec « ajouté par »
- 📱 **Pensé pour le terrain** : géolocalisation, lien Google Maps / Waze par spot,
  exports GPX (Organic Maps, OsmAnd), **KML (Google Earth)** et JSON (sauvegarde /
  import) — sur iPhone, l'export passe par la feuille de partage (Fichiers, AirDrop…)
- 🔒 **Privé** : la carte n'est visible que par les comptes connectés — pense à
  **fermer les inscriptions** une fois vos deux comptes créés (voir plus bas)

## 🚀 Lancer l'app

```bash
cd urbex-map
npm install
npm run dev
```

L'app démarre en **mode local** (spots enregistrés dans le navigateur) : parfait pour
tester tout de suite, sans aucun compte.

## 👥 Activer la collaboration (gratuit, ~10 min)

1. Crée un compte sur [supabase.com](https://supabase.com) et un nouveau projet
   (le plan gratuit suffit largement).
2. Dans le projet : **SQL Editor → New query**, colle le contenu de
   [`supabase/schema.sql`](supabase/schema.sql) et clique **Run**.
3. Récupère dans **Settings → API** : l'**URL du projet** et la clé **anon / public**.
4. Deux façons de brancher l'app :
   - **Dans l'app** : bouton ⚙️ Réglages → colle l'URL et la clé → Activer la synchro
     (ton cousin fait pareil sur son appareil, avec les mêmes valeurs) ;
   - **Ou au build** : copie `.env.example` vers `.env` et remplis les deux variables —
     dans ce cas la synchro est déjà active pour tous ceux qui ouvrent l'app.
5. Chacun crée son compte (pseudo + email + mot de passe) → vous voyez la même carte,
   synchronisée en direct. 🎉
6. **🔐 Important — une fois vos deux comptes créés** : ferme les inscriptions dans
   **Dashboard → Authentication → Sign In / Providers** → décoche
   **« Allow new user signups »**. Sans ça, quelqu'un qui découvre l'URL de votre
   projet pourrait créer un compte et voir votre carte (adresses sensibles !).

> 💡 Par défaut Supabase demande une confirmation par email à l'inscription.
> Pour simplifier : Dashboard → **Authentication → Providers → Email** → désactive
> « Confirm email ».

> ⚠️ Tes spots créés en mode local restent dans le navigateur : exporte-les en **JSON**
> (bouton en bas de la liste) avant d'activer la synchro, puis réimporte-les.

### Inviter quelqu'un (une fois les inscriptions fermées)

**Authentication → Users → Invite user** dans le dashboard Supabase : la personne
reçoit un email d'invitation et peut créer son mot de passe, même quand les
inscriptions publiques sont désactivées. C'est la façon propre d'ajouter un
troisième explorateur plus tard. 😎

### Connexion Google (optionnel)

Le bouton « Continuer avec Google » est intégré à l'app, mais il faut activer le
fournisseur côté Supabase (sinon il affichera une erreur explicite) :

1. Supabase → **Authentication → Sign In / Providers → Google** → Enable, et copie
   l'**URL de callback** affichée.
2. Sur [console.cloud.google.com](https://console.cloud.google.com) : crée un projet →
   **APIs & Services → Credentials → Create credentials → OAuth client ID** (type
   *Web application*) → ajoute l'URL de callback Supabase dans *Authorized redirect URIs*.
3. Colle le **Client ID** et le **Client secret** dans la page Google de Supabase.

> 💡 Franchement, pour deux utilisateurs, l'email + mot de passe marche très bien et
> évite cette config — et la connexion Google dans une PWA installée sur iOS peut
> parfois rouvrir Safari au lieu de l'app. À activer seulement si vous y tenez.

## 📲 Installer l'app sur vos téléphones (iPhone, iPad, Android)

Urbex Atlas est une **PWA** : une fois l'app en ligne (voir ci-dessous), chacun peut
l'installer comme une vraie app, avec son icône et en plein écran :

- **iPhone / iPad** : ouvre l'URL dans **Safari** → bouton **Partager** →
  **« Sur l'écran d'accueil »**.
- **Android** : ouvre l'URL dans **Chrome** → menu **⋮** → **« Installer l'application »**
  (ou accepte la bannière d'installation).

Bonus terrain : les zones de carte déjà consultées restent disponibles en cache,
même sans réseau. 📵

## 🌍 Mettre l'app en ligne (pour y accéder depuis vos téléphones)

Le plus simple : [Vercel](https://vercel.com) (gratuit) — avec **mise à jour
automatique à chaque push GitHub**, fini les zips à téléverser :

1. Pousse ce dossier sur GitHub (c'est déjà fait si tu lis ceci 😉).
2. Sur Vercel : **Sign up with GitHub** → **Add New → Project** → importe le repo →
   *Root Directory* : `urbex-map` (framework Vite détecté tout seul) →
   ajoute les variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
   (comme ça la synchro est active pour tout le monde sans rien coller dans l'app) → **Deploy**.
3. Chaque push sur la branche principale redéploie le site automatiquement en ~1 min
   (et chaque branche a son URL de prévisualisation).
4. Envoie l'URL à ton cousin — il crée son compte et c'est parti.

(Hébergement statique classique type Hostinger : ça marche aussi, mais sans
mise à jour automatique — il faut re-téléverser un build à chaque version.)

## 🛰️ À propos des vues satellite

- **Satellite (Esri)** : couverture mondiale, imagerie régulièrement rafraîchie.
- **Satellite IGN 🇫🇷** : orthophotos officielles très détaillées sur la France.
- Sur chaque fiche spot, le bouton **Google Maps** ouvre la position pour comparer avec
  une autre source d'imagerie (souvent plus récente selon les zones).

## 🧰 Stack

React 18 · Vite · Tailwind CSS 4 · Leaflet / react-leaflet · Supabase (auth + Postgres +
Realtime) · lucide-react

## ⚠️ Rappel

L'urbex se pratique à vos risques : lieux privés et parfois dangereux.
Ne forcez jamais un accès, ne divulguez pas les adresses publiquement, et prudence. 🙏
