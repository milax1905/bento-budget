// src/googleAuth.js
// Auth Google OAuth 2.0 (PKCE) pour app Electron – version "debug+"
// - Port de callback dynamique
// - Logs détaillés + propagation error_description
// - Compatible Node 18+ (fetch natif), CommonJS
// - Utilise electron.shell pour ouvrir le navigateur

const crypto = require("crypto");
const http = require("http");
const { URL } = require("url");
const { shell, app: electronApp } = require("electron");

// ---------------------- Config ---------------------------------------------

// 1) Mets TON client_id ici si tu ne veux pas gérer .env en prod.
//    (client_id ≠ secret : ce n’est pas sensible pour une app desktop)
const FALLBACK_CLIENT_ID = "367731497005-e2tokhad2ff227r30jqb6navllickele.apps.googleusercontent.com";

// 2) Scopes
const SCOPES = [
  "openid",
  "email",
  "profile",
  // Pour Drive (ajoute/ajuste selon ton besoin)
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

// 3) Logs verbeux si DEBUG_OAUTH=1 (ou toujours pendant les dev)
const DEBUG = process.env.DEBUG_OAUTH === "1";

// Récupère le client_id (via .env si chargé par electron.js) ou fallback.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || FALLBACK_CLIENT_ID;

// ---------------------- Helpers --------------------------------------------

function log(...args) {
  // Centralise les logs (tu peux brancher sur un logger si besoin)
  console.log("[oauth]", ...args);
}
function logDebug(...args) {
  if (DEBUG) console.debug("[oauth:debug]", ...args);
}

// Génère un code_verifier (PKCE)
function genCodeVerifier() {
  return crypto.randomBytes(64).toString("base64url"); // Node18: base64url OK
}
function codeChallengeFromVerifier(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

// Démarre un petit serveur local et retourne l’URL de redirection + promesse de code
async function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const error_description = url.searchParams.get("error_description");

        // Page de retour visible dans le navigateur
        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<h1>Échec de la connexion</h1><p>${error}${error_description ? ` – ${error_description}` : ""}</p><script>window.close && window.close()</script>`
          );
          const e = new Error(`${error}${error_description ? `: ${error_description}` : ""}`);
          e.oauth = { error, error_description };
          resolve({ server, error: e }); // on résout pour fermer proprement le serveur
          return;
        }

        if (!code) {
          res.statusCode = 400;
          res.end("Missing code");
          const e = new Error("Missing authorization code");
          e.oauth = { error: "missing_code" };
          resolve({ server, error: e });
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<h1>Connexion réussie</h1><p>Tu peux fermer cette fenêtre.</p><script>window.close && window.close()</script>`);
        resolve({ server, code });
      } catch (e) {
        resolve({ server, error: e });
      }
    });

    // 0 = port libre auto
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      logDebug("Callback server listening:", redirectUri);
      resolve({ server, redirectUri, ready: true });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

async function exchangeCodeForTokens({ code, code_verifier, redirect_uri }) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    code_verifier,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `Token exchange failed (${res.status})`;
    const e = new Error(
      `${msg}: ${json.error || "unknown"}${json.error_description ? ` - ${json.error_description}` : ""}`
    );
    e.details = json;
    throw e;
  }
  return json; // { access_token, refresh_token, expires_in, id_token, token_type, scope }
}

async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `Refresh failed (${res.status})`;
    const e = new Error(
      `${msg}: ${json.error || "unknown"}${json.error_description ? ` - ${json.error_description}` : ""}`
    );
    e.details = json;
    throw e;
  }
  return json; // { access_token, expires_in, id_token, scope, token_type, ... }
}

// ---------------------- API principale -------------------------------------

/**
 * Lance le flux OAuth (PKCE) :
 * - ouvre le navigateur sur la page Google
 * - récupère le "code" via le serveur local
 * - échange le code contre des tokens
 * - renvoie { tokens, debug }
 */
