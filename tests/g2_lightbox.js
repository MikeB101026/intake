// F2: the photo viewer's Move and Remove on boxes already in the sheet. The Move list is made when the viewer opens; the
// target box goes to the sheet before Move is tapped. Both boxes' AV–BJ must follow the move, and a removed photo must
// leave AV–BJ. (v37: the moved photo was never uploaded with its new box, and nothing was saved again.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_lightbox';
(async () => {
  let open; const opened = new Promise(r => { open = r; });
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const lastUp = row => ctl.uploads.filter(u => u.row === row).pop();
  try {
    await t.page.waitForTimeout(500);
    await L.phonePhoto(t, 'L2'); await L.phonePhoto(t, 'B'); await L.phonePhoto(t, 'C');
    await L.waitFor(t, '!S.sortP.size');
    const y = await t.ev('S.current'), qy = JSON.stringify(y);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.boxes.get(${qy}).photosLinked === true`, 20000); await G.idle(t);
    const yRow = (await G.box(t, y)).sheetRow, cId = (await G.box(t, y)).photos[2];
    ctl.appendHook = () => opened;                     // box X's row goes in only once the viewer is open
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const x = await t.ev('S.current'), qx = JSON.stringify(x);
    await t.page.click('#curFinish');
    await L.waitFor(t, `S.sending.has(${qx})`, 20000);
    await G.expand(t, y);
    await t.page.click(`[data-id="${y}"] [data-photo="${cId}"]`);   // viewer opened while X is still being sent: X is in the Move list
    const opts = await t.page.$$eval('#lbMove option', o => o.map(e => e.value));
    if (!opts.includes(x)) throw new Error('setup: Move list ' + JSON.stringify(opts));
    ctl.appendHook = null; open();
    await L.waitFor(t, `S.boxes.get(${qx}).photosLinked === true`, 20000); await G.idle(t);
    const xRow = (await G.box(t, x)).sheetRow;
    await t.page.selectOption('#lbMove', x);
    await t.page.click('#lbMoveBtn');
    await t.page.waitForTimeout(500); await G.idle(t);
    const ux = lastUp(xRow), uy = lastUp(yRow);
    if (!ux || JSON.stringify(ux.who.slice().sort()) !== '["A","C","L1"]') fail('box X (moved into) ' + JSON.stringify(ux && ux.who));
    if (!uy || JSON.stringify(uy.who.slice().sort()) !== '["B","L2"]') fail('box Y (moved out of) ' + JSON.stringify(uy && uy.who));
    // Remove photo A from X in the viewer
    const aId = (await G.box(t, x)).photos[1];
    await G.expand(t, x);
    await t.page.click(`[data-id="${x}"] [data-photo="${aId}"]`);
    await t.page.click('#lbDel');
    await t.page.waitForTimeout(500); await G.idle(t);
    const ux2 = lastUp(xRow), bx = await G.box(t, x), by = await G.box(t, y);
    if (!ux2 || JSON.stringify(ux2.who.slice().sort()) !== '["C","L1"]') fail('box X after Remove ' + JSON.stringify(ux2 && ux2.who));
    if (!bx.linked || !by.linked) fail('not marked saved ' + JSON.stringify({ bx, by }));
    if (t.errs.length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { open(); await t.close(); }
  L.report(NAME, ok, why);
})();
