// No imports, migrations, refreshes or writes: only the endpoints listed below are admitted.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const STORAGE = "/data/storage/petal/siyuan-douban/";
const READ_ENDPOINTS = new Set(["/api/notebook/lsNotebooks", "/api/file/getFile", "/api/query/sql", "/api/av/getAttributeView", "/api/system/getWorkspaceInfo"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = value => createHash("sha256").update(value).digest("hex");
const mask = value => value ? `length=${String(value).length}:…${String(value).length > 4 ? String(value).slice(-3) : "***"}` : null;
function fail(code) { throw Object.assign(new Error(code), { diagnosticCode: code }); }
function requireShape(condition, code) { if (!condition) fail(code); }
function blockID(value) {
    requireShape(typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value), "INVALID_BLOCK_ID");
    return value;
}
const quoteID = value => `'${blockID(value).replace(/'/g, "''")}'`;

function createClient({ url = "http://127.0.0.1:6806", token, timeoutMs = 15000 }, fetchImpl = fetch) {
    let base;
    try { base = new URL(url); } catch { fail("INVALID_API_URL"); }
    requireShape(["http:", "https:"].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash && base.pathname === "/", "INVALID_API_URL");
    requireShape(typeof token === "string" && !!token.trim() && !/[\r\n]/.test(token), "SIYUAN_API_TOKEN_REQUIRED");
    requireShape(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 120000, "INVALID_TIMEOUT");
    const requests = [];
    async function request(endpoint, body) {
        requireShape(READ_ENDPOINTS.has(endpoint), "READ_ONLY_ENDPOINT_REQUIRED");
        if (endpoint === "/api/query/sql") requireShape(typeof body.stmt === "string" && /^SELECT\s/i.test(body.stmt) && !/;|--|\/\*/.test(body.stmt), "SELECT_ONLY_REQUIRED");
        if (endpoint === "/api/file/getFile") requireShape(
            ["settings.json", "temporary_weread_notebooksList", "weread_notebooks", "weread_customBooksISBN", "weread_useBookIDBooks", "weread_ignoredBooks", "weread_note_unit_block_index_v1", "weread_sync_reports"].some(name => body.path === STORAGE + name)
            || body.path === "/data/plugins/siyuan-douban/index.js", "STORAGE_PATH_NOT_ALLOWED");
        if (endpoint === "/api/av/getAttributeView") blockID(body.id);
        requests.push(endpoint);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(new URL(endpoint, base), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "token " + token.trim() }, body: JSON.stringify(body), signal: controller.signal, redirect: "error" });
            return { status: response.status, body: await response.text() };
        } catch { fail(controller.signal.aborted ? "API_TIMEOUT" : "API_TRANSPORT_FAILED"); }
        finally { clearTimeout(timer); }
    }
    function json(text) { try { return JSON.parse(text); } catch { fail("API_JSON_INVALID"); } }
    async function api(endpoint, body) {
        const response = await request(endpoint, body);
        requireShape(response.status === 200, `API_HTTP_${response.status}`);
        const value = json(response.body);
        requireShape(isRecord(value) && value.code === 0 && Object.hasOwn(value, "data"), "API_ENVELOPE_INVALID");
        return value.data;
    }
    async function file(name) {
        const response = await request("/api/file/getFile", { path: STORAGE + name });
        if (response.status === 200) {
            requireShape(!!response.body.trim(), "STORAGE_EMPTY_BODY");
            let value;
            try { value = JSON.parse(response.body); } catch { fail("STORAGE_JSON_INVALID"); }
            return { exists: true, value };
        }
        const payload = json(response.body);
        if (response.status === 202 && isRecord(payload) && payload.code === 404) return { exists: false };
        fail(`STORAGE_READ_FAILED_HTTP_${response.status}`);
    }
    async function sql(stmt) {
        const rows = await api("/api/query/sql", { stmt });
        requireShape(Array.isArray(rows) && rows.every(isRecord), "SQL_ROWS_INVALID");
        return rows;
    }
    return { request, api, file, sql, requests };
}

