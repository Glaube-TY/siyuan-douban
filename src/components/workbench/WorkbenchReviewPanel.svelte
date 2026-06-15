<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { WorkbenchTaskData } from "../../utils/readingCenter/readingWorkbenchTasks";
    import { getWorkbenchTaskData } from "../../utils/readingCenter/readingWorkbenchTasks";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    let taskData: WorkbenchTaskData | null = null;
    let lastRefreshKey = refreshKey;

    const entries: Array<{ id: string; type: WorkbenchAction; label: string; icon: string; description: string; countKey: keyof WorkbenchTaskData }> = [
        { id: "inbox", type: "open-inbox", label: "新增笔记", icon: "inbox", description: "未处理或稍后处理", countKey: "inboxPendingCount" },
        { id: "unbound-books", type: "open-book-status", label: "未绑定书籍", icon: "book", description: "未绑定本地文档", countKey: "unboundBookCount" },
        { id: "sync-problems", type: "open-diagnostics", label: "同步问题", icon: "diagnostics", description: "同步失败或异常", countKey: "syncProblemCount" },
        { id: "pending-organize", type: "open-book-status", label: "待整理书籍", icon: "review", description: "有新增笔记或待整理", countKey: "pendingOrganizeCount" },
    ];

    async function load() {
        taskData = await getWorkbenchTaskData(plugin);
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }

    function getCount(key: keyof WorkbenchTaskData): number {
        if (!taskData) return 0;
        return taskData[key] as number;
    }
</script>

<section class="workbench-panel workbench-review-panel">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="review" size={18} />
            <h2>同步后处理</h2>
        </div>
    </div>

    <div class="workbench-review-grid">
        {#each entries as entry (entry.id)}
            <button on:click={() => dispatch("action", entry.type)}>
                <span class="workbench-review-icon"><SiYuanIcon name={entry.icon} size={17} /></span>
                <strong>{taskData ? getCount(entry.countKey) : "暂无"}</strong>
                <span>{entry.label}</span>
                <em>{entry.description}</em>
            </button>
        {/each}
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

    .workbench-review-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
    }

    .workbench-review-grid button {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
    }

    .workbench-review-grid button:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-review-icon {
        color: var(--b3-theme-primary);
    }

    strong {
        font-size: 20px;
        line-height: 1.1;
    }

    span {
        font-size: 13px;
        font-weight: 700;
    }

    em {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (max-width: 920px) {
        .workbench-review-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
