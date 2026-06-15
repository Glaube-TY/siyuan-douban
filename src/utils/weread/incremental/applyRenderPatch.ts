import { getChildBlocks } from "@/api";
import {
    createIndexedItemFromRenderItem,
    deleteBlockGroup,
    deleteBlocksAfterPositionMark,
    insertMarkdownAfterAndCollectTopBlocks,
    moveBlockGroupAfter,
    setWereadManagedAttrsForBlockGroup,
} from "./blockOps";
import type {
    WereadBlockIndexedItem,
    WereadIncrementalSyncStats,
    WereadRenderItem,
    WereadRenderPatch,
    WereadRenderModel,
    WereadSourceBlockIndex,
} from "./types";

function createEmptyStats(rebuilt: boolean): WereadIncrementalSyncStats {
    return {
        added: 0,
        changed: 0,
        deleted: 0,
        unchanged: 0,
        blockOperationCount: 0,
        rebuilt,
    };
}

function getSyncableItems(items: WereadRenderItem[]): WereadRenderItem[] {
    return items.filter(item => typeof item.markdown === "string" && item.markdown.trim().length > 0);
}

function findInsertIndex(order: string[], previousID: string): number {
    const index = order.indexOf(previousID);
    return index < 0 ? order.length : index + 1;
}

function removeFromOrder(order: string[], blockIds: string[]): string[] {
    const removeSet = new Set(blockIds);
    return order.filter(id => !removeSet.has(id));
}

function insertAfter(order: string[], previousID: string, blockIds: string[]): string[] {
    const cleaned = removeFromOrder(order, blockIds);
    const insertIndex = findInsertIndex(cleaned, previousID);
    cleaned.splice(insertIndex, 0, ...blockIds);
    return cleaned;
}

function isImmediatelyAfter(order: string[], previousID: string, blockIds: string[]): boolean {
    if (blockIds.length === 0) return false;
    const start = findInsertIndex(order, previousID);
    for (let i = 0; i < blockIds.length; i++) {
        if (order[start + i] !== blockIds[i]) return false;
    }
    return true;
}

function createSourceIndex(params: {
    model: WereadRenderModel;
    docBlockID: string;
    positionMark: string;
    positionMarkBlockID: string;
    syncedAt: number;
    items: Record<string, WereadBlockIndexedItem>;
}): WereadSourceBlockIndex {
    return {
        sourceKey: params.model.sourceKey,
        sourceType: params.model.sourceType,
        bookID: params.model.bookID,
        title: params.model.title,
        docBlockID: params.docBlockID,
        positionMark: params.positionMark,
        positionMarkBlockID: params.positionMarkBlockID,
        templateHash: params.model.templateHash,
        updatedTime: params.model.updatedTime,
        lastSyncedAt: params.syncedAt,
        items: params.items,
    };
}

export async function rebuildManagedRegionWithRenderItems(params: {
    docBlockID: string;
    positionMark: string;
    positionMarkBlockID: string;
    model: WereadRenderModel;
}): Promise<{
    sourceIndex: WereadSourceBlockIndex;
    stats: WereadIncrementalSyncStats;
}> {
    const stats = createEmptyStats(true);
    const syncedAt = Date.now();
    stats.blockOperationCount += await deleteBlocksAfterPositionMark({
        docBlockID: params.docBlockID,
        positionMarkBlockID: params.positionMarkBlockID,
    });

    const indexedItems: Record<string, WereadBlockIndexedItem> = {};
    let previousID = params.positionMarkBlockID;

    for (const item of getSyncableItems(params.model.items)) {
        const blockIds = await insertMarkdownAfterAndCollectTopBlocks({
            docBlockID: params.docBlockID,
            previousID,
            markdown: item.markdown,
        });
        stats.blockOperationCount++;

        await setWereadManagedAttrsForBlockGroup(item, blockIds);
        stats.blockOperationCount += blockIds.length;

        const indexed = createIndexedItemFromRenderItem(item, blockIds, syncedAt);
        indexedItems[item.itemId] = indexed;
        previousID = indexed.tailBlockId;
        stats.added++;
    }

    return {
        sourceIndex: createSourceIndex({
            model: params.model,
            docBlockID: params.docBlockID,
            positionMark: params.positionMark,
            positionMarkBlockID: params.positionMarkBlockID,
            syncedAt,
            items: indexedItems,
        }),
        stats,
    };
}

export async function applyRenderPatch(params: {
    docBlockID: string;
    positionMark: string;
    positionMarkBlockID: string;
    model: WereadRenderModel;
    patch: WereadRenderPatch;
}): Promise<{
    sourceIndex: WereadSourceBlockIndex;
    stats: WereadIncrementalSyncStats;
}> {
    const stats = createEmptyStats(false);
    const syncedAt = Date.now();
    const indexedItems: Record<string, WereadBlockIndexedItem> = {};
    const changedMap = new Map(params.patch.changed.map(item => [item.next.itemId, item]));
    const addedSet = new Set(params.patch.added.map(item => item.itemId));
    const unchangedMap = new Map(params.patch.unchanged.map(item => [item.next.itemId, item]));

    let currentOrder = (await getChildBlocks(params.docBlockID) || []).map(block => block.id);

    for (const item of params.patch.deleted) {
        stats.blockOperationCount += await deleteBlockGroup(item.blockIds);
        currentOrder = removeFromOrder(currentOrder, item.blockIds);
        stats.deleted++;
    }

    for (const item of params.patch.changed) {
        stats.blockOperationCount += await deleteBlockGroup(item.previous.blockIds);
        currentOrder = removeFromOrder(currentOrder, item.previous.blockIds);
    }

    let previousID = params.positionMarkBlockID;

    for (const item of getSyncableItems(params.patch.orderedItems)) {
        if (addedSet.has(item.itemId) || changedMap.has(item.itemId)) {
            const blockIds = await insertMarkdownAfterAndCollectTopBlocks({
                docBlockID: params.docBlockID,
                previousID,
                markdown: item.markdown,
            });
            stats.blockOperationCount++;
            currentOrder = insertAfter(currentOrder, previousID, blockIds);

            await setWereadManagedAttrsForBlockGroup(item, blockIds);
            stats.blockOperationCount += blockIds.length;

            const indexed = createIndexedItemFromRenderItem(item, blockIds, syncedAt);
            indexedItems[item.itemId] = indexed;
            previousID = indexed.tailBlockId;

            if (addedSet.has(item.itemId)) {
                stats.added++;
            } else {
                stats.changed++;
            }
            continue;
        }

        const unchanged = unchangedMap.get(item.itemId);
        if (!unchanged) continue;

        const blockIds = unchanged.previous.blockIds;
        if (!isImmediatelyAfter(currentOrder, previousID, blockIds)) {
            stats.blockOperationCount += await moveBlockGroupAfter(blockIds, previousID);
            currentOrder = insertAfter(currentOrder, previousID, blockIds);
        }

        indexedItems[item.itemId] = {
            ...unchanged.previous,
            sortKey: item.sortKey,
            order: item.order,
            meta: item.meta || unchanged.previous.meta || {},
            lastSyncedAt: unchanged.previous.lastSyncedAt || syncedAt,
        };
        previousID = blockIds[blockIds.length - 1] || previousID;
        stats.unchanged++;
    }

    return {
        sourceIndex: createSourceIndex({
            model: params.model,
            docBlockID: params.docBlockID,
            positionMark: params.positionMark,
            positionMarkBlockID: params.positionMarkBlockID,
            syncedAt,
            items: indexedItems,
        }),
        stats,
    };
}

