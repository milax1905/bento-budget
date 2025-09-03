const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Quand la fenêtre est prête → vérifier les mises à jour
  mainWindow.once('ready-to-show', () => {
    if (!isDev) checkForUpdates();
  });
}

// --- Auto Update ---
function checkForUpdates() {
  // Activer le log si besoin
  // const log = require('electron-log');
  // autoUpdater.logger = log;
  // autoUpdater.logger.transports.file.level = 'info';

  autoUpdater.autoDownload = true;

  // Quand une MAJ est trouvée
  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour disponible',
      message: 'Une nouvelle version de Bento Budget est disponible. Téléchargement en cours...'
    });
  });

  // Quand la MAJ est téléchargée
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour prête',
      message: 'La mise à jour a été téléchargée. Redémarrer maintenant ?',
      buttons: ['Oui', 'Plus tard']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // En cas d'erreur
  autoUpdater.on('error', (err) => {
    console.error('Erreur auto-update :', err);
  });

  // Lancer la vérification
  autoUpdater.checkForUpdates();
}

app.whenReady().then(createWindow);

// Fermer l'app quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Réouvrir une fenêtre si l'app est relancée sur Mac
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});