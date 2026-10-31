import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile, savePath } from '../src/lib/save-file';

describe('savePath', () => {
  it('installed app with file sharing: share sheet', () => {
    expect(savePath({ standalone: true, ios: true, canShareFiles: true })).toBe('share');
    expect(savePath({ standalone: true, ios: false, canShareFiles: true })).toBe('share');
  });
  it('iOS Safari tab with file sharing: share sheet', () => {
    expect(savePath({ standalone: false, ios: true, canShareFiles: true })).toBe('share');
  });
  it('desktop browser: download, even if it could share', () => {
    expect(savePath({ standalone: false, ios: false, canShareFiles: true })).toBe('download');
    expect(savePath({ standalone: false, ios: false, canShareFiles: false })).toBe('download');
  });
  it('installed iOS app without file sharing: never a silent download', () => {
    expect(savePath({ standalone: true, ios: true, canShareFiles: false })).toBe('fallback');
  });
});

describe('saveFile picks the path from matchMedia/navigator', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  function stub(opts: { standalone: boolean; ua: string; canShare: boolean; share?: () => Promise<void> }) {
    const share = vi.fn(opts.share ?? (async () => {}));
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: opts.standalone && q.includes('standalone') }) });
    vi.stubGlobal('navigator', { userAgent: opts.ua, platform: '', maxTouchPoints: 0, share, canShare: () => opts.canShare });
    const click = vi.fn();
    const a = { click, remove: vi.fn(), href: '', download: '', rel: '' };
    vi.stubGlobal('document', { createElement: () => a, body: { append: vi.fn() } });
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: revoke });
    return { share, click, a, revoke };
  }
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)';
  const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140';

  it('installed iPhone app opens the share sheet with the file', async () => {
    const s = stub({ standalone: true, ua: IPHONE, canShare: true });
    expect(await saveFile(new Blob(['{}'], { type: 'application/json' }), 'b.json')).toBe(true);
    expect(s.share).toHaveBeenCalledOnce();
    expect((s.share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0].name).toBe('b.json');
    expect(s.click).not.toHaveBeenCalled();
  });

  it('closing the share sheet reports nothing saved', async () => {
    stub({ standalone: true, ua: IPHONE, canShare: true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
    expect(await saveFile(new Blob(['{}']), 'b.json')).toBe(false);
  });

  it('desktop downloads and frees the URL only later', async () => {
    vi.useFakeTimers();
    const s = stub({ standalone: false, ua: DESKTOP, canShare: true });
    await saveFile(new Blob(['a;b']), 'p.csv');
    expect(s.share).not.toHaveBeenCalled();
    expect(s.click).toHaveBeenCalledOnce();
    expect(s.a.download).toBe('p.csv');
    expect(s.revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(s.revoke).toHaveBeenCalledOnce();
  });

  it('a failing share outside iOS falls back to the download', async () => {
    const s = stub({ standalone: true, ua: DESKTOP, canShare: true, share: async () => { throw new Error('nope'); } });
    await saveFile(new Blob(['x']), 'x.pdf');
    expect(s.click).toHaveBeenCalledOnce();
  });
});
