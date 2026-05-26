import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const IMAGES_DIR = (() => {
  const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || __dirname;
  return path.join(home, '.config', 'opencode', 'images');
})();

fs.mkdirSync(IMAGES_DIR, { recursive: true });

function saveImage(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, commaIdx);
  const mime = (header.match(/data:(image\/\w+)/) || [])[1] || 'image/png';
  const buf = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
  const ext = extMap[mime] || 'png';
  const filename = `${ts}_${hash}.${ext}`;
  const filePath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

function getImageUrl(part) {
  if (typeof part.image_url === 'string') return part.image_url;
  if (part.image_url?.url) return part.image_url.url;
  if (part.url) return part.url;
  return null;
}

function isImagePart(part) {
  if (!part) return false;
  return part.type === 'image_url' || part.type === 'image' || !!part.image_url || !!part.url;
}

async function replaceImages(parts) {
  if (!Array.isArray(parts)) return;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isImagePart(parts[i])) {
      const url = getImageUrl(parts[i]);
      let filePath = '';
      if (url?.startsWith('data:image/')) {
        filePath = saveImage(url);
      }
      parts.splice(i, 1, { type: 'text', text: `[用户粘贴了图片，保存至: ${filePath || '(未保存)'}]` });
    }
  }
}

export const VisionProxyPlugin = async () => {
  return {
    'chat.message': async (input, output) => {
      if (output.parts) await replaceImages(output.parts);
    },
    'experimental.chat.messages.transform': async (input, output) => {
      if (output.messages) {
        for (const msg of output.messages) {
          if (msg.parts) await replaceImages(msg.parts);
        }
      }
    },
  };
};
