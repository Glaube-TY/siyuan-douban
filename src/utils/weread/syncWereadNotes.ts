import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql } from "@/api";
import { getBookComments, getBookHighlights } from "@/utils/weread/wereadInterface";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { loadAVData } from "@/utils/bookHandling/index";
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
    const personalNotebooks = await getPersonalNotebooks(plugin); // 获取预加载的书籍笔记列表

    // 获取插件配置并提取数据库ID
    const settingConfig = await plugin.loadData("settings.json");
    const ViewID = settingConfig?.bookDatabaseID;
    const query = `SELECT * FROM blocks WHERE id = "${ViewID}"`;
    const result = await sql(query);
    const avID = result[0].markdown.match(/data-av-id="([^"]+)"/)[1];

    // 获取原始数据库完整信息
    const getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
    const database = getdatabase.data.av;
    const ISBNKey = database.keyValues.find((item: any) => item.key.name === "ISBN"); // 获取ISBN列内容
    const ISBNColumn = ISBNKey?.values || []; // 获取ISBN列所有行内容

    // 根据是否更新同步进行不同处理
    if (isupdate) {
        // 更新同步逻辑
        const oldNotebooks = await plugin.loadData("weread_notebooks"); // 获取上一次的同步数据
        // 若没有同步过则要求进行一次完整同步
        if (!oldNotebooks) {
            showMessage("❌请先进行一次全部同步后再更新同步");
            return;
        } else {
            // 获取数据库中的ISBN集合
            const existingIsbnsInDB = new Set(
                ISBNColumn.map(item => item.number?.content?.toString()).filter(Boolean) || []
            );

            // 过滤旧书数据（只保留数据库存在的记录）
            const validOldNotebooks = oldNotebooks.filter(oldBook =>
                existingIsbnsInDB.has(oldBook.isbn?.toString())
            );

            // 从最新书单中筛选出数据库存在的书籍
            const latestBooksInDB = personalNotebooks.filter(newBook =>
                existingIsbnsInDB.has(newBook.isbn?.toString())
            );

            // 生成需要更新的书籍列表
            let updatedNotebooks = latestBooksInDB.filter(newBook => {
                const oldBook = validOldNotebooks.find(b => b.isbn === newBook.isbn);
                return !oldBook || oldBook.updatedTime !== newBook.updatedTime;
            });

            // 处理当数据库存在但本地记录没有的情况
            const newBooksInDB = latestBooksInDB.filter(newBook =>
                !validOldNotebooks.some(old => old.isbn === newBook.isbn)
            );
            if (newBooksInDB.length > 0) {
                updatedNotebooks = updatedNotebooks.concat(newBooksInDB);
            }

            // 重建映射关系（从数据库获取实际blockID）
            const isbnBlockMap = new Map();
            ISBNColumn.forEach(item => {
                const isbn = item.number?.content?.toString();
                if (isbn) isbnBlockMap.set(isbn, item.blockID);
            });

            // 增强笔记本数据
            const enhancedNotebooks = updatedNotebooks.map(notebook => ({
                ...notebook,
                blockID: isbnBlockMap.get(notebook.isbn?.toString()) || null
            }));

            const newBooksToImport = personalNotebooks
                .filter(newBook =>
                    !existingIsbnsInDB.has(newBook.isbn?.toString())
                )
                .map(notebook => ({
                    ...notebook,
                    blockID: null // 新书尚未导入，blockID设为null
                }));
            if (newBooksToImport.length > 0) {
                const dialog = svelteDialog({
                    title: "新书籍确认",
                    constructor: (containerEl: HTMLElement) => {
                        return new WereadNewBooks({
                            target: containerEl,
                            props: {
                                books: newBooksToImport,
                                onConfirm: async (selectedBooks, ignoredBooks) => {
                                    try {
                                        await saveCustomBooksISBN(plugin, selectedBooks, personalNotebooks);
                                        await saveIgnoredBooks(plugin, ignoredBooks);
                                        dialog.close();
                                        showMessage("⏳ 正在导入选中书籍...");
                                        const settingConfig = await plugin.loadData("settings.json");
                                        const noteTemplate = settingConfig?.noteTemplate || "";
                                        for (const book of selectedBooks) {
                                            try {
                                                const html = await fetchBookHtml(book.isbn);
                                                const bookInfo = await fetchDoubanBook(html);

                                                await loadAVData(avID, {
                                                    ...bookInfo,
                                                    ISBN: book.isbn,
                                                    addNotes: true,
                                                    databaseBlockId: ViewID,
                                                    noteTemplate: noteTemplate,
                                                    myRating: "",
                                                    bookCategory: "",
                                                    readingStatus: "",
                                                    startDate: "",
                                                    finishDate: ""
                                                });

                                                showMessage(`✅ 成功导入《${book.title}》`, 3000);
                                                await fetchPost("/api/ui/reloadAttributeView", { id: avID });
                                            } catch (error) {
                                                console.error(`导入书籍 ${book.title} 失败:`, error);
                                            }
                                        }

                                        const updatedDatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
                                        const newISBNColumn = updatedDatabase.data.av.keyValues.find((item: any) => item.key.name === "ISBN").values;

                                        const newIsbnBlockMap = new Map();
                                        newISBNColumn.forEach(item => {
                                            const isbn = item.number?.content?.toString();
                                            if (isbn) newIsbnBlockMap.set(isbn, item.blockID);
                                        });

                                        showMessage(`✅ 成功导入 ${selectedBooks.length} 本书籍`);
                                        
                                        const mergedSaveBooks = [
                                            ...latestBooksInDB,
                                            ...selectedBooks.map(book => ({
                                                ...book,
                                                blockID: newIsbnBlockMap.get(book.isbn?.toString())
                                            }))
                                        ];
                                        // 在新书导入完成后，创建一个只包含需要同步的书籍列表
                                        const booksToSync = [
                                            ...enhancedNotebooks, // 已经更新的书籍
                                            ...selectedBooks.map(book => ({
                                                ...book,
                                                blockID: newIsbnBlockMap.get(book.isbn?.toString())
                                            })) // 新导入的书籍
                                        ];

                                        await plugin.saveData("weread_notebooks", mergedSaveBooks);
                                        showMessage("⌛开始同步微信读书笔记……");
                                        await syncNotesProcess(plugin, cookies, booksToSync); // 只同步需要同步的书籍

                                    } catch (error) {
                                        console.error("批量导入失败:", error);
                                        showMessage("批量导入失败，请检查控制台日志", 3000);
                                    }
                                },
                                onContinue: async (ignoredBooks) => {
                                    try {
                                        await saveIgnoredBooks(plugin, ignoredBooks);
                                        dialog.close();
                                        if (enhancedNotebooks.length == 0) {
                                            await plugin.saveData("weread_notebooks", latestBooksInDB);
                                            showMessage("微信读书没有新笔记~");
                                        } else {
                                            await plugin.saveData("weread_notebooks", latestBooksInDB);
                                            await syncNotesProcess(plugin, cookies, enhancedNotebooks);
                                        }
                                    } catch (error) {
                                        console.error("同步失败:", error);
                                        showMessage("同步失败，请检查控制台日志", 3000);
                                    }
                                },
                                onCancel: () => {
                                    dialog.close();
                                },
                            },
                        });
                    }
                });
            } else {
                await syncNotesProcess(plugin, cookies, enhancedNotebooks);
            }
        }
    } else {
        const isbnBlockMap = new Map();
        if (ISBNKey) {
            ISBNColumn.forEach(item => {
                const isbn = item.number?.content?.toString();
                if (isbn) isbnBlockMap.set(isbn, item.blockID);
            });
        }

        const enhancedNotebooks = personalNotebooks.map(notebook => ({
            ...notebook,
            blockID: ISBNKey ? isbnBlockMap.get(notebook.isbn?.toString()) || null : null
        }));

        const newBooksToImport = enhancedNotebooks.filter(notebook => notebook.blockID === null);

        if (newBooksToImport.length > 0) {
            const dialog = svelteDialog({
                title: "新书籍确认",
                constructor: (containerEl: HTMLElement) => {
                    return new WereadNewBooks({
                        target: containerEl,
                        props: {
                            books: newBooksToImport,
                            onConfirm: async (selectedBooks, ignoredBooks) => {
                                try {
                                    await saveCustomBooksISBN(plugin, selectedBooks, personalNotebooks);
                                    await saveIgnoredBooks(plugin, ignoredBooks);
                                    dialog.close();
                                    showMessage("⏳ 正在导入选中书籍...");
                                    const settingConfig = await plugin.loadData("settings.json");
                                    const noteTemplate = settingConfig?.noteTemplate || "";
                                    for (const book of selectedBooks) {
                                        try {
                                            const html = await fetchBookHtml(book.isbn);
                                            const bookInfo = await fetchDoubanBook(html);

                                            await loadAVData(avID, {
                                                ...bookInfo,
                                                ISBN: book.isbn,
                                                addNotes: true,
                                                databaseBlockId: ViewID,
                                                noteTemplate: noteTemplate,
                                                myRating: "",
                                                bookCategory: "",
                                                readingStatus: "",
                                                startDate: "",
                                                finishDate: ""
                                            });

                                            showMessage(`✅ 成功导入《${book.title}》`, 3000);
                                            await fetchPost("/api/ui/reloadAttributeView", { id: avID });
                                        } catch (error) {
                                            console.error(`导入书籍 ${book.title} 失败:`, error);
                                        }
                                    }

                                    const updatedDatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
                                    const newISBNColumn = updatedDatabase.data.av.keyValues.find((item: any) => item.key.name === "ISBN").values;

                                    const newIsbnBlockMap = new Map();
                                    newISBNColumn.forEach(item => {
                                        const isbn = item.number?.content?.toString();
                                        if (isbn) newIsbnBlockMap.set(isbn, item.blockID);
                                    });

                                    const updatedNotebooks = personalNotebooks
                                        .filter(notebook => newIsbnBlockMap.has(notebook.isbn?.toString()))
                                        .map(notebook => ({
                                            ...notebook,
                                            blockID: newIsbnBlockMap.get(notebook.isbn?.toString())
                                        }));

                                    showMessage(`✅ 成功导入 ${selectedBooks.length} 本书籍`);
                                    await plugin.saveData("weread_notebooks", updatedNotebooks);
                                    showMessage("⌛开始同步微信读书笔记……");
                                    await syncNotesProcess(plugin, cookies, updatedNotebooks)
                                } catch (error) {
                                    console.error("批量导入失败:", error);
                                    showMessage("批量导入失败，请检查控制台日志", 3000);
                                }
                            },
                            onContinue: async (ignoredBooks) => {
                                try {
                                    await saveIgnoredBooks(plugin, ignoredBooks);
                                    dialog.close();
                                    const existingIsbns = new Set(ISBNColumn.map(item => item.number?.content?.toString()));
                                    let oldNotebookMap = new Map();
                                    const updatedBooks = enhancedNotebooks.filter(n =>
                                        existingIsbns.has(n.isbn?.toString()) &&
                                        n.updatedTime !== oldNotebookMap.get(n.isbn)?.updatedTime
                                    );

                                    if (updatedBooks.length == 0) {
                                        showMessage("微信读书没有新笔记~");
                                    } else {
                                        await plugin.saveData("weread_notebooks", updatedBooks);
                                        await syncNotesProcess(plugin, cookies, updatedBooks);
                                    }
                                } catch (error) {
                                    console.error("同步失败:", error);
                                    showMessage("同步失败，请检查控制台日志", 3000);
                                }
                            },
                            onCancel: () => {
                                dialog.close();
                            },
                        },
                    });
                }
            });
        } else {
            await syncNotesProcess(plugin, cookies, enhancedNotebooks);
        }
    }
}

