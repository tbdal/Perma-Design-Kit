// Loads the private expert module (src/expert/index.ts, own git repo on the
// VPS) if this build contains it. In the public build the glob is empty, so
// this is a no-op. Its chunks are emitted under /x/ (astro.config.mjs), which
// nginx only serves with a valid login cookie — a 401 lands in the catch.
import type { ExpertModule } from './expert-api';

const entries = import.meta.glob<{ default: ExpertModule }>('../expert/index.ts');
const load = Object.values(entries)[0];

export const hasExpertCode = !!load;

let cached: Promise<ExpertModule | null> | null = null;

export function loadExpertModule(): Promise<ExpertModule | null> {
  if (!load) return Promise.resolve(null);
  cached ??= load().then(m => m.default).catch(() => null);
  return cached;
}
