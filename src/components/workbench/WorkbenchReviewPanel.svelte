<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { ReadingManagementSummary } from "../../utils/readingManagement/types";
    import { buildReadingManagementSummary } from "../../utils/readingManagement/managementData";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    let summary: ReadingManagementSummary | null = null;
    let lastRefreshKey = refreshKey;
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    async function load() {
        summary = await buildReadingManagementSummary(plugin);
    }

    function formatTime(timestamp?: number): string {
        if (!timestamp) return tx("reviewNoSyncRecord", "尚无同步记录");
        return new Date(timestamp).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getStatusText(status?: string): string {
        if (!status || status === "unknown") return tx("reviewNotSynced", "尚未同步");
        if (status === "success") return tx("reviewSyncNormal", "最近同步正常");
        if (status === "partial" || status === "partial_success") return tx("reviewSyncPartial", "最近同步部分完成");
        if (status === "cancelled") return tx("reviewSyncCancelled", "最近同步已取消");
        if (status === "running") return tx("reviewSyncRunning", "同步正在进行");
        return tx("reviewSyncFailed", "最近同步失败");
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }
</script>

<section class="review-panel">
    <div class="panel-heading">
        <div class="panel-title">
            <SiYuanIcon name="review" size={18} />
            <div>
                <h2>{tx("workbenchSyncTodo", "同步结果与待办")}</h2>
                <p>{getStatusText(summary?.lastSyncStatus)}</p>
            </div>
        </div>
        <button class="records-link" type="button" on:click={() => dispatch("action", "open-sync-changes")}>{tx("reviewViewRecords", "查看同步记录")}</button>
    </div>

    {#if summary}
        <div class="sync-summary">
            <span>{formatTime(summary.lastSyncTime)}</span>
            <span>{tx("reviewSuccessBooks", "成功 {count} 本", { count: summary.latestSuccessCount })}</span>
            <span>{tx("reviewAdded", "新增 {count}", { count: summary.latestAddedItemCount })}</span>
            <span>{tx("reviewUpdated", "更新 {count}", { count: summary.latestChangedItemCount })}</span>
        </div>

        {#if summary.pendingContentCount > 0 || summary.actionableIssueCount > 0}
            <div class="todo-summary">
                {#if summary.pendingContentCount > 0}<strong>{tx("reviewPendingContent", "{count} 条新增内容待查看", { count: summary.pendingContentCount })}</strong>{/if}
                {#if summary.actionableIssueCount > 0}<strong class="problem">{tx("reviewPendingIssues", "{count} 项需要处理", { count: summary.actionableIssueCount })}</strong>{/if}
            </div>
            <div class="primary-actions">
                {#if summary.pendingContentCount > 0}
                    <button type="button" on:click={() => dispatch("action", "open-inbox")}>{tx("reviewHandleContent", "处理新增内容")}</button>
                {/if}
                {#if summary.actionableIssueCount > 0}
                    <button type="button" class="secondary" on:click={() => dispatch("action", "open-diagnostics")}>{tx("reviewViewIssues", "查看问题")}</button>
                {/if}
            </div>
        {:else}
            <div class="all-clear">
                <SiYuanIcon name="success" size={16} />
                <span>{tx("reviewAllClear", "当前无需处理")}</span>
            </div>
        {/if}
    {:else}
        <div class="loading">{tx("reviewLoading", "正在读取最近同步结果...")}</div>
    {/if}
</section>

<style>
    .review-panel {
        display: grid;
        gap: 12px;
        padding: 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
    }

    .panel-heading,
    .panel-title,
    .sync-summary,
    .todo-summary,
    .primary-actions,
    .all-clear {
        display: flex;
        align-items: center;
    }

    .panel-heading {
        justify-content: space-between;
        gap: 12px;
    }

    .panel-title {
        gap: 8px;
        min-width: 0;
        color: var(--b3-theme-primary);
    }

    .panel-title div {
        min-width: 0;
    }

    h2,
    p {
        margin: 0;
    }

    h2 {
        color: var(--b3-theme-on-background);
        font-size: 16px;
    }

    p,
    .sync-summary,
    .loading {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .sync-summary,
    .todo-summary,
    .primary-actions {
        flex-wrap: wrap;
        gap: 8px;
    }

    .sync-summary span {
        padding-right: 8px;
        border-right: 1px solid var(--b3-border-color);
    }

    .sync-summary span:last-child {
        border-right: 0;
    }

    .todo-summary strong {
        color: var(--b3-theme-primary);
        font-size: 13px;
    }

    .todo-summary .problem {
        color: var(--b3-card-warning-color);
    }

    button {
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 7px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-background);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
    }

    button.secondary,
    .records-link {
        border-color: var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .records-link {
        min-height: 28px;
        padding: 0 8px;
        border-color: transparent;
        color: var(--b3-theme-primary);
    }

    .all-clear {
        gap: 7px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--b3-card-success-background);
        color: var(--b3-theme-on-background);
        font-size: 13px;
    }

    @media (max-width: 600px) {
        .review-panel {
            padding: 12px;
        }

        .panel-heading {
            align-items: flex-start;
        }

        .primary-actions button {
            flex: 1 1 130px;
            min-height: 42px;
        }
    }
</style>
