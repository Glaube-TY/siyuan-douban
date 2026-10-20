// Read-only deployment inventory. This script never deploys or changes client settings.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createClient } = require("./diagnose_weread_identity_readonly.cjs");
const ROOT = path.resolve(__dirname, "..");
const MARKER = ".siyuan-dev-deploy.json";
const REQUIRED = ["index.js", "kernel.js", "plugin.json", "index.css", "i18n/zh_CN.json", "i18n/en_US.json"];
const fail = code => { throw Object.assign(new Error(code), { diagnosticCode: code }); };
const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
const contains = (a, b) => { const relative = path.relative(canonical(a), canonical(b)); return !relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); };
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function noLinks(directory) {
    for (let current = path.resolve(directory); ; current = path.dirname(current)) {
        if (fs.lstatSync(current).isSymbolicLink()) fail("SYMLINK_REJECTED");
        if (path.dirname(current) === current) break;
    }
}
function files(directory) {
    noLinks(directory);
    const result = new Map();
    function walk(current) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name), stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink()) fail("SYMLINK_REJECTED");
            if (stat.isDirectory()) walk(absolute);
            else if (stat.isFile()) result.set(path.relative(directory, absolute).split(path.sep).join("/"), hash(absolute));
            else fail("UNSUPPORTED_FILE_TYPE");
        }
    }
    walk(directory); return result;
}
function knownConcurrentProcesses(processes, selfPID, rootDir) {
    if (!Array.isArray(processes) || processes.some(p => !Number.isInteger(p.ProcessId) || !Number.isInteger(p.ParentProcessId))) fail("PROCESS_SCAN_INVALID");
    const excluded = new Set([selfPID]);
    for (let pid = selfPID; ;) {
        const parent = processes.find(p => p.ProcessId === pid)?.ParentProcessId;
        if (!parent || excluded.has(parent)) break;
        excluded.add(parent); pid = parent;
    }
    return processes.filter(p => {
        if (excluded.has(p.ProcessId)) return false;
        const command = p.CommandLine || "";
        return /(?:node|pnpm|npm|pwsh|cmd)(?:\.exe)?$/i.test(p.Name || "")
            && (/(?:vite.*(?:--watch)|sync_dist_to_dev\.[cm]?js|make_dev_link\.[cm]?js)/i.test(command)
                || (canonical(command).includes(canonical(rootDir)) && /(?:dev:app|dev:kernel|build:dev|pnpm\s+dev|npm\s+run\s+dev)/i.test(command)));
    }).length;
}
function scanProcesses() {
    if (process.platform !== "win32") fail("PROCESS_SCAN_UNSUPPORTED");
    const text = execFileSync("pwsh.exe", ["-NoLogo", "-NoProfile", "-Command", "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine)"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(text);
}
async function preflight({ rootDir = ROOT, workspaceDir, processes, selfPID = process.pid }) {
    noLinks(rootDir);
    if (typeof workspaceDir !== "string" || !path.isAbsolute(workspaceDir)) fail("WORKSPACE_PATH_INVALID");
    noLinks(workspaceDir);
    const { resolveConfiguredDevPluginDir } = await import(pathToFileURL(path.join(ROOT, "scripts/dev_deploy.js")).href);
    const { loadLocalEnvFile } = await import(pathToFileURL(path.join(ROOT, "scripts/utils.js")).href);
    loadLocalEnvFile(path.join(rootDir, ".env"));
    const pluginDir = resolveConfiguredDevPluginDir(rootDir);
    if (!pluginDir) fail("DEPLOY_TARGET_MISSING");
    const expected = path.join(workspaceDir, "data/plugins");
    noLinks(pluginDir); noLinks(expected);
    if (canonical(fs.realpathSync(pluginDir)) !== canonical(fs.realpathSync(expected))) fail("WORKSPACE_TARGET_MISMATCH");
    const dirs = [path.join(rootDir, "dist"), path.join(rootDir, "dev"), path.join(pluginDir, "siyuan-douban")];
    const inventories = dirs.map(files);
    const resolved = dirs.map(dir => fs.realpathSync(dir));
    if (resolved.some((a, i) => resolved.some((b, j) => i !== j && (contains(a, b) || contains(b, a))))) fail("PATH_OVERLAP");
    for (const dir of [rootDir, ...dirs]) if (JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8")).name !== "siyuan-douban") fail("PLUGIN_NAME_MISMATCH");
    const markerPath = path.join(dirs[2], MARKER);
    if (fs.existsSync(markerPath)) {
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
        if (marker.schema !== "siyuan-douban-dev-deployment" || marker.pluginName !== "siyuan-douban") fail("DEPLOY_MARKER_INVALID");
    }
    const [dist, dev, target] = inventories;
    if (REQUIRED.some(file => !dist.has(file) || !dev.has(file))) fail("BUILD_INCOMPLETE");
    const allowed = new Set(["index.js", "kernel.js", "plugin.json", "index.css", "preview.png", "icon.png", ...fs.readdirSync(rootDir).filter(file => /^README.*\.md$/.test(file)), ...fs.readdirSync(path.join(rootDir, "asset")).map(file => "asset/" + file), "i18n/zh_CN.json", "i18n/en_US.json"]);
    if ([...dist.keys()].some(file => !allowed.has(file))) fail("UNKNOWN_BUILD_FILE");
    if (dist.size !== dev.size || [...dist].some(([file, digest]) => dev.get(file) !== digest)) fail("DEV_DIST_MISMATCH");
    // Unknown target files are never assumed disposable, including obsolete-looking assets.
    const extraFiles = [...target.keys()].filter(file => file !== MARKER && !dev.has(file)).sort();
    const add = [...dev.keys()].filter(file => file !== MARKER && !target.has(file)).sort();
    const overwrite = [...dev.keys()].filter(file => file !== MARKER && target.has(file) && target.get(file) !== dev.get(file)).sort();
    const git = args => execFileSync("git", ["-C", rootDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const head = git(["rev-parse", "HEAD"]), dirty = !!git(["status", "--porcelain", "--untracked-files=all"]);
    const concurrentProcessCount = knownConcurrentProcesses(processes || scanProcesses(), selfPID, rootDir);
    const blockers = [dirty && "WORKTREE_DIRTY", extraFiles.length && "EXTRA_TARGET_FILES", concurrentProcessCount && "CONCURRENT_DEPLOY_PROCESS"].filter(Boolean);
    return { head, dirty, targetVerified: true, noPathOverlap: true, symlinksRejected: true,
        hashes: Object.fromEntries(["dist", "dev", "installed"].map((name, i) => [name, Object.fromEntries(["index.js", "kernel.js", "plugin.json"].map(file => [file, inventories[i].get(file)]))])),
        planned: { add, overwrite, delete: extraFiles }, extraFiles, concurrentProcessCount, blockers,
        filesReady: !blockers.length, clientSafetyConfirmed: false, deploymentPerformed: false };
}
async function main() {
    try {
        if (process.argv.includes("--help")) { console.log("Read-only deployment preflight. Requires SIYUAN_API_TOKEN. No deployment or client-setting changes; client safety must be confirmed separately."); return; }
        if (process.argv.length > 2) fail("UNKNOWN_ARGUMENT");
        const client = createClient({ token: process.env.SIYUAN_API_TOKEN });
        const notebooks = await client.api("/api/notebook/lsNotebooks", {});
        if (!Array.isArray(notebooks?.notebooks)) fail("NOTEBOOKS_SHAPE_INVALID");
        const workspace = await client.api("/api/system/getWorkspaceInfo", {});
        const result = await preflight({ workspaceDir: workspace?.workspaceDir });
        console.log(JSON.stringify(result, null, 2));
        if (!result.filesReady) process.exitCode = 1;
    } catch (error) { console.error(JSON.stringify({ error: /^[A-Z][A-Z_0-9]*$/.test(error?.diagnosticCode || "") ? error.diagnosticCode : "PREFLIGHT_FAILED" })); process.exitCode = 1; }
}
module.exports = { preflight, files, knownConcurrentProcesses };
if (require.main === module) main();
