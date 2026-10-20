const fs = require("node:fs");
const path = require("node:path");
const { createClient, parseArgs } = require("./diagnose_weread_identity_readonly.cjs");
const ROOT = path.resolve(__dirname, "..");
const STATES = new Set(["eligible", "conflict", "invalid_binding", "already_linked", "insufficient_evidence", "read_error"]);
function fail(code) { throw Object.assign(new Error(code), { diagnosticCode: code }); }

// Load the production inspector with read adapters only; every other API is a throwing stub.
function loadInspector(client) {
    const ts = require("typescript"), modules = new Map();
    const forbidden = () => fail("READ_ONLY_VIOLATION");
    const api = new Proxy(Object.freeze({
        sql: stmt => client.sql(stmt),
        getAttributeView: id => client.api("/api/av/getAttributeView", { id }),
    }), { get: (target, name) => Object.hasOwn(target, name) ? target[name] : forbidden });
    function load(file) {
        const absolute = path.resolve(ROOT, file);
        if (!absolute.startsWith(path.join(ROOT, "src") + path.sep)) fail("MODULE_PATH_INVALID");
        if (absolute === path.join(ROOT, "src/api.ts")) return api;
        if (absolute === path.join(ROOT, "src/utils/core/formatOp.ts")) return { generateUniqueBlocked: forbidden };
        if (modules.has(absolute)) return modules.get(absolute).exports;
        const module = { exports: {} }; modules.set(absolute, module);
        const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function("require", "module", "exports", "console", code)(name => {
            if (!name.startsWith(".") && !name.startsWith("@/")) fail("EXTERNAL_MODULE_NOT_ALLOWED");
            const base = name.startsWith("@/") ? path.join(ROOT, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
            return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
        }, module, module.exports, { warn() {}, error() {}, log() {} });
        return module.exports;
    }
    return {
        inspect: load("src/utils/weread/api/wereadBookIDRepair.ts").inspectWereadBookIDRepairCandidates,
        normalizeTitle: load("src/utils/bookHandling/bookDeduplication.ts").normalizeBookTitle,
    };
}

async function probeWereadBookIDRepair(client, title) {
    const notebooks = await client.api("/api/notebook/lsNotebooks", {});
    if (!notebooks || !Array.isArray(notebooks.notebooks)) fail("NOTEBOOKS_SHAPE_INVALID");
    const { inspect, normalizeTitle } = loadInspector(client);
    const needle = normalizeTitle(title);
    if (!needle) fail("TITLE_REQUIRED");
    const plugin = { name: "siyuan-douban", i18n: {}, loadDataStrict: key => client.file(key), saveData: () => fail("READ_ONLY_VIOLATION") };
    const inspection = await inspect(plugin);
    if (!["ok", "read_error", "insufficient_evidence"].includes(inspection?.status) || !/^[A-Z][A-Z_]*$/.test(inspection.reasonCode || "") || !Array.isArray(inspection.items)) fail("INSPECTION_SHAPE_INVALID");
    if (inspection.items.some(item => !item || !STATES.has(item.status) || typeof item.sourceTitle !== "string" || typeof item.localTitle !== "string" || !/^[A-Z][A-Z_]*$/.test(item.reasonCode || ""))) fail("CANDIDATE_SHAPE_INVALID");
    // Titles only filter the production service's results, never infer an identity or write target.
    const matches = inspection.items.filter(item => normalizeTitle(item.sourceTitle).includes(needle) || normalizeTitle(item.localTitle).includes(needle));
    const unique = matches.length === 1 ? matches[0] : null;
    return {
        inspection: { status: inspection.status, reasonCode: inspection.reasonCode },
        matchedCandidateCount: matches.length,
        eligibleCount: matches.filter(item => item.status === "eligible").length,
        conflictCount: matches.filter(item => item.status === "conflict").length,
        invalidBindingCount: matches.filter(item => item.status === "invalid_binding").length,
        alreadyLinkedCount: matches.filter(item => item.status === "already_linked").length,
        targetStatus: unique?.status || (matches.length ? "ambiguous" : "not_found"),
        targetReasonCode: unique?.reasonCode || (matches.length ? "TARGET_AMBIGUOUS" : "TARGET_NOT_FOUND"),
        canEnterConfirmation: inspection.status === "ok" && unique?.status === "eligible" && !!unique.snapshot,
    };
}

async function main() {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (options.help) {
            console.log("Usage: node scripts/probe_weread_bookid_repair_readonly.cjs --title <title> [--url http://127.0.0.1:6806] [--timeout-ms 15000]\nRequires SIYUAN_API_TOKEN in the environment and the existing TypeScript development dependency. Calls the production inspector only; writes and raw/private output are disabled.");
            return;
        }
        const client = createClient({ ...options, token: process.env.SIYUAN_API_TOKEN });
        console.log(JSON.stringify(await probeWereadBookIDRepair(client, options.title), null, 2));
    } catch (error) {
        console.error(JSON.stringify({ error: error?.diagnosticCode || "PROBE_FAILED" }));
        process.exitCode = 1;
    }
}
module.exports = { loadInspector, probeWereadBookIDRepair };
if (require.main === module) main();
