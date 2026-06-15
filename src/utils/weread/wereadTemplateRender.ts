/**
 * 微信读书模板渲染辅助函数
 * 供公众号账号级模板渲染与普通书模板渲染共用
 */

import type { MpAccountTemplateVars } from "./mpArticleSync";

// ========== 类型定义 ==========

export type NoteCommentItem = {
    content: string;
    reviewId?: string;
    createTime?: number;
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

export type NoteContent = {
    formattedNote: string;
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
    _order?: number;
    noteType?: "highlight" | "comment_only";
    chapterUid?: number;
    range?: string;
    rangeStart?: number;
    bookmarkIds?: string[];
    reviewIds?: string[];
    highlightCreateTime?: number;
    latestCommentCreateTime?: number;
    comments?: NoteCommentItem[];
};

/** 扁平化章节项（单一章节模板模式） */
export type FlatChapterItem = {
    chapterUid?: number;
    chapterTitle1: string;
    chapterTitle2: string;
    chapterTitle3: string;
    chapterTitle4: string;
    notes: NoteContent[];
    chapterComments: { reviewId?: string; content: string; createTime?: number; createTime1: string; createTime2: string; createTime3: string; createTime4: string; createTime5: string; createTime6: string; createTime7: string; createTime8: string; createTime9: string; createTime10: string }[];
};

export type TemplateVariables = {
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
    chapters: FlatChapterItem[];
    globalComments: { reviewId?: string; content: string; createTime?: number; createTime1: string; createTime2: string; createTime3: string; createTime4: string; createTime5: string; createTime6: string; createTime7: string; createTime8: string; createTime9: string; createTime10: string }[];
    bookInfo: string;
    bestHighlights: string[];
};

/** 章节层级节点 */
export interface ChapterHierarchyNode {
    chapterUid: number;
    chapterIdx: number;
    title: string;
    level: number;
    children: ChapterHierarchyNode[];
    parentUid: number | null;
}

/** 章节层级结构 */
export interface ChapterHierarchy {
    rootChapters: ChapterHierarchyNode[];
    nodeByUid: Map<number, ChapterHierarchyNode>;
    parentUidByUid: Map<number, number | null>;
}

/**
 * 通用评论模板变量类型（新旧链路共用）
 */
export interface CommonCommentTemplateVars {
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
}

/**
 * 通用 note 模板变量类型（新旧链路共用）
 */
export interface CommonNoteTemplateVars {
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
}

/**
 * 通用评论渲染辅助：处理多行评论内容的缩进对齐
 * @param commentsTpl 评论模板片段（{{#comments}}...{{/comments}} 内部）
 * @param comments 评论数组
 */
export function renderCommentsWithIndent<T extends { content: string; commentCreateTime1?: string; commentCreateTime2?: string; commentCreateTime3?: string; commentCreateTime4?: string; commentCreateTime5?: string; commentCreateTime6?: string; commentCreateTime7?: string; commentCreateTime8?: string; commentCreateTime9?: string; commentCreateTime10?: string }>(
    commentsTpl: string,
    comments: T[]
): string {
    if (!comments || comments.length === 0) return '';
    const contentLineMatch = commentsTpl.match(/^(.*)\{\{content\}\}/m);
    const continuationIndent = contentLineMatch
        ? contentLineMatch[1].replace(/[^\s]/g, ' ')
        : '';
    return comments.map(c => {
        const content = c.content || '';
        const indentedContent = content.includes('\n')
            ? content.split('\n').map((line, idx) => idx === 0 ? line : continuationIndent + line).join('\n')
            : content;
        return commentsTpl
            .replace(/\{\{content\}\}/g, indentedContent)
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
}

/**
 * 渲染 note 条件 section
 * 处理 {{#fieldName}}...{{/fieldName}} 条件块
 * 当 note 上 fieldName 有值（非空）时保留内容，无值时删除整段
 */
export function renderNoteConditionalSections(
    template: string,
    note: Record<string, any>
): string {
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
        result = result.replace(new RegExp(`\\{\\{#${field}\\}\\}([\\s\\S]*?)\\{\\{\\/${field}\\}\\}`, 'g'),
            (_, innerContent) => hasValue ? innerContent : '');
    }
    return result;
}
/**
 * 处理简单条件 section（非数组，单层字段）
 * 例如 {{#fieldName}}...{{/fieldName}}
 * 当值存在（非 null/undefined/空字符串）时保留内容，否则删除整段
 */
export function renderSimpleConditionalSections(
    template: string,
    values: Record<string, any>,
    fields: string[]
): string {
    let result = template;
    for (const field of fields) {
        const regex = new RegExp(`\\{\\{#${field}\\}\\}([\\s\\S]*?)\\{\\{\\/${field}\\}\\}`, 'g');
        result = result.replace(regex, (_, innerContent) => {
            const val = values[field];
            return val != null && val !== '' ? innerContent : '';
        });
    }
    return result;
}
// ========== 时间格式化 Helper（公众号与普通书模板共享） ==========

interface TimeFormat {
    dateSeparator: string;
    timeSeparator: string;
    showSeconds: boolean;
    useChineseUnit: boolean;
    padZero: boolean;
}

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

function normalizeWereadTimeFormatKey(formatKey: string): string {
    if (TIME_FORMATS[formatKey]) return formatKey;

    const aliasMatch = formatKey.match(/^(?:highlight|comment)CreateTime(10|[1-9])$/);
    if (aliasMatch) {
        const normalized = `createTime${aliasMatch[1]}`;
        if (TIME_FORMATS[normalized]) return normalized;
    }

    return 'createTime1';
}

export function formatWereadTimestamp(timestamp: number, formatKey: string = 'createTime1'): string {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp * 1000);
    const normalizedKey = normalizeWereadTimeFormatKey(formatKey);
    const format = TIME_FORMATS[normalizedKey];

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

// 为兼容旧调用，提供 formatTimestamp 别名
export const formatTimestamp = formatWereadTimestamp;

// ========== 章节层级重建 ==========

export function buildChapterHierarchy(chapterInfos: { updated?: Array<{ chapterUid: number; chapterIdx: number; title: string; level: number }> } | null): ChapterHierarchy {
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

        for (let i = stack.length - 1; i >= item.level; i--) {
            stack[i] = null;
        }

        const parentLevel = item.level - 1;
        const parentNode = parentLevel >= 0 && parentLevel < stack.length ? stack[parentLevel] : null;

        if (parentNode) {
            node.parentUid = parentNode.chapterUid;
            parentNode.children.push(node);
            parentUidByUid.set(node.chapterUid, parentNode.chapterUid);
        } else {
            rootChapters.push(node);
            parentUidByUid.set(node.chapterUid, null);
        }

        stack[item.level] = node;
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

export function generateDedupedDisplayChapters(chapters: FlatChapterItem[]): FlatChapterItem[] {
    if (chapters.length === 0) return [];

    const result: FlatChapterItem[] = [];
    let prev: FlatChapterItem | null = null;

    for (const curr of chapters) {
        const displayItem: FlatChapterItem = {
            ...curr,
            chapterComments: [...curr.chapterComments],
            notes: [...curr.notes],
        };

        if (prev) {
            if (prev.chapterTitle1 === curr.chapterTitle1) {
                displayItem.chapterTitle1 = '';

                if (prev.chapterTitle2 === curr.chapterTitle2 && curr.chapterTitle2) {
                    displayItem.chapterTitle2 = '';

                    if (prev.chapterTitle3 === curr.chapterTitle3 && curr.chapterTitle3) {
                        displayItem.chapterTitle3 = '';

                        if (prev.chapterTitle4 === curr.chapterTitle4 && curr.chapterTitle4) {
                            displayItem.chapterTitle4 = '';
                        }
                    }
                }
            }
        }

        result.push(displayItem);
        prev = curr;
    }

    return result;
}

// ========== 笔记模板渲染 ==========

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

export function renderNoteTemplateWithOptionalComment(
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

    template = renderNoteConditionalSections(template, note);

    const lines = template.split('\n');

    const renderedLines = lines
        .map(line => {
            if (!hasComment && line.includes('{{highlightComment}}')) {
                return null;
            }
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

// ========== 分组与分类 ==========

export function groupHighlightsByChapter(highlights: any): Map<number, any[]> {
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

export function classifyComments(comments: any[]): {
    abstractComments: Map<string, any[]>;
    chapterComments: Map<number, any[]>;
} {
    const abstractComments = new Map();
    const chapterComments = new Map();

    comments.forEach((comment: any) => {
        const review = comment.review;
        if (review.range) {
            const key = `${review.chapterUid}_${review.range}`;
            if (!abstractComments.has(key)) {
                abstractComments.set(key, []);
            }
            abstractComments.get(key).push(review);
        } else if (review.chapterUid) {
            if (!chapterComments.has(review.chapterUid)) {
                chapterComments.set(review.chapterUid, []);
            }
            chapterComments.get(review.chapterUid).push(review);
        }
    });

    abstractComments.forEach((reviews) => {
        reviews.sort((a: any, b: any) => (a.createTime || 0) - (b.createTime || 0));
    });

    return { abstractComments, chapterComments };
}

// ========== 普通书模板渲染 ==========

export function buildFlatChapters(
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
                noteType: "highlight",
                chapterUid: highlight.chapterUid,
                range: highlight.range || "",
                rangeStart: parseRangeStart(highlight.range),
                bookmarkIds: [highlight.bookmarkId || highlight.bookmarkID || ""].filter(Boolean),
                reviewIds: linkedComments.map((c: any) => c.reviewId).filter(Boolean),
                highlightCreateTime: highlight.createTime || 0,
                latestCommentCreateTime: commentTime,
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
                    reviewId: c.reviewId || "",
                    createTime: c.createTime || 0,
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
                noteType: "comment_only",
                chapterUid,
                range: rangePart,
                rangeStart: orderFromComment,
                bookmarkIds: [],
                reviewIds: comments.map((c: any) => c.reviewId).filter(Boolean),
                highlightCreateTime: 0,
                latestCommentCreateTime: commentTime,
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
                    reviewId: c.reviewId || "",
                    createTime: c.createTime || 0,
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

    function buildNodeComments(chapterUid: number) {
        const comments = chapterComments.get(chapterUid) || [];
        return comments.map(comment => ({
            reviewId: comment.reviewId || "",
            content: comment.content || '',
            createTime: comment.createTime || 0,
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

    function processNode(
        node: ChapterHierarchyNode,
        path: string[]
    ) {
        const currentPath = [...path, node.title];
        const notes = buildNodeNotes(node.chapterUid, node.title);
        const comments = buildNodeComments(node.chapterUid);

        let title1 = '';
        let title2 = '';
        let title3 = '';
        let title4 = '';

        if (currentPath.length >= 1) title1 = currentPath[0];
        if (currentPath.length >= 2) title2 = currentPath[1];
        if (currentPath.length >= 3) title3 = currentPath[2];
        if (currentPath.length >= 4) {
            const remaining = currentPath.slice(3);
            title4 = remaining.join(' / ');
        }

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

        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                processNode(child, currentPath);
            }
        }
    }

    for (const rootNode of hierarchy.rootChapters) {
        processNode(rootNode, []);
    }

    return result;
}

export function renderWereadTemplate(template: string, variables: TemplateVariables): string {
    return template
        .replace(/\{\{#chapters\}\}([\s\S]*?)\{\{\/chapters\}\}/g, (_, chapterTpl) => {
            if (!variables.chapters || variables.chapters.length === 0) return '';

            const displayChapters = generateDedupedDisplayChapters(variables.chapters);

            return displayChapters.map(flatItem => {
                let itemResult = chapterTpl;

                itemResult = itemResult.replace(/\{\{#chapterTitle\}\}([\s\S]*?)\{\{\/chapterTitle\}\}/g, (_, titleTpl) => {
                    let titleResult = titleTpl;
                    if (flatItem.chapterTitle1) titleResult = titleResult.replace(/\{\{chapterTitle1\}\}/g, flatItem.chapterTitle1);
                    if (flatItem.chapterTitle2) titleResult = titleResult.replace(/\{\{chapterTitle2\}\}/g, flatItem.chapterTitle2);
                    if (flatItem.chapterTitle3) titleResult = titleResult.replace(/\{\{chapterTitle3\}\}/g, flatItem.chapterTitle3);
                    if (flatItem.chapterTitle4) titleResult = titleResult.replace(/\{\{chapterTitle4\}\}/g, flatItem.chapterTitle4);
                    titleResult = titleResult.split('\n').filter(line => !line.match(/\{\{chapterTitle[1-4]\}\}/)).join('\n');
                    return titleResult;
                });

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
        .replace(/\{\{#AISummary\}\}[\s\S]*?\{\{\/AISummary\}\}/g, '')
        .replace(/\{\{#bestHighlights\}\}([\s\S]*?)\{\{\/bestHighlights\}\}/g, (_, section) => {
            return variables.bestHighlights.length > 0
                ? variables.bestHighlights.map(highlight =>
                    section.replace(/\{\{bestHighlight\}\}/g, highlight)
                ).join('\n')
                : '';
        })
        .replace(/\{\{(\w+)\}\}/g, (_, key) => (variables as any)[key] || '');
}

export function buildTemplateVariables(
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
        chapters: chapters,
        globalComments: comments
            .filter(c => !c.review.abstract && !c.review.contextAbstract)
            .map(c => ({
                reviewId: c.review.reviewId || "",
                content: c.review.content,
                createTime: c.review.createTime || 0,
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
        bestHighlights: notebook.bestHighlights?.bestBookMarks?.items?.map((item: any) => item.markText) || []
    };
}

// ========== 公众号账号模板渲染 ==========

export function renderMpAccountArticleTemplate(template: string, article: MpAccountTemplateVars['articles'][0]): string {
    let result = template;

    result = result.replace(/\{\{#notes\}\}([\s\S]*?)\{\{\/notes\}\}/g, (_, noteTpl) => {
        if (!article.notes || article.notes.length === 0) return '';
        return article.notes.map(note => renderMpAccountNoteTemplate(noteTpl, note)).join('\n');
    });

    const articleConditionalFields = [
        'articleTitle',
        'articleCreateTime1', 'articleCreateTime2', 'articleCreateTime3', 'articleCreateTime4', 'articleCreateTime5',
        'articleCreateTime6', 'articleCreateTime7', 'articleCreateTime8', 'articleCreateTime9', 'articleCreateTime10',
        'updateTime1', 'updateTime2', 'updateTime3', 'updateTime4', 'updateTime5',
        'updateTime6', 'updateTime7', 'updateTime8', 'updateTime9', 'updateTime10'
    ];
    result = renderSimpleConditionalSections(result, article as any, articleConditionalFields);

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

export function renderMpAccountNoteTemplate(template: string, note: MpAccountTemplateVars['articles'][0]['notes'][0]): string {
    let result = template;

    result = result.replace(/\{\{#comments\}\}([\s\S]*?)\{\{\/comments\}\}/g, (_, commentTpl) => {
        return renderCommentsWithIndent(commentTpl, note.comments || []);
    });

    result = renderNoteConditionalSections(result, note as any);

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
