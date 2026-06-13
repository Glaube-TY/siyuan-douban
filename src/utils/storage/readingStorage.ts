import type { ReadingBookStatus, ReadingBookReviewStatus, ReadingSourceType } from "../../types/readingStatus";
import type { ReadingInboxItem, ReadingInboxStatus, WereadSourceSnapshot } from "../../types/readingInbox";
import type { ReadingReviewItem } from "../../types/readingReview";
import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
import type { WereadSyncReport } from "../../types/syncReport";

export const STORAGE_KEYS = {
    bookStatuses: "reading_book_statuses",
    inboxItems: "reading_inbox_items",
    sourceSnapshots: "weread_source_snapshots",
    syncReports: "weread_sync_reports",
    topics: "reading_topics",
    topicItems: "reading_topic_items",
    reviewItems: "reading_review_items",
} as const;

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export function getReadingSourceKey(sourceType: ReadingSourceType, id: string): string {
    const normalized = String(id || "").trim();
    return `${sourceType}:${normalized}`;
}

export function getWereadSourceKey(sourceType: "book" | "mp", bookID: string): string {
    return getReadingSourceKey(sourceType === "mp" ? "weread-mp" : "weread-book", bookID);
}

export function normalizeReadingBookStatusSource(
    item: ReadingBookStatus,
    cache?: Array<{ bookID?: string; bookId?: string; sourceType?: string }>
): ReadingBookStatus {
    const bookID = item.bookID || "";
    const isMpId = /^MP_|^MP_WXS_/.test(bookID);

    // 如果 bookID 明确是公众号 ID，强制改为 weread-mp
    if (isMpId && item.sourceType !== "weread-mp") {
        const correctedKey = getReadingSourceKey("weread-mp", bookID);
        return { ...item, sourceType: "weread-mp", sourceKey: correctedKey };
    }

    // 如果 bookID 不是公众号 ID，但 sourceType 是 weread-mp，检查缓存
    if (!isMpId && item.sourceType === "weread-mp") {
        if (cache) {
            const cached = cache.find((b) => (b.bookID || b.bookId) === bookID);
            if (cached && cached.sourceType !== "weread_mp_account") {
                const correctedKey = getReadingSourceKey("weread-book", bookID);
                return { ...item, sourceType: "weread-book", sourceKey: correctedKey };
            }
        }
        // 无缓存信息时保留原样，不做盲目修正
    }

    return item;
}

export function createReadingId(prefix: string, parts: Array<string | number | undefined | null>): string {
    const raw = parts.map((part) => String(part ?? "")).join("|");
    return `${prefix}_${hashString(raw)}`;
}

export function hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

async function loadArray<T>(plugin: PluginLike, key: string): Promise<T[]> {
    try {
        const data = await plugin.loadData(key);
        return Array.isArray(data) ? data as T[] : [];
    } catch {
        return [];
    }
}

async function saveArray<T>(plugin: PluginLike, key: string, items: T[]): Promise<void> {
    try {
        await plugin.saveData(key, items);
    } catch (error) {
        console.error(`[readingStorage] save ${key} failed:`, error);
    }
}

export function normalizeBookStatus(status?: string): ReadingBookReviewStatus {
    const allowed: ReadingBookReviewStatus[] = [
        "not_started",
        "reading",
        "finished",
        "to_review",
        "reviewing",
        "reviewed",
        "archived",
    ];
    return allowed.includes(status as ReadingBookReviewStatus) ? status as ReadingBookReviewStatus : "not_started";
}

export async function getReadingBookStatuses(plugin: PluginLike): Promise<ReadingBookStatus[]> {
    const items = await loadArray<ReadingBookStatus>(plugin, STORAGE_KEYS.bookStatuses);
    return items
        .filter((item) => item?.sourceKey)
        .map((item) => ({
            ...item,
            status: normalizeBookStatus(item.status),
            updatedAt: item.updatedAt || Date.now(),
        }));
}

export async function saveReadingBookStatuses(plugin: PluginLike, statuses: ReadingBookStatus[]): Promise<void> {
    const map = new Map<string, ReadingBookStatus>();
    for (const status of statuses) {
        if (!status?.sourceKey) continue;
        map.set(status.sourceKey, {
            ...status,
            status: normalizeBookStatus(status.status),
            updatedAt: status.updatedAt || Date.now(),
        });
    }
    await saveArray(plugin, STORAGE_KEYS.bookStatuses, Array.from(map.values()));
}

export async function upsertReadingBookStatus(
    plugin: PluginLike,
    status: Omit<ReadingBookStatus, "updatedAt" | "status"> & { updatedAt?: number; status?: ReadingBookReviewStatus }
): Promise<ReadingBookStatus> {
    const statuses = await getReadingBookStatuses(plugin);
    const existing = statuses.find((item) => item.sourceKey === status.sourceKey);
    const merged: ReadingBookStatus = {
        sourceKey: status.sourceKey,
        sourceType: status.sourceType,
        bookID: status.bookID ?? existing?.bookID,
        isbn: status.isbn ?? existing?.isbn,
        title: status.title || existing?.title || "",
        status: status.status || existing?.status || "not_started",
        updatedAt: status.updatedAt || Date.now(),
        noteDocId: status.noteDocId ?? existing?.noteDocId,
        lastSyncedAt: status.lastSyncedAt ?? existing?.lastSyncedAt,
        hasNewNotes: status.hasNewNotes ?? existing?.hasNewNotes,
        lastNewNoteCount: status.lastNewNoteCount ?? existing?.lastNewNoteCount,
        syncFailed: status.syncFailed ?? existing?.syncFailed,
        lastSyncError: status.lastSyncError ?? existing?.lastSyncError,
    };
    const next = statuses.filter((item) => item.sourceKey !== merged.sourceKey);
    next.push(merged);
    await saveReadingBookStatuses(plugin, next);
    return merged;
}

