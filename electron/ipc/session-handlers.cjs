const { ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { readSessionMeta, listSessionMetas, extractMessagesFromSession, extractModelAndThinking } = require('../session-parser.cjs');

function registerSessionHandlers(ptyManager, sessionWatcher) {
  ipcMain.handle('send-prompt', async (event, data) => {
    console.log(`[IPC] send-prompt: len=${data ? data.length : 0}`);
    if (ptyManager.ptyProcess) {
      ptyManager.writePromptToPty(data);
      return { success: true };
    }
    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    if (ptyManager.startPtyProcess(cwd) && ptyManager.ptyProcess) {
      ptyManager.writePromptToPty(data);
      return { success: true };
    }
    return { success: false, error: 'PTY is not running' };
  });

  ipcMain.handle('send-pi-command', async (event, command) => {
    console.log(`[IPC] send-pi-command`);
    const text = (() => {
      if (typeof command === 'string') {
        try {
          const parsed = JSON.parse(command);
          return parsed?.message ?? command;
        } catch {
          return command;
        }
      }
      return command?.message ?? '';
    })();

    if (ptyManager.ptyProcess) {
      ptyManager.writePromptToPty(text);
      return { success: true };
    }

    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    if (ptyManager.startPtyProcess(cwd) && ptyManager.ptyProcess) {
      ptyManager.writePromptToPty(text);
      return { success: true };
    }

    return { success: false, error: 'PTY is not running' };
  });

  ipcMain.handle('send-keybinding', async (event, keyName) => {
    console.log(`[IPC] send-keybinding: ${keyName}`);
    if (!ptyManager.ptyProcess) return { success: false, error: 'PTY is not running' };
    const keyMap = {
      'model-cycle': '\x10',
      'thinking-cycle': '\x1b[Z',
      'interrupt': '\x1b',
    };
    const seq = keyMap[keyName];
    if (!seq) return { success: false, error: `Unknown keybinding: ${keyName}` };
    ptyManager.ptyProcess.write(seq);
    return { success: true };
  });

  ipcMain.handle('select-model', async (event, model) => {
    console.log(`[IPC] select-model: ${model?.provider}/${model?.id || model?.modelId}`);
    const provider = String(model?.provider || '').trim();
    const modelId = String(model?.id || model?.modelId || '').trim();
    if (!provider || !modelId) {
      return { success: false, error: 'Missing provider or model id' };
    }

    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    if (!ptyManager.ptyProcess && !ptyManager.startPtyProcess(cwd)) {
      return { success: false, error: 'PTY is not running' };
    }

    ptyManager.writePromptToPty(`/model ${provider}/${modelId}`);
    return { success: true };
  });

  ipcMain.handle('select-thinking-level', async (event, level) => {
    console.log(`[IPC] select-thinking-level: ${level}`);
    const targetLevel = String(level || '').trim();
    const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    if (!levels.includes(targetLevel)) {
      return { success: false, error: `Unknown thinking level: ${targetLevel}` };
    }

    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    if (!ptyManager.ptyProcess && !ptyManager.startPtyProcess(cwd)) {
      return { success: false, error: 'PTY is not running' };
    }

    if (sessionWatcher.currentThinkingLevel === targetLevel) return { success: true };

    sessionWatcher.thinkingLevelLockUntil = Date.now() + 5000;
    sessionWatcher.optimisticThinkingLevel = targetLevel;

    const shiftTab = '\x1b[Z';
    const startLevel = sessionWatcher.currentThinkingLevel;
    
    const cycleAndCheck = async () => {
      let cycles = 0;
      while (cycles < 7) {
        const prevLevel = sessionWatcher.currentThinkingLevel;
        if (ptyManager.ptyProcess) {
          ptyManager.ptyProcess.write(shiftTab);
        }
        cycles++;
        
        let waited = 0;
        while (sessionWatcher.currentThinkingLevel === prevLevel && waited < 400) {
          await new Promise(r => setTimeout(r, 10));
          waited += 10;
        }
        
        if (sessionWatcher.currentThinkingLevel === targetLevel) {
          break;
        }
        
        if (sessionWatcher.currentThinkingLevel === startLevel) {
          break;
        }
      }
    };
    
    cycleAndCheck().catch(err => console.error('Error sending shift+tab:', err));

    return { success: true };
  });

  ipcMain.handle('get-session-messages', async () => {
    if (sessionWatcher.currentSessionFile && fs.existsSync(sessionWatcher.currentSessionFile)) {
      return extractMessagesFromSession(sessionWatcher.currentSessionFile);
    }
    return [];
  });

  ipcMain.handle('get-session-thinking-level', async (event, sessionPath) => {
    if (!sessionPath || !fs.existsSync(sessionPath)) return 'medium';
    const { thinkingLevel } = extractModelAndThinking(sessionPath);
    return thinkingLevel || 'medium';
  });

  ipcMain.handle('list-sessions', async () => {
    return listSessionMetas();
  });

  ipcMain.handle('open-session', async (event, sessionPath) => {
    console.log(`[IPC] open-session: ${sessionPath}`);
    if (!sessionPath || typeof sessionPath !== 'string') {
      return { success: false, error: 'Missing session path' };
    }

    try {
      const resolvedPath = path.resolve(sessionPath);
      const meta = readSessionMeta(resolvedPath);
      if (!meta) return { success: false, error: 'Session file not found' };

      ptyManager.currentWorkspacePath = meta.cwd || ptyManager.currentWorkspacePath || os.homedir();
      const ok = ptyManager.startPtyProcess(ptyManager.currentWorkspacePath, { sessionPath: resolvedPath });
      if (!ok) return { success: false, error: 'Failed to start PTY' };

      sessionWatcher.watchSessionFile(resolvedPath);
      return { success: true, meta };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-session', async (event, sessionPath) => {
    console.log(`[IPC] delete-session: ${sessionPath}`);
    if (!sessionPath || typeof sessionPath !== 'string') {
      return { success: false, error: 'Missing session path' };
    }

    try {
      const resolvedPath = path.resolve(sessionPath);
      const sessionsRoot = path.resolve(path.join(os.homedir(), '.pi', 'agent', 'sessions'));
      const relativePath = path.relative(sessionsRoot, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return { success: false, error: 'Refusing to delete a file outside the sessions folder' };
      }
      if (path.extname(resolvedPath) !== '.jsonl') {
        return { success: false, error: 'Only session JSONL files can be deleted' };
      }
      if (!fs.existsSync(resolvedPath)) {
        return { success: true, deleted: false };
      }

      const isCurrentSession = sessionWatcher.currentSessionFile && path.resolve(sessionWatcher.currentSessionFile) === resolvedPath;
      if (isCurrentSession) {
        if (ptyManager.ptyProcess) {
          ptyManager.ptyProcess.kill();
          ptyManager.ptyProcess = null;
        }
        sessionWatcher.stopSessionFileWatcher();
        sessionWatcher.currentSessionFile = null;
        ptyManager.pendingSessionFile = null;
        ptyManager.notifyRenderer('pty-reset', {});
      }

      await shell.trashItem(resolvedPath);
      return { success: true, deleted: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('new-session', async (event, workspacePath) => {
    console.log(`[IPC] new-session: workspacePath=${workspacePath}`);
    try {
      const requestedPath = typeof workspacePath === 'string' && workspacePath
        ? path.resolve(workspacePath)
        : (ptyManager.currentWorkspacePath || os.homedir());
      const stat = fs.statSync(requestedPath);
      if (!stat.isDirectory()) return { success: false, error: 'Workspace is not a directory' };

      ptyManager.currentWorkspacePath = requestedPath;
      const ok = ptyManager.startPtyProcess(requestedPath, { newSession: true });
      return { success: ok, workspacePath: requestedPath, workspaceName: path.basename(requestedPath) || requestedPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerSessionHandlers };
