import type { WereadApiNormalBooksSyncResult } from "../weread/api/syncWereadApiNormalBooks";
import type { WereadApiMpAccountsSyncResult } from "../weread/api/syncWereadApiMpAccounts";
import type {
    WereadSyncReport,
    WereadSyncReportItem,
    WereadSyncReportItemStatus,
    WereadSyncReportReasonCode,
    WereadSyncReportStatus,
} from "../../types/syncReport";
import { appendWereadSyncReport, getWereadSourceKey, upsertReadingBookStatus } from "./readingStorage";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export interface BuildSyncReportInput {
    startedAt: number;
    endedAt?: number;
    trigger: WereadSyncReport["trigger"];
    normalResult?: WereadApiNormalBooksSyncResult | null;
    mpResult?: WereadApiMpAccountsSyncResult | null;
    warnings?: string[];
    errors?: string[];
    cancelled?: boolean;
}

export function buildWereadSyncReport(input: BuildSyncReportInput): WereadSyncReport {
    const endedAt = input.endedAt || Date.now();
    const normalItems = (input.normalResult?.items || [])
        .filter((item) => item.status !== "skipped_mp")
        .map((item): WereadSyncReportItem => {
        const status = mapNormalStatus(item.status);
        const reasonCode = status === "success" ? undefined : inferReasonCode(item.message, item.status);
        return {
            sourceKey: item.bookID ? getWereadSourceKey("book", item.bookID) : undefined,
            sourceType: "book",
            bookID: item.bookID,
            title: item.title || "未命名书籍",
            status,
            reasonCode,
            reasonText: item.message,
            noteDocId: item.blockID,
            newBookmarkCount: item.newBookmarkCount || 0,
            newReviewCount: item.newReviewCount || 0,
            suggestion: getReasonSuggestion(reasonCode),
            endedAt,
            addedItemCount: item.addedItemCount,
            changedItemCount: item.changedItemCount,
            deletedItemCount: item.deletedItemCount,
            unchangedItemCount: item.unchangedItemCount,
            blockOperationCount: item.blockOperationCount,
            rebuilt: item.rebuilt,
        };
    });

    const mpItems = (input.mpResult?.items || [])
        .filter((item) => item.status !== "skipped_normal_book")
        .map((item): WereadSyncReportItem => {
        const status = mapMpStatus(item.status);
        const reasonCode = status === "success" ? undefined : inferReasonCode(item.message, item.status);
        return {
            sourceKey: item.bookID ? getWereadSourceKey("mp", item.bookID) : undefined,
            sourceType: "mp",
            bookID: item.bookID,
            title: item.title || "未命名公众号",
            status,
            reasonCode,
            reasonText: item.message,
            noteDocId: item.blockID,
            newBookmarkCount: item.newBookmarkCount || 0,
            newReviewCount: item.newReviewCount || 0,
            suggestion: getReasonSuggestion(reasonCode),
            endedAt,
            addedItemCount: item.addedItemCount,
            changedItemCount: item.changedItemCount,
            deletedItemCount: item.deletedItemCount,
            unchangedItemCount: item.unchangedItemCount,
            blockOperationCount: item.blockOperationCount,
            rebuilt: item.rebuilt,
        };
    });

    const items = [...normalItems, ...mpItems];
    const successCount = items.filter((item) => item.status === "success").length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const skippedCount = items.filter((item) => item.status === "skipped" || item.status === "not_ready").length;
    const newSourceCount = items.filter((item) => item.status === "new_source").length;
    const totalSources = items.length;
    const errors = [...(input.errors || [])];
    const warnings = [...(input.warnings || [])];

    const status = getReportStatus({
        cancelled: input.cancelled,
        totalSources,
        successCount,
        failedCount,
        errors,
    });

    return {
        id: `sync_${input.startedAt}_${Math.random().toString(36).slice(2, 8)}`,
        startedAt: input.startedAt,
        endedAt,
        trigger: input.trigger,
        status,
        totalSources,
        successCount,
        failedCount,
        skippedCount,
        newSourceCount,
        items,
        warnings,
        errors,
    };
}

