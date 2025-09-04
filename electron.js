// electron.js — Auto‑update ready (Windows/Linux) without paid certs (macOS requires signing)
// Requires: electron, electron-updater, electron-log, electron-builder packaging (NSIS on Windows)

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const url = require('url');
const os = require('os');

// ---- Logging ---------------------------------------------------------------
const log = require('electron-log');
log.initialize();
log.transports.file.maxSize = 10_485_760; // 10 MB
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log');

// ---- Auto Updater ----------------------------------------------------------
const { autoUpdater } = require('electron-updater');
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // we'll trigger download after we know an update exists

// If you host updates yourself (provider: generic) and need to override at runtime:
// autoUpdater.setFeedURL({ url: 'https://your.cdn.example.com/updates/' });

// ---- Globals ---------------------------------------------------------------
let mainWindow = null;
let updateInProgress = false;

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

if (process.platform === 'win32') {
  // For notifications and proper taskbar grouping
  app.setAppUserModelId('com.yourorg.yourapp');
}

// Security: disable navigation to arbitrary URLs
const applyWebContentsSecurity = (win) => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // open external http/https in default browser
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
    // Block any navigation away from our bundled app
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
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  applyWebContentsSecurity(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load your app (file:// for packaged, localhost in dev)
  if (app.isPackaged) {
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true,
      })
    );
  } else {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ---- Auto‑update flow ------------------------------------------------------
function wireAutoUpdaterIpc() {
  const send = (payload) => {
    try {
      mainWindow?.webContents.send('update:event', payload);
    } catch (e) {
      log.warn('Failed to send update:event to renderer', e);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update');
    send({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
    send({ type: 'available', info });
    // start download automatically
    autoUpdater.downloadUpdate().catch((err) => {
      log.error('downloadUpdate error', err);
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

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error', err);
    send({ type: 'error', error: err?.message || String(err) });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('update-downloaded', info?.version);
    send({ type: 'downloaded', info });

    // Be gentle: ask the user or do silent restart depending on OS
    try {
      if (process.platform === 'win32' || process.platform === 'linux') {
        // NSIS/AppImage: silent is acceptable
        setTimeout(() => {
          updateInProgress = true;
          autoUpdater.quitAndInstall(false, true);
        }, 500);
      } else {
        // macOS usually needs consent (and is likely signed/notarized)
        const res = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Redémarrer maintenant', 'Plus tard'],
          defaultId: 0,
          cancelId: 1,
          title: 'Mise à jour prête',
          message: "Une nouvelle version a été téléchargée.",
          detail: 'Voulez-vous redémarrer pour terminer l\'installation ?',
        });
        if (res.response === 0) {
          updateInProgress = true;
          autoUpdater.quitAndInstall(false, true);
        }
      }
    } catch (e) {
      log.error('quitAndInstall failed', e);
    }
  });

  // Optional: allow renderer to trigger check/download
  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, result: r?.updateInfo };
    } catch (e) {
      log.error('update:check error', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      log.error('update:download error', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('update:install', async () => {
    try {
      updateInProgress = true;
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (e) {
      log.error('update:install error', e);
      return { ok: false, error: String(e) };
    }
  });
}

async function startAutoUpdateIfPackaged() {
  if (!app.isPackaged) return; // dev mode: skip

  wireAutoUpdaterIpc();

  try {
    // On Windows/Linux, no paid cert required for updates themselves
    await autoUpdater.checkForUpdates();
  } catch (e) {
    log.error('checkForUpdates failed', e);
  }
}

// ---- App lifecycle ---------------------------------------------------------
app.on('ready', async () => {
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason));
  process.on('uncaughtException', (err) => log.error('uncaughtException', err));

  createMainWindow();
  await startAutoUpdateIfPackaged();
});

app.on('before-quit', () => {
  // help NSIS replace files
  if (updateInProgress) {
    log.info('Quitting for update…');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Optional: expose app info to renderer
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userData: app.getPath('userData'),
  logs: path.join(app.getPath('userData'), 'logs/main.log'),
  isPackaged: app.isPackaged,
  hostname: os.hostname(),
}));