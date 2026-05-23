const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
let pty = null;
try {
  pty = require('node-pty');
} catch (error) {
  console.error('[PTY] Failed to load node-pty:', error.message);
}

dotenv.config({ path: path.join(__dirname, '../.env') });

let mainWindow;
let ptyProcess;
let currentWorkspacePath = null;
let currentSessionFile = null;
let sessionWatcher = null;
let sessionDirWatcher = null;
let pendingSessionFile = null;
let ptyStartSeq = 0;
let sessionWatchTimer = null;
let currentThinkingLevel = null; // Track current thinking level for cycling

// ─── Fetch available models via CLI --list-models ────────────────
function fetchAvailableModels() {
  return new Promise((resolve) => {
    const cliPath = path.resolve(process.env.PI_AGENT_CLI_PATH || 'D:/pi-agent/packages/coding-agent/dist/cli.js');
    if (!fs.existsSync(cliPath)) {
      resolve([]);
      return;
    }

    const shell = process.platform === 'win32' ? 'node.exe' : 'node';
    const child = spawn(shell, [cliPath, '--list-models'], {
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

      // Parse fixed-width table: provider / model / context / max-out / thinking / images
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

// ─── Notify renderer ───────────────────────────────────────────────
function notifyRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function quoteEnvValue(value) {
  return JSON.stringify(String(value ?? ''));
}

function writePromptToPty(text) {
  const value = String(text ?? '');
  ptyProcess.write(`\x1b[200~${value}\x1b[201~\r`);
}

function sanitizePathSegment(value, fallback) {
  const clean = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean || fallback;
}

function uniqueFilePath(dir, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function collectUploadedFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          files.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch {}
      }
    }
  };

  visit(root);
  return files;
}

function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      pruneEmptyDirs(path.join(root, entry.name));
    }
  }
  if (root.endsWith('.uploaded_files')) return;
  try {
    if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  } catch {}
}

function cleanupUploadedFiles(root, options = {}) {
  const maxAgeMs = Number(options.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000);
  const maxBytes = Number(options.maxBytes ?? 512 * 1024 * 1024);
  const now = Date.now();
  let deleted = 0;
  let freedBytes = 0;

  for (const file of collectUploadedFiles(root)) {
    if (now - file.mtimeMs <= maxAgeMs) continue;
    try {
      fs.unlinkSync(file.path);
      deleted += 1;
      freedBytes += file.size;
    } catch {}
  }

  let files = collectUploadedFiles(root).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (totalBytes <= maxBytes) break;
    try {
      fs.unlinkSync(file.path);
      deleted += 1;
      freedBytes += file.size;
      totalBytes -= file.size;
    } catch {}
  }

  pruneEmptyDirs(root);
  return { deleted, freedBytes, totalBytes };
}

// ─── Session JSONL parsing ─────────────────────────────────────────
function getSessionDir(cwd) {
  const encoded = cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-');
  return path.join(os.homedir(), '.pi', 'agent', 'sessions', `--${encoded}--`);
}

function parseSessionLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readSessionMeta(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let sessionId = path.basename(filePath, '.jsonl');
  let cwd = null;
  let firstUserText = '';
  let lastTimestamp = stat.mtime.toISOString();

  for (const line of lines) {
    const entry = parseSessionLine(line);
    if (!entry) continue;

    if (entry.timestamp) lastTimestamp = entry.timestamp;

    if (entry.type === 'session') {
      sessionId = entry.id || sessionId;
      cwd = entry.cwd || cwd;
      if (entry.timestamp) lastTimestamp = entry.timestamp;
    } else if (!firstUserText && entry.type === 'message' && entry.message?.role === 'user') {
      const content = entry.message.content;
      firstUserText = Array.isArray(content)
        ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
        : (typeof content === 'string' ? content : '');
    }
  }

  const previewSource = firstUserText.trim() || 'CLI Session';
  return {
    id: path.basename(filePath, '.jsonl'),
    cliSessionId: sessionId,
    path: filePath,
    cwd,
    workspacePath: cwd,
    workspaceName: cwd ? (path.basename(cwd) || cwd) : '空文件夹',
    preview: previewSource.length > 18 ? `${previewSource.slice(0, 18)}...` : previewSource,
    updatedAt: stat.mtimeMs,
    timestamp: lastTimestamp
  };
}

