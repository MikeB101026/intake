// R28: the bottom button. Today's 2 boxes are in the sheet with their photos saved; box #31 of yesterday is NOT in the
// sheet (it waits on Check: no tracking); a box of 4 days ago has photos the backend keeps refusing (its row now holds
// another package). The button must say "1 box of <yesterday> not in the sheet — tap to open that day" (v38: "Save
// photos for 1 row" on every day, and a tap only retried the old box), never before Send or Update for the day on
// screen, and a tap opens yesterday, where "Save photos" is offered again.
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'r_R28_bar';
const PORT = +process.env.PORT || 10240;
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), port: PORT, backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const bar = async () => ({ text: (await t.page.textContent('#sendBtn')).trim(), mode: await t.ev('document.querySelector("#sendBtn").dataset.mode') });
  try {
    await t.page.waitForTimeout(500);
    const TD = G.today(), YD = G.daysAgo(1), OLD = G.daysAgo(4);
    const a = G.sentBox({ id: 'ta', day: TD, seq: 1, sheetRow: 100, photos: ['a1', 'a2'], photosLinked: true, savedIds: ['a1', 'a2'], photosLeft: 0, row: { customer: 'ANN LEE', tracking: 'TBA100000000001' } });
    const b = G.sentBox({ id: 'tb', day: TD, seq: 2, sheetRow: 101, photos: ['b1', 'b2'], photosLinked: true, savedIds: ['b1', 'b2'], photosLeft: 0, row: { customer: 'BOB KIM', tracking: 'TBA100000000002' } });
    ctl.sheet.rows.push(G.sheetRowFor(a, 100), G.sheetRowFor(b, 101)); ctl.sheet.next = 102;
    const old = G.sentBox({ id: 'old', day: OLD, seq: 4, sheetRow: 50, photos: ['o1', 'o2'], createdAt: Date.now() - 4 * 86400000, sentAt: Date.now() - 4 * 86400000,
      linkError: 'No connection to the backend. Check your signal and try again.', linkErrAt: Date.now() - 4 * 86400000, row: { customer: 'OLD ONE', tracking: 'TBA420000000001' } });
    ctl.sheet.rows.push({ row: 50, day: OLD, cells: ['SOMEONE ELSE', 'TBA999999999999', '1', '3', 'UPS', 'NO INVOICE', 'X (1 TOTAL)'], pics: [] });
    const y = { id: 'yday', day: YD, seq: 31, createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000, photos: ['y1', 'y2'], note: '', status: 'read', ok: false,
      row: { customer: 'MARY JONES', tracking: '', pieces: 1, weight: '7', shipper: 'AMAZON', invoice: false, contents: 'BRAVO SOCK (1 TOTAL)' },
      proof: [], flags: [], badges: [], read: { at: Date.now() - 86400000, note: '' }, readError: '', edited: {}, sheetRow: null, sentCells: null, trk4s: [], noTotals: false };
    await G.inject(t, [{ id: 'a1', shape: 'L1', kind: 'label', box: 'ta' }, { id: 'a2', shape: 'A', kind: 'item', box: 'ta' },
      { id: 'b1', shape: 'L2', kind: 'label', box: 'tb' }, { id: 'b2', shape: 'C', kind: 'item', box: 'tb' },
      { id: 'o1', shape: 'L3', kind: 'label', box: 'old' }, { id: 'o2', shape: 'D', kind: 'item', box: 'old' },
      { id: 'y1', shape: 'L4', kind: 'label', box: 'yday' }, { id: 'y2', shape: 'B', kind: 'item', box: 'yday' }], [a, b, old, y]);
    await t.page.evaluate(() => localStorage.setItem('autoSend', '0'));
    await G.reload(t);
    await L.waitFor(t, 'S.boxes.size === 4', 10000);
    await t.page.waitForTimeout(1500); await G.idle(t, 60000);
    if (!/no longer holds this box/.test(await t.ev('S.boxes.get("old").linkError || ""'))) throw new Error('setup: the old box\'s save wasn\'t refused');
    if ((await t.ev('viewStatus(S.boxes.get("yday"))')) !== 'check' || (await t.ev('S.day')) !== TD) throw new Error('setup: yesterday\'s box / day on screen');
    const b1 = await bar();
    if (b1.mode !== 'day' || !/^1 box of .+ not in the sheet — tap to open that day$/.test(b1.text)) fail('the button says ' + JSON.stringify(b1));
    // a change to send on the day on screen comes first
    await t.ev('patchBox("ta", x => { x.row.weight = "9"; }).then(() => (render(), 1))');
    const b2 = await bar();
    if (b2.mode !== 'update' || b2.text !== 'Update 1 changed row') fail('with a changed row: ' + JSON.stringify(b2));
    await t.ev('patchBox("ta", x => { x.row.weight = "4"; }).then(() => (render(), 1))');
    // and so does a box ready to send
    await t.ev(`saveBox({ id: 'tr', day: ${JSON.stringify(TD)}, seq: 3, createdAt: Date.now(), photos: [], note: '', status: 'read', ok: true, proof: [], flags: [], badges: [], read: { at: Date.now(), note: '' }, readError: '', edited: {},
      row: { customer: 'CAROL DAY', tracking: 'TBA555555555555', pieces: 1, weight: '3', shipper: 'AMAZON', invoice: false, contents: 'DELTA MUG (1 TOTAL)' }, sheetRow: null, sentCells: null, trk4s: [], noTotals: false }).then(() => (render(), 1))`);
    const b3 = await bar();
    if (b3.mode !== 'send' || b3.text !== 'Send 1 to sheet') fail('with a box ready to send: ' + JSON.stringify(b3));
    await t.ev('deleteBox("tr").then(() => (render(), 1))');
    const b4 = await bar();
    if (b4.mode !== 'day') fail('back to nothing to send: ' + JSON.stringify(b4));
    else {
      await t.page.click('#sendBtn');                  // opens that day
      await t.page.waitForTimeout(500); await G.idle(t, 60000);
      const b5 = await bar();
      if ((await t.ev('S.day')) !== YD) fail('the tap didn\'t open yesterday: ' + await t.ev('S.day'));
      if (b5.mode !== 'photos' || b5.text !== 'Save photos for 1 row') fail('on yesterday: ' + JSON.stringify(b5));
    }
    if (t.errs.filter(e => !/Failed to load resource/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + String(e.message).split('\n')[0]); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();
