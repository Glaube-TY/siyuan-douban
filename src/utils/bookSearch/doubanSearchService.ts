import { reloadAttributeView } from "../../api";
import { fetchBookHtml, fetchDoubanBook } from "../douban/book";
import { openInteractiveSearchWindow } from "../douban/book/searchBook";
import { loadAVData } from "../bookHandling";
import { DEFAULT_SETTINGS, loadPluginData } from "../core/configDefaults";
import { loadDatabaseSettings } from "../settings/databaseSettingsService";
import type { WorkbenchSearchResult } from "../../types/workbench";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n?: any;
};

function isISBN(value: string): boolean {
    return /^(97(8|9))?\d{9}(\d|X)$/i.test(value.replace(/[-\s]/g, ""));
}

function normalizeAuthors(value: unknown): string {
    if (Array.isArray(value)) return value.filter(Boolean).join("、");
    return String(value || "");
}

export async function searchDoubanBook(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    const keyword = String(query || "").trim();
    if (!keyword) return [];

    let html = "";
    if (isISBN(keyword)) {
        html = await fetchBookHtml(keyword.replace(/[-\s]/g, ""));
    } else {
        const result = await openInteractiveSearchWindow(keyword, plugin.i18n || {});
        if (!result.success || !result.html) {
            throw new Error(result.error || "豆瓣图书搜索失败");
        }
        html = result.html;
    }

    const book = await fetchDoubanBook(html);
    return [{
        id: book.isbn || book.title,
        source: "douban",
        title: book.title || "未命名书籍",
        author: normalizeAuthors(book.authors),
        isbn: book.isbn,
        cover: book.cover,
        description: book.description || book.publisher || "",
        raw: book,
    }];
}

export async function addEditedDoubanBookToDatabase(plugin: PluginLike, editedBookInfo: any): Promise<{ code: number; msg: string }> {
    if (!editedBookInfo || !editedBookInfo.isbn) {
        return { code: 1, msg: "书籍信息不完整" };
    }

    const database = await loadDatabaseSettings(plugin);
    if (!database.valid || !database.avID) {
        return { code: 1, msg: database.message || "请先配置本地书籍数据库" };
    }

    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const fullData = {
        ...editedBookInfo,
        ISBN: editedBookInfo.isbn,
        databaseBlockId: database.blockID,
        noteTemplate: settings.noteTemplate || "",
        addNotes: editedBookInfo.addNotes ?? settings.addNotes ?? true,
    };

    const saveResult = await loadAVData(database.avID, fullData, plugin);
    if (saveResult?.code === 0) {
        await reloadAttributeView(database.avID);
    }
    return saveResult;
}

export async function loadDoubanBookPreferences(plugin: PluginLike): Promise<{
    ratings: string[];
    categories: string[];
    statuses: string[];
}> {
    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    return {
        ratings: settings.ratings || ["未评分"],
        categories: settings.categories || ["默认分类"],
        statuses: settings.statuses || ["未读"],
    };
}
