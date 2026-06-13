import { showMessage } from "siyuan";
import { attachWereadApiLocalNoteDocs } from "../weread/api/findWereadApiBookTargetDoc";
import { createNotebooksDialog, createWereadReadingStatsDialog } from "../weread/wereadDialogs";
import { countNotebookNotes, safeLoadNotebookCache, safeLoadReadingStatsCache } from "../readingCenter/readingCenterData";
import type { WorkbenchSearchResult } from "../../types/workbench";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n: any;
};

function toResult(book: any): WorkbenchSearchResult {
    return {
        id: book.bookID || book.title || book.name,
        source: "weread",
        title: book.title || book.name || "未命名微信读书书籍",
        author: book.author,
        isbn: book.isbn || book.ISBN,
        cover: book.cover,
        bookID: book.bookID,
        noteDocId: book.noteDocId || book.localDocId || book.localDocBlockID,
        description: `${book.totalNoteCount ?? book.noteCount ?? 0} 条笔记`,
        raw: book,
    };
}

export async function loadWereadCachedBooks(plugin: PluginLike): Promise<any[]> {
    const cache = await safeLoadNotebookCache(plugin);
    return Array.isArray(cache) ? cache : [];
}

export async function searchWereadCachedBooks(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const books = await loadWereadCachedBooks(plugin);
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
    return matched.slice(0, 20).map(toResult);
}

export async function openWereadCachedNotebooks(plugin: PluginLike): Promise<number> {
    const books = await loadWereadCachedBooks(plugin);
    if (books.length === 0) {
        showMessage("暂无微信读书有笔记书籍缓存，请先进入同步面板获取缓存");
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
        showMessage("暂无阅读统计缓存，请先进入同步面板更新统计");
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
