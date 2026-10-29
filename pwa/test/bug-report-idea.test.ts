import { describe, expect, it } from 'vitest';
import { issueUrl, mailtoUrl } from '../src/lib/bug-report';

describe('feedback: idea instead of a problem', () => {
  const idea = { page: '/gartenplan', what: 'Hecken als eigene Schicht', expected: 'Windschutz planen', idea: true };
  it('opens a plain GitHub issue labelled enhancement, no bug form', () => {
    const u = new URL(issueUrl(idea, 'env'));
    expect(u.searchParams.get('template')).toBeNull();
    expect(u.searchParams.get('labels')).toBe('enhancement');
    expect(u.searchParams.get('title')).toBe('Idee: [/gartenplan] Hecken als eigene Schicht');
    expect(u.searchParams.get('body')).toContain('Wofür würde sie helfen?');
  });
  it('keeps the bug form for problems; the mail says Idee', () => {
    expect(new URL(issueUrl({ ...idea, idea: false }, 'env')).searchParams.get('template')).toBe('bug_report.yml');
    expect(decodeURIComponent(mailtoUrl(idea, 'env', true))).toContain('subject=Idee: [/gartenplan]');
  });
});
