import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql } from "@/api";
import { getBookComments, getBookHighlights, getBookBestHighlights, getBookChapterInfos, getNotebooks, getBook } from "@/utils/weread/wereadInterface";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { loadAVData } from "@/utils/bookHandling/index";
import { addUseBookIDsToDatabase } from "@/utils/weread/addUseBookIDs";
import WereadNewBooks from "@/components/common/wereadNewBooksDialog.svelte";
import PromiseLimitPool from "@/libs/promise-pool";
import { updateEndBlocks } from "./updateWereadBlocks";
import { saveIgnoredBooks, saveCustomBooksISBN, saveUseBookIDBooks } from "./wereadSyncStorage";
import { logError } from "../core/logger";
import { getImage, downloadCover } from "@/utils/core/getImg";
import type { WereadPluginLike, WereadBookDetail, SyncNotebookRecord, EnhancedSyncNotebookRecord, WereadSourceType } from "./types";
import type { MpAccountTemplateVars } from "./mpArticleSync";
import { buildMpArticleSyncUnits, isWereadMpAccountSource, buildMpAccountTemplateVariables, resolveMpAccountCover } from "./mpArticleSync";
import { ensureMpAccountInDatabase } from "./addWereadMpAccounts";
import { renderCommentsWithIndent, renderNoteConditionalSections, renderSimpleConditionalSections, formatWereadTimestamp } from "./wereadTemplateRender";

// 注意：不再提供默认模板，模板未设置时由上层同步校验拦截

// 扩展 WereadBookDetail 以兼容公众号账号运行时可能存在的额外字段
type WereadBookDetailWithMpMeta = WereadBookDetail & {
    type?: number;
    coverBoxInfo?: { mp_avatar?: string };
};

// 从 Weread 接口构建标准化的 temporary_weread_notebooksList
// 供 Weread 页预加载、启动自动同步预热、缓存重建三处复用
export async function buildTemporaryNotebookList(
    plugin: WereadPluginLike,
    cookies: string,
    bookCache?: Map<string, Promise<WereadBookDetail>>
): Promise<any[]> {
    const notebookdata = await getNotebooks(plugin, cookies);
    const basicBooks = notebookdata.books || [];

    // 使用并发池限制批量请求（并发数：5）
    const pool = new PromiseLimitPool<any>(5);

    // 缓存读取包装函数
    const getBookCached = (bookId: string) => {
        if (bookCache?.has(bookId)) {
            return bookCache.get(bookId)!;
        }
        const promise = getBook(plugin, cookies, bookId);
        bookCache?.set(bookId, promise);
        return promise;
    };

    for (const b of basicBooks) {
        pool.add(async () => {
            try {
                const details = await getBookCached(b.bookId);
                const detailsWithMpMeta = details as WereadBookDetailWithMpMeta;

                // 判断来源类型（只传需要的 type 字段）
                // 注意：sourceType 属于本地同步缓存语义，用于区分普通书和公众号账号
                // 数据库层不再要求持久化 sourceType，公众号账号行只靠 bookID 识别
                const isMpAccount = isWereadMpAccountSource(details.bookId, { type: detailsWithMpMeta.type });
                const sourceType: WereadSourceType = isMpAccount ? "weread_mp_account" : "weread_book";

                // 公众号账号封面回退逻辑
                let cover = details.cover || "";
                if (isMpAccount && (!cover || cover.includes("/t8_0.jpg"))) {
                    const mpAvatar = detailsWithMpMeta.coverBoxInfo?.mp_avatar;
                    if (mpAvatar) {
                        cover = mpAvatar;
                    }
                }

                return {
                    sourceType,
                    noteCount: b.noteCount ?? 0,
                    reviewCount: b.reviewCount ?? 0,
                    updatedTime: b.sort ?? 0,
                    bookID: details.bookId,
                    title: details.title,
                    author: details.author ?? "",
                    cover,
                    format: details.format ?? "",
                    price: details.price ?? 0,
                    introduction: details.intro ?? "",
                    publishTime: details.publishTime ?? "",
                    category: details.category ?? "",
                    isbn: details.isbn ?? "",
                    publisher: details.publisher ?? "",
                    totalWords: details.totalWords ?? 0,
                    star: details.newRating ?? 0,
                    ratingCount: details.ratingCount ?? 0,
                    AISummary: details.AISummary ?? "",
                };
            } catch {
                // 单本获取失败不影响其他书
                return null;
            }
        });
    }

    const notebooksList = (await pool.awaitAll()).filter((item) => item !== null);
    return notebooksList;
}

type NoteCommentItem = {
    content: string;
    commentCreateTime1?: string;
    commentCreateTime2?: string;
    commentCreateTime3?: string;
    commentCreateTime4?: string;
    commentCreateTime5?: string;
    commentCreateTime6?: string;
    commentCreateTime7?: string;
    commentCreateTime8?: string;
    commentCreateTime9?: string;
    commentCreateTime10?: string;
};

type NoteContent = {
    formattedNote: string;
    highlightText?: string;      // 划线文本（层级章节模板兼容）
    highlightComment?: string;   // 划线评论/想法（层级章节模板兼容）
    // 旧字段保持兼容（默认对应划线时间）
    createTime1?: string;
    createTime2?: string;
    createTime3?: string;
    createTime4?: string;
    createTime5?: string;
    createTime6?: string;
    createTime7?: string;
    createTime8?: string;
    createTime9?: string;
    createTime10?: string;
    // 新增：划线创建时间（独立字段）
    highlightCreateTime1?: string;
    highlightCreateTime2?: string;
    highlightCreateTime3?: string;
    highlightCreateTime4?: string;
    highlightCreateTime5?: string;
    highlightCreateTime6?: string;
    highlightCreateTime7?: string;
    highlightCreateTime8?: string;
    highlightCreateTime9?: string;
    highlightCreateTime10?: string;
    // 新增：评论创建时间（独立字段）
    commentCreateTime1?: string;
    commentCreateTime2?: string;
    commentCreateTime3?: string;
    commentCreateTime4?: string;
    commentCreateTime5?: string;
    commentCreateTime6?: string;
    commentCreateTime7?: string;
    commentCreateTime8?: string;
    commentCreateTime9?: string;
    commentCreateTime10?: string;
    _order?: number;
    comments?: NoteCommentItem[];
};

// 时间格式化函数已从 wereadTemplateRender.ts 导入 formatWereadTimestamp
// 为兼容现有调用，保留 formatTimestamp 作为别名
const formatTimestamp = formatWereadTimestamp;

// ========== 固定四级路径章节结构（新方案） ==========

/** 扁平化章节项（单一章节模板模式） */
type FlatChapterItem = {
    chapterUid?: number;
    chapterTitle1: string;
    chapterTitle2: string;
    chapterTitle3: string;
    chapterTitle4: string;
    notes: NoteContent[];
    chapterComments: { content: string; createTime1: string; createTime2: string; createTime3: string; createTime4: string; createTime5: string; createTime6: string; createTime7: string; createTime8: string; createTime9: string; createTime10: string }[];
};



type TemplateVariables = {
    notebookTitle: string;
    isbn: string;
    updateTime: string;
    updateTime1: string;
    updateTime2: string;
    updateTime3: string;
    updateTime4: string;
    updateTime5: string;
    updateTime6: string;
    updateTime7: string;
    updateTime8: string;
    updateTime9: string;
    updateTime10: string;
    chapters: FlatChapterItem[];  // 扁平化章节项数组
    globalComments: { content: string; createTime1: string; createTime2: string; createTime3: string; createTime4: string; createTime5: string; createTime6: string; createTime7: string; createTime8: string; createTime9: string; createTime10: string }[];
    bookInfo: string;
    AISummary: string;
    bestHighlights: string[];
};

// 笔记本列表来源模式
// - "ui-cache-only": 仅从本地缓存读取，不远程重建（WeRead 界面手动同步专用）
// - "allow-rebuild": 缓存无效时允许远程重建（自动同步等后台场景）
type NotebookSourceMode = "ui-cache-only" | "allow-rebuild";

