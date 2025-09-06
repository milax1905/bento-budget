// cloud/googleAuth.js — PKCE (aucun client_secret)
const express = require("express");
const open = require("open");
const keytar = require("keytar");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const SERVICE = "BentoBudget";
const ACCOUNT = "google-oauth";

// ⚠️ Met seulement le CLIENT_ID (pas de secret). En dev, passe-le via .env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "367731497005-e2tokhad2ff227r30jqb6navllickele.apps.googleusercontent.com";
const REDIRECT_URI = "http://127.0.0.1:42813/callback";

function makeClient() {
  return new OAuth2Client({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
}

// utils PKCE
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function genCodeVerifier() {
  return b64url(crypto.randomBytes(32));
}
function genCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return b64url(hash);
}

// tokens storage
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

async function signIn() {
  // serveur local pour récupérer le "code" OAuth
  const app = express();
  const server = await new Promise((resolve) => {
    const s = app.listen(42813, () => resolve(s));
  });

  const client = makeClient();

  // --- PKCE (code_verifier / code_challenge)
  const codeVerifier = genCodeVerifier();
  const codeChallenge = genCodeChallenge(codeVerifier);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",           // refresh_token la 1ère fois
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file", // fichiers créés par l'app
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
        res.send("<script>window.close()</script>Connexion OK, vous pouvez fermer cet onglet.");
        resolve(code);
      } catch (e) {
        reject(e);
      }
      setTimeout(() => server.close(), 100);
    });
  });

  await open(authUrl);
  const code = await codePromise;

  // Échange du code avec PKCE (sans client_secret)
  const { tokens } = await client.getToken({
    code,
    codeVerifier,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
  });

  await saveTokens(tokens);
  return tokens;
}

async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const client = makeClient();
  client.setCredentials(tokens);

  // persiste les refresh auto
  client.on("tokens", (t) => {
    try { saveTokens({ ...tokens, ...t }); } catch {}
  });

  return client;
}

async function signOut() {
  await clearTokens();
}

module.exports = { signIn, signOut, getAuthorizedClient, loadTokens };