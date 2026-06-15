import {
    buildChapterHierarchy,
    buildFlatChapters,
    buildTemplateVariables,
    classifyComments,
    generateDedupedDisplayChapters,
    groupHighlightsByChapter,
    renderNoteTemplateWithOptionalComment,
    renderWereadTemplate,
    type FlatChapterItem,
    type NoteContent,
    type TemplateVariables,
} from "../wereadTemplateRender";
import { hashObject, hashText, normalizeMarkdownForHash } from "./hash";
import { parseBookTemplateSections, removeSectionBlocks } from "./renderTemplateSections";
import type { BookTemplateChapterSection } from "./renderTemplateSections";
import type { WereadRenderItem, WereadRenderItemKind, WereadRenderModel } from "./types";
import { createReadingId } from "../../storage/readingStorage";

export interface EnhancedWereadNotebookLike {
    bookID?: string;
    title: string;
    isbn?: string;
    updatedTime: number;
    bookDetails?: { intro?: string };
    bestHighlights?: { bestBookMarks?: { items?: Array<{ markText: string }> } };
    highlights: any;
    comments?: { reviews?: any[] };
    chapterInfos: { updated?: Array<{ chapterUid: number; chapterIdx: number; title: string; level: number }> } | null;
}

function padOrder(order: number): string {
    return String(order).padStart(8, "0");
}

function parseRangeStart(range: string | undefined): number {
    if (!range) return Number.MAX_SAFE_INTEGER;
    const start = parseInt(range.split("-")[0], 10);
    return isNaN(start) ? Number.MAX_SAFE_INTEGER : start;
}

function renderStaticBookSegment(template: string, variables: TemplateVariables): string {
    const sanitized = removeSectionBlocks(template, [
        "chapters",
        "globalComments",
        "bookInfo",
        "bestHighlights",
        "AISummary",
        "articlesAsc",
        "articlesDesc",
    ]);
    if (!sanitized.trim()) return "";
    return renderWereadTemplate(sanitized, {
        ...variables,
        chapters: [],
        globalComments: [],
        bestHighlights: [],
        bookInfo: "",
    });
}

function renderChapterSegment(template: string, variables: TemplateVariables, chapter: FlatChapterItem): string {
    const sanitized = removeSectionBlocks(template, ["chapterComments"]);
    if (!sanitized.trim()) return "";
    return renderWereadTemplate(`{{#chapters}}${sanitized}{{/chapters}}`, {
        ...variables,
        chapters: [chapter],
    });
}

function renderChapterComment(section: string, comment: FlatChapterItem["chapterComments"][number]): string {
    return section
        .replace(/\{\{chapterComments\}\}/g, comment.content || "")
        .replace(/\{\{createTime1\}\}/g, comment.createTime1 || "")
        .replace(/\{\{createTime2\}\}/g, comment.createTime2 || "")
        .replace(/\{\{createTime3\}\}/g, comment.createTime3 || "")
        .replace(/\{\{createTime4\}\}/g, comment.createTime4 || "")
        .replace(/\{\{createTime5\}\}/g, comment.createTime5 || "")
        .replace(/\{\{createTime6\}\}/g, comment.createTime6 || "")
        .replace(/\{\{createTime7\}\}/g, comment.createTime7 || "")
        .replace(/\{\{createTime8\}\}/g, comment.createTime8 || "")
        .replace(/\{\{createTime9\}\}/g, comment.createTime9 || "")
        .replace(/\{\{createTime10\}\}/g, comment.createTime10 || "");
}

function renderGlobalComment(section: string, comment: TemplateVariables["globalComments"][number]): string {
    return section
        .replace(/\{\{globalComments\}\}/g, comment.content || "")
        .replace(/\{\{createTime1\}\}/g, comment.createTime1 || "")
        .replace(/\{\{createTime2\}\}/g, comment.createTime2 || "")
        .replace(/\{\{createTime3\}\}/g, comment.createTime3 || "")
        .replace(/\{\{createTime4\}\}/g, comment.createTime4 || "")
        .replace(/\{\{createTime5\}\}/g, comment.createTime5 || "")
        .replace(/\{\{createTime6\}\}/g, comment.createTime6 || "")
        .replace(/\{\{createTime7\}\}/g, comment.createTime7 || "")
        .replace(/\{\{createTime8\}\}/g, comment.createTime8 || "")
        .replace(/\{\{createTime9\}\}/g, comment.createTime9 || "")
        .replace(/\{\{createTime10\}\}/g, comment.createTime10 || "");
}

function createItemFactory(sourceKey: string, bookID: string, title: string, sourceType: "book") {
    let order = 0;
    return function createItem(
        itemKind: WereadRenderItemKind,
        itemId: string,
        markdown: string,
        sourceData: any,
        meta: Record<string, any>
    ): WereadRenderItem {
        order++;
        return {
            itemId,
            sourceKey,
            sourceType,
            itemKind,
            markdown,
            sortKey: padOrder(order),
            order,
            sourceHash: hashObject(sourceData),
            renderHash: hashText(normalizeMarkdownForHash(markdown)),
            meta: {
                bookID,
                title,
                ...meta,
            },
        };
    };
}

