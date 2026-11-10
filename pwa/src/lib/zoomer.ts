// "Zoomer": shows content in a dialog of at most 90 % of the window — closed like a zoomed picture
// (image-zoom.ts) by the × top right, Esc or a click outside. It is not scaled up (#602): the content gets the class
// `zoomed` (text at the page's size, wider layout via CSS).

/** Opens `content` in the zoomer; `onClose` runs once it is closed (the content is still in the dialog then). */
export function openZoomer(content: HTMLElement, closeLabel: string, onClose?: () => void): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.className = 'zoomer m-auto h-[90vh] w-[90vw] max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl bg-white p-6 text-stone-800 shadow-2xl backdrop:bg-black/75 dark:bg-stone-900 dark:text-stone-100';
  const x = document.createElement('button');
  x.type = 'button';
  x.textContent = '×';
  x.title = closeLabel;
  x.setAttribute('aria-label', closeLabel);
  x.className = 'fixed right-3 top-3 z-10 h-11 w-11 rounded-full bg-black/55 text-3xl leading-none text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white';
  x.addEventListener('click', () => dlg.close());
  content.classList.add('zoomed');
  dlg.append(x, content);
  // a click outside the dialog's box closes it; Esc closes the dialog natively
  dlg.addEventListener('click', ev => {
    const r = dlg.getBoundingClientRect();
    if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
  });
  dlg.addEventListener('close', () => { content.classList.remove('zoomed'); onClose?.(); dlg.remove(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

/** A button that opens a box's content in the zoomer. The content node itself moves into the dialog and back, so its
 *  listeners and later redraws keep working; `onToggle` lets its owner draw it anew for the room it has. */
export function installZoomer(btn: HTMLElement, content: HTMLElement, closeLabel: string, onToggle?: (open: boolean) => void): void {
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); // the button sits in a <summary>: don't fold the box
    const home = content.parentElement!, next = content.nextSibling;
    openZoomer(content, closeLabel, () => { home.insertBefore(content, next); onToggle?.(false); btn.focus(); });
    onToggle?.(true);
  });
}
