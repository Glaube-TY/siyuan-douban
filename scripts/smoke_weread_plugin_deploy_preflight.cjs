const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { preflight, knownConcurrentProcesses } = require("./preflight_weread_plugin_deploy.cjs");
const base = fs.mkdtempSync(path.join(os.tmpdir(), "weread-preflight-"));
const savedTarget = process.env.SIYUAN_PLUGIN_DIR;
let passed = 0;
function fixture() {
    const rootDir = fs.mkdtempSync(path.join(base, "repo-")), workspaceDir = fs.mkdtempSync(path.join(base, "workspace-"));
    const pluginDir = path.join(workspaceDir, "data/plugins"), target = path.join(pluginDir, "siyuan-douban");
    fs.mkdirSync(target, { recursive: true });
    for (const dir of [rootDir, path.join(rootDir,"dist"),path.join(rootDir,"dev"),target]) {
        fs.mkdirSync(path.join(dir,"i18n"),{recursive:true}); fs.mkdirSync(path.join(dir,"asset"),{recursive:true});
        for (const [file,content] of Object.entries({"plugin.json":'{"name":"siyuan-douban"}',"index.js":"synthetic-app","kernel.js":"synthetic-kernel","index.css":"synthetic-css","i18n/zh_CN.json":"{}","i18n/en_US.json":"{}"})) fs.writeFileSync(path.join(dir,file),content);
    }
    const git = args => execFileSync("git", ["-C",rootDir,...args], {stdio:"ignore"});
    git(["init","-q"]); git(["add","."]); git(["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","fixture"]);
    process.env.SIYUAN_PLUGIN_DIR=pluginDir;
    return {rootDir,workspaceDir,target,run:()=>preflight({rootDir,workspaceDir,processes:[],selfPID:100})};
}
async function test(name, fn) { await fn(); console.log(`PASS ${++passed}: ${name}`); }
(async()=>{
    await test("clean preflight is read-only and never grants client safety",async()=>{
        const f=fixture(), before=fs.readFileSync(path.join(f.target,"index.js")); const r=await f.run();
        assert.equal(r.filesReady,true); assert.equal(r.clientSafetyConfirmed,false); assert.equal(r.deploymentPerformed,false);
        assert.deepEqual(r.planned,{add:[],overwrite:[],delete:[]}); assert.ok(before.equals(fs.readFileSync(path.join(f.target,"index.js"))));
        assert.ok(!JSON.stringify(r).includes(base));
    });
    await test("dirty worktree blocks deployment readiness",async()=>{
        const f=fixture(); fs.writeFileSync(path.join(f.rootDir,"user-change.txt"),"keep"); assert.ok((await f.run()).blockers.includes("WORKTREE_DIRTY"));
    });
    await test("unknown installed content is listed and preserved",async()=>{
        const f=fixture(); const extra=path.join(f.target,"keep.txt"); fs.writeFileSync(extra,"keep"); const r=await f.run();
        assert.ok(r.blockers.includes("EXTRA_TARGET_FILES")); assert.deepEqual(r.planned.delete,["keep.txt"]); assert.equal(fs.readFileSync(extra,"utf8"),"keep");
    });
    await test("add and overwrite are planned without execution",async()=>{
        const f=fixture(); fs.unlinkSync(path.join(f.target,"index.css")); fs.writeFileSync(path.join(f.target,"index.js"),"old"); const r=await f.run();
        assert.deepEqual(r.planned.add,["index.css"]); assert.deepEqual(r.planned.overwrite,["index.js"]); assert.equal(fs.readFileSync(path.join(f.target,"index.js"),"utf8"),"old");
    });
    await test("wrong workspace and wrong plugin are refused",async()=>{
        const f=fixture(),other=fs.mkdtempSync(path.join(base,"other-")); fs.mkdirSync(path.join(other,"data/plugins"),{recursive:true});
        await assert.rejects(preflight({rootDir:f.rootDir,workspaceDir:other,processes:[]}),e=>e.diagnosticCode==="WORKSPACE_TARGET_MISMATCH");
        fs.writeFileSync(path.join(f.target,"plugin.json"),'{"name":"other-plugin"}'); await assert.rejects(f.run(),e=>e.diagnosticCode==="PLUGIN_NAME_MISMATCH");
    });
    await test("incomplete and mismatched builds are refused",async()=>{
        const f=fixture(); fs.writeFileSync(path.join(f.rootDir,"dev/index.js"),"stale"); await assert.rejects(f.run(),e=>e.diagnosticCode==="DEV_DIST_MISMATCH");
        fs.unlinkSync(path.join(f.rootDir,"dist/index.css")); await assert.rejects(f.run(),e=>e.diagnosticCode==="BUILD_INCOMPLETE");
    });
    await test("unknown source content is never deployed",async()=>{
        const f=fixture(); for(const dir of ["dev","dist"]) fs.writeFileSync(path.join(f.rootDir,dir,"private.txt"),"keep");
        await assert.rejects(f.run(),e=>e.diagnosticCode==="UNKNOWN_BUILD_FILE");
    });
    await test("nested and root directory links are refused",async()=>{
        const f=fixture(),destination=path.join(base,"link-destination"); fs.mkdirSync(destination); const link=path.join(f.target,"linked");
        fs.symlinkSync(destination,link,process.platform==="win32"?"junction":"dir"); await assert.rejects(f.run(),e=>e.diagnosticCode==="SYMLINK_REJECTED"); fs.unlinkSync(link);
        fs.renameSync(path.join(f.rootDir,"dev"),path.join(f.rootDir,"saved-dev")); fs.symlinkSync(path.join(f.rootDir,"saved-dev"),path.join(f.rootDir,"dev"),process.platform==="win32"?"junction":"dir");
        await assert.rejects(f.run(),e=>e.diagnosticCode==="SYMLINK_REJECTED"); fs.unlinkSync(path.join(f.rootDir,"dev"));
    });
    await test("process scanner excludes its ancestry but blocks another watcher",async()=>{
        const processes=[{ProcessId:100,ParentProcessId:50,Name:"node.exe",CommandLine:"probe"},{ProcessId:50,ParentProcessId:0,Name:"pwsh.exe",CommandLine:"vite build --watch"},{ProcessId:101,ParentProcessId:0,Name:"node.exe",CommandLine:"vite build --watch"}];
        assert.equal(knownConcurrentProcesses(processes,100,"synthetic-root"),1); assert.equal(knownConcurrentProcesses(processes.slice(0,2),100,"synthetic-root"),0);
    });
    console.log(`Deployment preflight: ${passed} synthetic scenarios PASS`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    if(savedTarget===undefined) delete process.env.SIYUAN_PLUGIN_DIR; else process.env.SIYUAN_PLUGIN_DIR=savedTarget;
    const resolved=fs.realpathSync(base); if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith("weread-preflight-")) throw Error("Unsafe cleanup target");
    fs.rmSync(resolved,{recursive:true,force:true});
});
