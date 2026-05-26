const { ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { spawn } = require('child_process');

const { quoteEnvValue, sanitizePathSegment, uniqueFilePath } = require('./utils.cjs');
const { cleanupUploadedFiles } = require('./file-manager.cjs');
const { readSessionMeta, listSessionMetas, extractMessagesFromSession, extractModelAndThinking } = require('./session-parser.cjs');

function fetchAvailableModels() {
  return new Promise((resolve) => {
    const cliPath = path.resolve(process.env.PI_AGENT_CLI_PATH || 'D:/pi-agent/packages/coding-agent/dist/cli.js');
    if (!fs.existsSync(cliPath)) {
      resolve([]);
      return;
    }

    const shellCmd = process.platform === 'win32' ? 'node.exe' : 'node';
    const child = spawn(shellCmd, [cliPath, '--list-models'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 15000,
    });

    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    child.on('close', () => {
      const lines = output.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { resolve([]); return; }

      const header = lines[0];
      const colStarts = [
        header.indexOf('provider'),
        header.indexOf('model'),
        header.indexOf('context'),
        header.indexOf('max-out'),
        header.indexOf('thinking'),
        header.indexOf('images'),
      ].filter(i => i >= 0);

      const models = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (colStarts.length < 2) continue;
        const provider = line.slice(colStarts[0], colStarts[1]).trim();
        const modelId = line.slice(colStarts[1], colStarts[2] || line.length).trim();
        if (!provider || !modelId) continue;
        models.push({ id: modelId, name: modelId, provider });
      }
      resolve(models);
    });

    child.on('error', () => resolve([]));
  });
}

function registerIpcHandlers(getMainWindow, ptyManager, sessionWatcher) {
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

  ipcMain.handle('get-available-models', async () => {
    return fetchAvailableModels();
  });

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

  ipcMain.handle('restart-pty', async () => {
    const cwd = ptyManager.currentWorkspacePath || os.homedir();
    return ptyManager.startPtyProcess(cwd);
  });

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

  ipcMain.handle('get-env', async () => {
    try {
      const envPath = path.join(__dirname, '../.env');
      if (!fs.existsSync(envPath)) return {};
      return dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    } catch (error) {
      console.error('Failed to read .env file:', error);
      return {};
    }
  });

  ipcMain.handle('save-env', async (event, envVars) => {
    try {
      const envPath = path.join(__dirname, '../.env');
      let content = '';
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
      }

      const lines = content.split('\n');
      const updatedKeys = new Set();

      const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          if (envVars.hasOwnProperty(key)) {
            updatedKeys.add(key);
            return `${key}=${quoteEnvValue(envVars[key])}`;
          }
        }
        return line;
      });

      Object.entries(envVars).forEach(([key, val]) => {
        if (!updatedKeys.has(key)) {
          newLines.push(`${key}=${quoteEnvValue(val)}`);
        }
        process.env[key] = val;
      });

      fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
      console.log(`[Env Sync] Updated .env: ${Object.keys(envVars).join(', ')}`);

      console.log('[Env Sync] Restarting PTY...');
      const cwd = ptyManager.currentWorkspacePath || os.homedir();
      ptyManager.startPtyProcess(cwd);

      return { success: true };
    } catch (error) {
      console.error('Failed to save .env file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sync-skills', async (event, skills) => {
    try {
      const homedir = os.homedir();
      const skillsDir = path.join(homedir, '.pi', 'agent', 'skills');

      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }

      const prefix = 'blankai-';
      const activeCleanNames = new Set();

      for (const skill of skills) {
        let baseCleanName = skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (!baseCleanName) {
          baseCleanName = `skill-${skill.id}`;
        }

        const cleanName = `${prefix}${baseCleanName}`;
        const skillPath = path.join(skillsDir, cleanName);

        if (skill.enabled) {
          activeCleanNames.add(cleanName);

          if (!fs.existsSync(skillPath)) {
            fs.mkdirSync(skillPath, { recursive: true });
          }

          const skillMdContent = `---
name: ${cleanName}
description: ${skill.description || 'Custom Skill'}
---
${skill.content || ''}
`;

          fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent, 'utf8');
        }
      }

      if (fs.existsSync(skillsDir)) {
        const folders = fs.readdirSync(skillsDir);
        for (const folder of folders) {
          if (folder.startsWith(prefix) && !activeCleanNames.has(folder)) {
            const folderPath = path.join(skillsDir, folder);
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`[Skills Sync] Cleaned up: ${folder}`);
          }
        }
      }

      console.log(`[Skills Sync] Synced ${activeCleanNames.size} skills.`);
      return { success: true, count: activeCleanNames.size };
    } catch (error) {
      console.error('Failed to sync skills:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sync-system-prompt', async (event, prompt) => {
    try {
      const homedir = os.homedir();
      const piDir = path.join(homedir, '.pi', 'agent');
      if (!fs.existsSync(piDir)) {
        fs.mkdirSync(piDir, { recursive: true });
      }
      const promptPath = path.join(piDir, 'system-prompt.txt');
      fs.writeFileSync(promptPath, String(prompt ?? ''), 'utf8');
      console.log('[System Prompt] Synced to', promptPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to sync system prompt:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sync-system-tools', async (event, tools) => {
    try {
      const homedir = os.homedir();
      const piDir = path.join(homedir, '.pi', 'agent');
      if (!fs.existsSync(piDir)) {
        fs.mkdirSync(piDir, { recursive: true });
      }
      const toolsPath = path.join(piDir, 'tools.json');
      fs.writeFileSync(toolsPath, JSON.stringify(tools, null, 2), 'utf8');
      console.log('[Tools Sync] Synced', tools.length, 'tools to', toolsPath);
      return { success: true, count: tools.length };
    } catch (error) {
      console.error('Failed to sync tools:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerIpcHandlers
};
