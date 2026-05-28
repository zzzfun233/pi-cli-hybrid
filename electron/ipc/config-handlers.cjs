const { ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const { quoteEnvValue } = require('../utils.cjs');

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

function registerConfigHandlers(ptyManager) {
  ipcMain.handle('get-available-models', async () => {
    return fetchAvailableModels();
  });

  ipcMain.handle('get-env', async () => {
    try {
      const envPath = path.join(__dirname, '../../.env');
      if (!fs.existsSync(envPath)) return {};
      return dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    } catch (error) {
      console.error('Failed to read .env file:', error);
      return {};
    }
  });

  ipcMain.handle('save-env', async (event, envVars) => {
    try {
      const envPath = path.join(__dirname, '../../.env');
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

module.exports = { registerConfigHandlers };