// Reuse the current TypeScript helpers; never load the real SiYuan SDK or a write implementation.
function projectHelpers() {
    const ts = require("typescript");
    const modules = new Map();
    function load(relative) {
        const absolute = path.resolve(ROOT, relative);
        requireShape(absolute.startsWith(path.join(ROOT, "src") + path.sep), "MODULE_PATH_INVALID");
        if (absolute === path.join(ROOT, "src/api.ts")) return new Proxy({}, { get: () => () => fail("READ_ONLY_VIOLATION") });
        if (absolute === path.join(ROOT, "src/utils/core/formatOp.ts")) return { generateUniqueBlocked: () => fail("READ_ONLY_VIOLATION") };
        if (modules.has(absolute)) return modules.get(absolute).exports;
        const module = { exports: {} }; modules.set(absolute, module);
        const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function("require", "module", "exports", "console", code)(name => {
            requireShape(name.startsWith(".") || name.startsWith("@/"), "EXTERNAL_MODULE_NOT_ALLOWED");
            const base = name.startsWith("@/") ? path.join(ROOT, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
            return load(path.relative(ROOT, fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts")));
        }, module, module.exports, { warn() {}, error() {}, log() {} });
        return module.exports;
    }
    return { ...load("src/utils/bookHandling/bookDeduplication.ts"), ...load("src/utils/bookHandling/bookDatabasePrimaryKey.ts"), ...load("src/utils/bookHandling/isbn.ts"), ...load("src/utils/weread/wereadSyncStorage.ts"), ...load("src/utils/weread/api/wereadBookIdentity.ts") };
}

async function inspectBuilds(client, root = ROOT) {
    const local = {};
    for (const directory of ["dev", "dist"]) {
        const file = path.join(root, directory, "index.js");
        local[directory] = fs.existsSync(file) ? digest(fs.readFileSync(file)) : null;
    }
    const installed = await client.request("/api/file/getFile", { path: "/data/plugins/siyuan-douban/index.js" });
    requireShape(installed.status === 200 && !!installed.body.trim(), "INSTALLED_BUILD_READ_FAILED");
    try { new (require("node:vm").Script)(installed.body); } catch { fail("INSTALLED_BUILD_INVALID"); }
    const installedHash = digest(installed.body);
    const workspace = await client.api("/api/system/getWorkspaceInfo", {});
    requireShape(isRecord(workspace) && typeof workspace.workspaceDir === "string" && !!workspace.workspaceDir, "WORKSPACE_SHAPE_INVALID");
    const { resolveConfiguredDevPluginDir } = await import(pathToFileURL(path.join(ROOT, "scripts/dev_deploy.js")).href);
    const { loadLocalEnvFile } = await import(pathToFileURL(path.join(ROOT, "scripts/utils.js")).href);
    let configured;
    try { loadLocalEnvFile(path.join(root, ".env")); configured = resolveConfiguredDevPluginDir(root); } catch { fail("DEV_TARGET_CONFIG_INVALID"); }
    const normalize = value => { const resolved = fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value); return process.platform === "win32" ? resolved.toLowerCase() : resolved; };
    return { installedDirectory: "active-workspace/data/plugins/siyuan-douban", configuredTargetPresent: !!configured,
        configuredTargetMatchesWorkspace: configured ? normalize(configured) === normalize(path.join(workspace.workspaceDir, "data/plugins")) : null,
        installedEqualsDev: local.dev === installedHash, installedEqualsDist: local.dist === installedHash,
        devEqualsDist: local.dev && local.dist ? local.dev === local.dist : null, localBuildsPresent: { dev: !!local.dev, dist: !!local.dist },
        installedMarkers: Object.fromEntries(["claim.column_readback", "CLAIM_READBACK_FAILED", "DOCUMENT_INDEX_NOT_VISIBLE", "Read-only WeRead preparation", "APPROVED_SOURCE_NOT_READY"].map(marker => [marker, installed.body.includes(marker)])),
        runtimeLoadedVersion: "unconfirmed" };
}

function arrayState(state, name, legacyNull = false) {
    if (!state.exists) return { kind: "missing", records: [] };
    if (legacyNull && state.value === null) return { kind: "historical_null", records: [] };
    requireShape(Array.isArray(state.value) && state.value.every(isRecord), `STORAGE_SHAPE_INVALID_${name}`);
    return { kind: "array", records: state.value };
}

async function audit(client, title, helpers = projectHelpers()) {
    const h = helpers;
    const notebooks = await client.api("/api/notebook/lsNotebooks", {});
    requireShape(isRecord(notebooks) && Array.isArray(notebooks.notebooks), "NOTEBOOKS_SHAPE_INVALID");
    const report = { api: { connected: true, notebookListShape: "data.notebooks:Array" }, storage: {}, source: { state: "not_evaluated" }, database: { state: "not_evaluated" }, historicalDiagnostics: [], conclusion: "current_readonly_evidence_insufficient" };
    const states = new Map();
    async function state(name) { if (!states.has(name)) states.set(name, await client.file(name)); return states.get(name); }
    const settings = await state("settings.json");
    requireShape(settings.exists, "SETTINGS_MISSING");
    requireShape(isRecord(settings.value), "SETTINGS_SHAPE_INVALID");
    const databaseID = blockID(settings.value.bookDatabaseID);
    const databaseBlocks = await client.sql(`SELECT id, markdown FROM blocks WHERE id = ${quoteID(databaseID)} LIMIT 2`);
    requireShape(databaseBlocks.length === 1 && databaseBlocks[0].id === databaseID && typeof databaseBlocks[0].markdown === "string", "DATABASE_BLOCK_INVALID");
    const avID = databaseBlocks[0].markdown.match(/data-av-id="([^"]+)"/)?.[1]; blockID(avID);
    const database = await client.api("/api/av/getAttributeView", { id: avID });
    requireShape(isRecord(database?.av) && Array.isArray(database.av.keyValues), "AV_SHAPE_INVALID");
    const columns = database.av.keyValues;
    requireShape(columns.every(column => isRecord(column) && isRecord(column.key)), "AV_COLUMNS_INVALID");
    const primary = h.findBookPrimaryKeyValue(columns);
    requireShape(primary && primary.key.type === "block" && columns.filter(column => column.key.type === "block").length === 1, "PRIMARY_COLUMN_INVALID");
    const relevant = columns.filter(column => column === primary || ["ISBN", "bookID"].includes(column.key.name));
    for (const column of relevant) {
        blockID(column.key.id);
        requireShape(Array.isArray(column.values) && column.values.every(isRecord), "IDENTITY_CELLS_INVALID");
        for (const cell of column.values) {
            blockID(cell.blockID || cell.itemID);
            for (const id of [cell.blockID, cell.itemID, cell.block?.id, cell.id]) if (id !== undefined && id !== "") blockID(id);
            const value = cell.block?.content ?? cell.text?.content ?? cell.number?.formattedContent ?? cell.number?.content;
            requireShape(typeof value === "string" || (typeof value === "number" && Number.isFinite(value)), "IDENTITY_VALUE_INVALID");
        }
    }
    const rows = h.buildBookIdentityRows(columns);
    const temporary = arrayState(await state("temporary_weread_notebooksList"), "temporary", true);
    const history = arrayState(await state("weread_notebooks"), "history");
    const useBookID = arrayState(await state("weread_useBookIDBooks"), "bookID_preferences");
    const ignored = arrayState(await state("weread_ignoredBooks"), "ignored");
    const plugin = { name: "siyuan-douban", i18n: {}, loadDataStrict: state, saveData: () => fail("READ_ONLY_VIOLATION") };
    let custom;
    try { custom = await h.loadCustomISBNBooksWithMigration(plugin, { migrate: false }); } catch { fail("CUSTOM_ISBN_INVALID"); }
    const customState = await state("weread_customBooksISBN");
    report.storage = { settings: "object", temporary: temporary.kind, history: history.kind, customISBN: !customState.exists ? "missing" : Array.isArray(customState.value) ? "array" : "recognized_legacy", bookIDPreferences: useBookID.kind, ignored: ignored.kind };
    const all = [...temporary.records, ...history.records, ...custom, ...useBookID.records, ...ignored.records];
    for (const record of all) {
        if (record.title !== undefined) requireShape(typeof record.title === "string", "SOURCE_TITLE_INVALID");
        for (const field of ["isbn", "customISBN"]) if (record[field] != null) requireShape(typeof record[field] === "string" || (typeof record[field] === "number" && Number.isFinite(record[field])), "SOURCE_ISBN_INVALID");
        const identifiers = [record.bookID, record.bookId, record.syncID].filter(id => id !== undefined && id !== null && id !== "");
        requireShape(identifiers.every(id => typeof id === "string" || (typeof id === "number" && Number.isFinite(id))) && new Set(identifiers.map(id => String(id).trim())).size <= 1, "SOURCE_IDENTIFIERS_INVALID");
    }
    const needle = h.normalizeBookTitle(title);
    requireShape(!!needle, "TITLE_REQUIRED");
    const named = all.filter(record => h.normalizeBookTitle(record.title).includes(needle));
    const sourceIDs = [...new Set(named.map(h.getWereadStorageKey).filter(Boolean))];
    report.source = { state: sourceIDs.length === 1 ? "unique" : sourceIDs.length ? "ambiguous" : "missing", candidateCount: sourceIDs.length };
    report.database = { state: "not_evaluated", titleCandidateCount: rows.filter(row => row.normalizedTitle.includes(needle) || (row.normalizedTitle && needle.includes(row.normalizedTitle))).length };
    if (sourceIDs.length !== 1) return report;
    const bookID = sourceIDs[0], same = records => records.filter(record => h.getWereadStorageKey(record) === bookID);
    const cached = same(temporary.records), past = same(history.records), overrides = same(custom);
    const isbnValues = [...cached.map(record => record.isbn), ...overrides.map(record => record.customISBN), ...past.map(record => record.isbn)].map(h.normalizeISBN).filter(h.isValidISBN);
    const isbn = isbnValues[0] || "";
    requireShape(cached.every(record => record.pendingImport === undefined || typeof record.pendingImport === "boolean"), "PENDING_IMPORT_INVALID");
    const match = h.matchWereadBookIdentity(rows, { bookID, isbn }, history.records, false);
    const isbnRows = h.isValidISBN(isbn) ? rows.filter(row => row.isbn === isbn) : [];
    const bookRows = rows.filter(row => row.bookID === bookID);
    const rowIDs = new Set(rows.map(row => row.rowBlockID));
    const orphanColumns = relevant.filter(column => column !== primary && column.values.some(cell => !rowIDs.has(String(cell.blockID || cell.itemID).trim()) && (column.key.name === "bookID" ? h.getAttributeViewValueText(cell) === bookID : h.isValidISBN(h.getAttributeViewValueText(cell)) && h.normalizeISBN(h.getAttributeViewValueText(cell)) === isbn))).map(column => column.key.name);
    report.source = { ...report.source, bookID: mask(bookID), effectiveISBN: mask(isbn), validISBN: h.isValidISBN(isbn), distinctValidISBNs: new Set(isbnValues).size, cacheEntries: cached.length,
        pendingImport: cached.length ? cached.some(record => record.pendingImport === true) : null,
        historyEntries: past.length, useBookIDPreference: same(useBookID.records).length > 0, ignored: same(ignored.records).length > 0 };
    report.database = { ...report.database, state: match.issue ? "conflict" : match.row ? "strong_match" : "no_strong_match", matchType: match.matchType || null, issue: match.issue || null,
        isbnCandidates: isbnRows.length, bookIDCandidates: bookRows.length, orphanConflictColumns: orphanColumns,
        columns: relevant.map(column => ({ name: column === primary ? "primary" : column.key.name, type: ["block", "text", "number"].includes(column.key.type) ? column.key.type : "unsupported" })) };
    const row = match.row;
    if (row) {
        const rowCells = column => column.values.filter(cell => String(cell.blockID || cell.itemID).trim() === row.rowBlockID);
        report.database.rowBlockID = mask(row.rowBlockID); report.database.docBlockID = mask(row.docBlockID);
        report.database.bookIDState = !row.bookID ? "empty" : row.bookID === bookID ? "target" : "other";
        report.database.rowEqualsDocument = row.rowBlockID === row.docBlockID;
        report.database.cellShapes = relevant.map(column => ({ column: column === primary ? "primary" : column.key.name,
            cells: rowCells(column).map(cell => ({ cellID: mask(cell.id), blockID: mask(cell.blockID), itemID: mask(cell.itemID), documentID: mask(cell.block?.id), cellIDEqualsRow: cell.id === row.rowBlockID,
                valueFields: ["block", "text", "number"].filter(key => Object.hasOwn(cell, key)), textValue: cell.text ? mask(h.getAttributeViewValueText(cell)) : null, formattedNumber: cell.number ? mask(cell.number.formattedContent) : null })) }));
        const documents = row.docBlockID ? await client.sql(`SELECT id, type FROM blocks WHERE id = ${quoteID(row.docBlockID)} LIMIT 2`) : [];
        requireShape(documents.every(doc => doc.id === row.docBlockID && typeof doc.type === "string"), "DOCUMENT_ROWS_INVALID");
        const binding = !row.docBlockID ? "not_created" : !documents.length ? "missing" : documents.length === 1 && documents[0].type === "d" ? "bound" : "invalid";
        const attrs = row.docBlockID ? await client.sql(`SELECT name, value FROM attributes WHERE block_id = ${quoteID(row.docBlockID)} AND name = 'custom-avs' LIMIT 100`) : [];
        requireShape(attrs.every(attr => attr.name === "custom-avs" && typeof attr.value === "string"), "DOCUMENT_ATTRIBUTES_INVALID");
        const avBound = attrs.some(attr => attr.value.split(",").includes(avID));
        const otherHistoryOwners = history.records.filter(record => record.blockID === row.docBlockID && h.getWereadStorageKey(record) && h.getWereadStorageKey(record) !== bookID && record.sourceType !== "weread_mp_account" && !h.getWereadStorageKey(record).startsWith("MP_WXS_"));
        const ignoredIDs = h.getIgnoredBookIDSet(ignored.records);
        const cachedMatches = temporary.records.filter(record => !ignoredIDs.has(h.getWereadStorageKey(record))).map(record => {
            const id = h.getWereadStorageKey(record), freshISBN = h.normalizeISBN(record.isbn);
            const fallbackISBN = custom.find(item => h.getWereadStorageKey(item) === id)?.customISBN;
            return { bookID: id, sourceType: record.sourceType, blockID: h.matchWereadBookIdentity(rows, { bookID: id, isbn: h.isValidISBN(freshISBN) ? freshISBN : fallbackISBN }, history.records, false).row?.docBlockID };
        });
        const sharedCacheTarget = h.findConflictingWereadDocBindings(cachedMatches).has(row.docBlockID);
        const index = await state("weread_note_unit_block_index_v1");
        requireShape(!index.exists || (isRecord(index.value) && index.value.schemaVersion === 1 && isRecord(index.value.sources)), "NOTE_INDEX_INVALID");
        const indexed = index.exists ? index.value.sources["book:" + bookID] : undefined;
        requireShape(indexed === undefined || (isRecord(indexed) && typeof indexed.docBlockID === "string" && indexed.bookID === bookID && isRecord(indexed.items)), "SOURCE_INDEX_INVALID");
        report.binding = { state: binding, customAVMatches: avBound, repairNeeded: binding !== "bound", rowDocumentEqualityRequired: binding !== "bound",
            historyMatches: past.every(record => record.blockID === row.docBlockID), otherHistoryOwners: otherHistoryOwners.length,
            otherRowOwners: rows.filter(other => other.rowBlockID !== row.rowBlockID && row.docBlockID && other.docBlockID === row.docBlockID).length,
            sharedCacheTarget, index: !index.exists ? "missing_file" : !indexed ? "missing_source" : indexed.docBlockID === row.docBlockID ? "same_document" : "different_document" };
        const bookColumns = relevant.filter(column => column.key.name === "bookID");
        const columnValid = bookColumns.length === 1 && bookColumns[0].key.type === "text";
        const cellConflict = relevant.some(column => rowCells(column).length > 1);
        report.currentConditions = { validInput: !!bookID && h.isValidISBN(isbn), uniqueISBN: isbnRows.length === 1, uniqueRow: rows.filter(other => other.rowBlockID === row.rowBlockID).length === 1,
            bookIDColumn: !bookColumns.length ? "creation_required" : columnValid ? "valid" : "invalid", duplicateIdentityCells: cellConflict, bookIDUnclaimed: !row.bookID,
            documentBound: binding === "bound", customAVMatches: avBound, targetOrphans: orphanColumns.length > 0, otherHistoryOwner: otherHistoryOwners.length > 0 };
        report.stageAssessment = { "isbn.inspect": match.issue || orphanColumns.length ? "current_conflict" : row.isbn !== isbn ? "ISBN_MISMATCH" : "current_strong_match",
            "note.input": binding === "bound" ? "bound_document_returns_without_repair" : binding,
            "note.repair": "not_executed", "note.before_create": "not_executed", "note.create": "not_executed", "note.document": "current_document_" + binding, "note.readback": "not_executed",
            "claim.input": !row.bookID && h.isValidISBN(isbn) && !!row.docBlockID ? "current_inputs_eligible" : "claim_not_eligible_or_not_needed",
            "claim.preflight": "snapshot_conditions_only_no_historical_baseline", "claim.document": "current_document_" + binding,
            "claim.column": "not_executed", "claim.column_readback": "not_executed", "claim.before_write": "snapshot_conditions_only", "claim.write": "not_executed", "claim.readback": "not_executed" };
        report.repeatedSourceAssessment = { pendingImportWithCompleteIdentity: report.source.pendingImport === true && row.bookID === bookID && binding === "bound" && avBound,
            isbnBoundButBookIDEmpty: !row.bookID && isbnRows.length === 1 && binding === "bound", bookIDBoundWithoutHistory: row.bookID === bookID && binding === "bound" && past.length === 0,
            identityConflict: !!match.issue || orphanColumns.length > 0 || cellConflict,
            currentlySuppressedByStrongIdentity: cached.length > 0 && !report.source.pendingImport && !report.source.ignored && !match.issue && binding === "bound" && !sharedCacheTarget && cachedMatches.some(item => item.bookID === bookID && item.blockID === row.docBlockID) };
    }
    const reports = arrayState(await state("weread_sync_reports"), "reports");
    const knownCodes = new Set(["API_KEY_INVALID", "API_REQUEST_FAILED", "ISBN_MATCH_FAILED", "BOOK_ID_IS_MISSING", "BOOK_SKIPPED_BY_USER", "TARGET_DOC_NOT_READY", "NEW_SOURCE_NOT_IMPORTED", "WRITE_BLOCK_FAILED", "TARGET_DOC_NOT_FOUND", "UNKNOWN_ERROR"]);
    for (const file of ["wereadBookIdentity.ts", "ensureExistingBookNoteDocument.ts"]) {
        for (const text of fs.readFileSync(path.join(ROOT, "src/utils/weread/api", file), "utf8").matchAll(/"([A-Z][A-Z_]+)"/g)) knownCodes.add(text[1]);
    }
    const knownStages = new Set(["isbn.inspect", "note.input", "note.repair", "note.before_create", "note.create", "note.document", "note.readback", "claim.input", "claim.preflight", "claim.document", "claim.column", "claim.column_readback", "claim.before_write", "claim.write", "claim.readback"]);
    for (const saved of reports.records) {
        requireShape(Array.isArray(saved.items) && saved.items.every(isRecord), "REPORT_ITEMS_INVALID");
        for (const item of saved.items.filter(item => item.bookID === bookID)) {
            requireShape(item.reasonText === undefined || typeof item.reasonText === "string", "REPORT_REASON_INVALID");
            const stages = [...String(item.reasonText || "").matchAll(/\[((?:isbn|note|claim)\.[a-z_]+)\/([A-Z_]+)\]/g)].filter(pair => knownStages.has(pair[1]) && knownCodes.has(pair[2])).map(pair => ({ stage: pair[1], reasonCode: pair[2] }));
            report.historicalDiagnostics.push({ reasonCode: knownCodes.has(item.reasonCode) ? item.reasonCode : null, stages });
        }
    }
    report.writeOutcome = "not_proven_by_current_snapshot";
    return report;
}

function parseArgs(args) {
    const options = { url: "http://127.0.0.1:6806", timeoutMs: 15000 };
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        if (key === "--help") return { help: true };
        requireShape(["--title", "--url", "--timeout-ms"].includes(key) && typeof args[i + 1] === "string", "INVALID_ARGUMENTS");
        options[{ "--title": "title", "--url": "url", "--timeout-ms": "timeoutMs" }[key]] = key === "--timeout-ms" ? Number(args[++i]) : args[++i];
    }
    requireShape(typeof options.title === "string" && !!options.title.trim(), "TITLE_REQUIRED");
    return options;
}

