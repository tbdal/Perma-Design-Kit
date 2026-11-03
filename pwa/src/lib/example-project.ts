// /example and /beispiel: open the example project. The project itself is a
// normal share link ("Projekt als Link teilen", with "Ansicht mitschicken"),
// stored in public/example-project.txt — set it with
//   npm run example:set -- "<share link>"
// and deploy. The page links to /teilen/?beispiel=1#d=…, which shows
// the summary, imports (or opens, if already imported) and starts the plan.
// The page /example (lib/example-page.ts) offers it next to the public Vorbilder.

export const EXAMPLE_FILE = '/example-project.txt';

/** Share data out of the file content: a full share link or the bare data. */
export function exampleData(text: string): string | null {
  const t = text.trim();
  const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}
