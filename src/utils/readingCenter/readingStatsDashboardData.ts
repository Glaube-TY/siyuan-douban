import type { WereadReadingDashboard, WereadReadingLongestItem, WereadReadingStatsPeriod } from "../weread/api/buildWereadApiReadingStats";
import { formatReadingCompare, formatReadingDuration } from "../weread/api/formatWereadReadingStats";
import { getReadingBookStatuses, getReadingInboxItems } from "../storage/readingStorage";
import { getLatestWereadSyncReport } from "../storage/syncReportStorage";
import { loadWereadNoteUnitBlockIndex } from "../weread/incremental/blockIndexStorage";
import { countNotebookNotes, safeLoadNotebookCache, safeLoadReadingStatsCache } from "./readingCenterData";

export interface ReadingRecentDay {
    date: string;
    day: string;
    seconds: number;
    label: string;
}

export interface ReadingCalendarDay {
    date: string;
    day: number;
    weekday: number;
    weekIndex: number;
    seconds: number;
    label: string;
    isToday: boolean;
    isCurrentMonth: boolean;
}

export type ReadingPeriodMode = "weekly" | "monthly" | "annually" | "overall";

export interface ReadingPeriodView {
    mode: ReadingPeriodMode;
    label: string;
    totalReadTimeText: string;
    readDays: number;
    dayAverageReadTimeText: string;
    compareText: string;
    readDistribution: Array<{ name: string; value: string }>;
    recentReadTimes: Array<{ date: string; duration: string }>;
    longestBooks: Array<{ title: string; author: string; cover: string; readTimeText: string; isAudio?: boolean; category?: string; tags?: string[] }>;
    categoryRanking: Array<{ name: string; seconds: number; count: number; label: string }>;
    categoryRadar: Array<{ name: string; value: number; seconds: number; count: number }>;
    readTimesTrend: Array<{ label: string; seconds: number; duration: string }>;
}

export interface ReadingStatsDashboardView {
    loadedAt?: number;
    hasStats: boolean;
    metrics: {
        overallReadTimeText: string;
        annualReadTimeText: string;
        monthlyReadTimeText: string;
        readDays: number;
        annualFinished: number;
        noteCount: number;
        shelfTotal: number;
        normalBooks: number;
        mpAccounts: number;
        indexedSources: number;
        indexedItems: number;
        pendingInbox: number;
        unboundBooks: number;
        todayReadSeconds: number;
        todayReadTimeText: string;
    };
    annualMonthlyTrend: Array<{ month: string; seconds: number; label: string }>;
    yearlyTrend: Array<{ year: string; seconds: number; label: string }>;
    periods: Record<ReadingPeriodMode, ReadingPeriodView | null>;
    defaultPeriodMode: ReadingPeriodMode;
    dailyReadTimes: Record<string, number>;
    calendarAvailableMonths: string[];
    currentMonth: string;
    categoryRanking: Array<{ name: string; seconds: number; count: number; label: string }>;
    categoryRadar: Array<{ name: string; value: number; seconds: number; count: number }>;
    rhythm: ReadingRecentDay[];
    longestBooks: Array<{ title: string; author: string; cover: string; readTimeText: string; isAudio?: boolean; category?: string }>;
    syncCoverage: {
        latestSyncTime?: number;
        latestAdded: number;
        latestChanged: number;
        latestDeleted: number;
        successCount: number;
        failedCount: number;
        skippedCount: number;
    };
}

type ReadTimes = Record<string, number>;

const PERIOD_KEYS: ReadingPeriodMode[] = [
    "weekly",
    "monthly",
    "annually",
    "overall",
];

const PERIOD_LABELS: Record<ReadingPeriodMode, string> = {
    weekly: "本周",
    monthly: "本月",
    annually: "本年",
    overall: "总计",
};

