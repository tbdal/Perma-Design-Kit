/** Escape a string for safe interpolation into HTML markup (text/attribute context). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

/** Small spinning-circle indicator, sized to sit inline inside a button next
 *  to its label — same visual language as the page-level loading spinners
 *  (`animate-spin` + border-trick), just small enough for a button. */
export const BUTTON_SPINNER_HTML =
  '<span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current align-[-2px]"></span>';

/** Disables a button and swaps its content for a spinner (keeping the
 *  original label visible next to it, so it's clear this button specifically
 *  is generating something) while `task` runs, then always restores the
 *  button — even if `task` throws. PDF generation especially can take a
 *  noticeable moment (rasterizing several Baumscheiben), and a plain "..."
 *  text swap is easy to miss. */
export async function withButtonSpinner<T>(btn: HTMLButtonElement, task: () => Promise<T>): Promise<T> {
  const originalHtml = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = `${BUTTON_SPINNER_HTML} <span>${btn.textContent}</span>`;
  try {
    return await task();
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = originalDisabled;
  }
}
