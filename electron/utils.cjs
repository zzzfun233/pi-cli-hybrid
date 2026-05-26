const path = require('path');
const os = require('os');
const fs = require('fs');

const debugLogPath = path.join(os.homedir(), '.pi', 'debug.log');

// Clear log on startup
try { fs.writeFileSync(debugLogPath, ''); } catch {}

function debugLog(...args) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(debugLogPath, line);
  } catch {}
  console.log(msg);
}

function quoteEnvValue(value) {
  return JSON.stringify(String(value ?? ''));
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

module.exports = {
  debugLog,
  quoteEnvValue,
  sanitizePathSegment,
  uniqueFilePath
};
