const fs = require('fs');
const path = require('path');
const os = require('os');

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
        messages.push({ id: entry.id, role: 'user', text, timestamp: entry.timestamp });
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
          id: entry.id,
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

module.exports = {
  getSessionDir,
  parseSessionLine,
  readSessionMeta,
  listSessionMetas,
  extractMessagesFromSession,
  extractModelAndThinking
};
