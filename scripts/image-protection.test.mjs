import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasImageUrlBackground,
  isAdminPath,
} from '../lib/image-protection.mjs';

test('admin route detection excludes only the admin route tree', () => {
  assert.equal(isAdminPath('/admin'), true);
  assert.equal(isAdminPath('/admin/media'), true);
  assert.equal(isAdminPath('/administration'), false);
  assert.equal(isAdminPath('/work/admin'), false);
});

test('background classification requires an actual image URL', () => {
  assert.equal(hasImageUrlBackground('none'), false);
  assert.equal(hasImageUrlBackground('linear-gradient(red, blue)'), false);
  assert.equal(hasImageUrlBackground('radial-gradient(circle, red, blue)'), false);
  assert.equal(hasImageUrlBackground('url("/images/work/example.jpg")'), true);
  assert.equal(
    hasImageUrlBackground('linear-gradient(#0008, #0008), url(/images/work/example.jpg)'),
    true,
  );
  assert.equal(hasImageUrlBackground('URL ("data:image/png;base64,abc")'), true);
});
