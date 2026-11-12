// Actual creation/completion/template code; synthetic host only, no network or user data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const id = n => "20000101000000-" + String(n).padStart(7, "0");
let count = 0;
async function test(name, run) { await run(); console.log("PASS " + (++count) + ": " + name); }

function fixture() {
    let next = 100;
    const templateFiles = new Map();
    const types = { "封面": "mAsset", "副标题": "text", "原作名": "text", "作者": "text", "译者": "text",
        "出版社": "text", "出版年": "date", "出品方": "text", "丛书": "text", "ISBN": "number",
        "豆瓣评分": "number", "评分人数": "number", "定价": "number", "页数": "number", "装帧": "text",
        "我的评分": "select", "书籍分类": "select", "阅读状态": "select", "开始日期": "date",
        "读完日期": "date", "书籍简介": "text", "作者介绍": "text" };
    const columns = [{ key: { id: id(10), name: "书名", type: "block" }, values: [] }];
    for (const [name, type] of Object.entries(types)) columns.push({ key: { id: id(next++), name, type }, values: [] });
    const docs = new Map(), attrs = new Map(), calls = [], modules = new Map();
    const state = { mode: "ok", frontend: "mobile", docLag: 0, beforeAppend: null, beforeBind: null, wrongLocation: false, docType: "d" };
    const good = data => ({ code: 0, msg: "", data });
    const bad = msg => ({ code: -1, msg, data: null });
    const parent = { id: id(1), box: id(3), hpath: "/books", root_id: id(2), path: "/" + id(2) + ".sy", markdown: '<div data-av-id="' + id(4) + '"></div>' };
    async function fetchSyncPost(url, body) {
        calls.push({ url, body });
        switch (url) {
            case "/api/av/getAttributeView": return good({ av: { keyValues: structuredClone(columns) } });
            case "/api/av/getAttributeViewKeysByAvID": return good(columns.map(c => structuredClone(c.key)));
            case "/api/av/appendAttributeViewDetachedBlocksWithValues":
                for (const row of body.blocksValues) for (const value of row) {
                    const column = columns.find(c => c.key.id === value.keyID);
                    const cell = { ...structuredClone(value), id: id(next++), blockID: row[0].blockID, type: column.key.type,
                        isDetached: true, createdAt: 1, updatedAt: 1 };
                    if (cell.block) { delete cell.block.id; cell.block.created = 1; cell.block.updated = 1; }
                    column.values.push(cell);
                }
                return good(null);
            case "/api/query/sql":
                if (state.mode === "sql-read-error") return bad("synthetic SQL read error");
                if (body.stmt.includes(id(1))) return good([parent]);
                if (body.stmt.includes("hpath =")) return good(state.mode === "path-occupied" ? [{ id: id(99) }] : []);
                if (state.docLag > 0 && body.stmt.includes("SELECT id, type")) { state.docLag--; return good([]); }
                return good([...docs.keys()].filter(key => body.stmt.includes(key)).map(key => ({
                    id: key, type: state.docType, box: id(3), path: state.wrongLocation ? "/other/" + key + ".sy" : "/" + id(2) + "/" + key + ".sy",
                })));
            case "/api/filetree/createDocWithMd":
                assert.equal(docs.has(body.id), false, "Never create over an existing document");
                if (state.mode === "create-rejected") return bad("synthetic create error");
                if (state.mode === "create-wrong-id") return good(id(99));
                docs.set(body.id, body.markdown);
                if (state.mode === "create-response-lost") throw Error("synthetic lost create response");
                return good(body.id);
            case "/api/system/getConf": return good({ conf: { system: { dataDir: "D:/Synthetic/data" } } });
            case "/api/system/getWorkspaceInfo": return good({ workspaceDir: "D:/Synthetic" });
            case "/api/file/putFile": templateFiles.set(body.get("path"), await body.get("file").text()); return good(null);
            case "/api/file/removeFile": templateFiles.delete(body.path); return good(null);
            case "/api/ui/reloadAttributeView": return good(null);
            case "/api/template/render":
                if (state.mode === "render-rejected") return bad("synthetic template error");
                await new Promise(resolve => setTimeout(resolve, 0));
                const template = templateFiles.get(body.path.slice(body.path.indexOf("/data/templates/")));
                assert.equal(typeof template, "string");
                return good({ content: state.mode === "empty-render" ? "" : state.mode === "empty-paragraph"
                    ? '<div data-type="NodeParagraph"><div contenteditable="true">&nbsp;</div></div>'
                    : state.mode === "image-only" ? '<div data-type="NodeParagraph"><img src="assets/cover.png"></div>'
                        : '<div data-type="NodeParagraph">' + template + "</div>" });
            case "/api/block/getBlockKramdown":
                if (state.mode === "content-read-error") return bad("synthetic body read error");
                if (state.mode === "content-read-invalid") return good({});
                return good({ id: body.id, kramdown: docs.get(body.id) });
            case "/api/block/appendBlock":
                if (state.beforeAppend) state.beforeAppend(body.parentID);
                if (state.mode === "append-rejected") return bad("synthetic append error");
                if (state.mode !== "append-noop") docs.set(body.parentID, docs.get(body.parentID) + body.data);
                if (state.mode === "append-response-lost") throw Error("synthetic lost append response");
                return good([]);
            case "/api/attr/getBlockAttrs":
                if (state.mode === "attrs-read-error") return bad("synthetic attribute read error");
                return good(structuredClone(attrs.get(body.id) || {}));
            case "/api/av/setAttributeViewBlockAttr": {
                if (state.beforeBind) state.beforeBind();
                if (state.mode === "binding-rejected") return bad("synthetic binding error");
                if (state.mode === "binding-noop") return good(null);
                const cell = columns.find(c => c.key.id === body.keyID)?.values.find(v => v.blockID === body.itemID);
                assert.ok(cell, "The binding must target the exact existing row");
                cell.block = { ...cell.block, ...structuredClone(body.value.block), refSubtype: "d" };
                cell.isDetached = false;
                const previous = attrs.get(body.value.block.id) || {};
                attrs.set(body.value.block.id, { ...previous, "custom-avs": [...new Set([...(previous["custom-avs"] || "").split(",").filter(Boolean), id(4)])].join(",") });
                if (state.mode === "binding-response-lost") throw Error("synthetic lost binding response");
                return good(null);
            }
            default: throw Error("Unexpected endpoint (including destructive writes): " + url);
        }
    }
    function load(file) {
        const absolute = path.resolve(root, file);
        if (absolute === path.join(root, "src/utils/core/formatOp.ts")) return { generateUniqueBlocked: () => id(next++), parseDateToTimestamp: () => null };
        if (absolute === path.join(root, "src/utils/core/getImg.ts")) return { getImage: async () => "", downloadCover: async () => "" };
        if (modules.has(absolute)) return modules.get(absolute).exports;
        const module = { exports: {} }; modules.set(absolute, module);
        const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function("require", "module", "exports", code)(name => {
            if (name === "siyuan") return { fetchSyncPost, getFrontend: () => state.frontend };
            assert.ok(name.startsWith(".") || name.startsWith("@/"));
            const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
            return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
        }, module, module.exports);
        return module.exports;
    }
    const plugin = { i18n: {} };
    const book = { title: "Synthetic book", ISBN: "9787536692930", authors: ["Synthetic author"], addNotes: true,
        databaseBlockId: id(1), noteTemplate: "# {{书名}}\n{{作者}}\n{{ISBN}}", cover: "" };
    const service = load("src/utils/bookHandling/ensureBookNoteDocument.ts");
    service.BOOK_NOTE_READBACK_DELAYS.splice(0, service.BOOK_NOTE_READBACK_DELAYS.length, 0, 0, 0);
    return Object.assign(state, { columns, docs, attrs, calls, book, plugin, load, service,
        primary: () => columns[0].values[0], save: (overrides, options) => load("src/utils/bookHandling/index.ts").loadAVData(id(4), { ...book, ...overrides }, plugin, options),
        complete: () => service.ensureBookNoteDocument(plugin, id(4), columns[0].values[0].blockID, book),
        callsTo: url => calls.filter(c => c.url === url),
    });
}

