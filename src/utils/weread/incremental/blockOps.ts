import { deleteBlock, getChildBlocks, insertBlock, moveBlock, setBlockAttrs } from "@/api";
import type { WereadBlockIndexedItem, WereadRenderItem } from "./types";

function uniqueStrings(values: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}

function flattenOperationIds(result: IResdoOperations[] | null | undefined): string[] {
    const ids: string[] = [];
    for (const item of result || []) {
        for (const op of item?.doOperations || []) {
            if (op?.id) ids.push(op.id);
        }
    }
    return uniqueStrings(ids);
}

export async function insertMarkdownAfterAndCollectTopBlocks(params: {
    docBlockID: string;
    previousID: string;
    markdown: string;
}): Promise<string[]> {
    const markdown = String(params.markdown || "");
    if (!markdown.trim()) return [];

    const beforeBlocks = await getChildBlocks(params.docBlockID) || [];
    const beforeIDs = new Set(beforeBlocks.map(block => block.id));

    const result = await insertBlock("markdown", markdown, undefined, params.previousID);
    const operationIDs = flattenOperationIds(result);

    const afterBlocks = await getChildBlocks(params.docBlockID) || [];
    const insertedIDs = afterBlocks
        .filter(block => !beforeIDs.has(block.id))
        .map(block => block.id);

    if (insertedIDs.length > 0) return insertedIDs;

    const afterIDs = new Set(afterBlocks.map(block => block.id));
    const fallbackIDs = operationIDs.filter(id => afterIDs.has(id));
    if (fallbackIDs.length > 0) return fallbackIDs;

    throw new Error("块级同步失败：插入同步单元后没有获取到块 ID");
}

export async function setWereadManagedAttrsForBlockGroup(item: WereadRenderItem, blockIds: string[]): Promise<void> {
    const attrs: Record<string, string> = {
        "custom-weread-managed": "true",
        "custom-weread-source-key": item.sourceKey,
        "custom-weread-source-type": item.sourceType,
        "custom-weread-item-id": item.itemId,
        "custom-weread-item-kind": item.itemKind,
        "custom-weread-source-hash": item.sourceHash,
        "custom-weread-render-hash": item.renderHash,
        "custom-weread-sync-version": "note-unit-v1",
    };

    for (const blockId of uniqueStrings(blockIds)) {
        await setBlockAttrs(blockId, attrs);
    }
}

export async function deleteBlockGroup(blockIds: string[]): Promise<number> {
    const unique = uniqueStrings(blockIds);
    const reversed = [...unique].reverse();
    let count = 0;
    for (const blockId of reversed) {
        await deleteBlock(blockId);
        count++;
    }
    return count;
}

export async function moveBlockGroupAfter(blockIds: string[], previousID: string): Promise<number> {
    let count = 0;
    let cursor = previousID;
    for (const blockId of uniqueStrings(blockIds)) {
        if (blockId === cursor) continue;
        await moveBlock(blockId, cursor);
        cursor = blockId;
        count++;
    }
    return count;
}

export async function deleteBlocksAfterPositionMark(params: {
    docBlockID: string;
    positionMarkBlockID: string;
}): Promise<number> {
    const childBlocks = await getChildBlocks(params.docBlockID) || [];
    const position = childBlocks.findIndex(block => block.id === params.positionMarkBlockID);
    if (position < 0) {
        throw new Error("微信读书同步位置标记不存在，无法重建受管区域");
    }

    const idsToDelete = childBlocks.slice(position + 1).map(block => block.id);
    return deleteBlockGroup(idsToDelete);
}

export function createIndexedItemFromRenderItem(
    item: WereadRenderItem,
    blockIds: string[],
    syncedAt: number
): WereadBlockIndexedItem {
    return {
        itemId: item.itemId,
        sourceKey: item.sourceKey,
        sourceType: item.sourceType,
        itemKind: item.itemKind,
        blockIds,
        headBlockId: blockIds[0] || "",
        tailBlockId: blockIds[blockIds.length - 1] || "",
        sortKey: item.sortKey,
        order: item.order,
        sourceHash: item.sourceHash,
        renderHash: item.renderHash,
        meta: item.meta || {},
        lastSyncedAt: syncedAt,
    };
}