function listSessionMetas() {
  const root = path.join(os.homedir(), '.pi', 'agent', 'sessions');
  if (!fs.existsSync(root)) return [];

  const sessions = [];
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const sessionDir = path.join(root, dir.name);
    for (const file of fs.readdirSync(sessionDir)) {
      if (!file.endsWith('.jsonl')) continue;
      const meta = readSessionMeta(path.join(sessionDir, file));
      if (meta) sessions.push(meta);
    }
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

function extractMessagesFromSession(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const messages = [];

  for (const line of lines) {
    const entry = parseSessionLine(line);
    if (!entry) continue;

    if (entry.type === 'message') {
      const { role, content } = entry.message;
      if (role === 'user') {
        const text = Array.isArray(content)
          ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : (typeof content === 'string' ? content : '');
        messages.push({ role: 'user', text, timestamp: entry.timestamp });
      } else if (role === 'assistant') {
        const blocks = Array.isArray(content) ? content : [];
        let thinking = '';
        let text = '';
        const toolCalls = [];

        for (const block of blocks) {
          if (block.type === 'thinking') {
            thinking += block.thinking || '';
          } else if (block.type === 'text') {
            text += block.text || '';
          } else if (block.type === 'toolCall') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: block.arguments
            });
          }
        }

        messages.push({
          role: 'assistant',
          text,
          thinking,
          toolCalls,
          timestamp: entry.timestamp,
          model: entry.message.model,
          provider: entry.message.provider,
          usage: entry.message.usage
        });
      } else if (role === 'toolResult') {
        const resultText = Array.isArray(entry.message.content)
          ? entry.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : '';
        messages.push({
          role: 'toolResult',
          toolCallId: entry.message.toolCallId,
          toolName: entry.message.toolName,
          text: resultText,
          isError: entry.message.isError,
          timestamp: entry.timestamp
        });
      }
    }
  }

  return messages;
}

// ─── Session model/thinking extraction ────────────────────────────
function extractModelAndThinking(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let model = null;
  let thinkingLevel = null;

  for (const line of lines) {
    const entry = parseSessionLine(line);
    if (!entry) continue;
    if (entry.type === 'model_change') {
      model = { id: entry.modelId, provider: entry.provider };
    } else if (entry.type === 'thinking_level_change') {
      thinkingLevel = entry.thinkingLevel;
    }
  }

  return { model, thinkingLevel };
}

// ─── Session file watcher ──────────────────────────────────────────
function startSessionWatcher(cwd) {
  stopSessionWatcher();
  currentSessionFile = null;

  const sessionDir = getSessionDir(cwd);
  if (!fs.existsSync(sessionDir)) {
    // Session dir might not exist yet, watch for its creation
    const parentDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
    if (fs.existsSync(parentDir)) {
      sessionDirWatcher = fs.watch(parentDir, (eventType, filename) => {
        if (filename && filename.includes(path.basename(sessionDir).slice(0, 20))) {
          startSessionWatcher(cwd); // Re-watch once the dir exists
        }
      });
    }
    return;
  }

  // Find the latest session file
  const files = fs.readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  if (files.length > 0) {
    const latestFile = path.join(sessionDir, files[0]);
    watchSessionFile(latestFile);
  }

  // Watch for new session files
  sessionDirWatcher = fs.watch(sessionDir, (eventType, filename) => {
    if (filename && filename.endsWith('.jsonl')) {
      const newFile = path.join(sessionDir, filename);
      if (eventType === 'rename' && fs.existsSync(newFile)) {
        // New session file created
        watchSessionFile(newFile);
      }
    }
  });
}