(async () => {
    for (const frontend of ["mobile", "desktop", "browser-mobile"]) await test("verified note creation on " + frontend, async () => {
        const f = fixture(); f.frontend = frontend;
        const result = await f.save(); assert.equal(result.code, 0);
        assert.equal(f.primary().block.id, result.rowBlockID); assert.equal(f.primary().isDetached, false);
        assert.match(f.docs.get(result.rowBlockID), /Synthetic book/);
    });
    for (const mode of ["create-rejected", "create-wrong-id", "render-rejected", "empty-render", "empty-paragraph", "append-rejected", "append-noop", "binding-rejected", "binding-noop", "content-read-error", "content-read-invalid", "attrs-read-error"]) await test("failure is reported with recoverable row: " + mode, async () => {
        const f = fixture(); f.mode = mode;
        const result = await f.save(); assert.equal(result.code, 1); assert.equal(result.partial, true); assert.equal(result.rowBlockID, f.primary().blockID);
        assert.match(result.msg, /书籍已入库/);
    });
    for (const mode of ["create-response-lost", "append-response-lost", "binding-response-lost"]) await test("readback resolves uncertain write: " + mode, async () => {
        const f = fixture(); f.mode = mode;
        assert.equal((await f.save()).code, 0); assert.equal(f.primary().block.id, f.primary().blockID);
    });
    await test("invalid template and parent fail before creating a row", async () => {
        const f = fixture(); assert.equal((await f.save({ noteTemplate: " " })).code, 1);
        f.mode = "sql-read-error"; assert.equal((await f.save()).code, 1);
        assert.equal(f.columns[0].values.length, 0);
    });
    await test("failed rendering resumes on the same row and document without duplicates", async () => {
        const f = fixture(); f.mode = "render-rejected"; const result = await f.save();
        f.mode = "ok"; assert.equal(await f.complete(), result.rowBlockID); await f.complete();
        assert.equal(f.callsTo("/api/filetree/createDocWithMd").length, 1);
        assert.equal(f.callsTo("/api/block/appendBlock").length, 1); assert.equal(f.columns[0].values.length, 1);
    });
    await test("existing user content and other database associations are preserved byte for byte", async () => {
        const f = fixture(); f.mode = "binding-rejected"; const result = await f.save();
        const body = "用户原有笔记\n\n![cover](assets/original.png)\n\n自定义书摘";
        f.docs.set(result.rowBlockID, body); f.attrs.set(result.rowBlockID, { "custom-avs": id(98), custom: "retained" });
        f.mode = "ok"; const renders = f.callsTo("/api/template/render").length;
        await f.complete(); assert.equal(f.docs.get(result.rowBlockID), body);
        assert.equal(f.callsTo("/api/template/render").length, renders);
        assert.ok(f.attrs.get(result.rowBlockID)["custom-avs"].split(",").includes(id(98)));
        assert.equal(f.attrs.get(result.rowBlockID).custom, "retained");
    });
    await test("concurrent edits survive the template append", async () => {
        const f = fixture(); f.beforeAppend = docID => f.docs.set(docID, "Concurrent user note\n");
        const result = await f.save(); assert.equal(result.code, 0); assert.match(f.docs.get(result.rowBlockID), /^Concurrent user note/);
    });
    for (const conflict of ["duplicate-isbn", "other-parent", "non-document", "shared-document", "changed-title"]) await test("completion fails closed on " + conflict, async () => {
        const f = fixture(); f.mode = "render-rejected"; await f.save(); f.mode = "ok";
        if (conflict === "duplicate-isbn") f.columns.find(c => c.key.name === "ISBN").values.push({ blockID: id(99), number: { formattedContent: f.book.ISBN } });
        if (conflict === "other-parent") f.wrongLocation = true;
        if (conflict === "non-document") f.docType = "p";
        if (conflict === "shared-document") f.columns[0].values.push({ blockID: id(99), block: { id: f.primary().blockID } });
        if (conflict === "changed-title") f.primary().block.content = "Changed by user";
        const before = f.calls.length; await assert.rejects(f.complete());
        assert.equal(f.calls.slice(before).filter(c => ["/api/block/appendBlock", "/api/av/setAttributeViewBlockAttr", "/api/filetree/createDocWithMd"].includes(c.url)).length, 0);
    });
    await test("an occupied document path is never overwritten", async () => {
        const f = fixture(); f.mode = "path-occupied"; assert.equal((await f.save()).code, 1);
        assert.equal(f.callsTo("/api/filetree/createDocWithMd").length, 0);
    });
    await test("images are valid note content", async () => {
        const f = fixture(); f.mode = "image-only"; assert.equal((await f.save()).code, 0);
    });
    await test("database-only imports retain their existing behavior", async () => {
        const f = fixture(); assert.equal((await f.save({ addNotes: false, noteTemplate: "" })).code, 0);
        assert.equal(f.docs.size, 0); assert.equal(f.primary().isDetached, true);
    });
    await test("binding uses the row ID separately from its document ID", async () => {
        const f = fixture(); await f.save({ addNotes: false });
        await f.load("src/utils/bookHandling/bindBookToNote.ts").bindBookToNote(id(4), id(99), f.primary());
        const payload = f.callsTo("/api/av/setAttributeViewBlockAttr").at(-1).body;
        assert.equal(payload.itemID, f.primary().blockID); assert.equal(payload.value.block.id, id(99));
    });
    await test("legacy WeRead empty templates keep an empty document available for later sync", async () => {
        const f = fixture(); f.docs.set(id(90), ""); f.mode = "empty-render";
        await f.load("src/utils/template/renderBookNoteTemplate.ts").renderBookNoteTemplate(id(90), "");
        assert.equal(f.docs.get(id(90)), ""); assert.equal(f.callsTo("/api/block/appendBlock").length, 0);
    });
    await test("legacy WeRead conditional templates may render no content", async () => {
        const f = fixture(); f.docs.set(id(90), ""); f.mode = "empty-paragraph";
        await f.load("src/utils/template/renderBookNoteTemplate.ts").renderBookNoteTemplate(id(90), "{{if false}}content{{end}}");
        assert.equal(f.docs.get(id(90)), ""); assert.equal(f.callsTo("/api/block/appendBlock").length, 0);
    });
    await test("WeRead ISBN imports with empty templates still create and bind exactly one document", async () => {
        const f = fixture(); f.mode = "empty-render";
        const result = await f.save({ noteTemplate: "" }, { requireNoteContent: false });
        assert.equal(result.code, 0); assert.equal(f.primary().block.id, result.rowBlockID);
        assert.equal(f.docs.get(result.rowBlockID), ""); assert.equal(f.callsTo("/api/block/appendBlock").length, 0);
    });
    await test("concurrent Douban and WeRead template operations use isolated temporary files", async () => {
        const f = fixture(), render = f.load("src/utils/template/renderBookNoteTemplate.ts").renderBookNoteTemplate;
        f.docs.set(id(90), ""); f.docs.set(id(91), "");
        await Promise.all([render(id(90), "Douban template"), render(id(91), "WeRead template")]);
        assert.match(f.docs.get(id(90)), /Douban template/); assert.doesNotMatch(f.docs.get(id(90)), /WeRead template/);
        assert.match(f.docs.get(id(91)), /WeRead template/);
        assert.equal(new Set(f.callsTo("/api/file/putFile").map(c => c.body.get("path"))).size, 2);
        assert.equal(f.callsTo("/api/file/removeFile").length, 2);
    });
    await test("template completion waits for SQL visibility without repeating its write", async () => {
        const f = fixture(); f.beforeAppend = () => { f.docLag = 2; };
        assert.equal((await f.save()).code, 0); assert.equal(f.docLag, 0);
        assert.equal(f.callsTo("/api/block/appendBlock").length, 1);
    });
    await test("SQL readback timeout preserves content and allows a later completion", async () => {
        const f = fixture(); f.beforeAppend = () => { f.docLag = 100; };
        const result = await f.save(); assert.equal(result.code, 1); assert.equal(result.partial, true);
        assert.ok(f.docs.get(result.rowBlockID)); assert.equal(f.callsTo("/api/block/appendBlock").length, 1);
        f.docLag = 0; f.beforeAppend = null; await f.complete();
        assert.equal(f.callsTo("/api/block/appendBlock").length, 1);
    });
    await test("computed columns with no stored cells remain compatible", async () => {
        const f = fixture(); f.columns.push({ key: { id: id(98), name: "Created", type: "created" }, values: null });
        assert.equal((await f.save()).code, 0);
    });
    await test("the explicit completion service reuses the matched ISBN row and keeps metadata", async () => {
        const f = fixture(); f.mode = "render-rejected"; const failed = await f.save(); f.mode = "ok";
        const defaults = f.load("src/utils/core/configDefaults.ts").DEFAULT_SETTINGS;
        f.plugin.loadData = async () => ({ ...defaults, bookDatabaseID: id(1), noteTemplate: f.book.noteTemplate });
        f.plugin.saveData = async () => { throw Error("Unexpected settings write"); };
        const service = f.load("src/utils/bookSearch/doubanBookUpdateService.ts"), book = { ...f.book, isbn: f.book.ISBN };
        const expected = await service.inspectDoubanLocalBookMatch(f.plugin, book);
        assert.equal(expected.canCompleteNote, true);
        const fields = structuredClone(f.columns.slice(1));
        const result = await service.completeEditedDoubanBookNote(f.plugin, book, expected);
        assert.equal(result.code, 0); assert.equal(result.rowBlockID, failed.rowBlockID);
        assert.deepEqual(f.columns.slice(1), fields);
        assert.equal((await service.inspectDoubanLocalBookMatch(f.plugin, book)).canCompleteNote, false);
        const before = f.calls.length;
        await assert.rejects(service.completeEditedDoubanBookNote(f.plugin, { ...book, isbn: "9787302423287" }, expected));
        assert.equal(f.calls.length, before);
    });
    await test("inconsistent detached document candidates stop before writing", async () => {
        const f = fixture(); f.mode = "render-rejected"; await f.save(); f.mode = "ok";
        f.primary().block.id = id(99);
        const before = f.calls.length; await assert.rejects(f.complete());
        assert.equal(f.calls.slice(before).some(c => c.url === "/api/block/appendBlock" || c.url === "/api/av/setAttributeViewBlockAttr"), false);
    });
    await test("English partial failures and completion labels are localized", async () => {
        const f = fixture(); f.plugin.i18n = JSON.parse(fs.readFileSync(path.join(root, "public/i18n/en_US.json"), "utf8"));
        f.mode = "render-rejected"; const result = await f.save();
        assert.match(result.msg, /The book was added/); assert.match(result.msg, /generating content/);
    });
    await test("empty document IAL is not mistaken for content", async () => {
        const f = fixture(), content = f.load("src/utils/template/renderBookNoteTemplate.ts").hasBookNoteContent;
        assert.equal(content('\n{: id="doc" title="Book"}\n\n{: id="paragraph"}\n'), false);
        assert.equal(content('![cover](assets/cover.png)\n{: id="doc"}'), true);
    });
    console.log("Douban note smoke checks passed: " + count);
})().catch(error => { console.error(error); process.exitCode = 1; });
