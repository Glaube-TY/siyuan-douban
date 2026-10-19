// Real cache/entry-point/planning code; mocked network, crypto and SiYuan I/O, no user data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const mocks = new Map(), modules = new Map();
const mock = (file, value) => mocks.set(path.join(root, file), value);
function load(file) {
    const absolute = path.resolve(root, file);
    if (mocks.has(absolute)) return mocks.get(absolute);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} }; modules.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
        if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
}
const KEY = "temporary_weread_notebooksList", ISBN_A = "9787111128069", ISBN_B = "9787302423287";
let storage, writes, requests, networkError, readError, remoteBooks;
const plugin = {
    name: "siyuan-douban", i18n: {},
    loadData: async key => structuredClone(storage[key]),
    loadDataStrict: async key => {
        if (key === KEY && readError) throw readError;
        return Object.hasOwn(storage, key) ? { exists: true, value: structuredClone(storage[key]) } : { exists: false };
    },
    saveData: async (key, value) => { writes.push({ key, value: structuredClone(value) }); storage[key] = structuredClone(value); },
};
const unexpected = () => { throw new Error("Unchanged update must not fetch details or write notes"); };
mock("src/utils/weread/api/wereadApiGateway.ts", { callWereadApi: async (_key, apiName) => {
    requests.push(apiName);
    if (networkError) throw networkError;
    if (apiName === "/shelf/sync") return { books: [] };
    assert.equal(apiName, "/user/notebooks", "No bulk /book/info ISBN enrichment");
    return { books: structuredClone(remoteBooks), hasMore: 0 };
} });
mock("src/api.ts", { getChildBlocks: async () => [{ id: "mark" }, { id: "note" }] });
mock("src/utils/settings/wereadApiKeyCrypto.ts", {
    isEncryptedWereadApiKey: value => value === "fixture-encrypted",
    encryptWereadApiKey: () => "fixture-encrypted", decryptWereadApiKey: () => "fixture-key",
});
mock("src/utils/weread/api/preflightWereadApiBooksSync.ts", {
    preflightWereadApiBooksSync: async () => ({ items: storage[KEY].map(book => ({ bookID: book.bookID, title: book.title, blockID: "doc-" + book.bookID, status: "ready" })) }),
    rejectSharedWereadSyncTargets: items => items,
});
mock("src/utils/weread/api/findWereadApiBookTargetDoc.ts", { findWereadApiBookTargetDoc: unexpected });
mock("src/utils/weread/api/buildWereadApiEnhancedNotebook.ts", { buildWereadApiEnhancedNotebook: unexpected });
mock("src/utils/weread/incremental/buildBookRenderModel.ts", { buildWereadBookRenderModel: unexpected, renderModelToMarkdown: unexpected });
mock("src/utils/weread/incremental/syncBookIncremental.ts", { syncWereadBookIncremental: unexpected });
mock("src/utils/storage/readingInboxDiff.ts", {});
mock("src/utils/storage/readingAnnotationStorage.ts", {});
mock("src/utils/readingCenter/readingAnnotationArchiveBuilder.ts", {});
mock("src/utils/weread/api/syncWereadApiMpAccounts.ts", { syncWereadApiMpAccounts: unexpected });
mock("src/utils/weread/api/handleWereadApiNewSources.ts", { showWereadApiNewSourcesDialogAndSync: async (_plugin, _key, _mode, runSync) => { await runSync(); return "synced"; } });
mock("src/utils/storage/syncReportBuilder.ts", { buildWereadSyncReport: value => value, saveWereadSyncReportAndApplyStatus: async () => {} });
const { mergeWereadNotebookLocalMetadata: merge } = load("src/utils/weread/api/mergeWereadNotebookLocalMetadata.ts");
const { buildWereadApiNotebookCache: buildCache } = load("src/utils/weread/api/buildWereadApiNotebookCache.ts");
const settings = load("src/utils/settings/wereadSettingsService.ts");
const { runWorkbenchManualWereadApiSync: manual } = load("src/utils/weread/api/workbenchManualSyncWereadApi.ts");
const { autoSyncWereadApi: auto } = load("src/utils/weread/api/autoSyncWereadApi.ts");
const { syncWereadApiNormalBooks: sync } = load("src/utils/weread/api/syncWereadApiNormalBooks.ts");
const { hashText } = load("src/utils/weread/incremental/hash.ts");

