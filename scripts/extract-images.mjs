// One-off migration: extract embedded base64 data:URL images out of the data
// modules into static files under public/images/content/<sha256>.<ext>, and
// rewrite the data modules to reference the file paths instead. Idempotent:
// re-running only adds files that don't already exist (hash-addressed), and
// re-writing an already-migrated module is a no-op.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = process.cwd();
const outDir = path.join(root, 'public', 'images', 'content');
fs.mkdirSync(outDir, { recursive: true });

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const targets = [
  { file: 'data/work.js', exportName: 'workItems', mod: '../data/work.js', key: 'workItems' },
  { file: 'data/art.js', exportName: 'artItems', mod: '../data/art.js', key: 'artItems' },
  { file: 'data/pixilart.js', exportName: 'pixilartItems', mod: '../data/pixilart.js', key: 'pixilartItems' },
  { file: 'data/type.js', exportName: 'typeItems', mod: '../data/type.js', key: 'typeItems' },
  { file: 'data/about.js', exportName: 'profile', mod: '../data/about.js', key: 'profile' },
];

let totalExtracted = 0;
let totalReused = 0;

function makeConverter(counter) {
  const convert = (value) => {
    if (typeof value === 'string') {
      if (!value.startsWith('data:image/')) return value;
      const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value);
      if (!match) return value;
      const mime = match[1].toLowerCase();
      const ext = MIME_EXT[mime];
      if (!ext) {
        // Unknown/unsupported MIME: leave as-is rather than mangle.
        return value;
      }
      const buf = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      const fname = `${hash}.${ext}`;
      const fpath = path.join(outDir, fname);
      if (fs.existsSync(fpath)) {
        totalReused += 1;
      } else {
        fs.writeFileSync(fpath, buf);
        totalExtracted += 1;
      }
      counter.count += 1;
      return `/images/content/${fname}`;
    }
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = convert(v);
      return out;
    }
    return value;
  };
  return convert;
}

async function run() {
  for (const t of targets) {
    const counter = { count: 0 };
    const mod = await import(`${t.mod}?v=${Date.now()}`);
    const data = mod[t.key];
    if (data === undefined) {
      console.log(`${t.file}: export ${t.key} not found, skipped`);
      continue;
    }
    const converted = makeConverter(counter)(data);
    if (counter.count === 0) {
      console.log(`${t.file}: no embedded images, left untouched`);
      continue;
    }
    const out = `export const ${t.exportName} = ${JSON.stringify(converted, null, 2)};\n`;
    fs.writeFileSync(path.join(root, t.file), out, 'utf8');
    console.log(`${t.file}: converted ${counter.count} embedded image(s), rewritten`);
  }
  console.log(`DONE extracted=${totalExtracted} reused=${totalReused} outDir=${path.relative(root, outDir)}`);
}

run().catch((error) => {
  console.error('MIGRATION FAILED:', error);
  process.exit(1);
});
