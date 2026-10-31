// Plant pictures from Wikimedia Commons load through our own server
// (nginx /geo/commons/, cached there and in the service worker), so visitors'
// addresses never reach Wikimedia and seen pictures work offline. Stored data
// keeps the original URL; only rendering and fetching use this.

const FILE_PATH = /^(?:https?:)?\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^/?#]+)(\?[^#]*)?$/i;
const UPLOAD = /^(?:https?:)?\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/([^?#]+)/i;

/** Same-origin proxy path for a Wikimedia Commons picture URL; any other URL unchanged. */
export function imageSrc(url: string): string {
  const u = url.trim();
  let m = FILE_PATH.exec(u);
  if (m) {
    const width = new URLSearchParams(m[2] ?? '').get('width');
    return `/geo/commons/file/${m[1]}${width ? `?width=${encodeURIComponent(width)}` : ''}`;
  }
  m = UPLOAD.exec(u);
  if (m) return `/geo/commons/wikipedia/${m[1]}`;
  return url;
}
