const { ipcMain } = require('electron');
const os = require('os');
const path = require('path');

function registerPtyHandlers(ptyManager, sessionWatcher) {
  ipcMain.on('pty-input', (event, data) => {
    if (ptyManager.ptyProcess) {
      ptyManager.ptyProcess.write(data);
    }
  });

  ipcMain.on('pty-resize', (event, { cols, rows }) => {
    if (ptyManager.ptyProcess) {
      try {
        ptyManager.ptyProcess.resize(cols, rows);
      } catch (err) {
        console.error('[PTY] Resize error:', err.message);
      }
    }
  });

  ipcMain.handle('get-pty-status', async () => {
    return {
      running: !!ptyManager.ptyProcess,
      pid: ptyManager.ptyProcess?.pid || null,
      workspace: ptyManager.currentWorkspacePath,
      sessionPath: sessionWatcher.currentSessionFile,
      sessionId: sessionWatcher.currentSessionFile ? path.basename(sessionWatcher.currentSessionFile, '.jsonl') : null
    };
  });

  ipcMain.handle('start-pty', async () => {
    if (ptyManager.ptyProcess) return { success: true, pid: ptyManager.ptyProcess.pid };
    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    const ok = ptyManager.startPtyProcess(cwd);
    return { success: ok };
  });

  ipcMain.handle('stop-pty', async () => {
    if (ptyManager.ptyProcess) {
      ptyManager.ptyProcess.kill();
      ptyManager.ptyProcess = null;
    }
    sessionWatcher.stopSessionWatcher();
    return { success: true };
  });

  ipcMain.handle('restart-pty', async () => {
    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    return ptyManager.startPtyProcess(cwd);
  });
}

module.exports = { registerPtyHandlers };
