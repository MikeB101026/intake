// F19: "Read again" on another phone's box while its photos are still coming from Drive. The read waits for all of them
// (and the contents stay whole); if one can't be loaded, nothing is read and the card says why. (v37 read only the
// photos already on the phone, so the contents shrank and the card offered "Update sheet row".)
const { start } = require('./h.js');
const L = require('./lib_g1.js');
const NAME = 'g1_imported_read';
(async () => {
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const disp = day => { const [y, m, d] = day.split('-'); return `${d} ${MON[+m - 1]} ${y}`; };
  let page;
  const ctl = {
    dayRows: day => [
      { row: 900, cells: ['ANNA LEE', 'TBA444444444444', '1', '2', 'AMAZON', 'NO INVOICE', 'ALPHA SHOE (1 TOTAL) ///\nBRAVO SOCK (1 TOTAL) ///\nCHARLIE LAMP (1 TOTAL)', disp(day)],
        pics: [{ id: 'P-L4', label: 'LABEL 1' }, { id: 'P-A', label: 'INSIDE 1' }, { id: 'P-B', label: 'INSIDE 2' }, { id: 'P-C', label: 'INSIDE 3' }] },
      { row: 901, cells: ['PETER PAN', 'TBA333333333333', '1', '9', 'AMAZON', 'NO INVOICE', 'ECHO FAN (1 TOTAL) ///\nFOXTROT HAT (1 TOTAL)', disp(day)],
        pics: [{ id: 'P-L3', label: 'LABEL 1' }, { id: 'P-E', label: 'INSIDE 1' }, { id: 'P-X', label: 'INSIDE 2' }] },
    ],
    photoGet: async id => { await L.sleep(700); if (id === 'P-X') return null; return (await L.jpeg(page, id.slice(2))).toString('base64'); },   // P-X: the Drive file can't be loaded
  };
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: L.makeBackend(ctl) });
  page = t.page;
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await L.waitFor(t, 'allBoxes().filter(b => b.imported).length === 2', 15000);
    const ids = await t.ev('JSON.stringify(Object.fromEntries(allBoxes().map(b => [b.sheetRow, b.id])))').then(JSON.parse);
    for (const row of [900, 901]) {
      const id = ids[row], q = JSON.stringify(id);
      await t.page.click(`[data-id="${id}"] [data-act="toggle"]`);              // opening the card starts the download
      await L.waitFor(t, `S.boxes.get(${q}).photos.length >= 2`, 15000);
      await t.page.click(`[data-id="${id}"] [data-act="reread"]`);              // tapped with 2 photos on the phone
      await t.page.waitForTimeout(300);
      // its photos download outside the read slot (R17): wait for the download and the read it then asks for
      await L.waitFor(t, '!picsLoading.size && !(typeof picsWait !== "undefined" && picsWait.size)', 20000);
      await L.waitIdle(t, 20000);
      await t.page.waitForTimeout(500);
    }
    const bx = await L.boxes(t), a = bx.find(b => b.sheetRow === 900), p = bx.find(b => b.sheetRow === 901);
    if (!a || a.n !== 4 || !['ALPHA SHOE', 'BRAVO SOCK', 'CHARLIE LAMP'].every(x => a.contents.includes(x)) || a.view !== 'sent') fail('row 900 read from part of its photos: ' + JSON.stringify(a && [a.n, a.contents, a.view]));
    if (!p || !/FOXTROT HAT/.test(p.contents) || p.view !== 'sent') fail('row 901 changed from part of its photos: ' + JSON.stringify(p && [p.n, p.contents, p.view]));
    const err = await t.ev(`S.boxes.get(${JSON.stringify(ids[901])}).readError`);
    if (!/haven’t loaded from Drive/.test(err || '')) fail('no message for the photo that did not load: ' + JSON.stringify(err));
    const reads = ctl.log.filter(x => x.kind === 'main').map(x => x.ids.length);
    if (reads.length !== 1 || reads[0] !== 4) fail('reads (photos per read) ' + JSON.stringify(reads));
    const errs = t.errs.filter(e => !/Failed to load resource/.test(e));
    if (errs.length) fail('page errors ' + JSON.stringify(errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();
