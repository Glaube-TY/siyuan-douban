// Real import -> task -> report persistence, with synthetic host/network/storage only.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const existing = fs.readFileSync(path.join(__dirname, "smoke_weread_book_identity.cjs"), "utf8");
const boundary = existing.indexOf("(async () => {");
assert.ok(boundary > 0);
async function scenarios() {
    const diagnosticsModule = load("src/utils/weread/api/wereadBookIdentityDiagnostics.ts");
    const { extractWereadBookIdentityFailure: extract, wereadBookIdentityError: identityError } = diagnosticsModule;
    const builder = load("src/utils/storage/syncReportBuilder.ts");
    const { classifyWereadBookIdentityFailure: classify, buildWereadImportFailureReportItem: reportItem } = builder;
    const identityModule = load("src/utils/weread/api/wereadBookIdentity.ts");
    const handler = load("src/utils/weread/api/handleWereadApiNewSources.ts");
    const originalLink = identityModule.linkWereadISBNSourceToDatabase, originalCommit = handler.commitWereadNewSources;
    const originalSave = plugin.saveData;
    let injected, commits = [], saves = [], plans = [], approve = true, selection = "isbn", selected = "A", count = 0;
    identityModule.linkWereadISBNSourceToDatabase = async (...args) => { if (injected) throw injected; return originalLink(...args); };
    handler.commitWereadNewSources = async (...args) => { const result = await originalCommit(...args); commits.push(result); return result; };
    plugin.saveData = async (key,value) => { saves.push(key); await originalSave(key,value); };
    mock("src/utils/settings/wereadApiKeyCrypto.ts", { isEncryptedWereadApiKey:()=>true, decryptWereadApiKey:()=>"fixture-key", encryptWereadApiKey:()=>"fixture-encrypted" });
    mock("src/utils/weread/api/buildWereadApiNotebookCache.ts", { buildWereadApiNotebookCache:async()=>structuredClone(rawNotebooks.books) });
    const dialog = mocks.get(path.join(root,"src/libs/dialog.ts")).svelteDialog;
    mocks.get(path.join(root,"src/libs/dialog.ts")).svelteDialog = options => {
        const result = dialog(options);
        setImmediate(()=>dialogProps.onConfirm(selection==="isbn"?dialogProps.books.filter(b=>b.bookID===selected):[],[],selection==="bookID"?dialogProps.books.filter(b=>b.bookID===selected):[]));
        return result;
    };
    mock("src/utils/weread/api/confirmWereadSyncPlan.ts", { confirmWereadSyncPlan:async()=>{throw Error("Unexpected dialog");} });
    const { runWereadApiSyncTask: task } = load("src/utils/weread/api/runWereadApiSyncTask.ts");
    const newBookID = mocks.get(path.join(root,"src/utils/weread/addUseBookIDs.ts"));
    const originalAdd = newBookID.addUseBookIDsToDatabase;
    const run = () => task(plugin,"update",{trigger:"manual",confirmPlan:async payload=>{
        assert.equal(saves.length,0); assert.equal(claims.length,0); assert.equal(created.length,0); assert.equal(writes.length,0);
        plans.push(payload); return approve;
    }});
    function setup() {
        reset(); injected=undefined; commits=[]; saves=[]; plans=[]; approve=true; selection="isbn"; selected="A"; plugin.i18n={};
        newBookID.addUseBookIDsToDatabase=originalAdd;
        storage.weread_templates="template"; storage.weread_auth_settings={apiKeyEncrypted:"fixture-encrypted",verified:true};
        rawNotebooks={books:[{...source("A",ISBN_A,"Synthetic source"),pendingImport:true}]};
        storage.temporary_weread_notebooksList=structuredClone(rawNotebooks.books);
        row("",ISBN_A,"doc-a","Synthetic local"); bookInfos.set("A",detail("A",ISBN_A)); doubanBooks.set(ISBN_A,douban(ISBN_A,"Synthetic local",""));
    }
    async function test(name,fn) { await fn(); console.log(`PASS ${++count}: ${name}`); }
    const failure = (stage,reasonCode,message="ISBN 关联验证失败")=>identityError(message,stage,reasonCode);
    const cases = [
        ["isbn.inspect","ISBN_MATCH_MISSING","ISBN_MATCH_FAILED"], ["isbn.inspect","ISBN_MISMATCH","ISBN_MATCH_FAILED"],
        ["claim.preflight","ROW_ID_CHANGED"], ["claim.document","DOCUMENT_INDEX_NOT_VISIBLE"],
        ["claim.column_readback","BOOKID_COLUMN_NOT_VISIBLE"], ["claim.before_write","BOOKID_CELL_CONFLICT"],
        ["claim.write","CLAIM_WRITE_FAILED"], ["claim.readback","CLAIM_READBACK_FAILED"], ["note.readback","DOCUMENT_BINDING_READBACK_FAILED"],
    ];
    for (const [stage,code,expected="BOOK_IDENTITY_LINK_FAILED"] of cases) await test(`${stage}/${code}: real import failure reaches saved report once`,async()=>{
        setup(); injected=failure(stage,code); const structured=extract(injected); assert.deepEqual(structured,{stage,reasonCode:code}); assert.equal(classify(structured),expected);
        const result=await run(); assert.equal(result.totalFailed,1); assert.equal(result.totalSuccess,0); assert.equal(result.status,"failed");
        assert.equal(commits.length,1); assert.deepEqual(commits[0].failed[0].identityFailure,structured); assert.deepEqual(commits[0].successfulBookIDs,[]);
        const reports=storage.weread_sync_reports; assert.equal(reports.length,1); assert.equal(reports[0].failedCount,1); assert.equal(reports[0].totalSources,1);
        const item=reports[0].items[0]; assert.equal(item.reasonCode,expected); assert.equal(item.status,"failed"); assert.equal(item.sourceKey,"weread-book:A");
        assert.equal(item.sourceType,"book"); assert.equal(item.bookID,"A"); assert.ok(item.title); assert.ok(item.suggestion);
        assert.equal(item.newBookmarkCount,0); assert.equal(item.newReviewCount,0); assert.equal(item.reasonText.split(`[${stage}/${code}]`).length-1,1);
        assert.match(item.reasonText,/部分写入/); assert.equal(storage.temporary_weread_notebooksList[0].pendingImport,true);
        assert.equal(claims.length,0); assert.equal(created.length,0); assert.equal(writes.length,0); assert.equal(bindingWrites.length,0); assert.equal(removals.length,0);
        assert.equal(saves.filter(key=>key==="weread_sync_reports").length,1);
        assert.equal(Object.hasOwn(item,"identityFailure"),false); assert.equal(Object.hasOwn(item,"diagnostic"),false); assert.equal(Object.hasOwn(item,"stack"),false);
    });
    await test("only genuine Errors with known stages and short diagnostic codes qualify",async()=>{
        for (const value of [{stage:"claim.readback",reasonCode:"CLAIM_READBACK_FAILED"},new Error("claim.readback"),Object.assign(new Error("x"),{stage:"outside.stage",reasonCode:"CODE"}),Object.assign(new Error("x"),{stage:"claim.write",reasonCode:"private code"}),Object.assign(new Error("x"),{stage:"claim.write",reasonCode:"A".repeat(65)})]) assert.equal(extract(value),null);
        const e=new Error("x"); Object.defineProperty(e,"stage",{get(){throw Error("must not invoke getter");}}); assert.equal(extract(e),null);
    });
    await test("unstructured ISBN message does not invent a stage or marker",async()=>{
        setup(); injected=new Error("Synthetic ISBN import failed"); await run();
        const item=storage.weread_sync_reports[0].items[0]; assert.equal(item.reasonCode,"UNKNOWN_ERROR"); assert.ok(!item.reasonText.includes("[claim.")); assert.equal(commits[0].failed[0].identityFailure,undefined);
    });
    await test("duplicate diagnostic suffix appears once",async()=>{
        const item=reportItem({bookID:"A",title:"Synthetic",sourceType:"book",message:"failed [claim.write/CLAIM_WRITE_FAILED] [claim.write/CLAIM_WRITE_FAILED]",identityFailure:{stage:"claim.write",reasonCode:"CLAIM_WRITE_FAILED"}});
        assert.equal(item.reasonText.split("[claim.write/CLAIM_WRITE_FAILED]").length-1,1);
    });
    await test("snapshots, stack and credentials are not copied into report fields",async()=>{
        setup(); const secret="SYNTHETIC_SECRET_VALUE";
        injected=Object.assign(new Error("Authorization: token "+secret),{stage:"claim.write",reasonCode:"CLAIM_WRITE_FAILED"});
        for(const key of ["diagnostic","stack"]) Object.defineProperty(injected,key,{get(){throw Error("Do not read private "+key);}});
        await run(); const text=JSON.stringify(storage.weread_sync_reports); assert.ok(!text.includes(secret)); assert.ok(!text.includes('"diagnostic"')); assert.ok(!text.includes('"stack"'));
        assert.ok(!JSON.stringify(storage.reading_book_statuses).includes(secret));
    });
    await test("BookID import preserves structured failure and partial-write warning",async()=>{
        setup(); selection="bookID"; const e=failure("claim.before_write","ROW_ID_CHANGED"); newBookID.addUseBookIDsToDatabase=async()=>{throw e;}; await run();
        assert.deepEqual(commits[0].failed[0].identityFailure,extract(e)); assert.equal(storage.weread_sync_reports[0].items[0].reasonCode,"BOOK_IDENTITY_LINK_FAILED");
        assert.match(storage.weread_sync_reports[0].items[0].reasonText,/部分写入/); assert.equal(writes.length,0);
        setup(); selection="bookID"; newBookID.addUseBookIDsToDatabase=async()=>{throw new Error("Unstructured import failure");}; await run();
        assert.equal(commits[0].failed[0].identityFailure,undefined); assert.equal(storage.weread_sync_reports[0].items[0].reasonCode,"UNKNOWN_ERROR"); assert.ok(!storage.weread_sync_reports[0].items[0].reasonText.includes("[claim."));
    });
    await test("successful sources have no failure diagnostics",async()=>{
        setup(); const result=await run(); assert.equal(result.totalSuccess,1); assert.equal(result.totalFailed,0); assert.equal(commits[0].failed.length,0);
        const item=storage.weread_sync_reports[0].items[0]; assert.equal(item.status,"success"); assert.equal(item.reasonCode,undefined); assert.ok(!item.reasonText?.includes("[claim.")); assert.equal(claims.length,1); assert.equal(created.length,0);
    });
    await test("cancelled final approval leaves all synthetic state unchanged and creates no report",async()=>{
        setup(); approve=false; const before=structuredClone({storage,keyValues,docs:[...docs]}); const result=await run();
        assert.equal(result.status,"cancelled"); assert.deepEqual({storage,keyValues,docs:[...docs]},before); assert.equal(saves.length,0); assert.equal(commits.length,0); assert.equal(claims.length,0); assert.equal(created.length,0); assert.equal(writes.length,0);
    });
    await test("one import plus two updates: partial failure counts once, only approved updates write",async()=>{
        setup(); for(const id of ["B","C"]) { row(id,"","doc-"+id,"Synthetic "+id); rawNotebooks.books.push(source(id,"","Synthetic "+id)); }
        injected=failure("claim.readback","CLAIM_READBACK_FAILED"); const result=await run();
        assert.deepEqual(plans[0].plannedItems.map(item=>item.action).sort(),["import_isbn","update","update"]); assert.equal(result.totalSuccess,2); assert.equal(result.totalFailed,1);
        const report=storage.weread_sync_reports[0]; assert.equal(report.status,"partial_success"); assert.equal(report.totalSources,3); assert.equal(report.successCount,2); assert.equal(report.failedCount,1); assert.equal(report.items.filter(item=>item.bookID==="A").length,1);
        assert.deepEqual(writes.map(item=>item.bookID).sort(),["B","C"]); assert.equal(claims.length,0); assert.equal(created.length,0); assert.equal(removals.length,0); assert.equal(storage.temporary_weread_notebooksList.find(b=>b.bookID==="A").pendingImport,true);
    });
    await test("legacy report without new fields loads and renders normally",async()=>{
        setup(); const old={id:"old",startedAt:1,trigger:"manual",status:"failed",totalSources:1,successCount:0,failedCount:1,skippedCount:0,newSourceCount:0,warnings:[],errors:[],items:[{bookID:"A",title:"Synthetic",sourceType:"book",status:"failed",reasonCode:"ISBN_MATCH_FAILED",reasonText:"Old failure",newBookmarkCount:0,newReviewCount:0}]};
        storage.weread_sync_reports=[old]; const reports=await load("src/utils/storage/syncReportStorage.ts").loadWereadSyncReports(plugin); assert.deepEqual(reports,[old]); assert.match(builder.formatWereadSyncReportMarkdown(reports[0]),/Old failure/);
    });
    await test("normal and MP results stay independent; arbitrary ISBN text is not matching evidence",async()=>{
        const report=builder.buildWereadSyncReport({startedAt:1,trigger:"test",normalResult:{items:[{bookID:"A",status:"failed",message:"ISBN linking failed"}]},mpResult:{items:[{bookID:"MP",status:"success",message:"同步成功"}]}});
        assert.equal(report.items[0].reasonCode,"UNKNOWN_ERROR"); assert.equal(report.items[1].sourceType,"mp"); assert.equal(report.items[1].reasonCode,undefined); assert.equal(report.successCount,1); assert.equal(report.failedCount,1);
    });
    await test("only bounded legacy generator format is inferred, never promoted to structured evidence",async()=>{
        for(const [message,expected] of [["回读验证未通过 [claim.readback/CLAIM_READBACK_FAILED]","BOOK_IDENTITY_LINK_FAILED"],["External [claim.readback/CLAIM_READBACK_FAILED]","UNKNOWN_ERROR"],["External [isbn.inspect/ISBN_MATCH_MISSING]","UNKNOWN_ERROR"]]) {
            const report=builder.buildWereadSyncReport({startedAt:1,trigger:"test",normalResult:{items:[{bookID:"A",status:"failed",message}]}}); assert.equal(report.items[0].reasonCode,expected);
            assert.equal(extract(new Error(message)),null);
        }
    });
    await test("Chinese/English suggestions and visible marker survive report localization",async()=>{
        const {localizeKnownUiText:localize}=load("src/utils/i18n.ts"); const item=reportItem({bookID:"A",title:"Synthetic",sourceType:"book",message:"本地书籍状态已发生变化",identityFailure:{stage:"claim.write",reasonCode:"CLAIM_WRITE_FAILED"}});
        for(const language of ["zh_CN","en_US"]) {
            const dictionary=JSON.parse(fs.readFileSync(path.join(root,"public/i18n/"+language+".json"),"utf8"));
            assert.equal(localize(dictionary,item.suggestion),dictionary.syncSuggestionIdentityLink); assert.ok(localize(dictionary,item.reasonText).includes("[claim.write/CLAIM_WRITE_FAILED]"));
        }
    });
    await test("MP import failure keeps original behavior without attaching a book diagnostic",async()=>{
        setup(); const mp=source("MP_WXS_fixture","","Synthetic account"); mp.sourceType="weread_mp_account";
        const syncData=mocks.get(path.join(root,"src/utils/weread/api/buildWereadApiMpAccountSyncData.ts")); const original=syncData.buildWereadApiMpAccountSyncData;
        syncData.buildWereadApiMpAccountSyncData=async()=>{throw failure("claim.write","CLAIM_WRITE_FAILED");};
        const result=await originalCommit(plugin,"fixture-key",[mp],[],[],[mp],new Map(),{items:[{bookID:mp.bookID,sourceType:"mp",action:"import_mp"}]});
        syncData.buildWereadApiMpAccountSyncData=original; assert.equal(result.failed.length,1); assert.equal(result.failed[0].identityFailure,undefined); assert.deepEqual(result.successfulMpBookIDs,[]); assert.equal(claims.length,0); assert.equal(writes.length,0);
    });
    console.warn=originalWarn;
    console.log(`WeRead import failure diagnostics: ${count} scenarios PASS (synthetic I/O only; no deployment or live writes)`);
}
const watchdog=setTimeout(()=>{console.error("Diagnostics smoke timed out");process.exit(1);},30000);
new Function("require","__dirname",existing.slice(0,boundary)+"\nreturn ("+scenarios.toString()+")();")(require,__dirname)
    .catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
