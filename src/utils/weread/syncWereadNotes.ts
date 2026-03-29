import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql } from "@/api";
import { getBookComments, getBookHighlights, getBook, getBookBestHighlights } from "@/utils/weread/wereadInterface";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { loadAVData } from "@/utils/bookHandling/index";
import { addUseBookIDsToDatabase } from "@/utils/weread/addUseBookIDs";
import WereadNewBooks from "@/components/common/wereadNewBooksDialog.svelte";

type NoteContent = {
    formattedNote: string;
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

function formatTimestamp(timestamp: number, formatKey: string = 'createTime1'): string {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp * 1000);
    const format = TIME_FORMATS[formatKey] || TIME_FORMATS['createTime1'];

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

type ChapterContent = {
    chapterTitle: string;
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
    chapters: ChapterContent[];
    globalComments: { content: string; createTime1: string; createTime2: string; createTime3: string; createTime4: string; createTime5: string; createTime6: string; createTime7: string; createTime8: string; createTime9: string; createTime10: string }[];
    bookInfo: string;
    AISummary: string;
    bestHighlights: string[];
};

export async function syncWereadNotes(plugin: any, cookies: string, isupdate: boolean) {
    const oldNotebooks = await plugin.loadData("weread_notebooks"); // 获取上一次的同步数据

    // 若选择的是更新同步并且之前没有同步过则要求进行一次完整同步
    if (!oldNotebooks && isupdate) {
        showMessage(plugin.i18n.showMessage26);
        return;
    }

    let cloudNotebooksList = await getPersonalNotebooks(plugin); // 获取预加载的云端书籍笔记列表

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
    const bookNameBlockIDs = new Set(bookNameColumn.map((item: any) => item.blockID));
    const isbnBlockIDs = new Set(ISBNColumn.map((item: any) => item.blockID));
    // 找出在ISBN列中但不在书名列中的blockID
    const blockIDsToRemove = Array.from(isbnBlockIDs).filter(id => !bookNameBlockIDs.has(id) && id !== undefined);
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

    // 筛选出云端有但本地没有的书籍：包括使用bookID同步的书籍和不使用bookID同步的书籍
    const cloudNewBooks = cloudNotebooksList.filter((item: any) => {
        // 如果这本书已经在使用bookID同步的列表中，则不在新书籍窗口中显示
        if (item.bookID && useBookIDSet.has(item.bookID.toString())) {
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
                                            const bookDetail = await getBook(plugin, cookies, bookItem.bookID);
                                            await addUseBookIDsToDatabase(plugin, avID, bookDetail);
                                            importBooksNumber++; // 成功导入书籍数量增加
                                        } catch (error) {
                                            console.error(`获取书籍 ${bookItem.bookID} 详细信息失败:`, error);
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
                                            console.error(`导入书籍 ${book.title} 失败:`, error); // 导入失败日志
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
                                    console.error("同步失败:", error);
                                    showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                    return; // 退出函数，不继续执行后续操作
                                }
                            } catch (error) {
                                console.error("批量导入失败:", error);
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
                                    console.error("同步失败:", error);
                                    showMessage(plugin.i18n.showMessage33, 3000); // "同步失败，请检查控制台日志"
                                    return; // 退出函数，不继续执行后续操作
                                }
                            } catch (error) {
                                console.error("同步失败:", error);
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
            console.error("同步失败:", error);
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
            const booksToSync = booksNeedSync.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            // 执行同步
            await syncNotesProcess(plugin, cookies, booksToSync);

            // 更新本地存储的同步记录
            const updatedNotebooks = awaitSyncBooksList.map((book: any) => ({
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
            const booksToSync = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            // 执行同步
            await syncNotesProcess(plugin, cookies, booksToSync);

            // 更新本地存储的同步记录
            const updatedNotebooks = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: blockMap.get(book.isbn?.toString()) || blockMap.get(book.bookID?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return;
        }
    }
}

async function syncNotesProcess(plugin: any, cookies: string, notebooks: any): Promise<void> {
    // 加载微信读书笔记同步模板
    const template = await plugin.loadData("weread_templates");
    // 检查模板
    if (!template) {
        showMessage(plugin.i18n.showMessage25);
        return;
    }

    // 并行获取所有书籍的划线和评论
    const enhancedNotebooks = await Promise.all(
        notebooks.map(async (notebook: any) => ({
            ...notebook,
            highlights: await getBookHighlights(plugin, cookies, notebook.bookID),
            comments: await getBookComments(plugin, cookies, notebook.bookID),
            bookDetails: await getBook(plugin, cookies, notebook.bookID),
            bestHighlights: await getBookBestHighlights(plugin, cookies, notebook.bookID)
        }))
    );

    // 并行处理所有书籍的更新
    const updatePromises = enhancedNotebooks
        .filter(notebook => notebook.blockID)
        .map(async notebook => {
            try {
                const highlights = notebook.highlights;
                const chapterMap = new Map();

                // 从划线笔记中获取章节信息
                if (highlights.chapters && Array.isArray(highlights.chapters)) {
                    highlights.chapters.forEach(chapter => {
                        chapterMap.set(chapter.chapterUid, {
                            title: chapter.title,
                            chapterIdx: chapter.chapterIdx
                        });
                    });
                }

                // 从评论中提取章节信息（处理只有评论没有划线的情况）
                const comments = notebook.comments?.reviews;
                if (comments && Array.isArray(comments)) {
                    comments.forEach((comment: any) => {
                        const review = comment.review;
                        if (review.chapterUid && !chapterMap.has(review.chapterUid)) {
                            // 如果章节信息不存在，创建一个新的章节条目
                            chapterMap.set(review.chapterUid, {
                                title: review.chapterTitle || `章节 ${review.chapterUid}`,
                                chapterIdx: review.chapterIdx || review.chapterUid || 0
                            });
                        }
                    });
                }

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

                const chapterComments = new Map();

                // 首先收集所有有abstract的评论（正文评论）
                const allAbstractComments = new Map();
                comments.forEach((comment: any) => {
                    const review = comment.review;
                    if (review.abstract) {
                        const key = `${review.chapterUid}_${review.range}`;
                        if (!allAbstractComments.has(key)) {
                            allAbstractComments.set(key, []);
                        }
                        allAbstractComments.get(key).push(review);
                    } else if (!review.range) {
                        // 没有abstract且没有range的是章节评论
                        if (!chapterComments.has(review.chapterUid)) {
                            chapterComments.set(review.chapterUid, []);
                        }
                        chapterComments.get(review.chapterUid).push(review);
                    }
                });

                const chaptersData: ChapterContent[] = Array.from(chapterMap.entries())
                    .sort((a, b) => a[1].chapterIdx - b[1].chapterIdx)
                    .map(([chapterUid, chapterInfo]) => {
                        const chapterHighlights = highlightsByChapter.get(chapterUid) || [];
                        const sortedHighlights = chapterHighlights.sort((a, b) => {
                            const getStart = (range) => parseInt((range || '').split('-')[0]) || 0;
                            return getStart(a.range) - getStart(b.range);
                        });

                        const chapterEndComments = (chapterComments.get(chapterUid) || [])
                            .map(c => {
                                return {
                                    content: c.content,
                                    createTime1: formatTimestamp(c.createTime, 'createTime1'),
                                    createTime2: formatTimestamp(c.createTime, 'createTime2'),
                                    createTime3: formatTimestamp(c.createTime, 'createTime3'),
                                    createTime4: formatTimestamp(c.createTime, 'createTime4'),
                                    createTime5: formatTimestamp(c.createTime, 'createTime5'),
                                    createTime6: formatTimestamp(c.createTime, 'createTime6'),
                                    createTime7: formatTimestamp(c.createTime, 'createTime7'),
                                    createTime8: formatTimestamp(c.createTime, 'createTime8'),
                                    createTime9: formatTimestamp(c.createTime, 'createTime9'),
                                    createTime10: formatTimestamp(c.createTime, 'createTime10')
                                };
                            });

                        const notesTemplateMatch = template.match(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/);
                        const notesTemplate = notesTemplateMatch ? notesTemplateMatch[1] : `- {{markText}}\n> 💬 {{content}}`;

                        // 收集所有笔记（划线+评论），保持它们在原文中的相对顺序
                        const allNotes = [];

                        // 1. 先收集所有划线笔记（包括有评论和无评论的）
                        sortedHighlights.forEach(h => {
                            const comments = allAbstractComments.get(`${h.chapterUid}_${h.range}`) || [];

                            if (comments.length > 0) {
                                // 有匹配的评论（划线+评论），取最新评论时间
                                const latestCommentTime = Math.max(...comments.map(c => c.createTime || 0));
                                allNotes.push({
                                    type: 'highlight_with_comments',
                                    highlight: h,
                                    comments: comments,
                                    range: h.range,
                                    createTime1: formatTimestamp(latestCommentTime, 'createTime1'),
                                    createTime2: formatTimestamp(latestCommentTime, 'createTime2'),
                                    createTime3: formatTimestamp(latestCommentTime, 'createTime3'),
                                    createTime4: formatTimestamp(latestCommentTime, 'createTime4'),
                                    createTime5: formatTimestamp(latestCommentTime, 'createTime5'),
                                    createTime6: formatTimestamp(latestCommentTime, 'createTime6'),
                                    createTime7: formatTimestamp(latestCommentTime, 'createTime7'),
                                    createTime8: formatTimestamp(latestCommentTime, 'createTime8'),
                                    createTime9: formatTimestamp(latestCommentTime, 'createTime9'),
                                    createTime10: formatTimestamp(latestCommentTime, 'createTime10')
                                });

                                // 标记这个评论已经匹配
                                allAbstractComments.delete(`${h.chapterUid}_${h.range}`);
                            } else {
                                // 纯划线笔记，使用划线时间
                                allNotes.push({
                                    type: 'highlight_only',
                                    highlight: h,
                                    range: h.range,
                                    createTime1: formatTimestamp(h.createTime, 'createTime1'),
                                    createTime2: formatTimestamp(h.createTime, 'createTime2'),
                                    createTime3: formatTimestamp(h.createTime, 'createTime3'),
                                    createTime4: formatTimestamp(h.createTime, 'createTime4'),
                                    createTime5: formatTimestamp(h.createTime, 'createTime5'),
                                    createTime6: formatTimestamp(h.createTime, 'createTime6'),
                                    createTime7: formatTimestamp(h.createTime, 'createTime7'),
                                    createTime8: formatTimestamp(h.createTime, 'createTime8'),
                                    createTime9: formatTimestamp(h.createTime, 'createTime9'),
                                    createTime10: formatTimestamp(h.createTime, 'createTime10')
                                });
                            }
                        });

                        // 2. 收集未匹配到划线的评论（只评论笔记）
                        allAbstractComments.forEach((comments, key) => {
                            const [commentChapterUid, commentRange] = key.split('_');

                            if (commentChapterUid == chapterUid) {
                                comments.forEach(comment => {
                                    allNotes.push({
                                        type: 'comment_only',
                                        comment: comment,
                                        range: commentRange,
                                        createTime1: formatTimestamp(comment.createTime, 'createTime1'),
                                        createTime2: formatTimestamp(comment.createTime, 'createTime2'),
                                        createTime3: formatTimestamp(comment.createTime, 'createTime3'),
                                        createTime4: formatTimestamp(comment.createTime, 'createTime4'),
                                        createTime5: formatTimestamp(comment.createTime, 'createTime5'),
                                        createTime6: formatTimestamp(comment.createTime, 'createTime6'),
                                        createTime7: formatTimestamp(comment.createTime, 'createTime7'),
                                        createTime8: formatTimestamp(comment.createTime, 'createTime8'),
                                        createTime9: formatTimestamp(comment.createTime, 'createTime9'),
                                        createTime10: formatTimestamp(comment.createTime, 'createTime10')
                                    });
                                });
                            }
                        });

                        // 3. 按 range 统一排序所有笔记
                        allNotes.sort((a, b) => {
                            const getStart = (range) => parseInt((range || '').split('-')[0]) || 0;
                            return getStart(a.range) - getStart(b.range);
                        });

                        // 4. 统一渲染所有笔记
                        const notesData = allNotes.map(note => {
                            const lines = notesTemplate.split('\n');
                            let renderedLines;

                            switch (note.type) {
                                case 'highlight_only':
                                    // 纯划线笔记
                                    renderedLines = lines
                                        .map(line => {
                                            if (line.includes('{{highlightComment}}')) {
                                                return null;
                                            }
                                            return line.replace(/{{highlightText}}/g, note.highlight.markText)
                                                .replace(/{{createTime1}}/g, note.createTime1 || '')
                                                .replace(/{{createTime2}}/g, note.createTime2 || '')
                                                .replace(/{{createTime3}}/g, note.createTime3 || '')
                                                .replace(/{{createTime4}}/g, note.createTime4 || '')
                                                .replace(/{{createTime5}}/g, note.createTime5 || '')
                                                .replace(/{{createTime6}}/g, note.createTime6 || '')
                                                .replace(/{{createTime7}}/g, note.createTime7 || '')
                                                .replace(/{{createTime8}}/g, note.createTime8 || '')
                                                .replace(/{{createTime9}}/g, note.createTime9 || '')
                                                .replace(/{{createTime10}}/g, note.createTime10 || '')
                                                .replace(/{{chapterTitle}}/g, chapterInfo.title)
                                                .replace(/{{notebookTitle}}/g, notebook.title);
                                        })
                                        .filter(line => line !== null && line.trim() !== '');
                                    break;

                                case 'highlight_with_comments':
                                    // 划线+多个评论，合并显示
                                    const allComments = note.comments.map(c => c.content || '').filter(Boolean);
                                    // 使用双换行符分隔多个评论，确保在思源笔记中被识别为独立的块
                                    const combinedComments = allComments.join('\n\n> 💬 ');
                                    const hasComments = allComments.length > 0;
                                    renderedLines = lines
                                        .map(line => {
                                            // 如果没有评论，过滤掉包含{{highlightComment}}的行
                                            if (!hasComments && line.includes('{{highlightComment}}')) {
                                                return null;
                                            }
                                            return line
                                                .replace(/{{highlightText}}/g, note.highlight.markText)
                                                .replace(/{{highlightComment}}/g, combinedComments)
                                                .replace(/{{createTime1}}/g, note.createTime1 || '')
                                                .replace(/{{createTime2}}/g, note.createTime2 || '')
                                                .replace(/{{createTime3}}/g, note.createTime3 || '')
                                                .replace(/{{createTime4}}/g, note.createTime4 || '')
                                                .replace(/{{createTime5}}/g, note.createTime5 || '')
                                                .replace(/{{createTime6}}/g, note.createTime6 || '')
                                                .replace(/{{createTime7}}/g, note.createTime7 || '')
                                                .replace(/{{createTime8}}/g, note.createTime8 || '')
                                                .replace(/{{createTime9}}/g, note.createTime9 || '')
                                                .replace(/{{createTime10}}/g, note.createTime10 || '')
                                                .replace(/{{chapterTitle}}/g, chapterInfo.title)
                                                .replace(/{{notebookTitle}}/g, notebook.title);
                                        })
                                        .filter(line => line !== null && line.trim() !== '');
                                    break;

                                case 'comment_only':
                                    // 只评论笔记
                                    renderedLines = lines
                                        .map(line => {
                                            return line
                                                .replace(/{{highlightText}}/g, note.comment.abstract || '[评论]')
                                                .replace(/{{highlightComment}}/g, note.comment.content || '')
                                                .replace(/{{createTime1}}/g, note.createTime1 || '')
                                                .replace(/{{createTime2}}/g, note.createTime2 || '')
                                                .replace(/{{createTime3}}/g, note.createTime3 || '')
                                                .replace(/{{createTime4}}/g, note.createTime4 || '')
                                                .replace(/{{createTime5}}/g, note.createTime5 || '')
                                                .replace(/{{createTime6}}/g, note.createTime6 || '')
                                                .replace(/{{createTime7}}/g, note.createTime7 || '')
                                                .replace(/{{createTime8}}/g, note.createTime8 || '')
                                                .replace(/{{createTime9}}/g, note.createTime9 || '')
                                                .replace(/{{createTime10}}/g, note.createTime10 || '')
                                                .replace(/{{chapterTitle}}/g, chapterInfo.title)
                                                .replace(/{{notebookTitle}}/g, notebook.title);
                                        })
                                        .filter(line => line !== null && line.trim() !== '');
                                    break;
                            }

                            const renderedNote = renderedLines.join('\n');

                            return { formattedNote: renderedNote, range: note.range };
                        });

                        return {
                            chapterTitle: chapterInfo.title,
                            notes: notesData,
                            chapterComments: chapterEndComments
                        };
                    });

                const variables: TemplateVariables = {
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
                    chapters: chaptersData,
                    globalComments: comments
                        .filter(c => !c.review.abstract && !c.review.contextAbstract)
                        .map(c => {
                                return {
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
                            };
                        }),
                    bookInfo: notebook.bookDetails?.intro || '',
                    AISummary: notebook.bookDetails?.AISummary || '',
                    bestHighlights: notebook.bestHighlights?.bestBookMarks?.items?.map(item => item.markText) || []
                };

                const renderTemplate = (tpl: string) => {
                    return tpl
                        .replace(/\{\{#chapters\}\}([\s\S]*?)\{\{\/chapters\}\}/g, (_, section) => {
                            return variables.chapters.map(chapter =>
                                section
                                    .replace(/\{\{chapterTitle\}\}/g, chapter.chapterTitle)
                                    .replace(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/g, () => {
                                        return chapter.notes
                                            .map(note => note.formattedNote)
                                            .join('\n');
                                    })
                                    .replace(/\{\{#chapterComments\}\}([\s\S]*?)\{\{\/chapterComments\}\}/g, (_, commentsTpl) => {
                                        if (!chapter.chapterComments || chapter.chapterComments.length === 0) return '';
                                        // 为每个章节评论生成格式化内容，替换模板中的所有变量
                                        const formattedComments = chapter.chapterComments.map(c => {
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
                                        });
                                        return formattedComments.join('\n\n');
                                    })
                            ).join('\n');
                        })
                        .replace(/\{\{#globalComments\}\}([\s\S]*?)\{\{\/globalComments\}\}/g, (_, commentsTpl) => {
                            if (!variables.globalComments || variables.globalComments.length === 0) return '';
                            // 为每个书评生成格式化内容，替换模板中的所有变量
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
                        .replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
                };

                const noteContent = renderTemplate(template);

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
                    console.error(`更新失败:`, error);
                }
            } catch (error) {
                showMessage(`${plugin.i18n.showMessage35}《${notebook.title}》${plugin.i18n.showMessage36}`, 2000);
                console.error(`更新失败:`, error);
            }
        });

    return Promise.all(updatePromises).then(() => {
        showMessage(plugin.i18n.showMessage37, 2000);
    });
}

// 获取预加载的云端书籍笔记列表，排除已忽略的书籍和融合了自定义ISBN的书籍
async function getPersonalNotebooks(plugin: any) {
    const notebooksList = await plugin.loadData("temporary_weread_notebooksList"); // 获取预加载的云端书籍笔记列表
    const ignoredBooks = await plugin.loadData('weread_ignoredBooks') || []; // 获取已忽略的书籍列表
    const ignoredBookIDs = new Set(ignoredBooks.map((b: any) => b.bookID?.toString() || "")); // 获取已忽略的书籍ID列表
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
            isbn: resolvedISBN,
            bookID: book.bookID,
            title: book.title,
            updatedTime: book.updatedTime
        };
    });

    return basicNotebooks;
}

async function updateEndBlocks(plugin: any, blockID: string, wereadPositionMark: string, noteContent: any) {
    // 检查 blockID 是否存在
    if (!blockID) {
        throw new Error("blockID 不存在");
    }

    try {
        const childBlocks = await plugin.client.getChildBlocks({
            id: blockID,
        });

        // 检查是否有子块
        if (!childBlocks || !childBlocks.data || childBlocks.data.length === 0) {
            throw new Error(`书籍 blockID ${blockID} 不存在子块`);
        }

        const data = childBlocks.data || [];
        const targetContent = wereadPositionMark;

        let targetBlock = data.find((block: { content: string; }) => block.content === targetContent);
        let targetBlockID: string | null = null;
        let idsList: string[] = [];

        if (targetBlock) {
            targetBlockID = targetBlock.id;
            const targetIndex = data.indexOf(targetBlock);
            idsList = data.slice(targetIndex + 1).map(block => block.id);

            for (const id of idsList) {
                try {
                    await plugin.client.deleteBlock({ id });
                } catch (error) {
                    console.error(`删除块 ${id} 时出错：`, error);
                }
            }
        } else {
            // 如果没有找到标记块，则在文档末尾添加标记块
            const lastBlock = data.length > 0 ? data[data.length - 1] : null;
            const markBlockID = await plugin.client.insertBlock({
                data: targetContent,
                dataType: "markdown",
                previousID: lastBlock ? lastBlock.id : blockID,
            });

            // 使用新插入的标记块作为目标块
            targetBlockID = markBlockID.data[0].doOperations[0].id;
        }

        await plugin.client.insertBlock({
            data: noteContent,
            dataType: "markdown",
            previousID: targetBlockID,
        });
    } catch (error) {
        console.error(`获取子块或更新块时出错，blockID: ${blockID}`, error);
        // 重新抛出错误，以便在调用函数中处理
        throw error;
    }
}

async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await plugin.loadData('weread_ignoredBooks') || [];
    const merged = [...existingIgnored, ...newIgnoredBooks];
    const uniqueMap = new Map();
    merged.forEach(book => {
        const bookID = book.bookID?.toString();
        if (bookID) {
            uniqueMap.set(bookID, book);
        }
    });

    const finalIgnoredBooks = Array.from(uniqueMap.values());

    await plugin.saveData('weread_ignoredBooks', finalIgnoredBooks);
}

// 保存自定义书籍ISBN
async function saveCustomBooksISBN(plugin: any, selectedBooks: any[], cloudNotebooksList: any[]) {
    const customBooks = selectedBooks
        .filter(book => {
            const originalBook = cloudNotebooksList.find(original => original.bookID === book.bookID);
            const shouldSave = originalBook && originalBook.isbn === "" && book.isbn !== "";
            return shouldSave;
        })
        .map(({ title, isbn, bookID }) => ({
            title,
            customISBN: isbn,
            bookID: bookID,
        }));

    if (customBooks.length > 0) {
        const existingCustom = await plugin.loadData("weread_customBooksISBN") || [];

        const merged = [...existingCustom, ...customBooks];
        const customMap = new Map(merged.map(item => [item.bookID, item]));
        const finalCustomBooks = Array.from(customMap.values());

        await plugin.saveData("weread_customBooksISBN", finalCustomBooks);
    }
}

// 保存使用bookID同步的书籍信息
async function saveUseBookIDBooks(plugin: any, useBookIDBooks: any[]) {
    const existingUseBookID = await plugin.loadData("weread_useBookIDBooks") || [];

    const merged = [...existingUseBookID, ...useBookIDBooks];
    const useBookIDMap = new Map();
    merged.forEach(book => {
        const bookID = book.bookID?.toString();
        if (bookID) {
            useBookIDMap.set(bookID, book);
        }
    });

    const finalUseBookIDBooks = Array.from(useBookIDMap.values());

    await plugin.saveData("weread_useBookIDBooks", finalUseBookIDBooks);
}