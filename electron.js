// electron.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');

let mainWindow;
let updateWindow;
const isDev = !app.isPackaged;

// --- fenêtres ---
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('ready-to-show', () => mainWindow.show());
}

function createUpdateWindow() {
  updateWindow = new BrowserWindow({
    width: 460,
    height: 200,
    resizable: false,
    fullscreenable: false,
    backgroundColor: '#0b1220',
    titleBarStyle: 'hiddenInset',
    frame: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  updateWindow.loadFile(path.join(__dirname, 'update.html'));
  updateWindow.on('ready-to-show', () => updateWindow.show());
}

// --- flux d’auto-update (avec contournement PowerShell) ---
function startUpdateFlow() {
  // On contrôle le téléchargement manuellement pour lancer l’EXE via CMD
  autoUpdater.autoDownload = false;

  // (facultatif) logs
  // const log = require('electron-log'); autoUpdater.logger = log; autoUpdater.logger.transports.file.level = 'info';

  autoUpdater.on('checking-for-update', () => {
    updateWindow?.webContents.send('update:event', { type: 'checking' });
  });

  autoUpdater.on('update-available', async (info) => {
    updateWindow?.webContents.send('update:event', { type: 'available', info });

    try {
      // Télécharge la MAJ et récupère le chemin du setup .exe
      const files = await autoUpdater.downloadUpdate();
      const installerPath = Array.isArray(files) ? files[0] : files;

      updateWindow?.webContents.send('update:event', { type: 'downloaded' });

      // Lance l’installateur via CMD (pas PowerShell) puis quitte l’app
      // Ajoute "/S" pour installation silencieuse NSIS si tu veux : `"${installerPath}" /S`
      spawn('cmd.exe', ['/c', 'start', '', `"${installerPath}"`], {
        detached: true,
        windowsVerbatimArguments: true
      });

      setTimeout(() => {
        app.quit(); // laisse l’install se faire, l’app redémarrera ensuite
      }, 600);
    } catch (e) {
      updateWindow?.webContents.send('update:event', { type: 'error', error: e?.message || String(e) });
      // Ouvre l’app quand même
      if (updateWindow) { updateWindow.close(); updateWindow = null; }
      if (!mainWindow) createMainWindow();
    }
  });

  autoUpdater.on('download-progress', (p) => {
    updateWindow?.webContents.send('update:event', { type: 'progress', progress: p });
  });

  autoUpdater.on('update-not-available', () => {
    // Pas de MAJ → on lance l’app
    if (updateWindow) { updateWindow.close(); updateWindow = null; }
    if (!mainWindow) createMainWindow();
  });

  autoUpdater.on('error', (err) => {
    updateWindow?.webContents.send('update:event', { type: 'error', error: err?.message || String(err) });
    if (updateWindow) { updateWindow.close(); updateWindow = null; }
    if (!mainWindow) createMainWindow();
  });

  autoUpdater.checkForUpdates();
}

// --- cycle de vie ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (isDev) {
      // En dev on ouvre directement l’app
      createMainWindow();
    } else {
      // En prod : petit écran d’update puis flux de MAJ
      createUpdateWindow();
      startUpdateFlow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}