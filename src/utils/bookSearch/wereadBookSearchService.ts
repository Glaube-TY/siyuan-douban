import { showMessage } from "siyuan";
import { attachWereadApiLocalNoteDocs } from "../weread/api/findWereadApiBookTargetDoc";
import { createNotebooksDialog, createWereadReadingStatsDialog } from "../weread/wereadDialogs";
import { countNotebookNotes, safeLoadNotebookCache, safeLoadReadingStatsCache } from "../readingCenter/readingCenterData";
import { openDoc } from "../openDoc";
import type { WorkbenchSearchResult } from "../../types/workbench";
import { t } from "../i18n";

const WEREAD_SHELF_CACHE_KEY = "weread_api_bookshelf_cache";
const WEREAD_NOTEBOOK_CACHE_KEY = "temporary_weread_notebooksList";
const WEREAD_SEARCH_RESULT_LIMIT = 20;

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n: any;
};

function toResult(book: any, plugin: PluginLike): WorkbenchSearchResult {
    const hasNotes = book.hasWereadNotes === true;
    const inShelf = book.inWereadShelf === true;
    const noteCount = hasNotes
        ? countNotebookNotes([book])
        : book.totalNoteCount ?? book.noteCount ?? 0;
    const description = hasNotes && inShelf
        ? t(plugin, "searchWereadShelfNotes", "书架 · {count} 条笔记", { count: noteCount })
        : hasNotes
            ? t(plugin, "searchWereadNotes", "有 {count} 条笔记", { count: noteCount })
            : inShelf
                ? t(plugin, "searchWereadShelf", "微信读书书架")
                : t(plugin, "wereadNoteCount", "{count} 条笔记", { count: noteCount });
    const bookID = getBookID(book);
    const identityKey = getBookKey(book);
    return {
        id: bookID || identityKey || getStableResultFallbackId(book),
        source: "weread",
        title: book.title || book.name || t(plugin, "wereadUnnamedBook", "未命名微信读书书籍"),
        author: book.author,
        isbn: book.isbn || book.ISBN,
        cover: book.cover,
        bookID: bookID || undefined,
        noteDocId: book.localDocBlockID || book.noteDocId || book.localDocId,
        description,
        raw: book,
    };
}

function hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && (typeof value !== "string" || value.trim().length > 0);
}

function getBookID(book: any): string {
    return String(book?.bookID || book?.bookId || "").trim();
}

function getBookTitle(book: any): string {
    return String(book?.title || book?.name || "").trim();
}

function getFallbackKey(book: any): string {
    const title = getBookTitle(book).toLowerCase();
    const author = String(book?.author || "").trim().toLowerCase();
    return title || author ? `title-author:${title}\u0000${author}` : "";
}

function getBookKey(book: any): string {
    const bookID = getBookID(book);
    return bookID ? `bookID:${bookID}` : getFallbackKey(book);
}

