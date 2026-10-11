// Real normalization/rendering/incremental code; mocked network and SiYuan I/O, no user data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const mocks = new Map(), modules = new Map();
const mock = (file, value) => mocks.set(path.join(root, file), value);
function load(file) {
    const absolute = path.resolve(root, file);
    if (mocks.has(absolute)) return mocks.get(absolute);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} }; modules.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
        if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        return load(fs.existsSync(base + ".ts") ? base + ".ts" : path.join(base, "index.ts"));
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
}
let syncData, serial = 0, proxyResponse = {}, requests = [];
let blocks = [{ id: "user-before", content: "Manual notes" }, { id: "mark", content: "【微信读书同步笔记】" }];
mock("src/api.ts", {
    getChildBlocks: async () => structuredClone(blocks),
    forwardProxyStrict: async (url, method, body, headers) => {
        assert.equal(method, "POST"); assert.equal(url, "https://i.weread.qq.com/api/agent/gateway");
        assert.ok(headers[0].Authorization === "Bearer fixture-key", "Bearer authorization retained");
        requests.push(structuredClone(body)); return structuredClone(proxyResponse);
    },
    appendBlock: async () => { throw new Error("Existing position mark must be retained"); },
    insertBlock: async (_type, markdown, _next, previousID) => {
        const id = "managed-" + ++serial;
        blocks.splice(blocks.findIndex(block => block.id === previousID) + 1, 0, { id, content: markdown });
        return [{ doOperations: [{ id }] }];
    },
    deleteBlock: async id => {
        assert.ok(id.startsWith("managed-"), "Never delete user content or the position mark");
        blocks = blocks.filter(block => block.id !== id);
    },
    moveBlock: async (id, previousID) => {
        const block = blocks.find(block => block.id === id);
        blocks = blocks.filter(block => block.id !== id);
        blocks.splice(blocks.findIndex(block => block.id === previousID) + 1, 0, block);
    },
    setBlockAttrs: async id => assert.ok(id.startsWith("managed-")),
});
mock("src/utils/weread/api/buildWereadApiBookSyncData.ts", { buildWereadApiBookSyncData: async () => syncData });
const { normalizeBookInfo } = load("src/utils/weread/api/normalizers/normalizeBookInfo.ts");
const { convertWereadApiBookToTemplateData: convert } = load("src/utils/weread/api/convertWereadApiBookToTemplateData.ts");
const { buildWereadApiEnhancedNotebook: enhance } = load("src/utils/weread/api/buildWereadApiEnhancedNotebook.ts");
const render = load("src/utils/weread/wereadTemplateRender.ts");
const { buildWereadBookRenderModel: buildModel } = load("src/utils/weread/incremental/buildBookRenderModel.ts");
const { syncWereadBookIncremental: sync } = load("src/utils/weread/incremental/syncBookIncremental.ts");
const { hashText, normalizeMarkdownForHash } = load("src/utils/weread/incremental/hash.ts");
const deepLink = "weread://book/detail/fixture?value=$&", readerLink = "https://weread.qq.com/reader/fixture?value=$&";
const links = "{{bookID}}|{{wereadDeepLink}}|{{wereadReaderLink}}";
const template = `META ${links}
{{#chapters}}CHAPTER {{chapterTitle1}} ${links}
{{#notes}}NOTE {{highlightText}} ${links}
{{#comments}}COMMENT {{content}} ${links}{{/comments}}{{/notes}}
{{#chapterComments}}CHAPTER_COMMENT {{chapterComments}} ${links}{{/chapterComments}}{{/chapters}}
{{#globalComments}}GLOBAL {{globalComments}} ${links}{{/globalComments}}
{{#bookInfo}}INTRO {{bookInfo}} ${links}{{/bookInfo}}
{{#bestHighlights}}BEST {{bestHighlight}} ${links}{{/bestHighlights}}`;
async function notebook(fields) {
    const raw = { bookId: "WR_A", title: "A", author: "Author", isbn: "9787111128069", intro: "Intro", ...fields };
    const before = structuredClone(raw);
    syncData = {
        bookInfo: normalizeBookInfo(raw),
        chapters: [{ chapterUid: 1, chapterIdx: 1, title: "Chapter", level: 1 }],
        highlights: [{ id: "h1", bookId: "WR_A", chapterUid: 1, markText: "Highlight", range: "1-2", createTime: 10 }],
        reviews: [
            { id: "r1", bookId: "WR_A", chapterUid: 1, abstract: "Highlight", content: "Note comment", range: "1-2", createTime: 11 },
            { id: "r2", bookId: "WR_A", chapterUid: 1, content: "Chapter comment", createTime: 12 },
            { id: "r3", bookId: "WR_A", chapterUid: 0, content: "Global comment", createTime: 13 },
        ],
        bestHighlights: [{ markText: "Best highlight" }], chapterMap: new Map(),
    };
    const converted = convert(syncData);
    assert.equal(converted.book.readerLink, fields.readerLink || "");
    assert.equal(converted.book.deepLink, fields.deepLink);
    const result = await enhance("fixture-key", { bookID: "WR_A", updatedTime: 20 });
    assert.equal(result.bookDetails.readerLink, fields.readerLink || "");
    assert.equal(result.bookDetails.deepLink, fields.deepLink);
    assert.deepEqual(raw, before); return result;
}
const modelFor = (notebook, value = template) => buildModel({ notebook, template: value, bookID: "WR_A", title: "A" });
(async () => {
    let both, fullModel;
    for (const [name, fields] of [["A both", { readerLink, deepLink }], ["B detail only", { deepLink }], ["C reader only", { readerLink }], ["D neither", {}]]) {
        const data = await notebook(fields), model = modelFor(data);
        const expected = "WR_A|" + (fields.deepLink || "") + "|" + (fields.readerLink || "");
        const variables = render.buildTemplateVariables(data, data.comments.reviews);
        assert.equal(render.renderWereadTemplate(links, variables), expected);
        for (const item of model.items) {
            assert.ok(item.markdown.includes(expected), "Every managed fragment receives independent links");
            assert.doesNotMatch(item.markdown, /\{\{(?:wereadReaderLink|wereadDeepLink|bookID)\}\}/);
            assert.equal(item.renderHash, hashText(normalizeMarkdownForHash(item.markdown)));
        }
        assert.deepEqual(new Set(model.items.map(item => item.itemKind)), new Set(["book-meta", "book-chapter", "book-note", "book-chapter-comment", "book-global-comment", "book-info", "book-best-highlight"]));
        if (fullModel) assert.deepEqual(model.items.map(item => [item.itemId, item.sourceKey, item.sortKey]), fullModel.items.map(item => [item.itemId, item.sourceKey, item.sortKey]));
        else { both = data; fullModel = model; }
        console.log(name + " PASS: raw-to-template chain, independent links in all incremental fragments, real rendered hashes");
    }
    assert.equal(normalizeBookInfo({ bookId: "WR_A", readerLink: null }).readerLink, "");
    assert.equal(render.buildTemplateVariables({ title: "A", updatedTime: 20 }, []).wereadReaderLink, "");
    const oldTemplate = "META {{bookID}}|{{wereadDeepLink}}\n{{#chapters}}{{#notes}}NOTE {{highlightText}}{{/notes}}{{/chapters}}";
    const oldModel = modelFor(both, oldTemplate);
    assert.ok(oldModel.items[0].markdown.includes(deepLink));
    const changedTemplate = oldTemplate.replace("META {{bookID}}|{{wereadDeepLink}}", "META " + links);
    const nextModel = modelFor(both, changedTemplate);
    assert.notEqual(oldModel.templateHash, nextModel.templateHash);
    assert.deepEqual(nextModel.items.map(item => item.itemId), oldModel.items.map(item => item.itemId));
    const stored = {};
    const plugin = { loadData: async key => structuredClone(stored[key]), saveData: async (key, value) => { stored[key] = structuredClone(value); } };
    const params = { plugin, docBlockID: "doc", wereadPositionMark: "【微信读书同步笔记】" };
    await sync({ ...params, model: oldModel });
    blocks.push({ id: "user-after", content: "Manual note inside document" });
    const noteBlocks = blocks.filter(block => block.content.startsWith("NOTE"));
    const update = await sync({ ...params, model: nextModel });
    assert.equal(update.stats.rebuilt, false); assert.equal(update.stats.changed, 1); assert.equal(update.stats.unchanged, 1);
    assert.equal(update.sourceIndex.templateHash, nextModel.templateHash);
    assert.deepEqual(blocks.filter(block => block.id.startsWith("user-")), [{ id: "user-before", content: "Manual notes" }, { id: "user-after", content: "Manual note inside document" }]);
    assert.deepEqual(blocks.filter(block => block.content.startsWith("NOTE")), noteBlocks);
    assert.ok(blocks.some(block => block.content.includes(readerLink))); assert.ok(blocks.some(block => block.id === "mark"));
    const unchanged = await sync({ ...params, model: nextModel });
    assert.equal(unchanged.stats.blockOperationCount, 0); assert.equal(unchanged.stats.rebuilt, false);
    assert.equal(stored.weread_note_unit_block_index_v1.schemaVersion, 1);
    console.log("E/F PASS: old deepLink template retained; templateHash update patches only changed managed item, manual notes/marker/unchanged note IDs preserved, repeat has zero block operations");
    const mpVars = load("src/utils/weread/mpArticleSync.ts").buildMpAccountTemplateVariables("MP_WXS_A", { accountTitle: "Account", accountIntro: "Intro", accountCover: "" }, [], 20);
    assert.equal(Object.hasOwn(mpVars, "wereadReaderLink"), false); assert.equal(Object.hasOwn(mpVars, "wereadDeepLink"), false);
    const { buildWereadMpRenderModel } = load("src/utils/weread/incremental/buildMpRenderModel.ts");
    const mp = buildWereadMpRenderModel({ template: "{{accountTitle}}\n{{#articlesAsc}}{{articleTitle}}\n{{#notes}}{{highlightText}} {{highlightComment}}{{/notes}}{{/articlesAsc}}", bookID: "MP_WXS_A", title: "Account", syncData: {
        rawBookID: "MP_WXS_A", accountInfo: { accountTitle: "Account", accountIntro: "Intro", accountCover: "", updateTime: 20 }, articleCount: 1, noteCount: 1,
        articleUnits: [{ rawBookID: "MP_WXS_A", articleID: "article-1", syncID: "mp:MP_WXS_A:article-1", articleTitle: "Article", articleCover: "", articleCreateTime: 10, updatedTime: 20,
            notes: [{ noteType: "highlight", range: "1-2", rangeStart: 1, highlightText: "MP highlight", highlightCreateTime: 10, createTime: 10, highlightComment: "MP comment", comments: [{ content: "MP comment", createTime: 20 }], latestCommentCreateTime: 20 }],
        }],
    } });
    assert.equal(mp.items[0].markdown.trim(), "Account");
    assert.equal(mp.items[1].markdown.trim(), "Article");
    assert.equal(mp.items[2].markdown.trim(), "MP highlight MP comment");
    assert.ok(mp.items.every(item => item.sourceKey === "mp:MP_WXS_A"));
    console.log("G MP PASS: existing account rendering works; no reader/deep link capability added");
    const gateway = load("src/utils/weread/api/wereadApiGateway.ts");
    await gateway.callWereadApi("fixture-key", "/book/info", { bookId: "WR_A" });
    assert.deepEqual(requests[0], { api_name: "/book/info", skill_version: "1.0.5", bookId: "WR_A" });
    proxyResponse = { upgrade_info: { message: "Fixture upgrade" } };
    await assert.rejects(gateway.callWereadApi("fixture-key", "/book/info", { bookId: "WR_A" }), gateway.WereadApiUpgradeError);
    proxyResponse = { errcode: -2013 };
    await assert.rejects(gateway.callWereadApi("fixture-key", "/book/info", { bookId: "WR_A" }), gateway.WereadApiAuthError);
    console.log("Protocol PASS: v1.0.5, flat business params, Bearer auth, upgrade/auth failures retained");
    console.log("WeRead readerLink smoke ALL PASS (mocked host/network; no live account verification)");
})().catch(error => { console.error(error); process.exitCode = 1; });