export async function getReadingStatsDashboardView(plugin: any): Promise<ReadingStatsDashboardView> {
    const [stats, notebooks, inboxItems, bookStatuses, blockIndex, latestReport] = await Promise.all([
        safeLoadReadingStatsCache(plugin).catch(() => null),
        safeLoadNotebookCache(plugin).catch(() => null),
        getReadingInboxItems(plugin).catch(() => []),
        getReadingBookStatuses(plugin).catch(() => []),
        loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
        getLatestWereadSyncReport(plugin).catch(() => null),
    ]);

    const dashboard = stats as WereadReadingDashboard | null;
    const hasStats = !!dashboard;
    const annually = dashboard?.annually;
    const monthly = dashboard?.monthly;
    const overall = dashboard?.overall;
    const indexedSources = blockIndex?.sources ? Object.keys(blockIndex.sources).length : 0;
    const indexedItems: number = blockIndex?.sources
        ? (Object.values(blockIndex.sources) as any[]).reduce<number>((sum, source) => sum + Object.keys(source?.items || {}).length, 0)
        : 0;
    const pendingInbox = inboxItems.filter((item) => item.status === "unprocessed" || item.status === "later").length;
    const unboundBooks = bookStatuses.filter((item) => !item.noteDocId && !item.syncFailed).length;
    const noteCount = notebooks ? countNotebookNotes(notebooks) : 0;
    const shelf = dashboard?.shelf;
    const syncChanges = aggregateLatestSyncChanges(latestReport?.items || []);
    const dailyReadTimes = buildDailyReadTimesRecord(dashboard);
    const todayReadSeconds = Number(dailyReadTimes[toDateKey(Date.now())] || 0);
    const currentMonth = toMonthKey(new Date());
    const periods = buildPeriodViews(dashboard);

    return {
        loadedAt: dashboard?.loadedAt,
        hasStats,
        metrics: {
            overallReadTimeText: hasStats ? formatReadingDuration(overall?.totalReadTime || 0) : "暂无",
            annualReadTimeText: hasStats ? formatReadingDuration(annually?.totalReadTime || 0) : "暂无",
            monthlyReadTimeText: hasStats ? formatReadingDuration(monthly?.totalReadTime || 0) : "暂无",
            readDays: overall?.readDays || annually?.readDays || 0,
            annualFinished: countFinishedBooks(annually),
            noteCount,
            shelfTotal: shelf?.total || 0,
            normalBooks: shelf?.normalBooks || 0,
            mpAccounts: shelf?.mpAccounts || 0,
            indexedSources,
            indexedItems,
            pendingInbox,
            unboundBooks,
            todayReadSeconds,
            todayReadTimeText: formatReadingDuration(todayReadSeconds),
        },
        annualMonthlyTrend: buildAnnualMonthlyTrend(annually?.readTimes || {}),
        yearlyTrend: buildYearlyTrend(overall?.readTimes || {}, annually),
        periods,
        defaultPeriodMode: getDefaultPeriodMode(periods),
        dailyReadTimes,
        calendarAvailableMonths: buildCalendarAvailableMonths(dailyReadTimes, currentMonth),
        currentMonth,
        categoryRanking: buildCategoryRanking(dashboard),
        categoryRadar: buildCategoryRadar(buildCategoryRanking(dashboard)),
        rhythm: buildLast30Days(dashboard),
        longestBooks: buildLongestBooks(dashboard),
        syncCoverage: {
            latestSyncTime: latestReport?.endedAt || latestReport?.startedAt,
            latestAdded: syncChanges.added,
            latestChanged: syncChanges.changed,
            latestDeleted: syncChanges.deleted,
            successCount: latestReport?.successCount || 0,
            failedCount: latestReport?.failedCount || 0,
            skippedCount: latestReport?.skippedCount || 0,
        },
    };
}

function timestampKeyToMs(key: string): number | null {
    const n = Number(key);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 1000000000000 ? n : n * 1000;
}

