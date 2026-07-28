import { z } from 'zod';

export const MAX_STRING = 2000;
export const MAX_HREF = 2048;
export const MAX_ITEMS = 500;
export const MAX_WORK_IMAGES = 20;
export const MAX_BIO = 30;
export const MAX_LINKS = 30;

// ---------------------------------------------------------------------------
// #9 — Pure-JSON contract. The data modules are rewritten via JSON.stringify,
// so the payload must be pure JSON: no functions, undefined, non-finite
// numbers, class instances, or circular references (all of which JSON.stringify
// would silently drop or mangle).
// ---------------------------------------------------------------------------
export function assertPureJson(value, currentPath = '$', ancestors = new WeakSet()) {
  if (value === null) return;

  const valueType = typeof value;

  if (valueType === 'string' || valueType === 'boolean') return;

  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${currentPath} must contain only finite numbers`);
    }
    return;
  }

  if (valueType !== 'object') {
    throw new Error(`${currentPath} contains unsupported ${valueType}`);
  }

  if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set) {
    throw new Error(`${currentPath} contains a non-plain object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    throw new Error(`${currentPath} must be a plain object or array`);
  }

  if (ancestors.has(value)) {
    throw new Error(`${currentPath} contains a circular reference`);
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertPureJson(item, `${currentPath}[${index}]`, ancestors);
    });
  } else {
    for (const [key, child] of Object.entries(value)) {
      assertPureJson(child, `${currentPath}.${key}`, ancestors);
    }
  }

  ancestors.delete(value);
}

export function serializePureJson(value) {
  assertPureJson(value);
  const serialized = JSON.stringify(value, null, 2);

  if (serialized === undefined) {
    throw new Error('Payload cannot be serialized as JSON');
  }

  return serialized;
}

// ---------------------------------------------------------------------------
// #10 — Per-panel Zod schemas.
// Compatibility notes for THIS dataset (verified against data/*.js):
//   - Most pixilart/art/type items have NO slug -> slug is OPTIONAL, not required.
//   - Legacy items may carry extra fields the admin UI spreads back on save
//     -> gallery items use .passthrough() so unknown fields are preserved
//        (never silently dropped, never 422'd). Pure-JSON + image-budget checks
//        still apply to the whole payload.
// ---------------------------------------------------------------------------
const text = (max = MAX_STRING) => z.string().max(max);

const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u);

const imageRef = z
  .string()
  .min(1)
  // Char cap aligned to IMAGE_LIMITS.maxSingleBytes (4 MiB) so the byte budget
  // is the real limit; base64 of 4 MiB is ~5.6M chars.
  .max(6_000_000)
  .refine(
    (value) =>
      value.startsWith('/') ||
      value.startsWith('https://') ||
      value.startsWith('data:image/'),
    'image must be a local path, HTTPS URL, or allowed data URL',
  );

const href = z
  .string()
  .max(MAX_HREF)
  .refine(
    (value) => value === '' || /^https:\/\//i.test(value),
    'href must be empty or an HTTPS URL',
  );

const optionalText = text().nullable().optional();

const imageItem = z
  .object({
    image: imageRef,
    caption: optionalText,
  })
  .passthrough();

const baseGalleryItem = {
  image: imageRef,
  slug: slug.nullable().optional(),
  title: optionalText,
  caption: optionalText,
  href: href.nullable().optional(),
};

