import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql } from "@/api";
import { getBook, getBookComments, getNotebooks, getBookHighlights } from "@/utils/weread/wereadInterface";
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
    const personalNotebooks = await getPersonalNotebooks(plugin, cookies);
    const settingConfig = await plugin.loadData("settings.json");
    const ViewID = settingConfig?.bookDatabaseID;
    const query = `SELECT * FROM blocks WHERE id = "${ViewID}"`;
    const result = await sql(query);
    const avID = result[0].markdown.match(/data-av-id="([^"]+)"/)[1];
    const getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
    const database = getdatabase.data.av;
    const ISBNKey = database.keyValues.find((item: any) => item.key.name === "ISBN");
    const ISBNColumn = ISBNKey?.values || [];

    if (isupdate) {
        const oldNotebooks = await plugin.loadData("weread_notebooks");
        const existingIsbnsInDB = new Set(
            ISBNKey?.values.map(item => item.number?.content?.toString()).filter(Boolean) || []
        );

        if (!oldNotebooks) {
            await plugin.saveData("weread_notebooks", personalNotebooks);
        } else {
            const oldNotebookMap = new Map();
            oldNotebooks.forEach(book => oldNotebookMap.set(book.isbn, book));

            const updatedNotebooks = personalNotebooks.filter(newBook => {
                const oldBook = oldNotebookMap.get(newBook.isbn);
                const isInLocalDB = existingIsbnsInDB.has(newBook.isbn?.toString());

                return !oldBook || oldBook.updatedTime !== newBook.updatedTime || !isInLocalDB;
            });

            const mergedNotebooks = updatedNotebooks.map(newBook => {
                const oldBook = oldNotebookMap.get(newBook.isbn);
                return oldBook ?
                    { ...newBook, blockID: oldBook.blockID } :
                    newBook;
            });

            await plugin.saveData("weread_notebooks", [
                ...oldNotebooks.filter(oldBook =>
                    !mergedNotebooks.some(newBook => newBook.isbn === oldBook.isbn)
                ),
                ...mergedNotebooks
            ]);

            personalNotebooks.length = 0;
            personalNotebooks.push(...mergedNotebooks);

            if (personalNotebooks.length == 0) {
                showMessage("微信读书没有新笔记~");
            }
        }
    } else {
        await plugin.saveData("weread_notebooks", personalNotebooks);
    }

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

    const template = await plugin.loadData("weread_templates") || `
# {{notebookTitle}}
**最后同步时间**: {{updateTime}}

## 书评
> 💬 {{globalComments}}

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

    if (newBooksToImport.length > 0) {
        const dialog = svelteDialog({
            title: "新书籍确认",
            constructor: (containerEl: HTMLElement) => {
                return new WereadNewBooks({
                    target: containerEl,
                    props: {
                        books: newBooksToImport,
                        // 添加确认回调
                        onConfirm: async (selectedBooks) => {
                            try {
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
                                            databaseBlockId: ViewID,  // 数据库块ID
                                            noteTemplate: noteTemplate,  // 读书笔记模板
                                            // 补充默认值
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

                                // 重建映射关系
                                const newIsbnBlockMap = new Map();
                                newISBNColumn.forEach(item => {
                                    const isbn = item.number?.content?.toString();
                                    if (isbn) newIsbnBlockMap.set(isbn, item.blockID);
                                });

                                // 更新笔记本数据
                                const updatedNotebooks = personalNotebooks.map(notebook => ({
                                    ...notebook,
                                    blockID: newIsbnBlockMap.get(notebook.isbn?.toString()) || null
                                }));

                                showMessage(`✅ 成功导入 ${selectedBooks.length} 本书籍`, 3000);
                                await syncNotesProcess(updatedNotebooks);
                            } catch (error) {
                                console.error("批量导入失败:", error);
                                showMessage("批量导入失败，请检查控制台日志", 3000);
                            }
                        },
                        onContinue: async () => {
                            try {
                                dialog.close();
                                console.log(enhancedNotebooks);
                                await syncNotesProcess(enhancedNotebooks);
                                if (enhancedNotebooks.length == 0) {
                                    showMessage("微信读书没有新笔记~");
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
        await syncNotesProcess(enhancedNotebooks);
    }

    async function syncNotesProcess(notebooks: any) {
        const updatePromises = notebooks
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
                            .replace(/\{\{globalComments\}\}/g, variables.globalComments || '')
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

        await Promise.all(updatePromises);
    }
}

export async function getPersonalNotebooks(plugin: any, cookies: string) {
    const notebooksinfo = await getNotebooks(plugin, cookies);
    const notebooks = notebooksinfo.books;
    const notebooksList = await Promise.all(
        notebooks.map(async (b: any) => {
            const details = await getBook(plugin, cookies, b.bookId);
            return {
                bookID: details.bookId,
                isbn: details.isbn,
                title: details.title,
                updatedTime: b.sort,
            };
        }),
    );

    const personalNotebooks = await Promise.all(
        notebooksList.map(async (book: any) => {
            const highlights = await getBookHighlights(plugin, cookies, book.bookID);
            const comments = await getBookComments(plugin, cookies, book.bookID);
            return {
                isbn: book.isbn,
                bookID: book.bookID,
                title: book.title,
                updatedTime: book.updatedTime,
                highlights,
                comments,
            };
        })
    );

    return personalNotebooks;
}

export async function updateEndBlocks(plugin: any, blockID: string, wereadPositionMark: string, noteContent: any) {
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