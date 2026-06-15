<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { WorkbenchTaskData, EmptyStateType } from "../../utils/readingCenter/readingWorkbenchTasks";
    import { getWorkbenchTaskData } from "../../utils/readingCenter/readingWorkbenchTasks";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    let taskData: WorkbenchTaskData | null = null;
    let lastRefreshKey = refreshKey;

    async function load() {
        taskData = await getWorkbenchTaskData(plugin);
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }

    function getEmptyStateContent(emptyStateType: EmptyStateType) {
        switch (emptyStateType) {
            case "no_baseline":
                return {
                    title: "还没有建立笔记基线",
                    description: "完成一次成功同步后，后续新增的划线和想法会出现在这里。",
                    showDiagnostics: false,
                };
            case "has_baseline_no_new":
                return {
                    title: "已建立笔记基线",
                    description: "最近一次同步未发现新的划线、想法或评论。",
                    showDiagnostics: false,
                };
            case "sync_failed":
                return {
                    title: "上次同步失败",
                    description: "暂时无法检测新增笔记。",
                    showDiagnostics: true,
                };
            default:
                return {
                    title: "暂无未处理新增笔记",
                    description: "同步后新增的划线、想法和书评会显示在这里。",
                    showDiagnostics: false,
                };
        }
    }
</script>

<section class="workbench-panel workbench-recent-notes">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="inbox" size={18} />
            <h2>最近新增笔记</h2>
        </div>
        {#if taskData && taskData.inboxPendingCount > 0}
            <button class="workbench-panel-link" on:click={() => dispatch("action", "open-inbox")}>查看全部</button>
        {/if}
    </div>

    {#if !taskData}
        <div class="workbench-empty">
            <strong>加载中...</strong>
            <span>正在获取笔记状态。</span>
        </div>
    {:else if taskData.recentInboxItems.length === 0}
        {@const emptyState = getEmptyStateContent(taskData.emptyStateType)}
        <div class="workbench-empty">
            <strong>{emptyState.title}</strong>
            <span>{emptyState.description}</span>
            {#if emptyState.showDiagnostics}
                <div class="workbench-empty-actions">
                    <button class="workbench-panel-link" on:click={() => dispatch("action", "open-diagnostics")}>查看诊断</button>
                    <button class="workbench-panel-link" on:click={() => dispatch("action", "sync-weread-update")}>重新同步</button>
                </div>
            {/if}
        </div>
    {:else}
        <div class="workbench-note-list">
            {#each taskData.recentInboxItems as item (item.id)}
                <button on:click={() => dispatch("action", "open-inbox")}>
                    <strong>{item.title}</strong>
                    <span>
                        {#if item.sourceType === "weread-mp"}
                            <SiYuanIcon name="officialAccount" pluginName={plugin.name} size={12} />
                            <span>公众号</span>
                        {:else}
                            普通书
                        {/if}
                    </span>
                </button>
            {/each}
        </div>
    {/if}
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
    .workbench-note-list button {
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

    .workbench-empty {
        display: grid;
        gap: 5px;
        padding: 18px;
        border: 1px dashed var(--b3-theme-border);
        border-radius: 8px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.45;
    }

    .workbench-empty strong {
        color: var(--b3-theme-on-background);
        font-size: 14px;
    }

    .workbench-empty-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }

    .workbench-note-list {
        display: grid;
        gap: 8px;
    }

    .workbench-note-list button {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        padding: 10px;
        text-align: left;
    }

    .workbench-note-list button:hover,
    .workbench-panel-link:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-note-list strong,
    .workbench-note-list span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .workbench-note-list strong {
        font-size: 13px;
    }

    .workbench-note-list span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }
</style>
