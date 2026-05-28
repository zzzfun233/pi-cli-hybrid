const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function registerWorkspaceHandlers(getMainWindow, ptyManager) {
  ipcMain.handle('select-workspace-folder', async () => {
    console.log(`[IPC] select-workspace-folder: prompt user`);
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择工作区文件夹',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const folderPath = path.resolve(result.filePaths[0]);
    if (ptyManager.currentWorkspacePath !== folderPath) {
      ptyManager.currentWorkspacePath = folderPath;
      ptyManager.startPtyProcess(folderPath);
    }

    return {
      path: folderPath,
      name: path.basename(folderPath) || folderPath
    };
  });

  ipcMain.handle('set-workspace-folder', async (event, folderPath, options = {}) => {
    console.log(`[IPC] set-workspace-folder: ${folderPath}`);
    if (!folderPath || typeof folderPath !== 'string') return { success: false };
    try {
      const resolvedPath = path.resolve(folderPath);
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) return { success: false };

      if (ptyManager.currentWorkspacePath !== resolvedPath) {
        ptyManager.currentWorkspacePath = resolvedPath;
        if (options?.startPty !== false) {
          ptyManager.startPtyProcess(resolvedPath);
        }
      }
      return { success: true, path: resolvedPath, name: path.basename(resolvedPath) || resolvedPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('reveal-workspace-folder', async () => {
    if (!ptyManager.currentWorkspacePath) return { success: false };
    const error = await shell.openPath(ptyManager.currentWorkspacePath);
    return { success: !error, error };
  });
}

module.exports = { registerWorkspaceHandlers };
