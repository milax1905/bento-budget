// src/googleAuth.js

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");
const { shell } = require("electron");

// ========================= CONFIG ==========================================

// >>> Mets TON client_id Desktop ici (tu l'as dit être celui-ci) :
const FALLBACK_CLIENT_ID = "367731497005-3ppb2npecdc9uau93mmhb89q7adv68op.apps.googleusercontent.com";

// Scopes utiles (ajuste si besoin)
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"].join(" ");

// Logs verbeux si DEBUG_OAUTH=1
const DEBUG = process.env.DEBUG_OAUTH === "1";

// on FORCE l'utilisation du client Desktop en dur (aucun .env, aucun secret)
const CLIENT_ID = FALLBACK_CLIENT_ID;
console.log("[oauth] CLIENT_ID utilisé:", CLIENT_ID);

// ========================= UTILS ===========================================

const log = (...a) => console.log("[oauth]", ...a);
const dbg = (...a) => { if (DEBUG) console.debug("[oauth:debug]", ...a); };

// PKCE helpers
const genCodeVerifier = () => crypto.randomBytes(64).toString("base64url");
const codeChallengeFromVerifier = (verifier) =>
  crypto.createHash("sha256").update(verifier).digest().toString("base64url");

// Lance un mini serveur local et renvoie { redirectUri, waitForCallback, close }
function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          return res.end("Not found");
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const error_description = url.searchParams.get("error_description");

        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<h2>Connexion Google échouée</h2>
             <p>${error}${error_description ? ` – ${error_description}` : ""}</p>
             <script>window.close && window.close()</script>`
          );
        } else {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<h2>Connexion réussie</h2>
             <p>Tu peux fermer cette fenêtre.</p>
             <script>window.close && window.close()</script>`
          );
        }
        server._resolver?.({ code, error, error_description });
      } catch (e) {
        server._resolver?.({ error: "internal_error", error_description: e.message });
      }
    });

    server.on("error", reject);

    // écoute sur un port libre
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      dbg("Callback server:", redirectUri);

      const waitForCallback = () =>
        new Promise((res) => { server._resolver = (v) => res(v); });

      const close = () => { try { server.close(); } catch (_) {} };

      resolve({ redirectUri, waitForCallback, close });
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

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(
      `Token exchange failed (${r.status}): ${json.error || "unknown"}${json.error_description ? ` - ${json.error_description}` : ""}`
    );
    e.details = json;
    throw e;
  }
  return json;
}

async function doRefreshToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token,
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(
      `Refresh failed (${r.status}): ${json.error || "unknown"}${json.error_description ? ` - ${json.error_description}` : ""}`
    );
    e.details = json;
    throw e;
  }
  return json;
}

// ========================= API PUBLIQUE ====================================

async function signIn() {
  try {
    if (!CLIENT_ID || CLIENT_ID === "REPLACE_ME.apps.googleusercontent.com") {
      throw new Error(
        "GOOGLE_CLIENT_ID manquant. Remplace FALLBACK_CLIENT_ID par ton client_id (Desktop app)."
      );
    }

    const { redirectUri, waitForCallback, close } = await startCallbackServer();

    const code_verifier = genCodeVerifier();
    const code_challenge = codeChallengeFromVerifier(code_verifier);

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", CLIENT_ID);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", SCOPES);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("code_challenge", code_challenge);
    auth.searchParams.set("code_challenge_method", "S256");

    dbg("Auth URL:", auth.toString());
    await shell.openExternal(auth.toString());

    const { code, error, error_description } = await waitForCallback();
    setTimeout(close, 200);

    if (error) {
      const e = new Error(`${error}${error_description ? `: ${error_description}` : ""}`);
      e.oauth = { error, error_description };
      log("OAuth error:", e.message);
      throw e;
    }
    if (!code) throw new Error("Authorization code non reçu.");

    const tokens = await exchangeCodeForTokens({ code, code_verifier, redirect_uri: redirectUri });
    dbg("Tokens:", {
      access_token: !!tokens.access_token,
      refresh_token: !!tokens.refresh_token,
      scope: tokens.scope,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    });

    return {
      tokens,
      debug: { client_id: CLIENT_ID, redirect_uri: redirectUri, scopes: SCOPES },
    };
  } catch (e) {
    log("Sign-in failed:", e.message);
    if (e.details) dbg("Error details:", e.details);
    throw e;
  }
}

async function refreshToken(refresh_token) {
  try {
    if (!refresh_token) throw new Error("refresh_token manquant");
    return await doRefreshToken(refresh_token);
  } catch (e) {
    log("Refresh token failed:", e.message);
    if (e.details) dbg("Error details:", e.details);
    throw e;
  }
}

module.exports = { signIn, refreshToken };