// One way to hand a generated file to the user (#8). An installed iOS web app
// has no download manager: `<a download>` is dropped there without a word, so
// there the share sheet ("In Dateien sichern", Mail, AirDrop …) takes over.
// If neither works the user gets a dialog — a save never fails silently.
import { createT } from './i18n/core';
import { layoutDict } from './i18n/dict-layout';

export type SavePath = 'share' | 'download' | 'fallback';

export interface SaveEnv {
  standalone: boolean;
  ios: boolean;
  canShareFiles: boolean;
}

/** share sheet where downloads don't work (iOS, installed apps), else a download. */
export function savePath(env: SaveEnv): SavePath {
  if (env.canShareFiles && (env.standalone || env.ios)) return 'share';
  if (env.standalone && env.ios) return 'fallback';
  return 'download';
}

function currentEnv(file: File): SaveEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  let canShareFiles = false;
  try { canShareFiles = typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] }); } catch { /* old browsers throw on files */ }
  return {
    standalone: !!window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
    ios: /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1),
    canShareFiles,
  };
}

const TEXT_EXT = /\.(json|geojson|csv|ics|txt)$/i;

export interface SaveOptions {
  /** title for the share sheet */
  title?: string;
}

/** Resolves false only when the user closed the share sheet (nothing saved). */
export async function saveFile(blob: Blob, filename: string, opts: SaveOptions = {}): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const env = currentEnv(file);
  const path = savePath(env);
  if (path === 'share') {
    try {
      await navigator.share({ files: [file], title: opts.title ?? filename });
      return true;
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError') return false; // user closed the sheet
      // the tap's gesture expired while the file was being built: one more tap shares
      if (name === 'NotAllowedError') { readyDialog(file, opts); return true; }
      if (env.standalone && env.ios) { await fallbackDialog(file); return true; }
    }
  } else if (path === 'fallback') {
    await fallbackDialog(file);
    return true;
  }
  download(file);
  return true;
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Safari still reads the blob after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function dialogShell(): { dlg: HTMLDialogElement; body: HTMLDivElement; actions: HTMLDivElement; close: () => void } {
  const dlg = document.createElement('dialog');
  dlg.className = 'save-file-dialog m-auto w-full max-w-md rounded-2xl bg-white p-5 text-stone-800 shadow-2xl backdrop:bg-black/40 dark:bg-stone-900 dark:text-stone-100';
  const body = document.createElement('div');
  body.className = 'space-y-3 text-sm';
  const actions = document.createElement('div');
  actions.className = 'mt-4 flex flex-wrap justify-end gap-2';
  dlg.append(body, actions);
  document.body.append(dlg);
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return { dlg, body, actions, close };
}

function button(label: string, primary: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = primary
    ? 'rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800'
    : 'rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800';
  return b;
}

function readyDialog(file: File, opts: SaveOptions): void {
  const t = createT(layoutDict);
  const { body, actions, close } = dialogShell();
  const p = document.createElement('p');
  p.textContent = t('saveFileReady', { name: file.name });
  body.append(p);
  const cancel = button(t('closeBtn'), false);
  const save = button(t('saveFileSave'), true);
  save.dataset.saveFile = 'share';
  cancel.addEventListener('click', close);
  save.addEventListener('click', async () => {
    close();
    try {
      await navigator.share({ files: [file], title: opts.title ?? file.name });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') fallbackDialog(file);
    }
  });
  actions.append(cancel, save);
  save.focus();
}

async function fallbackDialog(file: File): Promise<void> {
  const t = createT(layoutDict);
  const isText = TEXT_EXT.test(file.name) || file.type.startsWith('text/') || file.type.includes('json');
  const text = isText ? await file.text() : '';
  const { body, actions, close } = dialogShell();
  const p = document.createElement('p');
  p.textContent = t(isText ? 'saveFileFailedText' : 'saveFileFailed', { name: file.name });
  body.append(p);
  if (isText) {
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = text;
    ta.rows = 8;
    ta.setAttribute('aria-label', file.name);
    ta.className = 'w-full rounded-lg border border-stone-300 bg-stone-50 p-2 font-mono text-xs dark:border-stone-600 dark:bg-stone-800';
    body.append(ta);
    const copy = button(t('saveFileCopy'), true);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = t('saveFileCopied'); }
      catch { ta.focus(); ta.select(); }
    });
    actions.append(copy);
  }
  const ok = button(t('closeBtn'), !isText);
  ok.addEventListener('click', close);
  actions.prepend(ok);
}
