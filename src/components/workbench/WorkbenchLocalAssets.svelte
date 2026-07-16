<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction, WorkbenchLocalAssetSummary } from "../../types/workbench";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let summary: WorkbenchLocalAssetSummary | null = null;
    const tx = (key: string, fallback: string) => t(plugin, key, fallback);

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }

    $: databaseStatusText = summary?.databaseStatus.valid
        ? tx("localAssetsConnected", "数据库已连接")
        : summary?.databaseStatus.configured
            ? tx("localAssetsInvalid", "数据库校验失败")
            : tx("localAssetsMissing", "数据库未配置");

    $: databaseNeedsAttention = !summary?.databaseStatus.valid;
    $: templateNeedsAttention = !summary?.bookTemplateConfigured;
</script>

<section class="workbench-panel workbench-local-assets">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="localShelf" size={18} />
            <h2>{tx("localAssetsTitle", "本地阅读资产")}</h2>
            <span class="workbench-panel-status">{databaseStatusText}</span>
        </div>
    </div>

    <div class="workbench-compact-stats">
        <div class="workbench-compact-stat">
            <span>{tx("localAssetsBooks", "本地书籍")}</span>
            <strong>{summary?.localBookCount ?? tx("localAssetsNotLoaded", "未加载")}</strong>
        </div>
    </div>

    <div class="workbench-local-footer">
        <button
            class:needs-attention={databaseNeedsAttention}
            on:click={() => action("open-database-settings")}
        >
            <SiYuanIcon name="database" size={15} />
            <span>{tx("localAssetsDatabase", "数据库设置")}</span>
        </button>
        <button on:click={() => action("open-book-preferences")}>
            <SiYuanIcon name="settings" size={15} />
            <span>{tx("localAssetsPreferences", "评分 / 分类 / 状态")}</span>
        </button>
        <button
            class:needs-attention={templateNeedsAttention}
            on:click={() => action("open-template-settings")}
        >
            <SiYuanIcon name="template" size={15} />
            <span>{tx("localAssetsTemplates", "模板设置")}</span>
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

    .workbench-compact-stats {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: 8px;
    }

    .workbench-compact-stat {
        display: flex;
        align-items: center;
        justify-content: space-between;
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

    .workbench-local-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .workbench-local-footer button {
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

    .workbench-local-footer button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-local-footer button.needs-attention {
        animation: workbench-needs-attention 2s ease-in-out infinite;
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
</style>
