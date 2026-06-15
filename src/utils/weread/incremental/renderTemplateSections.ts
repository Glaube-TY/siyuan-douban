export interface TemplateSectionMatch {
    name: string;
    raw: string;
    inner: string;
    start: number;
    end: number;
}

export type BookTemplateSegment =
    | { type: "static"; template: string; index: number }
    | { type: "chapters"; section: BookTemplateChapterSection; index: number }
    | { type: "globalComments"; section: string; index: number }
    | { type: "bookInfo"; section: string; index: number }
    | { type: "bestHighlights"; section: string; index: number }
    | { type: "AISummary"; section: string; index: number };

export type BookChapterTemplateSegment =
    | { type: "static"; template: string; index: number }
    | { type: "notes"; section: string; index: number }
    | { type: "chapterComments"; section: string; index: number };

export interface BookTemplateChapterSection {
    chapterSection: string;
    chapterBeforeNotes: string;
    noteSection: string;
    chapterAfterNotes: string;
    chapterTitleSection?: string;
    chapterCommentsSection?: string;
    chapterSegments: BookChapterTemplateSegment[];
}

export interface BookTemplateSegments {
    segments: BookTemplateSegment[];
    chapterSection: BookTemplateChapterSection;
    globalCommentsSection?: string;
    bookInfoSection?: string;
    bestHighlightsSection?: string;
}

export interface MpTemplateArticleSection {
    name: "articlesAsc" | "articlesDesc";
    articleSort: "asc" | "desc";
    articleSection: string;
    articleBeforeNotes: string;
    noteSection: string;
    articleAfterNotes: string;
    start: number;
    end: number;
}

export type MpTemplateSegment =
    | { type: "static"; template: string; index: number }
    | { type: "articles"; section: MpTemplateArticleSection; index: number };

export interface MpTemplateSections {
    topBeforeArticles: string;
    topAfterArticles: string;
    articleSections: MpTemplateArticleSection[];
    segments: MpTemplateSegment[];
}

export function findFirstSection(template: string, name: string): TemplateSectionMatch | null {
    const pattern = new RegExp(`\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{\\/${name}\\}\\}`);
    const match = pattern.exec(template);
    if (!match || match.index === undefined) return null;
    return {
        name,
        raw: match[0],
        inner: match[1],
        start: match.index,
        end: match.index + match[0].length,
    };
}

