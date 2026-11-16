import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { devConf } from '../scripts/nginx-dev-conf.mjs';

// The dev instance's nginx site is derived from the live one (Werkstatt #656): a rename there must not break it.
describe('nginx conf of the dev instance', () => {
  const conf = devConf(readFileSync(new URL('../server/nginx/permadesignkit.org.conf', import.meta.url), 'utf8'));
  it('has its own name, root, proxy port and certificate', () => {
    expect(conf).toContain('server_name dev.permadesignkit.org;');
    expect(conf).toContain('root /var/www/dev.permadesignkit.org;');
    expect(conf).not.toMatch(/8787|ipv6only|live\/permadesignkit\.org\/|root \/var\/www\/permadesignkit\.org;|^map |proxy_cache_path|limit_req_zone/m);
  });
  it('lets only team/admin in, except the login page', () => {
    expect(conf).toContain('auth_request /_pdk_team;');
    expect(conf).not.toContain('auth_request /_pdk_auth;');
    expect(conf).toContain('proxy_pass http://127.0.0.1:8788/api/auth/check?team;');
    expect(conf.match(/auth_request off;/g)!.length).toBeGreaterThanOrEqual(7);
  });
});
