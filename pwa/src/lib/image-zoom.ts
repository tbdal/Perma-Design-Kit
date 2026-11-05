// Every picture on the site opens enlarged in the same tab (Werkstatt #516): at most 90 % of the window, closed by a
// click outside the picture, Esc or the × top right. One capturing listener per page (Layout.astro), so it also covers
// pictures rendered later and wins over a tile's "open editor" click on its photo.
// Left alone: pictures inside buttons, labels, summaries, links to something other than the picture itself, tiny
// icons (< 40 px) and anything marked [data-no-zoom] or with its own zoom ([data-zoom]).

const SKIP = 'button, label, summary, [role="button"], [data-no-zoom], [data-zoom], [contenteditable="true"], .img-zoom';
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

/** The picture to enlarge for a click on `el`, or null. Exported for the unit test. */
export function zoomableImage(el: Element | null): HTMLImageElement | null {
  if (!(el instanceof HTMLImageElement) || el.closest(SKIP)) return null;
  const link = el.closest('a[href]') as HTMLAnchorElement | null;
  if (link && !IMAGE_HREF.test(link.getAttribute('href') ?? '') && link.href !== el.currentSrc && link.href !== el.src) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 40 && r.height < 40) return null;
  return el;
}

export function installImageZoom(closeLabel = 'Schließen'): void {
  let dlg: HTMLDialogElement | null = null;
  const style = document.createElement('style');
  style.textContent = `
    dialog.img-zoom { margin: 0; padding: 0; border: 0; background: transparent; max-width: none; max-height: none; width: 100vw; height: 100vh;
      display: none; align-items: center; justify-content: center; }
    dialog.img-zoom[open] { display: flex; }
    dialog.img-zoom::backdrop { background: rgb(0 0 0 / .75); }
    dialog.img-zoom img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: .5rem; box-shadow: 0 10px 40px rgb(0 0 0 / .5); background: #fff; cursor: default; }
    dialog.img-zoom .img-zoom-x { position: fixed; top: .75rem; right: .75rem; width: 2.75rem; height: 2.75rem; border-radius: 9999px;
      font-size: 1.75rem; line-height: 1; color: #fff; background: rgb(0 0 0 / .55); cursor: pointer; }
    dialog.img-zoom .img-zoom-x:hover, dialog.img-zoom .img-zoom-x:focus-visible { background: rgb(0 0 0 / .8); outline: 2px solid #fff; }
    img:not(a img, button img, label img, summary img, [data-no-zoom] img, [data-no-zoom]), a[href$=".jpg"] img, a[href$=".png"] img, a[href$=".webp"] img { cursor: zoom-in; }`;
  document.head.appendChild(style);
  const open = (src: string, alt: string) => {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'img-zoom';
      dlg.innerHTML = `<img alt="" /><button type="button" class="img-zoom-x"></button>`;
      const btn = dlg.querySelector('button')!;
      btn.textContent = '×';
      btn.setAttribute('aria-label', closeLabel);
      btn.title = closeLabel;
      // a click on the backdrop or the free space around the picture closes it; Esc closes the dialog natively
      dlg.addEventListener('click', e => { if (e.target !== dlg!.querySelector('img')) dlg!.close(); });
      document.body.appendChild(dlg);
    }
    const img = dlg.querySelector('img')!;
    img.src = src;
    img.alt = alt;
    dlg.showModal();
  };
  document.addEventListener('click', e => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // modifier clicks keep their browser meaning
    const img = zoomableImage(e.target as Element);
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    const link = img.closest('a[href]') as HTMLAnchorElement | null;
    open(link && IMAGE_HREF.test(link.getAttribute('href') ?? '') ? link.href : img.currentSrc || img.src, img.alt);
  }, true);
}