export async function syncWereadNotes(plugin: WereadPluginLike, cookies: string, isupdate: boolean, bookCache?: Map<string, Promise<WereadBookDetail>>, notebookSourceMode: NotebookSourceMode = "allow-rebuild", preloadedNotebooks?: SyncNotebookRecord[]) {
    // 使用传入的缓存或创建新的局部缓存
    const effectiveBookCache = bookCache ?? new Map<string, Promise<WereadBookDetail>>();
    // 缓存读取包装函数
    const getBookCached = (bookId: string) => {
        if (effectiveBookCache.has(bookId)) {
            return effectiveBookCache.get(bookId)!;
        }
        const promise = getBook(plugin, cookies, bookId);
        effectiveBookCache.set(bookId, promise);
        return promise;
    };

    const oldNotebooks: SyncNotebookRecord[] = await plugin.loadData("weread_notebooks") || []; // 获取上一次的同步数据

    // 若选择的是更新同步并且之前没有同步过则要求进行一次完整同步
    if (oldNotebooks.length === 0 && isupdate) {
        showMessage(plugin.i18n.showMessage26);
        return;
    }

    // 优先使用传入的预加载缓存快照（手动 UI 同步场景），否则从本地缓存或远程获取
    let cloudNotebooksList: SyncNotebookRecord[];
    const hasPreloadedSnapshot = preloadedNotebooks !== undefined;
    if (hasPreloadedSnapshot) {
        // 手动 UI 同步：标准化前端传入的快照，确保与 getPersonalNotebooks() 输出语义一致
        cloudNotebooksList = await normalizeNotebookList(plugin, preloadedNotebooks);
    } else {
        // 自动同步或 fallback：从本地缓存或远程获取
        cloudNotebooksList = await getPersonalNotebooks(plugin, notebookSourceMode);
    }

    // ui-cache-only 模式下，如果没有传入预加载快照且本地缓存为空，直接中止同步并提示用户
    if (notebookSourceMode === "ui-cache-only" && !hasPreloadedSnapshot && cloudNotebooksList.length === 0) {
        showMessage(plugin.i18n.showMessageWereadCacheNotReady);
        return;
    }

    // 获取插件配置并提取数据库ID
    const avID = (await sql(`SELECT * FROM blocks WHERE id = "${(await plugin.loadData("settings.json"))?.bookDatabaseID || ""}"`))[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || ""; // 加载配置、查询数据库、提取avID

    // 获取原始数据库完整信息
    let getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID }); // 获取数据库详细内容
    const database = getdatabase.data.av || {}; // 数据库内容
    const ISBNKey = database.keyValues.find((item: any) => item.key.name === "ISBN"); // 获取ISBN列属性
    let ISBNColumn = ISBNKey?.values || []; // 获取ISBN列所有行内容
    const bookIDKey = database.keyValues.find((item: any) => item.key.name === "bookID"); // 获取bookID列属性
    let bookIDColumn = bookIDKey?.values || []; // 获取bookID列所有行内容

    // 处理异常情况
    // 当用户直接删除读书笔记文档，数据库视图会同步删除，但是本地数据库文件中还保留了除书名以外的其他列内容
    const bookNameKey = database.keyValues.find((item: any) => item.key.name === "书名");
    const bookNameColumn = bookNameKey?.values || [];
    // 对比bookNameColumn与ISBNColumn，若他俩存在不同的，则将不同的blockID用removeAttributeViewBlocks方法清理
    const bookNameBlockIDs = new Set<string>(bookNameColumn.map((item: any) => item.blockID));
    const isbnBlockIDs = new Set<string>(ISBNColumn.map((item: any) => item.blockID));
    const bookIDBlockIDs = new Set<string>(bookIDColumn.map((item: any) => item.blockID));
    // 找出在ISBN列或bookID列中但不在书名列中的blockID（即orphan block）
    const blockIDsToRemove = Array.from(
        new Set<string>([
            ...[...isbnBlockIDs].filter(id => !bookNameBlockIDs.has(id)),
            ...[...bookIDBlockIDs].filter(id => !bookNameBlockIDs.has(id)),
        ])
    );
    // 维护当前数据库快照，初始为原始数据
    let currentDatabaseData = database;

    // 如果有需要清理的blockID，则调用removeAttributeViewBlocks方法
    if (blockIDsToRemove.length > 0) {
        await fetchSyncPost('/api/av/removeAttributeViewBlocks', { "avID": avID, "srcIDs": blockIDsToRemove });
        // 如果有清理操作，则重新获取数据库的最新数据
        const updatedDatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
        currentDatabaseData = updatedDatabase.data.av || {};
        const updatedISBNKey = currentDatabaseData.keyValues.find((item: any) => item.key.name === "ISBN");
        ISBNColumn = updatedISBNKey?.values || [];
        const updatedBookIDKey = currentDatabaseData.keyValues.find((item: any) => item.key.name === "bookID");
        bookIDColumn = updatedBookIDKey?.values || [];
        const updatedBookNameKey = currentDatabaseData.keyValues.find((item: any) => item.key.name === "书名");
        const updatedBookNameColumn = updatedBookNameKey?.values || [];
        // 用清理后的书名列重新覆盖（确保后续逻辑用最终一致的数据）
        bookNameColumn.length = 0;
        bookNameColumn.push(...updatedBookNameColumn);
    }

    // 获取使用bookID同步的书籍列表
    const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || []; // 加载使用bookID同步的书籍列表
    // 处理旧格式（对象数组）和新格式（字符串数组）
    const useBookIDSet = new Set(useBookIDBooks.map((item: any) => {
        if (typeof item === 'string') {
            return item;
        } else if (item && item.bookID) {
            return item.bookID.toString();
        }
        return null;
    }).filter(Boolean));

    // 构建当前数据库中有效的 bookID 集合（基于清理后的 bookIDColumn）
    const validBookIDsInDB = new Set(
        bookIDColumn.map((item: any) => item.text?.content?.toString()).filter(Boolean) || []
    );

    // 构建当前数据库中有效的 ISBN 集合（基于清理后的 ISBNColumn）
    const validISBNsInDB = new Set(
        ISBNColumn.map((item: any) => item.number?.content?.toString()).filter(Boolean) || []
    );

    // 从本地同步记录中构建已保存的公众号账号 ID 集合
    // 注意：这只是本地来源记录（sourceType 属于本地缓存语义），不代表"已处理"状态
    // "已处理"判断还需结合 isMpAccountInDatabase() 检查数据库账号行是否仍存在
    // 数据库层公众号账号行只靠 bookID 识别，不再依赖 sourceType/syncID/rawBookID
    const savedMpAccountIDs = new Set(
        oldNotebooks
            .filter((n: any) => n.sourceType === "weread_mp_account")
            .map((n: any) => n.bookID?.toString())
            .filter(Boolean)
    );

    // 构建已忽略的公众号账号 ID 集合（用于新公众号判断）
    const ignoredMpAccountIDs = new Set(
        (await plugin.loadData("weread_ignoredBooks") || [])
            .filter((b: any) => b.sourceType === "weread_mp_account")
            .map((b: any) => b.bookID?.toString())
            .filter(Boolean)
    );

    // 辅助函数：检查数据库中公众号账号行是否仍有效存在
    // 只基于当前数据库 bookID 列判断，不再依赖 sourceType/syncID/rawBookID
    // 公众号来源身份由来源数据/本地缓存中的 sourceType 判定
    // 注意：参数名 rawBookID 即 bookID，是数据库层唯一识别键
    const isMpAccountInDatabase = (rawBookID: string): boolean => {
        const keyValues = currentDatabaseData.keyValues || [];
        const bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");

        // 只检查 bookID 列中是否存在该公众号的 bookID（rawBookID 即 bookID）
        if (bookIDKey?.values) {
            return bookIDKey.values.some(
                (v: any) => v.text?.content === rawBookID
            );
        }

        return false;
    };

    // 辅助函数：判断某本书/公众号是否"本地已处理"应在新来源确认中隐藏
    // 原则：只有当来源同时存在于本地配置 AND 当前数据库有效记录中，才视为"本地已处理"
    // 公众号：本地来源记录存在 + 数据库账号行仍存在 + 未被忽略
    // 普通书：本地配置存在 + 数据库记录仍存在
    const isBookLocallyProcessed = (item: any): boolean => {
        const bookID = item.bookID?.toString();
        const isbn = item.isbn?.toString();
        const isMpAccount = item.sourceType === "weread_mp_account" || isWereadMpAccountSource(bookID, undefined);

        // 公众号账号来源：必须同时满足：本地记录存在、数据库账号行仍存在、未被忽略
        // 若数据库账号行被用户删除，则应重新视为"新来源"，重新进入确认弹窗
        if (isMpAccount) {
            return savedMpAccountIDs.has(bookID) && isMpAccountInDatabase(bookID) && !ignoredMpAccountIDs.has(bookID);
        }

        // 普通书 - useBookID 路径：只有 bookID 同时在 useBookIDSet 配置中 AND 仍存在于当前数据库 validBookIDsInDB 中，才隐藏
        if (bookID && useBookIDSet.has(bookID) && validBookIDsInDB.has(bookID)) {
            return true;
        }

        // 普通书 - 自定义 ISBN 路径：只有 ISBN 同时在配置中存在 AND 仍存在于当前数据库 validISBNsInDB 中，才隐藏
        if (isbn && validISBNsInDB.has(isbn)) {
            return true;
        }

        return false;
    };

    // 筛选出云端有但本地没有的书籍/公众号
    const cloudNewBooks = cloudNotebooksList.filter((item: any) => {
        // 如果"本地已处理"（配置中有且数据库中也有），则不在新来源窗口中显示
        if (isBookLocallyProcessed(item)) {
            return false;
        }

        const isMpAccount = item.sourceType === "weread_mp_account" || isWereadMpAccountSource(item.bookID, undefined);

        // 公众号账号来源：已通过 isBookLocallyProcessed 判断，此处直接显示
        if (isMpAccount) {
            return true;
        }

        // 普通书：检查是否已经在数据库中（通过ISBN）
        return !ISBNColumn.some((isbnItem: any) => isbnItem.number?.content?.toString() === item.isbn);
    });

    // const cloudNewBooks = cloudNotebooksList.filter((item: any) => !ISBNColumn.some((isbnItem: any) => isbnItem.number?.content?.toString() === item.isbn)); // 筛选出云端有但本地没有的书籍

    // 若有新增书籍，则显示新增书籍弹窗
    if (cloudNewBooks.length > 0) {
        const dialog = svelteDialog({
            title: plugin.i18n.newBooksConfirm,
            constructor: (containerEl: HTMLElement) => {
                // 创建cloudNewBooks的深拷贝，避免引用传递问题
                const booksForDialog = cloudNewBooks.map(book => ({
                    ...book,
                    // 确保创建新对象，避免引用传递
                }));

                return new WereadNewBooks({
                    target: containerEl,
                    props: {
                        i18n: plugin.i18n,
                        books: booksForDialog, // 使用深拷贝的对象
                        // 新增书籍弹窗确认按钮点击事件处理
                        onConfirm: async (selectedBooks, ignoredBooks, useBookIDs) => {
                            try {
                                // 防御性兜底：没有有效选择时不执行确认流程
                                if (selectedBooks.length === 0 && (!useBookIDs || useBookIDs.length === 0)) {
                                    return;
                                }

                                // 分流普通书和公众号账号
                                const selectedNormalBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account");
                                const selectedMpAccounts = selectedBooks.filter(b => b.sourceType === "weread_mp_account");
                                const ignoredNormalBooks = ignoredBooks.filter(b => b.sourceType !== "weread_mp_account");
                                const ignoredMpAccounts = ignoredBooks.filter(b => b.sourceType === "weread_mp_account");

                                await saveCustomBooksISBN(plugin, selectedNormalBooks, cloudNotebooksList); // 保存自定义书籍ISBN（仅普通书）
                                await saveIgnoredBooks(plugin, [...ignoredNormalBooks, ...ignoredMpAccounts]); // 保存忽略书籍（两者都保存）

                                let importBooksNumber = 0;

                                // 保存使用bookID同步的书籍信息并将使用bookID同步的书籍添加到书籍数据库中
                                if (useBookIDs && useBookIDs.length > 0) {
                                    await saveUseBookIDBooks(plugin, useBookIDs); // 保存使用bookID同步的书籍列表

                                    // 通过bookID逐个获取所有书籍的详细信息并导入数据库
                                    for (const bookItem of useBookIDs) {
                                        try {
                                            const bookDetail = await getBookCached(bookItem.bookID);
                                            await addUseBookIDsToDatabase(plugin, avID, bookDetail);
                                            importBooksNumber++; // 成功导入书籍数量增加
                                        } catch (error) {
                                            logError("weread/syncWereadNotes", `获取书籍 ${bookItem.bookID} 详细信息失败`, error);
                                        }
                                    }
                                }

                                // 若有选择的新导入书籍（仅普通书），则进行数据库书籍的导入
                                if (selectedNormalBooks.length > 0) {
                                    showMessage(plugin.i18n.showMessage27); // "⏳ 正在导入选中书籍..."
                                    const settingConfig = await plugin.loadData("settings.json"); // 加载插件通用配置
                                    const noteTemplate = settingConfig?.noteTemplate || ""; // 获取笔记模板
                                    // 遍历选中的书籍，导入到思源数据库
                                    for (const book of selectedNormalBooks) {
                                        try {
                                            const html = await fetchBookHtml(book.isbn);
                                            const bookInfo = await fetchDoubanBook(html);

                                            await loadAVData(avID, {
                                                ...bookInfo,
                                                ISBN: book.isbn,
                                                addNotes: true,
                                                databaseBlockId: (await plugin.loadData("settings.json"))?.bookDatabaseID || "",
                                                noteTemplate: noteTemplate,
                                                myRating: "",
                                                bookCategory: "",
                                                readingStatus: "",
                                                startDate: "",
                                                finishDate: ""
                                            }, plugin);

                                            showMessage(`${plugin.i18n.showMessage28}《${book.title}》`); // "✅ 成功导入"

                                            fetchPost("/api/ui/reloadAttributeView", { id: avID }); // 刷新数据库视图

                                            importBooksNumber++; // 成功导入书籍数量增加
                                        } catch (error) {
                                            logError("weread/syncWereadNotes", `导入书籍 ${book.title} 失败`, error);
                                            showMessage(`${plugin.i18n.showMessage40}《${book.title}》`); // "❌ 导入失败："
                                        }
                                    }
                                }

                                // 只有实际导入书籍数大于0时才显示导入成功提示
                                if (importBooksNumber > 0) {
                                    showMessage(`${plugin.i18n.showMessage28} ${importBooksNumber} ${plugin.i18n.showMessage29}`); // "✅ 成功导入 ${importBooksNumber} 本书籍"
                                }

                                // 若有新增书籍或使用bookID同步的书籍，则更新ISBNColumn和bookIDColumn
                                if (selectedNormalBooks.length > 0 || useBookIDs.length > 0) {
                                    getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID }); // 获取数据库最新数据
                                    const isbnKey = getdatabase.data.av.keyValues.find((item: any) => item.key.name === "ISBN");
                                    const bookIDKey = getdatabase.data.av.keyValues.find((item: any) => item.key.name === "bookID");
                                    ISBNColumn = isbnKey?.values || []; // 更新ISBNColumn
                                    bookIDColumn = bookIDKey?.values || []; // 更新bookIDColumn
                                }

                                // 执行同步操作（普通书 + 公众号账号）
                                try {
                                    const syncResult = await syncBooks([...selectedNormalBooks, ...selectedMpAccounts], useBookIDs);
                                    if (syncResult === "failed") {
                                        // 同步失败，不关闭弹窗，让用户可以继续操作
                                        return;
                                    }
                                    // success 或 no_work 都正常关闭弹窗
                                    dialog.close();
                                } catch (error) {
                                    logError("weread/syncWereadNotes", "同步失败", error);
                                    showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                    return; // 退出函数，不继续执行后续操作
                                }
                            } catch (error) {
                                logError("weread/syncWereadNotes", "批量导入失败", error);
                                showMessage(plugin.i18n.showMessage31, 3000); // "批量导入失败，请检查控制台日志"
                                // 最外层异常不关闭弹窗，让用户可以继续处理
                                return; // 退出函数，不继续执行后续操作
                            }
                        },
                        // 新增书籍弹窗继续按钮点击事件处理
                        onContinue: async (ignoredBooks) => {
                            try {
                                await saveIgnoredBooks(plugin, ignoredBooks); // 保存忽略书籍

                                // 执行同步操作（只同步本地已保存的来源记录）
                                const syncResult = await syncBooks();
                                if (syncResult === "failed") {
                                    // 同步失败，不关闭弹窗，让用户可以继续操作
                                    return;
                                }
                                // success 或 no_work 都正常关闭弹窗
                                dialog.close();
                            } catch (error) {
                                logError("weread/syncWereadNotes", "同步失败", error);
                                showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                return; // 退出函数，不继续执行后续操作
                            }
                        },
                        // 新增书籍弹窗取消按钮点击事件处理
                        onCancel: () => {
                            dialog.close(); // 关闭新增书籍弹窗
                            return; // 退出函数，不继续执行后续操作
                        },
                    },
                });
            }
        });
    } else {
        // 执行同步操作
        try {
            const syncResult = await syncBooks();
            if (syncResult === "failed") {
                return; // 同步失败，退出函数
            }
            // success 或 no_work 都正常结束
        } catch (error) {
            logError("weread/syncWereadNotes", "同步失败", error);
            showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
            return; // 退出函数，不继续执行后续操作
        }
    }

    // 基于 ISBNColumn 和 bookIDColumn 构建 blockID 查找映射
    function buildBlockMap(ISBNColumn: any[], bookIDColumn: any[]): Map<string, string> {
        const blockMap = new Map<string, string>();
        ISBNColumn.forEach((item: any) => {
            const isbn = item.number?.content?.toString();
            if (isbn) blockMap.set(isbn, item.blockID);
        });
        bookIDColumn.forEach((item: any) => {
            const bookID = item.text?.content?.toString();
            if (bookID) blockMap.set(bookID, item.blockID);
        });
        return blockMap;
    }

    // 为一组书籍附加 blockID（优先 isbn，其次 bookID）
    function attachBlockIDs<T extends { isbn?: string | number; bookID?: string | number }>(
        books: T[],
        blockMap: Map<string, string>
    ): Array<T & { blockID: string | null }> {
        return books.map((book: any) => ({
            ...book,
            blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
        }));
    }

    async function syncBooks(selectedBooksForSync?: any[], useBookIDs?): Promise<"success" | "no_work" | "failed"> {
        // 如果外部未传入预加载快照（自动同步场景），才需要重新获取
        // 注意：手动 UI 同步可能传入空数组，这也视为有效快照，不应重新获取
        if (preloadedNotebooks === undefined) {
            cloudNotebooksList = await getPersonalNotebooks(plugin, notebookSourceMode); // 获取最新的云端笔记本列表，此时包含了最新的自定义ISBN数据和忽略书籍数据
        }
        const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || []; // 获取使用bookID同步的书籍列表
        const ignoredBooks = await plugin.loadData("weread_ignoredBooks") || []; // 获取已忽略的书籍列表

        // 分离公众号账号来源记录和普通书记录
        const mpAccountRecords: SyncNotebookRecord[] = [];
        const normalSelectedBooks: any[] = [];
        if (selectedBooksForSync && selectedBooksForSync.length > 0) {
            for (const book of selectedBooksForSync) {
                if (book.sourceType === "weread_mp_account" || isWereadMpAccountSource(book.bookID, undefined)) {
                    mpAccountRecords.push(book as SyncNotebookRecord);
                } else {
                    normalSelectedBooks.push(book);
                }
            }
        }

        // 获取数据库中的ISBN集合
        const existingIsbnsInDB = new Set(
            ISBNColumn.map((item: any) => item.number?.content?.toString()).filter(Boolean) || []
        );

        // 获取数据库中的bookID集合（用于bookID同步的书籍）
        const existingBookIDsInDB = new Set(
            bookIDColumn.map((item: any) => item.text?.content?.toString()).filter(Boolean) || []
        );

        // 提取云端和数据库同时包含的书籍（用于后续同步）
        // 支持ISBN同步和bookID同步两种方式
        // 注意：公众号账号来源不在这里通过 existingBookIDsInDB 进入，而是按来源记录显式处理
        let awaitSyncBooksList = cloudNotebooksList.filter((item: any) => {
            // 公众号账号来源不在这里进入 awaitSyncBooksList
            if (item.sourceType === "weread_mp_account" || isWereadMpAccountSource(item.bookID, undefined)) {
                return false;
            }
            // 如果有ISBN，优先使用ISBN同步
            if (item.isbn) {
                return existingIsbnsInDB.has(item.isbn?.toString());
            }
            // 如果没有ISBN，使用bookID同步
            return existingBookIDsInDB.has(item.bookID?.toString());
        });

        // 如果有选中的书籍（来自selectedBooks），强制包含这些书籍
        if (normalSelectedBooks.length > 0) {
            const selectedIsbns = new Set(normalSelectedBooks.map(book => book.isbn?.toString()).filter(Boolean));
            const selectedBookIDs = new Set(normalSelectedBooks.map(book => book.bookID?.toString()).filter(Boolean));
            const awaitSyncKeys = new Set(awaitSyncBooksList.map(book => getWereadRecordKey(book)).filter(Boolean));

            const additionalBooks = cloudNotebooksList.filter(item => {
                // 通过ISBN匹配
                if (item.isbn && selectedIsbns.has(item.isbn?.toString())) {
                    return !awaitSyncKeys.has(getWereadRecordKey(item));
                }
                // 通过bookID匹配
                if (item.bookID && selectedBookIDs.has(item.bookID?.toString())) {
                    return !awaitSyncKeys.has(getWereadRecordKey(item));
                }
                return false;
            });
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalBooks];
        }

        // 如果有使用bookID同步的书籍（来自useBookIDs），强制包含这些书籍
        if (useBookIDs && useBookIDs.length > 0) {
            const useBookIDSet = new Set(useBookIDs.map(book => book.bookID?.toString()).filter(Boolean));
            const awaitSyncKeys = new Set(awaitSyncBooksList.map(book => getWereadRecordKey(book)).filter(Boolean));
            const additionalUseBookIDBooks = cloudNotebooksList.filter(item =>
                item.bookID && useBookIDSet.has(item.bookID?.toString()) &&
                !awaitSyncKeys.has(getWereadRecordKey(item))
            );
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalUseBookIDBooks];
        }

        // 处理useBookIDBooks（从本地存储加载的使用bookID同步的书籍列表）
        if (useBookIDBooks && useBookIDBooks.length > 0) {
            const useBookIDBooksSet = new Set(useBookIDBooks.map((item: any) => {
                if (typeof item === 'string') {
                    return item;
                } else if (item && item.bookID) {
                    return item.bookID.toString();
                }
                return null;
            }).filter(Boolean));
            const awaitSyncKeys = new Set(awaitSyncBooksList.map(book => getWereadRecordKey(book)).filter(Boolean));

            const additionalBooks = cloudNotebooksList.filter(item => {
                if (item.bookID && useBookIDBooksSet.has(item.bookID.toString())) {
                    return !awaitSyncKeys.has(getWereadRecordKey(item));
                }
                return false;
            });
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalBooks];
        }

        // 构建已忽略的公众号账号 ID 集合
        const ignoredMpAccountIDs = new Set(
            ignoredBooks
                .filter((b: any) => b.sourceType === "weread_mp_account")
                .map((b: any) => b.bookID?.toString())
                .filter(Boolean)
        );

        // 获取已保存的公众号账号来源（用于默认同步）
        // 使用 helper 确保从当前云端列表获取最新记录，而不是旧记录
        const savedMpAccountRecords = getSavedMpAccountRecords(
            oldNotebooks,
            cloudNotebooksList,
            ignoredMpAccountIDs as Set<string>,
            isMpAccountInDatabase
        );

        // 辅助函数：按 getWereadRecordKey 去重合并记录
        function dedupeWereadRecordsByKey(records: SyncNotebookRecord[]): SyncNotebookRecord[] {
            const seen = new Set<string>();
            return records.filter(r => {
                const key = getWereadRecordKey(r);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        // 合并同步列表：普通书 + 已保存公众号来源 + 本次弹窗手动选中的公众号账号
        const allBooksToSync: SyncNotebookRecord[] = dedupeWereadRecordsByKey([
            ...awaitSyncBooksList,
            ...savedMpAccountRecords,
            ...mpAccountRecords
        ]);

        if (allBooksToSync.length === 0) {
            showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
            return "no_work";
        }

        if (isupdate) {
            // 创建旧书籍映射，统一使用 getWereadRecordKey 作为 key
            const oldNotebooksMap = new Map<string, any>();
            if (oldNotebooks) {
                oldNotebooks.forEach((book: any) => {
                    const key = getWereadRecordKey(book);
                    if (key) {
                        oldNotebooksMap.set(key, book);
                    }
                });
            }

            // 筛选出需要同步的书籍（更新时间有变化或新增的书籍）
            // 普通书和公众号账号统一按本地缓存的 bookID + updatedTime 判断
            // 数据库层只靠 bookID 识别，sourceType 属于本地缓存语义
            let booksNeedSync = allBooksToSync.filter((book: any) => {
                const key = getWereadRecordKey(book);
                const oldBook = key ? oldNotebooksMap.get(key) : undefined;
                // 如果旧记录不存在，或者更新时间不同，则需要同步
                const needSync = !oldBook || oldBook.updatedTime !== book.updatedTime;
                // 公众号账号来源加调试日志，方便排查更新同步问题
                if (book.sourceType === "weread_mp_account") {
                    console.info(`[微信读书] 公众号更新同步检查 | bookID: ${book.bookID}, 当前updatedTime: ${book.updatedTime}, 旧updatedTime: ${oldBook?.updatedTime ?? '无'}, 是否进入同步: ${needSync}`);
                }
                return needSync;
            });

            // 如果有选中的普通书籍，确保它们都被包含在同步列表中（不管oldNotebooks中是否有记录）
            if (normalSelectedBooks.length > 0) {
                const selectedIsbns = new Set(normalSelectedBooks.map(book => book.isbn?.toString()).filter(Boolean));
                const selectedBookIDs = new Set(normalSelectedBooks.map(book => book.bookID?.toString()).filter(Boolean));

                const selectedBooksInCloud = allBooksToSync.filter(item =>
                    (item.isbn && selectedIsbns.has(item.isbn?.toString())) ||
                    (item.bookID && selectedBookIDs.has(item.bookID?.toString()))
                );

                // 合并并去重，确保选中的书籍都在同步列表中
                const needSyncKeys = new Set(booksNeedSync.map(book => getWereadRecordKey(book)));
                const additionalBooks = selectedBooksInCloud.filter(book =>
                    !needSyncKeys.has(getWereadRecordKey(book))
                );

                if (additionalBooks.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalBooks];
                }
            }

            // 如果有选中的公众号账号，确保它们都被包含在同步列表中
            if (mpAccountRecords.length > 0) {
                const needSyncKeys = new Set(booksNeedSync.map(book => getWereadRecordKey(book)));
                const additionalMpAccounts = mpAccountRecords.filter(account =>
                    !needSyncKeys.has(getWereadRecordKey(account))
                );
                if (additionalMpAccounts.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalMpAccounts];
                }
            }

            // 如果有使用bookID同步的书籍，确保它们都被包含在同步列表中
            if (useBookIDs && useBookIDs.length > 0) {
                const useBookIDSet = new Set(useBookIDs.map(book => book.bookID?.toString()).filter(Boolean));
                const useBookIDBooksInCloud = awaitSyncBooksList.filter(item =>
                    item.bookID && useBookIDSet.has(item.bookID?.toString())
                );

                // 合并并去重，统一使用 getWereadRecordKey 作为 key
                const needSyncKeys = new Set(booksNeedSync.map(book => getWereadRecordKey(book)));
                const additionalBooks = useBookIDBooksInCloud.filter(book =>
                    !needSyncKeys.has(getWereadRecordKey(book))
                );

                if (additionalBooks.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalBooks];
                }
            }

            if (booksNeedSync.length === 0) {
                showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
                return "no_work";
            }

            // 获取数据库中的blockID映射（支持ISBN和bookID两种方式）
            const blockMap = buildBlockMap(ISBNColumn, bookIDColumn);

            // 为需要同步的书籍添加blockID
            const booksToSync = attachBlockIDs(booksNeedSync, blockMap);

            // 执行同步
            const syncSuccess = await syncNotesProcess(plugin, cookies, booksToSync, bookCache);

            if (!syncSuccess) {
                // 同步失败，但尝试保存已成功落地的公众号来源记录
                await saveEstablishedMpAccountSources(allBooksToSync, oldNotebooks);
                return "failed";
            }

            // 更新本地存储的同步记录（使用 bookID 去重）
            const updatedNotebooksMap = new Map<string, SyncNotebookRecord>();
            for (const book of allBooksToSync) {
                const key = getWereadRecordKey(book);
                if (key) updatedNotebooksMap.set(key, book);
            }
            // 统一处理 blockID：书籍用 ISBN/bookID 查 blockMap，公众号账号也用 bookID 查 blockMap
            const updatedNotebooks: SyncNotebookRecord[] = Array.from(updatedNotebooksMap.values()).map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return "success"; // 完成更新同步后返回成功
        } else {
            // 获取数据库中的blockID映射（支持ISBN和bookID两种方式）
            const blockMap = buildBlockMap(ISBNColumn, bookIDColumn);

            // 为所有需要同步的书籍添加blockID
            const booksToSync = attachBlockIDs(allBooksToSync, blockMap);

            // 执行同步
            const syncSuccess = await syncNotesProcess(plugin, cookies, booksToSync, bookCache);

            if (!syncSuccess) {
                // 同步失败，但尝试保存已成功落地的公众号来源记录
                await saveEstablishedMpAccountSources(allBooksToSync, oldNotebooks);
                return "failed";
            }

            // 更新本地存储的同步记录（使用 bookID 去重）
            const updatedNotebooksMap = new Map<string, SyncNotebookRecord>();
            for (const book of allBooksToSync) {
                const key = getWereadRecordKey(book);
                if (key) updatedNotebooksMap.set(key, book);
            }
            // 统一处理 blockID：书籍用 ISBN/bookID 查 blockMap，公众号账号也用 bookID 查 blockMap
            const updatedNotebooks: SyncNotebookRecord[] = Array.from(updatedNotebooksMap.values()).map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return "success";
        }
    }

    /**
     * 保存已成功在数据库中落地的公众号来源记录
     * 用于同步失败时补救保存已建立的公众号账号来源
     * 基于账号级数据库行判断：数据库层只靠 bookID 识别
     * sourceType 属于本地同步缓存语义，用于区分普通书和公众号账号
     */
    async function saveEstablishedMpAccountSources(
        allBooksToSync: SyncNotebookRecord[],
        oldNotebooks: any[]
    ): Promise<void> {
        try {
            // 重新读取当前数据库状态，构建 bookID -> blockID 映射
            const avData = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
            const keyValues = avData.data?.av?.keyValues || [];

            const bookIDKey = keyValues.find((item: any) => item.key?.name === "bookID");
            const bookIDColumn = bookIDKey?.values || [];

            // 构建当前数据库中 bookID -> blockID 的映射
            const bookIDToBlockMap = new Map<string, string>();
            for (const item of bookIDColumn) {
                const blockID = item.blockID;
                const bookID = item.text?.content?.toString();
                if (bookID && blockID) {
                    bookIDToBlockMap.set(bookID, blockID);
                }
            }

            // 从本轮同步列表中筛选出已成功落地的公众号账号
            // 判断标准：当前数据库中存在该 bookID
            const establishedMpAccounts = allBooksToSync.filter(book =>
                book.sourceType === "weread_mp_account" &&
                bookIDToBlockMap.has(book.bookID?.toString())
            );

            if (establishedMpAccounts.length === 0) {
                return; // 没有成功落地的公众号账号，无需补救保存
            }

            // 合并旧记录和新建立的公众号来源记录
            const mergedNotebooksMap = new Map<string, SyncNotebookRecord>();

            // 先加入旧记录
            for (const book of oldNotebooks || []) {
                const key = getWereadRecordKey(book);
                if (key) mergedNotebooksMap.set(key, book);
            }

            // 再加入新建立的公众号来源记录（尽量保存当前数据库已存在的 blockID）
            for (const book of establishedMpAccounts) {
                const key = getWereadRecordKey(book);
                if (key) {
                    const blockID = bookIDToBlockMap.get(book.bookID?.toString());
                    mergedNotebooksMap.set(key, {
                        ...book,
                        blockID: blockID || null  // 尽量保存当前数据库已存在的 blockID
                    });
                }
            }

            const mergedNotebooks = Array.from(mergedNotebooksMap.values());
            await plugin.saveData("weread_notebooks", mergedNotebooks);
        } catch (error) {
            // 补救保存失败不影响主流程，只记录日志
            logError("weread/syncWereadNotes", "补救保存公众号来源记录失败", error);
        }
    }
}

