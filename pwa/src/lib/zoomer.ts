// "Zoomer": shows a box's content enlarged in a dialog, at most 90 % of the window — closed like a zoomed picture
// (image-zoom.ts) by the × top right, Esc or a click outside. The content node itself moves into the dialog and back,
// so its listeners and later redraws keep working while it is enlarged.

/** Scale that fills 90 % of the window width with content of width `w` (never smaller, at most 3×). */
export const zoomFactor = (w: number, viewW: number) => (w > 0 ? Math.max(1, Math.min(3, (viewW * 0.9 - 32) / w)) : 1);

export function installZoomer(btn: HTMLElement, content: HTMLElement, closeLabel: string): void {
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); // the button sits in a <summary>: don't fold the box
    const home = content.parentElement!, next = content.nextSibling, w = content.getBoundingClientRect().width;
    const dlg = document.createElement('dialog');
    dlg.className = 'zoomer m-auto max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl bg-white p-4 text-stone-800 shadow-2xl backdrop:bg-black/75 dark:bg-stone-900 dark:text-stone-100';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = closeLabel;
    x.setAttribute('aria-label', closeLabel);
    x.className = 'fixed right-3 top-3 h-11 w-11 rounded-full bg-black/55 text-3xl leading-none text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white';
    x.addEventListener('click', () => dlg.close());
    const box = document.createElement('div');
    box.style.width = `${w}px`;
    box.style.zoom = String(zoomFactor(w, innerWidth));
    box.appendChild(content);
    dlg.append(x, box);
    // a click outside the dialog's box closes it; Esc closes the dialog natively
    dlg.addEventListener('click', ev => {
      const r = dlg.getBoundingClientRect();
      if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
    });
    dlg.addEventListener('close', () => { home.insertBefore(content, next); dlg.remove(); btn.focus(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}
