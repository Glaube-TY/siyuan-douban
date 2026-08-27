import type {
    ReadingReviewItem,
    ReadingReviewItemStatus,
    ReadingReviewRating,
} from "../../types/readingReview";
import type { RecentNoteView } from "../readingManagement/types";
import { createReadingId, STORAGE_KEYS } from "../storage/readingStorage";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";
import type { PluginLike as PluginStoragePluginLike } from "../storage/pluginStorageStrict";

type ReadingReviewPlugin = PluginStoragePluginLike & {
    saveData: (key: string, value: unknown) => Promise<void>;
};

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_STATUSES: ReadingReviewItemStatus[] = ["active", "done", "ignored"];
const REVIEW_STAGE_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;
// ponytail: one module-level queue is enough here; split by plugin only if parallel instances need throughput.
let reviewMutationQueue: Promise<void> = Promise.resolve();

export type ReadingReviewUpdateAction = ReadingReviewRating | "remove";

export interface ReadingReviewIntervalPreview {
    forgot: number;
    fuzzy: number;
    remembered: number;
}

export interface ReadingReviewQueueSummary {
    activeCount: number;
    dueCount: number;
    dueSourceCount: number;
}

export interface AddReadingReviewResult {
    added: boolean;
    alreadyExists: boolean;
    reactivated: boolean;
    item: ReadingReviewItem;
}

interface ReviewItemSaveExpectation {
    id: string;
    status: ReadingReviewItemStatus;
    nextReviewAt: number;
    content: string;
    blockId?: string;
    reviewStage?: number;
    lastRating?: ReadingReviewRating;
    lastIntervalDays?: number;
    reviewCount?: number;
    lastReviewAt?: number;
}

export async function loadReadingReviewItemsStrict(plugin: ReadingReviewPlugin): Promise<ReadingReviewItem[]> {
    const state = await loadPluginStorageJsonStateStrict(plugin, STORAGE_KEYS.reviewItems);
    if (!state.exists) return [];
    return validateReviewItems(state.value);
}

export async function loadReadingReviewItemsForMutationStrict(
    plugin: ReadingReviewPlugin,
): Promise<ReadingReviewItem[]> {
    return validateReviewItems(await loadReadingReviewItemsStrict(plugin), true);
}

async function saveReadingReviewItemsStrict(
    plugin: ReadingReviewPlugin,
    items: ReadingReviewItem[],
    expected?: ReviewItemSaveExpectation,
): Promise<ReadingReviewItem[]> {
    const validatedItems = validateReviewItems(items, true);
    await plugin.saveData(STORAGE_KEYS.reviewItems, items);

    const state = await loadPluginStorageJsonStateStrict(plugin, STORAGE_KEYS.reviewItems);
    if (!state.exists) {
        throw new Error("复习队列保存后未找到数据");
    }
    const verifiedItems = validateReviewItems(state.value, true);
    const expectedIds = new Set(validatedItems.map((item) => item.id));
    const actualIds = new Set(verifiedItems.map((item) => item.id));
    if (
        verifiedItems.length !== validatedItems.length ||
        actualIds.size !== verifiedItems.length ||
        expectedIds.size !== actualIds.size ||
        [...expectedIds].some((id) => !actualIds.has(id))
    ) {
        throw new Error("复习队列保存后校验失败");
    }

    if (expected) {
        const item = verifiedItems.find((entry) => entry.id === expected.id);
        if (
            !item ||
            item.status !== expected.status ||
            item.nextReviewAt !== expected.nextReviewAt ||
            item.content !== expected.content ||
            item.blockId !== expected.blockId ||
            (expected.reviewStage !== undefined && item.reviewStage !== expected.reviewStage) ||
            (expected.lastRating !== undefined && item.lastRating !== expected.lastRating) ||
            (expected.lastIntervalDays !== undefined && item.lastIntervalDays !== expected.lastIntervalDays) ||
            (expected.reviewCount !== undefined && item.reviewCount !== expected.reviewCount) ||
            (expected.lastReviewAt !== undefined && item.lastReviewAt !== expected.lastReviewAt)
        ) {
            throw new Error("复习条目保存后校验失败");
        }
    }

    return verifiedItems;
}

