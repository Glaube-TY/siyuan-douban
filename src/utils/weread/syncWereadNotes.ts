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
import type { WereadPluginLike, WereadBookDetail, SyncNotebookRecord, EnhancedSyncNotebookRecord } from "./types";

const DEFAULT_WEREAD_NOTES_TEMPLATE = `{{#chapters}}

{{#chapterTitle}}
## {{chapterTitle1}}
### {{chapterTitle2}}
#### {{chapterTitle3}}
##### {{chapterTitle4}}
{{/chapterTitle}}

{{#chapterComments}}
### 章节思考
> 💬 {{chapterComments}}
- 🕐 {{createTime7}}
{{/chapterComments}}

{{#notes}}
{{#highlightText}}
- {{highlightText}}
{{/highlightText}}
{{#highlightCreateTime7}}
  - 标注时间：{{highlightCreateTime7}}
{{/highlightCreateTime7}}
{{#comments}}
  - 💬 {{content}}
  {{#commentCreateTime7}}
    - 评论时间：{{commentCreateTime7}}
  {{/commentCreateTime7}}
{{/comments}}
{{#createTime7}}
- 主时间：{{createTime7}}
{{/createTime7}}
{{/notes}}

{{/chapters}}`;

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

type TimeFormat = {
    dateSeparator: string;
    timeSeparator: string;
    showSeconds: boolean;
    useChineseUnit: boolean;
    padZero: boolean;
};

