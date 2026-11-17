// Actual search and strict storage readers; fixture I/O only, no user data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const modules = new Map();
function load(file) {
    const absolute = path.resolve(root, file);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} }; modules.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "module", "exports", code)(name => {
        if (name === "siyuan" || name.includes("wereadDialogs") || name.includes("readingCenterData") || name.includes("openDoc")) return {};
        if (name.includes("findWereadApiBookTargetDoc")) return { attachWereadApiLocalNoteDocs: async (_plugin, books) => books };
        assert.ok(name.startsWith("."));
        return load(path.resolve(path.dirname(absolute), name) + ".ts");
    }, module, module.exports);
    return module.exports;
}
const { loadWereadSearchLibrary: readLibrary, searchWereadLibraryBooks: search } = load("src/utils/bookSearch/wereadBookSearchService.ts");
const NOTES = "temporary_weread_notebooksList", SHELF = "weread_api_bookshelf_cache";
const book = { bookID: "fixture-book", title: "命若琴弦", author: "史铁生" };
function fixture() {
    const responses = new Map(), calls = [];
    const plugin = {
        name: "siyuan-douban", i18n: {},
        loadData: async () => "", // SiYuan returns this fallback when a cache file is missing.
        saveData: async () => { throw Error("Search must never write storage"); },
    };
    global.fetch = async (url, options) => {
        assert.equal(url, "/api/file/getFile"); assert.equal(options.method, "POST");
        const filePath = JSON.parse(options.body).path;
        assert.ok([NOTES, SHELF].some(key => filePath === "/data/storage/petal/siyuan-douban/" + key));
        const key = filePath.split("/").at(-1); calls.push(key);
        const response = responses.get(key);
        if (response instanceof Error) throw response;
        if (typeof response === "function") return response();
        return new Response(response?.body ?? JSON.stringify({ code: 404, msg: "fixture missing" }), { status: response?.status ?? 202 });
    };
    return {
        plugin, calls,
        raw: (key, body, status = 200) => responses.set(key, { body, status }),
        json: (key, value) => responses.set(key, { body: JSON.stringify(value), status: 200 }),
        fail: (key, error) => responses.set(key, error),
    };
}
let count = 0;
async function test(name, run) { await run(); console.log("PASS " + (++count) + ": " + name); }
const originalFetch = global.fetch;
(async () => {
    await test("both caches missing are a valid empty search library", async () => {
        const f = fixture(); assert.deepEqual(await readLibrary(f.plugin), []);
        assert.deepEqual(new Set(f.calls), new Set([NOTES, SHELF]));
    });
    await test("first-run missing notes cache still allows searching shelf books", async () => {
        const f = fixture(); f.json(SHELF, [book]);
        const results = await search(f.plugin, book.title);
        assert.equal(results.length, 1); assert.equal(results[0].bookID, book.bookID);
        assert.equal(results[0].raw.hasWereadNotes, false); assert.equal(results[0].raw.inWereadShelf, true);
    });
    await test("missing shelf cache preserves books with notes", async () => {
        const f = fixture(); f.json(NOTES, [{ ...book, noteCount: 3 }]);
        const books = await readLibrary(f.plugin);
        assert.equal(books.length, 1); assert.equal(books[0].hasWereadNotes, true); assert.equal(books[0].inWereadShelf, false);
    });
    await test("legacy JSON null notes cache remains compatible", async () => {
        const f = fixture(); f.json(NOTES, null); f.json(SHELF, [book]);
        assert.equal((await readLibrary(f.plugin)).length, 1);
    });
    await test("explicit empty arrays remain valid", async () => {
        const f = fixture(); f.json(NOTES, []); f.json(SHELF, []);
        assert.deepEqual(await readLibrary(f.plugin), []);
    });
    await test("merging keeps note metadata and shelf metadata without changing cached data", async () => {
        const f = fixture(), notes = [{ ...book, noteCount: 3, localDocBlockID: "fixture-doc" }];
        const shelf = [{ bookId: book.bookID, title: book.title, publisher: "fixture-publisher" }];
        const original = JSON.stringify({ notes, shelf }); f.json(NOTES, notes); f.json(SHELF, shelf);
        const books = await readLibrary(f.plugin);
        assert.equal(books.length, 1); assert.equal(books[0].noteCount, 3);
        assert.equal(books[0].localDocBlockID, "fixture-doc"); assert.equal(books[0].publisher, "fixture-publisher");
        assert.equal(books[0].hasWereadNotes, true); assert.equal(books[0].inWereadShelf, true);
        assert.equal(JSON.stringify({ notes, shelf }), original);
    });
    for (const key of [NOTES, SHELF]) {
        for (const value of ["", {}, 7, ...(key === SHELF ? [null] : [])]) await test(key + " rejects persisted non-array " + JSON.stringify(value), async () => {
            const f = fixture(); f.json(key, value);
            await assert.rejects(readLibrary(f.plugin), /格式异常/);
        });
        await test(key + " rejects invalid JSON", async () => {
            const f = fixture(); f.raw(key, "{broken");
            await assert.rejects(readLibrary(f.plugin), /JSON 格式无效/);
        });
        await test(key + " rejects empty files", async () => {
            const f = fixture(); f.raw(key, "");
            await assert.rejects(readLibrary(f.plugin), /文件内容为空/);
        });
        await test(key + " preserves permission errors", async () => {
            const f = fixture(); f.raw(key, JSON.stringify({ code: 403, msg: "fixture denied" }), 403);
            await assert.rejects(readLibrary(f.plugin), /fixture denied/);
        });
        await test(key + " preserves network errors", async () => {
            const f = fixture(); f.fail(key, Error("fixture network failure"));
            await assert.rejects(readLibrary(f.plugin), /fixture network failure/);
        });
    }
    await test("failed response body reads are not treated as missing files", async () => {
        const f = fixture(); f.fail(NOTES, () => ({ status: 200, text: async () => { throw Error("fixture read failed"); } }));
        await assert.rejects(readLibrary(f.plugin), /fixture read failed/);
    });
    await test("non-JSON missing-file responses remain errors", async () => {
        const f = fixture(); f.raw(NOTES, "fixture unexpected response", 202);
        await assert.rejects(readLibrary(f.plugin), /响应 JSON 格式无效/);
    });
    await test("strict adapters are reused without falling back to SDK or HTTP", async () => {
        const f = fixture();
        f.plugin.loadDataStrict = async key => key === NOTES ? { exists: false } : { exists: true, value: [book] };
        assert.equal((await readLibrary(f.plugin)).length, 1); assert.equal(f.calls.length, 0);
        f.plugin.loadDataStrict = async () => { throw Error("fixture adapter failed"); };
        await assert.rejects(readLibrary(f.plugin), /fixture adapter failed/);
    });
    console.log("WeRead search cache checks passed: " + count);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