export async function saveWereadSyncReportAndApplyStatus(plugin: PluginLike, report: WereadSyncReport): Promise<void> {
    await appendWereadSyncReport(plugin, sanitizeWereadSyncReport(report));

    const now = report.endedAt || Date.now();
    const writableStatuses = new Set(["success", "failed", "not_ready", "warning", "new_source"]);
    for (const item of report.items) {
        if (!item.sourceKey || !item.bookID) continue;
        if (!writableStatuses.has(item.status)) continue;
        await upsertReadingBookStatus(plugin, {
            sourceKey: item.sourceKey,
            sourceType: item.sourceType === "mp" ? "weread-mp" : "weread-book",
            bookID: item.bookID,
            title: item.title,
            noteDocId: item.noteDocId,
            lastSyncedAt: item.status === "success" ? now : undefined,
            syncFailed: item.status === "failed",
            lastSyncError: item.status === "failed" ? item.reasonText || "同步失败" : "",
        });
    }
}

export function buildAndSanitizeWereadSyncReport(input: BuildSyncReportInput): WereadSyncReport {
    return sanitizeWereadSyncReport(buildWereadSyncReport(input));
}

export function sanitizeWereadSyncReport(report: WereadSyncReport): WereadSyncReport {
    return {
        ...report,
        warnings: report.warnings.map(maskSensitiveText),
        errors: report.errors.map(maskSensitiveText),
        items: report.items.map((item) => ({
            ...item,
            reasonText: item.reasonText ? maskSensitiveText(item.reasonText) : item.reasonText,
        })),
    };
}

export function formatWereadSyncReportMarkdown(report: WereadSyncReport): string {
    const safe = sanitizeWereadSyncReport(report);
    const lines: string[] = [];
    lines.push(`# 微信读书同步诊断报告`);
    lines.push("");
    lines.push(`- 状态：${getReportStatusText(safe.status)}`);
    lines.push(`- 触发方式：${getTriggerText(safe.trigger)}`);
    lines.push(`- 开始时间：${formatDateTime(safe.startedAt)}`);
    lines.push(`- 结束时间：${formatDateTime(safe.endedAt)}`);
    lines.push(`- 总来源：${safe.totalSources}`);
    lines.push(`- 成功：${safe.successCount}`);
    lines.push(`- 失败：${safe.failedCount}`);
    lines.push(`- 跳过：${safe.skippedCount}`);
    lines.push(`- 新来源：${safe.newSourceCount}`);
    lines.push("");

    if (safe.warnings.length > 0) {
        lines.push("## 警告");
        safe.warnings.forEach((warning) => lines.push(`- ${warning}`));
        lines.push("");
    }

    if (safe.errors.length > 0) {
        lines.push("## 错误");
        safe.errors.forEach((error) => lines.push(`- ${error}`));
        lines.push("");
    }

    lines.push("## 明细");
    if (safe.items.length === 0) {
        lines.push("- 暂无明细");
    } else {
        for (const item of safe.items) {
            lines.push(`- ${item.title} [${item.sourceType === "mp" ? "公众号" : "普通书"}]：${getItemStatusText(item.status)}${item.reasonText ? `，${item.reasonText}` : ""}`);
            if (item.suggestion) {
                lines.push(`  建议：${item.suggestion}`);
            }
        }
    }

    return lines.join("\n");
}

function mapNormalStatus(status: WereadApiNormalBooksSyncResult["items"][number]["status"]): WereadSyncReportItemStatus {
    if (status === "success") return "success";
    if (status === "failed") return "failed";
    if (status === "skipped_not_ready") return "not_ready";
    return "skipped";
}

function mapMpStatus(status: WereadApiMpAccountsSyncResult["items"][number]["status"]): WereadSyncReportItemStatus {
    if (status === "success") return "success";
    if (status === "failed") return "failed";
    if (status === "skipped_not_ready") return "not_ready";
    return "skipped";
}

function getReportStatus(input: {
    cancelled?: boolean;
    totalSources: number;
    successCount: number;
    failedCount: number;
    errors: string[];
}): WereadSyncReportStatus {
    if (input.cancelled) return "cancelled";
    if (input.errors.length > 0 && input.successCount === 0 && input.failedCount === 0) return "failed";
    if (input.failedCount > 0 && input.successCount > 0) return "partial_success";
    if (input.failedCount > 0 && input.successCount === 0) return "failed";
    if (input.successCount > 0) return "success";
    if (input.totalSources === 0) return "success";
    return "success";
}

