// F26: the signal drops right after a box goes to the sheet. After its 4 tries the red notice says the app tries again
// by itself (said once: a later failed try stays quiet), the folded card keeps a mark, and when the phone is back online
// the photos go without a tap. (v37: "Tap Save photos", the mark only on the opened card, and nothing ever retried.)
const { start } = require('./h.js');
const G = require('./lib_g2.js'), L = G.L;
const NAME = 'g2_retry_notice';
(async () => {
  const ctl = {};
  const t = await start({ repo: process.env.REPO || require('path').resolve(__dirname, '..'), backend: G.makeBackend2(ctl) });
  let ok = true, why = '';
  const fail = m => { ok = false; why += m + '; '; };
  const tries = () => t.calls.filter(c => c.op === 'photos').length;
  try {
    await t.page.waitForTimeout(500);
    ctl.offline = ['photos'];
    await L.phonePhoto(t, 'L1'); await L.phonePhoto(t, 'A');
    await L.waitFor(t, '!S.sortP.size');
    const id = await t.ev('S.current'), q = JSON.stringify(id);
    await t.page.click('#curFinish');
    await L.waitFor(t, `!!S.boxes.get(${q}).linkError`, 40000);   // 4 tries over about 23 s
    const note = await t.page.textContent('#notice');
    if (tries() !== 4) fail(`tries before giving up: ${tries()}`);
    if (!/tries again by itself/.test(note)) fail('notice: ' + note);
    if (!/PHOTOS NOT SAVED YET/.test(await G.cardText(t, id))) fail('folded card has no mark: ' + await G.cardText(t, id));
    await t.ev('notice(null), 1');
    // still offline: the phone says it's back (a false start) — one quiet try
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await t.page.waitForTimeout(800); await G.idle(t);
    if (tries() !== 5) fail(`tries on the first "online": ${tries() - 4} (expected 1)`);
    if (!(await t.ev('document.querySelector("#notice").hidden'))) fail('the red notice came back for a box that had already failed: ' + await t.page.textContent('#notice'));
    // the signal is back
    ctl.offline = false;
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await L.waitFor(t, `S.boxes.get(${q}).photosLinked`, 15000);
    await G.idle(t);
    const b = await G.box(t, id), up = ctl.uploads.pop();
    if (!up || up.n !== 2 || b.linkError) fail('after the signal came back ' + JSON.stringify({ up, b }));
    if (/NOT SAVED/.test(await G.cardText(t, id))) fail('mark still on the card');
    if (t.errs.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)).length) fail('page errors ' + JSON.stringify(t.errs));
  } catch (e) { fail('exception ' + e.message); }
  finally { await t.close(); }
  L.report(NAME, ok, why);
})();