function getChapterKey(chapter: FlatChapterItem, fallbackOrder: number): string {
    return String(chapter.chapterUid ?? `unknown-${fallbackOrder}`);
}

function getBookNoteItemId(bookID: string, note: NoteContent, fallbackOrder: number): string {
    const chapterUid = note.chapterUid ?? "unknown";
    const range = note.range || `time-${note.latestCommentCreateTime || note.highlightCreateTime || fallbackOrder}-${hashText(note.highlightText || note.highlightComment || "")}`;
    return `book:${bookID}:note:${chapterUid}:${range}`;
}

function assertUniqueRenderItemIds(items: WereadRenderItem[]): void {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.itemId)) {
            throw new Error(
                `微信读书细粒度同步生成了重复的同步单元 ID：${item.itemId}。请检查模板中是否重复放置了相同循环区块。`
            );
        }
        seen.add(item.itemId);
    }
}

function emitChapterItems(
    params: {
        sourceKey: string;
        bookID: string;
        createItem: ReturnType<typeof createItemFactory>;
        chapterSection: BookTemplateChapterSection;
        notesSegmentCount: number;
    },
    variables: TemplateVariables,
    chapter: FlatChapterItem,
    chapterIndex: number
): WereadRenderItem[] {
    const items: WereadRenderItem[] = [];
    const chapterKey = getChapterKey(chapter, chapterIndex);

    for (const seg of params.chapterSection.chapterSegments) {
        switch (seg.type) {
            case "static": {
                const markdown = renderChapterSegment(seg.template, variables, chapter);
                if (markdown.trim()) {
                    items.push(params.createItem("book-chapter", `${params.sourceKey}:chapter:${chapterKey}:static:${seg.index}`, markdown, {
                        chapterUid: chapter.chapterUid,
                        chapterTitle1: chapter.chapterTitle1,
                        chapterTitle2: chapter.chapterTitle2,
                        chapterTitle3: chapter.chapterTitle3,
                        chapterTitle4: chapter.chapterTitle4,
                        templatePart: "static",
                    }, {
                        chapterUid: chapter.chapterUid,
                        chapterTitle1: chapter.chapterTitle1,
                        chapterTitle2: chapter.chapterTitle2,
                        chapterTitle3: chapter.chapterTitle3,
                        chapterTitle4: chapter.chapterTitle4,
                        part: "static",
                        segmentIndex: seg.index,
                    }));
                }
                break;
            }

            case "notes": {
                chapter.notes.forEach((note, noteIndex) => {
                    const markdown = renderNoteTemplateWithOptionalComment(seg.section, note);
                    let itemId = getBookNoteItemId(params.bookID, note, noteIndex);
                    if (params.notesSegmentCount > 1) {
                        itemId = `${itemId}:seg:${seg.index}`;
                    }
                    const range = note.range || "";
                    items.push(params.createItem("book-note", itemId, markdown, {
                        bookID: params.bookID,
                        chapterUid: note.chapterUid,
                        range,
                        rangeStart: note.rangeStart ?? parseRangeStart(range),
                        highlightText: note.highlightText || "",
                        highlightCreateTime: note.highlightCreateTime || 0,
                        bookmarkIds: note.bookmarkIds || [],
                        comments: (note.comments || []).map(comment => ({
                            reviewId: comment.reviewId || "",
                            content: comment.content || "",
                            createTime: comment.createTime || 0,
                        })),
                    }, {
                        chapterUid: note.chapterUid,
                        chapterTitle1: chapter.chapterTitle1,
                        chapterTitle2: chapter.chapterTitle2,
                        chapterTitle3: chapter.chapterTitle3,
                        chapterTitle4: chapter.chapterTitle4,
                        range,
                        rangeStart: note.rangeStart ?? parseRangeStart(range),
                        noteType: note.noteType || "highlight",
                        bookmarkIds: note.bookmarkIds || [],
                        reviewIds: note.reviewIds || [],
                        bookmarkOriginalIds: (note.bookmarkIds || []).map(
                            () => createReadingId("bookmark", [params.bookID, range, note.highlightText, note.highlightCreateTime])
                        ),
                        reviewOriginalIds: (note.comments || []).map(
                            (comment: any) => createReadingId("review", [params.bookID, range, comment.content, comment.createTime])
                        ),
                        highlightCreateTime: note.highlightCreateTime || 0,
                        latestCommentCreateTime: note.latestCommentCreateTime || 0,
                    }));
                });
                break;
            }

            case "chapterComments": {
                chapter.chapterComments.forEach((comment, commentIndex) => {
                    const markdown = renderChapterComment(seg.section, comment);
                    const stablePart = comment.reviewId || `${comment.createTime || 0}:${hashText(comment.content || "")}`;
                    items.push(params.createItem("book-chapter-comment", `${params.sourceKey}:chapter-comment:${chapterKey}:${seg.index}:${stablePart}`, markdown, {
                        chapterUid: chapter.chapterUid,
                        reviewId: comment.reviewId || "",
                        content: comment.content || "",
                        createTime: comment.createTime || 0,
                        order: commentIndex,
                    }, {
                        chapterUid: chapter.chapterUid,
                        reviewId: comment.reviewId || "",
                        createTime: comment.createTime || 0,
                        chapterTitle1: chapter.chapterTitle1,
                        chapterTitle2: chapter.chapterTitle2,
                        chapterTitle3: chapter.chapterTitle3,
                        chapterTitle4: chapter.chapterTitle4,
                    }));
                });
                break;
            }
        }
    }

    return items;
}

