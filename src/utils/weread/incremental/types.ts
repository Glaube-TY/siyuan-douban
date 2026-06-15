export type WereadSourceType = "book" | "mp";

export type WereadRenderItemKind =
    | "book-meta"
    | "book-chapter"
    | "book-note"
    | "book-chapter-comment"
    | "book-global-comment"
    | "book-info"
    | "book-best-highlight"
    | "mp-account-meta"
    | "mp-article"
    | "mp-note";

export interface WereadRenderItem {
    itemId: string;
    sourceKey: string;
    sourceType: WereadSourceType;
    itemKind: WereadRenderItemKind;
    markdown: string;
    sortKey: string;
    order: number;
    sourceHash: string;
    renderHash: string;
    meta: Record<string, any>;
}

export interface WereadRenderModel {
    sourceKey: string;
    sourceType: WereadSourceType;
    bookID: string;
    title: string;
    updatedTime: number;
    templateHash: string;
    items: WereadRenderItem[];
    stats: {
        noteCount: number;
        highlightCount: number;
        reviewCount: number;
        chapterCount: number;
        articleCount?: number;
    };
}

export interface WereadNoteUnitBlockIndex {
    schemaVersion: 1;
    updatedAt: number;
    sources: Record<string, WereadSourceBlockIndex>;
}

export interface WereadSourceBlockIndex {
    sourceKey: string;
    sourceType: WereadSourceType;
    bookID: string;
    title: string;
    docBlockID: string;
    positionMark: string;
    positionMarkBlockID: string;
    templateHash: string;
    updatedTime: number;
    lastSyncedAt: number;
    items: Record<string, WereadBlockIndexedItem>;
}

export interface WereadBlockIndexedItem {
    itemId: string;
    sourceKey: string;
    sourceType: WereadSourceType;
    itemKind: WereadRenderItemKind;
    blockIds: string[];
    headBlockId: string;
    tailBlockId: string;
    sortKey: string;
    order: number;
    sourceHash: string;
    renderHash: string;
    meta: Record<string, any>;
    lastSyncedAt: number;
}

export interface WereadChangedRenderItem {
    previous: WereadBlockIndexedItem;
    next: WereadRenderItem;
}

export interface WereadUnchangedRenderItem {
    previous: WereadBlockIndexedItem;
    next: WereadRenderItem;
}

export interface WereadRenderPatch {
    sourceKey: string;
    added: WereadRenderItem[];
    changed: WereadChangedRenderItem[];
    deleted: WereadBlockIndexedItem[];
    unchanged: WereadUnchangedRenderItem[];
    orderedItems: WereadRenderItem[];
}

export interface WereadIncrementalSyncStats {
    added: number;
    changed: number;
    deleted: number;
    unchanged: number;
    blockOperationCount: number;
    rebuilt: boolean;
}

export interface WereadPluginLike {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<any>;
}

