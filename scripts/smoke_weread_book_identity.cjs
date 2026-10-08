// Run: node scripts/smoke_weread_book_identity.cjs
// Real identity/import/preflight/planning code; mocked host/network/block writes, no user data touched.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const mocks = new Map();
const modules = new Map();
const mock = (file, exports) => mocks.set(path.join(root, file), exports);
function load(file) {
    const absolute = path.resolve(root, file);
    if (mocks.has(absolute)) return mocks.get(absolute);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} };
    modules.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name) => {
        if (name === "siyuan") return { showMessage: message => messages.push(message) };
        if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        if (mocks.has(base)) return mocks.get(base);
        return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
}

const ISBN_A = "9787111128069", ISBN_B = "9787302423287";
let keyValues, storage, docs, children, writes, requests, created, messages, claims, importResults, bookInfos, dialogProps, writeMode, beforeRead, serial = 0;
const source = (bookID, isbn = "", title = "测试书") => ({ bookID, isbn, title, sourceType: "weread_book", updatedTime: 10, noteCount: 1, reviewCount: 0, bookmarkCount: 1, totalNoteCount: 1 });
const plugin = {
    name: "siyuan-douban", i18n: {},
    loadData: async key => structuredClone(storage[key]),
    saveData: async (key, value) => { storage[key] = structuredClone(value); },
    loadDataStrict: async key => Object.hasOwn(storage, key) ? { exists: true, value: structuredClone(storage[key]) } : { exists: false },
};
function reset() {
    keyValues = [
        { key: { id: "title", name: "书名", type: "block" }, values: [] },
        { key: { id: "isbn", name: "ISBN", type: "number" }, values: [] },
        { key: { id: "bookid", name: "bookID", type: "text" }, values: [] },
    ];
    storage = { "settings.json": { bookDatabaseID: "database", noteTemplate: "{{书名}}" }, temporary_weread_notebooksList: [], weread_notebooks: [], weread_customBooksISBN: [] };
    docs = new Set(); children = new Map(); writes = []; requests = []; created = [];
    messages = []; claims = []; importResults = []; bookInfos = new Map(); dialogProps = undefined; writeMode = "ok"; beforeRead = undefined;
}
function row(bookID, isbn, doc, title = "测试书", rowID = doc || `row-${++serial}`) {
    keyValues[0].values.push({ blockID: rowID, keyID: "title", id: `value-${rowID}`, block: { id: doc, content: title } });
    keyValues[1].values.push({ blockID: rowID, number: { content: isbn ? Number(isbn) : null, formattedContent: isbn || "" } });
    keyValues[2].values.push({ blockID: rowID, id: `bookid-${rowID}`, text: { content: bookID } });
    if (doc) docs.add(doc);
}
mock("src/api.ts", {
    sql: async query => {
        if (query.includes('id = "database"')) return [{ markdown: '<div data-av-id="av"></div>', box: "box", hpath: "/books", root_id: "parent" }];
        return [...docs].filter(id => query.includes(`"${id}"`) || query.includes(`'${id}'`)).map(id => ({ id, type: "d" }));
    },
    getAttributeView: async () => {
        if (beforeRead) { const run = beforeRead; beforeRead = undefined; run(); }
        return { av: { keyValues: structuredClone(keyValues) } };
    },
    reloadAttributeView: async () => {},
    setAttributeViewBlockAttrStrict: async payload => {
        assert.equal(payload.avID, "av"); assert.equal(payload.keyID, keyValues.find(kv => kv.key.name === "bookID").key.id);
        assert.deepEqual(Object.keys(payload.value), ["text"], "Claim changes only bookID");
        claims.push(structuredClone(payload));
        if (writeMode === "throw") throw new Error("strict write rejected");
        if (writeMode === "noop") return;
        const column = keyValues.find(kv => kv.key.id === payload.keyID);
        let cell = column.values.find(v => v.blockID === payload.itemID);
        if (cell?.id) assert.equal(payload.cellID, cell.id);
        else assert.equal(payload.cellID, undefined);
        if (!cell) { cell = { blockID: payload.itemID }; column.values.push(cell); }
        Object.assign(cell, payload.value);
    },
    getAttributeViewKeysByAvID: async () => structuredClone(keyValues.map(kv => kv.key)),
    addAttributeViewKey: async ({ keyID, keyName, keyType }) => keyValues.push({ key: { id: keyID, name: keyName, type: keyType }, values: [] }),
    appendAttributeViewDetachedBlocksWithValues: async (_avID, rows) => {
        for (const values of rows) {
            const rowID = values[0].blockID;
            assert.ok(rowID, "Every frontend must supply an exact new row ID");
            for (const value of values) {
                const column = keyValues.find(kv => kv.key.id === value.keyID);
                column.values.push({ ...structuredClone(value), id: `value-${rowID}`, blockID: rowID });
            }
        }
    },
    createDocWithMd: async (_box, titlePath, _md, options) => {
        assert.equal(docs.has(options.id), false, "A same-title import must never reuse an existing document ID");
        docs.add(options.id); created.push({ ...options, titlePath });
    },
    setBlockAttrs: async () => {},
    setAttributeViewBlockAttr: async ({ itemID, value }) => {
        const item = keyValues[0].values.find(v => v.blockID === itemID);
        assert.ok(item); Object.assign(item, value);
    },
    getChildBlocks: async id => structuredClone(children.get(id) || []),
    removeAttributeViewBlocks: async () => { throw new Error("Unexpected destructive operation"); },
});
mock("src/utils/core/formatOp.ts", { generateUniqueBlocked: () => `20261002120000-${String(++serial).padStart(7, "0")}`, parseDateToTimestamp: () => 0 });
mock("src/utils/bookHandling/changeMainKeyName.ts", { changeMainKeyName: async () => { throw new Error("Unexpected rename"); } });
mock("src/utils/weread/downloadWereadCover.ts", { downloadWereadCoverSafely: async () => "" });
mock("src/utils/core/getImg.ts", { getImage: async () => "", downloadCover: async () => "" });
mock("src/utils/template/renderBookNoteTemplate.ts", { renderBookNoteTemplate: async () => {} });
mock("src/utils/weread/api/buildWereadApiEnhancedNotebook.ts", { buildWereadApiEnhancedNotebook: async (_key, book) => { requests.push(book.bookID); return { title: book.title }; } });
mock("src/utils/weread/incremental/buildBookRenderModel.ts", {
    buildWereadBookRenderModel: ({ template, bookID, title }) => ({ template, bookID, title, items: [{ id: "note" }], stats: { noteCount: 1 } }),
    renderModelToMarkdown: () => "note content",
});
mock("src/utils/weread/incremental/syncBookIncremental.ts", {
    syncWereadBookIncremental: async ({ docBlockID, model }) => {
        writes.push({ bookID: model.bookID, docBlockID });
        const hash = load("src/utils/weread/incremental/hash.ts").hashText;
        const sourceIndex = { docBlockID, positionMarkBlockID: `mark-${model.bookID}`, templateHash: hash(model.template), items: { note: { blockIds: [`note-${model.bookID}`] } } };
        children.set(docBlockID, [{ id: sourceIndex.positionMarkBlockID }, { id: `note-${model.bookID}` }]);
        storage.weread_note_unit_block_index_v1 ||= { schemaVersion: 1, sources: {} };
        storage.weread_note_unit_block_index_v1.sources[`book:${model.bookID}`] = sourceIndex;
        return { sourceIndex, stats: { added: 1, changed: 0, deleted: 0, unchanged: 0, blockOperationCount: 1, rebuilt: false } };
    },
});
mock("src/utils/storage/readingInboxDiff.ts", { recordNormalBookInboxDiff: async () => ({ newBookmarkCount: 0, newReviewCount: 0 }) });
mock("src/utils/storage/readingAnnotationStorage.ts", { replaceReadingAnnotationSource: async () => {} });
mock("src/utils/readingCenter/readingAnnotationArchiveBuilder.ts", { buildNormalBookAnnotationSource: x => x });

