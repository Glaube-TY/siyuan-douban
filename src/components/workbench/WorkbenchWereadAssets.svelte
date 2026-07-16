<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction, WorkbenchWereadAssetSummary } from "../../types/workbench";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let summary: WorkbenchWereadAssetSummary | null = null;
    export let pluginName = "";

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }

    function statusText(status?: string): string {
        const map: Record<string, string> = {
            success: tx("syncStatusSuccess", "成功"),
            partial: tx("syncStatusPartial", "部分成功"),
            partial_success: tx("syncStatusPartial", "部分成功"),
            failed: tx("syncStatusFailed", "失败"),
            running: tx("syncStatusRunning", "进行中"),
            cancelled: tx("syncStatusCancelled", "已取消"),
            unknown: tx("syncStatusNoReport", "暂无报告"),
        };
        return map[status || "unknown"] || status || tx("syncStatusNoReport", "暂无报告");
    }

    $: displayStatus = summary?.lastSyncStatus === "success" && summary?.lastSyncSuccessCount === 0 && (summary?.lastSyncSkippedCount || 0) > 0
        ? "skipped_all"
        : (summary?.lastSyncStatus || "unknown");

    $: statusHint = displayStatus === "skipped_all" ? tx("wereadAssetsNoChanges", "本次无变化") : "";

    $: authStatusText = summary?.authVerified
        ? tx("wereadAssetsVerified", "API Key 已验证")
        : summary?.authConfigured
            ? tx("wereadAssetsUnverified", "API Key 未验证")
            : tx("wereadAssetsNoKey", "API Key 未配置");

    $: authNeedsAttention = !summary?.authVerified;
</script>

<section class="workbench-panel workbench-weread-assets">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="weread" pluginName={pluginName} size={18} />
            <h2>{tx("wereadAssetsTitle", "微信读书同步")}</h2>
            <span class="workbench-panel-status">{authStatusText}</span>
        </div>
        <button
            class:needs-attention={authNeedsAttention}
            class="workbench-panel-link"
            on:click={() => action("open-weread-auth")}
        >{tx("wereadAssetsAuth", "授权设置")}</button>
    </div>

    <div class="workbench-compact-stats">
        <div class="workbench-compact-stat">
            <span>{tx("wereadAssetsNotesBooks", "有笔记书籍")}</span>
            <strong>{summary?.hasNotebookCache ? summary.notebookCount : tx("uiNoData", "暂无")}</strong>
            <em>{summary?.hasNotebookCache ? tx("wereadAssetsNotes", "{count} 条笔记", { count: summary?.noteCount || 0 }) : ""}</em>
        </div>
        <div class="workbench-compact-stat">
            <span>{tx("wereadAssetsShelf", "书架条目")}</span>
            <strong>{summary?.shelfBookCount ?? tx("uiNoData", "暂无")}</strong>
            <em>{summary?.hasReadingStatsCache ? tx("wereadAssetsStatsCache", "阅读统计缓存") : ""}</em>
        </div>
        <div class="workbench-compact-stat">
            <span>{tx("wereadAssetsLatestSync", "最近同步")}</span>
            <strong>{statusText(displayStatus)}</strong>
            <em>{statusHint || summary?.lastSyncMessage || ""}</em>
        </div>
    </div>

    <div class="workbench-weread-footer">
        <button class="primary" on:click={() => action("sync-weread-update")}>
            <SiYuanIcon name="sync" size={15} />
            <span>{t(plugin, "updateSync", "更新同步")}</span>
        </button>
        <button on:click={() => action("sync-weread-all")}>
            <SiYuanIcon name="sync" size={15} />
            <span>{t(plugin, "syncAll", "全部同步")}</span>
        </button>
        <button on:click={() => action("open-sync-options")}>
            <SiYuanIcon name="settings" size={15} />
            <span>{tx("settingsSyncOptionsTitle", "同步选项")}</span>
        </button>
        <button on:click={() => action("open-weread-book-management")}>
            <SiYuanIcon name="book" size={15} />
            <span>{tx("wereadAssetsManageBooks", "书籍管理")}</span>
        </button>
    </div>
</section>

<style>
    .workbench-panel {
        display: grid;
        gap: 10px;
        padding: 14px;
        border: 1px solid var(--b3-border-color);
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

    .workbench-panel-status {
        padding: 2px 8px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        color: var(--b3-theme-primary);
        font-size: 12px;
    }

    .workbench-panel-link {
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
        transition: border-color 0.16s ease;
    }

    .workbench-panel-link:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-panel-link.needs-attention {
        animation: workbench-needs-attention 2s ease-in-out infinite;
    }

    .workbench-panel-link.needs-attention:hover {
        animation-play-state: paused;
        border-color: var(--b3-theme-primary);
    }

    .workbench-compact-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    .workbench-compact-stat {
        display: grid;
        gap: 2px;
        padding: 8px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
    }

    .workbench-compact-stat span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .workbench-compact-stat strong {
        color: var(--b3-theme-on-background);
        font-size: 15px;
        font-weight: 700;
    }

    .workbench-compact-stat em {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        font-style: normal;
        overflow: hidden;
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
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: border-color 0.16s ease;
    }

    .workbench-weread-footer button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-weread-footer button.primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    @keyframes workbench-needs-attention {
        0%, 100% {
            border-color: var(--b3-border-color);
            transform: scale(1);
        }
        50% {
            border-color: var(--b3-theme-primary);
            transform: scale(1.02);
        }
    }

    @media (max-width: 720px) {
        .workbench-compact-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
