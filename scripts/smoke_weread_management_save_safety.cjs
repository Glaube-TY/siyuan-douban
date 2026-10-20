// Production storage guard and actual component handlers; all data and writes are synthetic.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "smoke_weread_management_read_safety.cjs"), "utf8");
const { fixture, component, manager, ISBN, OTHER, BOOK } = new Function("require", "__dirname", source.slice(0, source.indexOf("\n(async () => {")) + "\nreturn { fixture, component, manager, ISBN, OTHER, BOOK };")(require, __dirname);
const IGNORED = "weread_ignoredBooks", CUSTOM = "weread_customBooksISBN", SECOND = "synthetic-B", OUTSIDE = "synthetic-outside";
let count = 0;
async function test(name, run) { await run(); console.log(`PASS ${++count}: ${name}`); }
const tick = () => new Promise(resolve => setImmediate(resolve));
function data() {
    const f = fixture(); f.attempts = [];
    f.data[IGNORED] = [{ bookID: BOOK, title: "Synthetic A", metadata: { retained: [1, 2] } }, { syncID: OUTSIDE, title: "Outside", extra: "retained" }];
    f.data[CUSTOM] = [{ bookID: BOOK, customISBN: ISBN, metadata: { retained: true } }];
    f.data.weread_notebooks.push({ bookID: SECOND, title: "Synthetic B", sourceType: "weread_book" });
    f.plugin.saveData = async (key, value) => { f.saves++; f.attempts.push({ key, value: structuredClone(value) }); f.data[key] = structuredClone(value); };
    f.guard = f.load("src/utils/weread/wereadManagementSaveGuard.ts");
    return f;
}
async function open(f, type, override = {}) {
    const events = { confirmed: 0, cancelled: 0 };
    const custom = await f.load("src/utils/weread/wereadSyncStorage.ts").loadCustomISBNBooksWithMigration(f.plugin, { migrate: false });
    const props = { ignoredBooks: Array.isArray(f.data[IGNORED]) ? structuredClone(f.data[IGNORED]) : [], customISBNBooks: custom,
        syncedRecords: structuredClone(f.data.weread_notebooks), temporaryNotebooks: [], validISBNs: [ISBN],
        onConfirm: () => events.confirmed++, onCancel: () => events.cancelled++, ...override };
    const name = type === "synced" ? "WereadSyncedDataDialog" : type === "ignored" ? "wereadIgnoredBooksDialog" : "wereadManageISBN";
    const expose = "get error(){return errorText},get saving(){return isSaving},get blocked(){return needsRecheck},cancel:handleCancel," + (type === "synced"
        ? "save,toggle(id){toggleSync(buildRows(originalSyncedRecords,originalTemporaryNotebooks).find(row=>row.bookID===id))},get records(){return editedIgnoredBooks()}"
        : type === "ignored" ? "save:handleSave,restore:handleRestore,get records(){return localIgnoredBooks}"
        : "save:handleSave,remove:handleDeleteEffective,edit(value){localEffectiveBooks[0].customISBN=value},get records(){return editedISBNBooks()}");
    const p = component(name, f, props, expose); await p.init(); return Object.assign(p, { events, props });
}
function change(p, type) { if (type === "synced") p.toggle(BOOK); else if (type === "ignored") p.restore(BOOK); else p.edit(OTHER); }
function noApiWrites(f) { assert.equal(f.writes.length, 0); assert.equal(f.forbidden, 0); }

