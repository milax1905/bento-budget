// src/googleAuth.js — OAuth 2.0 PKCE pour Electron (Desktop, sans client_secret)
const express = require("express");
const keytar = require("keytar");
const crypto = require("crypto");

// ---------- Config ----------
const SERVICE = "BentoBudget";
const ACCOUNT = "google-oauth";

// ⬇️ Remplace par TON ID CLIENT "Ordinateur de bureau"
const DESKTOP_CLIENT_ID =
  "367731497005-3ppb2npecdc9uau93mmhb89q7adv68op.apps.googleusercontent.com";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || DESKTOP_CLIENT_ID;

// ---------- Helpers PKCE ----------
const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const genCodeVerifier = () => b64url(crypto.randomBytes(32));
const genCodeChallenge = (verifier) =>
  b64url(crypto.createHash("sha256").update(verifier).digest());

// ---------- Stockage tokens (Keytar) ----------
async function saveTokens(tokens) {
  await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(tokens));
}
async function loadTokens() {
  const raw = await keytar.getPassword(SERVICE, ACCOUNT);
  return raw ? JSON.parse(raw) : null;
}
async function clearTokens() {
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {}
}

// ---------- Imports dynamiques ESM ----------
async function makeClient(redirectUri) {
  const { OAuth2Client } = await import("google-auth-library");
  return new OAuth2Client({ clientId: CLIENT_ID, redirectUri });
}
async function openExternal(url) {
  const mod = await import("open");
  const open = mod.default || mod;
  await open(url);
}

// ---------- Sign‑in (PKCE, redirect loopback dynamique) ----------
async function signIn() {
  const app = express();
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  // Port éphémère pour éviter les conflits
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const client = await makeClient(redirectUri);
  const codeVerifier = genCodeVerifier();
  const codeChallenge = genCodeChallenge(codeVerifier);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
      "profile",
    ],
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
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
        setTimeout(() => server.close(), 200);
      }
    });
  });

  await openExternal(authUrl);

  // Échange code -> tokens (PKCE) : pas de client_secret pour Desktop
  const code = await codePromise;
  const { tokens } = await client.getToken({
    code,
    codeVerifier, // ← clé PKCE
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
  });

  await saveTokens(tokens);
  return tokens;
}

// ---------- Client autorisé réutilisable ----------
async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;
  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client({ clientId: CLIENT_ID });
  client.setCredentials(tokens);
  client.on("tokens", (t) => {
    try {
      saveTokens({ ...tokens, ...t });
    } catch {}
  });
  return client;
}

async function signOut() {
  await clearTokens();
}

module.exports = { signIn, signOut, getAuthorizedClient, loadTokens };