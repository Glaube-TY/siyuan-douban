import { showMessage } from "siyuan";
import { sql } from "../../api";
import { loadLocalBookShelfBooks } from "../bookHandling/loadLocalBookShelfBooks";
import { logError } from "../core/logger";
import { createLocalBookShelfDialog } from "../weread/wereadDialogs";
import { openDoc } from "../openDoc";
import { loadDatabaseSettings } from "../settings/databaseSettingsService";
import type { WorkbenchDatabaseStatus, WorkbenchSearchResult } from "../../types/workbench";
import { t } from "../i18n";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n?: any;
    app?: any;
    isMobile?: boolean;
};

type MatchWeights = {
    exact: number;
    startsWith?: number;
    contains: number;
};

interface LocalBookScore {
    score: number;
    matchPercent: number;
}

const MATCH_SCORE_REFERENCE = 1000;
const NOTE_MATCH_SCORE = 80;
const LOCAL_SEARCH_TEXT_FALLBACK_SCORE = 60;
const TITLE_MATCH_SCORES: MatchWeights = { exact: MATCH_SCORE_REFERENCE, startsWith: 880, contains: 800 };
const DEFAULT_FIELD_MATCH_SCORES: MatchWeights = { exact: 140, contains: 90 };
const FIELD_MATCH_SCORES: Record<string, MatchWeights> = {
    ISBN: { exact: 700, contains: 500 },
    "副标题": { exact: 650, startsWith: 560, contains: 500 },
    "原作名": { exact: 650, startsWith: 560, contains: 500 },
    "作者": { exact: 620, startsWith: 520, contains: 450 },
    "译者": { exact: 430, contains: 320 },
    "出版社": { exact: 300, contains: 220 },
    "出品方": { exact: 300, contains: 220 },
    "丛书": { exact: 300, contains: 220 },
    "书籍分类": { exact: 250, contains: 180 },
    "阅读状态": { exact: 200, contains: 140 },
    "书籍简介": { exact: 240, contains: 180 },
    "作者介绍": { exact: 200, contains: 150 },
};

export interface LocalBookSearchState {
    databaseStatus: WorkbenchDatabaseStatus;
    books: any[];
}