export function addRecentNoteToReview(
    plugin: ReadingReviewPlugin,
    item: RecentNoteView,
): Promise<AddReadingReviewResult> {
    return enqueueReviewMutation(async () => {
        const reviewItems = await loadReadingReviewItemsForMutationStrict(plugin);
        const id = createReadingId("review", [item.rawItem.id]);
        const existing = reviewItems.find((entry) => entry.id === id);
        if (existing?.status === "active") {
            return {
                added: false,
                alreadyExists: true,
                reactivated: false,
                item: existing,
            };
        }

        const now = Date.now();
        const comment = String(item.comment || "");
        const content = item.content
            ? String(item.content)
            : comment
                ? ""
                : String(item.summary || "");
        const nextReviewAt = now + DAY;
        const reviewFields = {
            inboxItemId: item.rawItem.id,
            sourceKey: item.sourceKey,
            bookID: item.rawItem.bookID,
            sourceType: item.rawItem.sourceType,
            itemType: item.rawItem.itemType,
            title: item.title,
            content,
            comment: comment || undefined,
            sectionLabel: item.sectionLabel,
            noteDocId: item.noteDocId,
            blockId: item.locatedBlock?.headBlockId
                || item.locatedBlock?.tailBlockId
                || item.locatedBlock?.blockIds?.[0],
            addedAt: now,
            nextReviewAt,
            reviewStage: 0,
            lastIntervalDays: 1,
            lastRating: undefined,
            status: "active" as const,
        };

        const nextItems = existing
            ? reviewItems.map((entry) => entry.id === id ? { ...entry, ...reviewFields } : entry)
            : [...reviewItems, {
                id,
                ...reviewFields,
                reviewCount: 0,
            }];
        const verifiedItems = await saveReadingReviewItemsStrict(plugin, nextItems, {
            id,
            status: "active",
            nextReviewAt,
            content,
            blockId: reviewFields.blockId,
            reviewStage: 0,
        });
        const verifiedItem = verifiedItems.find((entry) => entry.id === id);
        if (!verifiedItem) throw new Error("复习条目保存后无法确认");

        return {
            added: !existing,
            alreadyExists: false,
            reactivated: !!existing,
            item: verifiedItem,
        };
    });
}

export function updateReadingReviewItemStrict(
    plugin: ReadingReviewPlugin,
    id: string,
    action: ReadingReviewUpdateAction,
): Promise<ReadingReviewItem> {
    return enqueueReviewMutation(async () => {
        const reviewItems = await loadReadingReviewItemsForMutationStrict(plugin);
        const existing = reviewItems.find((entry) => entry.id === id);
        if (!existing) throw new Error("复习条目不存在");

        const updated: ReadingReviewItem = { ...existing };
        let expected: ReviewItemSaveExpectation;
        if (action === "remove") {
            updated.status = "ignored";
            expected = {
                id,
                status: updated.status,
                nextReviewAt: updated.nextReviewAt,
                content: updated.content,
                blockId: updated.blockId,
            };
        } else {
            const now = Date.now();
            const { nextStage, intervalDays } = calculateReviewResult(existing, action);

            updated.status = "active";
            updated.lastReviewAt = now;
            updated.reviewCount += 1;
            updated.reviewStage = nextStage;
            updated.lastRating = action;
            updated.lastIntervalDays = intervalDays;
            updated.nextReviewAt = now + intervalDays * DAY;
            expected = {
                id,
                status: updated.status,
                nextReviewAt: updated.nextReviewAt,
                content: updated.content,
                blockId: updated.blockId,
                reviewStage: nextStage,
                lastRating: action,
                lastIntervalDays: intervalDays,
                reviewCount: updated.reviewCount,
                lastReviewAt: now,
            };
        }

        const nextItems = reviewItems.map((item) => item.id === id ? updated : item);
        const verifiedItems = await saveReadingReviewItemsStrict(plugin, nextItems, expected);
        const verifiedItem = verifiedItems.find((item) => item.id === id);
        if (!verifiedItem) throw new Error("复习条目更新后无法确认");
        return verifiedItem;
    });
}

function resolveReviewStage(item: ReadingReviewItem): number {
    if (isValidReviewStage(item.reviewStage)) return item.reviewStage;
    return Math.min(
        Math.max(Math.floor(item.reviewCount || 0), 0),
        REVIEW_STAGE_DAYS.length - 1,
    );
}

function calculateReviewResult(
    item: ReadingReviewItem,
    rating: ReadingReviewRating,
): { nextStage: number; intervalDays: number } {
    const currentStage = resolveReviewStage(item);
    if (rating === "forgot") {
        return { nextStage: 0, intervalDays: REVIEW_STAGE_DAYS[0] };
    }
    if (rating === "fuzzy") {
        return {
            nextStage: currentStage,
            intervalDays: Math.max(2, Math.round(REVIEW_STAGE_DAYS[currentStage] / 2)),
        };
    }
    const nextStage = Math.min(currentStage + 1, REVIEW_STAGE_DAYS.length - 1);
    return { nextStage, intervalDays: REVIEW_STAGE_DAYS[nextStage] };
}

