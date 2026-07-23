import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IMAGE_LIMITS } from './content-contract.mjs';

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function checkMagicBytes(mime, buf) {
  if (mime === 'image/png') {
    if (buf.length < 8) return false;
    const expected = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    return expected.every((b, i) => buf[i] === b);
  }
  if (mime === 'image/jpeg') {
    if (buf.length < 3) return false;
    return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  }
  if (mime === 'image/gif') {
    if (buf.length < 3) return false;
    return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  }
  if (mime === 'image/webp') {
    if (buf.length < 12) return false;
    const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
    const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

export function extractImagesFromPayload(payload, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const imagePrefix = options.imagePrefix || '/images/content/';
  const maxImageBytes = options.maxImageBytes ?? IMAGE_LIMITS.maxSingleBytes;
  const maxTotalBytes = options.maxTotalBytes ?? IMAGE_LIMITS.maxPayloadBytes;

  const imageFiles = [];
  const seenHashes = new Map();
  let totalImageBytes = 0;

  function transform(value) {
    if (typeof value === 'string') {
      if (!value.startsWith('data:')) {
        return value;
      }
      if (!value.startsWith('data:image/')) {
        return value;
      }

      const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value);
      if (!match) {
        throw new Error('Invalid data:image URL format');
      }

      const mime = match[1].toLowerCase();
      if (!IMAGE_LIMITS.allowedMimeTypes.has(mime)) {
        throw new Error(`Disallowed image MIME type: ${mime}`);
      }

      const ext = MIME_TO_EXT[mime];
      if (!ext) {
        throw new Error(`Unsupported image MIME type: ${mime}`);
      }

      const base64Str = match[2].replace(/\s/g, '');
      const buf = Buffer.from(base64Str, 'base64');

      if (buf.length > maxImageBytes) {
        throw new Error(`Single image size (${buf.length} bytes) exceeds limit (${maxImageBytes} bytes)`);
      }

      if (!checkMagicBytes(mime, buf)) {
        const detected = Array.from(buf.slice(0, 8))
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(', ');
        throw new Error(`Magic bytes mismatch for ${mime}: detected [${detected}]`);
      }

      totalImageBytes += buf.length;
      if (totalImageBytes > maxTotalBytes) {
        throw new Error(`Total images size (${totalImageBytes} bytes) exceeds payload limit (${maxTotalBytes} bytes)`);
      }

      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const filename = `${sha256}.${ext}`;
      const newPath = `${imagePrefix}${filename}`;

      if (seenHashes.has(sha256)) {
        return newPath;
      }

      const absolutePath = path.join(publicDir, 'images', 'content', filename);
      const relativePath = path.posix.join('public', 'images', 'content', filename);
      const created = !fs.existsSync(absolutePath);

      const entry = {
        absolutePath,
        relativePath,
        created,
        sha256,
        bytes: buf,
        mime,
        ext,
      };

      seenHashes.set(sha256, entry);
      imageFiles.push(entry);

      return newPath;
    }

    if (Array.isArray(value)) {
      return value.map(transform);
    }

    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = transform(v);
      }
      return out;
    }

    return value;
  }

  const transformedPayload = transform(payload);

  return {
    payload: transformedPayload,
    imageFiles,
    totalImageBytes,
  };
}
