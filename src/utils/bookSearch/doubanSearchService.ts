import { reloadAttributeView } from "../../api";
import { fetchBookHtml, fetchDoubanBook, fetchDoubanSubjectHtml } from "../douban/book";
import { searchDoubanSubjects } from "../douban/book/searchBook";
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

function extractSubjectId(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const canonicalUrl = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
        || doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
        || "";
    return canonicalUrl.match(/\/subject\/(\d+)/)?.[1]
        || html.match(/https?:\/\/book\.douban\.com\/subject\/(\d+)/)?.[1]
        || "";
}

export async function searchDoubanBook(plugin: PluginLike, query: string): Promise<WorkbenchSearchResult[]> {
    void plugin;
    const keyword = String(query || "").trim();
    if (!keyword) return [];

    if (isISBN(keyword)) {
        const html = await fetchBookHtml(keyword.replace(/[-\s]/g, ""));
        const book = await fetchDoubanBook(html);
        const subjectId = extractSubjectId(html);
        return [{
            id: subjectId || book.isbn || book.title,
            source: "douban",
            title: book.title || "未命名书籍",
            author: normalizeAuthors(book.authors),
            isbn: book.isbn,
            cover: book.cover,
            description: book.description || book.publisher || "",
            raw: { ...book, doubanSubjectId: subjectId, detailLoaded: true },
        }];
    }

    const candidates = await searchDoubanSubjects(keyword);
    return candidates.map((candidate) => ({
        id: candidate.id,
        source: "douban" as const,
        title: candidate.title,
        author: candidate.author,
        cover: candidate.cover,
        description: candidate.year ? `${candidate.year} 年` : "",
        raw: {
            doubanSubjectId: candidate.id,
            subjectUrl: candidate.url,
            detailLoaded: false,
        },
    }));
}

export async function loadDoubanBookDetail(result: WorkbenchSearchResult): Promise<WorkbenchSearchResult> {
    const raw = (result?.raw || {}) as any;
    if (raw.detailLoaded) return result;

    const subjectId = String(raw.doubanSubjectId || result.id || "");
    const html = await fetchDoubanSubjectHtml(subjectId);
    const book = await fetchDoubanBook(html);
    return {
        ...result,
        title: book.title || result.title,
        author: normalizeAuthors(book.authors) || result.author,
        isbn: book.isbn,
        cover: book.cover || result.cover,
        description: book.description || book.publisher || result.description,
        raw: {
            ...book,
            doubanSubjectId: subjectId,
            detailLoaded: true,
        },
    };
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
