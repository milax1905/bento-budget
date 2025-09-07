// electron.js — Auto-update + Google Drive (PKCE) + IPC cloud
require("dotenv").config();

const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require("electron");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

dotenv.config({
  path: app.isPackaged
    ? path.join(process.resourcesPath, ".env") // prod (app packagée)
    : path.join(__dirname, ".env"),            // dev
});

const googleAuth = require(path.join(__dirname, "src", "googleAuth"));

// Logger (fallback si electron-log absent)
let log;
try {
  log = require("electron-log");
  log.initialize?.();
  log.transports.file.maxSize = 10_485_760; // 10 MB
  log.transports.file.resolvePathFn = () =>
    path.join(app.getPath("userData"), "logs/main.log");
} catch {
  log = { info() {}, warn() {}, error() {}, debug() {} };
}

// ---------- AUTO-UPDATER ----------
const { autoUpdater } = require("electron-updater");
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

let mainWindow = null;
let updateInProgress = false;

let updateState = {
  status: "idle",
  progress: null,
  availableVersion: null,
  error: "",
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.bento.budget");
}

// Sécurité navigation
const applyWebContentsSecurity = (win) => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (["http:", "https:"].includes(u.protocol)) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {}
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, navUrl) => {
    const allowed = win.webContents.getURL();
    if (navUrl !== allowed) e.preventDefault();
  });
};

function createMainWindow() {
  if (mainWindow) return mainWindow;
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#121212" : "#ffffff",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  applyWebContentsSecurity(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Dev vs Build
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  } else {
    const devUrl = process.env.ELECTRON_START_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

// -------- Auto-update: câblage des événements + IPC --------
function wireAutoUpdaterIpc() {
  const send = (payload) => {
    try {
      mainWindow?.webContents.send("update:event", payload);
    } catch (e) {
      log.warn("send fail", e);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    updateState = { ...updateState, status: "checking", error: "" };
    log.info("checking-for-update");
    send({ type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    updateState = {
      ...updateState,
      status: "available",
      availableVersion: info?.version || null,
    };
    log.info("update-available", info?.version);
    send({ type: "available", info });
    autoUpdater.downloadUpdate().catch((err) => {
      updateState = { ...updateState, status: "error", error: String(err) };
      log.error("downloadUpdate", err);
      send({ type: "error", error: String(err) });
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateState = { ...updateState, status: "none", availableVersion: null };
    log.info("update-not-available", info?.version);
    send({ type: "none", info });
  });

  autoUpdater.on("download-progress", (progress) => {
    updateState = { ...updateState, status: "downloading", progress };
    send({ type: "progress", progress });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateState = { ...updateState, status: "downloaded" };
    log.info("update-downloaded", info?.version);
    send({ type: "downloaded", info });
  });

  autoUpdater.on("error", (err) => {
    updateState = {
      ...updateState,
      status: "error",
      error: err?.message || String(err),
    };
    log.error("autoUpdater error", err);
    send({ type: "error", error: err?.message || String(err) });
  });

  // IPC depuis le renderer
  ipcMain.handle("update:getState", () => updateState);
  ipcMain.handle("update:check", async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, result: r?.updateInfo };
    } catch (e) {
      updateState = { ...updateState, status: "error", error: String(e) };
      log.error("update:check", e);
      return { ok: false, error: String(e) };
    }
  });
  ipcMain.handle("update:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      updateState = { ...updateState, status: "error", error: String(e) };
      log.error("update:download", e);
      return { ok: false, error: String(e) };
    }
  });
  ipcMain.handle("update:install", async () => {
    try {
      updateInProgress = true;
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (e) {
      log.error("update:install", e);
      return { ok: false, error: String(e) };
    }
  });
}

async function startAutoUpdateIfPackaged() {
  if (!app.isPackaged) return;
  wireAutoUpdaterIpc();
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    log.error("checkForUpdates failed", e);
  }
}

// ---------- GOOGLE DRIVE (PKCE) ----------
const { google } = require("googleapis");

async function getDrive() {
  const auth = await googleAuth.getAuthorizedClient();
  if (!auth) throw new Error("Non connecté à Google (signIn requis)");
  return google.drive({ version: "v3", auth });
}

async function ensureAppFolder(drive) {
  const name = "Bento Budget";
  const q =
    "mimeType='application/vnd.google-apps.folder' and name=@name and trashed=false";
  const { data } = await drive.files.list({
    q,
    spaces: "drive",
    fields: "files(id,name)",
    corpora: "user",
    includeItemsFromAllDrives: false,
    supportsAllDrives: false,
  });
  const existing = data?.files?.find((f) => f.name === name) || null;
  if (existing) return existing.id;

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return res.data.id;
}

async function findFileInFolder(drive, parentId, filename) {
  const q = `'${parentId}' in parents and trashed=false and name=@name`;
  const { data } = await drive.files.list({
    q,
    fields: "files(id,name)",
  });
  return data?.files?.find((f) => f.name === filename) || null;
}

async function saveJsonToDrive(filename, json) {
  const drive = await getDrive();
  const folderId = await ensureAppFolder(drive);
  const existing = await findFileInFolder(drive, folderId, filename);

  const media = {
    mimeType: "application/json",
    body: Buffer.from(typeof json === "string" ? json : JSON.stringify(json)),
  };

  if (existing) {
    await drive.files.update({ fileId: existing.id, media });
    return existing.id;
  } else {
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        mimeType: "application/json",
      },
      media,
      fields: "id",
    });
    return res.data.id;
  }
}

async function loadJsonFromDrive(filename) {
  const drive = await getDrive();
  const folderId = await ensureAppFolder(drive);
  const existing = await findFileInFolder(drive, folderId, filename);
  if (!existing) throw new Error(`Fichier introuvable: ${filename}`);

  const res = await drive.files.get(
    { fileId: existing.id, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data).toString("utf8");
}

// ---------- IPC cloud ----------
ipcMain.handle("cloud:signIn", async () => {
  try {
    await googleAuth.signIn();
    return { ok: true };
  } catch (e) {
    log.error("cloud:signIn", e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("cloud:signOut", async () => {
  try {
    await googleAuth.signOut();
    return { ok: true };
  } catch (e) {
    log.error("cloud:signOut", e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("cloud:save", async (_e, { filename, json }) => {
  try {
    const id = await saveJsonToDrive(filename, json);
    return { ok: true, id };
  } catch (e) {
    log.error("cloud:save", e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("cloud:load", async (_e, { filename }) => {
  try {
    const txt = await loadJsonFromDrive(filename);
    return { ok: true, data: txt };
  } catch (e) {
    log.error("cloud:load", e);
    return { ok: false, error: String(e) };
  }
});

// ---- App lifecycle ----
app.whenReady().then(async () => {
  process.on("unhandledRejection", (reason) =>
    log.error("unhandledRejection", reason)
  );
  process.on("uncaughtException", (err) =>
    log.error("uncaughtException", err)
  );
  createMainWindow();
  await startAutoUpdateIfPackaged();
});

// Quit logic
app.on("before-quit", () => {
  if (updateInProgress) log.info("Quitting for update…");
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// Infos app pour renderer
ipcMain.handle("app:getInfo", () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userData: app.getPath("userData"),
  logs: path.join(app.getPath("userData"), "logs/main.log"),
  isPackaged: app.isPackaged,
  hostname: os.hostname(),
}));