function startNewSessionWatcher(cwd, existingSessionFiles = new Set()) {
  stopSessionWatcher();
  currentSessionFile = null;

  const sessionDir = getSessionDir(cwd);
  const watchExistingNewSession = () => {
    if (!fs.existsSync(sessionDir)) return false;

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(sessionDir, f))
      .filter(filePath => !existingSessionFiles.has(path.resolve(filePath)))
      .sort()
      .reverse();

    if (files.length > 0) {
      watchSessionFile(files[0]);
      return true;
    }
    return false;
  };

  if (watchExistingNewSession()) return;

  if (!fs.existsSync(sessionDir)) {
    const parentDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
    if (fs.existsSync(parentDir)) {
      sessionDirWatcher = fs.watch(parentDir, (eventType, filename) => {
        if (filename && filename.includes(path.basename(sessionDir).slice(0, 20))) {
          startNewSessionWatcher(cwd, existingSessionFiles);
        }
      });
    }
    return;
  }

  sessionDirWatcher = fs.watch(sessionDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.jsonl')) return;

    const newFile = path.join(sessionDir, filename);
    const resolvedNewFile = path.resolve(newFile);
    if (existingSessionFiles.has(resolvedNewFile)) return;

    if (fs.existsSync(newFile)) {
      watchSessionFile(newFile);
    }
  });
}

function watchSessionFile(filePath) {
  filePath = path.resolve(filePath);
  if (currentSessionFile && path.resolve(currentSessionFile) === filePath) return;
  stopSessionFileWatcher();

  currentSessionFile = filePath;
  console.log(`[Session Watcher] Watching: ${filePath}`);

  // Send initial messages from the session
  const messages = extractMessagesFromSession(filePath);
  const meta = readSessionMeta(filePath);
  notifyRenderer('session-messages', {
    sessionId: path.basename(filePath, '.jsonl'),
    sessionPath: filePath,
    meta,
    messages
  });

  // Send initial model/thinking state from session
  const { model, thinkingLevel } = extractModelAndThinking(filePath);
  if (model) notifyRenderer('session-model-change', model);
  if (thinkingLevel) {
    currentThinkingLevel = thinkingLevel;
    notifyRenderer('session-thinking-level-change', { thinkingLevel });
  }

  // Watch for changes
  let lastSize = 0;
  let pendingPartialLine = '';
  try {
    const stat = fs.statSync(filePath);
    lastSize = stat.size;
  } catch {}

  sessionWatcher = fs.watch(filePath, (eventType) => {
    if (eventType === 'change') {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > lastSize) {
          // Read only the new bytes
          const fd = fs.openSync(filePath, 'r');
          const buffer = Buffer.alloc(stat.size - lastSize);
          fs.readSync(fd, buffer, 0, buffer.length, lastSize);
          fs.closeSync(fd);
          lastSize = stat.size;

          const chunkText = pendingPartialLine + buffer.toString('utf8');
          const parts = chunkText.split(/\r?\n/);
          pendingPartialLine = parts.pop() || '';
          const newLines = parts.filter(Boolean);
          for (const line of newLines) {
            const entry = parseSessionLine(line);
            if (!entry) continue;
            if (entry.type === 'message') {
              notifyRenderer('session-entry', {
                ...entry,
                _sessionId: path.basename(filePath, '.jsonl'),
                _sessionPath: filePath
              });
            } else if (entry.type === 'model_change') {
              notifyRenderer('session-model-change', { id: entry.modelId, provider: entry.provider });
            } else if (entry.type === 'thinking_level_change') {
              currentThinkingLevel = entry.thinkingLevel;
              notifyRenderer('session-thinking-level-change', { thinkingLevel: entry.thinkingLevel });
            }
          }
        } else if (stat.size < lastSize) {
          // File was truncated (new session), re-read everything
          lastSize = stat.size;
          const messages = extractMessagesFromSession(filePath);
          const meta = readSessionMeta(filePath);
          notifyRenderer('session-messages', {
            sessionId: path.basename(filePath, '.jsonl'),
            sessionPath: filePath,
            meta,
            messages
          });
        }
      } catch (err) {
        console.error('[Session Watcher] Error reading session file:', err.message);
      }
    }
  });
}

function stopSessionFileWatcher() {
  if (sessionWatcher) {
    sessionWatcher.close();
    sessionWatcher = null;
  }
  currentSessionFile = null;
}

