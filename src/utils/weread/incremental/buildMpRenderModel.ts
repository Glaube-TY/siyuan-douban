import {
    buildMpAccountTemplateVariables,
    type MpAccountTemplateVars,
    type MpArticleSyncUnit,
} from "../mpArticleSync";
import {
    renderMpAccountArticleTemplate,
    renderMpAccountNoteTemplate,
    renderSimpleConditionalSections,
} from "../wereadTemplateRender";
import { hashObject, hashText, normalizeMarkdownForHash } from "./hash";
import { parseMpTemplateSections, type MpTemplateArticleSection } from "./renderTemplateSections";
import type { WereadRenderItem, WereadRenderItemKind, WereadRenderModel } from "./types";
import { createReadingId } from "../../storage/readingStorage";

export interface WereadApiMpAccountSyncDataLike {
    rawBookID: string;
    accountInfo: {
        rawBookID?: string;
        accountTitle: string;
        accountIntro: string;
        accountCover: string;
        updateTime: number;
    };
    articleUnits: MpArticleSyncUnit[];
    articleCount: number;
    noteCount: number;
}

type ArticlePair = {
    unit: MpArticleSyncUnit;
    vars: MpAccountTemplateVars["articles"][number];
};

function padOrder(order: number): string {
    return String(order).padStart(8, "0");
}

