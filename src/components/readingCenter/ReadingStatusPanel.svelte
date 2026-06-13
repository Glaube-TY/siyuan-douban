<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { ReadingCenterOverview } from "../../types/readingCenter";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let overviewData: ReadingCenterOverview | null = null;

    const dispatch = createEventDispatcher();

    function handleOpenDiagnostics() {
        dispatch("openDiagnostics");
    }

    function formatLoadedAt(ts?: number): string {
        if (!ts) return "--";
        try {
            const d = new Date(ts);
            return d.toLocaleString("zh-CN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "--";
        }
    }

    function statusText(status: string): string {
        const map: Record<string, string> = {
            success: "成功",
            partial: "部分成功",
            partial_success: "部分成功",
            failed: "失败",
            running: "进行中",
            cancelled: "已取消",
            unknown: "暂无报告",
        };
        return map[status] || status;
    }
</script>

<div class="info-panel">
    <div class="panel-header">
        <div class="panel-icon">
            <SiYuanIcon name="sync" size={20} />
        </div>
        <div class="panel-title">同步状态</div>
        <button class="panel-action" on:click={handleOpenDiagnostics}>查看诊断</button>
    </div>
    <div class="panel-content">
        {#if overviewData}
            <div class="cache-info">
                <div class="cache-row">
                    <span class="cache-label">上次同步</span>
                    <span class="cache-value" class:cache-active={overviewData.lastSyncStatus === "success"}>
                        {statusText(overviewData.lastSyncStatus)}
                    </span>
                </div>
                {#if overviewData.lastSyncMessage}
                    <div class="cache-row">
                        <span class="cache-label">同步结果</span>
                        <span class="cache-value">{overviewData.lastSyncMessage}</span>
                    </div>
                {/if}
                {#if overviewData.lastSyncTime}
                    <div class="cache-row">
                        <span class="cache-label">同步时间</span>
                        <span class="cache-value">{formatLoadedAt(overviewData.lastSyncTime)}</span>
                    </div>
                {/if}
                <div class="cache-row">
                    <span class="cache-label">阅读统计缓存</span>
                    <span class="cache-value" class:cache-active={overviewData.hasReadingStatsCache}>
                        {overviewData.hasReadingStatsCache ? "已加载" : "暂无缓存"}
                    </span>
                </div>
                {#if overviewData.hasReadingStatsCache && overviewData.readingStatsLoadedAt}
                    <div class="cache-row">
                        <span class="cache-label">最近更新</span>
                        <span class="cache-value">{formatLoadedAt(overviewData.readingStatsLoadedAt)}</span>
                    </div>
                {/if}
                <div class="cache-row">
                    <span class="cache-label">笔记本缓存</span>
                    <span class="cache-value" class:cache-active={overviewData.hasNotebookCache}>
                        {overviewData.hasNotebookCache ? "已加载" : "暂无缓存"}
                    </span>
                </div>
            </div>
        {:else}
            <p class="panel-hint">同步报告、失败原因、重试操作将在后续诊断中心接入</p>
        {/if}
    </div>
</div>

<style>
    .info-panel {
        background: var(--b3-theme-surface, #fff);
        border-radius: 12px;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .panel-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        background: var(--b3-theme-surface-light, #f8f9fa);
        border-bottom: 1px solid var(--b3-theme-border, #e0e0e0);
    }

    .panel-icon {
        width: 20px;
        height: 20px;
        color: var(--b3-theme-primary, #2196F3);
    }

    .panel-icon svg {
        width: 100%;
        height: 100%;
    }

    .panel-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        flex: 1;
    }

    .panel-action {
        font-size: 12px;
        padding: 4px 10px;
        background: var(--b3-theme-primary, #2196F3);
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: opacity 0.2s ease;
    }

    .panel-action:hover {
        opacity: 0.9;
    }

    .panel-content {
        padding: 16px;
    }

    .panel-hint {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #666);
        margin: 0;
        line-height: 1.5;
    }

    .cache-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .cache-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
    }

    .cache-label {
        color: var(--b3-theme-on-surface-light, #666);
    }

    .cache-value {
        color: var(--b3-theme-on-surface, #1a1a1a);
        font-weight: 500;
    }

    .cache-active {
        color: var(--b3-theme-primary, #4CAF50);
    }
</style>