const identity = load("src/utils/bookHandling/bookDeduplication.ts");
const historyTools = load("src/utils/weread/wereadSyncStorage.ts");
const { addUseBookIDsToDatabase: add } = load("src/utils/weread/addUseBookIDs.ts");
const { loadAVData: addDouban } = load("src/utils/bookHandling/index.ts");
const { findWereadApiBookTargetDoc: find, attachWereadApiLocalNoteDocs: attach } = load("src/utils/weread/api/findWereadApiBookTargetDoc.ts");
const { detectWereadApiNewSources: detect } = load("src/utils/weread/api/detectWereadApiNewSources.ts");
const { preflightWereadApiBooksSync: preflight } = load("src/utils/weread/api/preflightWereadApiBooksSync.ts");
const { syncWereadApiNormalBooks: sync } = load("src/utils/weread/api/syncWereadApiNormalBooks.ts");
mock("src/utils/weread/addUseBookIDs.ts", { addUseBookIDsToDatabase: async (...args) => {
    const result = await add(...args); importResults.push(result); return result;
} });
mock("src/utils/weread/api/wereadApiGateway.ts", { callWereadApi: async (_key, apiName, { bookId }) => {
    assert.equal(apiName, "/book/info"); assert.ok(bookInfos.has(bookId)); return structuredClone(bookInfos.get(bookId));
} });
mock("src/libs/dialog.ts", { svelteDialog: ({ constructor }) => {
    constructor({}); return { close() {}, dialog: { element: { classList: { add() {} } } } };
} });
mock("src/components/common/wereadNewBooksDialog.svelte", { __esModule: true, default: class { constructor({ props }) { dialogProps = props; } } });
mock("src/utils/douban/book/getWebPage.ts", { fetchBookHtml: async () => { throw new Error("Unexpected Douban request"); } });
mock("src/utils/douban/book/fetchBook.ts", { fetchDoubanBook: async () => { throw new Error("Unexpected Douban import"); } });
mock("src/utils/weread/addWereadMpAccounts.ts", {});
mock("src/utils/weread/api/buildWereadApiMpAccountSyncData.ts", {});
const { showWereadApiNewSourcesDialogAndSync: showNewSources } = load("src/utils/weread/api/handleWereadApiNewSources.ts");
const { claimWereadBookIDOnExistingRow: claim } = load("src/utils/weread/api/wereadBookIdentity.ts");
async function confirmBookIDs() {
    const pending = showNewSources(plugin, "mock-key", "update", async () => {});
    await new Promise(setImmediate);
    assert.ok(dialogProps, "Actual new-source dialog must be shown");
    await dialogProps.onConfirm([], [], dialogProps.books);
    assert.equal(await pending, "synced");
}
const detail = (id, isbn = "") => ({ bookId: id, title: "测试书", isbn, cover: "", intro: "intro" });
async function updatesAreStable() {
    const before = requests.length;
    for (let round = 2; round <= 3; round++) {
        const result = await sync(plugin, "mock-key", "template", { mode: "update" });
        assert.equal(result.planned, 0);
        assert.equal(result.skippedUnchanged, 2);
        assert.ok(result.items.every(item => item.status === "skipped_unchanged"));
        assert.equal(requests.length, before, "An unchanged update must not prepare remote details");
        console.log(`  update #${round}: A/B unchanged, planned=0`);
    }
}