export async function updateReadingBookStatusValue(
    plugin: PluginLike,
    sourceKey: string,
    status: ReadingBookReviewStatus
): Promise<void> {
    const statuses = await getReadingBookStatuses(plugin);
    const existing = statuses.find((item) => item.sourceKey === sourceKey);
    if (!existing) return;
    existing.status = status;
    existing.updatedAt = Date.now();
    await saveReadingBookStatuses(plugin, statuses);
}

export async function getReadingInboxItems(plugin: PluginLike): Promise<ReadingInboxItem[]> {
    const items = await loadArray<ReadingInboxItem>(plugin, STORAGE_KEYS.inboxItems);
    return items.filter((item) => item?.id && item?.sourceKey);
}

export async function saveReadingInboxItems(plugin: PluginLike, items: ReadingInboxItem[]): Promise<void> {
    const map = new Map<string, ReadingInboxItem>();
    for (const item of items) {
        if (!item?.id) continue;
        map.set(item.id, item);
    }
    await saveArray(plugin, STORAGE_KEYS.inboxItems, Array.from(map.values()));
}

export async function updateReadingInboxItemStatus(
    plugin: PluginLike,
    id: string,
    status: ReadingInboxStatus
): Promise<void> {
    const items = await getReadingInboxItems(plugin);
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    item.status = status;
    await saveReadingInboxItems(plugin, items);
    await syncBookNewNoteStateFromInbox(plugin, item.sourceKey);
}

export async function markSourceInboxItemsProcessed(plugin: PluginLike, sourceKey: string): Promise<void> {
    const items = await getReadingInboxItems(plugin);
    let changed = false;
    for (const item of items) {
        if (item.sourceKey === sourceKey && (item.status === "unprocessed" || item.status === "later")) {
            item.status = "processed";
            changed = true;
        }
    }
    if (changed) {
        await saveReadingInboxItems(plugin, items);
    }
    await syncBookNewNoteStateFromInbox(plugin, sourceKey);
}

export async function getWereadSourceSnapshots(plugin: PluginLike): Promise<WereadSourceSnapshot[]> {
    const items = await loadArray<WereadSourceSnapshot>(plugin, STORAGE_KEYS.sourceSnapshots);
    return items.filter((item) => item?.sourceKey);
}

export async function saveWereadSourceSnapshots(plugin: PluginLike, snapshots: WereadSourceSnapshot[]): Promise<void> {
    const map = new Map<string, WereadSourceSnapshot>();
    for (const snapshot of snapshots) {
        if (!snapshot?.sourceKey) continue;
        map.set(snapshot.sourceKey, snapshot);
    }
    await saveArray(plugin, STORAGE_KEYS.sourceSnapshots, Array.from(map.values()));
}

export async function getReadingTopics(plugin: PluginLike): Promise<ReadingTopic[]> {
    return loadArray<ReadingTopic>(plugin, STORAGE_KEYS.topics);
}

export async function saveReadingTopics(plugin: PluginLike, topics: ReadingTopic[]): Promise<void> {
    await saveArray(plugin, STORAGE_KEYS.topics, topics);
}

export async function getReadingTopicItems(plugin: PluginLike): Promise<ReadingTopicItem[]> {
    return loadArray<ReadingTopicItem>(plugin, STORAGE_KEYS.topicItems);
}

export async function saveReadingTopicItems(plugin: PluginLike, items: ReadingTopicItem[]): Promise<void> {
    await saveArray(plugin, STORAGE_KEYS.topicItems, items);
}

export async function getReadingReviewItems(plugin: PluginLike): Promise<ReadingReviewItem[]> {
    return loadArray<ReadingReviewItem>(plugin, STORAGE_KEYS.reviewItems);
}

export async function saveReadingReviewItems(plugin: PluginLike, items: ReadingReviewItem[]): Promise<void> {
    await saveArray(plugin, STORAGE_KEYS.reviewItems, items);
}

export async function appendWereadSyncReport(plugin: PluginLike, report: WereadSyncReport, maxReports = 10): Promise<void> {
    const reports = await loadArray<WereadSyncReport>(plugin, STORAGE_KEYS.syncReports);
    const next = [report, ...reports.filter((item) => item.id !== report.id)]
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, maxReports);
    await saveArray(plugin, STORAGE_KEYS.syncReports, next);
}

export async function syncBookNewNoteStateFromInbox(plugin: PluginLike, sourceKey: string): Promise<void> {
    const items = await getReadingInboxItems(plugin);
    const unprocessed = items.filter((item) => item.sourceKey === sourceKey && (item.status === "unprocessed" || item.status === "later"));
    const statuses = await getReadingBookStatuses(plugin);
    const existing = statuses.find((item) => item.sourceKey === sourceKey);
    if (!existing) return;
    existing.hasNewNotes = unprocessed.length > 0;
    existing.lastNewNoteCount = unprocessed.length;
    existing.updatedAt = Date.now();
    await saveReadingBookStatuses(plugin, statuses);
}