function renderStaticMpSegment(template: string, variables: MpAccountTemplateVars): string {
    if (!template.trim()) return "";
    const topLevelConditionalFields = [
        "accountTitle",
        "accountIntro",
        "accountCover",
        "updateTime1", "updateTime2", "updateTime3", "updateTime4", "updateTime5",
        "updateTime6", "updateTime7", "updateTime8", "updateTime9", "updateTime10",
        "latestArticleTitle",
        "latestArticleTime1", "latestArticleTime2", "latestArticleTime3", "latestArticleTime4", "latestArticleTime5",
        "latestArticleTime6", "latestArticleTime7", "latestArticleTime8", "latestArticleTime9", "latestArticleTime10",
    ];
    return renderSimpleConditionalSections(template, variables as any, topLevelConditionalFields)
        .replace(/\{\{accountTitle\}\}/g, variables.accountTitle)
        .replace(/\{\{accountIntro\}\}/g, variables.accountIntro)
        .replace(/\{\{accountCover\}\}/g, variables.accountCover)
        .replace(/\{\{updateTime1\}\}/g, variables.updateTime1 || "")
        .replace(/\{\{updateTime2\}\}/g, variables.updateTime2 || "")
        .replace(/\{\{updateTime3\}\}/g, variables.updateTime3 || "")
        .replace(/\{\{updateTime4\}\}/g, variables.updateTime4 || "")
        .replace(/\{\{updateTime5\}\}/g, variables.updateTime5 || "")
        .replace(/\{\{updateTime6\}\}/g, variables.updateTime6 || "")
        .replace(/\{\{updateTime7\}\}/g, variables.updateTime7 || "")
        .replace(/\{\{updateTime8\}\}/g, variables.updateTime8 || "")
        .replace(/\{\{updateTime9\}\}/g, variables.updateTime9 || "")
        .replace(/\{\{updateTime10\}\}/g, variables.updateTime10 || "")
        .replace(/\{\{articleCount\}\}/g, String(variables.articleCount))
        .replace(/\{\{latestArticleTitle\}\}/g, variables.latestArticleTitle)
        .replace(/\{\{latestArticleTime1\}\}/g, variables.latestArticleTime1 || "")
        .replace(/\{\{latestArticleTime2\}\}/g, variables.latestArticleTime2 || "")
        .replace(/\{\{latestArticleTime3\}\}/g, variables.latestArticleTime3 || "")
        .replace(/\{\{latestArticleTime4\}\}/g, variables.latestArticleTime4 || "")
        .replace(/\{\{latestArticleTime5\}\}/g, variables.latestArticleTime5 || "")
        .replace(/\{\{latestArticleTime6\}\}/g, variables.latestArticleTime6 || "")
        .replace(/\{\{latestArticleTime7\}\}/g, variables.latestArticleTime7 || "")
        .replace(/\{\{latestArticleTime8\}\}/g, variables.latestArticleTime8 || "")
        .replace(/\{\{latestArticleTime9\}\}/g, variables.latestArticleTime9 || "")
        .replace(/\{\{latestArticleTime10\}\}/g, variables.latestArticleTime10 || "")
        .replace(/\{\{#chapters\}\}[\s\S]*?\{\{\/chapters\}\}/g, "")
        .replace(/\{\{#globalComments\}\}[\s\S]*?\{\{\/globalComments\}\}/g, "")
        .replace(/\{\{#bookInfo\}\}[\s\S]*?\{\{\/bookInfo\}\}/g, "")
        .replace(/\{\{#bestHighlights\}\}[\s\S]*?\{\{\/bestHighlights\}\}/g, "");
}

function createItemFactory(sourceKey: string, bookID: string, title: string, sourceType: "mp") {
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
                accountBookID: bookID,
                accountTitle: title,
                ...meta,
            },
        };
    };
}

function getSortedPairs(section: MpTemplateArticleSection, pairs: ArticlePair[]): ArticlePair[] {
    return [...pairs].sort((a, b) => {
        const aTime = a.vars.__sortUpdateTime || 0;
        const bTime = b.vars.__sortUpdateTime || 0;
        return section.articleSort === "asc" ? aTime - bTime : bTime - aTime;
    });
}

function getMpNoteItemId(params: {
    sourceKey: string;
    namespace: string;
    articleID: string;
    range: string;
    createTime: number;
    text: string;
    segmentIndex?: number;
}): string {
    const segPart = params.segmentIndex != null ? `seg:${params.segmentIndex}:` : "";
    const prefix = `${params.sourceKey}:${segPart}${params.namespace}article:${params.articleID}:note`;
    if (params.range) return `${prefix}:${params.range}`;
    return `${prefix}:${params.createTime}:${hashText(params.text)}`;
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

export function buildWereadMpRenderModel(params: {
    template: string;
    syncData: WereadApiMpAccountSyncDataLike;
    bookID: string;
    title: string;
}): WereadRenderModel {
    const sections = parseMpTemplateSections(params.template);
    const variables = buildMpAccountTemplateVariables(
        params.syncData.rawBookID,
        params.syncData.accountInfo,
        params.syncData.articleUnits,
        params.syncData.accountInfo.updateTime
    );
    const articlePairs: ArticlePair[] = params.syncData.articleUnits.map((unit, index) => ({
        unit,
        vars: variables.articles[index],
    })).filter(pair => !!pair.vars);

    const sourceKey = `mp:${params.bookID}`;
    const createItem = createItemFactory(sourceKey, params.bookID, params.title, "mp");
    const useNamespace = sections.articleSections.length > 1;
    const items: WereadRenderItem[] = [];

    for (const segment of sections.segments) {
        if (segment.type === "static") {
            const markdown = renderStaticMpSegment(segment.template, variables);
            if (markdown.trim()) {
                items.push(createItem("mp-account-meta", `${sourceKey}:account-meta:${segment.index}`, markdown, {
                    templatePart: "accountStatic",
                    templateHash: hashText(segment.template),
                }, { part: "accountStatic", segmentIndex: segment.index }));
            }
            continue;
        }

        const namespace = useNamespace ? `${segment.section.name}:` : "";
        for (const pair of getSortedPairs(segment.section, articlePairs)) {
            const articleItemId = `${sourceKey}:article-seg:${segment.index}:${namespace}article:${pair.unit.articleID}`;
            const articleHeader = renderMpAccountArticleTemplate(segment.section.articleBeforeNotes, pair.vars);
            if (articleHeader.trim()) {
                items.push(createItem("mp-article", articleItemId, articleHeader, {
                    articleID: pair.unit.articleID,
                    articleTitle: pair.unit.articleTitle,
                    articleCreateTime: pair.unit.articleCreateTime,
                    updatedTime: pair.unit.updatedTime,
                    noteCount: pair.unit.notes.length,
                    templatePart: "articleBeforeNotes",
                    namespace,
                }, {
                    articleID: pair.unit.articleID,
                    articleTitle: pair.unit.articleTitle,
                    articleCreateTime: pair.unit.articleCreateTime,
                    updatedTime: pair.unit.updatedTime,
                    noteCount: pair.unit.notes.length,
                    part: "articleBeforeNotes",
                    articleSort: segment.section.articleSort,
                }));
            }

            pair.unit.notes.forEach((note, noteIndex) => {
                const noteVars = pair.vars.notes[noteIndex];
                if (!noteVars) return;
                const markdown = renderMpAccountNoteTemplate(segment.section.noteSection, noteVars);
                const itemId = getMpNoteItemId({
                    sourceKey,
                    namespace,
                    articleID: pair.unit.articleID,
                    range: note.range,
                    createTime: note.createTime || note.latestCommentCreateTime || 0,
                    text: `${note.highlightText || ""}${note.highlightComment || ""}`,
                    segmentIndex: segment.index,
                });
                items.push(createItem("mp-note", itemId, markdown, {
                    accountBookID: params.bookID,
                    articleID: pair.unit.articleID,
                    range: note.range,
                    rangeStart: note.rangeStart,
                    highlightText: note.highlightText,
                    highlightCreateTime: note.highlightCreateTime,
                    bookmarkIds: note.bookmarkIds || [],
                    comments: note.comments.map(comment => ({
                        reviewId: comment.reviewId || "",
                        content: comment.content || "",
                        createTime: comment.createTime || 0,
                    })),
                    namespace,
                }, {
                    accountBookID: params.bookID,
                    accountTitle: params.title,
                    articleID: pair.unit.articleID,
                    articleTitle: pair.unit.articleTitle,
                    articleCreateTime: pair.unit.articleCreateTime,
                    range: note.range,
                    rangeStart: note.rangeStart,
                    noteType: note.noteType,
                    bookmarkIds: note.bookmarkIds || [],
                    reviewIds: note.comments.map(comment => comment.reviewId).filter(Boolean),
                    bookmarkOriginalIds: (note.bookmarkIds || []).map(
                        () => createReadingId("mp_bookmark", [pair.unit.articleID, note.range, note.highlightText, note.createTime])
                    ),
                    reviewOriginalIds: note.comments.map(
                        (comment: any) => createReadingId("mp_review", [pair.unit.articleID, note.range, comment.content, comment.createTime])
                    ),
                    highlightCreateTime: note.highlightCreateTime,
                    latestCommentCreateTime: note.latestCommentCreateTime,
                    articleSort: segment.section.articleSort,
                }));
            });

            const articleFooter = renderMpAccountArticleTemplate(segment.section.articleAfterNotes, pair.vars);
            if (articleFooter.trim()) {
                items.push(createItem("mp-article", `${articleItemId}:footer`, articleFooter, {
                    articleID: pair.unit.articleID,
                    updatedTime: pair.unit.updatedTime,
                    templatePart: "articleAfterNotes",
                    templateHash: hashText(segment.section.articleAfterNotes),
                    namespace,
                }, {
                    articleID: pair.unit.articleID,
                    part: "articleAfterNotes",
                    articleSort: segment.section.articleSort,
                }));
            }
        }
    }

    assertUniqueRenderItemIds(items);

    return {
        sourceKey,
        sourceType: "mp",
        bookID: params.bookID,
        title: params.title,
        updatedTime: params.syncData.accountInfo.updateTime || 0,
        templateHash: hashText(params.template),
        items,
        stats: {
            noteCount: params.syncData.noteCount,
            highlightCount: params.syncData.articleUnits.reduce((sum, unit) =>
                sum + unit.notes.filter(note => note.noteType === "highlight").length, 0),
            reviewCount: params.syncData.articleUnits.reduce((sum, unit) =>
                sum + unit.notes.reduce((noteSum, note) => noteSum + note.comments.length, 0), 0),
            chapterCount: 0,
            articleCount: params.syncData.articleCount,
        },
    };
}