function quoteSqlText(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function normalizeSearchText(value: unknown): string {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getTextMatchScore(value: unknown, keyword: string, weights: MatchWeights): number {
    const normalizedValue = normalizeSearchText(value);
    if (!normalizedValue || !keyword || !normalizedValue.includes(keyword)) return 0;
    if (normalizedValue === keyword) return weights.exact;
    if (weights.startsWith !== undefined && normalizedValue.startsWith(keyword)) return weights.startsWith;
    return weights.contains;
}

function getFieldMatchScore(fieldName: string, value: unknown, keyword: string): number {
    return getTextMatchScore(value, keyword, FIELD_MATCH_SCORES[fieldName] || DEFAULT_FIELD_MATCH_SCORES);
}

function scoreLocalBook(book: any, normalizedKeyword: string, noteMatched: boolean): LocalBookScore {
    const titleScore = getTextMatchScore(book.title, normalizedKeyword, TITLE_MATCH_SCORES);
    let score = titleScore;
    const fields = book.localSearchFields && typeof book.localSearchFields === "object"
        ? book.localSearchFields as Record<string, unknown>
        : {};
    const hasSearchFields = Object.keys(fields).length > 0;

    for (const [fieldName, value] of Object.entries(fields)) {
        if (fieldName !== "书名") score += getFieldMatchScore(fieldName, value, normalizedKeyword);
    }

    if (!normalizeSearchText(fields["作者"])) {
        score += getFieldMatchScore("作者", book.author, normalizedKeyword);
    }

    if (!hasSearchFields && score === 0 && normalizeSearchText(book.localSearchText).includes(normalizedKeyword)) {
        score += LOCAL_SEARCH_TEXT_FALLBACK_SCORE;
    }

    if (noteMatched) score += NOTE_MATCH_SCORE;
    return {
        score,
        matchPercent: titleScore === TITLE_MATCH_SCORES.exact
            ? 100
            : Math.min(99, Math.max(1, Math.round(score / MATCH_SCORE_REFERENCE * 100))),
    };
}

async function findMatchingNoteDocumentIDs(books: any[], keyword: string): Promise<Set<string>> {
    const documentIDs = Array.from(new Set(
        books.map((book) => String(book.localDocBlockID || "").trim()).filter(Boolean),
    ));
    const matches = new Set<string>();
    if (documentIDs.length === 0) return matches;

    const escapedKeyword = quoteSqlText(keyword);
    try {
        for (let start = 0; start < documentIDs.length; start += 100) {
            const idList = documentIDs.slice(start, start + 100).map(quoteSqlText).join(",");
            const rows = await sql(`
                SELECT DISTINCT root_id
                FROM blocks
                WHERE root_id IN (${idList})
                  AND (
                    instr(lower(COALESCE(content, '')), lower(${escapedKeyword})) > 0
                    OR instr(lower(COALESCE(markdown, '')), lower(${escapedKeyword})) > 0
                  )
            `);
            for (const row of rows || []) {
                const rootID = String(row?.root_id || "").trim();
                if (rootID) matches.add(rootID);
            }
        }
    } catch (error) {
        logError("bookSearch/localBookSearch", "笔记正文搜索失败", error);
    }
    return matches;
}

function toResult(book: any, plugin: PluginLike, score?: LocalBookScore): WorkbenchSearchResult {
    return {
        id: book.blockID || book.localDocBlockID || book.isbn || book.title,
        source: "local",
        title: book.title || t(plugin, "statsUnnamedBook", "未命名书籍"),
        author: book.author,
        isbn: book.isbn,
        cover: book.cover,
        noteDocId: book.localDocBlockID,
        description: [book.category, book.readingStatus].filter(Boolean).join(" / "),
        ...(score ? { matchScore: score.score, matchPercent: score.matchPercent } : {}),
        raw: book,
    };
}

export async function loadLocalBookSearchState(plugin: PluginLike): Promise<LocalBookSearchState> {
    const databaseStatus = await loadDatabaseSettings(plugin);
    if (!databaseStatus.valid || !databaseStatus.avID) {
        return { databaseStatus, books: [] };
    }

    try {
        return {
            databaseStatus,
            books: await loadLocalBookShelfBooks(databaseStatus.avID),
        };
    } catch (error: any) {
        return {
            databaseStatus: {
                ...databaseStatus,
                valid: false,
                message: error?.message || t(plugin, "localShelfReadFailed", "本地书架读取失败"),
            },
            books: [],
        };
    }
}

export async function searchLocalBooks(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const { books } = await loadLocalBookSearchState(plugin);
    const keyword = normalizeSearchText(query);
    if (!keyword) return books.slice(0, 12).map((book) => toResult(book, plugin));

    const noteDocumentIDs = await findMatchingNoteDocumentIDs(books, keyword);
    return books
        .map((book, index) => {
            const noteMatch = noteDocumentIDs.has(String(book.localDocBlockID || "").trim());
            const score = scoreLocalBook(book, keyword, noteMatch);
            return {
                book,
                index,
                score,
            };
        })
        .filter((item) => item.score.score > 0)
        .sort((a, b) => b.score.score - a.score.score || a.index - b.index)
        .slice(0, 20)
        .map((item) => toResult(item.book, plugin, item.score));
}

export async function openLocalBookShelf(plugin: PluginLike): Promise<number> {
    const { databaseStatus, books } = await loadLocalBookSearchState(plugin);
    if (!databaseStatus.valid || !databaseStatus.avID) {
        showMessage(databaseStatus.message || t(plugin, "localConfigureDatabase", "请先配置本地书籍数据库"));
        return 0;
    }
    if (books.length === 0) {
        showMessage(plugin.i18n?.localBookShelfEmpty || "本地书架暂无书籍");
        return 0;
    }
    createLocalBookShelfDialog(plugin, books)();
    return books.length;
}

export function openLocalBookResult(plugin: PluginLike, result: WorkbenchSearchResult): boolean {
    if (!result.noteDocId) {
        showMessage(t(plugin, "localNoOpenNote", "该书籍暂无可打开的本地笔记文档"));
        return false;
    }
    openDoc(plugin, result.noteDocId, 1);
    return true;
}
