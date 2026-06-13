import { showMessage } from "siyuan";
import { loadLocalBookShelfBooks } from "../bookHandling/loadLocalBookShelfBooks";
import { createLocalBookShelfDialog } from "../weread/wereadDialogs";
import { openDoc } from "../openDoc";
import { loadDatabaseSettings } from "../settings/databaseSettingsService";
import type { WorkbenchDatabaseStatus, WorkbenchSearchResult } from "../../types/workbench";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n?: any;
    app?: any;
    isMobile?: boolean;
};

export interface LocalBookSearchState {
    databaseStatus: WorkbenchDatabaseStatus;
    books: any[];
}

function toResult(book: any): WorkbenchSearchResult {
    return {
        id: book.blockID || book.localDocBlockID || book.isbn || book.title,
        source: "local",
        title: book.title || "未命名书籍",
        author: book.author,
        isbn: book.isbn,
        cover: book.cover,
        noteDocId: book.localDocBlockID,
        description: [book.category, book.readingStatus].filter(Boolean).join(" / "),
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
                message: error?.message || "本地书架读取失败",
            },
            books: [],
        };
    }
}

export async function searchLocalBooks(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const { books } = await loadLocalBookSearchState(plugin);
    const keyword = String(query || "").trim().toLowerCase();
    if (!keyword) return books.slice(0, 12).map(toResult);

    return books
        .filter((book) => {
            const haystack = [
                book.title,
                book.author,
                book.publisher,
                book.isbn,
                book.category,
                book.readingStatus,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        })
        .slice(0, 20)
        .map(toResult);
}

export async function openLocalBookShelf(plugin: PluginLike): Promise<number> {
    const { databaseStatus, books } = await loadLocalBookSearchState(plugin);
    if (!databaseStatus.valid || !databaseStatus.avID) {
        showMessage(databaseStatus.message || "请先配置本地书籍数据库");
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
        showMessage("该书籍暂无可打开的本地笔记文档");
        return false;
    }
    openDoc(plugin, result.noteDocId, 1);
    return true;
}
