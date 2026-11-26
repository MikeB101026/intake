// R24: the first start after the update on a phone that used v37's "Delete photos of boxes already in the sheet":
// 600 of its own boxes and 200 of other phones' boxes, 10-40 days old, in the sheet with no photos left, plus one box
// of today. Their marks (own: its row keeps its photo links; other phone's: its Drive photos load again) must be saved
// in ONE write before the list is drawn (v38 saved them one box at a time: 800 writes while the list said "No boxes
// yet"). Every mark is saved, and the next start has nothing left to mark.
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R24_one_write';
const PORT = +process.env.PORT || 10470;
(async () => {
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend2({}) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const boxes = [];
    for (let i = 0; i < 800; i++) {
      const ago = 10 + (i % 30), day = G.daysAgo(ago), at = Date.now() - ago * 86400000;
      const b = G.sentBox({ id: 'old' + i, day, seq: 1 + Math.floor(i / 30), sheetRow: 1000 + i, photos: [], photosLinked: true, createdAt: at, sentAt: at + 60000,
        row: { customer: 'OLD BOX ' + i, tracking: 'TBA' + String(500000000000 + i) } });
      if (i >= 600) Object.assign(b, { imported: true, pics: [{ id: 'PIC' + i + 'xxxxxxxxxxxxxxxxxxxxxx', label: 'LABEL 1' }], picsDone: ['PIC' + i + 'xxxxxxxxxxxxxxxxxxxxxx'] });
      boxes.push(b);
    }
    boxes.push(G.sentBox({ id: 'today1', seq: 1, sheetRow: 150, photos: [], photosLinked: true }));
    await G.inject(t, [], boxes);
    await t.page.addInitScript(() => {
      const T = window.__t = { rw: 0, before: null };
      const orig = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
        if (mode === 'readwrite' && [].concat(stores).includes('boxes')) T.rw++;
        return orig.call(this, stores, mode, ...rest);
      };
      new MutationObserver(() => { if (T.before == null && document.querySelectorAll('#boxes [data-id]').length) T.before = T.rw; })
        .observe(document, { subtree: true, childList: true });
    });
    const boot = async () => {
      await G.reload(t);
      await t.page.waitForFunction(() => window.__t && window.__t.before != null, null, { timeout: 60000, polling: 50 });
      return t.page.evaluate(() => window.__t.before);
    };
    const first = await boot();
    if (first > 2) fail(`first start: ${first} box writes before the list was drawn (expected one for all the marks)`);
    await t.page.waitForTimeout(500);
    const saved = () => t.ev(`allBoxesDb().then(l => JSON.stringify({
      own: l.filter(b => /^old/.test(b.id) && !b.imported && b.purged && b.purged.row === b.sheetRow && Array.isArray(b.purged.keep) && !b.purged.keep.length).length,
      theirs: l.filter(b => b.imported && Array.isArray(b.picsDone) && !b.picsDone.length).length,
      today: l.filter(b => b.id === 'today1' && !b.purged).length }))`).then(JSON.parse);
    const s1 = await saved();
    if (s1.own !== 600 || s1.theirs !== 200 || s1.today !== 1) fail('marks saved: ' + JSON.stringify(s1));
    const second = await boot();
    if (second !== 0) fail(`next start: ${second} box writes before the list (nothing left to mark)`);
    const s2 = await saved();
    if (JSON.stringify(s2) !== JSON.stringify(s1)) fail('after the next start: ' + JSON.stringify(s2));
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs).slice(0, 400));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();
