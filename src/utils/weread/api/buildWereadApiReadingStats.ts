import { callWereadApi } from "./wereadApiGateway";

export type WereadReadingStatsMode = "weekly" | "monthly" | "annually" | "overall";

export interface WereadReadingLongestItem {
    bookId: string;
    title: string;
    author: string;
    cover: string;
    intro: string;
    category: string;
    publishTime: string;
    readTime: number;
    tags: string[];
}

export interface WereadReadingCategoryItem {
    title: string;
    readingTime: number;
    readingCount: number;
}

export interface WereadReadingStatsPeriod {
    mode: WereadReadingStatsMode;
    title: string;
    totalReadTime: number;
    readDays: number;
    dayAverageReadTime: number;
    compare?: number;
    readTimes: Record<string, number>;
    readLongest: WereadReadingLongestItem[];
    readStat: Array<{ stat: string; counts: string }>;
    preferCategory: WereadReadingCategoryItem[];
    preferCategoryWord: string;
    readRecordsWord: string;
    readDistributionWord: string;
}

export interface WereadShelfStats {
    total: number;
    normalBooks: number;
    mpAccounts: number;
    articleCollection: number;
    albums: number;
    archive: number;
    publicCount: number;
    privateCount: number;
}

export interface WereadReadingDashboard {
    loadedAt: number;
    weekly: WereadReadingStatsPeriod;
    monthly: WereadReadingStatsPeriod;
    annually: WereadReadingStatsPeriod;
    overall: WereadReadingStatsPeriod;
    shelf?: WereadShelfStats;
}

const MODE_TITLES: Record<WereadReadingStatsMode, string> = {
    weekly: "本周",
    monthly: "本月",
    annually: "本年",
    overall: "总计",
};

function normalizeReadTimes(rawReadTimes: any): Record<string, number> {
    if (!rawReadTimes || typeof rawReadTimes !== "object") return {};

    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawReadTimes)) {
        result[String(key)] = Number(value || 0);
    }
    return result;
}

function normalizePeriod(mode: WereadReadingStatsMode, raw: any): WereadReadingStatsPeriod {
    const data = raw && typeof raw === "object" ? raw : {};

    const readLongest: WereadReadingLongestItem[] = Array.isArray(data.readLongest)
        ? data.readLongest.map((item: any) => {
            const book = item.book || {};
            return {
                bookId: String(book.bookId || ""),
                title: String(book.title || ""),
                author: String(book.author || ""),
                cover: String(book.cover || ""),
                intro: String(book.intro || ""),
                category: String(book.category || ""),
                publishTime: String(book.publishTime || ""),
                readTime: Number(item.readTime || 0),
                tags: Array.isArray(item.tags) ? item.tags : [],
            };
        })
        : [];

    const readStat: Array<{ stat: string; counts: string }> = Array.isArray(data.readStat)
        ? data.readStat.map((item: any) => ({
            stat: String(item.stat || ""),
            counts: String(item.counts || ""),
        }))
        : [];

    const preferCategory: WereadReadingCategoryItem[] = Array.isArray(data.preferCategory)
        ? data.preferCategory.map((item: any) => ({
            title: String(item.categoryTitle || item.parentCategoryTitle || ""),
            readingTime: Number(item.readingTime || 0),
            readingCount: Number(item.readingCount || 0),
        }))
        : [];

    return {
        mode,
        title: MODE_TITLES[mode],
        totalReadTime: Number(data.totalReadTime || 0),
        readDays: Number(data.readDays || 0),
        dayAverageReadTime: Number(data.dayAverageReadTime || 0),
        compare: typeof data.compare === "number" ? data.compare : undefined,
        readTimes: normalizeReadTimes(data.readTimes),
        readLongest,
        readStat,
        preferCategory,
        preferCategoryWord: String(data.preferCategoryWord || ""),
        readRecordsWord: String(data.readRecordsWord || ""),
        readDistributionWord: String(data.readDistributionWord || ""),
    };
}

function normalizeShelf(raw: any): WereadShelfStats {
    const data = raw && typeof raw === "object" ? raw : {};

    const books = Array.isArray(data.books) ? data.books : [];
    const albums = Array.isArray(data.albums) ? data.albums : [];
    const archive = Array.isArray(data.archive) ? data.archive : [];

    const normalBooks = books.filter((b: any) => {
        const bookId = String(b.bookId || "");
        return !bookId.startsWith("MP_WXS_");
    }).length;

    const mpAccounts = books.filter((b: any) => {
        const bookId = String(b.bookId || "");
        return bookId.startsWith("MP_WXS_");
    }).length;

    const articleCollection = data.mp?.show ? 1 : 0;
    const total = books.length + albums.length + articleCollection;

    let publicCount = 0;
    let privateCount = 0;

    for (const book of books) {
        if (book.secret === 0) publicCount++;
        else if (book.secret === 1) privateCount++;
    }

    for (const album of albums) {
        const secret = album.albumInfoExtra?.secret;
        if (secret === 0) publicCount++;
        else if (secret === 1) privateCount++;
    }

    privateCount += articleCollection;

    return {
        total,
        normalBooks,
        mpAccounts,
        articleCollection,
        albums: albums.length,
        archive: archive.length,
        publicCount,
        privateCount,
    };
}

export async function buildWereadApiReadingStats(apiKey: string): Promise<WereadReadingDashboard> {
    const [weeklyRaw, monthlyRaw, annuallyRaw, overallRaw] = await Promise.all([
        callWereadApi(apiKey, "/readdata/detail", { mode: "weekly" }),
        callWereadApi(apiKey, "/readdata/detail", { mode: "monthly" }),
        callWereadApi(apiKey, "/readdata/detail", { mode: "annually" }),
        callWereadApi(apiKey, "/readdata/detail", { mode: "overall" }),
    ]);

    let shelf: WereadShelfStats | undefined;
    try {
        const shelfRaw = await callWereadApi(apiKey, "/shelf/sync", {});
        shelf = normalizeShelf(shelfRaw);
    } catch {
        shelf = undefined;
    }

    return {
        loadedAt: Date.now(),
        weekly: normalizePeriod("weekly", weeklyRaw),
        monthly: normalizePeriod("monthly", monthlyRaw),
        annually: normalizePeriod("annually", annuallyRaw),
        overall: normalizePeriod("overall", overallRaw),
        shelf,
    };
}