async function signIn() {
  try {
    if (!CLIENT_ID || CLIENT_ID === "REPLACE_ME.apps.googleusercontent.com") {
      throw new Error(
        "GOOGLE_CLIENT_ID manquant. Défini-le dans .env ou remplace FALLBACK_CLIENT_ID par ton client_id."
      );
    }

    // 1) Serveur local (redirect URI dynamique)
    const s = await startCallbackServer();
    if (!s.ready) {
      // on a déjà reçu code/erreur (cas improbable ici)
      const { server, code, error } = s;
      server && setTimeout(() => server.close(), 200);
      if (error) throw error;
      // sinon on continue
    }
    const server = s.server;
    const redirect_uri = s.redirectUri;

    // 2) PKCE
    const code_verifier = genCodeVerifier();
    const code_challenge = codeChallengeFromVerifier(code_verifier);

    // 3) URL d’autorisation
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirect_uri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline"); // pour refresh_token
    authUrl.searchParams.set("prompt", "consent"); // force refresh_token sur chaque login
    authUrl.searchParams.set("code_challenge", code_challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    // 4) Ouvrir le navigateur
    logDebug("Opening auth URL:", authUrl.toString());
    await shell.openExternal(authUrl.toString());

    // 5) Attendre le "code" (ou l'erreur) via /callback
    const result = await new Promise((resolve) => {
      const onResult = (r) => resolve(r);
      // réutilise le même server, mais attend la réponse /callback de startCallbackServer
      // Ici, on "monte" un listener unique sur 'request' déjà géré. startCallbackServer
      // nous résoudra une seconde fois avec { code | error } quand /callback sera appelée.
      server.once("close", () => logDebug("Callback server closed"));
      // Rien à faire : startCallbackServer résoudra avec { code | error }.
      // On “pipe” simplement la deuxième résolution via setImmediate dans startCallbackServer.
      // (Implémentation plus haut : on appelle resolve({ server, code|error }) dans la requête /callback)
      // Donc ici, on duplique la promesse : pas nécessaire – simplifions :
      // On garde plutôt s (déjà promis), et on écoute la suite :
    });

    // MAIS notre startCallbackServer a déjà renvoyé redirectUri.
    // Pour récupérer la seconde résolution (code|error), on re-emballe :
    const second = await new Promise((resolve) => {
      // bidouille : on ouvre un petit “middleware” d'attente en réutilisant le serveur
      // Quand /callback a répondu, startCallbackServer a "resolve({ server, code|error })"
      // Pour rester simple, on rejoue le schéma : démarre un petit délai qui sera remplacé
      // par la résolution effective dans le handler /callback.
      // En pratique, on va plutôt écouter la première requête entrante suivante sur le serveur
      // … sauf que startCallbackServer gère déjà tout.
      // Donc : on crée un mini “bridge” hors serveur, en utilisant une promesse globale.

      // Pour faire simple ici : on écoute le premier 'request' suivant (qui sera /callback) et on lit l'URL :
      const handler = (req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
          if (url.pathname === "/callback") {
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");
            const error_description = url.searchParams.get("error_description");
            resolve({ code, error, error_description });
          }
        } catch (e) {
          resolve({ error: e });
        } finally {
          // on ne supprime pas le handler, ce sera le même serveur pour une seule requête
        }
      };
      server.once("request", handler);
    });

    const { code, error, error_description } = second;
    // Fermer le serveur proprement
    setTimeout(() => {
      try { server.close(); } catch (_) {}
    }, 200);

    if (error) {
      const e = new Error(`${error}${error_description ? `: ${error_description}` : ""}`);
      e.oauth = { error, error_description };
      log("OAuth error (user-facing):", e.message);
      throw e;
    }
    if (!code) {
      throw new Error("Authorization code non reçu.");
    }

    // 6) Échange code → tokens
    const tokens = await exchangeCodeForTokens({ code, code_verifier, redirect_uri });
    logDebug("Tokens received:", {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      scope: tokens.scope,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    });

    return {
      tokens,
      debug: {
        client_id: CLIENT_ID,
        redirect_uri,
        scopes: SCOPES,
      },
    };
  } catch (e) {
    // Log complet côté main, + message clair pour l’UI
    log("Sign-in failed:", e.message);
    if (e.details) logDebug("Error details:", e.details);
    // Propage l’erreur (electron.js la catchera pour renvoyer à l’UI)
    throw e;
  }
}

/**
 * Rafraîchit un access_token à partir d’un refresh_token.
 * Renvoie { access_token, expires_in, ... }
 */
async function refreshToken(refresh_token) {
  try {
    if (!refresh_token) throw new Error("refresh_token manquant");
    const data = await refreshAccessToken(refresh_token);
    return data;
  } catch (e) {
    log("Refresh token failed:", e.message);
    if (e.details) logDebug("Error details:", e.details);
    throw e;
  }
}

module.exports = {
  signIn,
  refreshToken,
};v