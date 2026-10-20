// Actual storage -> planners -> imports -> saved reports and coordinator; synthetic I/O only.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const existing = fs.readFileSync(path.join(__dirname, "smoke_weread_book_identity.cjs"), "utf8");
const boundary = existing.indexOf("(async () => {");
async function scenarios() {
    const IGNORED = "weread_ignoredBooks";
    let saves = [], plans = [], commits = [], planning = [], choice = "bookID", approve = true, injected, networkFail = false, confirmHook, saveHook, strictHook;
    let decryptFails = false, enabled = true, autoCalls = 0, realAuto = false, authReads = 0;
    const rawSave = plugin.saveData, rawStrict = plugin.loadDataStrict, rawLoad = plugin.loadData;
    plugin.saveData = async (key, value) => { saves.push(key); await rawSave(key, value); if (saveHook) saveHook(key); };
    plugin.loadDataStrict = async key => { if (strictHook) return strictHook(key, () => rawStrict(key)); return rawStrict(key); };
    plugin.loadData = async key => { if (key === "weread_auth_settings") authReads++; return rawLoad(key); };
    const note = load("src/utils/weread/api/ensureExistingBookNoteDocument.ts"), originalNote = note.ensureExistingBookNoteDocument;
    note.ensureExistingBookNoteDocument = async (...args) => { if (injected) throw injected; return originalNote(...args); };
    mock("src/utils/settings/wereadApiKeyCrypto.ts", {
        isEncryptedWereadApiKey: value => value === "fixture-encrypted",
        decryptWereadApiKey: () => { if (decryptFails) throw Error("Synthetic decrypt failure"); return "fixture-key"; },
        encryptWereadApiKey: () => "fixture-encrypted",
    });
    mock("src/utils/settings/wereadDeviceSettingsService.ts", { WEREAD_DEVICE_SETTINGS_CHANGED_EVENT: "synthetic-device-change", loadWereadDeviceSettings: () => ({ autoSync: enabled }), saveWereadDeviceSettings() {} });
    mock("src/utils/weread/api/buildWereadApiNotebookCache.ts", { buildWereadApiNotebookCache: async () => { if (networkFail) throw Error("Synthetic preparation failure"); return structuredClone(rawNotebooks.books); } });
    mock("src/utils/weread/api/confirmWereadSyncPlan.ts", { confirmWereadSyncPlan: async () => { throw Error("Unexpected confirmation"); } });
    const normal = load("src/utils/weread/api/syncWereadApiNormalBooks.ts"), originalPlan = normal.planWereadApiNormalBooks;
    normal.planWereadApiNormalBooks = async (...args) => { const plan = await originalPlan(...args); planning.push(structuredClone(plan.items)); return plan; };
    const handler = load("src/utils/weread/api/handleWereadApiNewSources.ts"), originalCommit = handler.commitWereadNewSources;
    handler.commitWereadNewSources = async (...args) => { const result = await originalCommit(...args); commits.push(result); return result; };
    const originalDialog = mocks.get(path.join(root, "src/libs/dialog.ts")).svelteDialog;
    mocks.get(path.join(root, "src/libs/dialog.ts")).svelteDialog = options => {
        const dialog = originalDialog(options);
        setImmediate(() => {
            const selected = dialogProps.books.filter(book => book.bookID === "A"), ignored = dialogProps.books.filter(book => book.bookID === "D");
            if (choice === "ignore") dialogProps.onConfirm([], selected, []);
            else dialogProps.onConfirm(choice === "isbn" ? selected : [], choice === "mixed" ? ignored : [], choice === "bookID" || choice === "mixed" ? selected : []);
        });
        return dialog;
    };
    const { runWereadApiSyncTask: task } = load("src/utils/weread/api/runWereadApiSyncTask.ts");
    const { loadIgnoredBooks, saveIgnoredBooks, replaceIgnoredBooks, loadIgnoredBooksStateStrict } = historyTools;
    const run = () => task(plugin, "update", { trigger: "manual", confirmPlan: async payload => {
        assert.equal(saves.length, 0); assert.equal(writes.length, 0); assert.equal(claims.length, 0); assert.equal(created.length, 0);
        plans.push(payload); if (confirmHook) confirmHook(); return approve;
    } });
    function setup() {
        reset(); saves = []; plans = []; commits = []; planning = []; choice = "bookID"; approve = true; injected = undefined; networkFail = false; confirmHook = undefined; saveHook = undefined; strictHook = undefined; decryptFails = false; enabled = true; autoCalls = 0; realAuto = false; authReads = 0;
        storage.weread_templates = "template"; storage.weread_auth_settings = { apiKeyEncrypted: "fixture-encrypted", verified: true };
        storage[IGNORED] = [{ syncID: "O", title: "Original", metadata: { preserve: [1, 2] } }];
        rawNotebooks = { books: [{ ...source("A", ISBN_A, "Synthetic A"), pendingImport: true }, source("B", "", "Synthetic B"), source("C", "", "Synthetic C"), source("O", "", "Synthetic O")] };
        storage.temporary_weread_notebooksList = structuredClone(rawNotebooks.books);
        row("", ISBN_A, "doc-a", "Synthetic local"); row("B", "", "doc-b", "Synthetic B"); row("C", "", "doc-c", "Synthetic C"); row("O", "", "doc-o", "Synthetic O");
        bookInfos.set("A", detail("A", ISBN_A)); doubanBooks.set(ISBN_A, douban(ISBN_A, "Synthetic local", ""));
    }
    const noWrites = () => { assert.equal(saves.length, 0); assert.equal(writes.length, 0); assert.equal(claims.length, 0); assert.equal(created.length, 0); assert.equal(removals.length, 0); };
    let count = 0;
    async function test(name, fn) { await fn(); console.log(`PASS ${++count}: ${name}`); }

    await test("K missing file and empty array are readable, but distinct snapshots", async () => {
        setup(); delete storage[IGNORED]; assert.deepEqual(await loadIgnoredBooks(plugin), []); const missing = await loadIgnoredBooksStateStrict(plugin);
        storage[IGNORED] = []; assert.deepEqual(await loadIgnoredBooks(plugin), []); const empty = await loadIgnoredBooksStateStrict(plugin);
        assert.equal(missing.exists, false); assert.equal(empty.exists, true); noWrites();
    });
    await test("K historical aliases, numeric identities, ordering and unknown metadata read without migration", async () => {
        setup(); storage[IGNORED] = [{ bookId: 123, metadata: { extra: true } }, { syncID: "legacy", bookID: "legacy", sourceType: "weread_book", extra: [1] }];
        const before = structuredClone(storage[IGNORED]); assert.deepEqual(await loadIgnoredBooks(plugin), before); assert.deepEqual(storage[IGNORED], before); noWrites();
    });
    const bad = [null, {}, "unknown", [{ title: "missing" }], [{ bookID: "A", syncID: "B" }], [{ bookID: "A" }, { bookId: "A" }], [{ bookID: false }], [{ bookID: "MP_WXS_A", sourceType: "weread_book" }]];
    for (let i = 0; i < bad.length; i++) await test(`K unsupported storage/identity ${i + 1} rejects reads, merge and replace`, async () => {
        setup(); storage[IGNORED] = structuredClone(bad[i]); const before = structuredClone(storage[IGNORED]);
        await assert.rejects(() => loadIgnoredBooks(plugin)); await assert.rejects(() => saveIgnoredBooks(plugin, [{ bookID: "NEW" }])); await assert.rejects(() => replaceIgnoredBooks(plugin, []));
        assert.deepEqual(storage[IGNORED], before); noWrites();
    });
    for (const mode of ["json", "transport"]) await test(`K ${mode} error is not absence and cannot write`, async () => {
        setup(); strictHook = async (key, next) => { if (key === IGNORED) throw Error(mode === "json" ? "插件存储 JSON 格式无效" : "Synthetic denied/network failure"); return next(); };
        await assert.rejects(() => loadIgnoredBooks(plugin)); await assert.rejects(() => saveIgnoredBooks(plugin, [])); noWrites();
    });
    await test("K recheck detects storage corruption immediately before writing", async () => {
        setup(); let reads = 0; strictHook = async (key, next) => { if (key === IGNORED && ++reads === 2) storage[IGNORED] = null; return next(); };
        await assert.rejects(() => saveIgnoredBooks(plugin, [{ bookID: "NEW" }])); assert.equal(storage[IGNORED], null); noWrites();
    });
    await test("K existing ignored metadata wins; repeats do not duplicate or rewrite records", async () => {
        setup(); const old = structuredClone(storage[IGNORED][0]); await saveIgnoredBooks(plugin, [{ bookID: "O", title: "Different" }, { bookID: "NEW", extra: true }]);
        assert.deepEqual(storage[IGNORED], [old, { bookID: "NEW", extra: true }]); assert.equal(saves.length, 1);
        await saveIgnoredBooks(plugin, [{ bookId: "O", title: "Again" }]); assert.equal(saves.length, 1);
        await replaceIgnoredBooks(plugin, [old]); assert.deepEqual(storage[IGNORED], [old]); assert.equal(saves.length, 2);
    });
    await test("K invalid incoming or replacement records never drop bad records and save the rest", async () => {
        for (const value of bad) { setup(); await assert.rejects(() => saveIgnoredBooks(plugin, value)); await assert.rejects(() => replaceIgnoredBooks(plugin, value)); noWrites(); }
    });
    for (const mode of ["noop", "uncertain", "readback"]) await test(`K ${mode} returns failure with one write attempt`, async () => {
        setup(); const save = plugin.saveData;
        plugin.saveData = async (key, value) => { saves.push(key); if (mode !== "noop") await rawSave(key, value); if (mode === "uncertain") throw Error("Synthetic uncertain request"); if (mode === "readback") strictHook = async () => { throw Error("Synthetic read failure"); }; };
        try { await assert.rejects(() => saveIgnoredBooks(plugin, [{ bookID: "NEW" }])); assert.equal(saves.length, 1); } finally { plugin.saveData = save; }
    });
    await test("K real detection/preflight/ordinary and MP planning all refuse damaged ignored state", async () => {
        const mpPreflight = load("src/utils/weread/api/preflightWereadApiMpSync.ts").preflightWereadApiMpSync;
        const mpPlan = load("src/utils/weread/api/syncWereadApiMpAccounts.ts").planWereadApiMpAccounts;
        for (const operation of [() => detect(plugin), () => preflight(plugin), () => mpPreflight(plugin), () => originalPlan(plugin, "template", { mode: "update" }), () => mpPlan(plugin, "template", { mode: "update" }), () => run()]) {
            setup(); storage[IGNORED] = {}; await assert.rejects(operation); noWrites();
        }
    });
    await test("K ignore choices reach actual in-memory planners; old ignored sources never become updates; cancel is zero-write", async () => {
        setup(); choice = "ignore"; approve = false; const before = structuredClone(storage);
        const result = await run(); assert.equal(result.status, "cancelled");
        for (const id of ["A", "O"]) assert.equal(planning[0].find(item => item.bookID === id).status, "skipped_ignored");
        assert.deepEqual(plans[0].plannedItems.filter(item => item.action === "update").map(item => item.bookID).sort(), ["B", "C"]);
        assert.equal(plans[0].plannedItems.find(item => item.bookID === "A").action, "ignore"); assert.deepEqual(storage, before); noWrites();
    });
    await test("K actual planning supports a native-style Plugin with no loadDataStrict method", async () => {
        setup(); choice = "ignore"; approve = false; const originalFetch = global.fetch;
        global.fetch = async (url, options) => { assert.equal(url, "/api/file/getFile"); const key = JSON.parse(options.body).path.split("/").at(-1); return Object.hasOwn(storage, key) ? new Response(JSON.stringify(storage[key]), { status: 200 }) : new Response('{"code":404}', { status: 202 }); };
        try { const result = await task({ ...plugin, loadDataStrict: undefined }, "update", { trigger: "manual", confirmPlan: async () => false }); assert.equal(result.status, "cancelled"); assert.equal(planning[0].find(item => item.bookID === "A").status, "skipped_ignored"); noWrites(); }
        finally { global.fetch = originalFetch; }
    });
    await test("K first-use missing ignored storage does not prevent the normal 1 import + 2 updates plan", async () => {
        setup(); delete storage[IGNORED]; rawNotebooks.books = rawNotebooks.books.filter(item => item.bookID !== "O"); storage.temporary_weread_notebooksList = structuredClone(rawNotebooks.books); approve = false;
        await run(); assert.equal(plans[0].plannedItems.filter(item => item.action.startsWith("import_")).length, 1); assert.equal(plans[0].plannedItems.filter(item => item.action === "update").length, 2); noWrites();
    });
    await test("K confirmation-time ignored drift fails before any business writes", async () => {
        setup(); choice = "ignore"; confirmHook = () => storage[IGNORED].push({ bookID: "CONCURRENT" }); await assert.rejects(run); noWrites(); assert.equal(storage[IGNORED].length, 2);
    });
    await test("K post-confirmation ignore drift preserves newer data, reports partial writes and continues approved updates", async () => {
        setup(); choice = "mixed"; rawNotebooks.books.push(source("D", "", "Synthetic D")); storage.temporary_weread_notebooksList = structuredClone(rawNotebooks.books);
        saveHook = key => { if (key === "temporary_weread_notebooksList") { saveHook = undefined; storage[IGNORED].push({ bookID: "CONCURRENT", extra: true }); } };
        const result = await run(); assert.equal(result.status, "failed"); assert.ok(claims.length > 0); assert.ok(storage[IGNORED].some(item => item.bookID === "CONCURRENT")); assert.ok(!saves.includes(IGNORED));
        const failure = commits[0].failed.find(item => item.bookID === "D"); assert.match(failure.message, /部分写入/);
        assert.deepEqual(writes.filter(item => ["B", "C"].includes(item.bookID)).map(item => item.bookID).sort(), ["B", "C"]);
        assert.equal(writes.some(item => item.bookID === "D" || item.bookID === "O"), false); assert.equal(storage.weread_sync_reports[0].items.filter(item => item.bookID === "D" && item.status === "failed").length, 1);
    });
    await test("K sync and management share one storage lock", async () => {
        setup(); let release;
        const save = plugin.saveData; plugin.saveData = async (key, value) => { saves.push(key); await new Promise(resolve => release = resolve); await rawSave(key, value); };
        const guard = load("src/utils/weread/wereadManagementSaveGuard.ts"), snapshot = await guard.readWereadManagementSnapshot(plugin, IGNORED);
        try { const pending = saveIgnoredBooks(plugin, [{ bookID: "NEW" }]); await new Promise(setImmediate);
            assert.equal((await guard.saveWereadManagementData(plugin, IGNORED, snapshot, [])).status, "busy"); assert.equal(saves.length, 1); release(); await pending;
        } finally { plugin.saveData = save; }
    });
    await test("K legacy ignored-management entry reports strict read errors and never opens a writable dialog", async () => {
        const tabSource = fs.readFileSync(path.join(root, "src/components/tabs/WereadTab.svelte"), "utf8").match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
        const ast = ts.createSourceFile("tab.ts", tabSource, ts.ScriptTarget.Latest, true);
        const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createIgnoredBooksDialog");
        const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        let opened = 0, alerts = [];
        const entry = new Function("loadIgnoredBooks", "plugin", "showMessage", "i18nText", "i18n", "svelteDialog", "wereadIgnoredBooksDialog", js + "\nreturn createIgnoredBooksDialog;")(
            loadIgnoredBooks, plugin, text => alerts.push(text), (_key, fallback) => fallback, { showMessage13: "empty" }, () => { opened++; }, class {});
        for (const mode of ["invalid", "read-error", "missing"]) {
            setup(); opened = 0; alerts = [];
            if (mode === "invalid") storage[IGNORED] = {};
            if (mode === "read-error") strictHook = async () => { throw Error("Synthetic read failure"); };
            if (mode === "missing") delete storage[IGNORED];
            await entry(); assert.equal(opened, 0); assert.equal(alerts.length, 1); assert.equal(alerts[0] === "empty", mode === "missing"); noWrites();
        }
    });

    for (const [stage, reasonCode] of [["note.input", "DOCUMENT_BINDING_INVALID"], ["note.repair", "ROW_ID_CHANGED"], ["note.readback", "DOCUMENT_BINDING_READBACK_FAILED"]]) await test(`I ${stage} traverses actual add -> commit -> task -> persisted report exactly once`, async () => {
        setup(); injected = Object.assign(new Error("Synthetic document repair failure"), { stage, reasonCode, diagnostic: { private: "synthetic snapshot" } });
        const direct = await add(plugin, "av", detail("A", ISBN_A)); assert.deepEqual(direct.identityFailure, { stage, reasonCode }); assert.equal(direct.code, 1); assert.equal(direct.status, "conflict"); assert.equal(direct.diagnostic, undefined);
        const result = await run(); assert.equal(result.totalFailed, 1); assert.equal(storage.weread_sync_reports.length, 1);
        assert.deepEqual(commits[0].failed[0].identityFailure, { stage, reasonCode }); assert.equal(commits[0].successfulBookIDs.includes("A"), false);
        const failures = storage.weread_sync_reports[0].items.filter(item => item.bookID === "A" && item.status === "failed"); assert.equal(failures.length, 1); assert.equal(failures[0].reasonCode, "BOOK_IDENTITY_LINK_FAILED"); assert.ok(failures[0].reasonText.includes(`[${stage}/${reasonCode}]`)); assert.match(failures[0].reasonText, /部分写入/);
        assert.ok(!JSON.stringify(storage.weread_sync_reports).includes("synthetic snapshot")); assert.deepEqual(writes.map(item => item.bookID).sort(), ["B", "C"]); assert.equal(storage.temporary_weread_notebooksList.find(item => item.bookID === "A").pendingImport, true);
    });
    for (const text of ["Plain repair error", "Synthetic [note.readback/DOCUMENT_BINDING_READBACK_FAILED]"]) await test("I plain errors and textual markers never invent structured diagnostics", async () => {
        setup(); injected = new Error(text); const direct = await add(plugin, "av", detail("A", ISBN_A)); assert.equal(direct.identityFailure, undefined);
        await run(); assert.equal(commits[0].failed[0].identityFailure, undefined); assert.equal(storage.weread_sync_reports[0].items.find(item => item.bookID === "A").reasonCode, "UNKNOWN_ERROR");
    });

    const originalWindow = global.window;
    global.window = { siyuan: { config: { sync: { enabled: false } } }, addEventListener() {}, removeEventListener() {} };
    const autoImpl = load("src/utils/weread/api/autoSyncWereadApi.ts").autoSyncWereadApi;
    mock("src/utils/weread/api/autoSyncWereadApi.ts", { autoSyncWereadApi: async (...args) => { autoCalls++; return realAuto ? autoImpl(...args) : { status: "cancelled", normalResult: { items: [] }, totalPlanned: 0, totalSuccess: 0, totalFailed: 0 }; } });
    mock("src/components/common/WereadManualSyncModeDialog.svelte", { __esModule: true, default: class {} });
    const { WereadAutoSyncCoordinator: Coordinator, WEREAD_AUTO_SYNC_AFTER_SIYUAN_DELAY_MS: delay } = load("src/utils/weread/api/wereadAutoSyncCoordinator.ts");
    const events = new Map();
    const coordinator = () => { const c = new Coordinator({ ...plugin, eventBus: { on: (name, handler) => events.set(name, handler), off: name => events.delete(name) } }); c.layoutReady = true; return c; };
    try {
        for (const mode of ["plaintext", "residual", "decrypt-error"]) await test(`G coordinator ${mode} precheck never saves or migrates auth`, async () => {
            setup(); storage.weread_auth_settings = { apiKey: "fixture-key", verified: true, ...(mode === "plaintext" ? {} : { apiKeyEncrypted: "fixture-encrypted" }) }; decryptFails = mode === "decrypt-error";
            const before = structuredClone(storage.weread_auth_settings), c = coordinator(); await c.runAutoSync(); c.destroy();
            assert.ok(authReads > 0); assert.equal(autoCalls, decryptFails ? 0 : 1); assert.deepEqual(storage.weread_auth_settings, before); noWrites();
        });
        for (const mode of ["disabled", "syncing", "unknown-sync", "not-ready"]) await test(`G ${mode} skips authorization writes and task execution`, async () => {
            setup(); const c = coordinator(); if (mode === "disabled") enabled = false; if (mode === "syncing") c.siyuanSyncInProgress = true;
            if (mode === "unknown-sync") global.window.siyuan.config.sync = {}; if (mode === "not-ready") global.window.siyuan.config.sync = { enabled: true, mode: 1 };
            await c.runAutoSync(); c.destroy(); global.window.siyuan.config.sync = { enabled: false }; assert.equal(autoCalls, 0); assert.equal(authReads, 0); noWrites();
        });
        await test("G actual unified task preparation failure leaves legacy auth unchanged", async () => {
            setup(); storage.weread_auth_settings = { apiKey: "fixture-key", verified: true }; const before = structuredClone(storage.weread_auth_settings); realAuto = true; networkFail = true;
            const c = coordinator(); await c.runAutoSync(); c.destroy(); assert.equal(autoCalls, 1); assert.deepEqual(storage.weread_auth_settings, before); noWrites();
        });
        await test("G explicit verification still persists encrypted authorization", async () => {
            setup(); const auth = load("src/utils/weread/api/wereadApiAuth.ts"), old = auth.validateWereadApiKey; auth.validateWereadApiKey = async () => ({ success: true, verifiedAt: 123 });
            try { const result = await load("src/utils/settings/wereadSettingsService.ts").verifyAndSaveWereadApiKey(plugin, "fixture-key"); assert.equal(result.verified, true); assert.equal(storage.weread_auth_settings.apiKey, ""); assert.equal(storage.weread_auth_settings.apiKeyEncrypted, "fixture-encrypted"); assert.deepEqual(saves, ["weread_auth_settings"]); } finally { auth.validateWereadApiKey = old; }
        });
        await test("G coordinator single-run and process-wide sync lock remain effective", async () => {
            setup(); const c = coordinator(); await Promise.all([c.runAutoSync(), c.runAutoSync()]); await c.runAutoSync(); c.destroy(); assert.equal(autoCalls, 1); noWrites();
            setup(); let finish; const lock = load("src/utils/weread/api/wereadSyncRunGuard.ts").tryRunWereadSync("manual", () => new Promise(resolve => finish = resolve));
            const blocked = coordinator(); await blocked.runAutoSync(); blocked.destroy(); assert.equal(authReads, 0); assert.equal(autoCalls, 0); noWrites(); finish(); await lock;
        });
        await test("G real scheduler retains delay, sync-start cancellation and destroy cleanup", async () => {
            setup(); const timers = new Map(); let serial = 0; const set = global.setTimeout, clear = global.clearTimeout;
            global.setTimeout = (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }; global.clearTimeout = id => timers.delete(id);
            try { const c = coordinator(); c.scheduleAutoSyncIfReady(); assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, delay); assert.equal(delay, 5000);
                events.get("sync-start")({}); assert.equal(timers.size, 0); events.get("sync-end")({}); assert.equal(timers.size, 1); c.destroy(); assert.equal(timers.size, 0); assert.equal(events.size, 0); noWrites();
            } finally { global.setTimeout = set; global.clearTimeout = clear; }
        });
    } finally { global.window = originalWindow; }
    console.log(`WeRead stabilization blockers: ${count} scenarios passed (actual production chains, synthetic I/O; no live sync or deployment).`);
}
new Function("require", "__dirname", existing.slice(0, boundary) + "\nreturn (" + scenarios.toString() + ")();")(require, __dirname).catch(error => { console.error(error); process.exitCode = 1; });
