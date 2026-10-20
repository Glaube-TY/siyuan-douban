// Real task orchestration, planners, imports and migration code; all external I/O is mocked.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
// Reuse the identity smoke's kernel fixtures rather than maintain a second fake SiYuan schema.
const identitySmoke = fs.readFileSync(path.join(__dirname, "smoke_weread_book_identity.cjs"), "utf8");
const boundary = identitySmoke.indexOf("(async () => {");
assert(boundary > 0);
const fixtures = identitySmoke.slice(0, boundary);

async function scenarios() {
    let saves = [], mutations = [], planCalls = [], reports = [], selectedIDs = ["A"], choice = "isbn", decision = false, drift, fetchISBN = false, networkFail = false;
    let accepted = false;
    let afterApproval, mpDrift;
    const originalSave = plugin.saveData;
    plugin.saveData = async (key, value) => {
        saves.push(key); await originalSave(key, value);
        if (accepted && afterApproval && key === "temporary_weread_notebooksList") { const callback = afterApproval; afterApproval = undefined; callback(); }
    };
    const api = mocks.get(path.join(root, "src/api.ts"));
    for (const name of ["addAttributeViewKey", "addAttributeViewKeyStrict", "appendAttributeViewDetachedBlocksWithValues", "createDocWithMd", "setBlockAttrs", "setAttributeViewBlockAttr", "setAttributeViewBlockAttrStrict", "removeAttributeViewBlocks"]) {
        const original = api[name]; api[name] = async (...args) => { mutations.push(name); return original(...args); };
    }
    mock("src/utils/settings/wereadApiKeyCrypto.ts", {
        isEncryptedWereadApiKey: value => value === "fixture-encrypted",
        decryptWereadApiKey: () => "fixture-key", encryptWereadApiKey: () => "fixture-encrypted",
    });
    mock("src/utils/weread/api/buildWereadApiNotebookCache.ts", { buildWereadApiNotebookCache: async () => {
        if (networkFail) throw new Error("Fixture network failure");
        return structuredClone(rawNotebooks.books);
    } });
    mock("src/utils/weread/api/confirmWereadSyncPlan.ts", { confirmWereadSyncPlan: async (_plugin, payload) => confirmPlan(payload) });
    mock("src/utils/storage/readingStorage.ts", {
        getWereadSourceKey: (type, id) => (type === "mp" ? "weread-mp:" : "weread-book:") + id,
        appendWereadSyncReport: async (_plugin, report) => { reports.push(report); await plugin.saveData("fixture_report", report); },
        upsertReadingBookStatus: async (_plugin, status) => plugin.saveData("fixture_reading_status", status),
    });
    Object.assign(mocks.get(path.join(root, "src/utils/weread/addWereadMpAccounts.ts")), { ensureMpAccountInDatabase: async (_plugin, _av, record) => {
        mutations.push("ensureMp"); row(record.rawBookID, "", "doc-mp", record.accountTitle); return { code: 0 };
    } });
    Object.assign(mocks.get(path.join(root, "src/utils/weread/api/buildWereadApiMpAccountSyncData.ts")), { buildWereadApiMpAccountSyncData: async (_key, id) => {
        if (mpDrift) { const callback = mpDrift; mpDrift = undefined; callback(); }
        return { rawBookID: id, accountInfo: { accountTitle: "MP", accountIntro: "", accountCover: "" }, articleUnits: [], articleCount: 1, noteCount: 1 };
    } });
    mock("src/utils/weread/incremental/buildMpRenderModel.ts", { buildWereadMpRenderModel: ({ template, syncData }) => ({ template, bookID: syncData.rawBookID, items: [], stats: { noteCount: 1 } }) });
    mock("src/utils/weread/incremental/syncMpIncremental.ts", { syncWereadMpIncremental: async ({ docBlockID, model }) => {
        writes.push({ bookID: model.bookID, docBlockID }); return { sourceIndex: {}, stats: { added: 1, changed: 0, deleted: 0, unchanged: 0, blockOperationCount: 1, rebuilt: false } };
    } });
    mock("src/utils/readingCenter/readingAnnotationArchiveBuilder.ts", { buildNormalBookAnnotationSource: x => x, buildMpAnnotationSource: x => x });
    mock("src/utils/storage/readingInboxDiff.ts", { recordNormalBookInboxDiff: async () => ({}), recordMpAccountInboxDiff: async () => ({}) });
    const originalDialog = mocks.get(path.join(root, "src/libs/dialog.ts")).svelteDialog;
    Object.assign(mocks.get(path.join(root, "src/libs/dialog.ts")), { svelteDialog: options => {
        const dialog = originalDialog(options);
        setImmediate(async () => {
            try {
                if (fetchISBN) Object.assign(dialogProps.books.find(book => book.bookID === "A"), await dialogProps.onFetchISBN("A"));
                const selection = dialogProps.books.filter(book => selectedIDs.includes(book.bookID));
                if (choice === "cancel-first") dialogProps.onCancel();
                else if (choice === "ignore") await dialogProps.onContinue(selection);
                else await dialogProps.onConfirm(choice === "isbn" ? selection : [], [], choice === "bookID" ? selection : []);
            } catch (error) { console.error(error); process.exitCode = 1; }
        });
        return dialog;
    } });
    const { runWorkbenchManualWereadApiSync: manual } = load("src/utils/weread/api/workbenchManualSyncWereadApi.ts");
    const { autoSyncWereadApi: auto } = load("src/utils/weread/api/autoSyncWereadApi.ts");
    const settings = load("src/utils/settings/wereadSettingsService.ts");
    const confirmPlan = async payload => {
        assert.equal(saves.length, 0, "Final preview must precede every saveData");
        assert.equal(mutations.length, 0, "Final preview must precede every database write");
        assert.equal(created.length, 0); assert.equal(writes.length, 0); assert.equal(reports.length, 0);
        planCalls.push(structuredClone(payload));
        if (drift) drift();
        accepted = decision;
        return decision;
    };
    function setup() {
        reset(); saves = []; mutations = []; planCalls = []; reports = []; selectedIDs = ["A"]; choice = "isbn"; decision = false; drift = undefined; fetchISBN = false; networkFail = false; accepted = false;
        afterApproval = undefined; mpDrift = undefined;
        storage.weread_templates = "template";
        storage.weread_auth_settings = { apiKey: "fixture-key", verified: true };
        // Legacy custom ISBN migration must also wait for final approval.
        storage.weread_customBooksISBN = { OLD: { customISBN: ISBN_B, title: "old" } };
        rawNotebooks = { books: [source("A", ISBN_A, "A"), source("B", ISBN_B, "B")] };
        storage.temporary_weread_notebooksList = structuredClone(rawNotebooks.books);
        doubanBooks.set(ISBN_A, douban(ISBN_A, "A", "subtitle")); doubanBooks.set(ISBN_B, douban(ISBN_B, "B", ""));
        bookInfos.set("A", detail("A", ISBN_A)); bookInfos.set("B", detail("B", ISBN_B));
    }
    const run = () => manual(plugin, "update", { confirmPlan });
    const persistent = () => structuredClone({ storage, keyValues, docs: [...docs], children: [...children], attrs: [...docAttrs] });
    function zero(before) {
        assert.deepEqual(persistent(), before);
        assert.equal(saves.length, 0); assert.equal(mutations.length, 0); assert.equal(created.length, 0); assert.equal(writes.length, 0); assert.equal(reports.length, 0);
    }
    const { buildWereadSyncPlanSkipBreakdown: skipCounts } = load("src/utils/weread/api/wereadApprovedSyncPlan.ts");
    const skip = (bookID, status) => ({ bookID, status });
    const syntheticSkips = [skip("same", "skipped_unchanged"), skip("same", "skipped_unchanged"), skip("disabled", "skipped_ignored"), skip("waiting", "skipped_not_ready"), skip("new", "skipped_not_ready"), skip("chosen-ignore", "skipped_ignored"), skip("updating", "skipped_unchanged"), skip("cross", "skipped_mp"), skip("unknown", "unknown"), skip("conflict", "skipped_not_ready"), skip("conflict", "skipped_unchanged")];
    const syntheticMp = [skip("same", "skipped_unchanged"), skip("same", "skipped_unchanged"), skip("waiting", "skipped_ignored"), skip("mp-waiting", "skipped_not_ready"), skip("new-mp", "skipped_ignored"), skip("cross", "skipped_normal_book")];
    const newSources = [{ bookID: "new", sourceType: "weread_book" }, { bookID: "new-mp", sourceType: "weread_mp_account" }];
    const planned = [{ bookID: "chosen-ignore", sourceType: "book", action: "ignore" }, { bookID: "updating", sourceType: "book", action: "update" }];
    const unchangedInputs = JSON.stringify([syntheticSkips, syntheticMp, newSources, planned]);
    assert.deepEqual(skipCounts(syntheticSkips, syntheticMp, newSources, planned), { unchanged: 2, notReady: 2, ignored: 2 });
    assert.equal(JSON.stringify([syntheticSkips, syntheticMp, newSources, planned]), unchangedInputs);
    assert.deepEqual(skipCounts([skip("odd", "unknown"), skip("odd", "skipped_ignored")], [], [], []), { unchanged: 0, notReady: 0, ignored: 0 });
    console.log("Skip classification PASS: composite keys, duplicates, cross-type exclusions, new/import/update/ignore exclusions, unknown and conflicting states, read-only inputs");

    // Execute the actual Svelte template/reactive bindings with its SSR compiler, not source-text matches.
    const componentSource = fs.readFileSync(path.join(root, "src/components/common/WereadSyncPlanConfirmDialog.svelte"), "utf8");
    const componentJs = require("svelte/compiler").compile(componentSource.replace(/<script lang="ts">([\s\S]*?)<\/script>/, (_, script) => "<script>" + ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText + "</script>"), { generate: "ssr", filename: "WereadSyncPlanConfirmDialog.svelte" }).js.code;
    const componentModule = { exports: {} };
    new Function("require", "module", "exports", ts.transpileModule(componentJs, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(name => name === "../../utils/i18n" ? load("src/utils/i18n.ts") : require(name), componentModule, componentModule.exports);
    const dictionaries = Object.fromEntries(["zh_CN", "en_US"].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(root, "public/i18n/" + locale + ".json"), "utf8"))]));
    const renderedRows = (payload, locale = "zh_CN") => {
        const html = componentModule.exports.default.render({ plugin: { i18n: dictionaries[locale] }, payload, onConfirm() {}, onCancel() {} }).html;
        return new Map([...html.matchAll(/<div class="info-row[^"]*">([\s\S]*?)<\/div>/g)].map(([, row]) => [...row.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(([, text]) => text.replace(/<[^>]*>/g, "").trim())));
    };
    for (const locale of ["zh_CN", "en_US"]) {
        const d = dictionaries[locale], payload = { mode: "update", sourceType: "mixed", title: "Synthetic", plannedItems: [{ bookID: "A", title: "A", sourceType: "book", action: "import_isbn" }, { bookID: "B", title: "B", sourceType: "book", action: "update" }, { bookID: "C", title: "C", sourceType: "mp", action: "update" }, { bookID: "D", title: "D", sourceType: "book", action: "ignore" }], skipBreakdown: { unchanged: 2, notReady: 1, ignored: 1 }, skippedCount: 4 };
        const itemCount = n => d.planItemCount.replace("{count}", n), rows = renderedRows(payload, locale);
        assert.equal(rows.get(d.planWillSync), itemCount(3)); assert.equal(rows.get(d.planNewImports), itemCount(1)); assert.equal(rows.get(d.planExistingUpdates), itemCount(2)); assert.equal(rows.get(d.planIgnoreSources), itemCount(1));
        assert.equal(rows.get(d.planSkippedUnchanged), itemCount(2)); assert.equal(rows.get(d.planSkippedNotReady), itemCount(1)); assert.equal(rows.get(d.planSkippedIgnored), itemCount(1)); assert.equal(rows.has(d.planSkipped), false);
        const zeroRows = renderedRows({ ...payload, skipBreakdown: { unchanged: 0, notReady: 0, ignored: 0 }, skippedCount: 9 }, locale);
        for (const key of ["planSkipped", "planSkippedUnchanged", "planSkippedNotReady", "planSkippedIgnored"]) assert.equal(zeroRows.has(d[key]), false);
        const oneRow = renderedRows({ ...payload, skipBreakdown: { unchanged: 0, notReady: 1, ignored: 0 } }, locale);
        assert.equal(oneRow.has(d.planSkippedUnchanged), false); assert.equal(oneRow.has(d.planSkippedIgnored), false); assert.equal(oneRow.get(d.planSkippedNotReady), itemCount(1));
        const legacy = renderedRows({ ...payload, skipBreakdown: undefined, skippedCount: 5 }, locale);
        assert.equal(legacy.get(d.planSkipped), d.planSkippedCount.replace("{count}", "5"));
        for (const key of ["planSkippedUnchanged", "planSkippedNotReady", "planSkippedIgnored"]) assert.equal(legacy.has(d[key]), false);
        assert.equal(renderedRows({ ...payload, skipBreakdown: undefined, skippedCount: 0 }, locale).has(d.planSkipped), false);
    }
    console.log("Svelte bindings PASS: bilingual import=1/update=2/sync=3 with ignore excluded, each skip category, zero suppression and neutral legacy payload");

    setup(); choice = "ignore"; const ignoreBefore = persistent(); assert.equal((await run()).status, "cancelled"); zero(ignoreBefore);
    assert.deepEqual(planCalls[0].skipBreakdown, { unchanged: 0, notReady: 0, ignored: 0 }); assert.equal(planCalls[0].skippedCount, 0);
    assert.equal(renderedRows(planCalls[0]).get(dictionaries.zh_CN.planWillSync), "0 项"); assert.equal(renderedRows(planCalls[0]).get(dictionaries.zh_CN.planIgnoreSources), "1 项");
    setup(); const singleBefore = persistent(); assert.equal((await run()).status, "cancelled"); zero(singleBefore);
    assert.equal(renderedRows(planCalls[0]).get(dictionaries.zh_CN.planNewImports), "1 项"); assert.equal(renderedRows(planCalls[0]).get(dictionaries.zh_CN.planExistingUpdates), "0 项");
    assert.deepEqual(planCalls[0].skipBreakdown, { unchanged: 0, notReady: 0, ignored: 0 });

    setup();
    const planHash = load("src/utils/weread/incremental/hash.ts").hashText;
    storage.weread_notebooks = []; storage.weread_note_unit_block_index_v1 = { schemaVersion: 1, sources: {} };
    for (const id of ["stable-one", "stable-two"]) {
        row(id, "", "doc-" + id, id); const book = source(id, "", id); rawNotebooks.books.push(book); storage.weread_notebooks.push({ ...book, blockID: "doc-" + id });
        storage.weread_note_unit_block_index_v1.sources["book:" + id] = { docBlockID: "doc-" + id, positionMarkBlockID: "mark-" + id, templateHash: planHash("template"), items: { note: { blockIds: ["note-" + id] } } };
        children.set("doc-" + id, [{ id: "mark-" + id }, { id: "note-" + id }]);
    }
    row("disabled-old", "", "doc-disabled", "disabled-old"); rawNotebooks.books.push(source("disabled-old", "", "disabled-old")); storage.weread_ignoredBooks = [{ bookID: "disabled-old", title: "disabled-old" }];
    const skipBefore = persistent(); assert.equal((await run()).status, "cancelled"); zero(skipBefore);
    assert.deepEqual(planCalls[0].skipBreakdown, { unchanged: 2, notReady: 0, ignored: 1 }); assert.equal(planCalls[0].skippedCount, 3);

    setup(); row("B", ISBN_B, "doc-b", "B");
    const normalPlanner = load("src/utils/weread/api/syncWereadApiNormalBooks.ts"), originalPlanner = normalPlanner.planWereadApiNormalBooks;
    // A temporary read-side loss after new-source inspection makes an existing source not ready.
    normalPlanner.planWereadApiNormalBooks = async (...args) => { docs.delete("doc-b"); try { return await originalPlanner(...args); } finally { docs.add("doc-b"); } };
    const notReadyBefore = persistent();
    try { assert.equal((await run()).status, "cancelled"); zero(notReadyBefore); assert.deepEqual(planCalls[0].skipBreakdown, { unchanged: 0, notReady: 1, ignored: 0 }); assert.equal(planCalls[0].skippedCount, 1); }
    finally { normalPlanner.planWereadApiNormalBooks = originalPlanner; }
    console.log("Task payload PASS: new import/ignore never double-count preflight skips; historical unchanged/ignored and existing not-ready are included; cancellation writes zero");

    setup(); const initial = persistent();
    assert.equal((await run()).status, "cancelled", JSON.stringify(messages)); zero(initial);
    assert.deepEqual((await detect(plugin)).newSources.map(book => book.bookID), ["A", "B"]); zero(initial);
    selectedIDs = ["B"]; assert.equal((await run()).status, "cancelled"); zero(initial);
    assert.deepEqual(planCalls.map(plan => plan.plannedItems.map(book => book.bookID)), [["A"], ["B"]]);
    console.log("A/B PASS: choose A/cancel, then B/cancel; zero saves, DB writes, documents, notes, reports; both remain new");
    await assert.rejects(commitWereadNewSources(plugin, "fixture-key", [source("A", ISBN_A)], [], [], [], new Map()), /状态已发生变化/);
    zero(initial);

    for (const option of ["isbn", "ignore", "bookID", "cancel-first"]) {
        setup(); choice = option; fetchISBN = option === "isbn"; rawNotebooks.books[0].isbn = ""; storage.temporary_weread_notebooksList[0].isbn = "";
        const before = persistent(); const output = await run(); assert.equal(output.status, "cancelled"); zero(before);
        assert.equal(infoRequests.length, option === "isbn" || option === "bookID" ? 1 : 0);
    }
    console.log("D/E/F PASS: on-demand ISBN, ignore and BookID choices remain memory-only on cancellation, including legacy auth/ISBN data");

    setup(); storage.weread_auth_settings.apiKeyEncrypted = "fixture-encrypted";
    const encryptedBefore = persistent(); assert.equal((await run()).status, "cancelled"); zero(encryptedBefore);
    setup(); const autoBefore = persistent();
    global.document = {};
    try { assert.equal((await auto(plugin)).status, "cancelled"); zero(autoBefore); }
    finally { delete global.document; }
    setup(); selectedIDs = []; choice = "ignore"; row("Z", "", "doc-z", "Z"); rawNotebooks.books.push(source("Z", "", "Z"));
    const continueBefore = persistent(); global.document = {};
    try { assert.equal((await auto(plugin)).status, "cancelled"); zero(continueBefore); assert.equal(planCalls.length, 1); }
    finally { delete global.document; }
    const { formatWereadApiAutoSyncResultSummary: autoSummary } = load("src/utils/weread/api/formatWereadApiSyncResult.ts");
    assert.equal(autoSummary({ status: "cancelled" }), "同步已取消");

    // Execute the actual tab event handler with the same task, rather than a source-text assertion.
    const tabScript = fs.readFileSync(path.join(root, "src/components/tabs/WereadTab.svelte"), "utf8").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    const tabAst = ts.createSourceFile("Tab.ts", tabScript, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const tabNode = tabAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "handleWereadApiManualSyncWithNewSourceDialog");
    const tabCode = ts.transpileModule(tabNode.getText(tabAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const tabRun = new Function("plugin", "runWorkbenchManualWereadApiSync", "handleSyncPlanConfirm", "handleSyncProgress", "openProgressDialog", "showMessage", "i18nText", "localizeKnownUiText", `let isSyncing = false, isPreparingWereadApiSync = false, wereadApiSyncPreparingMessage = ""; ${tabCode}; return handleWereadApiManualSyncWithNewSourceDialog;`)(plugin, manual, confirmPlan, () => {}, () => {}, () => {}, (_key, fallback) => fallback, (_plugin, message) => message);
    setup(); const tabBefore = persistent(); await tabRun("update"); zero(tabBefore);
    console.log("Entry points PASS: actual tab cancellation, interactive auto cancellation, encrypted-key cleanup and cancelled summaries preserve the zero-write boundary");

    setup(); decision = true;
    const imported = await run(); assert.equal(accepted, true); assert.equal(imported.status, "completed"); assert.equal(imported.totalSuccess, 1);
    assert.equal(created.length, 1); assert.equal(claims.length, 1); assert.equal(writes.length, 1); assert(saves.length > 0); assert.equal(reports.length, 1);
    assert.equal((await detect(plugin)).newSources.some(book => book.bookID === "A"), false);
    assert.equal(storage.weread_auth_settings.apiKey, ""); assert(Array.isArray(storage.weread_customBooksISBN)); assert(storage.weread_customBooksISBN_legacy_backup_v1);
    // Unselected B must not become a new or forced task in the next update.
    saves = []; mutations = []; planCalls = []; reports = []; created = []; writes = []; claims = []; selectedIDs = []; decision = true;
    for (let n = 0; n < 2; n++) { const output = await run(); assert.equal(output.status, "no_work"); assert.equal(output.normalResult.skippedUnchanged, 1); }
    assert.equal(saves.length, 0); assert.equal(mutations.length, 0); assert.equal(writes.length, 0); assert.deepEqual(infoRequests, []);
    console.log("C/J PASS: confirmed A imports once; migrations retain backup/encryption; two subsequent unchanged updates skip without fetching details");

    for (const legacyNull of [false, true]) {
        setup(); decision = true;
        if (legacyNull) storage.temporary_weread_notebooksList = null; else delete storage.temporary_weread_notebooksList;
        assert.equal((await run()).status, "completed"); assert(Array.isArray(storage.temporary_weread_notebooksList));
        assert.equal(storage.temporary_weread_notebooksList.find(book => book.bookID === "A").isbn, ISBN_A);
    }
    setup(); decision = true; fetchISBN = true; rawNotebooks.books[0].isbn = ""; storage.temporary_weread_notebooksList[0].isbn = "";
    assert.equal((await run()).status, "completed");
    assert(storage.weread_customBooksISBN.some(book => book.bookID === "A" && book.customISBN === ISBN_A));
    assert.deepEqual(infoRequests, ["A"]);
    setup(); choice = "ignore"; decision = true;
    assert.equal((await run()).status, "completed"); assert.deepEqual(storage.weread_ignoredBooks.map(book => book.bookID), ["A"]);
    assert.equal(created.length, 0); assert.equal(writes.length, 0); assert.deepEqual((await detect(plugin)).newSources.map(book => book.bookID), ["B"]);
    console.log("Commit persistence PASS: fresh/historical-null caches become canonical only after approval; fetched ISBN and ignore preferences persist only when approved");

    for (const approve of [false, true]) {
        setup(); rawNotebooks.books.push(source("Z", "", "existing"), { ...source("MP_WXS_1", "", "MP"), sourceType: "weread_mp_account" });
        storage.weread_mp_templates = "mp-template"; row("Z", "", "doc-z", "existing"); selectedIDs = ["A", "MP_WXS_1"]; decision = approve;
        const before = persistent(); const output = await run();
        assert.equal(planCalls.length, 1); assert.equal(planCalls[0].sourceType, "mixed");
        assert.deepEqual(new Set(planCalls[0].plannedItems.map(item => item.sourceType + ":" + item.bookID)), new Set(["book:A", "book:Z", "mp:MP_WXS_1"]));
        assert.equal(planCalls[0].plannedItems.filter(item => item.action.startsWith("import_")).length, 2);
        assert.equal(planCalls[0].plannedItems.filter(item => item.action === "update").length, 1);
        if (!approve) { assert.equal(output.status, "cancelled"); zero(before); }
        else { assert.equal(output.status, "completed"); assert.equal(output.totalSuccess, 3); assert.equal(planCalls.length, 1); }
    }
    console.log("G PASS: books and MP use one complete confirmation, separate import/update counts, no later confirmation");

    setup(); row("", ISBN_A, "historical-doc", "A"); choice = "cancel-first";
    const historical = persistent(); assert.equal((await run()).status, "cancelled"); zero(historical);
    assert.equal(docs.has("historical-doc"), true);
    console.log("H PASS: old prematurely created rows are inspected and preserved, never deleted or reset");

    setup(); networkFail = true; const beforeNetwork = persistent(); await assert.rejects(run(), /Fixture network failure/); zero(beforeNetwork);
    for (const change of [() => row("OTHER", ISBN_A, "new-owner", "A"), () => { storage.weread_templates = "other"; }, () => { keyValues[0].values[0].block.id = "other-doc"; }]) {
        setup(); decision = true; if (change.toString().includes("values[0]")) row("", ISBN_A, "old-doc", "A");
        // A bound historical ISBN row is classified as existing; there is still one final preview.
        drift = change; await assert.rejects(run(), /状态已发生变化/); assert(messages.some(message => /状态已发生变化/.test(message))); assert.equal(saves.length, 0); assert.equal(mutations.length, 0);
    }
    console.log("I PASS: network failure and identity/config/document drift reject before persistence");

    setup(); decision = true; rawNotebooks.books.push(source("Z", "", "Z"), source("Y", "", "Y"));
    row("Z", "", "doc-z", "Z"); row("Y", "", "doc-y", "Y");
    storage.weread_notebooks = [{ ...source("Y", "", "Y"), blockID: "doc-y" }];
    const hash = load("src/utils/weread/incremental/hash.ts").hashText;
    storage.weread_note_unit_block_index_v1 = { schemaVersion: 1, sources: { "book:Y": { docBlockID: "doc-y", positionMarkBlockID: "mark-y", templateHash: hash("template"), items: { note: { blockIds: ["note-y"] } } } } };
    children.set("doc-y", [{ id: "mark-y" }, { id: "note-y" }]);
    afterApproval = () => { storage.weread_notebooks[0].updatedTime = -1; };
    assert.equal((await run()).status, "completed");
    assert.deepEqual(new Set(writes.map(item => item.bookID)), new Set(["A", "Z"]));
    assert(reports.every(report => report.items.every(item => item.bookID !== "Y" && item.bookID !== "B")));

    setup(); selectedIDs = []; decision = true; storage.weread_mp_templates = "mp-template";
    rawNotebooks.books.push({ ...source("MP_WXS_1", "", "MP"), sourceType: "weread_mp_account" }); row("MP_WXS_1", "", "doc-mp", "MP");
    mpDrift = () => { docs.add("other-mp-doc"); keyValues[0].values.find(cell => cell.blockID === "doc-mp").block.id = "other-mp-doc"; };
    assert.equal((await run()).status, "failed"); assert.equal(writes.length, 0);
    console.log("Execution scope PASS: a rescan cannot add unapproved Y or write a changed MP target");

    for (const disappear of [false, true]) {
        setup(); selectedIDs = []; decision = true;
        row("A", ISBN_A, "doc-a", "A"); row("B", ISBN_B, "doc-b", "B");
        afterApproval = () => {
            if (disappear) storage.temporary_weread_notebooksList = storage.temporary_weread_notebooksList.filter(book => book.bookID !== "B");
            else docs.delete("doc-b");
        };
        const output = await run();
        assert.equal(output.status, "failed", "An approved source that becomes unavailable must not report full success");
        assert.equal(output.totalSuccess, 1); assert.equal(output.totalFailed, 1);
        assert.deepEqual(writes.map(item => item.bookID), ["A"]);
        assert.equal(output.normalResult.items.filter(item => item.bookID === "B").length, 1);
        assert.equal(output.normalResult.items.find(item => item.bookID === "B").status, "failed");
        assert(reports[0].items.some(item => item.bookID === "B" && item.status === "failed" && item.reasonText));
        assert.equal(reports[0].status, "partial_success");
    }
    console.log("Approved result completeness PASS: not-ready and missing sources remain explicit failures while ready sources continue");

    for (const approve of [false, true]) {
        setup(); decision = approve;
        row("B", ISBN_B, "doc-b", "B"); row("Z", "", "doc-z", "Z");
        rawNotebooks.books.push(source("Z", "", "Z"));
        const before = persistent(); const output = await run();
        const plan = planCalls[0];
        assert.deepEqual(plan.skipBreakdown, { unchanged: 0, notReady: 0, ignored: 0 }); assert.equal(plan.skippedCount, 0);
        const display = renderedRows(plan);
        assert.equal(display.get(dictionaries.zh_CN.planWillSync), "3 项"); assert.equal(display.get(dictionaries.zh_CN.planNewImports), "1 项"); assert.equal(display.get(dictionaries.zh_CN.planExistingUpdates), "2 项");
        assert.equal(plan.plannedItems.filter(item => item.action.startsWith("import_")).length, 1);
        assert.equal(plan.plannedItems.filter(item => item.action === "update").length, 2);
        assert.deepEqual(plan.plannedItems.filter(item => item.action.startsWith("import_")).map(item => item.bookID), ["A"]);
        if (!approve) { assert.equal(output.status, "cancelled"); zero(before); }
        else {
            assert.equal(output.status, "completed"); assert.equal(output.totalSuccess, 3);
            assert.deepEqual(new Set(writes.map(item => item.bookID)), new Set(["A", "B", "Z"]));
        }
    }
    console.log("Mixed plan PASS: one selected new book plus two existing updates stays import=1/update=2, one final approval, cancellation has zero writes");

    for (const kind of ["book", "mp"]) for (const change of ["ready", "missing", "not-ready", "target", "all-not-ready", "unchanged"]) {
        setup(); selectedIDs = []; decision = true;
        const ids = kind === "book" ? ["A", "B"] : ["MP_WXS_A", "MP_WXS_B"];
        const docIDs = ["doc-approved-a", "doc-approved-b"];
        if (kind === "mp") {
            storage.weread_mp_templates = "mp-template";
            rawNotebooks.books = ids.map(id => ({ ...source(id, "", id), sourceType: "weread_mp_account" }));
        }
        ids.forEach((id, i) => row(id, kind === "book" ? [ISBN_A, ISBN_B][i] : "", docIDs[i], id));
        afterApproval = () => {
            if (change === "missing") storage.temporary_weread_notebooksList = storage.temporary_weread_notebooksList.filter(book => book.bookID !== ids[1]);
            if (change === "not-ready" || change === "all-not-ready") docs.delete(docIDs[1]);
            if (change === "all-not-ready") docs.delete(docIDs[0]);
            if (change === "target") {
                docs.add("changed-target");
                keyValues[0].values.find(cell => cell.blockID === docIDs[1]).block.id = "changed-target";
            }
            if (change === "unchanged") {
                storage.weread_notebooks = rawNotebooks.books.map((book, i) => ({ ...book, blockID: docIDs[i] }));
                storage.weread_note_unit_block_index_v1 = { schemaVersion: 1, sources: Object.fromEntries(ids.map((id, i) => {
                    children.set(docIDs[i], [{ id: "mark-" + id }, { id: "note-" + id }]);
                    return [kind + ":" + id, { docBlockID: docIDs[i], positionMarkBlockID: "mark-" + id, templateHash: hash(kind === "book" ? "template" : "mp-template"), items: { note: { blockIds: ["note-" + id] } } }];
                })) };
            }
        };
        const output = await run();
        const result = kind === "book" ? output.normalResult : output.mpResult;
        assert.equal(planCalls.length, 1); assert.equal(planCalls[0].plannedItems.length, 2);
        assert.equal(result.items.length, 2, "Every approved source must have exactly one final result");
        assert.deepEqual(new Set(result.items.map(item => item.bookID)), new Set(ids));
        if (change === "ready") {
            assert.equal(output.status, "completed"); assert.equal(output.totalSuccess, 2); assert.equal(output.totalFailed, 0);
            assert.deepEqual(new Set(writes.map(item => item.bookID)), new Set(ids));
        } else if (change === "unchanged") {
            assert.equal(output.status, "completed"); assert.equal(output.totalFailed, 0);
            assert.equal(writes.length, 0); assert(result.items.every(item => item.status === "skipped_unchanged"));
        } else {
            const count = change === "all-not-ready" ? 2 : 1;
            assert.equal(output.status, "failed"); assert.equal(output.totalFailed, count);
            assert.equal(output.totalSuccess, 2 - count); assert.equal(output.totalPlanned, 2);
            assert.equal(writes.length, 2 - count); assert(writes.every(item => item.bookID === ids[0] && item.docBlockID === docIDs[0]));
            assert.equal(result.items.filter(item => item.status === "failed").length, count);
            assert.equal(result.skippedNotReady, 0, "Approved failures must not also count as skipped");
            assert(reports[0].items.filter(item => item.status === "failed").every(item => item.reasonText.includes("[plan.execution/")));
            assert.equal(reports[0].status, count === 2 ? "failed" : "partial_success");
        }
    }
    console.log("Approved A/B/F PASS: books and MP retain ready, missing, not-ready, changed-target and unchanged outcomes, including all-unavailable batches");

    setup(); decision = true;
    row("B", ISBN_B, "doc-b", "B"); row("Z", "", "doc-z", "Z");
    rawNotebooks.books.push(source("Z", "", "Z"));
    afterRender = () => { throw new Error("Fixture new import failure"); };
    const mixedFailure = await run();
    assert.equal(mixedFailure.status, "failed"); assert.equal(mixedFailure.totalFailed, 1); assert.equal(mixedFailure.totalSuccess, 2);
    assert.deepEqual(new Set(writes.map(item => item.bookID)), new Set(["B", "Z"]));
    assert.equal(storage.temporary_weread_notebooksList.find(book => book.bookID === "A").pendingImport, true);
    assert(reports[0].items.some(item => item.bookID === "A" && item.status === "failed"));
    assert.equal(reports[0].status, "partial_success");
    console.log("Approved E PASS: failed new import stays pending while two existing approved books update safely");

    setup(); selectedIDs = ["A", "B"]; choice = "bookID"; decision = true; bookInfos.delete("A");
    await assert.rejects(run()); assert.equal(saves.length, 0); assert.equal(mutations.length, 0);
    setup(); selectedIDs = ["A", "B"]; choice = "bookID"; decision = true;
    // Fail only A after its row/document creation, retaining real import/readback guards.
    afterRender = () => { throw new Error("Fixture render failure after creation"); };
    const partial = await run();
    assert.equal(partial.status, "failed"); assert.equal(partial.totalSuccess, 1); assert.equal(partial.totalFailed, 1);
    assert.deepEqual(storage.weread_useBookIDBooks.map(book => book.bookID), ["B"]);
    assert.deepEqual(writes.map(book => book.bookID), ["B"]);
    assert.equal(storage.temporary_weread_notebooksList.find(book => book.bookID === "A").pendingImport, true);
    assert.equal((await detect(plugin)).newSources.some(book => book.bookID === "A"), true);
    assert.equal(created.length, 2, "Partial writes remain intact; no destructive rollback");
    assert(reports[0].items.some(item => item.bookID === "A" && /部分写入/.test(item.reasonText)));
    assert(reports[0].items.some(item => item.bookID === "A" && item.sourceKey === "weread-book:A"));
    console.log("Partial failure PASS: only successful B receives BookID preference/forced sync, A remains pending and its partial data is preserved");

    setup(); row("Z", "", "doc-z", "existing"); rawNotebooks.books.push(source("Z", "", "existing"));
    const headless = await auto(plugin); assert.equal(headless.status, "completed"); assert.equal(headless.totalSuccess, 1);
    assert.deepEqual(writes.map(item => item.bookID), ["Z"]); assert.equal(created.length, 0); assert.equal(planCalls.length, 0);
    assert.equal((await detect(plugin)).newSources.length, 2);
    console.log("Auto PASS: headless auto sync updates existing approved sources and leaves new books pending");
    console.warn = originalWarn;
    console.log("WeRead sync confirmation smoke: ALL PASS (mocked I/O; not a live WeRead/SiYuan write test)");
}

const watchdog = setTimeout(() => { console.error("Confirmation smoke did not finish"); process.exit(1); }, 30000);
new Function("require", "__dirname", fixtures + "\nreturn (" + scenarios.toString() + ")();")(require, __dirname)
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
