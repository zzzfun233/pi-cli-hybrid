const fs = require('fs');
const path = require('path');

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

module.exports = {
  collectUploadedFiles,
  pruneEmptyDirs,
  cleanupUploadedFiles
};
