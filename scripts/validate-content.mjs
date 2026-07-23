// Standalone content validator. Run via `npm run validate:content`.
// Intentionally NOT wired into `next build` so a legacy-data edge case can
// never block a production deploy; use it in CI or locally.
import { validateContent, assertPureJson } from '../lib/content-contract.mjs';
import { pixilartItems } from '../data/pixilart.js';
import { artItems } from '../data/art.js';
import { typeItems } from '../data/type.js';
import { workItems } from '../data/work.js';
import { profile } from '../data/about.js';

const targets = {
  pixilartItems,
  artItems,
  typeItems,
  workItems,
  profileData: profile,
};

let failed = false;
for (const [key, value] of Object.entries(targets)) {
  try {
    assertPureJson(value);
  } catch (error) {
    failed = true;
    console.error(`[validate:content] ${key} is not pure JSON: ${error.message}`);
    continue;
  }

  const result = validateContent(key, value);
  if (!result.success) {
    failed = true;
    console.error(`[validate:content] ${key} failed schema:`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
  } else {
    console.log(`[validate:content] ${key} OK`);
  }
}

process.exit(failed ? 1 : 0);