function getStableResultFallbackId(book: any): string {
    const values = [
        book?.title,
        book?.name,
        book?.author,
        book?.isbn,
        book?.ISBN,
        book?.publisher,
        book?.category,
        book?.introduction,
        book?.intro,
        book?.cover,
        book?.sourceType,
    ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map((value) => String(value).trim())
        .filter(Boolean);
    return `weread-fallback:${values.join("\u0000") || "empty"}`;
}

function mergeWereadBooks(primary: any, secondary: any, hasNotes: boolean, inShelf: boolean): any {
    const merged = { ...primary };
    const readableFields = [
        "title", "name", "author", "cover", "isbn", "ISBN", "publisher", "category",
        "introduction", "intro", "noteCount", "reviewCount", "bookmarkCount", "totalNoteCount",
        "sourceType", "localDocBlockID", "localDocCandidateID", "localDocId", "noteDocId",
        "localDocMatchType",
    ];
    for (const field of readableFields) {
        if (!hasValue(merged[field]) && hasValue(secondary?.[field])) {
            merged[field] = secondary[field];
        }
    }

    const bookID = getBookID(primary) || getBookID(secondary);
    if (bookID) {
        merged.bookID = bookID;
        delete merged.bookId;
    }
    merged.hasWereadNotes = Boolean(primary.hasWereadNotes || secondary?.hasWereadNotes || hasNotes);
    merged.inWereadShelf = Boolean(primary.inWereadShelf || secondary?.inWereadShelf || inShelf);
    return merged;
}

export async function loadWereadCachedBooks(plugin: PluginLike): Promise<any[]> {
    const cache = await safeLoadNotebookCache(plugin);
    return Array.isArray(cache) ? cache : [];
}

export async function searchWereadCachedBooks(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const cachedBooks = await loadWereadCachedBooks(plugin);
    let books = cachedBooks;
    try {
        books = await attachWereadApiLocalNoteDocs(plugin, cachedBooks);
    } catch (error) {
        console.error("[wereadBookSearch] validate local note documents failed:", error);
        books = cachedBooks.map((book) => ({
            ...book,
            localDocBlockID: undefined,
            noteDocId: undefined,
            localDocId: undefined,
        }));
    }
    const keyword = String(query || "").trim().toLowerCase();
    const matched = !keyword
        ? books
        : books.filter((book) => {
            const haystack = [
                book.title,
                book.name,
                book.author,
                book.isbn,
                book.ISBN,
                book.bookID,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    return matched.slice(0, WEREAD_SEARCH_RESULT_LIMIT).map((book) => toResult(book, plugin));
}

async function loadSearchArrayCacheStrict(plugin: PluginLike, key: string, label: string): Promise<any[]> {
    let cache: any;
    try {
        cache = await plugin.loadData(key);
    } catch (error: any) {
        const message = error?.message || String(error || "未知错误");
        throw new Error(`读取${label}失败：${message}`);
    }
    if (cache === null || cache === undefined) return [];
    if (!Array.isArray(cache)) throw new Error(`${label}格式异常`);
    return cache;
}

export async function loadWereadSearchLibrary(plugin: PluginLike): Promise<any[]> {
    const [noteBooks, shelfBooks] = await Promise.all([
        loadSearchArrayCacheStrict(plugin, WEREAD_NOTEBOOK_CACHE_KEY, "微信读书有笔记书籍缓存"),
        loadSearchArrayCacheStrict(plugin, WEREAD_SHELF_CACHE_KEY, "微信读书书架缓存"),
    ]);
    const mergedBooks = new Map<string, any>();

    const addBooks = (books: any[], hasNotes: boolean, inShelf: boolean) => {
        for (const book of books) {
            const key = getBookKey(book);
            if (!key) continue;
            const existing = mergedBooks.get(key);
            mergedBooks.set(key, existing
                ? mergeWereadBooks(existing, book, hasNotes, inShelf)
                : mergeWereadBooks({}, book, hasNotes, inShelf));
        }
    };

    addBooks(noteBooks, true, false);
    addBooks(shelfBooks, false, true);
    return Array.from(mergedBooks.values());
}

function getWereadSearchText(book: any): string[] {
    return [
        book.title,
        book.name,
        book.author,
        book.isbn,
        book.ISBN,
        book.publisher,
        book.category,
        book.introduction,
        book.intro,
        book.bookID,
    ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map((value) => String(value).toLowerCase());
}

function getWereadMatchRank(book: any, keyword: string): number {
    const title = String(book.title || book.name || "").trim().toLowerCase();
    const author = String(book.author || "").trim().toLowerCase();
    if (title === keyword) return 0;
    if (title.startsWith(keyword)) return 1;
    if (title.includes(keyword)) return 2;
    if (author.includes(keyword)) return 3;
    return getWereadSearchText(book).some((value) => value.includes(keyword)) ? 4 : -1;
}

export async function searchWereadLibraryBooks(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const books = await loadWereadSearchLibrary(plugin);
    const keyword = String(query || "").trim().toLowerCase();
    const matched = books
        .map((book, index) => ({ book, index, rank: keyword ? getWereadMatchRank(book, keyword) : 0 }))
        .filter((item) => !keyword || item.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .slice(0, WEREAD_SEARCH_RESULT_LIMIT)
        .map((item) => item.book);

    if (matched.length === 0) return [];

    let enhancedBooks = matched;
    try {
        enhancedBooks = await attachWereadApiLocalNoteDocs(plugin, matched);
    } catch (error) {
        console.error("[wereadBookSearch] validate local note documents failed:", error);
        enhancedBooks = matched.map((book) => ({
            ...book,
            localDocBlockID: undefined,
            noteDocId: undefined,
            localDocId: undefined,
        }));
    }
    return enhancedBooks.map((book) => toResult(book, plugin));
}

export function openWereadBookResult(plugin: PluginLike, result: WorkbenchSearchResult): boolean {
    if (result.noteDocId) {
        openDoc(plugin, result.noteDocId, 1);
        return true;
    }
    showMessage(t(plugin, "searchWereadNoLocalNote", "该微信读书书籍暂无可打开的本地笔记文档"));
    return false;
}

export async function openWereadCachedNotebooks(plugin: PluginLike): Promise<number> {
    const books = await loadWereadCachedBooks(plugin);
    if (books.length === 0) {
        showMessage(t(plugin, "wereadNoNotebookCache", "暂无微信读书有笔记书籍缓存，请先进入同步面板获取缓存"));
        return 0;
    }

    let enhancedBooks = books;
    try {
        enhancedBooks = await attachWereadApiLocalNoteDocs(plugin, books);
    } catch {
    }
    createNotebooksDialog(plugin, enhancedBooks)();
    return books.length;
}

export async function openCachedReadingStats(plugin: PluginLike): Promise<boolean> {
    const stats = await safeLoadReadingStatsCache(plugin);
    if (!stats) {
        showMessage(t(plugin, "wereadNoStatsCache", "暂无阅读统计缓存，请先进入同步面板更新统计"));
        return false;
    }
    createWereadReadingStatsDialog(plugin, stats)();
    return true;
}

export async function getWereadCacheSummary(plugin: PluginLike): Promise<{
    notebookCount: number;
    noteCount: number;
    shelfBookCount: number | null;
    hasNotebookCache: boolean;
    hasReadingStatsCache: boolean;
    readingStatsLoadedAt?: number;
}> {
    const notebooks = await loadWereadCachedBooks(plugin);
    const stats = await safeLoadReadingStatsCache(plugin);
    return {
        notebookCount: notebooks.length,
        noteCount: notebooks.length ? countNotebookNotes(notebooks) : 0,
        shelfBookCount: typeof stats?.shelf?.total === "number" ? stats.shelf.total : null,
        hasNotebookCache: notebooks.length > 0,
        hasReadingStatsCache: !!stats,
        readingStatsLoadedAt: stats?.loadedAt,
    };
}
