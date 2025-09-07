// src/googleAuth.js — OAuth Google PKCE pour app Electron (Desktop), sans client_secret
const express = require("express");
const keytar = require("keytar");
const crypto = require("crypto");

// ⚠️ Ouvre le navigateur par import ESM dynamique (compatible CJS)
async function openBrowser(url) {
  const mod = await import("open");
  const opener = mod.default || mod;
  return opener(url);
}

// --------- Config ----------
const SERVICE  = "BentoBudget";
const ACCOUNT  = "google-oauth";

// 1) Mets ton CLIENT_ID Desktop ici OU via .env (GOOGLE_CLIENT_ID=...apps.googleusercontent.com)
const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID || "367731497005-3ppb2npecdc9uau93mmhb89q7adv68op.apps.googleusercontent.com";
const REDIRECT_URI = "http://127.0.0.1:42813/callback"; // localhost/127.0.0.1 autorisés par Google pour Desktop

// --------- Utils PKCE ----------
const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const genCodeVerifier  = () => b64url(crypto.randomBytes(32));
const genCodeChallenge = (verifier) =>
  b64url(crypto.createHash("sha256").update(verifier).digest());

// --------- Stockage tokens (Keytar) ----------
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

// --------- Client OAuth2 (google-auth-library en ESM) ----------
async function makeClient() {
  const { OAuth2Client } = await import("google-auth-library");
  // NB: pas de client_secret pour Desktop + PKCE
  return new OAuth2Client({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
}

// --------- Sign-in (ouvre le navigateur, récupère le code, échange contre tokens) ----------
async function signIn() {
  // mini serveur local pour le callback
  const app = express();
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  const server = await new Promise((resolve) => {
    const s = app.listen(42813, () => resolve(s));
  });

  const client        = await makeClient();     // 1 instance réutilisée
  const codeVerifier  = genCodeVerifier();      // PKCE
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
    redirect_uri: REDIRECT_URI,
  });

  // on attend le code "en parallèle" après avoir ouvert le navigateur
  const codePromise = new Promise((resolve, reject) => {
    app.get("/callback", (req, res) => {
      try {
        const code = req.query.code;
        res.send("Connexion réussie, vous pouvez fermer cet onglet.");
        resolve(code);
      } catch (e) {
        reject(e);
      } finally {
        setTimeout(() => server.close(), 200);
      }
    });
  });

  await openBrowser(authUrl);
  const code = await codePromise;

  // échange code -> tokens (⚠️ important: même client + codeVerifier)
  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier,          // en camelCase, la lib mappe vers code_verifier
      redirect_uri: REDIRECT_URI,
      // pas de client_secret pour Desktop + PKCE
    });
    await saveTokens(tokens);
    return tokens;
  } catch (e) {
    // remonter un message utile au renderer
    const detail =
      e?.response?.data?.error_description ||
      e?.response?.data?.error ||
      e?.message ||
      String(e);
    throw new Error(detail);
  }
}

// --------- Client autorisé (avec refresh auto) ----------
async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const client = await makeClient();
  client.setCredentials(tokens);

  client.on("tokens", (t) => {
    try {
      // Google renvoie par ex. un nouveau access_token/expiry_date
      saveTokens({ ...tokens, ...t });
    } catch {}
  });

  return client;
}

async function signOut() {
  await clearTokens();
}

module.exports = { signIn, signOut, getAuthorizedClient, loadTokens };