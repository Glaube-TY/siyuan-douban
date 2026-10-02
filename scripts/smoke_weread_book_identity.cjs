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
        if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
}

const ISBN_A = "9787111128069", ISBN_B = "9787302423287";
let keyValues, storage, docs, children, writes, requests, created, serial = 0;
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
}
function row(bookID, isbn, doc, title = "测试书", rowID = doc || `row-${++serial}`) {
    keyValues[0].values.push({ blockID: rowID, keyID: "title", id: `value-${rowID}`, block: { id: doc, content: title } });
    keyValues[1].values.push({ blockID: rowID, number: { content: isbn ? Number(isbn) : null, formattedContent: isbn || "" } });
    keyValues[2].values.push({ blockID: rowID, text: { content: bookID } });
    if (doc) docs.add(doc);
}
mock("src/api.ts", {
    sql: async query => {
        if (query.includes('id = "database"')) return [{ markdown: '<div data-av-id="av"></div>', box: "box", hpath: "/books", root_id: "parent" }];
        return [...docs].filter(id => query.includes(`"${id}"`) || query.includes(`'${id}'`)).map(id => ({ id, type: "d" }));
    },
    getAttributeView: async () => ({ av: { keyValues: structuredClone(keyValues) } }),
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
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).code, 1);
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
    assert.equal((await add(plugin, "av", detail("A", ISBN_A))).code, 1); assert.equal(created.length, 0); assert.equal((await detect(plugin)).newSources.length, 0);
    console.log("D PASS: safe ISBN reuses an unowned Douban row without creating a duplicate");

    reset(); row("A", ISBN_A, "doc1"); storage.temporary_weread_notebooksList = [source("B", ISBN_A)];
    assert.equal((await find(plugin, source("B", ISBN_A))).success, false);
    assert.equal((await preflight(plugin)).failed, 1); assert.equal((await detect(plugin)).normalBooks[0].bookID, "B");
    assert.equal((await attach(plugin, storage.temporary_weread_notebooksList))[0].localDocBlockID, undefined);
    const blocked = await sync(plugin, "mock-key", "template", { mode: "update" }); assert.equal(blocked.planned, 0); assert.equal(blocked.skippedNotReady, 1); assert.equal(writes.length, 0);
    assert.equal((await add(plugin, "av", detail("B", ISBN_A))).code, 0); assert.notEqual((await find(plugin, source("B", ISBN_A))).blockID, "doc1");
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
    reset(); row("", ISBN_A, ""); assert.equal((await add(plugin, "av", detail("A", ISBN_A))).code, 0, "An unbound ISBN row is not a usable note document");
    reset(); delete storage.weread_notebooks; assert.deepEqual(await historyTools.loadWereadSyncedNotebooks(plugin), []);
    for (const damaged of [null, "corrupted", { bad: true }]) { storage.weread_notebooks = damaged; await assert.rejects(historyTools.loadWereadSyncedNotebooks(plugin)); }
    reset(); row("MP_WXS_1", "", "mpdoc"); storage.temporary_weread_notebooksList = [{ ...source("MP_WXS_1"), sourceType: "weread_mp_account" }];
    assert.equal((await preflight(plugin)).skippedMp, 1); assert.equal((await detect(plugin)).mpAccounts.length, 0); assert.equal((await find(plugin, source("MP_WXS_1"))).blockID, "mpdoc");
    assert.equal(historyTools.findConflictingWereadDocBindings([{ bookID: "A", blockID: "doc" }, { bookID: "MP_WXS_1", blockID: "doc" }]).size, 0);
    console.log("Additional PASS: priority, duplicate ISBN, shared legacy row, force-sync collision, damaged history, MP exclusion");
    console.log("WeRead book identity smoke: ALL PASS (mocked I/O; not a live SiYuan/WeRead account test)");
})().catch(error => { console.error(error); process.exitCode = 1; });