export function buildWereadBookRenderModel(params: {
    template: string;
    notebook: EnhancedWereadNotebookLike;
    bookID: string;
    title: string;
}): WereadRenderModel {
    const sections = parseBookTemplateSections(params.template);
    const notebook = params.notebook;
    const comments = notebook.comments?.reviews || [];
    const highlights = notebook.highlights;
    const highlightsByChapter = groupHighlightsByChapter(highlights);
    const { abstractComments, chapterComments } = classifyComments(comments);
    const hierarchy = buildChapterHierarchy(notebook.chapterInfos);
    const chapters = hierarchy.rootChapters.length > 0
        ? buildFlatChapters(
            hierarchy,
            highlightsByChapter,
            chapterComments,
            abstractComments,
            sections.chapterSection.noteSection,
            notebook.title
        )
        : [];
    const displayChapters = generateDedupedDisplayChapters(chapters);
    const variables = buildTemplateVariables(notebook, comments, displayChapters);
    const sourceKey = `book:${params.bookID}`;
    const createItem = createItemFactory(sourceKey, params.bookID, params.title, "book");
    const items: WereadRenderItem[] = [];
    const notesSegmentCount = sections.chapterSection.chapterSegments.filter(s => s.type === "notes").length;

    for (const segment of sections.segments) {
        switch (segment.type) {
            case "static": {
                const markdown = renderStaticBookSegment(segment.template, variables);
                if (markdown.trim()) {
                    items.push(createItem("book-meta", `${sourceKey}:meta:static:${segment.index}`, markdown, {
                        templatePart: "static",
                        templateHash: hashText(segment.template),
                    }, { part: "static", segmentIndex: segment.index }));
                }
                break;
            }

            case "chapters": {
                const chapterParams = {
                    sourceKey,
                    bookID: params.bookID,
                    createItem,
                    chapterSection: segment.section,
                    notesSegmentCount,
                };
                displayChapters.forEach((chapter, chapterIndex) => {
                    items.push(...emitChapterItems(chapterParams, variables, chapter, chapterIndex));
                });
                break;
            }

            case "globalComments": {
                if (sections.globalCommentsSection) {
                    variables.globalComments.forEach((comment, index) => {
                        const markdown = renderGlobalComment(segment.section, comment);
                        const stablePart = comment.reviewId || `${comment.createTime || 0}:${hashText(comment.content || "")}`;
                        items.push(createItem("book-global-comment", `${sourceKey}:global-comment:${segment.index}:${stablePart}`, markdown, {
                            reviewId: comment.reviewId || "",
                            content: comment.content || "",
                            createTime: comment.createTime || 0,
                            order: index,
                        }, {
                            reviewId: comment.reviewId || "",
                            createTime: comment.createTime || 0,
                        }));
                    });
                }
                break;
            }

            case "bookInfo": {
                if (sections.bookInfoSection && variables.bookInfo) {
                    const markdown = segment.section.replace(/\{\{bookInfo\}\}/g, variables.bookInfo);
                    items.push(createItem("book-info", `${sourceKey}:book-info:${segment.index}`, markdown, {
                        intro: variables.bookInfo,
                    }, { part: "bookInfo" }));
                }
                break;
            }

            case "bestHighlights": {
                if (sections.bestHighlightsSection && variables.bestHighlights.length > 0) {
                    variables.bestHighlights.forEach((highlight, index) => {
                        const markdown = segment.section.replace(/\{\{bestHighlight\}\}/g, highlight);
                        items.push(createItem("book-best-highlight", `${sourceKey}:best-highlight:${segment.index}:${index}:${hashText(highlight)}`, markdown, {
                            index,
                            markText: highlight,
                        }, { index }));
                    });
                }
                break;
            }

            case "AISummary":
                break;
        }
    }

    assertUniqueRenderItemIds(items);

    return {
        sourceKey,
        sourceType: "book",
        bookID: params.bookID,
        title: params.title,
        updatedTime: notebook.updatedTime || 0,
        templateHash: hashText(params.template),
        items,
        stats: {
            noteCount: displayChapters.reduce((sum, chapter) => sum + chapter.notes.length, 0),
            highlightCount: Array.isArray(highlights?.updated) ? highlights.updated.length : 0,
            reviewCount: comments.length,
            chapterCount: displayChapters.length,
        },
    };
}

export function renderModelToMarkdown(model: WereadRenderModel): string {
    return model.items
        .map(item => item.markdown)
        .filter(markdown => markdown.trim().length > 0)
        .join("\n");
}