(async () => {
    reset(); storage.temporary_weread_notebooksList = [source("A", ISBN_A), source("B", ISBN_B)];
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).code, 0);
    assert.deepEqual((await detect(plugin)).normalBooks.map(b => b.bookID), ["B"]);
    assert.equal((await add(plugin, "av", detail("B", ISBN_B))).code, 0);
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "already_linked");
    assert.equal(created.length, 2); assert.notEqual(created[0].id, created[1].id);
    assert.ok(created.every(doc => doc.titlePath === "/books/测试书" && doc.parentID === "parent"));
    const first = await sync(plugin, "mock-key", "template", { mode: "update" });
    assert.equal(first.success, 2); assert.deepEqual(writes.map(w => w.bookID), ["A", "B"]);
    assert.notEqual(writes[0].docBlockID, writes[1].docBlockID);
    assert.deepEqual((await attach(plugin, storage.temporary_weread_notebooksList)).map(b => b.localDocBlockID), writes.map(w => w.docBlockID));
    assert.equal((await detect(plugin)).newSources.length, 0);
    await updatesAreStable(); console.log("A PASS: same title / different ISBN & bookID, independent import/write/index, two unchanged updates");

    reset(); assert.equal((await add(plugin, "av", detail("A"))).code, 0); assert.equal((await add(plugin, "av", detail("B"))).code, 0);
    assert.equal(created.length, 2); assert.notEqual(created[0].id, created[1].id); console.log("B PASS: no ISBN, distinct bookIDs remain independent");

    reset();
    for (const isbn of [ISBN_A, ISBN_B]) assert.equal((await addDouban("av", { title: "测试书", ISBN: isbn, addNotes: true, databaseBlockId: "database", noteTemplate: "{{书名}}" }, plugin)).code, 0);
    assert.equal(created.length, 2); assert.equal((await addDouban("av", { title: "测试书", ISBN: ISBN_A }, plugin)).code, 1); console.log("C PASS: same-title Douban editions, distinct ISBNs, exact new row readback");

    reset(); row("", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("A", ISBN_A)];
    const legacy = await find(plugin, source("A", ISBN_A)); assert.equal(legacy.blockID, "doc1"); assert.equal(legacy.matchType, "ISBN");
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "linked_existing"); assert.equal(created.length, 0); assert.equal((await detect(plugin)).newSources.length, 0);
    console.log("D PASS: safe ISBN reuses an unowned Douban row without creating a duplicate");

    reset(); row("A", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("B", ISBN_A)];
    assert.equal((await find(plugin, source("B", ISBN_A))).success, false);
    assert.equal((await preflight(plugin)).failed, 1); assert.equal((await detect(plugin)).normalBooks[0].bookID, "B");
    assert.equal((await attach(plugin, storage.temporary_weread_notebooksList))[0].localDocBlockID, undefined);
    const blocked = await sync(plugin, "mock-key", "template", { mode: "update" }); assert.equal(blocked.planned, 0); assert.equal(blocked.skippedNotReady, 1); assert.equal(writes.length, 0);
    assert.equal((await add(plugin, "av", detail("B", ISBN_A))).status, "created"); assert.equal(keyValues[2].values[0].text.content, "A"); assert.equal(claims.length, 0); assert.notEqual((await find(plugin, source("B", ISBN_A))).blockID, "doc1");
    console.log("E PASS: same ISBN with a conflicting bookID cannot write the existing document; BookID can create an independent row");

    reset(); row("A", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("A", ISBN_A), source("B", ISBN_B)];
    storage.weread_notebooks = storage.temporary_weread_notebooksList.map(b => ({ ...b, blockID: "doc1" }));
    storage.weread_useBookIDBooks = [source("B")]; storage.weread_customBooksISBN = [{ bookID: "B", title: "测试书", customISBN: ISBN_B }];
    assert.deepEqual(historyTools.findConflictingWereadDocBindings(storage.weread_notebooks).get("doc1"), ["A", "B"]);
    assert.deepEqual((await detect(plugin)).normalBooks.map(b => b.bookID), ["B"]);
    const broken = await sync(plugin, "mock-key", "template", { mode: "update" });
    assert.equal(broken.items.find(b => b.bookID === "B").status, "skipped_not_ready"); assert.ok(writes.every(w => w.bookID === "A"));
    assert.equal(storage.weread_notebooks.length, 2, "Conflicting history must not be deleted"); assert.equal(docs.has("doc1"), true);
    assert.equal((await add(plugin, "av", detail("B", ISBN_B))).code, 0);
    assert.equal((await sync(plugin, "mock-key", "template", { mode: "update" })).success, 1);
    assert.notEqual(storage.weread_notebooks.find(b => b.bookID === "B").blockID, "doc1"); await updatesAreStable();
    console.log("F PASS: stale B reappears, remains unready until independent import, then history and two updates stabilize");

    reset(); row("", "", "doc1", "书名"); row("", "", "doc2", "《书名》");
    assert.equal((await find(plugin, source("C", "", "书名"))).success, false);
    assert.equal(identity.matchBookIdentity(identity.buildBookIdentityRows(keyValues), { title: "书名" }).issue, "ambiguous");
    assert.equal(identity.normalizeBookTitle("  Ａ  B  "), identity.normalizeBookTitle("a b"));
    console.log("G PASS: normalized title candidates are ambiguous, including wrapper/whitespace/NFKC differences");

    reset(); row("A", ISBN_A, "doc1"); row("B", ISBN_A, "doc2");
    assert.equal((await find(plugin, source("B", ISBN_A))).blockID, "doc2", "bookID wins over duplicate ISBN and title");
    assert.equal((await find(plugin, source("C", ISBN_A))).success, false, "Multiple ISBN candidates must not select the first row");
    reset(); row("", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("A", ISBN_A), source("B", ISBN_A)];
    assert.equal((await detect(plugin)).normalBooks.length, 2); assert.equal((await preflight(plugin)).ready, 0);
    assert.ok((await attach(plugin, storage.temporary_weread_notebooksList)).every(b => !b.localDocBlockID));
    const forced = await sync(plugin, "mock-key", "template", { mode: "update", forceBookIDs: ["A", "B"] }); assert.equal(forced.planned, 0); assert.equal(writes.length, 0);
    reset(); row("A", "", "doc1"); row("B", "", "doc1"); assert.equal((await find(plugin, source("A"))).success, false);
    reset(); row("", ISBN_A, "doc1"); storage.weread_notebooks = [{ ...source("A", ISBN_A), blockID: "doc1" }, { ...source("B", ISBN_A), blockID: "doc1" }];
    assert.equal((await add(plugin, "av", detail("B", ISBN_A))).code, 0, "Conflicting history must not block independent BookID import into a legacy ISBN row");
    assert.notEqual((await find(plugin, source("B", ISBN_A))).blockID, "doc1");
    assert.equal(keyValues[2].values[0].text.content, ""); assert.equal(claims.length, 0);
    reset(); row("", ISBN_A, ""); assert.equal((await add(plugin, "av", detail("A", ISBN_A))).code, 0, "An unbound ISBN row is not a usable note document");
    reset(); delete storage.weread_notebooks; assert.deepEqual(await historyTools.loadWereadSyncedNotebooks(plugin), []);
    for (const damaged of [null, "corrupted", { bad: true }]) { storage.weread_notebooks = damaged; await assert.rejects(historyTools.loadWereadSyncedNotebooks(plugin)); }
    reset(); row("MP_WXS_1", "", "mpdoc"); storage.temporary_weread_notebooksList = [{ ...source("MP_WXS_1"), sourceType: "weread_mp_account" }];
    assert.equal((await preflight(plugin)).skippedMp, 1); assert.equal((await detect(plugin)).mpAccounts.length, 0); assert.equal((await find(plugin, source("MP_WXS_1"))).blockID, "mpdoc");
    assert.equal(historyTools.findConflictingWereadDocBindings([{ bookID: "A", blockID: "doc" }, { bookID: "MP_WXS_1", blockID: "doc" }]).size, 0);
    console.log("Additional PASS: priority, duplicate ISBN, shared legacy row, force-sync collision, damaged history, MP exclusion");

    // H: the exact upgrade flow: notebook ISBN missing, existing Douban row, explicit BookID confirmation.
    reset(); row("", ISBN_A, "doc1", "历史书", "legacy-row");
    keyValues.push({ key: { id: "user", name: "用户字段", type: "text" }, values: [{ blockID: "legacy-row", text: { content: "preserve me" } }] });
    storage.temporary_weread_notebooksList = [source("WR_A", "", "历史书")];
    const originalRows = structuredClone(keyValues);
    assert.deepEqual((await detect(plugin)).normalBooks.map(b => b.bookID), ["WR_A"]);
    assert.deepEqual(keyValues, originalRows, "Detection must never claim rows");
    bookInfos.set("WR_A", { ...detail("WR_A", ISBN_A), title: "历史书", author: "author", publisher: "publisher", publishTime: "2020-01-01", cover: "https://example.com/remote.jpg" });
    await confirmBookIDs();
    assert.deepEqual(importResults.map(r => [r.code, r.status]), [[0, "linked_existing"]]);
    assert.equal(created.length, 0); assert.equal(keyValues[0].values.length, 1);
    assert.equal(keyValues[2].values[0].text.content, "WR_A"); assert.equal(keyValues[0].values[0].block.id, "doc1");
    assert.deepEqual(keyValues.filter(kv => kv.key.name !== "bookID"), originalRows.filter(kv => kv.key.name !== "bookID"));
    assert.equal(storage.weread_notebooks.length, 0, "Claim must not fabricate sync history");
    const cached = storage.temporary_weread_notebooksList[0];
    assert.equal(cached.isbn, ISBN_A); assert.equal(cached.cover, "https://example.com/remote.jpg");
    assert.equal(cached.author, "author"); assert.equal(cached.publisher, "publisher"); assert.equal(cached.publishTime, "2020-01-01"); assert.equal(cached.introduction, "intro");
    assert.ok(messages.every(message => !/导入失败|已存在|已经导入/.test(message)));
    console.log("H historical Douban row claim PASS");
    assert.equal((await detect(plugin)).newSources.length, 0); console.log("H second detect has zero pending PASS");
    assert.equal((await sync(plugin, "mock-key", "template", { mode: "update", forceBookIDs: ["WR_A"] })).success, 1);
    assert.deepEqual(writes, [{ bookID: "WR_A", docBlockID: "doc1" }]);
    for (let round = 2; round <= 3; round++) {
        const result = await sync(plugin, "mock-key", "template", { mode: "update" });
        assert.equal(result.planned, 0); assert.equal(result.skippedUnchanged, 1);
        assert.equal((await detect(plugin)).newSources.length, 0);
    }
    assert.equal(writes.length, 1); console.log("H second/third update unchanged PASS");
    const again = await add(plugin, "av", bookInfos.get("WR_A"));
    assert.equal(again.code, 0); assert.equal(again.status, "already_linked"); assert.equal(claims.length, 1);
    console.log("Exact bookID idempotent success PASS");

    reset();
    for (let i = 0; i < 20; i++) {
        const id = "HIST_" + i, isbn = String(9787111128000 + i), title = "历史书" + i;
        row("", isbn, "doc-" + i, title, "legacy-" + i);
        storage.temporary_weread_notebooksList.push(source(id, "", title));
        bookInfos.set(id, { ...detail(id, isbn), title });
    }
    assert.equal((await detect(plugin)).normalBooks.length, 20);
    await confirmBookIDs();
    assert.equal(importResults.length, 20); assert.ok(importResults.every(r => r.code === 0 && r.status === "linked_existing"));
    assert.equal(created.length, 0); assert.equal(keyValues[0].values.length, 20);
    for (let i = 0; i < 20; i++) {
        assert.equal(keyValues[2].values[i].text.content, "HIST_" + i);
        assert.equal(keyValues[0].values[i].block.id, "doc-" + i);
        assert.equal(storage.temporary_weread_notebooksList[i].isbn, String(9787111128000 + i));
    }
    assert.ok(messages.every(message => !/导入失败|已存在|已经导入/.test(message)));
    assert.equal((await detect(plugin)).newSources.length, 0);
    console.log("I batch existing books claim PASS (20 books, no duplicate rows or failure messages)");

    // Fail closed on stale identity, invalid documents and writes that do not read back.
    for (const mode of ["noop", "throw"]) {
        reset(); row("", ISBN_A, "doc1"); writeMode = mode;
        await assert.rejects(add(plugin, "av", detail("A", ISBN_A)));
        assert.equal(keyValues[2].values[0].text.content, ""); assert.equal(created.length, 0);
    }
    for (const mutate of [
        () => { keyValues[2].values[0].text.content = "OTHER"; },
        () => { keyValues[1].values[0].number.formattedContent = ISBN_B; },
        () => { keyValues[0].values[0].block.id = "doc2"; },
        () => { row("A", ISBN_B, "doc2"); },
        () => { storage.weread_notebooks = [ { ...source("A", ISBN_A), blockID: "doc1" }, { ...source("B", ISBN_A), blockID: "doc1" } ]; },
    ]) {
        reset(); row("", ISBN_A, "doc1");
        const expected = identity.buildBookIdentityRows(keyValues)[0];
        beforeRead = () => { beforeRead = mutate; };
        await assert.rejects(claim(plugin, "av", expected, { bookID: "A", isbn: ISBN_A })); assert.equal(claims.length, 0);
    }
    reset(); row("A", ISBN_A, "doc1"); docs.delete("doc1");
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "conflict"); assert.equal(created.length, 0);
    reset(); row("", ISBN_A, "doc1"); keyValues[2].values = [];
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "linked_existing"); assert.equal(claims[0].cellID, undefined);
    reset(); row("", ISBN_A, "doc1"); keyValues.pop();
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "linked_existing"); assert.equal(created.length, 0);
    reset(); const remoteDetail = { ...detail("A", ISBN_A), cover: "https://example.com/remote.jpg" };
    const beforeDetail = structuredClone(remoteDetail); assert.equal((await add(plugin, "av", remoteDetail)).status, "created"); assert.deepEqual(remoteDetail, beforeDetail);
    reset(); row("", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("A")]; bookInfos.set("A", detail("A", ISBN_A)); writeMode = "throw";
    await confirmBookIDs(); assert.equal(importResults.length, 0); assert.ok(messages.some(message => /导入失败/.test(message)));
    assert.equal(storage.temporary_weread_notebooksList[0].isbn, ISBN_A, "Resolved remote details survive a DB write failure");
    reset(); row("", ISBN_A, "doc1"); const expectedWithoutColumn = identity.buildBookIdentityRows(keyValues)[0]; keyValues.pop(); storage.weread_notebooks = null;
    await assert.rejects(claim(plugin, "av", expectedWithoutColumn, { bookID: "A", isbn: ISBN_A })); assert.equal(keyValues.length, 2);
    reset(); keyValues[2].values.push({ blockID: "orphan", text: { content: "A" } });
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).status, "conflict"); assert.equal(created.length, 0);
    console.log("Claim safety/readback, missing column/cell, unchanged input and failed-import cache PASS");
    console.log("WeRead book identity smoke: ALL PASS (mocked I/O; not a live SiYuan/WeRead account test)");
})().catch(error => { console.error(error); process.exitCode = 1; });
