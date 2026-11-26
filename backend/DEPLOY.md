# Deploying backend v10 — 700 Islands Intake

The file to deploy is `backend/Code.gs` in this repository (branch `main` once intake-v38 is live).
It replaces backend v9, which went live as Apps Script version 10 on all three addresses (commit f9fc1af).

**First the app, then the backend.** Deploy v10 only once the v38 app is live on every phone:

- To check a phone, open Settings and tap **Save**. The fields can stay as they are; a blank field never erases the link. A phone with the v38 app says **"Connected (backend v9). Model: …"** before the deploy and **"Connected (backend v10). Model: …"** after it. A phone that says only "Connected. Model: …" still runs an older app: close the app on it, open it again and check again.
- The v38 app works with backend v9 and with v10. A phone that was missed keeps working with v10 as it did with v9, but it gets the v38 app only once it is closed and opened again.
- No new Google permissions are needed. v10 uses the same services as v9 (the sheet, Drive, the script cache and script properties).

## What changes once v10 is live

- **No box goes into the sheet twice.** Sometimes a send reaches the sheet but its answer gets lost on the way back to the phone, and the box is sent again. v10 recognises the box and hands back the row it already wrote. This works for 6 hours after the first send, and for any tracking: a vendor name, a blank, or a short number. Only the v38 app asks for this: a box sent again from an older app is written again, as with v9.
- **Older days list every row.** Opening the day before yesterday (or any earlier day) from the day list shows all of that day's rows, up to 3000 rows back. Before, the app looked back only 500 rows, so correctly sent boxes could show "Not in sheet — Send as a new row". **Update sheet row** reaches as far: with v9 it can't reach a row more than 500 rows back, and the card then offers **“Done in the sheet”** (type the change into the sheet by hand, then tap it). v10 reaches rows up to 3000 back.
- **Every photo of a big box is saved to Drive.** AV–BJ still links the first 15 photos. The rest go to the same photo folder with the same file names, for example `2026-11-26 box 12 JOHN SMITH INSIDE 16.jpg`. The card then says "N more in the Drive photo folder (the sheet links 15)". Only phones with the v38 app send these extra photos.
- **The watch list block can move.** This needs the one-time setup in step 5 below. Once it is done, rows inserted or deleted above the block move it, and the backend follows it. When the log reaches the block, inserting rows above it is all that is needed. An empty watch list now shows as a red "Watch list not loaded: …" on the phones instead of quietly letting every name through.

## Steps

1. Open the Apps Script project: go to script.google.com → **My projects** → **"700 Islands Intake backend"**. To be sure it is the right project, open Deploy → Manage deployments: it lists **three** deployments, one per web app address. If the name is different or it lists fewer, it is the wrong project: go back to My projects.
2. Open **Code.gs** and select everything (Ctrl+A). Paste the whole `backend/Code.gs` from the repo over it, then Save (Ctrl+S).
3. Optional check: choose `setup` in the function menu, then **Run**. The log should show:
   - `Sheet OK: … → MAIN LOG (MBS)`
   - the photo folder
   - a `Watch list:` line saying where the backend looks for the watch list
4. **Deploy → Manage deployments.** All three deployments get the same new version:
   1. **The first deployment:** click ✏️ **Edit**, set Version to **New version** (a description such as "Backend v10" is optional) and click **Deploy**. Note the version number Apps Script gives it. It should be **11**: v9 went live as version 10.
   2. **Each of the other two:** click ✏️ **Edit**, set Version to **that same number** from the list (not New version) and click **Deploy**.

   If the number isn't 11, use the number it gave for the other two deployments and in the record below. Do **not** use "New deployment", because that would create a fourth address. The three `/exec` addresses stay the same.
5. **Watch list, one-time setup.** Until this is done, v10 uses the fixed rows 9070–9110, exactly like v9.
   1. In the sheet, tab **MAIN LOG (MBS)**, find the watch list block. Today it should be B9070:B9110 (column B, from the first name down to the end of the block). Check where the names really are: the block moves if rows were inserted or deleted above it.
   2. Then do **one** of these:
      - **Option a:** Data → Named ranges → **+ Add a range**. Name: `WATCH_LIST`. Range: `'MAIN LOG (MBS)'!B9070:B9110` (or wherever the block is now). Click Done.
      - **Option b:** Apps Script → Project Settings → Script properties → Add script property. Property: `WATCH_RANGE`. Value: `B9070:B9110` (the block's cells as they are now). The backend names those cells `WATCH_LIST` itself the next time a phone sends or loads the watch list.

   From then on, WATCH_LIST counts. Data → Named ranges shows where it is now. v10 keeps the `WATCH_RANGE` and `WATCH_START` script properties on its cells by itself, for a rollback (see the end): leave them as they are.

   The named range must hold at least one name. If it holds none, every phone shows "Watch list not loaded: The watch list (named range WATCH_LIST, …) has no names in it…", and boxes wait for a tap on Send instead of going in by themselves.

## How to confirm

- **Each address:** open each of the three web app (`/exec`) addresses in a browser. The page shows `{"ok":true,"app":"700 Islands Intake backend","v":10}`. If one still shows `"v":9`, that deployment wasn't edited (step 4).
- **On a phone with the v38 app:** open Settings and tap **Save**. The status line says **"Connected (backend v10). Model: …"**.
- **Watch list:** Data → Named ranges lists `WATCH_LIST` with the block's cells. On a phone, a watch-listed customer's card still shows its WATCH LIST chip.
- **A normal box:** send one. It goes in as before and its photos save ("✓ In the sheet at row N · photos linked in AV–BJ").
- **Record the deploy** as earlier backend deploys were, for example:
  `Backend v10 (Apps Script version 11, live on all three addresses): …`

## If something goes wrong: roll back

Go to Deploy → Manage deployments. For each of the three deployments: ✏️ Edit → Version: **10** (backend v9) → Deploy.

The v38 app falls back to v9 behaviour by itself: photos past 15 stay on the phone, and the card says so. **Update sheet row** again can't reach rows more than 500 back; the card then offers “Done in the sheet”.

v9 doesn't know the WATCH_LIST named range. It reads the watch list from the `WATCH_RANGE` script property and stops the log above the `WATCH_START` row. v10 keeps both on the block (WATCH_RANGE: its cells, for example `B9270:B9310`; WATCH_START: its first row, `9270`), so right after the rollback v9 reads the block where it was at the last request to v10. (If step 5 was never done, nothing changes for the watch list.)

- **Check it:** in Apps Script → Project Settings → Script properties, `WATCH_RANGE` holds the cells that Data → Named ranges lists for WATCH_LIST (without the tab name); if not, set both properties as in the next point. Then on a phone, open Settings and tap **Save**: a watch-listed customer's card still shows its WATCH LIST chip.
- **While v9 is live**, the block no longer follows rows inserted or deleted above it. After any such change, set both properties again by hand (Apps Script → Project Settings → Script properties): `WATCH_RANGE` = WATCH_LIST's cells as Data → Named ranges lists them, without the tab name (for example `B9270:B9310`), and `WATCH_START` = their first row (`9270`).
