import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { imageSrc } from '../src/lib/commons-image';

describe('imageSrc (Wikimedia pictures through /geo/commons/)', () => {
  it('rewrites Special:FilePath URLs, keeping the encoded name and the width', () => {
    expect(imageSrc('https://commons.wikimedia.org/wiki/Special:FilePath/Acer_saccharum.jpg?width=400'))
      .toBe('/geo/commons/file/Acer_saccharum.jpg?width=400');
    expect(imageSrc('http://commons.wikimedia.org/wiki/Special:FilePath/Malus_%28Golden%29_%C3%A4.jpg'))
      .toBe('/geo/commons/file/Malus_%28Golden%29_%C3%A4.jpg');
    expect(imageSrc('https://commons.wikimedia.org/wiki/Special:FilePath/X.png?foo=1&width=250'))
      .toBe('/geo/commons/file/X.png?width=250');
  });

  it('rewrites upload/thumb.wikimedia.org paths (thumbnails kept, query dropped)', () => {
    expect(imageSrc('https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/A.jpg/500px-A.jpg'))
      .toBe('/geo/commons/wikipedia/commons/thumb/2/26/A.jpg/500px-A.jpg');
    expect(imageSrc('https://upload.wikimedia.org/wikipedia/commons/2/26/A.jpg?utm_source=x'))
      .toBe('/geo/commons/wikipedia/commons/2/26/A.jpg');
    expect(imageSrc('//thumb.wikimedia.org/wikipedia/de/a/ab/B.jpg'))
      .toBe('/geo/commons/wikipedia/de/a/ab/B.jpg');
  });

  it('leaves everything else untouched', () => {
    for (const u of ['', 'https://example.org/a.jpg', 'https://commons.wikimedia.org/wiki/File:A.jpg',
      'https://upload.wikimedia.org.evil.com/wikipedia/a.jpg', 'https://evil.com/?https://upload.wikimedia.org/wikipedia/a.jpg',
      'data:image/png;base64,AAAA', '/geo/commons/file/A.jpg']) {
      expect(imageSrc(u)).toBe(u);
    }
  });

  it('has the nginx locations behind it', () => {
    const conf = readFileSync(new URL('../server/nginx/permadesignkit.org.conf', import.meta.url), 'utf8');
    expect(conf).toContain('location /geo/commons/file/ {');
    expect(conf).toContain('location /geo/commons/wikipedia/ {');
    expect(conf).toContain('location @pdk_commons_follow {');
    expect(conf).toMatch(/proxy_cache_path \S+ .*keys_zone=pdk_commons:/);
    expect(conf).toContain('proxy_pass https://upload.wikimedia.org/wikipedia/;');
  });
});
