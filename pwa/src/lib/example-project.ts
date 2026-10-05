// /example and /beispiel: open the example project. The project itself is a
// normal share link ("Projekt als Link teilen", with "Ansicht mitschicken"),
// stored in public/example-project.txt — set it with
//   npm run example:set -- "<share link>"
// and deploy. The page only forwards to /teilen/?beispiel=1#d=…, which shows
// the summary, imports (or opens, if already imported) and starts the plan.

export const EXAMPLE_FILE = '/example-project.txt';

/** Share data out of the file content: a full share link or the bare data. */
export function exampleData(text: string): string | null {
  const t = text.trim();
  const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

export async function openExample(statusEl: HTMLElement, messages: { missing: string; failed: string }) {
  try {
    const res = await fetch(EXAMPLE_FILE, { cache: 'no-cache' });
    const data = res.ok ? exampleData(await res.text()) : null;
    if (!data) { statusEl.textContent = messages.missing; return; }
    location.replace(`/teilen/?beispiel=1#d=${data}`);
  } catch {
    statusEl.textContent = messages.failed;
  }
}
