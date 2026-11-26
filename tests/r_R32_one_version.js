// R32 (deploy doc + Code.gs header): followed to the letter, the deploy steps put all three deployments on ONE new
// Apps Script version — the number the doc and the deploy record expect (11) — not three (11, 12, 13): "New version" on
// the first deployment only, the other two pick that same version. Step 1 opens the project only from script.google.com
// → My projects and says how to tell it is the right one (three deployments). The doc also says to deploy v10 only once
// v38 is live (what Settings → Save says before and after), that with v9 "Update sheet row" can't reach rows more than
// 500 back (the card offers “Done in the sheet”) while v10 reaches 3000, and how the watch list properties stand after a
// rollback (R8). Apps Script, as modelled here: every "New version" makes the next number; a deployment runs the
// version it was set to. Reads REPO's backend/Code.gs and the deploy doc (DOC, default the scratchpad's).
const fs = require('fs'), path = require('path');
const NAME = 'r_R32_one_version';
let ok = true, why = '';
const fail = m => { ok = false; why += m + '; '; };
try {
  const doc = fs.readFileSync(process.env.DOC || path.join(__dirname, '..', 'BACKEND_DEPLOY.md'), 'utf8');
  const gs = fs.readFileSync(path.join(process.env.REPO || require('path').resolve(__dirname, '..'), 'backend/Code.gs'), 'utf8');
  const step = (a, b) => { const i = doc.indexOf(a), j = doc.indexOf(b, i + 1); return i < 0 || j < 0 ? '' : doc.slice(i, j); };
  const step1 = step('1. ', '2. '), step4 = step('4. **Deploy', '5. **Watch list');
  const at = gs.indexOf(' * Update:'), header = at < 0 ? '' : gs.slice(at, gs.indexOf('*/', at)).replace(/\s*\n\s*\*\s*/g, ' ');
  if (!step4 || !header) throw new Error('setup: step 4 or the Code.gs header not found');
  // How many new versions the text makes, and which version each of the three deployments ends on.
  function follow(text) {
    const t = text.replace(/\(not New version\)|not New version/g, '');
    let last = 10;                                       // v9 went live as Apps Script version 10
    if (/for \*\*each\*\* of them|for each deployment|each of the three/i.test(t) && /New version/.test(t)) return [++last, ++last, ++last];
    const first = /first deployment[\s\S]*?New version/i.test(t), others = /other two[\s\S]*?(that same|same version|same number)/i.test(t);
    if (first && others) { const v = ++last; return [v, v, v]; }
    return null;                                         // the text doesn't say what to do with each deployment
  }
  const d = follow(step4), h = follow(header);
  const expect = +((step4.match(/It should be \*\*(\d+)\*\*/) || [])[1]), record = +((doc.match(/Apps Script version (\d+), live on all three/) || [])[1]);
  if (!d) fail('doc step 4: unclear which version each deployment gets');
  else if (new Set(d).size !== 1) fail(`doc step 4 followed to the letter: versions ${d.join(', ')} (one per deployment)`);
  else if (d[0] !== expect || d[0] !== record) fail(`doc step 4 gives version ${d[0]}, it says ${expect}, the record ${record}`);
  if (!h) fail('Code.gs header: unclear which version each deployment gets: ' + header.slice(0, 200));
  else if (new Set(h).size !== 1) fail(`Code.gs header followed to the letter: versions ${h.join(', ')}`);
  if (!/My projects/.test(step1) || /Extensions → Apps Script/.test(step1) || !/three/.test(step1)) fail('step 1: ' + step1.trim().slice(0, 200));
  if (!/My projects/.test(header) || !/three deployments/.test(header)) fail('Code.gs header: no project / three deployments: ' + header.slice(0, 160));
  // Deploy order: v38 first, checked with Settings → Save.
  const order = doc.slice(0, doc.indexOf('## What changes'));
  if (!/v38 app is live/.test(order) || !/Connected \(backend v9\)/.test(order) || !/Connected \(backend v10\)/.test(order) || /Nothing has to happen at the same time/.test(doc))
    fail('deploy order (v38 first, Settings → Save before and after) not in the doc');
  if (!/Update sheet row\*\* reaches as far: with v9 it can’t reach|Update sheet row\*\* reaches as far: with v9 it can't reach/.test(doc) || !/Done in the sheet/.test(doc) || !/3000 back/.test(doc))
    fail('the 500-row reach of Update sheet row with v9 (Done in the sheet) and v10’s 3000 are not in the doc');
  // Rollback (R8): no "doesn't bother v9"; the properties v10 keeps, checking them, and updating them by hand on v9.
  const back = doc.slice(doc.indexOf('## If something goes wrong'));
  if (/doesn't bother v9|doesn’t bother v9/.test(doc)) fail('the rollback still says the named range doesn’t bother v9');
  if (!/WATCH_RANGE/.test(back) || !/WATCH_START/.test(back) || !/by hand/.test(back) || !/WATCH LIST chip/.test(back)) fail('rollback: the watch list properties are not explained');
} catch (e) { fail('exception ' + (e.stack || e.message)); }
console.log(ok ? `PASS ${NAME}` : `FAIL ${NAME} ${why}`); process.exit(ok ? 0 : 1);