function toDateKey(ms: number): string {
    const date = new Date(ms);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

function toMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(monthKey: string): Date {
    const matched = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!matched) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const year = Number(matched[1]);
    const month = Number(matched[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return new Date(year, month - 1, 1);
}

function formatMonthLabel(index: number): string {
    return `${index + 1}月`;
}

function getPeriodLabel(mode: ReadingPeriodMode): string {
    return PERIOD_LABELS[mode] || mode;
}

function formatReadTimeLabel(mode: ReadingPeriodMode, timestampKey: string): string {
    const ms = timestampKeyToMs(timestampKey);
    if (ms === null) return timestampKey;

    const date = new Date(ms);
    if (mode === "annually") {
        return `${date.getMonth() + 1}月`;
    }
    if (mode === "overall") {
        return `${date.getFullYear()}年`;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatReadStatName(stat: string): string {
    const lower = String(stat || "").toLowerCase();
    if (lower === "read" || lower === "reading") return "阅读";
    if (lower === "finished" || lower === "finish") return "读完";
    if (lower === "note" || lower === "notes") return "笔记";
    if (lower === "readbook" || lower === "book") return "读过";
    return stat || "未命名";
}

function getRecentReadTimes(mode: ReadingPeriodMode, readTimes: ReadTimes, limit = 12): Array<{ date: string; duration: string }> {
    return Object.entries(readTimes || {})
        .filter(([, value]) => Number(value || 0) > 0)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .slice(0, limit)
        .map(([key, value]) => ({
            date: formatReadTimeLabel(mode, key),
            duration: formatReadingDuration(Number(value || 0)),
        }));
}

function buildReadTimesTrend(mode: ReadingPeriodMode, readTimes: ReadTimes): Array<{ label: string; seconds: number; duration: string }> {
    return Object.entries(readTimes || {})
        .map(([key, value]) => ({
            key,
            seconds: Number(value || 0),
        }))
        .filter((item) => timestampKeyToMs(item.key) !== null)
        .sort((a, b) => Number(a.key) - Number(b.key))
        .map((item) => ({
            label: formatReadTimeLabel(mode, item.key),
            seconds: item.seconds,
            duration: formatReadingDuration(item.seconds),
        }));
}

function buildPeriodCategoryRanking(period?: WereadReadingStatsPeriod | null): Array<{ name: string; seconds: number; count: number; label: string }> {
    return [...(period?.preferCategory || [])]
        .map((item) => ({
            name: item.title || "未分类",
            seconds: Number(item.readingTime || 0),
            count: Number(item.readingCount || 0),
            label: formatReadingDuration(Number(item.readingTime || 0)),
        }))
        .filter((item) => item.seconds > 0 || item.count > 0)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 8);
}

function buildPreferenceRadarItems(period?: WereadReadingStatsPeriod | null): Array<{ name: string; value: number; seconds: number; count: number }> {
    const categories = period?.preferCategory || [];
    if (categories.length === 0) return [];

    const all = categories.map((item) => ({
        name: item.title || "未分类",
        seconds: Number(item.readingTime || 0),
        count: Number(item.readingCount || 0),
    }));
    const totalTime = all.reduce((sum, item) => sum + item.seconds, 0);
    const totalCount = all.reduce((sum, item) => sum + item.count, 0);
    const scored = all.map((item) => {
        const timeShare = totalTime > 0 ? item.seconds / totalTime : 0;
        const countShare = totalCount > 0 ? item.count / totalCount : 0;
        return {
            ...item,
            score: 0.75 * timeShare + 0.25 * countShare,
        };
    });
    const top8 = scored.sort((a, b) => b.score - a.score).slice(0, 8);
    const maxScore = Math.max(...top8.map((item) => item.score), 0);

    return top8.map((item) => ({
        name: item.name,
        value: maxScore > 0 ? Math.round((item.score / maxScore) * 100) : 0,
        seconds: item.seconds,
        count: item.count,
    }));
}

function buildPeriodLongestBooks(period?: WereadReadingStatsPeriod | null): ReadingPeriodView["longestBooks"] {
    return [...(period?.readLongest || [])].slice(0, 8).map((item) => ({
        title: item.title || (item.isAudio ? "未命名听书" : "未命名书籍"),
        author: item.author || "",
        cover: item.cover || "",
        readTimeText: formatReadingDuration(item.readTime || 0),
        isAudio: item.isAudio,
        category: item.category || (item.isAudio ? "听书" : ""),
        tags: item.tags || [],
    }));
}

function buildPeriodView(mode: ReadingPeriodMode, period?: WereadReadingStatsPeriod | null): ReadingPeriodView | null {
    if (!period) return null;

    return {
        mode,
        label: getPeriodLabel(mode),
        totalReadTimeText: formatReadingDuration(period.totalReadTime || 0),
        readDays: period.readDays || 0,
        dayAverageReadTimeText: formatReadingDuration(period.dayAverageReadTime || 0),
        compareText: formatReadingCompare(period.compare),
        readDistribution: (period.readStat || []).map((item) => ({
            name: formatReadStatName(item.stat),
            value: item.counts,
        })),
        recentReadTimes: getRecentReadTimes(mode, period.readTimes || {}),
        longestBooks: buildPeriodLongestBooks(period),
        categoryRanking: buildPeriodCategoryRanking(period),
        categoryRadar: buildPreferenceRadarItems(period),
        readTimesTrend: buildReadTimesTrend(mode, period.readTimes || {}),
    };
}

function buildPeriodViews(stats: WereadReadingDashboard | null): Record<ReadingPeriodMode, ReadingPeriodView | null> {
    return {
        weekly: buildPeriodView("weekly", stats?.weekly),
        monthly: buildPeriodView("monthly", stats?.monthly),
        annually: buildPeriodView("annually", stats?.annually),
        overall: buildPeriodView("overall", stats?.overall),
    };
}

function getDefaultPeriodMode(periods: Record<ReadingPeriodMode, ReadingPeriodView | null>): ReadingPeriodMode {
    if (periods.annually) return "annually";
    return PERIOD_KEYS.find((mode) => !!periods[mode]) || "annually";
}

function buildAnnualMonthlyTrend(readTimes: ReadTimes): Array<{ month: string; seconds: number; label: string }> {
    const buckets = Array.from({ length: 12 }, () => 0);
    for (const [key, value] of Object.entries(readTimes || {})) {
        const ms = timestampKeyToMs(key);
        if (ms === null) continue;
        const month = new Date(ms).getMonth();
        buckets[month] += Number(value || 0);
    }
    return buckets.map((seconds, index) => ({
        month: formatMonthLabel(index),
        seconds,
        label: formatReadingDuration(seconds),
    }));
}

function buildYearlyTrend(readTimes: ReadTimes, annually?: WereadReadingStatsPeriod): Array<{ year: string; seconds: number; label: string }> {
    const buckets = new Map<string, number>();
    for (const [key, value] of Object.entries(readTimes || {})) {
        const ms = timestampKeyToMs(key);
        if (ms === null) continue;
        const year = String(new Date(ms).getFullYear());
        buckets.set(year, (buckets.get(year) || 0) + Number(value || 0));
    }

    for (const [year, seconds] of Array.from(buckets.entries())) {
        if (seconds <= 0) {
            buckets.delete(year);
        }
    }

    if (buckets.size === 0 && annually?.totalReadTime) {
        buckets.set(String(new Date().getFullYear()), annually.totalReadTime);
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, seconds]) => ({
            year,
            seconds,
            label: formatReadingDuration(seconds),
        }));
}

function mergeDailyReadTimes(stats: WereadReadingDashboard | null): Map<string, number> {
    const result = new Map<string, number>();
    if (!stats) return result;

    for (const key of PERIOD_KEYS) {
        const readTimes = stats[key]?.readTimes || {};
        for (const [timestamp, secondsValue] of Object.entries(readTimes)) {
            const ms = timestampKeyToMs(timestamp);
            if (ms === null) continue;
            const dateKey = toDateKey(ms);
            const seconds = Number(secondsValue || 0);
            result.set(dateKey, Math.max(result.get(dateKey) || 0, seconds));
        }
    }

    return result;
}

function buildDailyReadTimesRecord(stats: WereadReadingDashboard | null): Record<string, number> {
    return Object.fromEntries(mergeDailyReadTimes(stats).entries());
}

function buildCalendarAvailableMonths(dailyReadTimes: Record<string, number>, currentMonth: string): string[] {
    const months = new Set<string>([currentMonth]);
    for (const dateKey of Object.keys(dailyReadTimes || {})) {
        const monthKey = dateKey.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(monthKey)) {
            months.add(monthKey);
        }
    }
    return Array.from(months).sort();
}