export const contentSchemas = {
  pixilartItems: z
    .array(
      z
        .object({
          ...baseGalleryItem,
          full: imageRef.nullable().optional(),
          category: z.string().max(100).nullable().optional(),
        })
        .passthrough(),
    )
    .max(MAX_ITEMS),

  artItems: z
    .array(
      z
        .object({
          ...baseGalleryItem,
          width: z.number().finite().int().min(1).max(5000).nullable().optional(),
          row: z.number().finite().int().min(0).max(500).nullable().optional(),
          breakBefore: z.boolean().optional(),
        })
        .passthrough(),
    )
    .max(MAX_ITEMS),

  typeItems: z
    .array(
      z
        .object({
          ...baseGalleryItem,
        })
        .passthrough(),
    )
    .max(MAX_ITEMS),

  workItems: z
    .array(
      z
        .object({
          ...baseGalleryItem,
          images: z.array(imageItem).max(MAX_WORK_IMAGES).optional(),
        })
        .passthrough(),
    )
    .max(MAX_ITEMS),

  profileData: z
    .object({
      name: text(200),
      headline: text(500).nullable().optional().or(z.literal('')),
      avatar: imageRef,
      email: z.string().email().max(320).or(z.literal('')),
      bio: z.array(text(2000)).max(MAX_BIO),
      links: z
        .array(
          z
            .object({
              label: text(200),
              href: z
                .string()
                .max(MAX_HREF)
                .refine(
                  (value) => value === '' || /^https:\/\//i.test(value),
                  'profile link href must be empty or HTTPS',
                ),
              description: text(1000).nullable().optional().or(z.literal('')),
            })
            .passthrough(),
        )
        .max(MAX_LINKS),
    })
    .passthrough(),
};

export function validateContent(key, value) {
  const schema = contentSchemas[key];

  if (!schema) {
    throw new Error(`No schema registered for ${key}`);
  }

  return schema.safeParse(value);
}

// ---------------------------------------------------------------------------
// #11 — Image bloat guard (interim; full object-storage migration deferred).
// Checks REAL decoded byte sizes, not base64 string length.
// ---------------------------------------------------------------------------
export const IMAGE_LIMITS = {
  maxSingleBytes: 4 * 1024 * 1024,
  maxPayloadBytes: 12 * 1024 * 1024,
  maxImagesPerPanel: {
    pixilartItems: 200,
    artItems: 500,
    typeItems: 200,
    workItems: 100,
    profileData: 1,
  },
  maxNestedImagesPerWork: 20,
  allowedMimeTypes: new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
};

function decodeBase64Bytes(dataUrl, pathName) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);

  if (!match) {
    throw new Error(`${pathName} has an invalid data URL`);
  }

  const mime = match[1].toLowerCase();

  if (!IMAGE_LIMITS.allowedMimeTypes.has(mime)) {
    throw new Error(`${pathName} uses a disallowed MIME type`);
  }

  const encoded = match[2].replace(/\s/g, '');

  if (encoded.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw new Error(`${pathName} has invalid base64`);
  }

  const bytes = Buffer.from(encoded, 'base64');

  if (bytes.length > IMAGE_LIMITS.maxSingleBytes) {
    throw new Error(`${pathName} exceeds the single-image byte limit`);
  }

  return bytes.length;
}

function inspectImage(value, pathName, state) {
  if (typeof value !== 'string') return;

  if (value.startsWith('data:')) {
    state.totalBytes += decodeBase64Bytes(value, pathName);

    if (state.totalBytes > IMAGE_LIMITS.maxPayloadBytes) {
      throw new Error('All embedded images exceed the request byte limit');
    }
  }
}

export function validateImageBudget(key, value) {
  const state = { totalBytes: 0 };
  let imageCount = 0;

  const visit = (current, pathName) => {
    if (!current || typeof current !== 'object') return;

    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${pathName}[${index}]`));
      return;
    }

    for (const [field, child] of Object.entries(current)) {
      const childPath = `${pathName}.${field}`;

      if (field === 'image' || field === 'avatar' || field === 'full') {
        imageCount += 1;
        inspectImage(child, childPath, state);
      } else {
        visit(child, childPath);
      }

      if (field === 'images' && Array.isArray(child)) {
        if (child.length > IMAGE_LIMITS.maxNestedImagesPerWork) {
          throw new Error(`${childPath} exceeds the nested-image count limit`);
        }
      }
    }
  };

  visit(value, '$');

  const panelLimit = IMAGE_LIMITS.maxImagesPerPanel[key];

  if (panelLimit !== undefined && imageCount > panelLimit) {
    throw new Error(`${key} exceeds the image-count limit`);
  }

  return {
    embeddedBytes: state.totalBytes,
    imageCount,
  };
}