async function main() {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (options.help) { console.log("Usage: node scripts/diagnose_weread_identity_readonly.cjs --title <title> [--url http://127.0.0.1:6806] [--timeout-ms 15000]\nSet SIYUAN_API_TOKEN in the process environment using secure local input. No credentials on the command line. Requires the existing TypeScript development dependency. Output is redacted JSON; no files are saved."); return; }
        const client = createClient({ ...options, token: process.env.SIYUAN_API_TOKEN });
        // Connectivity is checked first; build comparison never proves which JS is loaded in memory.
        const list = await client.api("/api/notebook/lsNotebooks", {});
        requireShape(isRecord(list) && Array.isArray(list.notebooks), "NOTEBOOKS_SHAPE_INVALID");
        const builds = await inspectBuilds(client);
        const report = await audit(client, options.title);
        report.builds = builds;
        report.sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        report.safety = { writesExecuted: false, rawDataSaved: false, apiRequests: client.requests.length };
        console.log(JSON.stringify(report, null, 2));
    } catch (error) {
        // Never expose server messages, arguments, source records or a native exception stack.
        console.error(JSON.stringify({ error: error.diagnosticCode || "DIAGNOSTIC_FAILED", rawDataSaved: false }));
        process.exitCode = 1;
    }
}
module.exports = { createClient, projectHelpers, inspectBuilds, audit, parseArgs };
if (require.main === module) main();
