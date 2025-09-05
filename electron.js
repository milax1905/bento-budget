// electron.js — Auto-update complet (Windows/Linux) + chargement dist/index.html
// Déps requises: electron, electron-updater, electron-log (runtime), electron-builder (packaging NSIS)

const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');

// ---- Logger robuste (fallback si electron-log absent) ----------------------
let log;
try {
  log = require('electron-log');
  log.initialize?.();
  log.transports.file.maxSize = 10_485_760; // 10 MB
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log');
} catch {
  log = { info(){}, warn(){}, error(){}, debug(){} };
}

// ---- Auto Updater ----------------------------------------------------------
const { autoUpdater } = require('electron-updater');
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // on déclenche le download quand une MAJ est trouvée

// ---- Globals ---------------------------------------------------------------
let mainWindow = null;
let updateInProgress = false;

// Instance unique
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.bento.budget'); // doit matcher build.appId
}

// Sécurité: bloque les navigations externes
const applyWebContentsSecurity = (win) => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (['http:', 'https:'].includes(u.protocol)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch (_) {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, navUrl) => {
    const allowed = win.webContents.getURL();
    if (navUrl !== allowed) e.preventDefault();
  });
};

function createMainWindow() {
  if (mainWindow) return mainWindow;
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#ffffff',
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

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Charge l'app (dist en prod, dev server en dev)
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

// ---- Auto-update flow ------------------------------------------------------
function wireAutoUpdaterIpc() {
  const send = (payload) => {
    try { mainWindow?.webContents.send('update:event', payload); }
    catch (e) { log.warn('send fail', e); }
  };

  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update');
    send({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
    send({ type: 'available', info });
    // télécharge immédiatement mais SANS installer
    autoUpdater.downloadUpdate().catch((err) => {
      log.error('downloadUpdate', err);
      send({ type: 'error', error: String(err) });
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('update-not-available', info?.version);
    send({ type: 'none', info });
  });

  autoUpdater.on('download-progress', (progress) => {
    send({ type: 'progress', progress });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('update-downloaded', info?.version);
    // ⚠️ NE PAS redémarrer automatiquement
    send({ type: 'downloaded', info });
  });

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error', err);
    send({ type: 'error', error: err?.message || String(err) });
  });

  // IPC depuis le renderer
  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, result: r?.updateInfo };
    } catch (e) {
      log.error('update:check', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      log.error('update:download', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('update:install', async () => {
    try {
      updateInProgress = true;
      autoUpdater.quitAndInstall(false, true); // l’UI choisit quand l’app redémarre
      return { ok: true };
    } catch (e) {
      log.error('update:install', e);
      return { ok: false, error: String(e) };
    }
  });
}

async function startAutoUpdateIfPackaged() {
  // L'auto-update ne marche qu'en version packagée **installée**
  if (!app.isPackaged) return;
  wireAutoUpdaterIpc();
  try { await autoUpdater.checkForUpdates(); }
  catch (e) { log.error('checkForUpdates failed', e); }
}

// ---- App lifecycle ---------------------------------------------------------
app.whenReady().then(async () => {
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason));
  process.on('uncaughtException', (err) => log.error('uncaughtException', err));
  createMainWindow();
  await startAutoUpdateIfPackaged(); // déclenche la recherche au démarrage en prod
});

app.on('before-quit', () => { if (updateInProgress) log.info('Quitting for update…'); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });

// Infos app exposées au renderer
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userData: app.getPath('userData'),
  logs: path.join(app.getPath('userData'), 'logs/main.log'),
  isPackaged: app.isPackaged,
  hostname: os.hostname(),
}));