const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ─── PTY Terminal ───────────────────────────────────────
  ptyInput: (data) => ipcRenderer.send('pty-input', data),
  ptyResize: (cols, rows) => ipcRenderer.send('pty-resize', { cols, rows }),
  onPtyData: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('pty-data', subscription);
    return () => ipcRenderer.removeListener('pty-data', subscription);
  },
  onPtyExit: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('pty-exit', subscription);
    return () => ipcRenderer.removeListener('pty-exit', subscription);
  },
  onPtyReset: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('pty-reset', subscription);
    return () => ipcRenderer.removeListener('pty-reset', subscription);
  },

  // ─── Chat / Prompts ────────────────────────────────────
  sendPrompt: (text) => ipcRenderer.invoke('send-prompt', text),
  getSessionMessages: () => ipcRenderer.invoke('get-session-messages'),
  getSessionThinkingLevel: (sessionPath) => ipcRenderer.invoke('get-session-thinking-level', sessionPath),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  openSession: (sessionPath) => ipcRenderer.invoke('open-session', sessionPath),
  deleteSession: (sessionPath) => ipcRenderer.invoke('delete-session', sessionPath),
  newSession: (workspacePath) => ipcRenderer.invoke('new-session', workspacePath),
  onSessionMessages: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('session-messages', subscription);
    return () => ipcRenderer.removeListener('session-messages', subscription);
  },
  onSessionEntry: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('session-entry', subscription);
    return () => ipcRenderer.removeListener('session-entry', subscription);
  },
  onSessionModelChange: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('session-model-change', subscription);
    return () => ipcRenderer.removeListener('session-model-change', subscription);
  },
  onSessionThinkingLevelChange: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('session-thinking-level-change', subscription);
    return () => ipcRenderer.removeListener('session-thinking-level-change', subscription);
  },
  // ─── PTY Status ────────────────────────────────────────
  startPty: () => ipcRenderer.invoke('start-pty'),
  getPtyStatus: () => ipcRenderer.invoke('get-pty-status'),
  restartPty: () => ipcRenderer.invoke('restart-pty'),
  sendKeybinding: (keyName) => ipcRenderer.invoke('send-keybinding', keyName),
  selectModel: (provider, modelId) => ipcRenderer.invoke('select-model', { provider, id: modelId }),
  selectThinkingLevel: (level) => ipcRenderer.invoke('select-thinking-level', level),
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),

  // ─── Legacy RPC mode (kept as fallback) ────────────────
  sendPiCommand: (command) => ipcRenderer.invoke('send-pi-command', typeof command === 'string' ? command : JSON.stringify(command)),
  onPiMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('pi-agent-message', subscription);
    return () => ipcRenderer.removeListener('pi-agent-message', subscription);
  },

  // ─── Workspace ─────────────────────────────────────────
  selectWorkspaceFolder: () => ipcRenderer.invoke('select-workspace-folder'),
  setWorkspaceFolder: (folderPath, options) => ipcRenderer.invoke('set-workspace-folder', folderPath, options),
  revealWorkspaceFolder: () => ipcRenderer.invoke('reveal-workspace-folder'),

  // ─── Clipboard ─────────────────────────────────────────
  readClipboardText: () => ipcRenderer.invoke('clipboard-read-text'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard-write-text', text),

  // ─── File Upload ───────────────────────────────────────
  saveUploadedFile: (name, base64Data, meta) => ipcRenderer.invoke('save-uploaded-file', name, base64Data, meta),

  // ─── Environment ───────────────────────────────────────
  getEnv: () => ipcRenderer.invoke('get-env'),
  saveEnv: (envVars) => ipcRenderer.invoke('save-env', envVars),

  // ─── Skills ────────────────────────────────────────────
  syncSkills: (skills) => ipcRenderer.invoke('sync-skills', skills),

  // ─── Error channel ─────────────────────────────────────
  onPiAgentError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('pi-agent-error', subscription);
    return () => ipcRenderer.removeListener('pi-agent-error', subscription);
  }
});
