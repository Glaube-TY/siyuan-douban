const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { probeWereadBookIDRepair, loadInspector } = require("./probe_weread_bookid_repair_readonly.cjs");
// Reuse synthetic transport/schema fixtures; this probe runs the real production inspector.
const existing = fs.readFileSync(path.join(__dirname, "smoke_weread_identity_readonly.cjs"), "utf8");
const boundary = existing.indexOf("(async () => {");
assert.ok(boundary > 0);
const { originalFixture, id, TITLE, BOOK, ISBN, TOKEN } = new Function("require", "__dirname", existing.slice(0, boundary) + "\nreturn {originalFixture:fixture,id,TITLE,BOOK,ISBN,TOKEN};")(require, __dirname);
function fixture() {
    const f = originalFixture(), docs = new Map([[id(3), "d"]]);
    f.overrides.set("/api/query/sql", ({ stmt }) => f.response({ code: 0, data: stmt.includes("markdown")
        ? [{ id: id(1), markdown: `<div data-av-id="${id(2)}"></div>` }]
        : stmt.includes("FROM attributes") ? [...docs].filter(([key]) => stmt.includes(key)).map(([block_id]) => ({ block_id, value: id(2) }))
        : [...docs].filter(([key]) => stmt.includes(key)).map(([id, type]) => ({ id, type })) }));
    return { ...f, docs, run: title => probeWereadBookIDRepair(f.client, title || TITLE) };
}
let passed = 0;
async function test(name, run) { await run(); console.log(`PASS ${++passed}: ${name}`); }
(async () => {
    await test("unique strong identity is eligible, output contains no private identity or snapshot", async () => {
        const f = fixture(), before = JSON.stringify(f.files), report = await f.run();
        assert.equal(report.inspection.status, "ok"); assert.equal(report.matchedCandidateCount, 1);
        assert.equal(report.targetStatus, "eligible"); assert.equal(report.targetReasonCode, "BOOKID_MISSING");
        assert.equal(report.eligibleCount, 1); assert.equal(report.canEnterConfirmation, true);
        for (const value of [TITLE, BOOK, ISBN, TOKEN, id(1), id(2), id(3), "snapshot", "sourceTitle"]) assert.ok(!JSON.stringify(report).includes(value));
        assert.equal(JSON.stringify(f.files), before);
        assert.deepEqual(Object.keys(loadInspector(f.client)).sort(), ["inspect", "normalizeTitle"]);
        assert.ok(f.requests.every(({ endpoint }) => ["/api/notebook/lsNotebooks", "/api/file/getFile", "/api/query/sql", "/api/av/getAttributeView"].includes(endpoint)));
    });
    await test("missing title match stops, titles only filter service-validated results", async () => {
        const report = await fixture().run("unrelated synthetic title");
        assert.equal(report.matchedCandidateCount, 0); assert.equal(report.targetStatus, "not_found"); assert.equal(report.canEnterConfirmation, false);
    });
    await test("two independent eligible candidates with matching titles never choose a target", async () => {
        const f = fixture(), other = "9780306406157";
        f.docs.set(id(4), "d");
        f.files.temporary_weread_notebooksList.push({ bookID: "synthetic-source-b", title: TITLE, isbn: other });
        f.files.weread_notebooks.push({ bookID: "synthetic-source-b", title: TITLE, isbn: other, blockID: id(4) });
        f.columns[0].values.push({ id: id(12), blockID: id(4), block: { id: id(4), content: "Other local" } });
        f.columns[1].values.push({ id: id(22), blockID: id(4), number: { formattedContent: other } });
        const report = await f.run();
        assert.equal(report.matchedCandidateCount, 2); assert.equal(report.eligibleCount, 2);
        assert.equal(report.targetStatus, "ambiguous"); assert.equal(report.targetReasonCode, "TARGET_AMBIGUOUS"); assert.equal(report.canEnterConfirmation, false);
    });
    await test("already-linked sources do not enter the repair confirmation", async () => {
        const f = fixture(); f.columns[2].values[0].text.content = BOOK;
        const report = await f.run();
        assert.equal(report.alreadyLinkedCount, 1); assert.equal(report.targetStatus, "already_linked"); assert.equal(report.canEnterConfirmation, false);
    });
    await test("ISBN source disagreement remains a production conflict", async () => {
        const f = fixture(); f.files.temporary_weread_notebooksList[0].isbn = "9780306406157";
        const report = await f.run();
        assert.equal(report.conflictCount, 1); assert.equal(report.targetReasonCode, "SOURCE_ISBN_CONFLICT"); assert.equal(report.canEnterConfirmation, false);
    });
    await test("missing documents remain invalid bindings", async () => {
        const f = fixture(); f.docs.delete(id(3));
        const report = await f.run();
        assert.equal(report.invalidBindingCount, 1); assert.equal(report.targetStatus, "invalid_binding"); assert.equal(report.canEnterConfirmation, false);
    });
    await test("malformed JSON, unknown storage and read failure cannot masquerade as empty success", async () => {
        const f = fixture(); f.overrides.set("/api/file/getFile", () => new Response("{private-corrupt-payload"));
        const report = await f.run();
        assert.equal(report.inspection.status, "read_error"); assert.equal(report.inspection.reasonCode, "STORAGE_CORRUPT"); assert.equal(report.canEnterConfirmation, false);
        assert.ok(!JSON.stringify(report).includes("private-corrupt-payload"));
        const g = fixture(); g.files.temporary_weread_notebooksList = { unknown: true };
        assert.equal((await g.run()).inspection.status, "read_error");
        const h = fixture(); h.overrides.set("/api/file/getFile", () => h.response({ code: 403, msg: TOKEN }, 403));
        const denied = await h.run(); assert.equal(denied.inspection.reasonCode, "STORAGE_READ_FAILED"); assert.ok(!JSON.stringify(denied).includes(TOKEN));
    });
    await test("missing history remains distinct, only known temporary null is compatible", async () => {
        const f = fixture(); delete f.files.weread_notebooks;
        assert.equal((await f.run()).inspection.reasonCode, "HISTORY_MISSING");
        const g = fixture(); g.files.temporary_weread_notebooksList = null;
        assert.equal((await g.run()).targetStatus, "eligible");
    });
    await test("MP sources are excluded", async () => {
        const f = fixture(); f.files.weread_notebooks[0].sourceType = "weread_mp_account";
        const report = await f.run(); assert.equal(report.matchedCandidateCount, 0); assert.equal(report.canEnterConfirmation, false);
    });
    await test("API failures and unsafe write endpoints are rejected without server message leakage", async () => {
        const f = fixture(); f.overrides.set("/api/notebook/lsNotebooks", () => f.response({ code: 401, msg: TOKEN }));
        await assert.rejects(f.run(), error => error.diagnosticCode === "API_ENVELOPE_INVALID" && !error.message.includes(TOKEN));
        await assert.rejects(f.client.request("/api/av/setAttributeViewBlockAttr", {}), error => error.diagnosticCode === "READ_ONLY_ENDPOINT_REQUIRED");
        await assert.rejects(f.client.sql("DELETE FROM blocks"), error => error.diagnosticCode === "SELECT_ONLY_REQUIRED");
    });
    await test("CLI requires environment credentials and never echoes title arguments in errors", async () => {
        const env = { ...process.env }; delete env.SIYUAN_API_TOKEN;
        const result = spawnSync(process.execPath, [path.join(__dirname, "probe_weread_bookid_repair_readonly.cjs"), "--title", TITLE], { env, encoding: "utf8" });
        assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).error, "SIYUAN_API_TOKEN_REQUIRED");
        assert.equal(result.stdout, ""); assert.ok(!result.stderr.includes(TITLE));
    });
    console.log(`WeRead repair probe: ${passed} scenarios PASS (synthetic API only)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