const NOTEBOOK_ENHANCE_CONCURRENCY = 3;

// ========== 公众号账号级同步辅助 ==========

/**
 * 获取同步记录的唯一键
 * 统一以 bookID 作为唯一键（书籍和公众号账号都使用 bookID）
 */
function getWereadRecordKey(record: SyncNotebookRecord): string {
    return record.bookID || "";
}

/**
 * 获取已保存的公众号账号来源（用于默认同步）
 * 从 oldNotebooks 中判断哪些公众号账号属于已保存来源，
 * 再从当前云端列表中筛选出这些 bookID 对应的最新记录。
 * 这样更新同步时比较的是最新的 updatedTime，而不是旧记录中的旧值。
 * @param oldNotebooks 旧同步记录（用于判断哪些 bookID 属于已保存来源）
 * @param cloudNotebooksList 当前云端列表（用于获取最新记录）
 * @param ignoredMpAccountIDs 已忽略的公众号账号 ID 集合
 * @param isMpAccountInDatabase 判断公众号账号是否在数据库中的函数
 * @returns 当前最新的、且属于默认同步来源的公众号账号记录列表
 */
function getSavedMpAccountRecords(
    oldNotebooks: SyncNotebookRecord[],
    cloudNotebooksList: SyncNotebookRecord[],
    ignoredMpAccountIDs: Set<string>,
    isMpAccountInDatabase: (bookID: string) => boolean
): SyncNotebookRecord[] {
    // 从 oldNotebooks 中取出哪些公众号账号属于已保存来源的 bookID 集合
    const savedMpAccountBookIDs = new Set(
        (oldNotebooks || [])
            .filter((n: any) => n.sourceType === "weread_mp_account")
            .map((n: any) => n.bookID?.toString())
            .filter((bookID: string) => bookID && isMpAccountInDatabase(bookID) && !ignoredMpAccountIDs.has(bookID))
    );

    // 从当前云端列表中获取这些公众号账号的最新记录
    return cloudNotebooksList.filter((item: any) => {
        const bookID = item.bookID?.toString();
        return bookID && savedMpAccountBookIDs.has(bookID);
    });
}

