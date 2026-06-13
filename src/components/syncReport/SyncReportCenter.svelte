<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { WereadSyncReport, WereadSyncReportItemStatus } from "../../types/syncReport";
    import { getLatestWereadSyncReport } from "../../utils/storage/syncReportStorage";
    import { formatWereadSyncReportMarkdown } from "../../utils/storage/syncReportBuilder";
    import { openDoc } from "../../utils/openDoc";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let plugin: any;

    const dispatch = createEventDispatcher();

    let latestReport: WereadSyncReport | null = null;
    let isLoading = true;
    let filterStatus: WereadSyncReportItemStatus | "all" = "all";

    const filterOptions: { key: WereadSyncReportItemStatus | "all"; label: string }[] = [
        { key: "all", label: "全部" },
        { key: "success", label: "成功" },
        { key: "failed", label: "失败" },
        { key: "skipped", label: "跳过" },
        { key: "new_source", label: "新来源" },
        { key: "not_ready", label: "未就绪" },
        { key: "warning", label: "警告" },
    ];

    onMount(async () => {
        try {
            latestReport = await getLatestWereadSyncReport(plugin);
        } catch (error) {
            console.error("[SyncReportCenter] load report failed:", error);
        } finally {
            isLoading = false;
        }
    });

    function handleBack() {
        dispatch("back");
    }

    function formatTime(ts?: number): string {
        if (!ts) return "--";
        try {
            return new Date(ts).toLocaleString("zh-CN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "--";
        }
    }

    function getStatusText(status: string): string {
        const map: Record<string, string> = {
            success: "成功",
            partial: "部分成功",
            partial_success: "部分成功",
            failed: "失败",
            running: "进行中",
            cancelled: "已取消",
        };
        return map[status] ?? status;
    }

    function getStatusColor(status: string): string {
        const map: Record<string, string> = {
            success: "#4CAF50",
            partial: "#FF9800",
            partial_success: "#FF9800",
            failed: "#F44336",
            running: "#2196F3",
            cancelled: "#9E9E9E",
            skipped: "#9E9E9E",
            new_source: "#2196F3",
            not_ready: "#FF9800",
            warning: "#FF9800",
        };
        return map[status] ?? "#9E9E9E";
    }

    function getTriggerText(trigger: string): string {
        const map: Record<string, string> = {
            manual: "手动同步",
            auto: "自动同步",
            update: "更新同步",
            test: "测试",
            background: "后台同步",
        };
        return map[trigger] ?? trigger;
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
        return map[status] ?? status;
    }

    async function copyReport() {
        if (!latestReport) return;
        const text = formatWereadSyncReportMarkdown(latestReport);
        try {
            await navigator.clipboard.writeText(text);
            showMessage("已复制诊断报告");
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }

    function openReportDoc(noteDocId?: string) {
        if (!noteDocId) {
            showMessage("该来源暂无可打开的本地笔记");
            return;
        }
        openDoc(plugin, noteDocId, 1);
    }

    function openSyncPanelForFailedItems() {
        dispatch("retryFailed", {
            bookIDs: latestReport?.items.filter((item) => item.status === "failed").map((item) => item.bookID).filter(Boolean) || [],
        });
    }

    $: filteredItems = latestReport
        ? filterStatus === "all"
            ? latestReport.items
            : latestReport.items.filter((item) => item.status === filterStatus)
        : [];
</script>

<div class="sync-report-center">
    <div class="sync-report-header">
        <button class="sync-report-back" on:click={handleBack}>
            <SiYuanIcon name="back" size={16} className="sync-report-back-icon" />
            <span>返回总览</span>
        </button>
        <div class="sync-report-breadcrumb">
            <span class="breadcrumb-root">阅读总控制台</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">同步诊断中心</span>
        </div>
    </div>

    <div class="sync-report-body">
        <div class="sync-report-card">
            <div class="sync-report-card-header">
                <h2 class="sync-report-title">同步诊断中心</h2>
                <p class="sync-report-desc">查看最近一次同步的详细结果与诊断信息</p>
            </div>

            {#if isLoading}
                <div class="sync-report-loading">
                    <div class="sync-report-spinner"></div>
                    <p>加载中...</p>
                </div>
            {:else if !latestReport}
                <div class="sync-report-empty">
                    <div class="sync-report-empty-icon">
                        <SiYuanIcon name="diagnostics" size={48} />
                    </div>
                    <p class="sync-report-empty-text">暂无同步报告</p>
                    <p class="sync-report-empty-hint">后续同步完成后将在这里展示诊断结果</p>
                </div>
            {:else}
                <div class="sync-report-summary">
                    <div class="sync-report-summary-row">
                        <div class="sync-report-summary-item">
                            <span class="sync-report-summary-label">同步时间</span>
                            <span class="sync-report-summary-value">{formatTime(latestReport.startedAt)}</span>
                        </div>
                        <div class="sync-report-summary-item">
                            <span class="sync-report-summary-label">触发方式</span>
                            <span class="sync-report-summary-value">{getTriggerText(latestReport.trigger)}</span>
                        </div>
                        <div class="sync-report-summary-item">
                            <span class="sync-report-summary-label">整体状态</span>
                            <span class="sync-report-summary-value" style="color: {getStatusColor(latestReport.status)}">
                                {getStatusText(latestReport.status)}
                            </span>
                        </div>
                    </div>
                    <div class="sync-report-stats">
                        <div class="sync-report-stat">
                            <span class="sync-report-stat-value">{latestReport.totalSources}</span>
                            <span class="sync-report-stat-label">总来源</span>
                        </div>
                        <div class="sync-report-stat">
                            <span class="sync-report-stat-value" style="color: #4CAF50">{latestReport.successCount}</span>
                            <span class="sync-report-stat-label">成功</span>
                        </div>
                        <div class="sync-report-stat">
                            <span class="sync-report-stat-value" style="color: #F44336">{latestReport.failedCount}</span>
                            <span class="sync-report-stat-label">失败</span>
                        </div>
                        <div class="sync-report-stat">
                            <span class="sync-report-stat-value" style="color: #FF9800">{latestReport.skippedCount}</span>
                            <span class="sync-report-stat-label">跳过</span>
                        </div>
                        <div class="sync-report-stat">
                            <span class="sync-report-stat-value" style="color: #2196F3">{latestReport.newSourceCount}</span>
                            <span class="sync-report-stat-label">新增</span>
                        </div>
                    </div>
                    <div class="sync-report-actions">
                        <button class="sync-report-action-btn" on:click={copyReport}>复制诊断报告</button>
                        <button
                            class="sync-report-action-btn"
                            disabled={latestReport.failedCount === 0}
                            on:click={openSyncPanelForFailedItems}
                        >前往同步面板处理</button>
                    </div>
                </div>

                <div class="subpage-toolbar">
                    <div class="subpage-toolbar-group">
                        {#each filterOptions as opt (opt.key)}
                            <button
                                class:active={filterStatus === opt.key}
                                on:click={() => (filterStatus = opt.key)}
                            >
                                {opt.label}
                            </button>
                        {/each}
                    </div>
                </div>

                {#if filteredItems.length > 0}
                    <div class="sync-report-list">
                        {#each filteredItems as item (`${item.sourceType}:${item.bookID}:${item.status}`)}
                            <div class="sync-report-list-item">
                                <div class="sync-report-item-main">
                                    <span class="sync-report-item-title">{item.title}</span>
                                    <span
                                        class="sync-report-item-badge"
                                        style="background: color-mix(in srgb, {getStatusColor(item.status)} 10%, transparent); color: {getStatusColor(item.status)}"
                                    >
                                        {getItemStatusText(item.status)}
                                    </span>
                                </div>
                                {#if item.reasonText && item.status !== "success"}
                                    <p class="sync-report-item-reason">{item.reasonText}</p>
                                {/if}
                                {#if item.suggestion && item.status !== "success"}
                                    <p class="sync-report-item-suggestion">建议：{item.suggestion}</p>
                                {/if}
                                <div class="sync-report-item-meta">
                                    {#if item.status === "success"}
                                        {#if typeof item.newBookmarkCount === "number" && typeof item.newReviewCount === "number"}
                                            {#if item.newBookmarkCount + item.newReviewCount > 0}
                                                <span>新增划线 {item.newBookmarkCount}，新增想法 {item.newReviewCount}</span>
                                            {:else}
                                                <span>本次无新增笔记</span>
                                            {/if}
                                        {:else}
                                            <span>新增统计：未记录</span>
                                        {/if}
                                    {:else}
                                        {#if item.reasonCode && item.reasonCode !== "UNKNOWN_ERROR"}
                                            <span>{item.reasonCode}</span>
                                        {/if}
                                    {/if}
                                </div>
                                <div class="sync-report-item-actions">
                                    <button class="sync-report-item-btn" on:click={() => openReportDoc(item.noteDocId)}>打开笔记</button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="sync-report-list-empty">
                        <p>该筛选条件下暂无记录</p>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</div>

<style>
    .sync-report-center {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: linear-gradient(
            180deg,
            var(--b3-theme-background, #f5f5f5) 0%,
            color-mix(in srgb, var(--b3-theme-background, #f5f5f5) 95%, var(--b3-theme-surface, #fff)) 100%
        );
    }

    .sync-report-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px clamp(16px, 2vw, 32px);
        background: var(--b3-theme-surface, #fff);
        border-bottom: 1px solid var(--b3-theme-border, #e0e0e0);
        flex-shrink: 0;
    }

    .sync-report-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--b3-theme-background, #f5f5f5);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--b3-theme-on-surface, #1a1a1a);
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .sync-report-back:hover {
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
    }

    .sync-report-breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #666);
    }

    .breadcrumb-root {
        color: var(--b3-theme-on-surface-light, #888);
    }

    .breadcrumb-separator {
        color: var(--b3-theme-border, #ccc);
    }

    .breadcrumb-current {
        color: var(--b3-theme-on-surface, #1a1a1a);
        font-weight: 500;
    }

    .sync-report-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: clamp(12px, 1.5vw, 20px) clamp(16px, 2vw, 32px);
    }

    .sync-report-card {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 12px;
        overflow: hidden;
    }

    .sync-report-card-header {
        padding: 16px clamp(16px, 2vw, 32px);
        background: var(--b3-theme-surface-light, #f8f9fa);
        border-bottom: 1px solid var(--b3-theme-border, #e0e0e0);
    }

    .sync-report-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin: 0 0 4px 0;
    }

    .sync-report-desc {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #666);
        margin: 0;
    }

    .sync-report-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px;
        color: var(--b3-theme-on-background-light, #666);
    }

    .sync-report-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--b3-theme-border, #e0e0e0);
        border-top-color: var(--b3-theme-primary, #4CAF50);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 12px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .sync-report-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 24px;
        text-align: center;
    }

    .sync-report-empty-icon {
        width: 48px;
        height: 48px;
        color: var(--b3-theme-on-surface-light, #ccc);
        margin-bottom: 16px;
    }

    .sync-report-empty-text {
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin: 0 0 4px 0;
    }

    .sync-report-empty-hint {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #888);
        margin: 0;
    }

    .sync-report-summary {
        padding: 16px clamp(16px, 2vw, 32px);
        border-bottom: 1px solid var(--b3-theme-border, #e0e0e0);
    }

    .sync-report-summary-row {
        display: flex;
        flex-wrap: wrap;
        gap: 16px 32px;
        margin-bottom: 16px;
    }

    .sync-report-summary-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .sync-report-summary-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #888);
    }

    .sync-report-summary-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    .sync-report-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .sync-report-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
    }

    .sync-report-action-btn,
    .sync-report-item-btn {
        padding: 6px 12px;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        cursor: pointer;
        font-size: 12px;
    }

    .sync-report-action-btn:hover,
    .sync-report-item-btn:hover {
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
    }

    .sync-report-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .sync-report-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 16px;
        background: var(--b3-theme-background, #f5f5f5);
        border-radius: 8px;
        min-width: 64px;
    }

    .sync-report-stat-value {
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
    }

    .sync-report-stat-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #888);
    }

    .subpage-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        height: auto;
        min-height: unset;
        overflow: visible;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
        box-sizing: border-box;
        margin-bottom: 14px;
    }

    .subpage-toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        flex: 1 1 420px;
        min-width: 0;
    }

    .subpage-toolbar-group button {
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border-radius: 999px;
        box-sizing: border-box;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
    }

    .subpage-toolbar-group button:hover {
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .subpage-toolbar-group button.active {
        color: var(--b3-theme-on-primary, #fff);
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .sync-report-list {
        padding: 8px clamp(16px, 2vw, 32px) 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .sync-report-list-item {
        padding: 12px 14px;
        background: var(--b3-theme-background, #f5f5f5);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 8px;
    }

    .sync-report-item-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
    }

    .sync-report-item-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    .sync-report-item-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
        flex-shrink: 0;
    }

    .sync-report-item-reason {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #666);
        margin: 4px 0 6px 0;
        line-height: 1.4;
    }

    .sync-report-item-suggestion {
        font-size: 12px;
        color: var(--b3-theme-primary, #4CAF50);
        margin: 4px 0 6px 0;
        line-height: 1.4;
    }

    .sync-report-item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #888);
    }

    .sync-report-item-actions {
        margin-top: 8px;
    }

    .sync-report-list-empty {
        padding: 32px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #888);
        font-size: 13px;
    }
</style>
