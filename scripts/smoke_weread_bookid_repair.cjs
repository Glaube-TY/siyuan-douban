// Real repair/claim code and panel handlers; all storage, SQL and AV I/O is synthetic.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const id = n => `20000101000000-${String(n).padStart(7, "0")}`;
const ISBN = "9787111128069", OTHER = "9787302423287", BOOK = "synthetic-A";
let count = 0;
async function test(name, run) { await run(); console.log(`PASS ${++count}: ${name}`); }
function fixture() {
    const data = {
        "settings.json": { bookDatabaseID: id(1) },
        weread_notebooks: [{ bookID: BOOK, title: "Synthetic A", isbn: ISBN, blockID: id(3) }],
        temporary_weread_notebooksList: [{ bookID: BOOK, title: "Synthetic A: subtitle", isbn: ISBN }],
        weread_customBooksISBN: [],
    };
    let columns = [
        { key: { id: id(10), name: "书名", type: "block" }, values: [{ id: id(11), keyID: id(10), blockID: id(3), block: { id: id(3), content: "Synthetic local A" } }] },
        { key: { id: id(20), name: "ISBN", type: "number" }, values: [{ id: id(21), blockID: id(3), number: { content: Number(ISBN), formattedContent: ISBN } }] },
        { key: { id: id(30), name: "bookID", type: "text" }, values: [{ id: id(31), blockID: id(3), text: { content: "" } }] },
    ];
    const docs = new Map([[id(3), "d"]]), attrs = new Map([[id(3), id(2)]]), writes = [], modules = new Map(), mocks = new Map();
    const state = { data, docs, attrs, writes, saves: 0, reads: 0, lag: 0, mode: "ok", hook: undefined, storageError: false, sqlInvalid: false, avInvalid: false, beforeClaim: undefined, forbidden: 0 };
    let stale;
    const forbid = () => { state.forbidden++; throw Error("Forbidden business write"); };
    const api = {
        sql: async stmt => {
            assert.match(stmt, /^SELECT /);
            if (state.sqlInvalid) return {};
            if (stmt.includes("markdown") || (stmt.includes("FROM blocks") && stmt.includes(id(1)))) return [{ id: id(1), markdown: `<div data-av-id="${id(2)}"></div>` }];
            if (stmt.includes("FROM attributes")) return [...attrs].filter(([key]) => stmt.includes(key)).map(([block_id, value]) => ({ block_id, value }));
            return [...docs].filter(([key]) => stmt.includes(key)).map(([id, type]) => ({ id, type }));
        },
        getAttributeView: async () => {
            state.reads++; if (state.hook) state.hook(state.reads);
            if (state.avInvalid) return {};
            if (stale && state.lag-- > 0) return { av: { keyValues: structuredClone(stale) } };
            return { av: { keyValues: structuredClone(columns) } };
        },
        reloadAttributeView: async () => { if (state.mode === "reload-error") throw Error("Reload unavailable"); },
        setAttributeViewBlockAttrStrict: async payload => {
            writes.push(structuredClone(payload));
            assert.equal(payload.avID, id(2)); assert.equal(payload.keyID, id(30)); assert.equal(payload.itemID, id(3)); assert.equal(payload.cellID, columns[2].values[0]?.id);
            assert.deepEqual(payload.value, { text: { content: BOOK } });
            if (state.mode === "reject") throw Error("Write rejected");
            if (state.mode === "noop") return;
            stale = structuredClone(columns);
            if (!columns[2].values[0]) columns[2].values.push({ id: id(31), blockID: id(3), text: { content: "" } });
            columns[2].values[0].text.content = BOOK;
            if (state.mode === "uncertain") throw Error("Transport lost after application");
        },
        addAttributeViewKeyStrict: forbid, createDocWithMd: forbid, removeAttributeViewBlocks: forbid,
        appendAttributeViewDetachedBlocksWithValues: forbid, setBlockAttrs: forbid,
    };
    mocks.set(path.join(root, "src/api.ts"), api);
    mocks.set(path.join(root, "src/utils/core/formatOp.ts"), { generateUniqueBlocked: forbid });
    function load(file) {
        const absolute = path.resolve(root, file);
        if (mocks.has(absolute)) return mocks.get(absolute);
        if (modules.has(absolute)) return modules.get(absolute).exports;
        const module = { exports: {} }; modules.set(absolute, module);
        const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function("require", "module", "exports", "console", code)(name => {
            assert.ok(name.startsWith(".") || name.startsWith("@/"));
            const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
            return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
        }, module, module.exports, { warn() {}, error() {} });
        return module.exports;
    }
    const plugin = { name: "siyuan-douban", i18n: {},
        loadDataStrict: async key => { if (state.storageError) throw Error("Synthetic storage failure"); return Object.hasOwn(data, key) ? { exists: true, value: structuredClone(data[key]) } : { exists: false }; },
        loadData: async key => structuredClone(data[key]), saveData: async () => { state.saves++; forbid(); },
    };
    const identity = load("src/utils/weread/api/wereadBookIdentity.ts"), originalClaim = identity.claimWereadBookIDOnExistingRow;
    identity.claimWereadBookIDOnExistingRow = (...args) => { if (state.beforeClaim) state.beforeClaim(); return originalClaim(...args); };
    load("src/utils/weread/api/wereadBookIdentityDiagnostics.ts").WEREAD_IDENTITY_READBACK_DELAYS = [0, 0, 0];
    const service = load("src/utils/weread/api/wereadBookIDRepair.ts");
    return Object.assign(state, { plugin, load, service, api, get columns() { return columns; },
        inspect: () => service.inspectWereadBookIDRepairCandidates(plugin),
        repair: snapshot => service.repairWereadBookIDForExistingSource(plugin, BOOK, snapshot),
        zero: () => { assert.equal(writes.length, 0); assert.equal(state.saves, 0); assert.equal(state.forbidden, 0); },
    });
}
async function candidate(f) { const result = await f.inspect(); assert.equal(result.status, "ok"); return result.items.find(item => item.bookID === BOOK); }
async function rejected(mutator, expected) {
    const f = fixture(), before = await candidate(f); mutator(f);
    const item = await candidate(f); assert.equal(item.status, expected);
    assert.notEqual((await f.repair(before.snapshot)).status, "success"); f.zero();
}
function panel(f) {
    const source = fs.readFileSync(path.join(root, "src/components/common/WereadBookIDRepairPanel.svelte"), "utf8");
    // Run the actual handlers; the DOM compiler's reactive busy value is evaluated synchronously here.
    let script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1].replace("export let plugin: any;", "const plugin = injectedPlugin;").replace(/^\s*\$:.*$/gm, "").replace(/\bbusy\b/g, "(writing || !!confirmation)");
    script += "\nreturn { refresh, confirmLink, get items(){return items}, get outcomes(){return outcomes}, get writing(){return writing}, get error(){return error} };";
    const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const dialogs = [], disposers = [];
    class Dialog {
        constructor(options) { this.options = options; this.nodes = new Map(); this.element = { querySelector: key => { if (!this.nodes.has(key)) this.nodes.set(key, { focus() {} }); return this.nodes.get(key); } }; dialogs.push(this); }
        destroy() { this.options.destroyCallback(); }
        click(key) { this.element.querySelector(key).onclick(); }
    }
    const controller = new Function("require", "exports", "injectedPlugin", compiled)(name => {
        if (name === "svelte") return { onMount() {}, onDestroy: callback => disposers.push(callback) };
        if (name === "siyuan") return { Dialog };
        return f.load(path.join("src/components/common", name) + ".ts");
    }, {}, f.plugin);
    return { ...controller, controller, dialogs, dispose: () => disposers.forEach(callback => callback()) };
}
async function idle(p) { for (let i = 0; p.controller.writing && i < 100; i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(p.controller.writing, false); }

(async () => {
    await test("unique ISBN / bound document / history agree; inspection is pure", async () => {
        const f = fixture(), before = JSON.stringify(f.data), item = await candidate(f);
        assert.equal(item.status, "eligible"); assert.notEqual(item.sourceTitle, item.localTitle);
        assert.equal(JSON.stringify(f.data), before); f.zero();
    });
    await test("actual panel cancel and close make zero business writes", async () => {
        const f = fixture(), p = panel(f); await p.controller.refresh();
        p.controller.confirmLink(p.controller.items[0]); p.dialogs[0].click("[data-cancel]"); f.zero();
        p.controller.confirmLink(p.controller.items[0]); p.dispose(); f.zero();
    });
    await test("confirmed repair changes only the selected bookID cell, then matches by bookID", async () => {
        const f = fixture(), item = await candidate(f), before = structuredClone(f.columns), storage = structuredClone(f.data);
        assert.equal((await f.repair(item.snapshot)).status, "success");
        before[2].values[0].text.content = BOOK; assert.deepEqual(f.columns, before); assert.deepEqual(f.data, storage);
        assert.equal(f.writes.length, 1); assert.equal(f.forbidden, 0); assert.equal(f.saves, 0);
        assert.equal(f.load("src/utils/weread/api/wereadBookIdentity.ts").matchWereadBookIdentity(f.load("src/utils/bookHandling/bookDeduplication.ts").buildBookIdentityRows(f.columns), { bookID: BOOK, isbn: ISBN }, f.data.weread_notebooks, false).matchType, "bookID");
        assert.equal((await f.repair(item.snapshot)).status, "already_linked"); assert.equal(f.writes.length, 1);
    });
    await test("duplicate ISBN rows refuse claim", () => rejected(f => {
        f.columns[0].values.push({ blockID: id(4), block: { id: id(4), content: "Other" } });
        f.columns[1].values.push({ blockID: id(4), number: { formattedContent: ISBN } });
    }, "conflict"));
    await test("an absent bookID cell is filled without adding a column or changing other values", async () => {
        const f = fixture(); f.columns[2].values = [];
        const item = await candidate(f);
        assert.equal(item.status, "eligible");
        assert.equal((await f.repair(item.snapshot)).status, "success");
        assert.equal(f.writes.length, 1); assert.equal(f.writes[0].cellID, undefined); assert.equal(f.forbidden, 0);
    });
    await test("multiple WeRead identities sharing one ISBN are blocked, including cache-only sources", () => rejected(f => f.data.temporary_weread_notebooksList.push({ bookID: "synthetic-B", title: "Other", isbn: ISBN }), "conflict"));
    await test("source ISBN disagreement never silently chooses a preferred value", () => rejected(f => { f.data.temporary_weread_notebooksList[0].isbn = OTHER; }, "conflict"));
    await test("another bookID occupying the row cannot be overwritten", () => rejected(f => { f.columns[2].values[0].text.content = "synthetic-B"; }, "conflict"));
    await test("history document drift blocks repair", () => rejected(f => { f.data.weread_notebooks[0].blockID = id(8); }, "conflict"));
    await test("missing or non-document targets block repair", async () => {
        await rejected(f => f.docs.delete(id(3)), "invalid_binding");
        await rejected(f => f.docs.set(id(3), "p"), "invalid_binding");
    });
    await test("custom-avs must contain the target AV", () => rejected(f => f.attrs.set(id(3), id(8)), "invalid_binding"));
    await test("target ISBN and bookID orphan conflicts block without cleanup", async () => {
        await rejected(f => f.columns[1].values.push({ blockID: id(9), number: { formattedContent: ISBN } }), "conflict");
        await rejected(f => f.columns[2].values.push({ blockID: id(9), text: { content: BOOK } }), "conflict");
    });
    await test("row/document/title/column/cell drift after preview rejects", async () => {
        for (const mutate of [f => { f.columns[0].values[0].block.content = "Changed"; }, f => { f.columns[0].values[0].blockID = id(8); }, f => { f.columns[0].values[0].block.id = id(8); }, f => { f.columns[2].key.id = id(8); }, f => { f.columns[2].values[0].id = id(8); }]) {
            const f = fixture(), item = await candidate(f); mutate(f); assert.notEqual((await f.repair(item.snapshot)).status, "success"); f.zero();
        }
    });
    await test("source/ISBN/config/history drift at the claim write boundary rejects", async () => {
        for (const mutate of [f => { f.data.temporary_weread_notebooksList[0].bookID = "synthetic-B"; }, f => { f.data.weread_notebooks[0].isbn = OTHER; }, f => { f.data["settings.json"].bookDatabaseID = id(8); }, f => { f.data.weread_notebooks[0].blockID = id(8); }, f => f.attrs.delete(id(3))]) {
            const f = fixture(), item = await candidate(f); f.beforeClaim = () => mutate(f);
            assert.notEqual((await f.repair(item.snapshot)).status, "success"); f.zero();
        }
    });
    await test("missing, damaged and failed storage/SQL/AV reads remain explicit with zero writes", async () => {
        for (const mutate of [f => { f.storageError = true; }, f => { f.sqlInvalid = true; }, f => { f.avInvalid = true; }, f => { f.data.weread_notebooks = null; }, f => { f.data.temporary_weread_notebooksList = {}; }]) {
            const f = fixture(); mutate(f); assert.equal((await f.inspect()).status, "read_error"); f.zero();
        }
        const f = fixture(); delete f.data.weread_notebooks; assert.equal((await f.inspect()).reasonCode, "HISTORY_MISSING"); f.zero();
        const g = fixture(); g.plugin.loadDataStrict = async () => { throw Error("插件存储 JSON 格式无效：synthetic"); };
        assert.equal((await g.inspect()).reasonCode, "STORAGE_CORRUPT"); g.zero();
        const k = fixture(); k.storageError = true; assert.equal((await k.inspect()).reasonCode, "STORAGE_READ_FAILED"); k.zero();
    });
    await test("successful write with stale readback retries reads only", async () => {
        const f = fixture(), item = await candidate(f); f.lag = 2;
        assert.equal((await f.repair(item.snapshot)).status, "success"); assert.equal(f.writes.length, 1);
    });
    await test("explicit rejection, uncertain write, timeout and reload failure never report success", async () => {
        for (const mode of ["reject", "uncertain", "noop", "reload-error"]) {
            const f = fixture(), item = await candidate(f); f.mode = mode;
            const result = await f.repair(item.snapshot);
            assert.equal(result.status, "read_error"); assert.equal(f.writes.length, 1);
            assert.match(result.stage, /^claim\./);
            assert.equal(result.reasonCode, ["reject", "uncertain"].includes(mode) ? "CLAIM_WRITE_FAILED" : mode === "noop" ? "CLAIM_READBACK_FAILED" : "CLAIM_RESULT_UNVERIFIED");
        }
    });
    await test("quick repeated calls and actual double-click submit at most once", async () => {
        const f = fixture(), item = await candidate(f), results = await Promise.all([f.repair(item.snapshot), f.repair(item.snapshot)]);
        assert.equal(f.writes.length, 1); assert.equal(results[1].reasonCode, "REPAIR_BUSY");
        const g = fixture(), p = panel(g); await p.controller.refresh();
        p.controller.confirmLink(p.controller.items[0]); p.controller.confirmLink(p.controller.items[0]); assert.equal(p.dialogs.length, 1);
        p.dialogs[0].click("[data-confirm]"); p.dialogs[0].click("[data-confirm]"); await idle(p);
        assert.equal(g.writes.length, 1); p.dispose();
    });
    await test("missing/wrong/removed columns never get created by this path", async () => {
        await rejected(f => { f.columns[2].key.type = "number"; }, "conflict");
        await rejected(f => { f.columns.splice(2, 1); }, "insufficient_evidence");
        const f = fixture(), item = await candidate(f); f.beforeClaim = () => f.columns.splice(2, 1);
        assert.notEqual((await f.repair(item.snapshot)).status, "success"); f.zero();
    });
    await test("duplicate identity cells, shared docs and other exact owners are rejected", async () => {
        await rejected(f => f.columns[2].values.push(structuredClone(f.columns[2].values[0])), "conflict");
        await rejected(f => f.data.weread_notebooks.push({ bookID: "synthetic-B", isbn: OTHER, blockID: id(3) }), "conflict");
        await rejected(f => { f.columns[0].values.push({ blockID: id(4), block: { id: id(4), content: "B" } }); f.columns[2].values.push({ blockID: id(4), text: { content: BOOK } }); }, "conflict");
    });
    await test("MP excluded, custom ISBN migrated only in memory, temporary legacy null accepted", async () => {
        const f = fixture(); f.data.weread_notebooks.push({ bookID: "MP_WXS_synthetic", sourceType: "weread_mp_account" });
        f.data.temporary_weread_notebooksList = null; f.data.weread_customBooksISBN = { [BOOK]: { isbn: ISBN } };
        const before = structuredClone(f.data); assert.equal((await f.inspect()).items.length, 1); assert.deepEqual(f.data, before); f.zero();
    });
    await test("opening existing management tabs reads without migrations or orphan cleanup", async () => {
        const f = fixture(); f.columns[1].values.push({ blockID: id(9), number: { formattedContent: OTHER } });
        const identifiers = await f.load("src/utils/weread/getCurrentValidBookIdentifiers.ts").getCurrentValidBookIdentifiers(f.plugin, { cleanupOrphans: false }); f.zero();
        assert.equal(identifiers.validISBNs.has(ISBN), true);
        assert.equal(identifiers.validISBNs.has(OTHER), false);
        const source = fs.readFileSync(path.join(root, "src/components/common/WereadBookManagementDialog.svelte"), "utf8");
        for (const key of ["synced", "ignored", "isbn", "bookid", "repair"]) assert.ok(source.includes(`key: "${key}"`));
        assert.ok(source.includes("{ migrate: false }")); assert.ok(source.includes("{ cleanupOrphans: false }"));
    });
    console.log(`WeRead bookID repair: ${count} scenarios PASS (synthetic only; no live writes or sync)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
