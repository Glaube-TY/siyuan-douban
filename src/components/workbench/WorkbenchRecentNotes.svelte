<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import type { WorkbenchAction } from "../../types/workbench";
    import { getReadingInboxItems } from "../../utils/storage/readingStorage";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    let items: ReadingInboxItem[] = [];
    let lastRefreshKey = refreshKey;

    async function load() {
        items = (await getReadingInboxItems(plugin))
            .filter((item) => item.status === "unprocessed" || item.status === "later")
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }
</script>

<section class="workbench-panel workbench-recent-notes">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="inbox" size={18} />
            <h2>最近新增笔记</h2>
        </div>
        <button class="workbench-panel-link" on:click={() => dispatch("action", "open-inbox")}>查看全部</button>
    </div>

    {#if items.length === 0}
        <div class="workbench-empty">
            <strong>暂无未处理新增笔记</strong>
            <span>同步后新增的划线、想法和书评会显示在这里。</span>
        </div>
    {:else}
        <div class="workbench-note-list">
            {#each items as item (item.id)}
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
