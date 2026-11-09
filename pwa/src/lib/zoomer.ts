// "Zoomer": shows a box's content in a dialog of at most 90 % of the window — closed like a zoomed picture
// (image-zoom.ts) by the × top right, Esc or a click outside. The content node itself moves into the dialog and back,
// so its listeners and later redraws keep working. It is not scaled up (#602): it gets the class `zoomed` (text at the
// page's size, wider layout via CSS) and `onToggle` lets its owner draw it anew for the room it has.

export function installZoomer(btn: HTMLElement, content: HTMLElement, closeLabel: string, onToggle?: (open: boolean) => void): void {
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); // the button sits in a <summary>: don't fold the box
    const home = content.parentElement!, next = content.nextSibling;
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
    dlg.addEventListener('close', () => { content.classList.remove('zoomed'); home.insertBefore(content, next); dlg.remove(); onToggle?.(false); btn.focus(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    onToggle?.(true);
  });
}