/**
 * 同步公众号账号（账号级单文档模式）
 * 一个公众号对应一个数据库行 + 一个主文档，文档内包含多篇文章 section
 */
async function syncMpAccountArticles(
    plugin: WereadPluginLike,
    cookies: string,
    avID: string,
    accountRecord: SyncNotebookRecord,
    wereadPositionMark: string,
    mpTemplate: string
): Promise<{ success: boolean; title: string; error?: any }> {
    const rawBookID = accountRecord.bookID;
    // 用于提示/日志的标题，在获取 bookInfo 后解析
    let resolvedAccountTitle = accountRecord.title;

    try {
        // A. 获取账号级原始数据
        const [bookmarkPayload, reviewPayload, bookInfo] = await Promise.all([
            getBookHighlights(plugin, cookies, rawBookID),
            getBookComments(plugin, cookies, rawBookID),
            getBook(plugin, cookies, rawBookID)
        ]);

        // 解析最终账号名（优先使用接口返回的最新名称）
        resolvedAccountTitle = bookInfo.title || accountRecord.title;

        // B. 公众号账号封面本地化（复用普通书封面下载链路）
        // 降级策略：下载失败时，数据库 mAsset 为空数组，模板 accountCover 为空字符串
        // 全链路只认本地资源，绝不把远程 URL 写入数据库 mAsset
        let localAccountCover = "";
        const remoteCoverUrl = resolveMpAccountCover(bookInfo);
        if (remoteCoverUrl) {
            try {
                const coverBase64Data = await getImage(remoteCoverUrl);
                if (coverBase64Data) {
                    // 使用 rawBookID 作为文件名的一部分，确保稳定且唯一
                    localAccountCover = await downloadCover(coverBase64Data as string, `mp-account-${rawBookID}`);
                }
            } catch (coverErr) {
                // 封面下载失败：降级为空字符串，数据库 mAsset 将为空数组
                // 不打断主流程，只记录 warning
                console.warn(`[syncMpAccountArticles] 公众号账号封面下载失败，已降级为空: ${remoteCoverUrl}`, coverErr);
            }
        }

        // C. 先确保公众号账号级数据库行存在（不依赖是否有文章单元）
        // 更新同步时优先复用本地缓存中的 blockID，实现书籍式的"复用现有文档 -> 位置标记后整篇刷新"路径
        const accountInfo = {
            rawBookID,
            accountTitle: resolvedAccountTitle,
            accountIntro: bookInfo.intro || "",
            accountCover: localAccountCover,
            blockID: accountRecord.blockID  // 传入本地缓存的 blockID（如果有），优先复用
        };
        const dbResult = await ensureMpAccountInDatabase(plugin, avID, accountInfo);

        if (!dbResult.blockID) {
            throw new Error(`公众号《${resolvedAccountTitle}》无法获取账号级 blockID`);
        }

        // C. 构建公众号文章同步单元
        const units = buildMpArticleSyncUnits(rawBookID, bookInfo, bookmarkPayload, reviewPayload);

        // D. 构建账号级模板变量并渲染（使用主链路传入的已校验模板）
        // 账号级更新时间回退：优先接口返回时间，其次记录时间
        // 注：bookInfo 实际为 MpBookInfo（含 updateTime），但类型声明为 WereadBookDetail
        const fallbackUpdateTime = (bookInfo as any).updateTime || accountRecord.updatedTime || 0;
        const templateVars = buildMpAccountTemplateVariables(
            rawBookID,
            {
                accountTitle: accountInfo.accountTitle,
                accountIntro: accountInfo.accountIntro,
                accountCover: accountInfo.accountCover
            },
            units,
            fallbackUpdateTime
        );
        const noteContent = renderWereadMpAccountTemplate(mpTemplate, templateVars);

        // E. 更新公众号主文档（整篇刷新）
        await updateEndBlocks(plugin, dbResult.blockID, wereadPositionMark, noteContent);

        showMessage(`✅ 公众号《${resolvedAccountTitle}》同步成功`, 2000);
        return { success: true, title: resolvedAccountTitle };

    } catch (error) {
        logError("weread/syncWereadNotes", `公众号账号《${resolvedAccountTitle}》同步失败`, error);
        showMessage(`❌ 公众号《${resolvedAccountTitle}》同步失败`, 2000);
        return { success: false, title: resolvedAccountTitle, error };
    }
}

// ========== 章节目录层级重建（第二步新增） ==========

/** 章节层级节点 */
interface ChapterHierarchyNode {
    chapterUid: number;
    chapterIdx: number;
    title: string;
    level: number;
    children: ChapterHierarchyNode[];
    parentUid: number | null;
}

/** 章节层级结构 */
interface ChapterHierarchy {
    rootChapters: ChapterHierarchyNode[];
    nodeByUid: Map<number, ChapterHierarchyNode>;
    parentUidByUid: Map<number, number | null>;
}

/**
 * 从平铺目录数据重建章节层级结构
 * 使用栈式算法处理任意层级（当前主要支持 level 1/2）
 */
function buildChapterHierarchy(chapterInfos: { updated?: Array<{ chapterUid: number; chapterIdx: number; title: string; level: number }> } | null): ChapterHierarchy {
    const emptyResult: ChapterHierarchy = {
        rootChapters: [],
        nodeByUid: new Map(),
        parentUidByUid: new Map()
    };

    if (!chapterInfos?.updated || !Array.isArray(chapterInfos.updated) || chapterInfos.updated.length === 0) {
        return emptyResult;
    }

    const rootChapters: ChapterHierarchyNode[] = [];
    const nodeByUid = new Map<number, ChapterHierarchyNode>();
    const parentUidByUid = new Map<number, number | null>();
    
    // 使用栈来追踪当前路径上的节点（按层级）
    // stack[level] = 该层级最后一个遇到的节点
    const stack: (ChapterHierarchyNode | null)[] = [];

    for (const item of chapterInfos.updated) {
        const node: ChapterHierarchyNode = {
            chapterUid: item.chapterUid,
            chapterIdx: item.chapterIdx,
            title: item.title,
            level: item.level,
            children: [],
            parentUid: null
        };

        // 清理栈中比当前层级更深或同级的节点
        // 栈只需要保留到当前 level - 1 的节点
        for (let i = stack.length - 1; i >= item.level; i--) {
            stack[i] = null;
        }

        // 找父节点：栈中 item.level - 1 位置的节点
        const parentLevel = item.level - 1;
        const parentNode = parentLevel >= 0 && parentLevel < stack.length ? stack[parentLevel] : null;

        if (parentNode) {
            // 有父节点，建立父子关系
            node.parentUid = parentNode.chapterUid;
            parentNode.children.push(node);
            parentUidByUid.set(node.chapterUid, parentNode.chapterUid);
        } else {
            // 没有父节点，作为根节点
            rootChapters.push(node);
            parentUidByUid.set(node.chapterUid, null);
        }

        // 将当前节点放入栈的对应位置
        stack[item.level] = node;
        // 清理更深层的位置
        for (let i = item.level + 1; i < stack.length; i++) {
            stack[i] = null;
        }

        nodeByUid.set(node.chapterUid, node);
    }

    return {
        rootChapters,
        nodeByUid,
        parentUidByUid
    };
}

/**
 * 构建多级路径章节数据（主方案）
 * 将层级树转换为 chapters 结构：一级章 + 最多四级标题路径
 */
/**
 * 构建扁平化章节项数组
 * 每个具体章节节点对应一个 FlatChapterItem，包含完整标题路径、直属笔记和章节评论
 */
