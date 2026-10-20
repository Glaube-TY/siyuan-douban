// Execute production readers and Svelte handlers; every I/O dependency uses synthetic data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const existing = fs.readFileSync(path.join(__dirname, "smoke_weread_bookid_repair.cjs"), "utf8");
const { fixture, panel, id, ISBN, OTHER, BOOK } = new Function("require", "__dirname", existing.slice(0, existing.indexOf("(async () => {")) + "\nreturn { fixture, panel, id, ISBN, OTHER, BOOK };")(require, __dirname);
let count = 0;
async function test(name, run) { await run(); console.log(`PASS ${++count}: ${name}`); }
const read = f => f.load("src/utils/weread/getCurrentValidBookIdentifiers.ts").getCurrentValidBookIdentifiers;
const componentSource = name => fs.readFileSync(path.join(root, "src/components/common", name + ".svelte"), "utf8");

function component(name, f, props, expose) {
    let script = componentSource(name).match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
    const ast = ts.createSourceFile("component.ts", script, ts.ScriptTarget.Latest, true);
    const printer = ts.createPrinter();
    script = ast.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isLabeledStatement(node)).map(node => {
        if (ts.isVariableStatement(node) && node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
            return node.declarationList.declarations.map(declaration => `let ${declaration.name.getText(ast)} = props.${declaration.name.getText(ast)};`).join("\n");
        }
        return printer.printNode(ts.EmitHint.Unspecified, node, ast);
    }).join("\n");
    const compiled = ts.transpileModule(script + "\nreturn {" + expose + "};", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const mounts = [], disposers = [], messages = [];
    const storage = f.load("src/utils/weread/wereadSyncStorage.ts"), isbn = f.load("src/utils/bookHandling/isbn.ts");
    const helpers = { ...storage, ...isbn, ...f.load("src/utils/weread/wereadManagementSaveGuard.ts") };
    const names = ["getIgnoredBookIDSet", "getWereadStorageKey", "loadIgnoredBooks", "replaceIgnoredBooks", "replaceCustomISBNBooks", "isValidISBN", "normalizeISBN", "readWereadManagementSnapshot", "saveWereadManagementData", "wereadManagementSaveMessage", "validateWereadManagementRecords", "wereadManagementSourceType"];
    const controller = new Function("props", "onMount", "onDestroy", "showMessage", "t", "loadPluginStorageJsonStateStrict", "getCurrentValidBookIdentifiers", "loadCustomISBNBooksWithMigration", ...names, compiled)(
        { plugin: f.plugin, ...props }, fn => mounts.push(fn), fn => disposers.push(fn), text => messages.push(text),
        f.load("src/utils/i18n.ts").t,
        f.load("src/utils/storage/pluginStorageStrict.ts").loadPluginStorageJsonStateStrict,
        read(f), storage.loadCustomISBNBooksWithMigration, ...names.map(name => helpers[name]),
    );
    return Object.assign(controller, { init: () => Promise.all(mounts.map(fn => fn())), dispose: () => disposers.forEach(fn => fn()), messages });
}
function manager(f, initialTab) {
    return component("WereadBookManagementDialog", f, { initialTab }, "get activeTab(){return activeTab}, get error(){return loadError}, get records(){return {syncedRecords,ignoredBooks,customISBNBooks,useBookIDBooks,validISBNs,validBookIDs}}, select(tab){activeTab=tab}");
}
function editor(f) {
    const events = { confirmed: 0, cancelled: 0 };
    const controller = component("wereadUseBookIDBooksDialog", f, {
        useBookIDBooks: structuredClone(f.data.weread_useBookIDBooks || []), validBookIDs: [BOOK],
        onConfirm: () => events.confirmed++, onCancel: () => events.cancelled++,
    }, "save:handleSave,cancel:handleCancel,clear:handleClearStale,delete:handleDeleteEffective,get error(){return errorText},get saving(){return isSaving},get blocked(){return needsRecheck},get records(){return [...localEffectiveBooks,...localStaleBooks]}");
    return Object.assign(controller, { events });
}
function writable() {
    const f = fixture();
    f.data.weread_useBookIDBooks = [{ bookID: BOOK, title: "Synthetic", isbn: ISBN, metadata: { retained: true } }, { bookID: "stale", title: "Stale", extra: 7 }];
    f.plugin.saveData = async (key, value) => { f.saves++; f.data[key] = structuredClone(value); };
    return f;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
    await test("all three original buttons execute unified dialog handlers with the correct initial tab", async () => {
        const source = fs.readFileSync(path.join(root, "src/components/tabs/WereadTab.svelte"), "utf8");
        const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
        const ast = ts.createSourceFile("tab.ts", script, ts.ScriptTarget.Latest, true);
        const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createWereadBookManagementDialog");
        assert.ok(fn);
        const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        const opened = [], f = fixture();
        class Unified { constructor(options) { opened.push(options.props); } }
        const handler = new Function("svelteDialog", "WereadBookManagementDialog", "plugin", "i18n", "mobile", js + "\nreturn createWereadBookManagementDialog;")(
            options => { options.constructor({}); return { close() {} }; }, Unified, f.plugin, {}, false,
        );
        for (const tab of ["synced", "isbn", "bookid"]) {
            const expression = source.match(new RegExp(`on:click=\\{(\\(\\) => createWereadBookManagementDialog\\("${tab}"\\))\\}`))?.[1];
            assert.ok(expression, tab);
            new Function("createWereadBookManagementDialog", "return (" + expression + ");")(handler)();
            assert.equal(opened.at(-1).initialTab, tab);
            const p = manager(f, tab); await p.init(); assert.equal(p.error, ""); assert.equal(p.activeTab, tab); f.zero();
        }
        assert.ok(!source.includes("removeAttributeViewBlocks"));
    });
    for (const tab of ["synced", "ignored", "isbn", "bookid", "repair"]) await test(`open and switch ${tab}: zero business writes`, async () => {
        const f = fixture(); f.data.weread_useBookIDBooks = [{ bookID: BOOK }];
        const before = structuredClone(f.data), p = manager(f, tab); await p.init();
        assert.equal(p.error, ""); p.select("isbn"); p.select(tab); assert.equal(p.activeTab, tab);
        if (tab === "repair") { const r = panel(f); await r.controller.refresh(); assert.equal(r.controller.items.length, 1); r.dispose(); }
        assert.deepEqual(f.data, before); f.zero();
    });
    await test("orphan ISBN and BookID stay untouched and excluded, even with legacy cleanup=true", async () => {
        const f = fixture(); f.columns[1].values.push({ blockID: id(90), number: { formattedContent: OTHER } });
        f.columns[2].values.push({ itemID: id(91), text: { content: "orphan" } });
        f.columns[2].values[0].text.content = BOOK;
        f.columns[0].values[0].block.id = id(50); // Document ID is not the row ID.
        delete f.columns[1].values[0].number.content;
        const before = structuredClone(f.columns);
        for (const options of [undefined, { cleanupOrphans: true }, { cleanupOrphans: false }]) {
            const result = await read(f)(f.plugin, options);
            assert.deepEqual([...result.validISBNs], [ISBN]); assert.deepEqual([...result.validBookIDs], [BOOK]);
        }
        assert.deepEqual(f.columns, before); f.zero();
    });
    await test("valid empty primary rows yield empty identities while orphan cells remain", async () => {
        const f = fixture(); f.columns[0].values.length = 0;
        const result = await read(f)(f.plugin); assert.equal(result.validISBNs.size, 0); assert.equal(result.validBookIDs.size, 0); f.zero();
    });
    const broken = {
        "missing settings": f => delete f.data["settings.json"],
        "null settings": f => f.data["settings.json"] = null,
        "invalid database ID": f => f.data["settings.json"].bookDatabaseID = "invalid",
        "storage read failure": f => f.storageError = true,
        "SQL failure": f => f.api.sql = async () => { throw Error("Synthetic SQL failure"); },
        "missing database block": f => f.api.sql = async () => [],
        "invalid avID": f => f.api.sql = async () => [{ id: id(1), markdown: "missing avID" }],
        "AV failure": f => f.api.getAttributeView = async () => { throw Error("Synthetic AV failure"); },
        "invalid keyValues": f => f.avInvalid = true,
        "missing primary": f => f.columns[0].key.type = "text",
        "invalid primary values": f => f.columns[0].values = null,
        "unknown identity column type": f => f.columns[1].key.type = "select",
        "unknown identity value structure": f => f.columns[2].values[0].text = "not an object",
        "duplicate primary row": f => f.columns[0].values.push(structuredClone(f.columns[0].values[0])),
    };
    for (const [name, mutate] of Object.entries(broken)) await test(`${name}: fail explicitly; do not show actionable stale records`, async () => {
        const f = fixture(); f.data.weread_customBooksISBN = [{ bookID: BOOK, customISBN: ISBN }]; mutate(f);
        await assert.rejects(() => read(f)(f.plugin));
        const p = manager(f, "isbn"); await p.init(); assert.ok(p.error); assert.deepEqual(p.records.customISBNBooks, []); f.zero();
    });
    for (const key of ["weread_notebooks", "weread_ignoredBooks", "weread_useBookIDBooks", "temporary_weread_notebooksList"]) await test(`${key}: malformed storage blocks manager without overwriting it`, async () => {
        const f = fixture(); f.data[key] = { unknown: true };
        const before = structuredClone(f.data), p = manager(f, "bookid"); await p.init(); assert.ok(p.error); assert.deepEqual(f.data, before); f.zero();
    });
    await test("viewing legacy ISBN records normalizes only memory and never migrates disk", async () => {
        const f = fixture(); f.data.weread_customBooksISBN = [{ syncID: BOOK, isbn: ISBN, metadata: 42 }];
        const before = structuredClone(f.data), p = manager(f, "isbn"); await p.init(); assert.equal(p.error, "");
        assert.equal(p.records.customISBNBooks[0].bookID, BOOK); assert.equal(p.records.customISBNBooks[0].metadata, 42);
        assert.deepEqual(f.data, before); f.zero();
    });
    await test("BookID cleanup and cancel modify memory only", async () => {
        const f = writable(), before = structuredClone(f.data), p = editor(f); await p.init(); p.clear(); p.delete(BOOK); p.cancel();
        assert.equal(p.events.cancelled, 1); assert.equal(p.records.length, 0); assert.deepEqual(f.data, before); f.zero();
    });
    for (const name of ["wereadManageISBN", "wereadIgnoredBooksDialog", "WereadSyncedDataDialog"]) await test(`${name}: actual local edits and cancel make zero writes`, async () => {
        const f = fixture(); let cancelled = 0;
        const props = { onCancel: () => cancelled++, customISBNBooks: [{ bookID: BOOK, customISBN: ISBN }], validISBNs: [ISBN], ignoredBooks: [{ bookID: BOOK }], syncedRecords: f.data.weread_notebooks, temporaryNotebooks: [] };
        const expose = name === "wereadManageISBN" ? "edit:()=>handleDeleteEffective(props.customISBNBooks[0].bookID),cancel:onCancel"
            : name === "wereadIgnoredBooksDialog" ? "edit:()=>handleRestore(props.ignoredBooks[0].bookID),cancel:onCancel"
            : "edit:()=>toggleSync(buildRows(syncedRecords,temporaryNotebooks)[0]),cancel:onCancel";
        f.data.weread_ignoredBooks = structuredClone(props.ignoredBooks);
        f.data.weread_customBooksISBN = structuredClone(props.customISBNBooks);
        const before = structuredClone(f.data);
        const p = component(name, f, props, expose); await p.init(); p.edit(); p.cancel();
        assert.equal(cancelled, 1); assert.deepEqual(f.data, before); f.zero();
    });
    await test("async save awaits persistence and readback, blocks duplicate/cancel and preserves extra fields", async () => {
        const f = writable(); let resolveSave;
        f.plugin.saveData = (key, value) => { f.saves++; return new Promise(resolve => { resolveSave = () => { f.data[key] = structuredClone(value); resolve(); }; }); };
        const p = editor(f); await p.init(); p.clear(); const expected = structuredClone(p.records), saving = p.save();
        const repeated = p.save(); p.delete(BOOK); p.cancel(); await repeated; await tick();
        assert.equal(f.saves, 1); assert.equal(p.events.confirmed, 0); assert.equal(p.saving, true);
        p.cancel(); await p.save(); assert.equal(p.events.cancelled, 0); assert.equal(f.saves, 1);
        resolveSave(); await saving; assert.equal(p.events.confirmed, 1); assert.deepEqual(f.data.weread_useBookIDBooks, expected); assert.equal(expected[0].metadata.retained, true);
    });
    await test("save rejection keeps dialog open and permits a checked retry", async () => {
        const f = writable(), save = f.plugin.saveData;
        f.plugin.saveData = async () => { f.saves++; throw Error("Synthetic save failure"); };
        const p = editor(f); await p.init(); await p.save(); assert.equal(p.events.confirmed, 0); assert.equal(p.events.cancelled, 0); assert.ok(p.error); assert.equal(p.blocked, false);
        f.plugin.saveData = save; await p.save(); assert.equal(p.events.confirmed, 1);
    });
    for (const mode of ["mismatch", "missing", "read-error", "malformed"]) await test(`post-save ${mode}: no success and no repeat write`, async () => {
        const f = writable(); f.plugin.saveData = async key => {
            f.saves++;
            if (mode === "missing") delete f.data[key];
            if (mode === "malformed") f.data[key] = null;
            if (mode === "read-error") f.storageError = true;
        };
        const p = editor(f); await p.init(); p.clear(); await p.save(); assert.equal(p.events.confirmed, 0); assert.ok(p.error); assert.equal(p.blocked, true);
        await p.save(); assert.equal(f.saves, 1); p.cancel(); assert.equal(p.events.cancelled, 1);
    });
    for (const mode of ["changed", "corrupt", "read-error"]) await test(`pre-save ${mode} stops overwrite`, async () => {
        const f = writable(), p = editor(f); await p.init();
        if (mode === "changed") f.data.weread_useBookIDBooks.push({ bookID: "concurrent", metadata: true });
        if (mode === "corrupt") f.data.weread_useBookIDBooks = null;
        if (mode === "read-error") f.storageError = true;
        const before = structuredClone(f.data); await p.save(); assert.equal(p.events.confirmed, 0); assert.ok(p.error); assert.deepEqual(f.data, before); f.zero();
    });
    await test("initial snapshot mismatch, initial failure and component disposal cannot write", async () => {
        for (const mode of ["changed", "failure", "disposed"]) {
            const f = writable(), p = editor(f);
            if (mode === "changed") f.data.weread_useBookIDBooks.push({ bookID: "new" });
            if (mode === "failure") f.storageError = true;
            await p.init(); if (mode === "disposed") p.dispose(); await p.save(); assert.equal(p.events.confirmed, 0); f.zero();
        }
    });
    // The production template gates all four actionable children behind loading/error checks; repair remains independent.
    const markup = componentSource("WereadBookManagementDialog");
    assert.ok(markup.indexOf('{#if activeTab === "repair"}') < markup.indexOf("{:else if loadError}"));
    assert.ok(markup.indexOf("{:else if loadError}") < markup.indexOf('{:else if activeTab === "synced"}'));
    console.log(`WeRead management read safety: ${count} passed (synthetic I/O, actual component handlers; no live writes).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
