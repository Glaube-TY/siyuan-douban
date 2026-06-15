<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction, WorkbenchWereadAssetSummary } from "../../types/workbench";

    export let summary: WorkbenchWereadAssetSummary | null = null;
    export let pluginName = "";

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }

    function statusText(status?: string): string {
        const map: Record<string, string> = {
            success: "成功",
            partial: "部分成功",
            partial_success: "部分成功",
            failed: "失败",
            running: "进行中",
            cancelled: "已取消",
            unknown: "暂无报告",
        };
        return map[status || "unknown"] || status || "暂无报告";
    }

    $: displayStatus = summary?.lastSyncStatus === "success" && summary?.lastSyncSuccessCount === 0 && (summary?.lastSyncSkippedCount || 0) > 0
        ? "skipped_all"
        : (summary?.lastSyncStatus || "unknown");

    $: statusHint = displayStatus === "skipped_all" ? "本次无变化" : "";
</script>

<section class="workbench-panel workbench-weread-assets">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="weread" pluginName={pluginName} size={18} />
            <h2>微信读书同步</h2>
        </div>
        <button class="workbench-panel-link" on:click={() => action("open-weread-auth")}>授权设置</button>
    </div>

    <div class="workbench-metrics">
        <button class="workbench-metric workbench-metric-wide" on:click={() => action("open-weread-auth")}>
            <span>API Key</span>
            <strong class:ok={summary?.authVerified}>
                {summary?.authVerified ? "已验证" : summary?.authConfigured ? "未验证" : "未配置"}
            </strong>
            <em>{summary?.authVerified ? summary?.apiKeyMasked : summary?.lastError || "点击配置授权"}</em>
        </button>
        <div class="workbench-metric">
            <span>有笔记书籍</span>
            <strong>{summary?.hasNotebookCache ? summary.notebookCount : "暂无"}</strong>
            <em>{summary?.hasNotebookCache ? `${summary?.noteCount || 0} 条笔记` : "仅读取本地缓存"}</em>
        </div>
        <div class="workbench-metric" on:click={() => action("open-reading-stats")} on:keydown={(e) => { if (e.key === "Enter") action("open-reading-stats"); }} role="button" tabindex="0">
            <span>书架条目</span>
            <strong>{summary?.shelfBookCount ?? "暂无"}</strong>
            <em>{summary?.hasReadingStatsCache ? "阅读统计缓存" : "暂无统计缓存"}</em>
        </div>
        <button class="workbench-metric workbench-metric-wide" on:click={() => action("open-diagnostics")}>
            <span>最近同步</span>
            <strong class:ok={displayStatus === "success"}>{statusText(displayStatus)}</strong>
            <em>{statusHint || summary?.lastSyncMessage || "同步报告会在完成后显示"}</em>
        </button>
    </div>

    <div class="workbench-weread-footer">
        <button class="primary" on:click={() => action("sync-weread-update")}>
            <SiYuanIcon name="sync" size={15} />
            <span>更新同步</span>
        </button>
        <button on:click={() => action("sync-weread-all")}>
            <SiYuanIcon name="sync" size={15} />
            <span>全部同步</span>
        </button>
        <button on:click={() => action("sync-weread")}>
            <SiYuanIcon name="sync" size={15} />
            <span>同步面板</span>
        </button>
        <button on:click={() => action("open-sync-options")}>
            <SiYuanIcon name="settings" size={15} />
            <span>同步选项</span>
        </button>
        <button on:click={() => action("open-diagnostics")}>
            <SiYuanIcon name="diagnostics" size={15} />
            <span>同步诊断</span>
        </button>
        <button on:click={() => action("open-reading-stats")}>
            <SiYuanIcon name="stats" size={15} />
            <span>阅读统计</span>
        </button>
    </div>
</section>

<style>
    .workbench-panel {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .workbench-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
    }

    .workbench-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-primary);
    }

    h2 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 16px;
    }

    .workbench-panel-link,
    .workbench-weread-footer button,
    .workbench-metric {
        border: 1px solid var(--b3-theme-border);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
    }

    .workbench-panel-link {
        height: 28px;
        padding: 0 10px;
        font-size: 12px;
    }

    .workbench-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
    }

    .workbench-metric {
        display: grid;
        gap: 4px;
        min-height: 86px;
        padding: 12px;
        text-align: left;
    }

    .workbench-metric-wide {
        grid-column: span 2;
    }

    .workbench-metric:hover,
    .workbench-panel-link:hover,
    .workbench-weread-footer button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-metric span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .workbench-metric strong {
        color: var(--b3-theme-on-background);
        font-size: 20px;
        line-height: 1.1;
    }

    .workbench-metric strong.ok {
        color: var(--b3-theme-primary);
    }

    .workbench-metric em {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .workbench-weread-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .workbench-weread-footer button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 600;
    }

    .workbench-weread-footer button.primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary, #fff);
    }
</style>