async function syncNotesProcess(plugin: any, cookies: string, notebooks: any): Promise<void> {
    const template = await plugin.loadData("weread_templates") || `
# {{notebookTitle}}
**最后同步时间**: {{updateTime}}

{{#globalComments}}
## 书评
> 💬 {{globalComments}}
{{/globalComments}}

{{#chapters}}
## {{chapterTitle}}
### 重点笔记
{{#notes}}
- {{highlightText}}
> 💬 {{highlightComment}}
{{/notes}}
{{#chapterComments}}
### 章节思考
> 💬 {{chapterComments}}
{{/chapterComments}}
{{/chapters}}
    `;
    const enhancedNotebooks = await Promise.all(
        notebooks.map(async (notebook: any) => ({
            ...notebook,
            highlights: await getBookHighlights(plugin, cookies, notebook.bookID),
            comments: await getBookComments(plugin, cookies, notebook.bookID)
        }))
    );
    const updatePromises = enhancedNotebooks
        .filter(notebook => notebook.blockID)
        .map(async notebook => {
            try {
                const highlights = notebook.highlights;
                const chapterMap = new Map();
                if (highlights.chapters && Array.isArray(highlights.chapters)) {
                    highlights.chapters.forEach(chapter => {
                        chapterMap.set(chapter.chapterUid, {
                            title: chapter.title,
                            chapterIdx: chapter.chapterIdx
                        });
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

                const comments = notebook.comments?.reviews;
                const chapterComments = new Map();
                const highlightComments = new Map();
                comments.forEach(comment => {
                    const review = comment.review;
                    const key = `${review.chapterUid}_${review.range}`;
                    if (review.abstract) {
                        if (!highlightComments.has(key)) {
                            highlightComments.set(key, []);
                        }
                        highlightComments.get(key).push(review);
                    } else {
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

                        const notesData = sortedHighlights.flatMap(h => {
                            const comments = highlightComments.get(`${h.chapterUid}_${h.range}`) || [];

                            const effectiveComments = comments.length > 0 ? comments : [{}];

                            return effectiveComments.map((c: any) => {
                                const lines = notesTemplate.split('\n');
                                const renderedLines = lines
                                    .map(line => {
                                        if (!c || !c.content) {
                                            if (line.includes('{{highlightComment}}')) {
                                                return null;
                                            }
                                            return line.replace(/{{highlightText}}/g, h.markText);
                                        }

                                        return line
                                            .replace(/{{highlightText}}/g, h.markText)
                                            .replace(/{{highlightComment}}/g, c.content);
                                    })
                                    .filter(line => line !== null && line.trim() !== '');

                                const renderedNote = renderedLines.join('\n');

                                return { formattedNote: renderedNote };
                            });
                        });

                        return {
                            chapterTitle: chapterInfo.title,
                            notes: notesData,
                            chapterComments: chapterEndComments.join('')
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
                        .replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
                };

                const noteContent = renderTemplate(template);

                const wereadPositionMark = await plugin.loadData("weread_position_mark");
                await updateEndBlocks(
                    plugin,
                    notebook.blockID,
                    wereadPositionMark,
                    noteContent
                );

                showMessage(`✅ 已同步《${notebook.title}》`, 2000);
            } catch (error) {
                showMessage(`❌ 同步《${notebook.title}》失败`, 2000);
                console.error(`更新失败:`, error);
            }
        });

    return Promise.all(updatePromises).then(() => {
        showMessage(`✅ 全部同步完成`, 2000);
    });
}

async function getPersonalNotebooks(plugin: any) {
    const notebooksList = await plugin.loadData("temporary_weread_notebooksList");
    const ignoredBooks = await plugin.loadData('weread_ignoredBooks') || [];
    const ignoredIsbns = new Set(ignoredBooks.map(b => b.isbn?.toString()));

    const filteredNotebooks = notebooksList.filter((book: any) =>
        !ignoredIsbns.has(book.isbn?.toString())
    );

    const customISBNMap = new Map<string, string>();
    const customBooks = await plugin.loadData("weread_customBooksISBN") || [];
    customBooks.forEach((item: any) => {
        if (item.bookID && item.customISBN) {
            customISBNMap.set(item.bookID.toString(), item.customISBN);
        }
    });

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
    const childBlocks = await plugin.client.getChildBlocks({
        id: blockID,
    });

    const data = childBlocks?.data || [];
    const targetContent = wereadPositionMark;

    let targetBlock = data.find(block => block.content === targetContent);
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
        const lastBlock = data.length > 0 ? data[data.length - 1] : null;
        targetBlockID = lastBlock ? lastBlock.id : blockID;
    }

    await plugin.client.insertBlock({
        data: noteContent,
        dataType: "markdown",
        previousID: targetBlockID,
    });
}

async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await plugin.loadData('weread_ignoredBooks') || [];
    const merged = [...existingIgnored, ...newIgnoredBooks];
    const uniqueMap = new Map();
    merged.forEach(book => {
        const bookID = book.bookID?.toString();
        if (bookID) uniqueMap.set(bookID, book);
    });

    await plugin.saveData('weread_ignoredBooks', Array.from(uniqueMap.values()));
}

async function saveCustomBooksISBN(plugin: any, selectedBooks: any[], personalNotebooks: any[]) {
    const customBooks = selectedBooks
        .filter(book =>
            personalNotebooks.some(original =>
                original.bookID === book.bookID &&
                original.isbn === "" &&
                book.isbn !== ""
            )
        )
        .map(({ title, isbn, bookID }) => ({
            title,
            customISBN: isbn,
            bookID: bookID,
        }));

    if (customBooks.length > 0) {
        const existingCustom = await plugin.loadData("weread_customBooksISBN") || [];
        const merged = [...existingCustom, ...customBooks];
        const customMap = new Map(merged.map(item => [item.bookID, item]));
        await plugin.saveData("weread_customBooksISBN", Array.from(customMap.values()));
    }
}