function stopSessionWatcher() {
  stopSessionFileWatcher();
  if (sessionDirWatcher) {
    sessionDirWatcher.close();
    sessionDirWatcher = null;
  }
}

// ─── PTY management ───────────────────────────────────────────────
function startPtyProcess(cwd, options = {}) {
  if (!pty) {
    const error = 'node-pty is not available. Reinstall dependencies or rebuild native modules for Electron.';
    console.error(`[PTY] ${error}`);
    notifyRenderer('pi-agent-error', error);
    return false;
  }

  const startSeq = ++ptyStartSeq;
  if (sessionWatchTimer) {
    clearTimeout(sessionWatchTimer);
    sessionWatchTimer = null;
  }

  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }

  stopSessionWatcher();
  notifyRenderer('pty-reset', {});

  const cliPath = path.resolve(process.env.PI_AGENT_CLI_PATH || 'D:/pi-agent/packages/coding-agent/dist/cli.js');

  if (!fs.existsSync(cliPath)) {
    const error = `Pi Agent CLI not found: ${cliPath}. Set PI_AGENT_CLI_PATH in .env.`;
    console.error(error);
    notifyRenderer('pi-agent-error', error);
    return false;
  }

  // Ensure the session directory exists before starting
  const sessionDir = getSessionDir(cwd);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  let selectedSessionPath = options.sessionPath ? path.resolve(options.sessionPath) : null;
  if (selectedSessionPath && !fs.existsSync(selectedSessionPath)) {
    notifyRenderer('pi-agent-error', `Session file not found: ${selectedSessionPath}`);
    return false;
  }

  // Get the latest session to decide whether to continue
  const existingSessionFiles = new Set();
  let latestSessionPath = null;
  try {
    const files = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();
    for (const file of files) {
      existingSessionFiles.add(path.resolve(path.join(sessionDir, file)));
    }
    if (files.length > 0) {
      latestSessionPath = path.join(sessionDir, files[0]);
    }
  } catch {}

  const args = [cliPath];
  if (selectedSessionPath) {
    args.push('--session', selectedSessionPath);
  } else if (!options.newSession && latestSessionPath) {
    args.push('--session', latestSessionPath);
  }

  const shell = process.platform === 'win32' ? 'node.exe' : 'node';

  try {
    ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      useConpty: false,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      }
    });
  } catch (err) {
    console.error('Failed to spawn PTY:', err);
    notifyRenderer('pi-agent-error', `Failed to spawn PTY: ${err.message}`);
    return false;
  }

  const spawnedProcess = ptyProcess;
  console.log(`[PTY] Spawned pi interactive (PID: ${spawnedProcess.pid})`);
  pendingSessionFile = selectedSessionPath;

  // Forward PTY output to renderer
  spawnedProcess.onData((data) => {
    notifyRenderer('pty-data', data);
  });

  spawnedProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Process exited with code ${exitCode}`);
    if (ptyProcess === spawnedProcess) {
      ptyProcess = null;
      notifyRenderer('pty-exit', { code: exitCode });
    }
  });

  // Start watching the session directory for messages
  // Small delay to let the CLI initialize and create/update the session
  sessionWatchTimer = setTimeout(() => {
    sessionWatchTimer = null;
    if (startSeq !== ptyStartSeq || ptyProcess !== spawnedProcess) return;

    if (selectedSessionPath && fs.existsSync(selectedSessionPath)) {
      watchSessionFile(selectedSessionPath);
    } else if (options.newSession) {
      startNewSessionWatcher(cwd, existingSessionFiles);
    } else {
      startSessionWatcher(cwd);
    }
  }, 2000);

  return true;
}

// ─── IPC Handlers ──────────────────────────────────────────────────

// PTY data input (from xterm.js)
ipcMain.on('pty-input', (event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

// PTY resize
ipcMain.on('pty-resize', (event, { cols, rows }) => {
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch (err) {
      console.error('[PTY] Resize error:', err.message);
    }
  }
});

// Send a prompt to the PTY (chat input)
ipcMain.handle('send-prompt', async (event, data) => {
  if (ptyProcess) {
    writePromptToPty(data);
    return { success: true };
  }
  const cwd = currentWorkspacePath || os.homedir();
  if (startPtyProcess(cwd) && ptyProcess) {
    writePromptToPty(data);
    return { success: true };
  }
  return { success: false, error: 'PTY is not running' };
});

ipcMain.handle('send-pi-command', async (event, command) => {
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

  if (ptyProcess) {
    writePromptToPty(text);
    return { success: true };
  }

  const cwd = currentWorkspacePath || os.homedir();
  if (startPtyProcess(cwd) && ptyProcess) {
    writePromptToPty(text);
    return { success: true };
  }

  return { success: false, error: 'PTY is not running' };
});

// Send raw keybinding to the PTY (for programmatic shortcuts)
ipcMain.handle('send-keybinding', async (event, keyName) => {
  if (!ptyProcess) return { success: false, error: 'PTY is not running' };
  const keyMap = {
    'model-cycle': '\x10',        // Ctrl+P
    'thinking-cycle': '\x1b[Z',   // Shift+Tab
    'interrupt': '\x1b',          // ESC
  };
  const seq = keyMap[keyName];
  if (!seq) return { success: false, error: `Unknown keybinding: ${keyName}` };
  ptyProcess.write(seq);
  return { success: true };
});

ipcMain.handle('select-model', async (event, model) => {
  const provider = String(model?.provider || '').trim();
  const modelId = String(model?.id || model?.modelId || '').trim();
  if (!provider || !modelId) {
    return { success: false, error: 'Missing provider or model id' };
  }

  const cwd = currentWorkspacePath || os.homedir();
  if (!ptyProcess && !startPtyProcess(cwd)) {
    return { success: false, error: 'PTY is not running' };
  }

  writePromptToPty(`/model ${provider}/${modelId}`);
  return { success: true };
});

ipcMain.handle('select-thinking-level', async (event, level) => {
  const targetLevel = String(level || '').trim();
  const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  if (!levels.includes(targetLevel)) {
    return { success: false, error: `Unknown thinking level: ${targetLevel}` };
  }

  const cwd = currentWorkspacePath || os.homedir();
  if (!ptyProcess && !startPtyProcess(cwd)) {
    return { success: false, error: 'PTY is not running' };
  }

  // Use Shift+Tab cycling to reach target level
  const currentIdx = levels.indexOf(currentThinkingLevel || 'off');
  const targetIdx = levels.indexOf(targetLevel);
  let steps = (targetIdx - currentIdx + levels.length) % levels.length;

  const shiftTab = '\x1b[Z';
  for (let i = 0; i < steps; i++) {
    ptyProcess.write(shiftTab);
  }

  currentThinkingLevel = targetLevel;
  return { success: true };
});

// Get session messages (for initial load)
ipcMain.handle('get-session-messages', async () => {
  if (currentSessionFile && fs.existsSync(currentSessionFile)) {
    return extractMessagesFromSession(currentSessionFile);
  }
  return [];
});

ipcMain.handle('list-sessions', async () => {
  return listSessionMetas();
});

ipcMain.handle('open-session', async (event, sessionPath) => {
  if (!sessionPath || typeof sessionPath !== 'string') {
    return { success: false, error: 'Missing session path' };
  }

  try {
    const resolvedPath = path.resolve(sessionPath);
    const meta = readSessionMeta(resolvedPath);
    if (!meta) return { success: false, error: 'Session file not found' };

    currentWorkspacePath = meta.cwd || currentWorkspacePath || os.homedir();
    const ok = startPtyProcess(currentWorkspacePath, { sessionPath: resolvedPath });
    if (!ok) return { success: false, error: 'Failed to start PTY' };

    watchSessionFile(resolvedPath);
    return { success: true, meta };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-session', async (event, sessionPath) => {
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

    const isCurrentSession = currentSessionFile && path.resolve(currentSessionFile) === resolvedPath;
    if (isCurrentSession) {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
      stopSessionFileWatcher();
      currentSessionFile = null;
      pendingSessionFile = null;
      notifyRenderer('pty-reset', {});
    }

    await shell.trashItem(resolvedPath);
    return { success: true, deleted: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('new-session', async (event, workspacePath) => {
  try {
    const requestedPath = typeof workspacePath === 'string' && workspacePath
      ? path.resolve(workspacePath)
      : (currentWorkspacePath || os.homedir());
    const stat = fs.statSync(requestedPath);
    if (!stat.isDirectory()) return { success: false, error: 'Workspace is not a directory' };

    currentWorkspacePath = requestedPath;
    const ok = startPtyProcess(requestedPath, { newSession: true });
    return { success: ok, workspacePath: requestedPath, workspaceName: path.basename(requestedPath) || requestedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// PTY status
ipcMain.handle('get-pty-status', async () => {
  return {
    running: !!ptyProcess,
    pid: ptyProcess?.pid || null,
    workspace: currentWorkspacePath,
    sessionPath: currentSessionFile,
    sessionId: currentSessionFile ? path.basename(currentSessionFile, '.jsonl') : null
  };
});

// Start PTY on-demand (called when terminal mounts)
ipcMain.handle('start-pty', async () => {
  if (ptyProcess) return { success: true, pid: ptyProcess.pid };
  const cwd = currentWorkspacePath || os.homedir();
  const ok = startPtyProcess(cwd);
  return { success: ok };
});

// Stop PTY (called when terminal unmounts)
ipcMain.handle('stop-pty', async () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  stopSessionWatcher();
  return { success: true };
});

// Fetch available models from CLI
ipcMain.handle('get-available-models', async () => {
  return fetchAvailableModels();
});

// Workspace management
ipcMain.handle('select-workspace-folder', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择工作区文件夹',
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const folderPath = path.resolve(result.filePaths[0]);
  if (currentWorkspacePath !== folderPath) {
    currentWorkspacePath = folderPath;
    startPtyProcess(folderPath);
  }

  return {
    path: folderPath,
    name: path.basename(folderPath) || folderPath
  };
});

ipcMain.handle('set-workspace-folder', async (event, folderPath, options = {}) => {
  if (!folderPath || typeof folderPath !== 'string') return { success: false };
  try {
    const resolvedPath = path.resolve(folderPath);
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) return { success: false };

    if (currentWorkspacePath !== resolvedPath) {
      currentWorkspacePath = resolvedPath;
      if (options?.startPty !== false) {
        startPtyProcess(resolvedPath);
      }
    }
    return { success: true, path: resolvedPath, name: path.basename(resolvedPath) || resolvedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reveal-workspace-folder', async () => {
  if (!currentWorkspacePath) return { success: false };
  const error = await shell.openPath(currentWorkspacePath);
  return { success: !error, error };
});

// Restart PTY (for workspace change or manual restart)
ipcMain.handle('restart-pty', async () => {
  const cwd = currentWorkspacePath || os.homedir();
  return startPtyProcess(cwd);
});

// Clipboard
ipcMain.handle('clipboard-read-text', async () => clipboard.readText());
ipcMain.handle('clipboard-write-text', async (event, text) => {
  clipboard.writeText(typeof text === 'string' ? text : '');
  return true;
});

// File upload
ipcMain.handle('save-uploaded-file', async (event, name, base64Data, meta = {}) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const baseDir = currentWorkspacePath || os.homedir();
    const uploadRoot = path.join(baseDir, '.uploaded_files');
    const sessionSegment = sanitizePathSegment(meta?.sessionId || (currentSessionFile ? path.basename(currentSessionFile, '.jsonl') : ''), 'drafts');
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

// Env management
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

    // Restart PTY to apply new env
    console.log('[Env Sync] Restarting PTY...');
    const cwd = currentWorkspacePath || os.homedir();
    startPtyProcess(cwd);

    return { success: true };
  } catch (error) {
    console.error('Failed to save .env file:', error);
    return { success: false, error: error.message };
  }
});

// Skills sync
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

// ─── Window creation ───────────────────────────────────────────────
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

// ─── App lifecycle ─────────────────────────────────────────────────
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
  stopSessionWatcher();
  if (ptyProcess) {
    ptyProcess.kill();
  }
});
