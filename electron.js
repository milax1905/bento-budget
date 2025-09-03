const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let updateWindow;

const isDev = !app.isPackaged;

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
    // ton bundle Vite
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
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

function wireAutoUpdater() {
  // télécharge automatiquement quand une MAJ est trouvée
  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => {
    updateWindow?.webContents.send('update:event', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    updateWindow?.webContents.send('update:event', { type: 'available', info });
  });

  autoUpdater.on('download-progress', (p) => {
    // p.percent, p.bytesPerSecond, p.transferred, p.total
    updateWindow?.webContents.send('update:event', { type: 'progress', progress: p });
  });

  autoUpdater.on('update-not-available', () => {
    // pas de MAJ → on ferme l’écran d’update et on ouvre l’app
    if (updateWindow) { updateWindow.close(); updateWindow = null; }
    createMainWindow();
  });

  autoUpdater.on('update-downloaded', () => {
    updateWindow?.webContents.send('update:event', { type: 'downloaded' });
    // petite latence visuelle puis installation
    setTimeout(() => {
      autoUpdater.quitAndInstall(); // redémarre sur la nouvelle version
    }, 800);
  });

  autoUpdater.on('error', (err) => {
    updateWindow?.webContents.send('update:event', { type: 'error', error: err?.message || String(err) });
    // fallback : laisser entrer dans l’app au cas où
    setTimeout(() => {
      if (updateWindow) { updateWindow.close(); updateWindow = null; }
      if (!mainWindow) createMainWindow();
    }, 1200);
  });
}

app.whenReady().then(() => {
  if (isDev) {
    // en dev on lance direct l’app
    createMainWindow();
  } else {
    // en prod on affiche d'abord l'écran d'update
    createUpdateWindow();
    wireAutoUpdater();
    autoUpdater.checkForUpdates();
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });