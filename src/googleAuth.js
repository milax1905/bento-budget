// src/googleAuth.js — OAuth Google PKCE (ESM-friendly, sans client_secret)
const express = require("express");
const open = require("open");
const keytar = require("keytar");
const crypto = require("crypto");

// ---- Config
const SERVICE = "BentoBudget";
const ACCOUNT = "google-oauth";

// ⚠️ Mets ton Client ID OAuth Desktop/Web ici via .env
const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "367731497005-e2tokhad2ff227r30jqb6navllickele.apps.googleusercontent.com";
const REDIRECT_URI = "http://127.0.0.1:42813/callback";

// ---- Utils PKCE
const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const genCodeVerifier = () => b64url(crypto.randomBytes(32));
const genCodeChallenge = (verifier) =>
  b64url(crypto.createHash("sha256").update(verifier).digest());

// ---- Stockage tokens (Keytar)
async function saveTokens(tokens) {
  await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(tokens));
}
async function loadTokens() {
  const raw = await keytar.getPassword(SERVICE, ACCOUNT);
  return raw ? JSON.parse(raw) : null;
}
async function clearTokens() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

// ---- Helper: récupérer OAuth2Client via import() (google-auth-library est ESM)
async function makeClient() {
  const { OAuth2Client } = await import("google-auth-library"); // import ESM dynamique
  return new OAuth2Client({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
}

// ---- Sign-in (PKCE, sans client_secret)
async function signIn() {
  // 1) Petit serveur local pour récupérer le "code" OAuth
  const app = express();
  const server = await new Promise((resolve) => {
    const s = app.listen(42813, () => resolve(s));
  });

  const client = await makeClient();
  const codeVerifier = genCodeVerifier();
  const codeChallenge = genCodeChallenge(codeVerifier);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file", // accès aux fichiers créés par l'app
      "openid",
      "email",
      "profile",
    ],
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  const codePromise = new Promise((resolve, reject) => {
    app.get("/callback", (req, res) => {
      try {
        const code = req.query.code;
        res.send(
          "<script>window.close()</script>Connexion réussie, vous pouvez fermer cet onglet."
        );
        resolve(code);
      } catch (e) {
        reject(e);
      } finally {
        setTimeout(() => server.close(), 100);
      }
    });
  });

  // 2) Ouvrir le navigateur système
  await open(authUrl);

  // 3) Échanger le code contre des tokens (avec PKCE)
  const code = await codePromise;
  const { tokens } = await (await makeClient()).getToken({
    code,
    codeVerifier,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
  });

  // 4) Sauvegarder les tokens de manière sécurisée
  await saveTokens(tokens);
  return tokens;
}

// ---- Client autorisé réutilisable (refresh auto)
async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const client = await makeClient();
  client.setCredentials(tokens);

  // Persiste les refresh/rotations
  client.on("tokens", (t) => {
    try {
      saveTokens({ ...tokens, ...t });
    } catch {}
  });

  return client;
}

// ---- Sign-out (efface les tokens)
async function signOut() {
  await clearTokens();
}

module.exports = { signIn, signOut, getAuthorizedClient, loadTokens };