export function getReadingReviewIntervalPreview(item: ReadingReviewItem): ReadingReviewIntervalPreview {
    return {
        forgot: calculateReviewResult(item, "forgot").intervalDays,
        fuzzy: calculateReviewResult(item, "fuzzy").intervalDays,
        remembered: calculateReviewResult(item, "remembered").intervalDays,
    };
}

export async function loadReadingReviewQueueSummaryStrict(
    plugin: ReadingReviewPlugin,
): Promise<ReadingReviewQueueSummary> {
    const reviewItems = await loadReadingReviewItemsStrict(plugin);
    const now = Date.now();
    const activeItems = reviewItems.filter((item) => item.status === "active");
    const dueItems = activeItems.filter((item) => item.nextReviewAt <= now);
    return {
        activeCount: activeItems.length,
        dueCount: dueItems.length,
        dueSourceCount: new Set(dueItems.map((item) => item.sourceKey)).size,
    };
}

function enqueueReviewMutation<T>(task: () => Promise<T>): Promise<T> {
    const result = reviewMutationQueue.then(task, task);
    reviewMutationQueue = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

function validateReviewItems(value: unknown, requireUniqueIds = false): ReadingReviewItem[] {
    if (!Array.isArray(value)) {
        throw new Error("复习队列数据格式无效：必须是数组");
    }
    const items = value.map((item, index) => validateReviewItem(item, index));
    if (requireUniqueIds) {
        const ids = new Set(items.map((item) => item.id));
        if (ids.size !== items.length) {
            throw new Error("复习队列中存在重复 id，为避免数据丢失已取消写入");
        }
    }
    return items;
}

function validateReviewItem(value: unknown, index: number): ReadingReviewItem {
    if (!isPlainObject(value)) {
        throw new Error("复习队列第 " + (index + 1) + " 条记录必须是普通对象");
    }
    if (!isNonEmptyString(value.id) || !isNonEmptyString(value.sourceKey)) {
        throw new Error("复习队列第 " + (index + 1) + " 条记录缺少有效 id 或 sourceKey");
    }
    if (
        typeof value.title !== "string"
        || typeof value.content !== "string"
        || typeof value.nextReviewAt !== "number"
        || !Number.isFinite(value.nextReviewAt)
        || typeof value.reviewCount !== "number"
        || !Number.isFinite(value.reviewCount)
        || !Number.isInteger(value.reviewCount)
        || value.reviewCount < 0
        || !isReviewStatus(value.status)
    ) {
        throw new Error("复习队列第 " + (index + 1) + " 条记录格式无效");
    }
    if (
        !isOptionalString(value.comment)
        || !isOptionalString(value.sectionLabel)
        || !isOptionalString(value.noteDocId)
        || !isOptionalString(value.blockId)
        || !isOptionalFiniteNonNegativeNumber(value.addedAt)
        || !isOptionalFiniteNonNegativeNumber(value.lastReviewAt)
        || (value.reviewStage !== undefined && !isValidReviewStage(value.reviewStage))
        || (
            value.lastIntervalDays !== undefined
            && (
                typeof value.lastIntervalDays !== "number"
                || !Number.isFinite(value.lastIntervalDays)
                || value.lastIntervalDays <= 0
            )
        )
        || (value.lastRating !== undefined && !isReviewRating(value.lastRating))
    ) {
        throw new Error("复习队列第 " + (index + 1) + " 条记录可选字段格式无效");
    }
    return value as unknown as ReadingReviewItem;
}

function isValidReviewStage(value: unknown): value is number {
    return typeof value === "number"
        && Number.isFinite(value)
        && Number.isInteger(value)
        && value >= 0
        && value < REVIEW_STAGE_DAYS.length;
}

function isReviewRating(value: unknown): value is ReadingReviewRating {
    return value === "forgot" || value === "fuzzy" || value === "remembered";
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

function isOptionalFiniteNonNegativeNumber(value: unknown): value is number | undefined {
    return value === undefined
        || (
            typeof value === "number"
            && Number.isFinite(value)
            && value >= 0
        );
}

function isReviewStatus(value: unknown): value is ReadingReviewItemStatus {
    return REVIEW_STATUSES.includes(value as ReadingReviewItemStatus);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
