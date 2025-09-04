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

// --- flux d’auto-update (maintenant simplifié et fiable) ---
function startUpdateFlow() {
  // autoUpdater.autoDownload = false; est conservé pour le contrôle
  // du téléchargement, mais l'installation est gérée par la méthode intégrée
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    updateWindow?.webContents.send('update:event', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    updateWindow?.webContents.send('update:event', { type: 'available', info });
    // On commence le téléchargement de la mise à jour
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('download-progress', (p) => {
    updateWindow?.webContents.send('update:event', { type: 'progress', progress: p });
  });

  autoUpdater.on('update-downloaded', () => {
    updateWindow?.webContents.send('update:event', { type: 'downloaded' });
    // L'installation est prête. On quitte l'application pour lancer l'installateur.
    autoUpdater.quitAndInstall();
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