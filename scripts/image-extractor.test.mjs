import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractImagesFromPayload } from '../lib/image-extractor.mjs';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');
const JPEG_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);
const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const WEBP_BYTES = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=', 'base64');

describe('image-extractor module', () => {
  test('1. PNG base64 -> correct hash path and decoded bytes', () => {
    const dataUrl = `data:image/png;base64,${PNG_BASE64}`;
    const expectedHash = crypto.createHash('sha256').update(PNG_BYTES).digest('hex');

    const result = extractImagesFromPayload({ img: dataUrl });
    assert.equal(result.payload.img, `/images/content/${expectedHash}.png`);
    assert.equal(result.imageFiles.length, 1);
    assert.equal(result.imageFiles[0].sha256, expectedHash);
    assert.equal(result.imageFiles[0].ext, 'png');
    assert.deepEqual(result.imageFiles[0].bytes, PNG_BYTES);
  });

  test('2. Same payload with identical base64 in two fields -> 1 imageFile entry', () => {
    const dataUrl = `data:image/png;base64,${PNG_BASE64}`;

    const result = extractImagesFromPayload({ img1: dataUrl, img2: dataUrl });
    assert.equal(result.payload.img1, result.payload.img2);
    assert.equal(result.imageFiles.length, 1);
  });

  test('3. Non-image data URL -> not converted, left as-is', () => {
    const pdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK...';
    const result = extractImagesFromPayload({ doc: pdfDataUrl });
    assert.equal(result.payload.doc, pdfDataUrl);
    assert.equal(result.imageFiles.length, 0);
  });

  test('4. Existing /images/... path -> unchanged', () => {
    const localPath = '/images/content/abc12345.png';
    const result = extractImagesFromPayload({ img: localPath });
    assert.equal(result.payload.img, localPath);
    assert.equal(result.imageFiles.length, 0);
  });

  test('5. External https://... URL -> unchanged', () => {
    const url = 'https://example.com/photo.jpg';
    const result = extractImagesFromPayload({ img: url });
    assert.equal(result.payload.img, url);
    assert.equal(result.imageFiles.length, 0);
  });

  test('6. Plain text string -> unchanged', () => {
    const text = 'Hello world';
    const result = extractImagesFromPayload({ title: text });
    assert.equal(result.payload.title, text);
    assert.equal(result.imageFiles.length, 0);
  });

  test('7. SVG MIME -> throws error (not in allowlist)', () => {
    const svgDataUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    assert.throws(() => {
      extractImagesFromPayload({ img: svgDataUrl });
    }, /Disallowed image MIME type/i);
  });

  test('8. PNG magic-byte valid -> passes', () => {
    const dataUrl = `data:image/png;base64,${PNG_BASE64}`;
    const result = extractImagesFromPayload({ img: dataUrl });
    assert.equal(result.imageFiles.length, 1);
  });

  test('9. Claiming PNG but containing JPEG bytes -> throws magic-byte mismatch', () => {
    const fakePngDataUrl = `data:image/png;base64,${JPEG_BYTES.toString('base64')}`;
    assert.throws(() => {
      extractImagesFromPayload({ img: fakePngDataUrl });
    }, /Magic bytes mismatch for image\/png/i);
  });

  test('10. Claiming JPEG but containing PNG bytes -> throws magic-byte mismatch', () => {
    const fakeJpegDataUrl = `data:image/jpeg;base64,${PNG_BYTES.toString('base64')}`;
    assert.throws(() => {
      extractImagesFromPayload({ img: fakeJpegDataUrl });
    }, /Magic bytes mismatch for image\/jpeg/i);
  });

  test('11. totalImageBytes correctly calculated across multiple images', () => {
    const pngUrl = `data:image/png;base64,${PNG_BASE64}`;
    const jpegUrl = `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`;

    const pngLen = PNG_BYTES.length;
    const jpegLen = JPEG_BYTES.length;

    const result = extractImagesFromPayload({ img1: pngUrl, img2: jpegUrl });
    assert.equal(result.totalImageBytes, pngLen + jpegLen);
  });

  test('12. Deep nested object -> correct conversion', () => {
    const pngUrl = `data:image/png;base64,${PNG_BASE64}`;

    const payload = {
      workItems: [
        {
          id: 'work-1',
          images: [
            {
              image: pngUrl,
              caption: 'Test caption',
            },
          ],
        },
      ],
    };

    const result = extractImagesFromPayload(payload);
    assert(result.payload.workItems[0].images[0].image.startsWith('/images/content/'));
    assert.equal(result.payload.workItems[0].images[0].caption, 'Test caption');
    assert.equal(result.imageFiles.length, 1);
  });

  test('13. GIF and WebP magic-bytes valid -> pass', () => {
    const gifUrl = `data:image/gif;base64,${GIF_BYTES.toString('base64')}`;
    const webpUrl = `data:image/webp;base64,${WEBP_BYTES.toString('base64')}`;

    const result = extractImagesFromPayload({ gif: gifUrl, webp: webpUrl });
    assert.equal(result.imageFiles.length, 2);
    assert.equal(result.imageFiles[0].ext, 'gif');
    assert.equal(result.imageFiles[1].ext, 'webp');
  });
});
