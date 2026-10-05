// Accounts for expert mode, from the shell (on the VPS):
//
//   npm run user -- list
//   npm run user -- add <name> [--team|--admin]  asks for the password
//   npm run user -- passwd <name>            new password, ends open sessions
//   npm run user -- role <name> expert|team|admin
//   npm run user -- remove <name>
//
// Writes server/data/private/users.json (or $PDK_PRIVATE_DIR); the running
// proxy picks changes up without a restart. Without a terminal the password
// is read from the first line of stdin.
import { createInterface } from 'node:readline';
import { createStore, findUser, MIN_PASSWORD, removeUser, upsertUser } from '../server/auth.mjs';

const [cmd, name, ...rest] = process.argv.slice(2);
const store = createStore();

function usage() {
  console.error('Usage: npm run user -- list | add <name> [--team|--admin] | passwd <name> | role <name> expert|team|admin | remove <name>');
  process.exit(1);
}

async function askPassword(prompt) {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) { rl.close(); return line; }
    return '';
  }
  const ask = (q) => new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
  const a = await ask(prompt);
  const b = await ask('Noch einmal: ');
  if (a !== b) { console.error('Die Passwörter stimmen nicht überein.'); process.exit(1); }
  return a;
}

const MESSAGES = {
  'bad-name': 'Name: 1–40 Zeichen, Buchstaben, Ziffern, Leerzeichen, . _ -',
  'bad-role': 'Rolle: expert, team oder admin',
  'short-password': `Passwort: mindestens ${MIN_PASSWORD} Zeichen`,
  'last-admin': 'Der letzte Admin kann nicht entfernt oder herabgestuft werden.',
  'not-found': 'Diesen Zugang gibt es nicht.',
};

try {
  const users = store.users();
  switch (cmd) {
    case 'list':
      if (!users.length) console.log('(noch keine Zugänge)');
      for (const u of users) console.log(`${u.name.padEnd(24)} ${u.role.padEnd(7)} seit ${String(u.created || '').slice(0, 10)}`);
      break;
    case 'add': {
      if (!name) usage();
      if (findUser(users, name)) throw new Error('Diesen Zugang gibt es schon (passwd/role zum Ändern).');
      const password = await askPassword(`Passwort für ${name}: `);
      store.saveUsers(upsertUser(users, { name, role: rest.includes('--admin') ? 'admin' : rest.includes('--team') ? 'team' : 'expert', password }));
      console.log(`Angelegt: ${name}`);
      break;
    }
    case 'passwd': {
      if (!name || !findUser(users, name)) throw new Error('not-found');
      const password = await askPassword(`Neues Passwort für ${name}: `);
      store.saveUsers(upsertUser(users, { name, password }));
      console.log('Passwort geändert, offene Sitzungen beendet.');
      break;
    }
    case 'role':
      if (!name || !findUser(users, name)) throw new Error('not-found');
      store.saveUsers(upsertUser(users, { name, role: rest[0] }));
      console.log(`Rolle von ${name}: ${rest[0]}`);
      break;
    case 'remove':
      if (!name) usage();
      store.saveUsers(removeUser(users, name));
      console.log(`Entfernt: ${name}`);
      break;
    default:
      usage();
  }
} catch (err) {
  const code = err instanceof Error ? err.message : String(err);
  console.error(MESSAGES[code] || code);
  process.exit(1);
}
