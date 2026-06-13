<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import { getReadingInboxItems } from "../../utils/storage/readingStorage";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let plugin: any;

    const dispatch = createEventDispatcher();
    let items: ReadingInboxItem[] = [];

    onMount(async () => {
        items = (await getReadingInboxItems(plugin))
            .filter((item) => item.status === "unprocessed" || item.status === "later")
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);
    });

    function openInbox() {
        dispatch("openInbox");
    }
</script>

<div class="info-panel" id="recent-changes">
    <div class="panel-header">
        <div class="panel-icon">
            <SiYuanIcon name="inbox" size={20} />
        </div>
        <div class="panel-title">最近新增笔记</div>
        <button class="panel-action" on:click={openInbox}>查看全部</button>
    </div>
    <div class="panel-content">
        {#if items.length === 0}
            <p class="panel-hint">暂无未处理新增笔记</p>
        {:else}
            <div class="recent-list">
                {#each items as item (item.id)}
                    <button class="recent-item" on:click={openInbox}>
                        <span class="recent-title">{item.title}</span>
                        <span class="recent-meta">{item.articleTitle || item.chapterTitle || (item.sourceType === "weread-mp" ? "公众号" : "普通书")}</span>
                    </button>
                {/each}
            </div>
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
        color: var(--b3-theme-primary, #4CAF50);
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
        background: var(--b3-theme-primary, #4CAF50);
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
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

    .recent-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .recent-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        background: var(--b3-theme-background, #f5f5f5);
        border-radius: 6px;
        padding: 8px 10px;
        cursor: pointer;
        text-align: left;
    }

    .recent-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .recent-meta {
        flex-shrink: 0;
        color: var(--b3-theme-on-surface-light, #777);
        font-size: 12px;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
