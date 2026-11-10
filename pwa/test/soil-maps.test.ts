// Soil maps (#616): SoilGrids pixel values and the BÜK 200 map unit as suggestions for an area's soil.
import { describe, it, expect } from 'vitest';
import { buekSuggestion, parseBuek, parseSoilGridsValue, phStep, soilGridsSuggestion, typePreset } from '../src/lib/soil-maps';
import { normalizeSoil } from '../src/lib/soil';

describe('soil maps', () => {
  it('reads the SoilGrids pixel and turns sand/clay/pH into a class, step and pH step', () => {
    expect(parseSoilGridsValue('<b>Value: </b><span id="value">244</span><br><span id="value">clay_0-5cm_mean</span>')).toBe(244);
    expect(parseSoilGridsValue('<html>no data</html>')).toBeNull();
    // Kassel: 25 % sand, 24 % clay (51 % silt), pH 5.7 → silt loam (medium), acid
    expect(soilGridsSuggestion(252, 244, 57, 'de')).toMatchObject({ src: 'soilgrids', set: { cls: 'sil', tex: 'M', ph: 1 }, point: { sand: 25, clay: 24 } });
    expect(soilGridsSuggestion(0, 0, 0, 'de')).toBeNull();                       // water or no data
    expect([4.5, 5.5, 7, 8, 9].map(phStep)).toEqual([0, 1, 2, 3, 4]);
  });
  it('reads the BÜK 200 unit: prevailing soil type, its water/pH hint and the substrate step', () => {
    const json = { results: [
      { layerName: 'Blattschnitt', attributes: { Blattname: 'Kassel' } },
      { layerName: 'CC4718 KASSEL', attributes: { Legende: '01 ABn, GG-AB: fo-s,u//fo-k', Legendentext: 'Überwiegend *Vegen und gering verbreitet Gley-Vegen aus sandigen bis schluffigen *Auenablagerungen über tiefem Kies' } },
    ] };
    const u = parseBuek(json)!;
    expect(u.text).not.toContain('*');
    expect(buekSuggestion(u.text).set).toEqual({ typ: 'Vega', tex: 'L' });
    expect(buekSuggestion('Überwiegend Pseudogleye aus lehmigem Schluff (Löss)').set).toEqual({ typ: 'Pseudogley', wat: 's', tex: 'M' });
    expect(buekSuggestion('Podsole aus Sand').set).toEqual({ typ: 'Podsol', ph: 1, tex: 'L' });
    expect(parseBuek({ results: [] })).toBeNull();
  });
  it('a type presets fields; type and source are kept on the soil', () => {
    expect(typePreset('Pseudogley')).toEqual({ wat: 's' });
    expect(normalizeSoil({ tex: 'L', typ: ' Braunerde ', src: 'buek' })).toEqual({ tex: 'L', typ: 'Braunerde', src: 'buek' });
    expect(normalizeSoil({ src: 'buek' })).toBeNull();
    expect(normalizeSoil({ tex: 'L', src: 'elsewhere' })).toEqual({ tex: 'L' });
  });
});
