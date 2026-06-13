/**
 * 阅读总控制台类型定义
 */

/** 概览卡片数据 */
export interface ReadingDashboardCard {
    id: string;
    title: string;
    value: string | number;
    icon: string;
    color: string;
    description?: string;
}

/** 快捷操作入口 */
export interface ReadingQuickAction {
    id: string;
    label: string;
    icon: string;
    iconType: "siyuan" | "image";
    description?: string;
    action: () => void;
}

/** 阅读总览数据（从本地缓存聚合） */
export interface ReadingCenterOverview {
    // 笔记本缓存数据
    noteBookCount: number;
    noteCount: number;
    hasNotebookCache: boolean;

    // 阅读统计缓存数据
    shelfBookCount: number;
    monthlyReadDays: number;
    weeklyReadingText: string;
    monthlyReadingText: string;
    annualReadingText: string;
    overallReadingText: string;
    readingStatsLoadedAt?: number;
    hasReadingStatsCache: boolean;

    // 占位字段（后续阶段接入）
    pendingReview: number;
    newHighlights: number;
    pendingBookCount: number;
    lastSyncStatus: "success" | "partial" | "partial_success" | "failed" | "running" | "cancelled" | "unknown";
    lastSyncTime?: number;
    lastSyncMessage?: string;
}

/** 最近新增笔记条目（占位） */
export interface RecentNoteChange {
    id: string;
    bookTitle: string;
    sourceType: "book" | "mp";
    newHighlightCount: number;
    newReviewCount: number;
    syncedAt: number;
}

/** 同步状态条目（占位） */
export interface SyncStatusItem {
    status: "success" | "failed" | "running" | "unknown";
    message: string;
    time?: number;
}

/** 旧功能区模块导航项 */
export interface FeatureTab {
    key: string;
    label: string;
    description: string;
    iconType: "siyuan" | "image";
    icon: string;
}