const TIME_FORMATS: Record<string, TimeFormat> = {
    'createTime1': { dateSeparator: '/', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime2': { dateSeparator: '-', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime3': { dateSeparator: '.', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime4': { dateSeparator: '年', timeSeparator: '时', showSeconds: false, useChineseUnit: true, padZero: true },
    'createTime5': { dateSeparator: '年', timeSeparator: '时', showSeconds: false, useChineseUnit: true, padZero: false },
    'createTime6': { dateSeparator: '/', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime7': { dateSeparator: '-', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime8': { dateSeparator: '.', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime9': { dateSeparator: '年', timeSeparator: '时', showSeconds: true, useChineseUnit: true, padZero: true },
    'createTime10': { dateSeparator: '年', timeSeparator: '时', showSeconds: true, useChineseUnit: true, padZero: false },
};

// 为新增字段复用同样的格式配置
const HIGHLIGHT_TIME_FORMATS: Record<string, TimeFormat> = {
    'highlightCreateTime1': TIME_FORMATS['createTime1'],
    'highlightCreateTime2': TIME_FORMATS['createTime2'],
    'highlightCreateTime3': TIME_FORMATS['createTime3'],
    'highlightCreateTime4': TIME_FORMATS['createTime4'],
    'highlightCreateTime5': TIME_FORMATS['createTime5'],
    'highlightCreateTime6': TIME_FORMATS['createTime6'],
    'highlightCreateTime7': TIME_FORMATS['createTime7'],
    'highlightCreateTime8': TIME_FORMATS['createTime8'],
    'highlightCreateTime9': TIME_FORMATS['createTime9'],
    'highlightCreateTime10': TIME_FORMATS['createTime10'],
};

const COMMENT_TIME_FORMATS: Record<string, TimeFormat> = {
    'commentCreateTime1': TIME_FORMATS['createTime1'],
    'commentCreateTime2': TIME_FORMATS['createTime2'],
    'commentCreateTime3': TIME_FORMATS['createTime3'],
    'commentCreateTime4': TIME_FORMATS['createTime4'],
    'commentCreateTime5': TIME_FORMATS['createTime5'],
    'commentCreateTime6': TIME_FORMATS['createTime6'],
    'commentCreateTime7': TIME_FORMATS['createTime7'],
    'commentCreateTime8': TIME_FORMATS['createTime8'],
    'commentCreateTime9': TIME_FORMATS['createTime9'],
    'commentCreateTime10': TIME_FORMATS['createTime10'],
};

function formatTimestamp(timestamp: number, formatKey: string = 'createTime1'): string {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp * 1000);
    // 支持新的字段名映射到对应的格式配置
    let format = TIME_FORMATS[formatKey];
    if (!format) {
        if (formatKey.startsWith('highlightCreateTime')) {
            format = HIGHLIGHT_TIME_FORMATS[formatKey];
        } else if (formatKey.startsWith('commentCreateTime')) {
            format = COMMENT_TIME_FORMATS[formatKey];
        }
    }
    if (!format) {
        format = TIME_FORMATS['createTime1'];
    }

    const year = date.getFullYear();
    const month = format.padZero ? String(date.getMonth() + 1).padStart(2, '0') : date.getMonth() + 1;
    const day = format.padZero ? String(date.getDate()).padStart(2, '0') : date.getDate();
    const hour = format.padZero ? String(date.getHours()).padStart(2, '0') : date.getHours();
    const minute = format.padZero ? String(date.getMinutes()).padStart(2, '0') : date.getMinutes();
    const second = format.padZero ? String(date.getSeconds()).padStart(2, '0') : date.getSeconds();

    let result: string;
    if (format.useChineseUnit) {
        result = `${year}${format.dateSeparator}${month}月${day}日 ${hour}${format.timeSeparator}${minute}分`;
        if (format.showSeconds) {
            result += `${second}秒`;
        }
    } else {
        const datePart = `${year}${format.dateSeparator}${month}${format.dateSeparator}${day}`;
        let timePart = `${hour}${format.timeSeparator}${minute}`;
        if (format.showSeconds) {
            timePart += `${format.timeSeparator}${second}`;
        }
        result = `${datePart} ${timePart}`;
    }
    return result;
}

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

export async function syncWereadNotes(plugin: WereadPluginLike, cookies: string, isupdate: boolean, bookCache?: Map<string, Promise<WereadBookDetail>>) {
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

    let cloudNotebooksList: SyncNotebookRecord[] = await getPersonalNotebooks(plugin); // 获取预加载的云端书籍笔记列表

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
    // 如果有需要清理的blockID，则调用removeAttributeViewBlocks方法
    if (blockIDsToRemove.length > 0) {
        await fetchSyncPost('/api/av/removeAttributeViewBlocks', { "avID": avID, "srcIDs": blockIDsToRemove });
        // 如果有清理操作，则重新获取数据库的ISBN相关数据
        const updatedDatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
        const updatedDatabaseData = updatedDatabase.data.av || {};
        const updatedISBNKey = updatedDatabaseData.keyValues.find((item: any) => item.key.name === "ISBN");
        ISBNColumn = updatedISBNKey?.values || [];
        const updatedBookIDKey = updatedDatabaseData.keyValues.find((item: any) => item.key.name === "bookID");
        bookIDColumn = updatedBookIDKey?.values || [];
        const updatedBookNameKey = updatedDatabaseData.keyValues.find((item: any) => item.key.name === "书名");
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

    // 辅助函数：判断某本书是否"本地已处理"应隐藏
    // 原则：只有当书籍同时存在于本地配置 AND 当前数据库有效记录中，才视为"本地已处理"
    const isBookLocallyProcessed = (item: any): boolean => {
        const bookID = item.bookID?.toString();
        const isbn = item.isbn?.toString();

        // useBookID 路径：只有 bookID 同时在 useBookIDSet 配置中 AND 仍存在于当前数据库 validBookIDsInDB 中，才隐藏
        if (bookID && useBookIDSet.has(bookID) && validBookIDsInDB.has(bookID)) {
            return true;
        }

        // 自定义 ISBN 路径：只有 ISBN 同时在配置中存在 AND 仍存在于当前数据库 validISBNsInDB 中，才隐藏
        if (isbn && validISBNsInDB.has(isbn)) {
            return true;
        }

        return false;
    };

    // 筛选出云端有但本地没有的书籍：包括使用bookID同步的书籍和不使用bookID同步的书籍
    const cloudNewBooks = cloudNotebooksList.filter((item: any) => {
        // 如果这本书"本地已处理"（配置中有且数据库中也有），则不在新书籍窗口中显示
        if (isBookLocallyProcessed(item)) {
            return false;
        }

        // 否则检查是否已经在数据库中（通过ISBN）
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
                                await saveCustomBooksISBN(plugin, selectedBooks, cloudNotebooksList); // 保存自定义书籍ISBN
                                await saveIgnoredBooks(plugin, ignoredBooks); // 保存忽略书籍

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

                                dialog.close(); // 关闭新增书籍弹窗

                                // 若有选择的新导入书籍，则进行数据库书籍的导入
                                if (selectedBooks.length > 0) {
                                    showMessage(plugin.i18n.showMessage27); // "⏳ 正在导入选中书籍..."
                                    const settingConfig = await plugin.loadData("settings.json"); // 加载插件通用配置
                                    const noteTemplate = settingConfig?.noteTemplate || ""; // 获取笔记模板
                                    // 遍历选中的书籍，导入到思源数据库
                                    for (const book of selectedBooks) {
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

                                showMessage(`${plugin.i18n.showMessage28} ${importBooksNumber} ${plugin.i18n.showMessage29}`); // "✅ 成功导入 ${importBooksNumber} 本书籍"

                                // 若有新增书籍或使用bookID同步的书籍，则更新ISBNColumn和bookIDColumn
                                if (selectedBooks.length > 0 || useBookIDs.length > 0) {
                                    getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID }); // 获取数据库最新数据
                                    const isbnKey = getdatabase.data.av.keyValues.find((item: any) => item.key.name === "ISBN");
                                    const bookIDKey = getdatabase.data.av.keyValues.find((item: any) => item.key.name === "bookID");
                                    ISBNColumn = isbnKey?.values || []; // 更新ISBNColumn
                                    bookIDColumn = bookIDKey?.values || []; // 更新bookIDColumn
                                }

                                // 执行同步操作
                                try {
                                    await syncBooks(selectedBooks, useBookIDs);
                                } catch (error) {
                                    logError("weread/syncWereadNotes", "同步失败", error);
                                    showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                    return; // 退出函数，不继续执行后续操作
                                }
                            } catch (error) {
                                logError("weread/syncWereadNotes", "批量导入失败", error);
                                showMessage(plugin.i18n.showMessage31, 3000); // "批量导入失败，请检查控制台日志"
                                dialog.close(); // 关闭新增书籍弹窗
                                return; // 退出函数，不继续执行后续操作
                            }
                        },
                        // 新增书籍弹窗继续按钮点击事件处理
                        onContinue: async (ignoredBooks) => {
                            try {
                                await saveIgnoredBooks(plugin, ignoredBooks); // 保存忽略书籍

                                dialog.close(); // 关闭新增书籍弹窗

                                // 执行同步操作
                                try {
                                    await syncBooks();
                                } catch (error) {
                                    logError("weread/syncWereadNotes", "同步失败", error);
                                    showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                    return; // 退出函数，不继续执行后续操作
                                }
                            } catch (error) {
                                logError("weread/syncWereadNotes", "同步失败", error);
                                showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                dialog.close(); // 关闭新增书籍弹窗
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
            await syncBooks();
        } catch (error) {
            logError("weread/syncWereadNotes", "同步失败", error);
            showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
            return; // 退出函数，不继续执行后续操作
        }
    }

    async function syncBooks(selectedBooksForSync?: any[], useBookIDs?) {
        cloudNotebooksList = await getPersonalNotebooks(plugin); // 获取最新的云端笔记本列表，此时包含了最新的自定义ISBN数据和忽略书籍数据
        const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || []; // 获取使用bookID同步的书籍列表

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
        let awaitSyncBooksList = cloudNotebooksList.filter((item: any) => {
            // 如果有ISBN，优先使用ISBN同步
            if (item.isbn) {
                return existingIsbnsInDB.has(item.isbn?.toString());
            }
            // 如果没有ISBN，使用bookID同步
            return existingBookIDsInDB.has(item.bookID?.toString());
        });

        // 如果有选中的书籍（来自selectedBooks），强制包含这些书籍
        if (selectedBooksForSync && selectedBooksForSync.length > 0) {
            const selectedIsbns = new Set(selectedBooksForSync.map(book => book.isbn?.toString()).filter(Boolean));
            const selectedBookIDs = new Set(selectedBooksForSync.map(book => book.bookID?.toString()).filter(Boolean));

            const additionalBooks = cloudNotebooksList.filter(item => {
                // 通过ISBN匹配
                if (item.isbn && selectedIsbns.has(item.isbn?.toString())) {
                    return !awaitSyncBooksList.some(syncBook => syncBook.isbn === item.isbn);
                }
                // 通过bookID匹配
                if (item.bookID && selectedBookIDs.has(item.bookID?.toString())) {
                    return !awaitSyncBooksList.some(syncBook => syncBook.bookID === item.bookID);
                }
                return false;
            });
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalBooks];
        }

        // 如果有使用bookID同步的书籍（来自useBookIDs），强制包含这些书籍
        if (useBookIDs && useBookIDs.length > 0) {
            const useBookIDSet = new Set(useBookIDs.map(book => book.bookID?.toString()).filter(Boolean));
            const additionalUseBookIDBooks = cloudNotebooksList.filter(item =>
                item.bookID && useBookIDSet.has(item.bookID?.toString()) &&
                !awaitSyncBooksList.some(syncBook => syncBook.bookID === item.bookID)
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

            const additionalBooks = cloudNotebooksList.filter(item => {
                if (item.bookID && useBookIDBooksSet.has(item.bookID.toString())) {
                    return !awaitSyncBooksList.some(syncBook => syncBook.bookID === item.bookID);
                }
                return false;
            });
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalBooks];
        }

        if (awaitSyncBooksList.length === 0) {
            showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
            return;
        }

        if (isupdate) {
            // 创建旧书籍映射，方便快速查找（支持ISBN和bookID）
            const oldNotebooksMap = new Map();
            if (oldNotebooks) {
                oldNotebooks.forEach((book: any) => {
                    if (book.isbn) {
                        oldNotebooksMap.set(book.isbn?.toString(), book);
                    } else if (book.bookID) {
                        oldNotebooksMap.set(book.bookID?.toString(), book);
                    }
                });
            }

            // 筛选出需要同步的书籍（更新时间有变化或新增的书籍）
            let booksNeedSync = awaitSyncBooksList.filter((book: any) => {
                // 优先使用ISBN查找旧记录，没有ISBN则使用bookID
                const oldBook = book.isbn ? oldNotebooksMap.get(book.isbn?.toString()) : oldNotebooksMap.get(book.bookID?.toString());
                // 如果旧记录不存在，或者更新时间不同，则需要同步
                return !oldBook || oldBook.updatedTime !== book.updatedTime;
            });

            // 如果有选中的书籍，确保它们都被包含在同步列表中（不管oldNotebooks中是否有记录）
            if (selectedBooksForSync && selectedBooksForSync.length > 0) {
                const selectedIsbns = new Set(selectedBooksForSync.map(book => book.isbn?.toString()).filter(Boolean));
                const selectedBookIDs = new Set(selectedBooksForSync.map(book => book.bookID?.toString()).filter(Boolean));

                const selectedBooksInCloud = awaitSyncBooksList.filter(item =>
                    (item.isbn && selectedIsbns.has(item.isbn?.toString())) ||
                    (item.bookID && selectedBookIDs.has(item.bookID?.toString()))
                );

                // 合并并去重，确保选中的书籍都在同步列表中
                const needSyncKeys = new Set(booksNeedSync.map(book => book.isbn || book.bookID));
                const additionalBooks = selectedBooksInCloud.filter(book =>
                    !needSyncKeys.has(book.isbn || book.bookID)
                );

                if (additionalBooks.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalBooks];
                }
            }

            // 如果有使用bookID同步的书籍，确保它们都被包含在同步列表中
            if (useBookIDs && useBookIDs.length > 0) {
                const useBookIDSet = new Set(useBookIDs.map(book => book.bookID?.toString()).filter(Boolean));
                const useBookIDBooksInCloud = awaitSyncBooksList.filter(item =>
                    item.bookID && useBookIDSet.has(item.bookID?.toString())
                );

                // 合并并去重
                const needSyncKeys = new Set(booksNeedSync.map(book => book.isbn || book.bookID));
                const additionalBooks = useBookIDBooksInCloud.filter(book =>
                    !needSyncKeys.has(book.bookID)
                );

                if (additionalBooks.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalBooks];
                }
            }

            if (booksNeedSync.length === 0) {
                showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
                return;
            }

            // 获取数据库中的blockID映射（支持ISBN和bookID两种方式）
            const blockMap = new Map();
            // 处理ISBN映射
            ISBNColumn.forEach((item: any) => {
                const isbn = item.number?.content?.toString();
                if (isbn) blockMap.set(isbn, item.blockID);
            });
            // 处理bookID映射
            bookIDColumn.forEach((item: any) => {
                const bookID = item.text?.content?.toString();
                if (bookID) blockMap.set(bookID, item.blockID);
            });

            // 为需要同步的书籍添加blockID
            const booksToSync: SyncNotebookRecord[] = booksNeedSync.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            // 执行同步
            const syncSuccess = await syncNotesProcess(plugin, cookies, booksToSync, bookCache);

            if (!syncSuccess) return;

            // 更新本地存储的同步记录
            const updatedNotebooks: SyncNotebookRecord[] = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return; // 完成更新同步后返回，不再执行后续逻辑
        } else {
            // 获取数据库中的blockID映射（支持ISBN和bookID两种方式）
            const blockMap = new Map();
            // 处理ISBN映射
            ISBNColumn.forEach((item: any) => {
                const isbn = item.number?.content?.toString();
                if (isbn) blockMap.set(isbn, item.blockID);
            });
            // 处理bookID映射
            bookIDColumn.forEach((item: any) => {
                const bookID = item.text?.content?.toString();
                if (bookID) blockMap.set(bookID, item.blockID);
            });

            // 为所有需要同步的书籍添加blockID
            const booksToSync: SyncNotebookRecord[] = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            // 执行同步
            const syncSuccess = await syncNotesProcess(plugin, cookies, booksToSync, bookCache);

            if (!syncSuccess) return;

            // 更新本地存储的同步记录
            const updatedNotebooks: SyncNotebookRecord[] = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return;
        }
    }
}

const NOTEBOOK_ENHANCE_CONCURRENCY = 3;

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
 * 处理 notes 层通用条件 section：{{#fieldName}}...{{/fieldName}}
 * 当 note 上 fieldName 有值（非空字符串、非 null、非 undefined）时保留内容，无值时删除整段
 * 注意：已处理过的 {{#comments}}...{{/comments}} 不会被此函数影响
 */
function renderNoteConditionalSections(
    template: string,
    note: Record<string, any>
): string {
    // 定义 note 上可能的一层字段（不含嵌套对象和数组）
    const singleFields = [
        'highlightText', 'highlightComment', 'formattedNote',
        'createTime1', 'createTime2', 'createTime3', 'createTime4', 'createTime5',
        'createTime6', 'createTime7', 'createTime8', 'createTime9', 'createTime10',
        'highlightCreateTime1', 'highlightCreateTime2', 'highlightCreateTime3', 'highlightCreateTime4', 'highlightCreateTime5',
        'highlightCreateTime6', 'highlightCreateTime7', 'highlightCreateTime8', 'highlightCreateTime9', 'highlightCreateTime10',
        'commentCreateTime1', 'commentCreateTime2', 'commentCreateTime3', 'commentCreateTime4', 'commentCreateTime5',
        'commentCreateTime6', 'commentCreateTime7', 'commentCreateTime8', 'commentCreateTime9', 'commentCreateTime10',
    ];

    let result = template;
    for (const field of singleFields) {
        const value = note[field];
        const hasValue = value !== null && value !== undefined && value !== '';
        // 匹配 {{#fieldName}}...{{/fieldName}} 块
        result = result.replace(new RegExp(`\\{\\{#${field}\\}\\}([\\s\\S]*?)\\{\\{\\/${field}\\}\\}`, 'g'),
            (_, innerContent) => hasValue ? innerContent : '');
    }
    return result;
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
            if (!note.comments || note.comments.length === 0) return '';
            return note.comments.map(c => {
                return commentsTpl
                    .replace(/\{\{content\}\}/g, c.content || '')
                    .replace(/\{\{commentCreateTime1\}\}/g, c.commentCreateTime1 || '')
                    .replace(/\{\{commentCreateTime2\}\}/g, c.commentCreateTime2 || '')
                    .replace(/\{\{commentCreateTime3\}\}/g, c.commentCreateTime3 || '')
                    .replace(/\{\{commentCreateTime4\}\}/g, c.commentCreateTime4 || '')
                    .replace(/\{\{commentCreateTime5\}\}/g, c.commentCreateTime5 || '')
                    .replace(/\{\{commentCreateTime6\}\}/g, c.commentCreateTime6 || '')
                    .replace(/\{\{commentCreateTime7\}\}/g, c.commentCreateTime7 || '')
                    .replace(/\{\{commentCreateTime8\}\}/g, c.commentCreateTime8 || '')
                    .replace(/\{\{commentCreateTime9\}\}/g, c.commentCreateTime9 || '')
                    .replace(/\{\{commentCreateTime10\}\}/g, c.commentCreateTime10 || '');
            }).join('\n');
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
    // 加载微信读书笔记同步模板
    const template = await plugin.loadData("weread_templates");
    // 检查模板
    if (!template) {
        showMessage(plugin.i18n.showMessage25);
        return false;
    }

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

    // 并发获取所有书籍的划线、评论和目录信息
    const pool = new PromiseLimitPool<EnhancedSyncNotebookRecord>(NOTEBOOK_ENHANCE_CONCURRENCY);
    for (const notebook of notebooks) {
        pool.add(async () => ({
            ...notebook,
            highlights: await getBookHighlights(plugin, cookies, notebook.bookID),
            comments: await getBookComments(plugin, cookies, notebook.bookID),
            bookDetails: await getBookCached(notebook.bookID),
            bestHighlights: await getBookBestHighlights(plugin, cookies, notebook.bookID),
            chapterInfos: await getBookChapterInfos(plugin, cookies, notebook.bookID)
        }));
    }
    const enhancedNotebooks: EnhancedSyncNotebookRecord[] = await pool.awaitAll();

    // 并行处理所有书籍的更新
    const updatePromises = enhancedNotebooks
        .filter(notebook => notebook.blockID)
        .map(async notebook => {
            try {
                const highlights = notebook.highlights;
                const comments = notebook.comments?.reviews || [];

                // 使用纯数据函数构建章节信息
                const highlightsByChapter = groupHighlightsByChapter(highlights);
                const { abstractComments, chapterComments } = classifyComments(comments);

                const notesTemplateMatch = template.match(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/);
                // 优先使用模板中提取的 notes 块，否则使用新默认模板
                const notesTemplate = notesTemplateMatch ? notesTemplateMatch[1] : DEFAULT_WEREAD_NOTES_TEMPLATE;

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
                const noteContent = renderWereadTemplate(template, variables);

                const wereadPositionMark = await plugin.loadData("weread_position_mark");
                try {
                    await updateEndBlocks(
                        plugin,
                        notebook.blockID,
                        wereadPositionMark,
                        noteContent
                    );
                    showMessage(`${plugin.i18n.showMessage34}《${notebook.title}》`, 2000);
                } catch (error) {
                    showMessage(`${plugin.i18n.showMessage35}《${notebook.title}》${plugin.i18n.showMessage36}`, 2000);
                    logError("weread/syncWereadNotes", `更新书籍《${notebook.title}》失败`, error);
                }
            } catch (error) {
                showMessage(`${plugin.i18n.showMessage35}《${notebook.title}》${plugin.i18n.showMessage36}`, 2000);
                logError("weread/syncWereadNotes", `更新书籍《${notebook.title}》失败`, error);
            }
        });

    return Promise.all(updatePromises).then(() => {
        showMessage(plugin.i18n.showMessage37, 2000);
        return true;
    });
}

// 校验并重建临时笔记本列表
async function ensureTemporaryWereadNotebooksList(plugin: WereadPluginLike, cookies: string): Promise<any[]> {
    const cachedList: any[] = await plugin.loadData("temporary_weread_notebooksList") || [];

    // 校验缓存是否有效
    const isValidCache = Array.isArray(cachedList) && cachedList.length > 0 && cachedList.every((book: any) => {
        return (
            book.bookID &&
            typeof book.bookID === "string" &&
            book.bookID.trim() !== "" &&
            book.title &&
            typeof book.title === "string" &&
            book.updatedTime !== undefined
        );
    });

    if (isValidCache) {
        return cachedList;
    }

    try {
        const notebookdata = await getNotebooks(plugin, cookies);
        const basicBooks = notebookdata.books || [];

        const rebuiltList: any[] = [];
        for (const b of basicBooks) {
            try {
                const details = await getBook(plugin, cookies, b.bookId);
                rebuiltList.push({
                    noteCount: b.noteCount,
                    reviewCount: b.reviewCount,
                    updatedTime: b.sort,
                    bookID: details.bookId,
                    title: details.title,
                    author: details.author,
                    cover: details.cover,
                    format: details.format,
                    price: details.price,
                    introduction: details.intro,
                    publishTime: details.publishTime,
                    category: details.category,
                    isbn: details.isbn,
                    publisher: details.publisher,
                    totalWords: details.totalWords,
                    star: details.newRating,
                    ratingCount: details.ratingCount,
                    AISummary: details.AISummary,
                });
            } catch {
                // 单本获取失败不影响其他书
            }
        }

        await plugin.saveData("temporary_weread_notebooksList", rebuiltList);
        return rebuiltList;
    } catch (error: any) {
        // 重建失败时输出错误日志
        console.error("[微信读书] temporary_weread_notebooksList 重建失败:", error);
        return [];
    }
}

// 获取预加载的云端书籍笔记列表，排除已忽略的书籍和融合了自定义ISBN的书籍
async function getPersonalNotebooks(plugin: WereadPluginLike): Promise<SyncNotebookRecord[]> {
    // 获取 cookies 用于可能的缓存重建
    const savedcookies = await plugin.loadData("weread_cookie") || {};
    const cookies = savedcookies.cookies || "";

    // 使用校验后的列表
    const notebooksList: SyncNotebookRecord[] = await ensureTemporaryWereadNotebooksList(plugin, cookies);
    const ignoredBooks: SyncNotebookRecord[] = await plugin.loadData('weread_ignoredBooks') || []; // 获取已忽略的书籍列表
    const ignoredBookIDs = new Set(ignoredBooks.map((b) => b.bookID?.toString() || "")); // 获取已忽略的书籍ID列表
    const ignoredIsbns = new Set(ignoredBooks.map((b: any) => b.isbn?.toString() || "")); // 获取已忽略的ISBN列表

    // 筛选过滤掉忽略书籍书籍
    const filteredNotebooks = notebooksList.filter((book: any) => {
        const bookID = book.bookID?.toString();
        const isbn = book.isbn?.toString();

        // 优先使用bookID检查，因为bookID是唯一标识符
        if (bookID && ignoredBookIDs.has(bookID)) {
            return false;
        }

        // 如果没有bookID，再使用isbn检查
        if (isbn && ignoredIsbns.has(isbn)) {
            return false;
        }

        return true;
    });

    const customISBNMap = new Map<string, string>(); // 自定义ISBN映射表，用于存储融合了自定义ISBN的书籍
    const customBooks = await plugin.loadData("weread_customBooksISBN") || []; // 获取自定义书籍ISBN列表
    // 构建自定义ISBN映射表
    customBooks.forEach((item: any) => {
        if (item.bookID && item.customISBN) {
            customISBNMap.set(item.bookID.toString(), item.customISBN);
        }
    });

    // 构建基础书籍笔记列表，包含ISBN、书籍ID、标题和更新时间
    const basicNotebooks = filteredNotebooks.map((book: any) => {
        const hasISBN = book.isbn && book.isbn.trim() !== "";
        const resolvedISBN = hasISBN ? book.isbn : customISBNMap.get(book.bookID?.toString()) || "";

        return {
            isbn: resolvedISBN || "",
            bookID: book.bookID || "",
            title: book.title || book.bookID || "未命名书籍",
            updatedTime: book.updatedTime
        };
    });

    return basicNotebooks;
}

