<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction, WorkbenchLocalAssetSummary } from "../../types/workbench";

    export let summary: WorkbenchLocalAssetSummary | null = null;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }
</script>

<section class="workbench-panel workbench-local-assets">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="localShelf" size={18} />
            <h2>本地阅读资产</h2>
        </div>
        <button class="workbench-panel-link" on:click={() => action("open-database-settings")}>数据库设置</button>
    </div>

    <div class="workbench-metrics">
        <button class="workbench-metric workbench-metric-wide" on:click={() => action("open-database-settings")}>
            <span>数据库状态</span>
            <strong class:ok={summary?.databaseStatus.valid}>
                {summary?.databaseStatus.valid ? "已连接" : summary?.databaseStatus.configured ? "校验失败" : "未配置"}
            </strong>
            <em>{summary?.databaseStatus.message || "读取中"}</em>
        </button>
        <div class="workbench-metric">
            <span>本地书籍</span>
            <strong>{summary?.localBookCount ?? "未加载"}</strong>
            <em>数据库中的书籍数量</em>
        </div>
        <button class="workbench-metric" on:click={() => action("open-template-settings")}>
            <span>模板状态</span>
            <strong class:ok={summary?.bookTemplateConfigured}>{summary?.bookTemplateConfigured ? "已配置" : "未配置"}</strong>
            <em>{summary?.addNotes ? "添加时生成笔记" : "仅添加记录"}</em>
        </button>
    </div>

    <div class="workbench-local-footer">
        <button on:click={() => action("open-book-preferences")}>
            <SiYuanIcon name="settings" size={15} />
            <span>评分 / 分类 / 状态</span>
        </button>
        <button on:click={() => action("open-template-settings")}>
            <SiYuanIcon name="template" size={15} />
            <span>模板设置</span>
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

    .workbench-panel-link {
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--b3-theme-border);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
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
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
    }

    .workbench-metric:hover,
    .workbench-panel-link:hover,
    .workbench-local-footer button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-metric-wide {
        grid-column: span 2;
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
        border: 1px solid var(--b3-theme-border);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    }
</style>
