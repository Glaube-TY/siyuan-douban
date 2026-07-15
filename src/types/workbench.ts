export type WorkbenchSearchSource = "local" | "douban" | "weread";

export interface WorkbenchSearchResult {
    id: string;
    source: WorkbenchSearchSource;
    title: string;
    author?: string;
    isbn?: string;
    cover?: string;
    bookID?: string;
    noteDocId?: string;
    description?: string;
    raw?: unknown;
}

export interface WorkbenchDatabaseStatus {
    configured: boolean;
    valid: boolean;
    blockID: string;
    avID: string;
    message: string;
}

export interface WorkbenchLocalAssetSummary {
    databaseStatus: WorkbenchDatabaseStatus;
    localBookCount: number | null;
    bookTemplateConfigured: boolean;
    addNotes: boolean;
    isSYTemplateRender: boolean;
    ratingsCount: number;
    categoriesCount: number;
    statusesCount: number;
}

export interface WorkbenchWereadAssetSummary {
    authConfigured: boolean;
    authVerified: boolean;
    apiKeyMasked: string;
    verifiedAt: number;
    lastError: string;
    notebookCount: number;
    noteCount: number;
    shelfBookCount: number | null;
    hasNotebookCache: boolean;
    hasReadingStatsCache: boolean;
    readingStatsLoadedAt?: number;
    lastSyncStatus: string;
    lastSyncTime?: number;
    lastSyncMessage?: string;
    lastSyncSuccessCount?: number;
    lastSyncFailedCount?: number;
    lastSyncSkippedCount?: number;
    autoSync: boolean;
    skipNewBookCheck: boolean;
    wereadBookTemplateConfigured?: boolean;
    wereadMpTemplateConfigured?: boolean;
    wereadTemplatesConfigured?: boolean;
}

export type WorkbenchAction =
    | "search"
    | "open-local-shelf"
    | "add-book"
    | "sync-weread"
    | "sync-weread-all"
    | "sync-weread-update"
    | "open-inbox"
    | "open-sync-changes"
    | "open-unbound-books"
    | "open-book-health"
    | "open-maintenance"
    | "open-diagnostics"
    | "open-database-settings"
    | "open-book-preferences"
    | "open-template-settings"
    | "open-weread-auth"
    | "open-sync-options"
    | "open-about"
    | "open-book-status"
    | "open-review"
    | "open-topics"
    | "open-digest"
    | "open-weread-notebooks"
    | "open-reading-stats"
    | "open-weread-book-management";
