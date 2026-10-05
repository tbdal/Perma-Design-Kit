import { getAllGardenPlans, getAllPlants, getAllPolycultures, getVarietyLists } from './db';
import { loadSettings } from './settings';

// "Fehler melden": nothing is sent by the app. The page builds a pre-filled
// GitHub issue link or e-mail, and a debug file the person attaches
// themselves. The file never contains access data (WebDAV/Gist credentials,
// API keys) and the project only with an explicit tick.

export const REPORT_REPO = 'tbdal/Perma-Design-Kit';
export const REPORT_MAIL = 'info@permadesignkit.org';
export const ERRORS_KEY = 'pdk-errors'; // written by public/boot.js

declare const __PDK_VERSION__: string;
export const APP_VERSION: string = typeof __PDK_VERSION__ !== 'undefined' ? __PDK_VERSION__ : 'dev';

export interface ReportText { page: string; what: string; expected: string; }

export interface CapturedError { t: string; msg: string; src?: string; }

export function capturedErrors(): CapturedError[] {
  try { return JSON.parse(sessionStorage.getItem(ERRORS_KEY) || '[]'); } catch { return []; }
}

/** Removes anything that looks like a credential from a settings-like object. */
export function redact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v) => (/key|token|pass|secret|auth|user/i.test(k) && typeof v === 'string' && v ? '[entfernt]' : v)));
}

export function environmentLine(): string {
  return `Version ${APP_VERSION} · ${navigator.userAgent} · ${innerWidth}×${innerHeight} @${devicePixelRatio}x · ${document.documentElement.lang}`;
}

export async function buildDebugInfo(text: ReportText, includeProject: boolean): Promise<Record<string, unknown>> {
  const [plants, polycultures, gardenPlans, varietyLists] = await Promise.all([
    getAllPlants().catch(() => []), getAllPolycultures().catch(() => []), getAllGardenPlans().catch(() => []), getVarietyLists().catch(() => []),
  ]);
  let storage: unknown = null;
  try {
    const est = await navigator.storage?.estimate?.();
    storage = { usage: est?.usage, quota: est?.quota, persisted: await navigator.storage?.persisted?.() };
  } catch { /* not available */ }
  return {
    kind: 'perma-design-kit-debug', version: APP_VERSION, createdAt: new Date().toISOString(),
    report: text,
    environment: {
      userAgent: navigator.userAgent, language: navigator.language, appLanguage: document.documentElement.lang,
      viewport: [innerWidth, innerHeight], devicePixelRatio, screen: [screen.width, screen.height],
      online: navigator.onLine, serviceWorker: !!navigator.serviceWorker?.controller,
      design: document.documentElement.dataset.design ?? 'standard', dark: document.documentElement.classList.contains('dark'),
    },
    settings: redact(loadSettings()),
    counts: { plants: plants.length, polycultures: polycultures.length, gardenPlans: gardenPlans.length, varietyLists: varietyLists.map(l => `${l.name} (${l.entries.length})`) },
    storage,
    errors: capturedErrors(),
    ...(includeProject ? { project: { plants, polycultures, gardenPlans } } : {}),
  };
}

const body = (r: ReportText, env: string, de: boolean) => [
  `${de ? 'Seite' : 'Page'}: ${r.page}`, '',
  `${de ? 'Was ist passiert?' : 'What happened?'}`, r.what || '…', '',
  `${de ? 'Was hast du erwartet?' : 'What did you expect?'}`, r.expected || '…', '',
  `${de ? 'Umgebung' : 'Environment'}: ${env}`,
].join('\n');

const title = (r: ReportText) => `[${r.page}] ${(r.what.split('\n')[0] || 'Fehler').slice(0, 80)}`;

/** New-issue link with the issue form (.github/ISSUE_TEMPLATE/bug_report.yml) pre-filled. */
export function issueUrl(r: ReportText, env: string): string {
  const u = new URL(`https://github.com/${REPORT_REPO}/issues/new`);
  u.searchParams.set('template', 'bug_report.yml');
  u.searchParams.set('title', title(r));
  u.searchParams.set('seite', r.page);
  u.searchParams.set('beschreibung', r.what.slice(0, 2500));
  u.searchParams.set('erwartet', r.expected.slice(0, 1000));
  u.searchParams.set('umgebung', env);
  return u.toString();
}

export function mailtoUrl(r: ReportText, env: string, de: boolean): string {
  return `mailto:${REPORT_MAIL}?subject=${encodeURIComponent(title(r))}&body=${encodeURIComponent(body(r, env, de).slice(0, 1800))}`;
}
