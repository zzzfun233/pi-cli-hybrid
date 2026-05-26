const fs = require('fs');
const path = require('path');
const os = require('os');
const { getSessionDir } = require('./session-parser.cjs');
const { debugLog } = require('./utils.cjs');

let pty = null;
try {
  pty = require('node-pty');
} catch (error) {
  console.error('[PTY] Failed to load node-pty:', error.message);
}

class PtyManager {
  constructor(notifyRenderer, sessionWatcher) {
    this.notifyRenderer = notifyRenderer;
    this.sessionWatcher = sessionWatcher;
    this.ptyProcess = null;
    this.ptyStartSeq = 0;
    this.sessionWatchTimer = null;
    this.pendingSessionFile = null;
    this.currentWorkspacePath = null;
  }

  writePromptToPty(text) {
    const value = String(text ?? '');
    if (this.ptyProcess) {
      this.ptyProcess.write(`\x1b[200~${value}\x1b[201~\r`);
    }
  }

  startPtyProcess(cwd, options = {}) {
    this.currentWorkspacePath = cwd;
    debugLog('[PTY] startPtyProcess called. cwd=' + cwd + ' options=' + JSON.stringify(options) + ' existingPty=' + !!this.ptyProcess);

    if (!pty) {
      const error = 'node-pty is not available. Reinstall dependencies or rebuild native modules for Electron.';
      console.error(`[PTY] ${error}`);
      this.notifyRenderer('pi-agent-error', error);
      return false;
    }

    const startSeq = ++this.ptyStartSeq;
    if (this.sessionWatchTimer) {
      clearTimeout(this.sessionWatchTimer);
      this.sessionWatchTimer = null;
    }

    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    this.sessionWatcher.stopSessionWatcher();
    this.notifyRenderer('pty-reset', {});

    const cliPath = path.resolve(process.env.PI_AGENT_CLI_PATH || 'D:/pi-agent/packages/coding-agent/dist/cli.js');

    if (!fs.existsSync(cliPath)) {
      const error = `Pi Agent CLI not found: ${cliPath}. Set PI_AGENT_CLI_PATH in .env.`;
      console.error(error);
      this.notifyRenderer('pi-agent-error', error);
      return false;
    }

    const sessionDir = getSessionDir(cwd);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    let selectedSessionPath = options.sessionPath ? path.resolve(options.sessionPath) : null;
    if (selectedSessionPath && !fs.existsSync(selectedSessionPath)) {
      this.notifyRenderer('pi-agent-error', `Session file not found: ${selectedSessionPath}`);
      return false;
    }

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
      this.ptyProcess = pty.spawn(shell, args, {
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
      this.notifyRenderer('pi-agent-error', `Failed to spawn PTY: ${err.message}`);
      return false;
    }

    const spawnedProcess = this.ptyProcess;
    console.log(`[PTY] Spawned pi interactive (PID: ${spawnedProcess.pid})`);
    this.pendingSessionFile = selectedSessionPath;

    spawnedProcess.onData((data) => {
      if (this.ptyProcess !== spawnedProcess) {
        debugLog('[PTY] onData SUPPRESSED: old PTY, dataLen=' + data.length);
        return;
      }
      this.notifyRenderer('pty-data', data);
    });

    spawnedProcess.onExit(({ exitCode }) => {
      debugLog('[PTY] onExit: code=' + exitCode + ' isActive=' + (this.ptyProcess === spawnedProcess));
      console.log(`[PTY] Process exited with code ${exitCode}`);
      if (this.ptyProcess === spawnedProcess) {
        this.ptyProcess = null;
        this.notifyRenderer('pty-exit', { code: exitCode });
      }
    });

    this.sessionWatchTimer = setTimeout(() => {
      this.sessionWatchTimer = null;
      if (startSeq !== this.ptyStartSeq || this.ptyProcess !== spawnedProcess) return;

      if (selectedSessionPath && fs.existsSync(selectedSessionPath)) {
        this.sessionWatcher.watchSessionFile(selectedSessionPath);
      } else if (options.newSession) {
        this.sessionWatcher.startNewSessionWatcher(cwd, existingSessionFiles);
      } else {
        this.sessionWatcher.startSessionWatcher(cwd);
      }
    }, 2000);

    return true;
  }
}

module.exports = PtyManager;
