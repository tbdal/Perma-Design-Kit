// Strg+O palette: matching ignores case and accents, needs every word, and ranks label starts first.
import { describe, expect, it } from 'vitest';
import { rank, type PaletteCommand } from '../src/lib/command-palette';

const c = (label: string, group = 'Aktion'): PaletteCommand => ({ label, group, run: () => {} });

describe('rank', () => {
  const cmds = [c('Neue Pflanze'), c('Kalender', 'Seite'), c('Pflanzen', 'Seite'), c('Plan de bosque comestible', 'Página'), c('Daten exportieren')];
  it('keeps everything for an empty query', () => expect(rank(cmds, ' ')).toHaveLength(5));
  it('puts label starts before word starts', () => expect(rank(cmds, 'pflan').map(x => x.label)).toEqual(['Pflanzen', 'Neue Pflanze']));
  it('ignores case and accents and searches the group too', () => {
    expect(rank(cmds, 'KALENDER').map(x => x.label)).toEqual(['Kalender']);
    expect(rank(cmds, 'pagina bosque').map(x => x.label)).toEqual(['Plan de bosque comestible']);
  });
  it('needs every word', () => expect(rank(cmds, 'daten pflanze')).toEqual([]));
});