export function buildMonthCalendarDays(dailyReadTimes: Record<string, number>, monthKey: string): ReadingCalendarDay[] {
    const firstDay = parseMonthKey(monthKey);
    const monthStart = new Date(firstDay);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);

    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    const cellCount = monthStart.getDay() + monthEnd.getDate() <= 35 ? 35 : 42;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = toDateKey(today.getTime());
    const result: ReadingCalendarDay[] = [];

    for (let i = 0; i < cellCount; i++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + i);
        const dateKey = toDateKey(date.getTime());
        const seconds = Number(dailyReadTimes?.[dateKey] || 0);
        result.push({
            date: dateKey,
            day: date.getDate(),
            weekday: date.getDay(),
            weekIndex: Math.floor(i / 7),
            seconds,
            label: formatReadingDuration(seconds),
            isToday: dateKey === todayKey,
            isCurrentMonth: date.getFullYear() === monthStart.getFullYear() && date.getMonth() === monthStart.getMonth(),
        });
    }

    return result;
}

function buildLast30Days(stats: WereadReadingDashboard | null): ReadingRecentDay[] {
    const daily = mergeDailyReadTimes(stats);

    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 29);

    const result: ReadingRecentDay[] = [];

    for (let i = 0; i < 30; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateKey = toDateKey(date.getTime());
        const seconds = daily.get(dateKey) || 0;
        result.push({
            date: dateKey,
            day: dateKey.slice(5),
            seconds,
            label: formatReadingDuration(seconds),
        });
    }

    return result;
}

