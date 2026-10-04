// "Gelöscht – Rückgängig" bar at the bottom of the page. One at a time: a new
// one replaces the previous (whose undo chance then ends). Stays while the
// pointer or keyboard focus is on it, otherwise disappears after `ms`.

let current: { el: HTMLElement; timer: number | undefined } | null = null;

function dismiss(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}

export function showUndoToast(message: string, labels: { undo: string; close: string }, onUndo: () => void | Promise<void>, ms = 10_000): void {
  dismiss();
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = 'undo-toast fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-stone-800 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900';
  const text = document.createElement('span');
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rounded-md px-2 py-1 font-semibold text-green-300 underline underline-offset-2 hover:no-underline dark:text-green-800';
  btn.textContent = labels.undo;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', labels.close);
  close.title = labels.close;
  close.className = 'px-1 text-lg leading-none opacity-70 hover:opacity-100';
  close.textContent = '×';
  el.append(text, btn, close);
  document.body.append(el);

  const entry = { el, timer: undefined as number | undefined };
  current = entry;
  const arm = () => { clearTimeout(entry.timer); entry.timer = window.setTimeout(() => { if (current === entry) dismiss(); }, ms); };
  const hold = () => clearTimeout(entry.timer);
  el.addEventListener('mouseenter', hold);
  el.addEventListener('mouseleave', arm);
  el.addEventListener('focusin', hold);
  el.addEventListener('focusout', arm);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    dismiss();
    await onUndo();
  });
  close.addEventListener('click', dismiss);
  arm();
}
