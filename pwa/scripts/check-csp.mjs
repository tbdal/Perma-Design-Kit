// Fails if a built page contains inline scripts or on*= handlers, which the
// production Content-Security-Policy blocks (the dev server sends no CSP, so
// such breakage would otherwise only show up live).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const walk = d => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});

const problems = [];
for (const file of walk(dir)) {
  const html = readFileSync(file, 'utf8');
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc=/.test(attrs) && body.trim() && !/type="application\/(ld\+)?json"/.test(attrs)) {
      problems.push(`${relative(dir, file)}: inline <script> ${body.trim().slice(0, 50)}…`);
    }
  }
  for (const [attr] of html.matchAll(/\son[a-z]+=["']/g)) {
    problems.push(`${relative(dir, file)}: inline handler ${attr.trim()}`);
  }
}

if (problems.length) {
  console.error('CSP check failed — the live site would block these:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('CSP check: no inline scripts or handlers.');