// Execute the actual Svelte function with its lexical dependencies, without mounting SiYuan UI.
const svelte = fs.readFileSync(path.join(root, "src/components/tabs/WereadTab.svelte"), "utf8");
const script = svelte.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile("WereadTab.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const getList = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "getNotebooksList");
assert.ok(getList);
const tabCode = ts.transpileModule(getList.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function tabRefresh(options) {
    const run = new Function("plugin", "buildWereadApiNotebookCache", "mergeWereadNotebookLocalMetadata", "console", `
        let isNotebookListLoading = false, isNotebookListReady = false, notebooksList = [], notebooksInfo = "";
        const wereadApiKeyVerified = true, wereadApiKeyInput = "fixture-key", i18nReplace = () => "";
        ${tabCode}
        return getNotebooksList;
    `)(plugin, buildCache, merge, { error() {} });
    return run(options);
}
function reset() {
    remoteBooks = ["A", "B"].map(bookId => ({ bookId, title: bookId, sort: 10, noteCount: 1, reviewCount: 0, bookmarkCount: 1, totalNoteCount: 1 }));
    storage = { weread_templates: "template", weread_notebooks: [], weread_api_bookshelf_cache: [], weread_customBooksISBN: [],
        weread_auth_settings: { apiKeyEncrypted: "fixture-encrypted", verified: true },
    };
    writes = []; requests = []; networkError = undefined; readError = undefined;
}
async function seedHistory() {
    const fresh = await buildCache("fixture-key");
    storage.weread_notebooks = fresh.map(book => ({ ...book, blockID: "doc-" + book.bookID }));
    storage.weread_note_unit_block_index_v1 = { schemaVersion: 1, sources: Object.fromEntries(fresh.map(book => ["book:" + book.bookID, {
        docBlockID: "doc-" + book.bookID, positionMarkBlockID: "mark", templateHash: hashText("template"), items: { note: { blockIds: ["note"] } },
    }])) };
    requests = [];
}
const cacheWrites = () => writes.filter(write => write.key === KEY);
const entries = [
    ["manual", () => manual(plugin, "update")],
    ["auto", () => auto(plugin)],
    ["tab", () => tabRefresh()],
    ["tab preserve", () => tabRefresh({ preserveCacheOnFail: true })],
];
(async () => {
    for (const [name, refresh] of entries) {
        for (const legacyNull of [true, false]) {
            reset(); await seedHistory();
            if (legacyNull) storage[KEY] = null;
            await refresh();
            assert.ok(Array.isArray(storage[KEY])); assert.equal(storage[KEY].length, 2);
            assert.equal(cacheWrites().length, 1, "Only the validated refresh writes the cache");
            assert.ok(cacheWrites().every(write => Array.isArray(write.value)));
        }
        reset(); storage[KEY] = null;
        await merge(plugin, []); assert.equal(storage[KEY], null); assert.equal(cacheWrites().length, 0, "Reading legacy null alone never rewrites disk");
        await refresh(); assert.ok(Array.isArray(storage[KEY]));
        console.log(`A/B PASS (${name}): missing file and historical JSON null recover only after successful refresh`);

        reset(); await seedHistory();
        storage[KEY] = [{ bookID: "A", isbn: ISBN_A, publisher: "Local publisher" }, { bookID: "B", isbn: ISBN_B, introduction: "Local intro" }];
        const before = structuredClone(storage[KEY]);
        networkError = new Error("Fixture network failure");
        await assert.rejects(refresh(), /Fixture network failure/);
        assert.deepEqual(storage[KEY], before); assert.equal(cacheWrites().length, 0);
        networkError = undefined; await refresh();
        assert.deepEqual(storage[KEY].map(book => book.isbn), [ISBN_A, ISBN_B]);
        assert.equal(storage[KEY][0].publisher, "Local publisher"); assert.equal(storage[KEY][1].introduction, "Local intro");
        console.log(`D/E PASS (${name}): failed refresh preserves cached values exactly; recovery retains Local First ISBN metadata`);

        for (const damaged of [{ books: [] }, "unknown", "", 42, false, undefined]) {
            reset(); storage[KEY] = damaged;
            await assert.rejects(refresh(), /temporary_weread_notebooksList 格式异常/);
            assert.deepEqual(storage[KEY], damaged); assert.equal(cacheWrites().length, 0);
        }
        reset(); storage[KEY] = before; readError = new Error("Fixture storage read failure");
        await assert.rejects(refresh(), /Fixture storage read failure/);
        assert.deepEqual(storage[KEY], before); assert.equal(cacheWrites().length, 0);
        console.log(`F PASS (${name}): unsupported structures and read failures still stop refresh without overwriting disk`);

        reset(); storage[KEY] = before; remoteBooks = [];
        await refresh(); assert.deepEqual(storage[KEY], []); assert.equal(cacheWrites().length, 1);
        console.log(`Empty cloud PASS (${name}): successful empty source list persists canonical []`);

        reset(); storage[KEY] = null; await seedHistory();
        for (let round = 1; round <= 2; round++) {
            const result = await refresh();
            const normal = name.startsWith("tab") ? await sync(plugin, "fixture-key", "template", { mode: "update" }) : result.normalResult;
            assert.equal(normal.planned, 0); assert.equal(normal.skippedUnchanged, 2);
            assert.ok(normal.items.every(item => item.status === "skipped_unchanged"));
        }
        assert.equal(cacheWrites().length, 2, "Normal book sync never rewrites its raw cache input");
        assert.deepEqual(requests, ["/user/notebooks", "/user/notebooks"]);
        console.log(`H PASS (${name}): two successful refresh/update rounds skip unchanged books with no remote detail requests`);
    }
    reset(); storage[KEY] = null;
    storage.weread_customBooksISBN = [{ bookID: "A", customISBN: ISBN_A }];
    await seedHistory();
    const protectedData = structuredClone({ custom: storage.weread_customBooksISBN, history: storage.weread_notebooks, index: storage.weread_note_unit_block_index_v1 });
    const cleared = await settings.clearWereadApiKey(plugin);
    assert.equal(cleared.verified, false); assert.deepEqual(storage[KEY], []);
    await settings.verifyAndSaveWereadApiKey(plugin, "fixture-key");
    assert.deepEqual(storage[KEY], []); await tabRefresh(); assert.ok(Array.isArray(storage[KEY]));
    assert.ok(cacheWrites().every(write => Array.isArray(write.value)));
    assert.deepEqual({ custom: storage.weread_customBooksISBN, history: storage.weread_notebooks, index: storage.weread_note_unit_block_index_v1 }, protectedData);
    console.log("C PASS: actual clear/verify services preserve canonical cache arrays (crypto/network mocked)");

    for (const key of ["weread_notebooks", "weread_api_bookshelf_cache", "weread_customBooksISBN"]) {
        reset(); storage[key] = null;
        await assert.rejects(merge(plugin, [])); assert.equal(storage[key], null); assert.equal(writes.length, 0);
    }
    reset(); storage[KEY] = [];
    const sentinel = structuredClone(storage); await assert.rejects(merge(plugin, {}), /来源数据格式异常/);
    assert.deepEqual(storage, sentinel); assert.equal(writes.length, 0);
    // Exercise real file/JSON reading too; invalid JSON must not be mistaken for historical JSON null.
    const previousFetch = global.fetch;
    try {
        for (const body of ["{broken", ""]) {
            global.fetch = async () => ({ status: 200, text: async () => body });
            await assert.rejects(merge({ ...plugin, loadDataStrict: undefined }, []), /JSON 格式无效|文件内容为空|could not be read/);
            assert.deepEqual(storage, sentinel); assert.equal(writes.length, 0);
        }
    } finally { global.fetch = previousFetch; }
    assert.equal(load("src/utils/weread/api/constants.ts").WEREAD_API_PROTOCOL_VERSION, "1.0.5");
    console.log("F/G PASS: other storage contracts remain strict; damaged JSON/fresh data cannot write; protocol remains 1.0.5");
    console.log("WeRead temporary cache smoke: ALL PASS (mocked I/O; not live account/SiYuan validation)");
})().catch(error => { console.error(error); process.exitCode = 1; });