export function findAllSections(template: string, names: string[]): TemplateSectionMatch[] {
    if (names.length === 0) return [];
    const pattern = new RegExp(`\\{\\{#(${names.join("|")})\\}\\}([\\s\\S]*?)\\{\\{\\/\\1\\}\\}`, "g");
    const result: TemplateSectionMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
        result.push({
            name: match[1],
            raw: match[0],
            inner: match[2],
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    return result.sort((a, b) => a.start - b.start);
}

export function removeSectionBlocks(template: string, names: string[]): string {
    let result = template;
    for (const name of names) {
        result = result.replace(new RegExp(`\\{\\{#${name}\\}\\}[\\s\\S]*?\\{\\{\\/${name}\\}\\}`, "g"), "");
    }
    return result;
}

export function parseBookTemplateSections(template: string): BookTemplateSegments {
    const chapters = findFirstSection(template, "chapters");
    if (!chapters) {
        throw new Error("当前微信读书增量同步要求普通书模板包含 {{#chapters}}...{{/chapters}}。");
    }

    const notes = findFirstSection(chapters.inner, "notes");
    if (!notes) {
        throw new Error("当前微信读书增量同步要求普通书模板包含 {{#notes}}...{{/notes}}。");
    }

    const chapterTitleSection = findFirstSection(chapters.inner, "chapterTitle")?.inner;
    const chapterCommentsSection = findFirstSection(chapters.inner, "chapterComments")?.inner;

    const innerSections = findAllSections(chapters.inner, ["notes", "chapterComments"]);
    const chapterSegments: BookChapterTemplateSegment[] = [];
    let innerCursor = 0;
    let chSegIndex = 0;

    for (const sec of innerSections) {
        const staticTemplate = chapters.inner.slice(innerCursor, sec.start);
        if (staticTemplate.trim()) {
            chapterSegments.push({ type: "static", template: staticTemplate, index: chSegIndex++ });
        }

        switch (sec.name) {
            case "notes":
                chapterSegments.push({ type: "notes", section: sec.inner, index: chSegIndex++ });
                break;
            case "chapterComments":
                if (sec.inner) chapterSegments.push({ type: "chapterComments", section: sec.inner, index: chSegIndex++ });
                break;
        }

        innerCursor = sec.end;
    }

    const innerTrailing = chapters.inner.slice(innerCursor);
    if (innerTrailing.trim()) {
        chapterSegments.push({ type: "static", template: innerTrailing, index: chSegIndex });
    }

    const chapterSection: BookTemplateChapterSection = {
        chapterSection: chapters.inner,
        chapterBeforeNotes: chapters.inner.slice(0, notes.start),
        noteSection: notes.inner,
        chapterAfterNotes: chapters.inner.slice(notes.end),
        chapterTitleSection,
        chapterCommentsSection,
        chapterSegments,
    };

    const globalCommentsSection = findFirstSection(template, "globalComments")?.inner;
    const bookInfoSection = findFirstSection(template, "bookInfo")?.inner;
    const bestHighlightsSection = findFirstSection(template, "bestHighlights")?.inner;

    const topSections = findAllSections(template, ["chapters", "globalComments", "bookInfo", "bestHighlights", "AISummary"]);

    const segments: BookTemplateSegment[] = [];
    let cursor = 0;
    let segIndex = 0;

    for (const sec of topSections) {
        const staticTemplate = template.slice(cursor, sec.start);
        if (staticTemplate.trim()) {
            segments.push({ type: "static", template: staticTemplate, index: segIndex++ });
        }

        switch (sec.name) {
            case "chapters":
                segments.push({ type: "chapters", section: chapterSection, index: segIndex++ });
                break;
            case "globalComments":
                if (sec.inner) segments.push({ type: "globalComments", section: sec.inner, index: segIndex++ });
                break;
            case "bookInfo":
                if (sec.inner) segments.push({ type: "bookInfo", section: sec.inner, index: segIndex++ });
                break;
            case "bestHighlights":
                if (sec.inner) segments.push({ type: "bestHighlights", section: sec.inner, index: segIndex++ });
                break;
            case "AISummary":
                segments.push({ type: "AISummary", section: sec.inner, index: segIndex++ });
                break;
        }

        cursor = sec.end;
    }

    const trailing = template.slice(cursor);
    if (trailing.trim()) {
        segments.push({ type: "static", template: trailing, index: segIndex });
    }

    return {
        segments,
        chapterSection,
        globalCommentsSection,
        bookInfoSection,
        bestHighlightsSection,
    };
}

export function parseMpTemplateSections(template: string): MpTemplateSections {
    const articleMatches = findAllSections(template, ["articlesAsc", "articlesDesc"]);
    if (articleMatches.length === 0) {
        throw new Error("当前微信读书增量同步要求公众号模板包含 {{#articlesAsc}} 或 {{#articlesDesc}}，并在文章模板中包含 {{#notes}}。");
    }

    const articleSections = articleMatches.map((match): MpTemplateArticleSection => {
        const notes = findFirstSection(match.inner, "notes");
        if (!notes) {
            throw new Error("当前微信读书增量同步要求公众号模板包含 {{#articlesAsc}} 或 {{#articlesDesc}}，并在文章模板中包含 {{#notes}}。");
        }

        return {
            name: match.name as "articlesAsc" | "articlesDesc",
            articleSort: match.name === "articlesAsc" ? "asc" : "desc",
            articleSection: match.inner,
            articleBeforeNotes: match.inner.slice(0, notes.start),
            noteSection: notes.inner,
            articleAfterNotes: match.inner.slice(notes.end),
            start: match.start,
            end: match.end,
        };
    });

    const segments: MpTemplateSegment[] = [];
    let cursor = 0;
    let index = 0;
    for (const section of articleSections) {
        const staticTemplate = template.slice(cursor, section.start);
        if (staticTemplate) {
            segments.push({ type: "static", template: staticTemplate, index: index++ });
        }
        segments.push({ type: "articles", section, index: index++ });
        cursor = section.end;
    }

    const trailing = template.slice(cursor);
    if (trailing) {
        segments.push({ type: "static", template: trailing, index });
    }

    return {
        topBeforeArticles: template.slice(0, articleSections[0].start),
        topAfterArticles: template.slice(articleSections[articleSections.length - 1].end),
        articleSections,
        segments,
    };
}

