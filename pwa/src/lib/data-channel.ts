// Tells the app's other tabs that the data in IndexedDB changed. Every page
// keeps what it shows in memory and writes whole records back, so a tab that
// was opened earlier would overwrite newer changes with its old copy.
// db.ts announces each write; Layout.astro reacts (reload on return to the
// tab, or a banner while it is in view). A tab never hears its own messages.

const CHANNEL = 'pdk-data';

let channel: BroadcastChannel | null | undefined;

function open(): BroadcastChannel | null {
  if (channel === undefined) {
    try { channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL); } catch { channel = null; }
  }
  return channel;
}

/** Called by db.ts after every write. */
export function announceChange(): void {
  try { open()?.postMessage('changed'); } catch { /* channel closed */ }
}

/** Runs `cb` whenever another tab of the app has written data. */
export function onForeignChange(cb: () => void): void {
  open()?.addEventListener('message', () => cb());
}

/** What a tab does about a change made elsewhere: a hidden tab reloads when
 *  the user returns to it; a tab in view — or one with a dialog open, where a
 *  reload would throw away what is being typed — only offers the reload. */
export function staleAction(hidden: boolean, dialogOpen: boolean): 'reload-on-return' | 'offer' {
  return hidden && !dialogOpen ? 'reload-on-return' : 'offer';
}
