// src/googleAuth.js — OAuth Google PKCE (compatible ESM depuis CommonJS, sans client_secret)
const express = require("express");
const keytar = require("keytar");
const crypto = require("crypto");
// util ESM-safe pour ouvrir le navigateur
const open = async (url) => (await import("open")).default(url);

// ---- Config
const SERVICE = "BentoBudget";
const ACCOUNT = "google-oauth";

// ⚠️ Mets ton Client ID OAuth dans .env (pas de secret à stocker)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "367731497005-e2tokhad2ff227r30jqb6navllickele.apps.googleusercontent.com";
const REDIRECT_URI = "http://127.0.0.1:42813/callback";

// ---- Utils PKCE
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const genCodeVerifier = () => b64url(crypto.randomBytes(32));
const genCodeChallenge = (verifier) => b64url(crypto.createHash("sha256").update(verifier).digest());

// ---- Stockage tokens (Keytar)
async function saveTokens(tokens) { await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(tokens)); }
async function loadTokens()       { const raw = await keytar.getPassword(SERVICE, ACCOUNT); return raw ? JSON.parse(raw) : null; }
async function clearTokens()      { await keytar.deletePassword(SERVICE, ACCOUNT); }

// ---- Helpers: imports dynamiques ESM
async function makeClient() {
  const { OAuth2Client } = await import("google-auth-library"); // ESM -> import()
  return new OAuth2Client({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
}
async function openUrl(url) {
  const mod = await import("open");             // ESM -> import()
  const open = mod.default || mod;              // compat default export
  await open(authUrl);
}

// ---- Sign-in (PKCE, sans client_secret)
async function signIn() {
  const app = express();

  // évite le 2e hit du navigateur sur /favicon.ico qui peut rejouer la route
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  const server = await new Promise((resolve) => {
    const s = app.listen(42813, () => resolve(s));
  });

  const client = await makeClient();              // <= UNE SEULE instance
  const codeVerifier  = genCodeVerifier();
  const codeChallenge = genCodeChallenge(codeVerifier);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "openid", "email", "profile",
    ],
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    // explicite, même si client.redirectUri est déjà paramétré
    redirect_uri: REDIRECT_URI,
  });

  const codePromise = new Promise((resolve, reject) => {
    app.get("/callback", (req, res) => {
      try {
        const code = req.query.code;
        res.send("<script>window.close()</script>Connexion réussie, vous pouvez fermer cet onglet.");
        resolve(code);
      } catch (e) { reject(e); }
      finally { setTimeout(() => server.close(), 200); } // un poil plus long
    });
  });

  // ouvre le navigateur
  await open(authUrl);

  // échange code -> tokens avec le MÊME client et le MÊME verifier
  const code = await codePromise;
  const { tokens } = await client.getToken({
    code,
    codeVerifier,                 // crucial pour PKCE
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
  });

  await saveTokens(tokens);
  return tokens;
}

// ---- Client autorisé réutilisable (refresh auto)
async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const client = await makeClient();
  client.setCredentials(tokens);

  client.on("tokens", (t) => {
    try { saveTokens({ ...tokens, ...t }); } catch {}
  });

  return client;
}

async function signOut() { await clearTokens(); }

module.exports = { signIn, signOut, getAuthorizedClient, loadTokens };