import { showMessage } from "siyuan";
import type { ReadingInboxItem } from "../../types/readingInbox";
import type { WereadSyncReportItem } from "../../types/syncReport";
import { openDoc } from "../openDoc";
import type {
    WereadBlockIndexedItem,
    WereadNoteUnitBlockIndex,
    WereadSourceBlockIndex,
} from "../weread/incremental/types";
import type { LocatedBlock, ReadingManagementSourceType } from "./types";

export function toManagedSourceType(sourceType?: string): ReadingManagementSourceType {
    return sourceType === "mp" || sourceType === "weread-mp" || sourceType === "weread_mp_account"
        ? "mp"
        : "book";
}

export function toBlockSourceKey(sourceType: ReadingManagementSourceType, bookID?: string): string {
    return `${sourceType}:${String(bookID || "").trim()}`;
}

export function toReadingSourceKey(sourceType: ReadingManagementSourceType, bookID?: string): string {
    return `${sourceType === "mp" ? "weread-mp" : "weread-book"}:${String(bookID || "").trim()}`;
}

export function normalizeSourceKeyForBlockIndex(sourceKey?: string, sourceType?: string, bookID?: string): string {
    const raw = String(sourceKey || "").trim();
    if (raw.startsWith("book:") || raw.startsWith("mp:")) return raw;

    if (raw.startsWith("weread-book:")) return raw.replace(/^weread-book:/, "book:");
    if (raw.startsWith("weread-mp:")) return raw.replace(/^weread-mp:/, "mp:");

    return toBlockSourceKey(toManagedSourceType(sourceType), bookID);
}

export function locateInboxItemBlock(
    inboxItem: ReadingInboxItem,
    blockIndex: WereadNoteUnitBlockIndex | null | undefined
): LocatedBlock | null {
    const sourceKey = normalizeSourceKeyForBlockIndex(inboxItem.sourceKey, inboxItem.sourceType, inboxItem.bookID);
    const sourceIndex = blockIndex?.sources?.[sourceKey];
    if (!sourceIndex?.items) return null;

    const ids = new Set(
        [
            inboxItem.originalId,
            (inboxItem as any).bookmarkId,
            (inboxItem as any).reviewId,
            (inboxItem as any).itemId,
        ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    );
    const range = String((inboxItem as any).range || "").trim();
    const articleID = String((inboxItem as any).articleID || (inboxItem as any).articleId || "").trim();

    for (const indexed of Object.values(sourceIndex.items)) {
        if (matchesIndexedItem(indexed, ids, range, articleID)) {
            return toLocatedBlock(indexed, sourceIndex);
        }
    }

    return null;
}

export function locateSyncReportItemBlock(
    reportItem: WereadSyncReportItem,
    blockIndex: WereadNoteUnitBlockIndex | null | undefined
): LocatedBlock | null {
    const sourceKey = normalizeSourceKeyForBlockIndex(reportItem.sourceKey, reportItem.sourceType, reportItem.bookID);
    const sourceIndex = blockIndex?.sources?.[sourceKey];
    return locateFirstIndexedItem(sourceIndex);
}

export function locateBookFirstManagedBlock(
    sourceKey: string,
    blockIndex: WereadNoteUnitBlockIndex | null | undefined
): LocatedBlock | null {
    const normalized = normalizeSourceKeyForBlockIndex(sourceKey);
    return locateFirstIndexedItem(blockIndex?.sources?.[normalized]);
}

export function openSiyuanBlock(plugin: any, blockId?: string): boolean {
    if (!blockId) return false;
    openDoc(plugin, blockId, 1);
    return true;
}

export function openSiyuanDoc(plugin: any, docId?: string): boolean {
    if (!docId) return false;
    openDoc(plugin, docId, 1);
    return true;
}

export function openLocatedBlock(plugin: any, locatedBlock?: LocatedBlock | null): boolean {
    const blockId = locatedBlock?.headBlockId || locatedBlock?.tailBlockId || locatedBlock?.blockIds?.[0];
    if (openSiyuanBlock(plugin, blockId)) return true;
    if (openSiyuanDoc(plugin, locatedBlock?.docBlockID)) return true;

    showMessage("该同步块可能已被删除或索引已失效，请重新同步这本书。");
    return false;
}

function locateFirstIndexedItem(sourceIndex?: WereadSourceBlockIndex): LocatedBlock | null {
    if (!sourceIndex?.items) return null;
    const first = Object.values(sourceIndex.items)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .find((item) => item.headBlockId || item.tailBlockId || item.blockIds?.length > 0);
    return first ? toLocatedBlock(first, sourceIndex) : null;
}

function matchesIndexedItem(
    indexed: WereadBlockIndexedItem,
    ids: Set<string>,
    range: string,
    articleID: string
): boolean {
    const meta = indexed.meta || {};
    const bookmarkIds = toStringArray(meta.bookmarkIds);
    const reviewIds = toStringArray(meta.reviewIds);
    const bookmarkOriginalIds = toStringArray(meta.bookmarkOriginalIds);
    const reviewOriginalIds = toStringArray(meta.reviewOriginalIds);
    const metaIds = [
        ...bookmarkIds,
        ...reviewIds,
        ...bookmarkOriginalIds,
        ...reviewOriginalIds,
        meta.bookmarkId,
        meta.reviewId,
        meta.originalId,
        meta.itemId,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    if (metaIds.some((id) => ids.has(id))) return true;
    if (range && String(meta.range || "").trim() === range) {
        // range 命中即可（普通书/公众号 note 的辅助匹配）
        return true;
    }
    // articleID 不能单独命中，必须和 range 同时命中
    if (articleID && range &&
        String(meta.articleID || meta.articleId || "").trim() === articleID &&
        String(meta.range || "").trim() === range) {
        return true;
    }

    return false;
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    const text = String(value || "").trim();
    return text ? [text] : [];
}

function toLocatedBlock(indexed: WereadBlockIndexedItem, sourceIndex: WereadSourceBlockIndex): LocatedBlock {
    return {
        itemId: indexed.itemId,
        sourceKey: indexed.sourceKey,
        sourceType: indexed.sourceType,
        itemKind: indexed.itemKind,
        blockIds: indexed.blockIds || [],
        headBlockId: indexed.headBlockId,
        tailBlockId: indexed.tailBlockId,
        docBlockID: sourceIndex.docBlockID,
    };
}
