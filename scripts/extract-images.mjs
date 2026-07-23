// One-off migration: extract embedded base64 data:URL images out of the data
// modules into static files under public/images/content/<sha256>.<ext>, and
// rewrite the data modules to reference the file paths instead. Idempotent:
// re-running only adds files that don't already exist (hash-addressed), and
// re-writing an already-migrated module is a no-op.
import fs from 'fs';
import path from 'path';
import { extractImagesFromPayload } from '../lib/image-extractor.mjs';

const root = process.cwd();
const outDir = path.join(root, 'public', 'images', 'content');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'data/work.js', exportName: 'workItems', mod: '../data/work.js', key: 'workItems' },
  { file: 'data/art.js', exportName: 'artItems', mod: '../data/art.js', key: 'artItems' },
  { file: 'data/pixilart.js', exportName: 'pixilartItems', mod: '../data/pixilart.js', key: 'pixilartItems' },
  { file: 'data/type.js', exportName: 'typeItems', mod: '../data/type.js', key: 'typeItems' },
  { file: 'data/about.js', exportName: 'profile', mod: '../data/about.js', key: 'profile' },
];

let totalExtracted = 0;
let totalReused = 0;

async function run() {
  for (const t of targets) {
    const mod = await import(`${t.mod}?v=${Date.now()}`);
    const data = mod[t.key];
    if (data === undefined) {
      console.log(`${t.file}: export ${t.key} not found, skipped`);
      continue;
    }

    const { payload: converted, imageFiles } = extractImagesFromPayload(data, {
      publicDir: path.join(root, 'public'),
      imagePrefix: '/images/content/',
    });

    if (imageFiles.length === 0) {
      console.log(`${t.file}: no embedded images, left untouched`);
      continue;
    }

    let fileExtracted = 0;
    let fileReused = 0;

    for (const img of imageFiles) {
      if (img.created) {
        fs.mkdirSync(path.dirname(img.absolutePath), { recursive: true });
        fs.writeFileSync(img.absolutePath, img.bytes);
        fileExtracted += 1;
      } else {
        fileReused += 1;
      }
    }

    totalExtracted += fileExtracted;
    totalReused += fileReused;

    const count = imageFiles.length;
    const out = `export const ${t.exportName} = ${JSON.stringify(converted, null, 2)};\n`;
    fs.writeFileSync(path.join(root, t.file), out, 'utf8');
    console.log(`${t.file}: converted ${count} embedded image(s), rewritten`);
  }
  console.log(`DONE extracted=${totalExtracted} reused=${totalReused} outDir=${path.relative(root, outDir)}`);
}

run().catch((error) => {
  console.error('MIGRATION FAILED:', error);
  process.exit(1);
});
