const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createClient, projectHelpers, inspectBuilds, audit, parseArgs } = require("./diagnose_weread_identity_readonly.cjs");
const helpers = projectHelpers();
const id = n => `20000101000000-${String(n).padStart(7, "0")}`;
const TITLE = "Synthetic main：Synthetic subtitle", BOOK = "synthetic-source-a", ISBN = "9787111128069";
const TOKEN = "synthetic-test-token", BASE = "/data/storage/petal/siyuan-douban/";
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const errorCode = expected => error => error.diagnosticCode === expected;

function fixture() {
    const files = {
        "settings.json": { bookDatabaseID: id(1) },
        temporary_weread_notebooksList: [{ title: TITLE, bookID: BOOK, isbn: ISBN, pendingImport: false }],
        weread_notebooks: [{ title: TITLE, bookID: BOOK, isbn: ISBN, blockID: id(3) }],
        weread_customBooksISBN: [], weread_useBookIDBooks: [], weread_ignoredBooks: [],
        weread_note_unit_block_index_v1: { schemaVersion: 1, sources: { ["book:" + BOOK]: { bookID: BOOK, docBlockID: id(3), items: {} } } },
        weread_sync_reports: [{ items: [{ bookID: BOOK, reasonCode: "ISBN_MATCH_FAILED", reasonText: "[claim.readback/CLAIM_READBACK_FAILED] private details must be excluded" }] }],
    };
    const columns = [
        { key: { id: id(10), name: "书名", type: "block" }, values: [{ id: id(11), blockID: id(3), block: { id: id(3), content: "Synthetic main" } }] },
        { key: { id: id(20), name: "ISBN", type: "number" }, values: [{ id: id(21), blockID: id(3), number: { content: Number(ISBN), formattedContent: ISBN } }] },
        { key: { id: id(30), name: "bookID", type: "text" }, values: [{ id: id(31), blockID: id(3), text: { content: "" } }] },
    ];
    const requests = [], overrides = new Map();
    let docType = "d", documentMissing = false, customAV = id(2);
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
    const fetchImpl = async (url, options) => {
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization, "token " + TOKEN);
        assert.equal(options.redirect, "error");
        const endpoint = new URL(url).pathname, body = JSON.parse(options.body);
        requests.push({ endpoint, body });
        if (overrides.has(endpoint)) return overrides.get(endpoint)(body);
        if (endpoint === "/api/notebook/lsNotebooks") return response({ code: 0, data: { notebooks: [] } });
        if (endpoint === "/api/file/getFile") {
            const name = body.path.slice(BASE.length);
            return Object.hasOwn(files, name) ? response(files[name]) : response({ code: 404 }, 202);
        }
        if (endpoint === "/api/av/getAttributeView") {
            assert.equal(body.id, id(2));
            return response({ code: 0, data: { av: { keyValues: columns } } });
        }
        if (endpoint === "/api/query/sql") {
            assert.match(body.stmt, /^SELECT /);
            let rows;
            if (body.stmt.includes("markdown FROM blocks")) rows = [{ id: id(1), markdown: `<div data-av-id="${id(2)}"></div>` }];
            else if (body.stmt.includes("type FROM blocks")) rows = documentMissing ? [] : [{ id: id(3), type: docType }];
            else if (body.stmt.includes("FROM attributes")) rows = [{ name: "custom-avs", value: customAV }];
            else assert.fail("unexpected SQL");
            return response({ code: 0, data: rows });
        }
        assert.fail("unexpected read endpoint");
    };
    return { files, columns, requests, overrides, response,
        client: createClient({ token: TOKEN }, fetchImpl),
        setDocument(type, missing = false) { docType = type; documentMissing = missing; },
        setCustomAV(value) { customAV = value; } };
}
const run = f => audit(f.client, TITLE, helpers);

