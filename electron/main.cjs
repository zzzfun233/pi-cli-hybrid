const { app, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const SessionWatcher = require('./session-watcher.cjs');
const PtyManager = require('./pty-manager.cjs');
const { registerIpcHandlers } = require('./ipc/index.cjs');

let mainWindow;

function notifyRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

const sessionWatcher = new SessionWatcher(notifyRenderer);
const ptyManager = new PtyManager(notifyRenderer, sessionWatcher);

registerIpcHandlers(() => mainWindow, ptyManager, sessionWatcher);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#74b1be',
      height: 35
    }
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === startUrl) {
      console.log(`[Electron Loader] Load failed (${errorDescription}). Retrying in 1s...`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(startUrl);
        }
      }, 1000);
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  sessionWatcher.stopSessionWatcher();
  if (ptyManager.ptyProcess) {
    ptyManager.ptyProcess.kill();
  }
});
