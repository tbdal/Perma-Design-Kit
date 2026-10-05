import { test, expect, stubNetwork, loadSamples, withDb } from './helpers';

const claim = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } });

test('plant page: samples, table, sort dropdown in words', async ({ page, errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  await page.goto('/?view=list');
  const n = await withDb<number>(page, `return (await all('plants')).length;`);
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('table tbody tr[data-id]')).toHaveCount(n);
  await expect(page.locator('#sort-field-select option[value="heightM"]')).toHaveText('Höhe');
  void errors;
});

test('search shows a cultivar as "variety of" its species and adds it with the variety', async ({ page, errors }) => {
  await stubNetwork(page, {
    wikidataSearch: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { search: [{ title: 'Q747247' }] } }) }),
    wikidataEntities: route => {
      const ids = new URL(route.request().url()).searchParams.get('ids');
      const body = ids === 'Q747247'
        ? { entities: { Q747247: { labels: { de: { value: 'Conference' } }, descriptions: { de: { value: 'Sorte der Birne' } },
            claims: { P105: [claim('Q4886')], P31: [claim('Q20898395')], P225: [{ mainsnak: { datavalue: { value: 'Pyrus communis ‘Conference’' } } }] } } } }
        : { entities: {} };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    },
  });
  await page.goto('/');
  await page.fill('#plant-search', 'Conference');
  await page.click('#btn-search');
  const row = page.locator('#search-results [data-idx]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Sorte von Pyrus communis');
  await row.locator('.btn-add-result').click();
  await expect(row.locator('.btn-add-result')).toHaveText(/Hinzugefügt/);
  const plants = await withDb<[string, string][]>(page, `return (await all('plants')).map(p => [p.latinName, p.varietyName]);`);
  expect(plants).toEqual([['Pyrus communis', 'Conference']]);
  void errors;
});

test('variety picker offers own and list varieties and fills the field', async ({ page, errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  // a variety list for the first sample's species
  const latin = await withDb<string>(page, `return (await all('plants'))[0].latinName;`);
  await withDb(page, `await put('varietyLists', { id: 'l1', name: 'Testliste', source: 'csv', license: 'test', importedAt: new Date().toISOString(), enabled: true,
    entries: [{ name: 'Rote Sorte', species: arg.toLowerCase().split(' ').slice(0, 2).join(' ') }, { name: 'Gelbe Sorte', species: arg.toLowerCase().split(' ').slice(0, 2).join(' ') }] });`, latin);
  await page.goto('/?view=list');
  await page.locator('table tbody tr').filter({ hasText: latin }).locator('.btn-edit').click();
  await page.click('button[aria-haspopup="listbox"]');
  await expect(page.locator('.vp-list [role=option]')).toHaveCount(2);
  await page.fill('.vp-filter', 'gelb');
  await page.keyboard.press('Enter');
  await expect(page.locator('#f-varietyName')).toHaveValue('Gelbe Sorte');
  void errors;
});

test('settings: import a variety list as CSV, then delete it', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/settings/');
  await page.setInputFiles('#variety-csv-input', { name: 'meine-sorten.csv', mimeType: 'text/csv', buffer: Buffer.from('Art;Sorte\nApfel;Topaz\nBirne;Gute Graue\n') });
  await expect(page.locator('#variety-status')).toContainText('2 Sorten');
  const item = page.locator('#variety-lists > li', { hasText: 'meine-sorten' });
  await expect(item).toContainText('2 Sorten · 2 Arten');
  await item.locator('.vl-delete').click();
  await expect(page.locator('#variety-lists')).toContainText('Noch keine Sortenliste');
  void errors;
});

test('search leaves out non-plants such as Homo erectus (lineage via Wikidata query)', async ({ page, errors }) => {
  const ent = (id: string, latin: string, de: string) => ({ [id]: { labels: { de: { value: latin } }, descriptions: { de: { value: de } }, claims: { P225: [{ mainsnak: { datavalue: { value: latin } } }] } } });
  await stubNetwork(page, {
    wikidataSearch: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { search: [{ title: 'Q101362' }, { title: 'Q161105' }] } }) }),
    wikidataEntities: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entities: { ...ent('Q101362', 'Homo erectus', 'Art der Gattung Homo'), ...ent('Q161105', 'Equisetum arvense', 'Art der Gattung Schachtelhalme') } }) }),
    sparql: route => route.fulfill({ contentType: 'application/sparql-results+json', body: JSON.stringify({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q161105' } }] } }) }),
  });
  await page.goto('/');
  await page.fill('#plant-search', 'erectus arvense');
  await page.click('#btn-search');
  const rows = page.locator('#search-results [data-idx]');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Equisetum arvense');
  void errors;
});
