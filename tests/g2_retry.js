// F26: photos that didn't save are tried again by themselves, for every day: at start-up (also a box that already
// failed, and yesterday's), with the 30-s sync at most every 2 minutes a box, and when the phone is back online. The
// bottom button offers yesterday's too. (v37: start-up skipped every box that had failed, nothing else ever retried,
// and "Save photos" only counted the day on screen.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_retry';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  try {
    await t.page.waitForTimeout(500);
    const err = 'No connection to the backend. Check your signal and try again.', ago = Date.now() - 30000;
    const y = G.sentBox({ id: 'yday', day: G.daysAgo(1), sheetRow: 100, photos: ['y1', 'y2'], linkError: err, linkErrAt: ago, createdAt: Date.now() - 86400000 });
    const z = G.sentBox({ id: 'tday', seq: 1, sheetRow: 101, photos: ['z1', 'z2'], linkError: err, linkErrAt: ago, row: { customer: 'MARY JONES', tracking: 'TBA222222222222' } });
    await G.inject(t, [{ id: 'y1', shape: 'L1', kind: 'label', box: 'yday' }, { id: 'y2', shape: 'A', kind: 'item', box: 'yday' },
      { id: 'z1', shape: 'L2', kind: 'label', box: 'tday' }, { id: 'z2', shape: 'B', kind: 'item', box: 'tday' }], [y, z]);
    ctl.sheet.rows.push(G.sheetRowFor(y, 100), G.sheetRowFor(z, 101));
    ctl.offline = ['photos'];                          // still no signal for photos
    const arrived = () => t.calls.filter(c => c.op === 'photos').length;
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 2', 10000);
    await t.page.waitForTimeout(1500); await G.idle(t);
    // 1) start-up tried both once (they had failed before: one try each, no new red notice)
    if (arrived() !== 2) fail(`start-up tries: ${arrived()} (expected 2)`);
    const note = await t.ev('document.querySelector("#notice").hidden ? "" : document.querySelector("#notice").textContent');
    if (/didn’t save/.test(note)) fail('red notice again for boxes that had already failed: ' + note);
    const btn = await t.page.textContent('#sendBtn');
    if (!/Save photos for 2 rows/.test(btn)) fail('bottom button (yesterday’s box too): ' + btn);
    const chip = await G.cardText(t, 'tday');
    if (!/PHOTOS NOT SAVED YET/.test(chip)) fail('folded card does not say its photos are not saved: ' + chip);
    // 2) the 30-s sync: a box that failed under 2 minutes ago waits; one that failed longer ago goes again
    const n0 = arrived();
    await t.ev('syncDay().then(() => 1)'); await t.page.waitForTimeout(500); await G.idle(t);
    if (arrived() !== n0) fail(`sync retried too soon: ${arrived() - n0} tries`);
    await t.ev('patchBox("yday", x => { x.linkErrAt = Date.now() - 130000; }).then(() => 1)');
    await t.ev('syncDay().then(() => 1)'); await t.page.waitForTimeout(500); await G.idle(t);
    if (arrived() !== n0 + 1) fail(`sync after 2 minutes: ${arrived() - n0} tries (expected 1)`);
    // 3) signal back: both go at once
    ctl.offline = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await L.waitFor(t, 'S.boxes.get("yday").photosLinked && S.boxes.get("tday").photosLinked', 15000);
    await G.idle(t);
    const ups = ctl.uploads.map(u => u.row).sort();
    if (JSON.stringify(ups) !== '[100,101]') fail('uploads ' + JSON.stringify(ctl.uploads));
    const after = await G.cardText(t, 'tday'), btn2 = await t.page.textContent('#sendBtn');
    if (/NOT SAVED/.test(after) || /Save photos/.test(btn2)) fail('still marked unsaved: ' + after + ' | ' + btn2);
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();
