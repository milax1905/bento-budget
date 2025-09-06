// electron.js — Auto-update + snapshot d'état
const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require("electron");
const path = require("path");
const os = require("os");

// Logger (fallback si electron-log absent)
let log;
try {
  log = require("electron-log");
  log.initialize?.();
  log.transports.file.maxSize = 10_485_760; // 10 MB
  log.transports.file.resolvePathFn = () => path.join(app.getPath("userData"), "logs/main.log");
} catch {
  log = { info(){}, warn(){}, error(){}, debug(){} };
}

// Auto Updater
const { autoUpdater } = require("electron-updater");
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // on déclenche le download quand MAJ trouvée

// Globals
let mainWindow = null;
let updateInProgress = false;

// --- Snapshot d'état renvoyé à la demande au renderer ---
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
  app.setAppUserModelId("com.bento.budget"); // doit matcher build.appId
}

// Sécurité: bloque les navigations externes
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

  // Charge l'app
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  } else {
    const devUrl = process.env.ELECTRON_START_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => { mainWindow = null; });
  return mainWindow;
}

// -------- Auto-update: câblage des événements + IPC --------
function wireAutoUpdaterIpc() {
  const send = (payload) => {
    try { mainWindow?.webContents.send("update:event", payload); }
    catch (e) { log.warn("send fail", e); }
  };

  autoUpdater.on("checking-for-update", () => {
    updateState = { ...updateState, status: "checking", error: "" };
    log.info("checking-for-update");
    send({ type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    updateState = { ...updateState, status: "available", availableVersion: info?.version || null };
    log.info("update-available", info?.version);
    send({ type: "available", info });
    // télécharge immédiatement mais SANS installer
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
    updateState = { ...updateState, status: "error", error: err?.message || String(err) };
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
  try { await autoUpdater.checkForUpdates(); }
  catch (e) { log.error("checkForUpdates failed", e); }
}

// ---- App lifecycle ----
app.whenReady().then(async () => {
  process.on("unhandledRejection", (reason) => log.error("unhandledRejection", reason));
  process.on("uncaughtException", (err) => log.error("uncaughtException", err));
  createMainWindow();
  await startAutoUpdateIfPackaged();
});

app.on("before-quit", () => { if (updateInProgress) log.info("Quitting for update…"); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });

// Infos app exposées au renderer
ipcMain.handle("app:getInfo", () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userData: app.getPath("userData"),
  logs: path.join(app.getPath("userData"), "logs/main.log"),
  isPackaged: app.isPackaged,
  hostname: os.hostname(),
}));