function buildFlatChapters(
    hierarchy: ChapterHierarchy,
    highlightsByChapter: Map<number, any[]>,
    chapterComments: Map<number, any[]>,
    abstractComments: Map<string, any[]>,
    notesTemplate: string,
    notebookTitle: string
): FlatChapterItem[] {
    const result: FlatChapterItem[] = [];

    function parseRangeStart(range: string | undefined): number {
        if (!range) return Number.MAX_SAFE_INTEGER;
        const start = parseInt(range.split('-')[0], 10);
        return isNaN(start) ? Number.MAX_SAFE_INTEGER : start;
    }

    function buildHighlightedNotes(chapterUid: number, chapterTitle: string, consumedCommentKeys: Set<string>): NoteContent[] {
        const highlights = highlightsByChapter.get(chapterUid) || [];
        return highlights.map(highlight => {
            const key = `${highlight.chapterUid}_${highlight.range}`;
            const linkedComments = abstractComments.get(key) || [];
            const commentText = linkedComments.map((c: any) => c.content).join('\n> 💬 ');

            if (linkedComments.length > 0) {
                consumedCommentKeys.add(key);
            }

            const latestComment = linkedComments.length > 0 ? linkedComments[linkedComments.length - 1] : null;
            const commentTime = latestComment ? latestComment.createTime : 0;

            return {
                formattedNote: formatNote(notesTemplate, { ...highlight, commentText, chapterTitle, latestCommentCreateTime: commentTime }, notebookTitle),
                highlightText: highlight.markText || '',
                highlightComment: commentText,
                _order: parseRangeStart(highlight.range),
                createTime1: formatTimestamp(highlight.createTime, 'createTime1'),
                createTime2: formatTimestamp(highlight.createTime, 'createTime2'),
                createTime3: formatTimestamp(highlight.createTime, 'createTime3'),
                createTime4: formatTimestamp(highlight.createTime, 'createTime4'),
                createTime5: formatTimestamp(highlight.createTime, 'createTime5'),
                createTime6: formatTimestamp(highlight.createTime, 'createTime6'),
                createTime7: formatTimestamp(highlight.createTime, 'createTime7'),
                createTime8: formatTimestamp(highlight.createTime, 'createTime8'),
                createTime9: formatTimestamp(highlight.createTime, 'createTime9'),
                createTime10: formatTimestamp(highlight.createTime, 'createTime10'),
                highlightCreateTime1: formatTimestamp(highlight.createTime, 'highlightCreateTime1'),
                highlightCreateTime2: formatTimestamp(highlight.createTime, 'highlightCreateTime2'),
                highlightCreateTime3: formatTimestamp(highlight.createTime, 'highlightCreateTime3'),
                highlightCreateTime4: formatTimestamp(highlight.createTime, 'highlightCreateTime4'),
                highlightCreateTime5: formatTimestamp(highlight.createTime, 'highlightCreateTime5'),
                highlightCreateTime6: formatTimestamp(highlight.createTime, 'highlightCreateTime6'),
                highlightCreateTime7: formatTimestamp(highlight.createTime, 'highlightCreateTime7'),
                highlightCreateTime8: formatTimestamp(highlight.createTime, 'highlightCreateTime8'),
                highlightCreateTime9: formatTimestamp(highlight.createTime, 'highlightCreateTime9'),
                highlightCreateTime10: formatTimestamp(highlight.createTime, 'highlightCreateTime10'),
                commentCreateTime1: formatTimestamp(commentTime, 'commentCreateTime1'),
                commentCreateTime2: formatTimestamp(commentTime, 'commentCreateTime2'),
                commentCreateTime3: formatTimestamp(commentTime, 'commentCreateTime3'),
                commentCreateTime4: formatTimestamp(commentTime, 'commentCreateTime4'),
                commentCreateTime5: formatTimestamp(commentTime, 'commentCreateTime5'),
                commentCreateTime6: formatTimestamp(commentTime, 'commentCreateTime6'),
                commentCreateTime7: formatTimestamp(commentTime, 'commentCreateTime7'),
                commentCreateTime8: formatTimestamp(commentTime, 'commentCreateTime8'),
                commentCreateTime9: formatTimestamp(commentTime, 'commentCreateTime9'),
                commentCreateTime10: formatTimestamp(commentTime, 'commentCreateTime10'),
                comments: linkedComments.map((c: any) => ({
                    content: c.content || '',
                    commentCreateTime1: formatTimestamp(c.createTime, 'commentCreateTime1'),
                    commentCreateTime2: formatTimestamp(c.createTime, 'commentCreateTime2'),
                    commentCreateTime3: formatTimestamp(c.createTime, 'commentCreateTime3'),
                    commentCreateTime4: formatTimestamp(c.createTime, 'commentCreateTime4'),
                    commentCreateTime5: formatTimestamp(c.createTime, 'commentCreateTime5'),
                    commentCreateTime6: formatTimestamp(c.createTime, 'commentCreateTime6'),
                    commentCreateTime7: formatTimestamp(c.createTime, 'commentCreateTime7'),
                    commentCreateTime8: formatTimestamp(c.createTime, 'commentCreateTime8'),
                    commentCreateTime9: formatTimestamp(c.createTime, 'commentCreateTime9'),
                    commentCreateTime10: formatTimestamp(c.createTime, 'commentCreateTime10'),
                })),
            };
        });
    }

    function buildOrphanCommentNotes(chapterUid: number, chapterTitle: string, consumedCommentKeys: Set<string>): NoteContent[] {
        const orphanNotes: NoteContent[] = [];
        abstractComments.forEach((comments: any[], key: string) => {
            if (consumedCommentKeys.has(key)) return;
            const parts = key.split('_');
            const keyChapterUid = parseInt(parts[0], 10);
            if (keyChapterUid !== chapterUid) return;
            if (comments.length === 0) return;

            const commentText = comments.map((c: any) => c.content).join('\n> 💬 ');
            const latestComment = comments[comments.length - 1];
            const commentTime = latestComment.createTime;
            const abstractText = latestComment.abstract || comments[0].abstract || '';

            const syntheticHighlight = {
                markText: abstractText,
                commentText,
                chapterTitle,
                createTime: 0,
                latestCommentCreateTime: commentTime,
            };

            const rangePart = parts.slice(1).join('_');
            const orderFromKey = parseRangeStart(rangePart);
            const orderFromComment = orderFromKey === Number.MAX_SAFE_INTEGER
                ? parseRangeStart(latestComment.range || comments[0]?.range)
                : orderFromKey;

            orphanNotes.push({
                formattedNote: formatNote(notesTemplate, syntheticHighlight, notebookTitle, commentTime),
                highlightText: abstractText,
                highlightComment: commentText,
                _order: orderFromComment,
                createTime1: formatTimestamp(commentTime, 'createTime1'),
                createTime2: formatTimestamp(commentTime, 'createTime2'),
                createTime3: formatTimestamp(commentTime, 'createTime3'),
                createTime4: formatTimestamp(commentTime, 'createTime4'),
                createTime5: formatTimestamp(commentTime, 'createTime5'),
                createTime6: formatTimestamp(commentTime, 'createTime6'),
                createTime7: formatTimestamp(commentTime, 'createTime7'),
                createTime8: formatTimestamp(commentTime, 'createTime8'),
                createTime9: formatTimestamp(commentTime, 'createTime9'),
                createTime10: formatTimestamp(commentTime, 'createTime10'),
                highlightCreateTime1: '',
                highlightCreateTime2: '',
                highlightCreateTime3: '',
                highlightCreateTime4: '',
                highlightCreateTime5: '',
                highlightCreateTime6: '',
                highlightCreateTime7: '',
                highlightCreateTime8: '',
                highlightCreateTime9: '',
                highlightCreateTime10: '',
                commentCreateTime1: formatTimestamp(commentTime, 'commentCreateTime1'),
                commentCreateTime2: formatTimestamp(commentTime, 'commentCreateTime2'),
                commentCreateTime3: formatTimestamp(commentTime, 'commentCreateTime3'),
                commentCreateTime4: formatTimestamp(commentTime, 'commentCreateTime4'),
                commentCreateTime5: formatTimestamp(commentTime, 'commentCreateTime5'),
                commentCreateTime6: formatTimestamp(commentTime, 'commentCreateTime6'),
                commentCreateTime7: formatTimestamp(commentTime, 'commentCreateTime7'),
                commentCreateTime8: formatTimestamp(commentTime, 'commentCreateTime8'),
                commentCreateTime9: formatTimestamp(commentTime, 'commentCreateTime9'),
                commentCreateTime10: formatTimestamp(commentTime, 'commentCreateTime10'),
                comments: comments.map((c: any) => ({
                    content: c.content || '',
                    commentCreateTime1: formatTimestamp(c.createTime, 'commentCreateTime1'),
                    commentCreateTime2: formatTimestamp(c.createTime, 'commentCreateTime2'),
                    commentCreateTime3: formatTimestamp(c.createTime, 'commentCreateTime3'),
                    commentCreateTime4: formatTimestamp(c.createTime, 'commentCreateTime4'),
                    commentCreateTime5: formatTimestamp(c.createTime, 'commentCreateTime5'),
                    commentCreateTime6: formatTimestamp(c.createTime, 'commentCreateTime6'),
                    commentCreateTime7: formatTimestamp(c.createTime, 'commentCreateTime7'),
                    commentCreateTime8: formatTimestamp(c.createTime, 'commentCreateTime8'),
                    commentCreateTime9: formatTimestamp(c.createTime, 'commentCreateTime9'),
                    commentCreateTime10: formatTimestamp(c.createTime, 'commentCreateTime10'),
                })),
            });
        });
        return orphanNotes;
    }

    function buildNodeNotes(chapterUid: number, chapterTitle: string): NoteContent[] {
        const consumedCommentKeys = new Set<string>();
        const highlightedNotes = buildHighlightedNotes(chapterUid, chapterTitle, consumedCommentKeys);
        const orphanNotes = buildOrphanCommentNotes(chapterUid, chapterTitle, consumedCommentKeys);
        const allNotes = [...highlightedNotes, ...orphanNotes];
        allNotes.sort((a, b) => (a._order ?? Number.MAX_SAFE_INTEGER) - (b._order ?? Number.MAX_SAFE_INTEGER));
        return allNotes;
    }

    // 辅助函数：构建章节评论
    function buildNodeComments(chapterUid: number) {
        const comments = chapterComments.get(chapterUid) || [];
        return comments.map(comment => ({
            content: comment.content || '',
            createTime1: formatTimestamp(comment.createTime, 'createTime1'),
            createTime2: formatTimestamp(comment.createTime, 'createTime2'),
            createTime3: formatTimestamp(comment.createTime, 'createTime3'),
            createTime4: formatTimestamp(comment.createTime, 'createTime4'),
            createTime5: formatTimestamp(comment.createTime, 'createTime5'),
            createTime6: formatTimestamp(comment.createTime, 'createTime6'),
            createTime7: formatTimestamp(comment.createTime, 'createTime7'),
            createTime8: formatTimestamp(comment.createTime, 'createTime8'),
            createTime9: formatTimestamp(comment.createTime, 'createTime9'),
            createTime10: formatTimestamp(comment.createTime, 'createTime10'),
        }));
    }

    // 辅助函数：递归处理章节树，为每个节点生成 FlatChapterItem
    function processNode(
        node: ChapterHierarchyNode,
        path: string[]
    ) {
        const currentPath = [...path, node.title];
        const notes = buildNodeNotes(node.chapterUid, node.title);
        const comments = buildNodeComments(node.chapterUid);

        // 确定各级标题（最多四级，超过的拼接到第四级）
        let title1 = '';
        let title2 = '';
        let title3 = '';
        let title4 = '';

        if (currentPath.length >= 1) title1 = currentPath[0];
        if (currentPath.length >= 2) title2 = currentPath[1];
        if (currentPath.length >= 3) title3 = currentPath[2];
        if (currentPath.length >= 4) {
            // 超过四级：将剩余路径拼接到第四级
            const remaining = currentPath.slice(3);
            title4 = remaining.join(' / ');
        }

        // 只有有内容时才生成章节项
        if (notes.length > 0 || comments.length > 0) {
            result.push({
                chapterUid: node.chapterUid,
                chapterTitle1: title1,
                chapterTitle2: title2,
                chapterTitle3: title3,
                chapterTitle4: title4,
                notes: notes,
                chapterComments: comments,
            });
        }

        // 递归处理子节点
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                processNode(child, currentPath);
            }
        }
    }

    // 处理每个一级章节（根节点）
    for (const rootNode of hierarchy.rootChapters) {
        processNode(rootNode, []);
    }

    return result;
}

// ========== 公众号账号级模板渲染 ==========

/**
 * 渲染公众号账号级模板（账号级单文档模式）
 * @param template 模板字符串
 * @param variables 账号级模板变量
 * 
 * 注意：当前版本不再支持 {{#articles}}，用户必须显式选择：
 * - {{#articlesAsc}}...{{/articlesAsc}}：按文章更新时间升序，旧更新在前
 * - {{#articlesDesc}}...{{/articlesDesc}}：按文章更新时间降序，新更新在前
 */