function buildCategoryRanking(stats: WereadReadingDashboard | null): Array<{ name: string; seconds: number; count: number; label: string }> {
    const categories = stats?.annually?.preferCategory?.length
        ? stats.annually.preferCategory
        : stats?.monthly?.preferCategory?.length
            ? stats.monthly.preferCategory
            : stats?.overall?.preferCategory || [];

    return [...categories]
        .map((item) => ({
            name: item.title || "未分类",
            seconds: Number(item.readingTime || 0),
            count: Number(item.readingCount || 0),
            label: formatReadingDuration(Number(item.readingTime || 0)),
        }))
        .filter((item) => item.seconds > 0 || item.count > 0)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 8);
}

function buildCategoryRadar(ranking: Array<{ name: string; seconds: number; count: number }>): Array<{ name: string; value: number; seconds: number; count: number }> {
    const maxSeconds = Math.max(...ranking.map((item) => item.seconds), 0);
    return ranking.map((item) => ({
        name: item.name,
        value: maxSeconds > 0 ? Math.round((item.seconds / maxSeconds) * 100) : 0,
        seconds: item.seconds,
        count: item.count,
    }));
}

function buildLongestBooks(stats: WereadReadingDashboard | null): Array<{ title: string; author: string; cover: string; readTimeText: string; isAudio?: boolean; category?: string }> {
    const sources = [
        ...(stats?.annually?.readLongest || []),
        ...(stats?.monthly?.readLongest || []),
        ...(stats?.overall?.readLongest || []),
    ];
    const seen = new Set<string>();
    const books: WereadReadingLongestItem[] = [];

    for (const item of sources) {
        const key = item.bookId || `${item.title}-${item.author}-${item.readTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        books.push(item);
        if (books.length >= 8) break;
    }

    return books.map((item) => ({
        title: item.title || (item.isAudio ? "未命名听书" : "未命名书籍"),
        author: item.author || "",
        cover: item.cover || "",
        readTimeText: formatReadingDuration(item.readTime || 0),
        isAudio: item.isAudio,
        category: item.category || (item.isAudio ? "听书" : ""),
    }));
}

function countFinishedBooks(period?: WereadReadingStatsPeriod): number {
    if (!period?.readStat) return 0;
    const item = period.readStat.find((entry) => {
        const stat = String(entry.stat || "").toLowerCase();
        return stat === "finished" || stat === "finish" || stat === "readbook";
    });
    if (!item) return 0;
    const matched = String(item.counts || "").match(/\d+/);
    return matched ? Number(matched[0]) : 0;
}

function aggregateLatestSyncChanges(items: Array<{ addedItemCount?: number; changedItemCount?: number; deletedItemCount?: number }>) {
    return items.reduce((acc, item) => {
        acc.added += item.addedItemCount || 0;
        acc.changed += item.changedItemCount || 0;
        acc.deleted += item.deletedItemCount || 0;
        return acc;
    }, { added: 0, changed: 0, deleted: 0 });
}