function inferReasonCode(message = "", rawStatus = ""): WereadSyncReportReasonCode | undefined {
    if (rawStatus === "success" || /同步成功/.test(message)) return undefined;
    const text = `${message} ${rawStatus}`;
    if (!text.trim()) return undefined;
    if (/API Key|api key|认证|验证/.test(text)) return "API_KEY_INVALID";
    if (/请求|网络|fetch|HTTP|接口|TLS|timeout|handshake/.test(text)) return "API_REQUEST_FAILED";
    if (/bookID|bookId/.test(text) && /空|missing|缺失/.test(text)) return "BOOK_ID_IS_MISSING";
    if (/ISBN|isbn/.test(text) && /失败|找不到|未匹配/.test(text)) return "ISBN_MATCH_FAILED";
    if (/目标文档|本地文档|找不到|未找到/.test(text)) return "TARGET_DOC_NOT_FOUND";
    if (/未准备|not_ready|skipped_not_ready|匹配失败/.test(text)) return "TARGET_DOC_NOT_READY";
    if (/写入|块级同步|文档失败/.test(text)) return "WRITE_BLOCK_FAILED";
    if (/公众号|标题/.test(text) && /失败/.test(text)) return "MP_TITLE_RESOLVE_FAILED";
    if (/跳过|skipped/.test(text)) return "BOOK_SKIPPED_BY_USER";
    if (/新来源|未导入/.test(text)) return "NEW_SOURCE_NOT_IMPORTED";
    return "UNKNOWN_ERROR";
}

function getReasonSuggestion(code?: WereadSyncReportReasonCode): string {
    const map: Partial<Record<WereadSyncReportReasonCode, string>> = {
        API_KEY_INVALID: "请重新验证微信读书 API Key。",
        API_REQUEST_FAILED: "网络连接超时或请求失败，请稍后重试或检查网络代理。",
        TARGET_DOC_NOT_FOUND: "请先导入该书，或确认本地数据库里的 ISBN/bookID 是否正确。",
        TARGET_DOC_NOT_READY: "请完成新来源导入或重新匹配本地文档后再同步。",
        WRITE_BLOCK_FAILED: "请检查目标文档是否可写，然后重新同步失败项。",
        MP_TITLE_RESOLVE_FAILED: "可继续同步，后续再次同步会尝试补全公众号文章标题。",
        BOOK_SKIPPED_BY_USER: "这是跳过项，如需同步请取消忽略或使用强制同步。",
        NEW_SOURCE_NOT_IMPORTED: "请先在新来源确认弹窗中导入该来源。",
        BOOK_ID_IS_MISSING: "请检查缓存数据是否完整，重新拉取有笔记书籍列表。",
        ISBN_MATCH_FAILED: "请补充 ISBN 或使用 BookID 导入。",
        UNKNOWN_ERROR: "请复制诊断报告并查看控制台日志。",
    };
    return code ? map[code] || "" : "";
}

function maskSensitiveText(text: string): string {
    return String(text || "")
        .replace(/(api[_ -]?key["':=\s]+)([A-Za-z0-9._-]{8,})/gi, "$1***")
        .replace(/([?&]key=)([^&\s]+)/gi, "$1***")
        .replace(/(Authorization["':=\s]+Bearer\s+)([A-Za-z0-9._-]+)/gi, "$1***");
}

function formatDateTime(ts?: number): string {
    if (!ts) return "--";
    try {
        return new Date(ts).toLocaleString("zh-CN");
    } catch {
        return "--";
    }
}

function getReportStatusText(status: string): string {
    const map: Record<string, string> = {
        success: "成功",
        partial: "部分成功",
        partial_success: "部分成功",
        failed: "失败",
        running: "进行中",
        cancelled: "已取消",
        skipped_all: "已跳过",
    };
    return map[status] || status;
}

function getItemStatusText(status: string): string {
    const map: Record<string, string> = {
        success: "成功",
        failed: "失败",
        skipped: "跳过",
        new_source: "新来源",
        not_ready: "未就绪",
        warning: "警告",
    };
    return map[status] || status;
}

function getTriggerText(trigger: string): string {
    const map: Record<string, string> = {
        manual: "手动同步",
        auto: "自动同步",
        update: "更新同步",
        test: "测试",
        background: "后台同步",
    };
    return map[trigger] || trigger;
}