(async () => {
    await test("real helper parsing, strong ISBN match despite title difference, masked cell roles", async () => {
        const f = fixture(), before = JSON.stringify(f.files), report = await run(f);
        assert.equal(report.database.state, "strong_match");
        assert.equal(report.database.matchType, "ISBN");
        assert.equal(report.database.bookIDState, "empty");
        assert.equal(report.database.bookIDCandidates, 0);
        assert.equal(report.binding.state, "bound");
        assert.equal(report.binding.customAVMatches, true);
        assert.equal(report.binding.index, "same_document");
        assert.equal(report.source.pendingImport, false);
        assert.equal(report.repeatedSourceAssessment.currentlySuppressedByStrongIdentity, true);
        assert.equal(report.database.cellShapes[0].cells[0].cellIDEqualsRow, false);
        assert.deepEqual(report.historicalDiagnostics[0].stages, [{ stage: "claim.readback", reasonCode: "CLAIM_READBACK_FAILED" }]);
        assert.equal(report.stageAssessment["claim.write"], "not_executed");
        const output = JSON.stringify(report);
        for (const value of [TITLE, ISBN, BOOK, TOKEN, id(1), id(2), id(3), "private details"]) assert.ok(!output.includes(value));
        assert.equal(JSON.stringify(f.files), before);
        assert.ok(f.requests.every(({ endpoint }) => ["/api/notebook/lsNotebooks", "/api/file/getFile", "/api/query/sql", "/api/av/getAttributeView"].includes(endpoint)));
    });
    await test("ambiguous source refuses target selection", async () => {
        const f = fixture(); f.files.temporary_weread_notebooksList.push({ title: TITLE, bookID: "synthetic-source-b", isbn: ISBN });
        const report = await run(f);
        assert.equal(report.source.state, "ambiguous");
        assert.equal(report.database.state, "not_evaluated");
        assert.equal(report.binding, undefined);
    });
    await test("row ID, itemID and document ID remain separate roles", async () => {
        const f = fixture();
        for (const column of f.columns) for (const cell of column.values) { delete cell.blockID; cell.itemID = id(4); }
        const report = await run(f);
        assert.equal(report.database.rowEqualsDocument, false);
        assert.equal(report.binding.state, "bound");
        assert.equal(report.binding.historyMatches, true);
        assert.equal(report.binding.rowDocumentEqualityRequired, false);
        const g = fixture(); delete g.columns[0].values[0].block.id;
        assert.equal((await run(g)).binding.state, "not_created");
    });
    await test("title alone never becomes a database identity", async () => {
        const f = fixture(); f.columns[1].values[0].number.formattedContent = "9780306406157";
        const report = await run(f);
        assert.equal(report.database.state, "no_strong_match");
        assert.equal(report.binding, undefined);
    });
    await test("duplicate ISBN rows and conflicting bookID remain conflicts", async () => {
        const f = fixture();
        f.columns[0].values.push({ id: id(12), blockID: id(4), block: { id: id(4), content: "Other synthetic" } });
        f.columns[1].values.push({ id: id(22), blockID: id(4), number: { formattedContent: ISBN } });
        assert.equal((await run(f)).database.state, "conflict");
        const g = fixture(); g.columns[2].values[0].text.content = "other-source";
        assert.equal((await run(g)).database.state, "conflict");
    });
    await test("orphan conflicts reported without treating them as rows or cleaning them", async () => {
        const f = fixture(); f.columns[1].values.push({ id: id(23), blockID: id(5), number: { formattedContent: ISBN } });
        f.columns[2].values.push({ id: id(32), blockID: id(5), text: { content: BOOK } });
        const report = await run(f);
        assert.deepEqual(report.database.orphanConflictColumns, ["ISBN", "bookID"]);
        assert.equal(report.database.isbnCandidates, 1);
        assert.equal(report.currentConditions.targetOrphans, true);
    });
    await test("pending import, aliases, legacy custom ISBN normalized only in memory", async () => {
        const f = fixture();
        f.files.temporary_weread_notebooksList = [{ title: TITLE, syncID: BOOK, pendingImport: true }];
        f.files.weread_customBooksISBN = { [BOOK]: { title: TITLE, isbn: ISBN } };
        f.columns[2].values[0].text.content = BOOK;
        const before = JSON.stringify(f.files), report = await run(f);
        assert.equal(report.source.pendingImport, true);
        assert.equal(report.repeatedSourceAssessment.pendingImportWithCompleteIdentity, true);
        assert.equal(report.repeatedSourceAssessment.currentlySuppressedByStrongIdentity, false);
        assert.equal(JSON.stringify(f.files), before);
    });
    await test("shared cache target is not incorrectly suppressed", async () => {
        const f = fixture(); f.files.weread_notebooks = [];
        f.files.temporary_weread_notebooksList.push({ title: "Other synthetic title", bookID: "synthetic-source-b", isbn: ISBN });
        const report = await run(f);
        assert.equal(report.binding.sharedCacheTarget, true);
        assert.equal(report.repeatedSourceAssessment.currentlySuppressedByStrongIdentity, false);
    });
    await test("document missing, wrong type and wrong AV remain distinguishable", async () => {
        const f = fixture(); f.setDocument("d", true);
        assert.equal((await run(f)).binding.state, "missing");
        f.setDocument("p"); assert.equal((await run(f)).binding.state, "invalid");
        f.setDocument("d"); f.setCustomAV(id(999));
        assert.equal((await run(f)).binding.customAVMatches, false);
    });
    await test("only temporary legacy null is recognized, other unknown shapes fail", async () => {
        const f = fixture(); f.files.temporary_weread_notebooksList = null;
        assert.equal((await run(f)).storage.temporary, "historical_null");
        delete f.files.temporary_weread_notebooksList;
        assert.equal((await run(f)).storage.temporary, "missing");
        for (const value of [null, {}, "unknown"]) {
            const g = fixture(); g.files.weread_notebooks = value;
            await assert.rejects(run(g), errorCode("STORAGE_SHAPE_INVALID_history"));
        }
        for (const value of [{}, "unknown"]) {
            const g = fixture(); g.files.temporary_weread_notebooksList = value;
            await assert.rejects(run(g), errorCode("STORAGE_SHAPE_INVALID_temporary"));
        }
    });
    await test("missing, malformed, denied files and HTTP200 error payload are not interchangeable", async () => {
        const f = fixture(); delete f.files["settings.json"];
        await assert.rejects(run(f), errorCode("SETTINGS_MISSING"));
        for (const [response, code] of [
            [new Response("{broken"), "STORAGE_JSON_INVALID"],
            [new Response(""), "STORAGE_EMPTY_BODY"],
            [new Response('{"code":403}', { status: 403 }), "STORAGE_READ_FAILED_HTTP_403"],
        ]) {
            const g = fixture(); g.overrides.set("/api/file/getFile", () => response);
            await assert.rejects(g.client.file("settings.json"), errorCode(code));
        }
        const g = fixture(); g.files["settings.json"] = { code: 404 };
        assert.equal((await g.client.file("settings.json")).exists, true);
        await assert.rejects(run(g), errorCode("INVALID_BLOCK_ID"));
    });
    await test("unknown AV structure, values and inconsistent aliases fail explicitly", async () => {
        const f = fixture(); f.columns[1].values = {};
        await assert.rejects(run(f), errorCode("IDENTITY_CELLS_INVALID"));
        const g = fixture(); g.files.temporary_weread_notebooksList[0].syncID = "another-source";
        await assert.rejects(run(g), errorCode("SOURCE_IDENTIFIERS_INVALID"));
        const k = fixture(); k.columns[2].values[0].text.content = {};
        await assert.rejects(run(k), errorCode("IDENTITY_VALUE_INVALID"));
    });
    await test("write endpoints, auth storage and unsafe SQL refused before transport", async () => {
        const f = fixture();
        await assert.rejects(f.client.request("/api/av/setAttributeViewBlockAttr", {}), errorCode("READ_ONLY_ENDPOINT_REQUIRED"));
        await assert.rejects(f.client.request("/api/file/getFile", { path: BASE + "weread_auth" }), errorCode("STORAGE_PATH_NOT_ALLOWED"));
        for (const stmt of ["DELETE FROM blocks", "SELECT * FROM blocks; DELETE FROM blocks", "SELECT /* unsafe */ 1"]) await assert.rejects(f.client.sql(stmt), errorCode("SELECT_ONLY_REQUIRED"));
        f.files["settings.json"].bookDatabaseID = "malicious' SQL";
        await assert.rejects(run(f), errorCode("INVALID_BLOCK_ID"));
        assert.ok(!f.requests.some(item => item.endpoint === "/api/query/sql"));
    });
    await test("request timeout covers delayed response body and hides transport errors", async () => {
        const client = createClient({ token: TOKEN, timeoutMs: 5 }, async (_url, options) => ({ status: 200, text: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error(TOKEN)), { once: true })) }));
        await assert.rejects(client.api("/api/notebook/lsNotebooks", {}), errorCode("API_TIMEOUT"));
        const broken = createClient({ token: TOKEN }, async () => { throw new Error(TOKEN); });
        await assert.rejects(broken.api("/api/notebook/lsNotebooks", {}), errorCode("API_TRANSPORT_FAILED"));
    });
    await test("build equality cannot prove loaded runtime; all build data is synthetic", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "weread-readonly-smoke-"));
        const oldTarget = process.env.SIYUAN_PLUGIN_DIR;
        try {
            const plugins = path.join(root, "workspace", "data", "plugins");
            fs.mkdirSync(plugins, { recursive: true });
            process.env.SIYUAN_PLUGIN_DIR = plugins;
            for (const dir of ["dev", "dist"]) { fs.mkdirSync(path.join(root, dir)); fs.writeFileSync(path.join(root, dir, "index.js"), "// claim.column_readback"); }
            const f = fixture();
            f.overrides.set("/api/file/getFile", () => new Response("// claim.column_readback"));
            f.overrides.set("/api/system/getWorkspaceInfo", () => f.response({ code: 0, data: { workspaceDir: path.join(root, "workspace") } }));
            const report = await inspectBuilds(f.client, root);
            assert.equal(report.installedEqualsDev, true);
            assert.equal(report.installedEqualsDist, true);
            assert.equal(report.configuredTargetMatchesWorkspace, true);
            assert.equal(report.runtimeLoadedVersion, "unconfirmed");
            f.overrides.set("/api/file/getFile", () => new Response('{"code":404}'));
            await assert.rejects(inspectBuilds(f.client, root), errorCode("INSTALLED_BUILD_INVALID"));
        } finally {
            if (oldTarget === undefined) delete process.env.SIYUAN_PLUGIN_DIR; else process.env.SIYUAN_PLUGIN_DIR = oldTarget;
            assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
            assert.ok(path.basename(root).startsWith("weread-readonly-smoke-"));
            fs.rmSync(root, { recursive: true });
        }
    });
    await test("CLI requires environment auth, errors do not echo private arguments", async () => {
        assert.equal(parseArgs(["--title", "synthetic", "--url", "http://127.0.0.1:9999"]).title, "synthetic");
        assert.throws(() => parseArgs(["--unknown"]), errorCode("INVALID_ARGUMENTS"));
        const env = { ...process.env }; delete env.SIYUAN_API_TOKEN;
        const result = spawnSync(process.execPath, [path.join(__dirname, "diagnose_weread_identity_readonly.cjs"), "--title", TITLE], { env, encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stderr).error, "SIYUAN_API_TOKEN_REQUIRED");
        assert.ok(!result.stderr.includes(TITLE));
        assert.equal(result.stdout, "");
    });
    console.log(`PASS ${passed} read-only diagnostic smoke scenarios (synthetic I/O only)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