(async () => {
    for (const type of ["synced", "ignored", "isbn"]) await test(`${type}: open, edit and cancel preserve props and storage with zero writes`, async () => {
        const f = data(), before = structuredClone(f.data), p = await open(f, type), props = structuredClone({ ...p.props, onConfirm: undefined, onCancel: undefined, plugin: undefined });
        assert.equal(p.error, ""); change(p, type); p.cancel(); assert.equal(p.events.cancelled, 1); assert.deepEqual(f.data, before); f.zero();
        assert.deepEqual({ ...p.props, onConfirm: undefined, onCancel: undefined, plugin: undefined }, props);
    });
    await test("switch all management tabs without business writes", async () => {
        const f = data(), before = structuredClone(f.data), p = manager(f, "synced"); await p.init();
        for (const tab of ["isbn", "bookid", "ignored", "repair", "synced"]) p.select(tab);
        assert.equal(p.error, ""); assert.deepEqual(f.data, before); f.zero();
    });
    await test("missing and existing empty ignored files have distinct snapshots", async () => {
        const f = data(); delete f.data[IGNORED]; const missing = await f.guard.readWereadManagementSnapshot(f.plugin, IGNORED, []);
        f.data[IGNORED] = []; const empty = await f.guard.readWereadManagementSnapshot(f.plugin, IGNORED, []);
        assert.equal(missing.exists, false); assert.equal(empty.exists, true); assert.notEqual(missing.fingerprint, empty.fingerprint);
        const result = await f.guard.saveWereadManagementData(f.plugin, IGNORED, missing, [{ bookID: BOOK }]);
        assert.equal(result.status, "conflict"); f.zero();
    });
    const invalid = [null, {}, "not an array", [{ title: "No identity" }], [{ bookID: BOOK, syncID: SECOND }], [{ bookID: BOOK }, { bookId: BOOK }], [{ bookID: false }], [{ bookID: BOOK, sourceType: "unsupported" }]];
    for (let i = 0; i < invalid.length; i++) await test(`invalid ignored shape/identity ${i + 1} blocks both editors without writes`, async () => {
        for (const type of ["synced", "ignored"]) {
            const f = data(); f.data[IGNORED] = structuredClone(invalid[i]); const before = structuredClone(f.data), p = await open(f, type);
            await p.save(); assert.ok(p.error); assert.equal(p.events.confirmed, 0); assert.deepEqual(f.data, before); f.zero();
        }
    });
    await test("damaged JSON and transport failure stay distinguishable and never write", async () => {
        for (const [message, status] of [["插件存储 JSON 格式无效：weread_ignoredBooks", "invalid"], ["Synthetic transport failure", "read_failed"]]) {
            const f = data(), read = f.plugin.loadDataStrict;
            f.plugin.loadDataStrict = async key => { if (key === IGNORED) throw Error(message); return read(key); };
            await assert.rejects(() => f.guard.readWereadManagementSnapshot(f.plugin, IGNORED), error => error.status === status);
            const p = await open(f, "ignored"); await p.save(); assert.ok(p.error); f.zero();
        }
    });
    const concurrent = {
        added: f => f.data[IGNORED].push({ bookID: "synthetic-concurrent", metadata: true }),
        restored: f => f.data[IGNORED].splice(1, 1),
        metadata: f => f.data[IGNORED][0].metadata.retained.push(3),
        damaged: f => f.data[IGNORED] = null,
        missing: f => delete f.data[IGNORED],
    };
    for (const type of ["synced", "ignored"]) for (const [name, mutate] of Object.entries(concurrent)) await test(`${type}: concurrent ${name} prevents stale overwrite`, async () => {
        const f = data(), p = await open(f, type); change(p, type); mutate(f); const before = structuredClone(f.data);
        await p.save(); assert.ok(p.error); assert.equal(p.events.confirmed, 0); assert.deepEqual(f.data, before); f.zero();
    });
    await test("synced edits preserve existing extension fields, out-of-scope aliases and create only the selected new ignore", async () => {
        const f = data(), original = structuredClone(f.data[IGNORED]), p = await open(f, "synced");
        p.toggle(SECOND); await p.save(); assert.equal(p.events.confirmed, 1); assert.equal(f.saves, 1);
        assert.deepEqual(f.data[IGNORED].slice(0, 2), original);
        assert.deepEqual(f.data[IGNORED][2], { bookID: SECOND, title: "Synthetic B", isbn: "", author: "", sourceType: "weread_book" }); noApiWrites(f);
    });
    await test("restoring only the selected source retains all unrelated records", async () => {
        const f = data(), outside = structuredClone(f.data[IGNORED][1]), p = await open(f, "synced"); p.toggle(BOOK); await p.save();
        assert.equal(p.events.confirmed, 1); assert.deepEqual(f.data[IGNORED], [outside]); noApiWrites(f);
    });
    await test("conflicting source types or duplicate source identities block synced save", async () => {
        for (const mode of ["type", "duplicate"]) {
            const f = data(); const extra = { ...f.data.weread_notebooks[0], sourceType: "weread_mp_account" };
            if (mode === "type") f.data.temporary_weread_notebooksList = [extra]; else f.data.weread_notebooks.push(extra);
            const p = await open(f, "synced", { temporaryNotebooks: f.data.temporary_weread_notebooksList }); await p.save(); assert.ok(p.error); f.zero();
        }
    });
    for (const type of ["synced", "ignored", "isbn"]) await test(`${type}: pending persistence blocks closing, cancellation and immediate double submit`, async () => {
        const f = data(); let complete;
        f.plugin.saveData = (key, value) => { f.saves++; return new Promise(resolve => complete = () => { f.data[key] = structuredClone(value); resolve(); }); };
        const p = await open(f, type); change(p, type); const pending = p.save(); await p.save(); p.cancel(); await tick();
        assert.equal(f.saves, 1); assert.equal(p.events.confirmed, 0); assert.equal(p.events.cancelled, 0); assert.equal(p.saving, true);
        complete(); await pending; assert.equal(p.events.confirmed, 1); noApiWrites(f);
    });
    for (const type of ["synced", "ignored", "isbn"]) for (const mode of ["reject", "noop", "read-error"]) await test(`${type}: ${mode} never reports success or repeats uncertain writes`, async () => {
        const f = data(); f.plugin.saveData = async (key, value) => {
            f.saves++;
            if (mode === "reject") throw Error("Synthetic rejection");
            if (mode === "read-error") { f.data[key] = structuredClone(value); f.storageError = true; }
        };
        const p = await open(f, type); change(p, type); await p.save(); assert.ok(p.error); assert.equal(p.events.confirmed, 0); assert.equal(p.events.cancelled, 0); assert.equal(p.blocked, true);
        await p.save(); assert.equal(f.saves, 1); p.cancel(); assert.equal(p.events.cancelled, 1); noApiWrites(f);
    });
    await test("two manager instances serialize ignored writes and reject the stale second snapshot", async () => {
        const f = data(); let complete;
        f.plugin.saveData = (key, value) => { f.saves++; return new Promise(resolve => complete = () => { f.data[key] = structuredClone(value); resolve(); }); };
        const a = await open(f, "ignored"), b = await open(f, "synced"); a.restore(BOOK); b.toggle(SECOND);
        const pending = a.save(); await tick(); await b.save(); assert.equal(f.saves, 1); assert.equal(b.events.confirmed, 0);
        complete(); await pending; await b.save(); assert.equal(f.saves, 1); assert.equal(b.events.confirmed, 0); assert.ok(b.error); noApiWrites(f);
    });
    for (const mode of ["added", "metadata", "deleted"]) await test(`ISBN concurrent ${mode} cannot be overwritten`, async () => {
        const f = data(), p = await open(f, "isbn"); p.edit(OTHER);
        if (mode === "added") f.data[CUSTOM].push({ bookID: SECOND, customISBN: OTHER });
        if (mode === "metadata") f.data[CUSTOM][0].metadata.retained = false;
        if (mode === "deleted") f.data[CUSTOM] = [];
        const before = structuredClone(f.data); await p.save(); assert.ok(p.error); assert.equal(p.events.confirmed, 0); assert.deepEqual(f.data, before); f.zero();
    });
    await test("historical ISBN is normalized only in memory; explicit save retains verified backup and metadata", async () => {
        const f = data(), legacy = [{ syncID: BOOK, isbn: ISBN, metadata: { retained: true } }]; f.data[CUSTOM] = structuredClone(legacy);
        const p = await open(f, "isbn"); assert.equal(p.error, ""); assert.deepEqual(f.data[CUSTOM], legacy); f.zero();
        p.edit(OTHER); await p.save(); assert.equal(p.events.confirmed, 1);
        assert.deepEqual(f.data.weread_customBooksISBN_legacy_backup_v1, legacy);
        assert.equal(f.data[CUSTOM][0].customISBN, OTHER); assert.deepEqual(f.data[CUSTOM][0].metadata, { retained: true });
        assert.ok(f.attempts.every(attempt => [CUSTOM, "weread_customBooksISBN_legacy_backup_v1"].includes(attempt.key))); noApiWrites(f);
    });
    await test("equivalent historical representations compare normalized business records without migrations", async () => {
        const f = data(); f.data[CUSTOM] = [{ syncID: BOOK, isbn: ISBN, title: "Same" }]; const p = await open(f, "isbn");
        f.data[CUSTOM] = [{ title: "Same", bookID: BOOK, customISBN: ISBN }];
        await p.save(); assert.equal(p.events.confirmed, 1); f.zero();
    });
    for (const type of ["synced", "ignored", "isbn"]) await test(`${type}: saving unchanged canonical data avoids record rebuilding`, async () => {
        const f = data(); f.data[CUSTOM].unshift({ bookID: "stale", customISBN: OTHER, extra: "first" });
        const before = structuredClone(f.data), p = await open(f, type); await p.save(); assert.equal(p.events.confirmed, 1); assert.deepEqual(f.data, before); f.zero();
    });
    await test("invalid replacement records and disposed editors cannot write", async () => {
        const f = data(), snapshot = await f.guard.readWereadManagementSnapshot(f.plugin, IGNORED);
        for (const records of invalid) assert.equal((await f.guard.saveWereadManagementData(f.plugin, IGNORED, snapshot, records)).status, "invalid");
        for (const type of ["synced", "ignored", "isbn"]) { const p = await open(f, type); change(p, type); p.dispose(); await p.save(); assert.equal(p.events.confirmed, 0); }
        f.zero();
    });
    console.log(`WeRead management save safety: ${count} scenarios passed (synthetic I/O, actual handlers; not live client acceptance).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
