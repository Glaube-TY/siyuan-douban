import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
import {
    loadReadingBookStatusesForMutationStrict,
    loadReadingInboxItemsForMutationStrict,
    saveReadingBookStatusesStrict,
    saveReadingInboxItemsStrict,
} from "./managementStorage";

export interface InboxMutationResult {
    changedCount: number;
    affectedSourceKeys: string[];
    bookStatusWarning?: string;
}

export async function setInboxItemStatusStrict(
    plugin: any,
    id: string,
    status: ReadingInboxStatus,
): Promise<InboxMutationResult> {
    const items = await loadReadingInboxItemsForMutationStrict(plugin);
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error("该待办记录已不存在，请刷新后重试");

    const nextItems = items.map((entry) => entry.id === id ? { ...entry, status } : entry);
    const verifiedItems = await saveInboxItemsAndVerifyStatuses(plugin, nextItems, new Map([[id, status]]));
    return finishMutation(plugin, item.status === status ? 0 : 1, [item.sourceKey], verifiedItems);
}

export async function setInboxItemsStatusStrict(
    plugin: any,
    ids: string[],
    status: ReadingInboxStatus,
): Promise<InboxMutationResult> {
    const targetIds = Array.from(new Set(ids.filter(isNonEmptyString)));
    if (targetIds.length === 0) return { changedCount: 0, affectedSourceKeys: [] };

    const items = await loadReadingInboxItemsForMutationStrict(plugin);
    const itemById = new Map(items.map((item) => [item.id, item]));
    if (targetIds.some((id) => !itemById.has(id))) {
        throw new Error("该待办记录已不存在，请刷新后重试");
    }

    const targetIdSet = new Set(targetIds);
    const affectedSourceKeys = new Set<string>();
    const expectedStatuses = new Map<string, ReadingInboxStatus>();
    let changedCount = 0;
    const nextItems = items.map((item) => {
        if (!targetIdSet.has(item.id)) return item;
        affectedSourceKeys.add(item.sourceKey);
        expectedStatuses.set(item.id, status);
        if (item.status !== status) changedCount += 1;
        return { ...item, status };
    });

    const verifiedItems = await saveInboxItemsAndVerifyStatuses(plugin, nextItems, expectedStatuses);
    return finishMutation(plugin, changedCount, Array.from(affectedSourceKeys), verifiedItems);
}

export async function markInboxSourceProcessedStrict(
    plugin: any,
    sourceKey: string,
): Promise<InboxMutationResult> {
    const items = await loadReadingInboxItemsForMutationStrict(plugin);
    const expectedStatuses = new Map<string, ReadingInboxStatus>();
    let changedCount = 0;
    const nextItems = items.map((item) => {
        if (item.sourceKey !== sourceKey || (item.status !== "unprocessed" && item.status !== "later")) {
            return item;
        }
        changedCount += 1;
        expectedStatuses.set(item.id, "processed");
        return { ...item, status: "processed" as const };
    });

    if (changedCount === 0) return { changedCount: 0, affectedSourceKeys: [] };
    const verifiedItems = await saveInboxItemsAndVerifyStatuses(plugin, nextItems, expectedStatuses);
    return finishMutation(plugin, changedCount, [sourceKey], verifiedItems);
}

async function saveInboxItemsAndVerifyStatuses(
    plugin: any,
    nextItems: ReadingInboxItem[],
    expectedStatuses: Map<string, ReadingInboxStatus>,
): Promise<ReadingInboxItem[]> {
    await saveReadingInboxItemsStrict(plugin, nextItems);
    const verifiedItems = await loadReadingInboxItemsForMutationStrict(plugin);
    for (const [id, status] of expectedStatuses) {
        const item = verifiedItems.find((entry) => entry.id === id);
        if (!item || item.status !== status) {
            throw new Error("保存后验证失败：reading_inbox_items");
        }
    }
    return verifiedItems;
}

async function finishMutation(
    plugin: any,
    changedCount: number,
    affectedSourceKeys: string[],
    verifiedInboxItems: ReadingInboxItem[],
): Promise<InboxMutationResult> {
    let bookStatusWarning: string | undefined;
    try {
        await refreshBookNewNoteStateStrict(plugin, affectedSourceKeys, verifiedInboxItems);
    } catch (error) {
        bookStatusWarning = (error instanceof Error ? error.message : String(error)) || "未知错误";
    }
    return {
        changedCount,
        affectedSourceKeys,
        ...(bookStatusWarning ? { bookStatusWarning } : {}),
    };
}

async function refreshBookNewNoteStateStrict(
    plugin: any,
    sourceKeys: string[],
    verifiedInboxItems: ReadingInboxItem[],
): Promise<void> {
    const sourceKeySet = new Set(sourceKeys.filter(isNonEmptyString));
    if (sourceKeySet.size === 0) return;

    const pendingCounts = new Map<string, number>();
    for (const item of verifiedInboxItems) {
        if (!sourceKeySet.has(item.sourceKey)) continue;
        if (item.status !== "unprocessed" && item.status !== "later") continue;
        pendingCounts.set(item.sourceKey, (pendingCounts.get(item.sourceKey) || 0) + 1);
    }

    const statuses = await loadReadingBookStatusesForMutationStrict(plugin);
    const updatedSourceKeys = new Set<string>();
    const updatedAt = Date.now();
    const nextStatuses = statuses.map((status) => {
        if (!sourceKeySet.has(status.sourceKey)) return status;
        updatedSourceKeys.add(status.sourceKey);
        const pendingCount = pendingCounts.get(status.sourceKey) || 0;
        return {
            ...status,
            hasNewNotes: pendingCount > 0,
            lastNewNoteCount: pendingCount,
            updatedAt,
        };
    });
    if (updatedSourceKeys.size === 0) return;

    await saveReadingBookStatusesStrict(plugin, nextStatuses);
    const verifiedStatuses = await loadReadingBookStatusesForMutationStrict(plugin);
    for (const sourceKey of updatedSourceKeys) {
        const expected = nextStatuses.find((status) => status.sourceKey === sourceKey);
        const actual = verifiedStatuses.find((status) => status.sourceKey === sourceKey);
        if (!expected || !actual
            || actual.hasNewNotes !== expected.hasNewNotes
            || actual.lastNewNoteCount !== expected.lastNewNoteCount) {
            throw new Error("保存后验证失败：reading_book_statuses");
        }
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
