const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getSessionDir,
  parseSessionLine,
  readSessionMeta,
  extractMessagesFromSession,
  extractModelAndThinking
} = require('./session-parser.cjs');

class SessionWatcher {
  constructor(notifyRenderer) {
    this.notifyRenderer = notifyRenderer;
    this.currentSessionFile = null;
    this.sessionWatcher = null;
    this.sessionDirWatcher = null;
    this.currentThinkingLevel = 'medium';
    this.optimisticThinkingLevel = null;
    this.thinkingLevelLockUntil = 0;
  }

  startSessionWatcher(cwd) {
    this.stopSessionWatcher();
    this.currentSessionFile = null;

    const sessionDir = getSessionDir(cwd);
    if (!fs.existsSync(sessionDir)) {
      const parentDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
      if (fs.existsSync(parentDir)) {
        this.sessionDirWatcher = fs.watch(parentDir, (eventType, filename) => {
          if (filename && filename.includes(path.basename(sessionDir).slice(0, 20))) {
            this.startSessionWatcher(cwd);
          }
        });
      }
      return;
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    if (files.length > 0) {
      const latestFile = path.join(sessionDir, files[0]);
      this.watchSessionFile(latestFile);
    }

    this.sessionDirWatcher = fs.watch(sessionDir, (eventType, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        const newFile = path.join(sessionDir, filename);
        if (eventType === 'rename' && fs.existsSync(newFile)) {
          this.watchSessionFile(newFile);
        }
      }
    });
  }

  startNewSessionWatcher(cwd, existingSessionFiles = new Set()) {
    this.stopSessionWatcher();
    this.currentSessionFile = null;

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
        this.watchSessionFile(files[0]);
        return true;
      }
      return false;
    };

    if (watchExistingNewSession()) return;

    if (!fs.existsSync(sessionDir)) {
      const parentDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
      if (fs.existsSync(parentDir)) {
        this.sessionDirWatcher = fs.watch(parentDir, (eventType, filename) => {
          if (filename && filename.includes(path.basename(sessionDir).slice(0, 20))) {
            this.startNewSessionWatcher(cwd, existingSessionFiles);
          }
        });
      }
      return;
    }

    this.sessionDirWatcher = fs.watch(sessionDir, (eventType, filename) => {
      if (!filename || !filename.endsWith('.jsonl')) return;

      const newFile = path.join(sessionDir, filename);
      const resolvedNewFile = path.resolve(newFile);
      if (existingSessionFiles.has(resolvedNewFile)) return;

      if (fs.existsSync(newFile)) {
        this.watchSessionFile(newFile);
      }
    });
  }

  watchSessionFile(filePath) {
    filePath = path.resolve(filePath);
    if (this.currentSessionFile && path.resolve(this.currentSessionFile) === filePath) return;
    this.stopSessionFileWatcher();

    this.optimisticThinkingLevel = null;
    this.thinkingLevelLockUntil = 0;

    this.currentSessionFile = filePath;
    console.log(`[Session Watcher] Watching: ${filePath}`);

    const messages = extractMessagesFromSession(filePath);
    const meta = readSessionMeta(filePath);
    this.notifyRenderer('session-messages', {
      sessionId: path.basename(filePath, '.jsonl'),
      sessionPath: filePath,
      meta,
      messages
    });

    const { model, thinkingLevel } = extractModelAndThinking(filePath);
    if (model) this.notifyRenderer('session-model-change', model);
    
    this.currentThinkingLevel = thinkingLevel || 'medium';
    this.notifyRenderer('session-thinking-level-change', { thinkingLevel: this.currentThinkingLevel });

    let lastSize = 0;
    let pendingPartialLine = '';
    try {
      const stat = fs.statSync(filePath);
      lastSize = stat.size;
    } catch {}

    const readIncremental = () => {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > lastSize) {
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
              this.notifyRenderer('session-entry', {
                ...entry,
                _sessionId: path.basename(filePath, '.jsonl'),
                _sessionPath: filePath
              });
            } else if (entry.type === 'model_change') {
              this.notifyRenderer('session-model-change', { id: entry.modelId, provider: entry.provider });
            } else if (entry.type === 'thinking_level_change') {
              this.currentThinkingLevel = entry.thinkingLevel;
              if (Date.now() > this.thinkingLevelLockUntil) {
                this.notifyRenderer('session-thinking-level-change', { thinkingLevel: entry.thinkingLevel });
              }
            }
          }
        } else if (stat.size < lastSize) {
          lastSize = stat.size;
          this.optimisticThinkingLevel = null;
          this.thinkingLevelLockUntil = 0;
          const messages = extractMessagesFromSession(filePath);
          const meta = readSessionMeta(filePath);
          this.notifyRenderer('session-messages', {
            sessionId: path.basename(filePath, '.jsonl'),
            sessionPath: filePath,
            meta,
            messages
          });

          const { model, thinkingLevel } = extractModelAndThinking(filePath);
          if (model) this.notifyRenderer('session-model-change', model);
          this.currentThinkingLevel = thinkingLevel || 'medium';
          this.notifyRenderer('session-thinking-level-change', { thinkingLevel: this.currentThinkingLevel });
        }
      } catch (err) {
        console.error('[Session Watcher] Error reading session file:', err.message);
      }
    };

    this.sessionWatcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        readIncremental();
      }
    });

    const pollInterval = setInterval(() => {
      if (this.currentSessionFile === filePath) {
        readIncremental();
      } else {
        clearInterval(pollInterval);
      }
    }, 1000);
    this.sessionWatcher.pollInterval = pollInterval;

    readIncremental();
  }

  stopSessionFileWatcher() {
    if (this.sessionWatcher) {
      if (this.sessionWatcher.pollInterval) clearInterval(this.sessionWatcher.pollInterval);
      this.sessionWatcher.close();
      this.sessionWatcher = null;
    }
    this.currentSessionFile = null;
  }

  stopSessionWatcher() {
    this.stopSessionFileWatcher();
    if (this.sessionDirWatcher) {
      this.sessionDirWatcher.close();
      this.sessionDirWatcher = null;
    }
  }
}

module.exports = SessionWatcher;
