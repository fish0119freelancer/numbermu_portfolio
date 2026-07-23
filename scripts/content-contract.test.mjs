import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPureJson,
  serializePureJson,
  validateContent,
  validateImageBudget,
} from '../lib/content-contract.mjs';

test('accepts golden pure JSON payload', () => {
  const value = {
    unicode: '繁體中文 🚗',
    image: 'data:image/png;base64,aGVsbG8=',
    nested: [{ empty: '', nil: null, number: 12.5, flag: false }],
  };

  assert.doesNotThrow(() => assertPureJson(value));
  assert.match(serializePureJson(value), /繁體中文/);
});

test('rejects function, undefined, non-finite number and circular reference', () => {
  assert.throws(() => assertPureJson({ fn: () => {} }));
  assert.throws(() => assertPureJson({ missing: undefined }));
  assert.throws(() => assertPureJson({ bad: Infinity }));
  assert.throws(() => assertPureJson({ bad: NaN }));

  const circular = {};
  circular.self = circular;
  assert.throws(() => assertPureJson(circular));
});

test('gallery item without slug is accepted (legacy compatibility)', () => {
  const result = validateContent('artItems', [
    { image: '/images/art/a.png', caption: 'no slug here' },
  ]);
  assert.equal(result.success, true);
});

test('unknown legacy fields are preserved via passthrough', () => {
  const result = validateContent('pixilartItems', [
    { image: '/images/p/a.png', legacyField: 'keep-me' },
  ]);
  assert.equal(result.success, true);
  assert.equal(result.data[0].legacyField, 'keep-me');
});

test('rejects disallowed data-URL MIME type', () => {
  assert.throws(() =>
    validateImageBudget('artItems', [
      { image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    ]),
  );
});

test('local path and https images pass image budget', () => {
  assert.doesNotThrow(() =>
    validateImageBudget('workItems', [
      { image: '/images/work/a.png' },
      { image: 'https://example.com/b.png' },
    ]),
  );
});
