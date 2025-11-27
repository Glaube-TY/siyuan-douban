import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql } from "@/api";
import { getBookComments, getBookHighlights, getBook } from "@/utils/weread/wereadInterface";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { loadAVData } from "@/utils/bookHandling/index";
import { addUseBookIDsToDatabase } from "@/utils/weread/addUseBookIDs";
import WereadNewBooks from "@/components/common/wereadNewBooksDialog.svelte";

type NoteContent = {
    formattedNote: string;
};

type ChapterContent = {
    chapterTitle: string;
    notes: NoteContent[];
    chapterComments: string;
};

type TemplateVariables = {
    notebookTitle: string;
    isbn: string;
    updateTime: string;
    chapters: ChapterContent[];
    globalComments: string;
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
        console.log(`清理了 ${blockIDsToRemove.length} 个不匹配的blockID`);
        // 如果有清理操作，则重新获取数据库的ISBN相关数据
        const updatedDatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
        const updatedDatabaseData = updatedDatabase.data.av || {};
        const updatedISBNKey = updatedDatabaseData.keyValues.find((item: any) => item.key.name === "ISBN");
        ISBNColumn = updatedISBNKey?.values || [];
    }

    // // 获取使用bookID同步的书籍列表（处理旧格式和新格式）
    // const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || [];
    // const useBookIDSet = new Set(useBookIDBooks.map((item: any) => {
    //     // 处理旧格式（对象数组）和新格式（字符串数组）
    //     if (typeof item === 'string') {
    //         return item;
    //     } else if (item && item.bookID) {
    //         return item.bookID.toString();
    //     }
    //     return null;
    // }).filter(Boolean));

    // const cloudNewBooks = cloudNotebooksList.filter((item: any) => {
    //     // 如果这本书已经在使用bookID同步的列表中，则不在新书籍窗口中显示
    //     if (item.bookID && useBookIDSet.has(item.bookID.toString())) {
    //         return false;
    //     }

    //     // 否则检查是否已经在数据库中（通过ISBN）
    //     return !ISBNColumn.some((isbnItem: any) => isbnItem.number?.content?.toString() === item.isbn);
    // }); // 筛选出云端有但本地没有的书籍

    const cloudNewBooks = cloudNotebooksList.filter((item: any) => !ISBNColumn.some((isbnItem: any) => isbnItem.number?.content?.toString() === item.isbn)); // 筛选出云端有但本地没有的书籍

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

                                // 保存使用bookID同步的书籍信息
                                if (useBookIDs && useBookIDs.length > 0) {
                                    await saveUseBookIDBooks(plugin, useBookIDs); // 保存使用bookID同步的书籍列表

                                    // 通过bookID逐个获取所有书籍的详细信息并导入数据库
                                    for (const bookItem of useBookIDs) {
                                        try {
                                            const bookDetail = await getBook(plugin, cookies, bookItem.bookID);
                                            await addUseBookIDsToDatabase(plugin, avID, bookDetail);
                                        } catch (error) {
                                            console.error(`获取书籍 ${bookItem.bookID} 详细信息失败:`, error);
                                        }
                                    }
                                }

                                dialog.close(); // 关闭新增书籍弹窗

                                let importBooksNumber = 0;
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

                                // 若有新增书籍，则更新ISBNColumn
                                if (selectedBooks.length > 0) {
                                    getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID }); // 获取数据库最新数据
                                    ISBNColumn = getdatabase.data.av.keyValues.find((item: any) => item.key.name === "ISBN").values || []; // 更新ISBNColumn
                                }

                                // 执行同步操作
                                try {
                                    await syncBooks(selectedBooks);
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

    async function syncBooks(selectedBooksForSync?: any[]) {
        cloudNotebooksList = await getPersonalNotebooks(plugin); // 获取最新的云端笔记本列表，此时包含了最新的自定义ISBN数据和忽略书籍数据

        // 获取数据库中的ISBN集合 
        const existingIsbnsInDB = new Set(
            ISBNColumn.map((item: any) => item.number?.content?.toString()).filter(Boolean) || []
        );

        // 提取云端和数据库同时包含的书籍（用于后续同步）
        let awaitSyncBooksList = cloudNotebooksList.filter((item: any) =>
            existingIsbnsInDB.has(item.isbn?.toString())
        );

        // 如果有选中的书籍（来自selectedBooks），强制包含这些书籍
        if (selectedBooksForSync && selectedBooksForSync.length > 0) {
            const selectedIsbns = new Set(selectedBooksForSync.map(book => book.isbn?.toString()));
            const additionalBooks = cloudNotebooksList.filter(item =>
                selectedIsbns.has(item.isbn?.toString()) &&
                !awaitSyncBooksList.some(syncBook => syncBook.isbn === item.isbn)
            );
            awaitSyncBooksList = [...awaitSyncBooksList, ...additionalBooks];
        }

        if (awaitSyncBooksList.length === 0) {
            showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
            return;
        }

        if (isupdate) {
            // 创建旧书籍映射，方便快速查找
            const oldNotebooksMap = new Map();
            if (oldNotebooks) {
                oldNotebooks.forEach((book: any) => {
                    oldNotebooksMap.set(book.isbn?.toString(), book);
                });
            }

            // 筛选出需要同步的书籍（更新时间有变化或新增的书籍）
            let booksNeedSync = awaitSyncBooksList.filter((book: any) => {
                const oldBook = oldNotebooksMap.get(book.isbn?.toString());
                // 如果旧记录不存在，或者更新时间不同，则需要同步
                return !oldBook || oldBook.updatedTime !== book.updatedTime;
            });

            // 如果有选中的书籍，确保它们都被包含在同步列表中（不管oldNotebooks中是否有记录）
            if (selectedBooksForSync && selectedBooksForSync.length > 0) {
                const selectedIsbns = new Set(selectedBooksForSync.map(book => book.isbn?.toString()));
                const selectedBooksInCloud = awaitSyncBooksList.filter(item =>
                    selectedIsbns.has(item.isbn?.toString())
                );

                // 合并并去重，确保选中的书籍都在同步列表中
                const needSyncIsbns = new Set(booksNeedSync.map(book => book.isbn));
                const additionalBooks = selectedBooksInCloud.filter(book => !needSyncIsbns.has(book.isbn));

                if (additionalBooks.length > 0) {
                    booksNeedSync = [...booksNeedSync, ...additionalBooks];
                }
            }

            if (booksNeedSync.length === 0) {
                showMessage(plugin.i18n.showMessage32); // "微信读书没有新笔记~"
                return;
            }

            // 获取数据库中的blockID映射
            const isbnBlockMap = new Map();
            ISBNColumn.forEach((item: any) => {
                const isbn = item.number?.content?.toString();
                if (isbn) isbnBlockMap.set(isbn, item.blockID);
            });

            // 为需要同步的书籍添加blockID
            const booksToSync = booksNeedSync.map((book: any) => ({
                ...book,
                blockID: isbnBlockMap.get(book.isbn?.toString()) || null
            }));

            // 执行同步
            await syncNotesProcess(plugin, cookies, booksToSync);

            // 更新本地存储的同步记录
            const updatedNotebooks = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: isbnBlockMap.get(book.isbn?.toString()) || null
            }));

            await plugin.saveData("weread_notebooks", updatedNotebooks); // 保存更新后的同步记录
            showMessage(plugin.i18n.showMessage37); // "✅ 全部同步完成"
            return; // 完成更新同步后返回，不再执行后续逻辑
        } else {
            // 获取数据库中的blockID映射
            const isbnBlockMap = new Map();
            ISBNColumn.forEach((item: any) => {
                const isbn = item.number?.content?.toString();
                if (isbn) isbnBlockMap.set(isbn, item.blockID);
            });

            // 为所有需要同步的书籍添加blockID
            const booksToSync = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: isbnBlockMap.get(book.isbn?.toString()) || null
            }));

            // 执行同步
            await syncNotesProcess(plugin, cookies, booksToSync);

            // 更新本地存储的同步记录
            const updatedNotebooks = awaitSyncBooksList.map((book: any) => ({
                ...book,
                blockID: isbnBlockMap.get(book.isbn?.toString()) || null
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
            comments: await getBookComments(plugin, cookies, notebook.bookID)
        }))
    );

    console.log(enhancedNotebooks);

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
                            .map(c => c.content);

                        const notesTemplateMatch = template.match(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/);
                        const notesTemplate = notesTemplateMatch ? notesTemplateMatch[1] : `- {{markText}}\n> 💬 {{content}}`;

                        // 收集所有笔记（划线+评论），保持它们在原文中的相对顺序
                        const allNotes = [];

                        // 1. 先收集所有划线笔记（包括有评论和无评论的）
                        sortedHighlights.forEach(h => {
                            const comments = allAbstractComments.get(`${h.chapterUid}_${h.range}`) || [];

                            if (comments.length > 0) {
                                // 有匹配的评论（划线+评论）
                                comments.forEach(comment => {
                                    allNotes.push({
                                        type: 'highlight_with_comment',
                                        highlight: h,
                                        comment: comment,
                                        range: h.range
                                    });
                                });

                                // 标记这个评论已经匹配
                                allAbstractComments.delete(`${h.chapterUid}_${h.range}`);
                            } else {
                                // 纯划线笔记
                                allNotes.push({
                                    type: 'highlight_only',
                                    highlight: h,
                                    range: h.range
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
                                        range: commentRange
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
                                                .replace(/{{chapterTitle}}/g, chapterInfo.title)
                                                .replace(/{{notebookTitle}}/g, notebook.title);
                                        })
                                        .filter(line => line !== null && line.trim() !== '');
                                    break;

                                case 'highlight_with_comment':
                                    // 划线+评论
                                    renderedLines = lines
                                        .map(line => {
                                            return line
                                                .replace(/{{highlightText}}/g, note.highlight.markText)
                                                .replace(/{{highlightComment}}/g, note.comment.content || '')
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
                            chapterComments: chapterEndComments.join('\n')
                        };
                    });

                const variables: TemplateVariables = {
                    notebookTitle: notebook.title,
                    isbn: notebook.isbn,
                    updateTime: new Date(notebook.updatedTime * 1000).toLocaleString(),
                    chapters: chaptersData,
                    globalComments: comments
                        .filter(c => !c.review.abstract && !c.review.contextAbstract)
                        .map(c => `${c.review.content}`)
                        .join('\n')
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
                                    .replace(/\{\{#chapterComments\}\}([\s\S]*?)\{\{\/chapterComments\}\}/g, (_, commentsTpl) =>
                                        chapter.chapterComments ? commentsTpl.replace(/\{\{chapterComments\}\}/g, chapter.chapterComments) : ''
                                    )
                            ).join('\n');
                        })
                        .replace(/\{\{#globalComments\}\}([\s\S]*?)\{\{\/globalComments\}\}/g, (_, section) => {
                            return variables.globalComments ? section : '';
                        })
                        .replace(/\{(\w+)\}/g, (_, key) => variables[key] || '');
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