export function renderWereadMpAccountTemplate(template: string, variables: MpAccountTemplateVars): string {
    const tpl = template?.trim() || "";

    let result = tpl;

    // 处理 {{#articlesAsc}}...{{/articlesAsc}} 循环（升序：旧更新在前）
    result = result.replace(/\{\{#articlesAsc\}\}([\s\S]*?)\{\{\/articlesAsc\}\}/g, (_, articleTpl) => {
        if (!variables.articles || variables.articles.length === 0) return '';
        // 复制数组并按内部排序字段 __sortUpdateTime 升序排序
        const sortedArticles = [...variables.articles].sort((a, b) =>
            (a.__sortUpdateTime || 0) - (b.__sortUpdateTime || 0)
        );
        return sortedArticles.map(article => renderMpAccountArticleTemplate(articleTpl, article)).join('\n');
    });

    // 处理 {{#articlesDesc}}...{{/articlesDesc}} 循环（降序：新更新在前）
    result = result.replace(/\{\{#articlesDesc\}\}([\s\S]*?)\{\{\/articlesDesc\}\}/g, (_, articleTpl) => {
        if (!variables.articles || variables.articles.length === 0) return '';
        // 复制数组并按内部排序字段 __sortUpdateTime 降序排序
        const sortedArticles = [...variables.articles].sort((a, b) =>
            (b.__sortUpdateTime || 0) - (a.__sortUpdateTime || 0)
        );
        return sortedArticles.map(article => renderMpAccountArticleTemplate(articleTpl, article)).join('\n');
    });

    // 处理顶层简单条件 section
    const topLevelConditionalFields = [
        'accountTitle',
        'accountIntro',
        'accountCover',
        'updateTime1', 'updateTime2', 'updateTime3', 'updateTime4', 'updateTime5',
        'updateTime6', 'updateTime7', 'updateTime8', 'updateTime9', 'updateTime10',
        'latestArticleTitle',
        'latestArticleTime1', 'latestArticleTime2', 'latestArticleTime3', 'latestArticleTime4', 'latestArticleTime5',
        'latestArticleTime6', 'latestArticleTime7', 'latestArticleTime8', 'latestArticleTime9', 'latestArticleTime10'
    ];
    result = renderSimpleConditionalSections(result, variables as any, topLevelConditionalFields);

    // 替换顶层变量
    result = result
        .replace(/\{\{accountTitle\}\}/g, variables.accountTitle)
        .replace(/\{\{accountIntro\}\}/g, variables.accountIntro)
        .replace(/\{\{accountCover\}\}/g, variables.accountCover)
        .replace(/\{\{updateTime1\}\}/g, variables.updateTime1 || '')
        .replace(/\{\{updateTime2\}\}/g, variables.updateTime2 || '')
        .replace(/\{\{updateTime3\}\}/g, variables.updateTime3 || '')
        .replace(/\{\{updateTime4\}\}/g, variables.updateTime4 || '')
        .replace(/\{\{updateTime5\}\}/g, variables.updateTime5 || '')
        .replace(/\{\{updateTime6\}\}/g, variables.updateTime6 || '')
        .replace(/\{\{updateTime7\}\}/g, variables.updateTime7 || '')
        .replace(/\{\{updateTime8\}\}/g, variables.updateTime8 || '')
        .replace(/\{\{updateTime9\}\}/g, variables.updateTime9 || '')
        .replace(/\{\{updateTime10\}\}/g, variables.updateTime10 || '')
        .replace(/\{\{articleCount\}\}/g, String(variables.articleCount))
        .replace(/\{\{latestArticleTitle\}\}/g, variables.latestArticleTitle)
        .replace(/\{\{latestArticleTime1\}\}/g, variables.latestArticleTime1 || '')
        .replace(/\{\{latestArticleTime2\}\}/g, variables.latestArticleTime2 || '')
        .replace(/\{\{latestArticleTime3\}\}/g, variables.latestArticleTime3 || '')
        .replace(/\{\{latestArticleTime4\}\}/g, variables.latestArticleTime4 || '')
        .replace(/\{\{latestArticleTime5\}\}/g, variables.latestArticleTime5 || '')
        .replace(/\{\{latestArticleTime6\}\}/g, variables.latestArticleTime6 || '')
        .replace(/\{\{latestArticleTime7\}\}/g, variables.latestArticleTime7 || '')
        .replace(/\{\{latestArticleTime8\}\}/g, variables.latestArticleTime8 || '')
        .replace(/\{\{latestArticleTime9\}\}/g, variables.latestArticleTime9 || '')
        .replace(/\{\{latestArticleTime10\}\}/g, variables.latestArticleTime10 || '');

    // 清理普通书专属 section
    result = result
        .replace(/\{\{#chapters\}\}[\s\S]*?\{\{\/chapters\}\}/g, '')
        .replace(/\{\{#globalComments\}\}[\s\S]*?\{\{\/globalComments\}\}/g, '')
        .replace(/\{\{#bookInfo\}\}[\s\S]*?\{\{\/bookInfo\}\}/g, '')
        .replace(/\{\{#bestHighlights\}\}[\s\S]*?\{\{\/bestHighlights\}\}/g, '');

    return result;
}

/**
 * 渲染账号级文档内的文章片段模板（在 articles 循环内）
 * @param template 文章片段模板
 * @param article 文章级模板变量（中间数据）
 */
function renderMpAccountArticleTemplate(template: string, article: MpAccountTemplateVars['articles'][0]): string {
    let result = template;

    // 处理 {{#notes}}...{{/notes}} 循环
    result = result.replace(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/g, (_, noteTpl) => {
        if (!article.notes || article.notes.length === 0) return '';
        return article.notes.map(note => renderMpAccountNoteTemplate(noteTpl, note)).join('\n');
    });

    // 处理文章层简单条件 section
    const articleConditionalFields = [
        'articleTitle',
        'articleCreateTime1', 'articleCreateTime2', 'articleCreateTime3', 'articleCreateTime4', 'articleCreateTime5',
        'articleCreateTime6', 'articleCreateTime7', 'articleCreateTime8', 'articleCreateTime9', 'articleCreateTime10',
        'updateTime1', 'updateTime2', 'updateTime3', 'updateTime4', 'updateTime5',
        'updateTime6', 'updateTime7', 'updateTime8', 'updateTime9', 'updateTime10'
    ];
    result = renderSimpleConditionalSections(result, article as any, articleConditionalFields);

    // 替换文章级变量
    result = result
        .replace(/\{\{articleTitle\}\}/g, article.articleTitle)
        .replace(/\{\{articleCreateTime1\}\}/g, article.articleCreateTime1 || '')
        .replace(/\{\{articleCreateTime2\}\}/g, article.articleCreateTime2 || '')
        .replace(/\{\{articleCreateTime3\}\}/g, article.articleCreateTime3 || '')
        .replace(/\{\{articleCreateTime4\}\}/g, article.articleCreateTime4 || '')
        .replace(/\{\{articleCreateTime5\}\}/g, article.articleCreateTime5 || '')
        .replace(/\{\{articleCreateTime6\}\}/g, article.articleCreateTime6 || '')
        .replace(/\{\{articleCreateTime7\}\}/g, article.articleCreateTime7 || '')
        .replace(/\{\{articleCreateTime8\}\}/g, article.articleCreateTime8 || '')
        .replace(/\{\{articleCreateTime9\}\}/g, article.articleCreateTime9 || '')
        .replace(/\{\{articleCreateTime10\}\}/g, article.articleCreateTime10 || '')
        .replace(/\{\{updateTime1\}\}/g, article.updateTime1 || '')
        .replace(/\{\{updateTime2\}\}/g, article.updateTime2 || '')
        .replace(/\{\{updateTime3\}\}/g, article.updateTime3 || '')
        .replace(/\{\{updateTime4\}\}/g, article.updateTime4 || '')
        .replace(/\{\{updateTime5\}\}/g, article.updateTime5 || '')
        .replace(/\{\{updateTime6\}\}/g, article.updateTime6 || '')
        .replace(/\{\{updateTime7\}\}/g, article.updateTime7 || '')
        .replace(/\{\{updateTime8\}\}/g, article.updateTime8 || '')
        .replace(/\{\{updateTime9\}\}/g, article.updateTime9 || '')
        .replace(/\{\{updateTime10\}\}/g, article.updateTime10 || '')
        .replace(/\{\{noteCount\}\}/g, String(article.noteCount));

    return result;
}

/**
 * 渲染单条 note 模板（在 notes 循环内）
 * @param template note 级模板片段
 * @param note note 模板变量
 */
function renderMpAccountNoteTemplate(template: string, note: MpAccountTemplateVars['articles'][0]['notes'][0]): string {
    let result = template;

    // 处理 {{#comments}}...{{/comments}} 循环（复用多行缩进逻辑）
    result = result.replace(/\{\{#comments\}\}([\s\S]*?)\{\{\/comments\}\}/g, (_, commentTpl) => {
        return renderCommentsWithIndent(commentTpl, note.comments || []);
    });

    // 复用通用 note 条件 section 处理（处理 highlightText、highlightComment、各种时间字段等）
    result = renderNoteConditionalSections(result, note as any);

    // 替换 note 级变量
    result = result
        .replace(/\{\{highlightText\}\}/g, note.highlightText)
        .replace(/\{\{highlightComment\}\}/g, note.highlightComment)
        .replace(/\{\{createTime1\}\}/g, note.createTime1 || '')
        .replace(/\{\{createTime2\}\}/g, note.createTime2 || '')
        .replace(/\{\{createTime3\}\}/g, note.createTime3 || '')
        .replace(/\{\{createTime4\}\}/g, note.createTime4 || '')
        .replace(/\{\{createTime5\}\}/g, note.createTime5 || '')
        .replace(/\{\{createTime6\}\}/g, note.createTime6 || '')
        .replace(/\{\{createTime7\}\}/g, note.createTime7 || '')
        .replace(/\{\{createTime8\}\}/g, note.createTime8 || '')
        .replace(/\{\{createTime9\}\}/g, note.createTime9 || '')
        .replace(/\{\{createTime10\}\}/g, note.createTime10 || '')
        .replace(/\{\{highlightCreateTime1\}\}/g, note.highlightCreateTime1 || '')
        .replace(/\{\{highlightCreateTime2\}\}/g, note.highlightCreateTime2 || '')
        .replace(/\{\{highlightCreateTime3\}\}/g, note.highlightCreateTime3 || '')
        .replace(/\{\{highlightCreateTime4\}\}/g, note.highlightCreateTime4 || '')
        .replace(/\{\{highlightCreateTime5\}\}/g, note.highlightCreateTime5 || '')
        .replace(/\{\{highlightCreateTime6\}\}/g, note.highlightCreateTime6 || '')
        .replace(/\{\{highlightCreateTime7\}\}/g, note.highlightCreateTime7 || '')
        .replace(/\{\{highlightCreateTime8\}\}/g, note.highlightCreateTime8 || '')
        .replace(/\{\{highlightCreateTime9\}\}/g, note.highlightCreateTime9 || '')
        .replace(/\{\{highlightCreateTime10\}\}/g, note.highlightCreateTime10 || '')
        .replace(/\{\{commentCreateTime1\}\}/g, note.commentCreateTime1 || '')
        .replace(/\{\{commentCreateTime2\}\}/g, note.commentCreateTime2 || '')
        .replace(/\{\{commentCreateTime3\}\}/g, note.commentCreateTime3 || '')
        .replace(/\{\{commentCreateTime4\}\}/g, note.commentCreateTime4 || '')
        .replace(/\{\{commentCreateTime5\}\}/g, note.commentCreateTime5 || '')
        .replace(/\{\{commentCreateTime6\}\}/g, note.commentCreateTime6 || '')
        .replace(/\{\{commentCreateTime7\}\}/g, note.commentCreateTime7 || '')
        .replace(/\{\{commentCreateTime8\}\}/g, note.commentCreateTime8 || '')
        .replace(/\{\{commentCreateTime9\}\}/g, note.commentCreateTime9 || '')
        .replace(/\{\{commentCreateTime10\}\}/g, note.commentCreateTime10 || '');

    return result;
}

// 将划线按章节分组
function groupHighlightsByChapter(highlights: any): Map<number, any[]> {
    const highlightsByChapter = new Map();
    if (highlights?.updated && Array.isArray(highlights.updated)) {
        highlights.updated.forEach(h => {
            const chapterUid = h.chapterUid;
            if (!highlightsByChapter.has(chapterUid)) {
                highlightsByChapter.set(chapterUid, []);
            }
            highlightsByChapter.get(chapterUid).push(h);
        });
    }
    return highlightsByChapter;
}

// 分类评论：正文评论和章节评论
// 规则：优先判断 range，有 range 的是划线评论；没有 range 的是章节评论
function classifyComments(comments: any[]): { 
    abstractComments: Map<string, any[]>; 
    chapterComments: Map<number, any[]>; 
} {
    const abstractComments = new Map();
    const chapterComments = new Map();

    comments.forEach((comment: any) => {
        const review = comment.review;
        // 优先判断 range：有 range 的是划线评论
        if (review.range) {
            const key = `${review.chapterUid}_${review.range}`;
            if (!abstractComments.has(key)) {
                abstractComments.set(key, []);
            }
            abstractComments.get(key).push(review);
        } else if (review.chapterUid) {
            // 没有 range 但有 chapterUid 的是章节评论
            if (!chapterComments.has(review.chapterUid)) {
                chapterComments.set(review.chapterUid, []);
            }
            chapterComments.get(review.chapterUid).push(review);
        }
    });

    // 同一条划线下多条评论按创建时间升序排列（旧在前，新在后）
    abstractComments.forEach((reviews) => {
        reviews.sort((a: any, b: any) => (a.createTime || 0) - (b.createTime || 0));
    });

    return { abstractComments, chapterComments };
}

/**
 * 格式化单条笔记（用于层级章节构建）
 * 简化版：只处理基础模板替换
 */
function formatNote(notesTemplate: string, highlight: any, notebookTitle: string, overrideCreateTime?: number): string {
    const commentTime = highlight.latestCommentCreateTime || 0;
    const mainTime = overrideCreateTime !== undefined ? overrideCreateTime : highlight.createTime;
    return notesTemplate
        .replace(/\{\{highlightText\}\}/g, highlight.markText || '')
        .replace(/\{\{highlightComment\}\}/g, highlight.commentText || '')
        .replace(/\{\{createTime1\}\}/g, formatTimestamp(mainTime, 'createTime1'))
        .replace(/\{\{createTime2\}\}/g, formatTimestamp(mainTime, 'createTime2'))
        .replace(/\{\{createTime3\}\}/g, formatTimestamp(mainTime, 'createTime3'))
        .replace(/\{\{createTime4\}\}/g, formatTimestamp(mainTime, 'createTime4'))
        .replace(/\{\{createTime5\}\}/g, formatTimestamp(mainTime, 'createTime5'))
        .replace(/\{\{createTime6\}\}/g, formatTimestamp(mainTime, 'createTime6'))
        .replace(/\{\{createTime7\}\}/g, formatTimestamp(mainTime, 'createTime7'))
        .replace(/\{\{createTime8\}\}/g, formatTimestamp(mainTime, 'createTime8'))
        .replace(/\{\{createTime9\}\}/g, formatTimestamp(mainTime, 'createTime9'))
        .replace(/\{\{createTime10\}\}/g, formatTimestamp(mainTime, 'createTime10'))
        .replace(/\{\{highlightCreateTime1\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime1'))
        .replace(/\{\{highlightCreateTime2\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime2'))
        .replace(/\{\{highlightCreateTime3\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime3'))
        .replace(/\{\{highlightCreateTime4\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime4'))
        .replace(/\{\{highlightCreateTime5\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime5'))
        .replace(/\{\{highlightCreateTime6\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime6'))
        .replace(/\{\{highlightCreateTime7\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime7'))
        .replace(/\{\{highlightCreateTime8\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime8'))
        .replace(/\{\{highlightCreateTime9\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime9'))
        .replace(/\{\{highlightCreateTime10\}\}/g, formatTimestamp(highlight.createTime, 'highlightCreateTime10'))
        .replace(/\{\{commentCreateTime1\}\}/g, formatTimestamp(commentTime, 'commentCreateTime1'))
        .replace(/\{\{commentCreateTime2\}\}/g, formatTimestamp(commentTime, 'commentCreateTime2'))
        .replace(/\{\{commentCreateTime3\}\}/g, formatTimestamp(commentTime, 'commentCreateTime3'))
        .replace(/\{\{commentCreateTime4\}\}/g, formatTimestamp(commentTime, 'commentCreateTime4'))
        .replace(/\{\{commentCreateTime5\}\}/g, formatTimestamp(commentTime, 'commentCreateTime5'))
        .replace(/\{\{commentCreateTime6\}\}/g, formatTimestamp(commentTime, 'commentCreateTime6'))
        .replace(/\{\{commentCreateTime7\}\}/g, formatTimestamp(commentTime, 'commentCreateTime7'))
        .replace(/\{\{commentCreateTime8\}\}/g, formatTimestamp(commentTime, 'commentCreateTime8'))
        .replace(/\{\{commentCreateTime9\}\}/g, formatTimestamp(commentTime, 'commentCreateTime9'))
        .replace(/\{\{commentCreateTime10\}\}/g, formatTimestamp(commentTime, 'commentCreateTime10'))
        .replace(/\{\{chapterTitle\}\}/g, highlight.chapterTitle || '')
        .replace(/\{\{notebookTitle\}\}/g, notebookTitle);
}

/**
 * 渲染笔记模板，在没有评论时删除包含 {{highlightComment}} 的整行
 * 与旧 chapters 路径的行为保持一致
 */
function renderNoteTemplateWithOptionalComment(
    notesTemplate: string,
    note: {
        highlightText?: string;
        highlightComment?: string;
        createTime1?: string;
        createTime2?: string;
        createTime3?: string;
        createTime4?: string;
        createTime5?: string;
        createTime6?: string;
        createTime7?: string;
        createTime8?: string;
        createTime9?: string;
        createTime10?: string;
        highlightCreateTime1?: string;
        highlightCreateTime2?: string;
        highlightCreateTime3?: string;
        highlightCreateTime4?: string;
        highlightCreateTime5?: string;
        highlightCreateTime6?: string;
        highlightCreateTime7?: string;
        highlightCreateTime8?: string;
        highlightCreateTime9?: string;
        highlightCreateTime10?: string;
        commentCreateTime1?: string;
        commentCreateTime2?: string;
        commentCreateTime3?: string;
        commentCreateTime4?: string;
        commentCreateTime5?: string;
        commentCreateTime6?: string;
        commentCreateTime7?: string;
        commentCreateTime8?: string;
        commentCreateTime9?: string;
        commentCreateTime10?: string;
        comments?: NoteCommentItem[];
    }
): string {
    const hasComment = !!(note.highlightComment && note.highlightComment.trim());
    let template = notesTemplate
        .replace(/\{\{#comments\}\}([\s\S]*?)\{\{\/comments\}\}/g, (_, commentsTpl) => {
            return renderCommentsWithIndent(commentsTpl, note.comments || []);
        });

    // 处理通用条件 section：{{#fieldName}}...{{/fieldName}}
    // 当 note 上 fieldName 有值（非空）时保留内容，无值时删除整段
    template = renderNoteConditionalSections(template, note);

    const lines = template.split('\n');

    const renderedLines = lines
        .map(line => {
            // 如果没有评论，且该行包含 {{highlightComment}}，则删除整行
            if (!hasComment && line.includes('{{highlightComment}}')) {
                return null;
            }
            // 正常替换所有变量
            return line
                .replace(/\{\{highlightText\}\}/g, note.highlightText || '')
                .replace(/\{\{highlightComment\}\}/g, note.highlightComment || '')
                .replace(/\{\{createTime1\}\}/g, note.createTime1 || '')
                .replace(/\{\{createTime2\}\}/g, note.createTime2 || '')
                .replace(/\{\{createTime3\}\}/g, note.createTime3 || '')
                .replace(/\{\{createTime4\}\}/g, note.createTime4 || '')
                .replace(/\{\{createTime5\}\}/g, note.createTime5 || '')
                .replace(/\{\{createTime6\}\}/g, note.createTime6 || '')
                .replace(/\{\{createTime7\}\}/g, note.createTime7 || '')
                .replace(/\{\{createTime8\}\}/g, note.createTime8 || '')
                .replace(/\{\{createTime9\}\}/g, note.createTime9 || '')
                .replace(/\{\{createTime10\}\}/g, note.createTime10 || '')
                .replace(/\{\{highlightCreateTime1\}\}/g, note.highlightCreateTime1 || '')
                .replace(/\{\{highlightCreateTime2\}\}/g, note.highlightCreateTime2 || '')
                .replace(/\{\{highlightCreateTime3\}\}/g, note.highlightCreateTime3 || '')
                .replace(/\{\{highlightCreateTime4\}\}/g, note.highlightCreateTime4 || '')
                .replace(/\{\{highlightCreateTime5\}\}/g, note.highlightCreateTime5 || '')
                .replace(/\{\{highlightCreateTime6\}\}/g, note.highlightCreateTime6 || '')
                .replace(/\{\{highlightCreateTime7\}\}/g, note.highlightCreateTime7 || '')
                .replace(/\{\{highlightCreateTime8\}\}/g, note.highlightCreateTime8 || '')
                .replace(/\{\{highlightCreateTime9\}\}/g, note.highlightCreateTime9 || '')
                .replace(/\{\{highlightCreateTime10\}\}/g, note.highlightCreateTime10 || '')
                .replace(/\{\{commentCreateTime1\}\}/g, note.commentCreateTime1 || '')
                .replace(/\{\{commentCreateTime2\}\}/g, note.commentCreateTime2 || '')
                .replace(/\{\{commentCreateTime3\}\}/g, note.commentCreateTime3 || '')
                .replace(/\{\{commentCreateTime4\}\}/g, note.commentCreateTime4 || '')
                .replace(/\{\{commentCreateTime5\}\}/g, note.commentCreateTime5 || '')
                .replace(/\{\{commentCreateTime6\}\}/g, note.commentCreateTime6 || '')
                .replace(/\{\{commentCreateTime7\}\}/g, note.commentCreateTime7 || '')
                .replace(/\{\{commentCreateTime8\}\}/g, note.commentCreateTime8 || '')
                .replace(/\{\{commentCreateTime9\}\}/g, note.commentCreateTime9 || '')
                .replace(/\{\{commentCreateTime10\}\}/g, note.commentCreateTime10 || '');
        })
        .filter((line): line is string => line !== null && line.trim() !== '');

    return renderedLines.join('\n');
}

/**
 * 生成“显示用章节数组”，对连续祖先标题进行去重
 * 规则：与前一项比较，前缀连续相同的标题置为空字符串
 */
function generateDedupedDisplayChapters(chapters: FlatChapterItem[]): FlatChapterItem[] {
    if (chapters.length === 0) return [];

    const result: FlatChapterItem[] = [];
    let prev: FlatChapterItem | null = null;

    for (const curr of chapters) {
        // 深拷贝当前项，避免修改原始数据
        const displayItem: FlatChapterItem = {
            ...curr,
            chapterComments: [...curr.chapterComments],
            notes: [...curr.notes],
        };

        if (prev) {
            // 规则1：如果 chapterTitle1 相同，置为空
            if (prev.chapterTitle1 === curr.chapterTitle1) {
                displayItem.chapterTitle1 = '';

                // 规则2：如果 chapterTitle1 和 chapterTitle2 都相同，且当前 chapterTitle2 非空
                if (prev.chapterTitle2 === curr.chapterTitle2 && curr.chapterTitle2) {
                    displayItem.chapterTitle2 = '';

                    // 规则3：如果 chapterTitle1/2/3 都相同，且当前 chapterTitle3 非空
                    if (prev.chapterTitle3 === curr.chapterTitle3 && curr.chapterTitle3) {
                        displayItem.chapterTitle3 = '';

                        // 规则4：如果 chapterTitle1/2/3/4 都相同，且当前 chapterTitle4 非空
                        if (prev.chapterTitle4 === curr.chapterTitle4 && curr.chapterTitle4) {
                            displayItem.chapterTitle4 = '';
                        }
                    }
                }
            }
        }

        result.push(displayItem);
        prev = curr; // 注意：prev 指向原始数据，不是 displayItem
    }

    return result;
}

// 渲染微信读书笔记模板（单一扁平 chapters 模式）
function renderWereadTemplate(template: string, variables: TemplateVariables): string {
    return template
        // 扁平化章节渲染
        .replace(/\{\{#chapters\}\}([\s\S]*?)\{\{\/chapters\}\}/g, (_, chapterTpl) => {
            if (!variables.chapters || variables.chapters.length === 0) return '';

            // 生成“显示用章节数组”，对连续祖先标题进行去重
            const displayChapters = generateDedupedDisplayChapters(variables.chapters);

            return displayChapters.map(flatItem => {
                let itemResult = chapterTpl;

                // 1. 渲染 chapterTitle 块（同时处理 1~4 级标题）
                itemResult = itemResult.replace(/\{\{#chapterTitle\}\}([\s\S]*?)\{\{\/chapterTitle\}\}/g, (_, titleTpl) => {
                    let titleResult = titleTpl;
                    if (flatItem.chapterTitle1) titleResult = titleResult.replace(/\{\{chapterTitle1\}\}/g, flatItem.chapterTitle1);
                    if (flatItem.chapterTitle2) titleResult = titleResult.replace(/\{\{chapterTitle2\}\}/g, flatItem.chapterTitle2);
                    if (flatItem.chapterTitle3) titleResult = titleResult.replace(/\{\{chapterTitle3\}\}/g, flatItem.chapterTitle3);
                    if (flatItem.chapterTitle4) titleResult = titleResult.replace(/\{\{chapterTitle4\}\}/g, flatItem.chapterTitle4);
                    // 删除包含未替换的 {{chapterTitleX}} 变量的整行
                    titleResult = titleResult.split('\n').filter(line => !line.match(/\{\{chapterTitle[1-4]\}\}/)).join('\n');
                    return titleResult;
                });

                // 2. 渲染 chapterComments（由模板位置决定前后顺序）
                itemResult = itemResult.replace(/\{\{#chapterComments\}\}([\s\S]*?)\{\{\/chapterComments\}\}/g, (_, commentsTpl) => {
                    if (!flatItem.chapterComments || flatItem.chapterComments.length === 0) return '';
                    return flatItem.chapterComments.map(c => {
                        return commentsTpl
                            .replace(/\{\{chapterComments\}\}/g, c.content)
                            .replace(/\{\{createTime1\}\}/g, c.createTime1)
                            .replace(/\{\{createTime2\}\}/g, c.createTime2)
                            .replace(/\{\{createTime3\}\}/g, c.createTime3)
                            .replace(/\{\{createTime4\}\}/g, c.createTime4)
                            .replace(/\{\{createTime5\}\}/g, c.createTime5)
                            .replace(/\{\{createTime6\}\}/g, c.createTime6)
                            .replace(/\{\{createTime7\}\}/g, c.createTime7)
                            .replace(/\{\{createTime8\}\}/g, c.createTime8)
                            .replace(/\{\{createTime9\}\}/g, c.createTime9)
                            .replace(/\{\{createTime10\}\}/g, c.createTime10);
                    }).join('\n\n');
                });

                // 3. 渲染 notes
                itemResult = itemResult.replace(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/g, (_, notesTpl) => {
                    if (!flatItem.notes || flatItem.notes.length === 0) return '';
                    return flatItem.notes.map(note => {
                        return renderNoteTemplateWithOptionalComment(notesTpl, note);
                    }).join('\n');
                });

                return itemResult;
            }).join('\n');
        })
        .replace(/\{\{#globalComments\}\}([\s\S]*?)\{\{\/globalComments\}\}/g, (_, commentsTpl) => {
            if (!variables.globalComments || variables.globalComments.length === 0) return '';
            const formattedComments = variables.globalComments.map(c => {
                return commentsTpl
                    .replace(/\{\{globalComments\}\}/g, c.content)
                    .replace(/\{\{createTime1\}\}/g, c.createTime1)
                    .replace(/\{\{createTime2\}\}/g, c.createTime2)
                    .replace(/\{\{createTime3\}\}/g, c.createTime3)
                    .replace(/\{\{createTime4\}\}/g, c.createTime4)
                    .replace(/\{\{createTime5\}\}/g, c.createTime5)
                    .replace(/\{\{createTime6\}\}/g, c.createTime6)
                    .replace(/\{\{createTime7\}\}/g, c.createTime7)
                    .replace(/\{\{createTime8\}\}/g, c.createTime8)
                    .replace(/\{\{createTime9\}\}/g, c.createTime9)
                    .replace(/\{\{createTime10\}\}/g, c.createTime10);
            });
            return formattedComments.join('\n\n');
        })
        .replace(/\{\{#bookInfo\}\}([\s\S]*?)\{\{\/bookInfo\}\}/g, (_, section) => {
            return variables.bookInfo ? section.replace(/\{\{bookInfo\}\}/g, variables.bookInfo) : '';
        })
        .replace(/\{\{#AISummary\}\}([\s\S]*?)\{\{\/AISummary\}\}/g, (_, section) => {
            return variables.AISummary ? section.replace(/\{\{AISummary\}\}/g, variables.AISummary) : '';
        })
        .replace(/\{\{#bestHighlights\}\}([\s\S]*?)\{\{\/bestHighlights\}\}/g, (_, section) => {
            return variables.bestHighlights.length > 0
                ? variables.bestHighlights.map(highlight =>
                    section.replace(/\{\{bestHighlight\}\}/g, highlight)
                ).join('\n')
                : '';
        })
        .replace(/\{\{(\w+)\}\}/g, (_, key) => (variables as any)[key] || '');
}

// 构建模板变量
function buildTemplateVariables(
    notebook: any,
    comments: any[],
    chapters: FlatChapterItem[] = []
): TemplateVariables {
    return {
        notebookTitle: notebook.title,
        isbn: notebook.isbn,
        updateTime: new Date(notebook.updatedTime * 1000).toLocaleString(),
        updateTime1: formatTimestamp(notebook.updatedTime, 'createTime1'),
        updateTime2: formatTimestamp(notebook.updatedTime, 'createTime2'),
        updateTime3: formatTimestamp(notebook.updatedTime, 'createTime3'),
        updateTime4: formatTimestamp(notebook.updatedTime, 'createTime4'),
        updateTime5: formatTimestamp(notebook.updatedTime, 'createTime5'),
        updateTime6: formatTimestamp(notebook.updatedTime, 'createTime6'),
        updateTime7: formatTimestamp(notebook.updatedTime, 'createTime7'),
        updateTime8: formatTimestamp(notebook.updatedTime, 'createTime8'),
        updateTime9: formatTimestamp(notebook.updatedTime, 'createTime9'),
        updateTime10: formatTimestamp(notebook.updatedTime, 'createTime10'),
        chapters: chapters,  // 扁平化章节项数组
        globalComments: comments
            .filter(c => !c.review.abstract && !c.review.contextAbstract)
            .map(c => ({
                content: c.review.content,
                createTime1: formatTimestamp(c.review.createTime, 'createTime1'),
                createTime2: formatTimestamp(c.review.createTime, 'createTime2'),
                createTime3: formatTimestamp(c.review.createTime, 'createTime3'),
                createTime4: formatTimestamp(c.review.createTime, 'createTime4'),
                createTime5: formatTimestamp(c.review.createTime, 'createTime5'),
                createTime6: formatTimestamp(c.review.createTime, 'createTime6'),
                createTime7: formatTimestamp(c.review.createTime, 'createTime7'),
                createTime8: formatTimestamp(c.review.createTime, 'createTime8'),
                createTime9: formatTimestamp(c.review.createTime, 'createTime9'),
                createTime10: formatTimestamp(c.review.createTime, 'createTime10')
            })),
        bookInfo: notebook.bookDetails?.intro || '',
        AISummary: notebook.bookDetails?.AISummary || '',
        bestHighlights: notebook.bestHighlights?.bestBookMarks?.items?.map((item: any) => item.markText) || []
    };
}

async function syncNotesProcess(plugin: WereadPluginLike, cookies: string, notebooks: SyncNotebookRecord[], bookCache?: Map<string, Promise<WereadBookDetail>>): Promise<boolean> {
    // 分流：普通书 vs 公众号账号来源
    const normalBooks: SyncNotebookRecord[] = [];
    const mpAccountRecords: SyncNotebookRecord[] = [];

    for (const record of notebooks) {
        if (record.sourceType === "weread_mp_account" || isWereadMpAccountSource(record.bookID, undefined)) {
            mpAccountRecords.push(record);
        } else {
            normalBooks.push(record);
        }
    }

    // 加载两类模板（不再提供默认模板兜底）
    const bookTemplate = (await plugin.loadData("weread_templates") || "").trim();
    const mpTemplate = (await plugin.loadData("weread_mp_templates") || "").trim();

    // 模板缺失校验：按本轮实际来源类型分别判断
    const hasNormalBooks = normalBooks.length > 0;
    const hasMpAccounts = mpAccountRecords.length > 0;

    // 优先处理两个模板都缺失的情况（一次性提示）
    if (hasNormalBooks && hasMpAccounts && !bookTemplate && !mpTemplate) {
        showMessage(plugin.i18n.showMessageBothTemplatesMissing);
        return false;
    }

    if (hasNormalBooks && !bookTemplate) {
        showMessage(plugin.i18n.showMessageBookTemplateMissing);
        return false;
    }

    if (hasMpAccounts && !mpTemplate) {
        showMessage(plugin.i18n.showMessageMpTemplateMissing);
        return false;
    }

    // 校验通过，使用已加载的真实模板
    const effectiveTemplate = bookTemplate;

    // 获取数据库配置
    const setting = await plugin.loadData("settings.json");
    const databaseBlockId = setting?.bookDatabaseID || "";

    // 从数据库 block 中提取真正的 avID
    let avID = "";
    if (databaseBlockId) {
        const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${databaseBlockId}"`);
        avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
    }

    // 本轮同步统一读取一次插入位置配置
    const wereadPositionMark = await plugin.loadData("weread_position_mark");

    // ========== 公众号账号文章同步 ==========
    let mpSyncSuccess = true;
    if (mpAccountRecords.length > 0) {
        if (!avID) {
            showMessage("未找到数据库 ID，无法同步公众号文章");
            mpSyncSuccess = false;
        } else {
            const mpResults: { success: boolean; title: string }[] = [];
            for (const accountRecord of mpAccountRecords) {
                const result = await syncMpAccountArticles(plugin, cookies, avID, accountRecord, wereadPositionMark, mpTemplate);
                mpResults.push(result);
                if (!result.success) {
                    mpSyncSuccess = false;
                }
            }
        }
    }

    // ========== 普通书同步 ==========

    // 使用传入的缓存或创建新的局部缓存
    const effectiveBookCache = bookCache ?? new Map<string, Promise<WereadBookDetail>>();
    const getBookCached = (bookId: string) => {
        if (effectiveBookCache.has(bookId)) {
            return effectiveBookCache.get(bookId)!;
        }
        const promise = getBook(plugin, cookies, bookId);
        effectiveBookCache.set(bookId, promise);
        return promise;
    };

    // 并发获取所有普通书的划线、评论和目录信息，单本失败不阻断整批
    const pool = new PromiseLimitPool<{ success: true; notebook: EnhancedSyncNotebookRecord } | { success: false; title: string; error: any }>(NOTEBOOK_ENHANCE_CONCURRENCY);
    for (const notebook of normalBooks) {
        pool.add(async () => {
            try {
                const enhanced: EnhancedSyncNotebookRecord = {
                    ...notebook,
                    highlights: await getBookHighlights(plugin, cookies, notebook.bookID),
                    comments: await getBookComments(plugin, cookies, notebook.bookID),
                    bookDetails: await getBookCached(notebook.bookID),
                    bestHighlights: await getBookBestHighlights(plugin, cookies, notebook.bookID),
                    chapterInfos: await getBookChapterInfos(plugin, cookies, notebook.bookID)
                };
                return { success: true as const, notebook: enhanced };
            } catch (error) {
                logError("weread/syncWereadNotes", `书籍《${notebook.title}》增强阶段失败`, error);
                return { success: false as const, title: notebook.title, error };
            }
        });
    }
    const enhanceResults = await pool.awaitAll();
    const enhancedNotebooks: EnhancedSyncNotebookRecord[] = [];
    const enhanceFailures: { title: string; error: any }[] = [];
    for (const r of enhanceResults) {
        if (r.success === true) {
            enhancedNotebooks.push(r.notebook);
        } else {
            enhanceFailures.push({ title: r.title, error: r.error });
        }
    }

    if (normalBooks.length === 0) {
        // 没有普通书需要同步，直接返回公众号同步结果
        return mpSyncSuccess;
    }

    // 并行处理所有书籍的更新，返回每本书的成功/失败状态
    const updatePromises = enhancedNotebooks.map(async notebook => {
        // blockID 缺失视为失败，不能静默跳过
        if (!notebook.blockID) {
            logError("weread/syncWereadNotes", `书籍《${notebook.title}》缺少 blockID，无法同步`, null);
            return { success: false, title: notebook.title };
        }

        try {
            const highlights = notebook.highlights;
            const comments = notebook.comments?.reviews || [];

            // 使用纯数据函数构建章节信息
            const highlightsByChapter = groupHighlightsByChapter(highlights);
            const { abstractComments, chapterComments } = classifyComments(comments);

            const notesTemplateMatch = effectiveTemplate.match(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/);
            // 使用模板中提取的 notes 块，无则空字符串（不再兜底默认模板）
            const notesTemplate = notesTemplateMatch ? notesTemplateMatch[1] : "";

            // 构建层级章节结构
            const hierarchy = buildChapterHierarchy(notebook.chapterInfos);

            // 构建扁平化章节结构
            const chapters = hierarchy.rootChapters.length > 0
                ? buildFlatChapters(
                    hierarchy,
                    highlightsByChapter,
                    chapterComments,
                    abstractComments,
                    notesTemplate,
                    notebook.title
                )
                : [];

            const variables = buildTemplateVariables(notebook, comments, chapters);
            const noteContent = renderWereadTemplate(effectiveTemplate, variables);

            await updateEndBlocks(
                plugin,
                notebook.blockID,
                wereadPositionMark,
                noteContent
            );
            showMessage(`${plugin.i18n.showMessage34}《${notebook.title}》`, 2000);
            return { success: true, title: notebook.title };
        } catch (error) {
            showMessage(`${plugin.i18n.showMessage35}《${notebook.title}》${plugin.i18n.showMessage36}`, 2000);
            logError("weread/syncWereadNotes", `更新书籍《${notebook.title}》失败`, error);
            return { success: false, title: notebook.title };
        }
    });

    // 汇总所有结果：增强失败 + 更新失败 + 公众号失败，只有全部成功才返回 true
    const updateResults = await Promise.all(updatePromises);
    const hasUpdateFailure = updateResults.some(r => !r.success);
    const hasEnhanceFailure = enhanceFailures.length > 0;
    return !hasUpdateFailure && !hasEnhanceFailure && mpSyncSuccess;
}

// 校验并重建临时笔记本列表
async function ensureTemporaryWereadNotebooksList(plugin: WereadPluginLike, cookies: string, sourceMode: NotebookSourceMode = "allow-rebuild"): Promise<any[]> {
    const cachedList: any[] = await plugin.loadData("temporary_weread_notebooksList") || [];

    // ui-cache-only 模式：额外检查预加载完成标记，确保缓存已准备好
    if (sourceMode === "ui-cache-only") {
        const readyAt = await plugin.loadData("weread_notebooksList_readyAt");
        const hasValidReadyMark = typeof readyAt === "number" && readyAt > 0;

        // ui-cache-only 模式缓存有效性判断：
        // - 必须是数组（空数组也是合法状态，表示预加载完成但结果为空）
        // - 必须有有效的 ready 标记
        // - 若数组非空，则每项结构必须合法
        // 空数组 + 有效 ready 标记 = "缓存已完成，只是结果为空"，不应误判为"缓存未准备好"
        const isArray = Array.isArray(cachedList);
        const hasValidItems = isArray && cachedList.every((book: any) => {
            return (
                book.bookID &&
                typeof book.bookID === "string" &&
                book.bookID.trim() !== "" &&
                book.title &&
                typeof book.title === "string" &&
                book.updatedTime !== undefined &&
                book.sourceType &&
                typeof book.sourceType === "string"
            );
        });

        // 缓存有效条件：是数组 + ready 标记有效 + 若有元素则结构合法
        const isCacheReady = isArray && hasValidReadyMark && hasValidItems;

        if (isCacheReady) {
            return cachedList;
        }

        // ui-cache-only 模式：缓存未准备好时直接返回空数组，不远程重建
        console.warn("[微信读书] 本地缓存未准备好（无有效缓存或无完成标记），ui-cache-only 模式下跳过远程重建");
        return [];
    }

    // allow-rebuild 模式：缓存有效性判断与 ui-cache-only 保持一致
    // - 必须是数组（空数组也是合法状态，表示缓存已完成但结果为空）
    // - 若数组非空，则每项结构必须合法
    // 空数组不再天然视为缓存无效，但 allow-rebuild 模式下会触发远程重建以获取最新数据
    const isArray = Array.isArray(cachedList);
    const hasValidItems = isArray && cachedList.every((book: any) => {
        return (
            book.bookID &&
            typeof book.bookID === "string" &&
            book.bookID.trim() !== "" &&
            book.title &&
            typeof book.title === "string" &&
            book.updatedTime !== undefined &&
            book.sourceType &&
            typeof book.sourceType === "string"
        );
    });

    // 缓存有效条件：是数组 + 若有元素则结构合法
    const isCacheReady = isArray && hasValidItems;

    if (isCacheReady) {
        // 空数组场景：缓存已完成但结果为空，允许重建以获取最新数据
        // 非空数组场景：缓存有效，直接返回
        if (cachedList.length === 0) {
            console.info("[微信读书] 缓存为空但结构合法，触发远程重建以获取最新数据");
        } else {
            return cachedList;
        }
    }

    try {
        // 使用共用的 helper 构建列表，确保字段结构统一
        const rebuiltList = await buildTemporaryNotebookList(plugin, cookies);
        await plugin.saveData("temporary_weread_notebooksList", rebuiltList);
        return rebuiltList;
    } catch (error: any) {
        // 重建失败时输出错误日志
        console.error("[微信读书] temporary_weread_notebooksList 重建失败:", error);
        return [];
    }
}

// 标准化原始笔记本列表：过滤忽略书籍、融合自定义ISBN、统一字段结构
// 供手动 UI 同步传入预加载快照时使用，确保与 getPersonalNotebooks() 输出语义一致
async function normalizeNotebookList(plugin: WereadPluginLike, rawNotebooks: any[]): Promise<SyncNotebookRecord[]> {
    const ignoredBooks: SyncNotebookRecord[] = await plugin.loadData('weread_ignoredBooks') || [];
    const ignoredBookIDs = new Set(ignoredBooks.map((b) => b.bookID?.toString() || ""));
    const ignoredIsbns = new Set(ignoredBooks.map((b: any) => b.isbn?.toString() || ""));

    // 筛选过滤掉忽略书籍
    const filteredNotebooks = rawNotebooks.filter((book: any) => {
        const bookID = book.bookID?.toString();
        const isbn = book.isbn?.toString();
        if (bookID && ignoredBookIDs.has(bookID)) return false;
        if (isbn && ignoredIsbns.has(isbn)) return false;
        return true;
    });

    // 构建自定义ISBN映射表
    const customISBNMap = new Map<string, string>();
    const customBooks = await plugin.loadData("weread_customBooksISBN") || [];
    customBooks.forEach((item: any) => {
        if (item.bookID && item.customISBN) {
            customISBNMap.set(item.bookID.toString(), item.customISBN);
        }
    });

    // 标准化输出
    return filteredNotebooks.map((book: any) => {
        const isMpAccount = book.sourceType === "weread_mp_account";
        const hasISBN = book.isbn && book.isbn.trim() !== "";
        const resolvedISBN = isMpAccount
            ? (book.isbn || "")
            : (hasISBN ? book.isbn : customISBNMap.get(book.bookID?.toString()) || "");

        return {
            sourceType: book.sourceType || "weread_book",
            isbn: resolvedISBN,
            bookID: book.bookID || "",
            title: book.title || book.bookID || "未命名书籍",
            author: book.author ?? "",
            cover: book.cover ?? "",
            introduction: book.introduction ?? "",
            updatedTime: book.updatedTime ?? 0,
            noteCount: book.noteCount ?? 0,
            reviewCount: book.reviewCount ?? 0,
        };
    });
}

// 获取预加载的云端书籍笔记列表，排除已忽略的书籍和融合了自定义ISBN的书籍
async function getPersonalNotebooks(plugin: WereadPluginLike, sourceMode: NotebookSourceMode = "allow-rebuild"): Promise<SyncNotebookRecord[]> {
    // 获取 cookies 用于可能的缓存重建
    const savedcookies = await plugin.loadData("weread_cookie") || {};
    const cookies = savedcookies.cookies || "";

    // 使用校验后的列表
    const rawNotebooks: any[] = await ensureTemporaryWereadNotebooksList(plugin, cookies, sourceMode);

    // 使用标准化 helper 处理
    return normalizeNotebookList(plugin, rawNotebooks);
}

