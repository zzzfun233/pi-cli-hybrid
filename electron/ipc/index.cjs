const { registerPtyHandlers } = require('./pty-handlers.cjs');
const { registerSessionHandlers } = require('./session-handlers.cjs');
const { registerWorkspaceHandlers } = require('./workspace-handlers.cjs');
const { registerSystemHandlers } = require('./system-handlers.cjs');
const { registerConfigHandlers } = require('./config-handlers.cjs');

function registerIpcHandlers(getMainWindow, ptyManager, sessionWatcher) {
  registerPtyHandlers(ptyManager, sessionWatcher);
  registerSessionHandlers(ptyManager, sessionWatcher);
  registerWorkspaceHandlers(getMainWindow, ptyManager);
  registerSystemHandlers(ptyManager, sessionWatcher);
  registerConfigHandlers(ptyManager);
}

module.exports = {
  registerIpcHandlers
};
