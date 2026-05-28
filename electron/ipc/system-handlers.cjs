const { ipcMain, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { sanitizePathSegment, uniqueFilePath } = require('../utils.cjs');
const { cleanupUploadedFiles } = require('../file-manager.cjs');

function registerSystemHandlers(ptyManager, sessionWatcher) {
  ipcMain.handle('clipboard-read-text', async () => clipboard.readText());
  ipcMain.handle('clipboard-write-text', async (event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  });

  ipcMain.handle('save-uploaded-file', async (event, name, base64Data, meta = {}) => {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const baseDir = ptyManager.currentWorkspacePath || os.homedir();
      const uploadRoot = path.join(baseDir, '.uploaded_files');
      const sessionSegment = sanitizePathSegment(meta?.sessionId || (sessionWatcher.currentSessionFile ? path.basename(sessionWatcher.currentSessionFile, '.jsonl') : ''), 'drafts');
      const batchSegment = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
      const uploadDir = path.join(uploadRoot, sessionSegment, batchSegment);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const safeName = path.basename(typeof name === 'string' ? name : 'upload.bin');
      const filePath = uniqueFilePath(uploadDir, safeName);
      fs.writeFileSync(filePath, buffer);
      
      const cleanup = cleanupUploadedFiles(uploadRoot);
      console.log(`[File Upload] Saved: ${filePath}`);
      return {
        success: true,
        path: filePath,
        name: path.basename(filePath),
        size: buffer.length,
        mimeType: meta?.mimeType || '',
        cleanup
      };
    } catch (error) {
      console.error('Failed to save uploaded file:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerSystemHandlers };
