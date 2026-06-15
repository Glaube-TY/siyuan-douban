<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { ReadingManagementSummary, RecentNoteView } from "../../utils/readingManagement/types";
    import { buildReadingManagementSummary, buildRecentNoteViews } from "../../utils/readingManagement/managementData";
    import { openLocatedBlock } from "../../utils/readingManagement/blockLocator";
    import { updateReadingInboxItemStatus } from "../../utils/storage/readingStorage";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();
    let summary: ReadingManagementSummary | null = null;
    let recentNotes: RecentNoteView[] | null = null;
    let lastRefreshKey = refreshKey;

    async function load() {
        const [nextSummary, nextNotes] = await Promise.all([
            buildReadingManagementSummary(plugin),
            buildRecentNoteViews(plugin, { limit: 5, status: "pending" }),
        ]);
        summary = nextSummary;
        recentNotes = nextNotes;
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }

    function getItemTypeBadgeClass(view: RecentNoteView): string {
        if (view.sourceType === "mp") return "badge-mp";
        if (view.itemType === "review") return "badge-review";
        return "badge-bookmark";
    }

    async function markProcessed(event: MouseEvent, view: RecentNoteView) {
        event.stopPropagation();
        await updateReadingInboxItemStatus(plugin, view.id, "processed");
        showMessage("已标记为已处理");
        await load();
        dispatch("refresh");
    }

    function openBlock(event: MouseEvent, view: RecentNoteView) {
        event.stopPropagation();
        if (!view.locatedBlock) {
            showMessage("这条笔记还没有定位到对应的思源块。");
            return;
        }
        openLocatedBlock(plugin, view.locatedBlock);
    }

    function handleCardKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            dispatch("action", "open-inbox");
        }
    }
</script>

<section class="workbench-panel workbench-recent-notes">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="inbox" size={18} />
            <h2>最近新增笔记</h2>
        </div>
        {#if summary && (summary.inboxPendingCount + summary.inboxLaterCount) > 0}
            <button class="workbench-panel-link" on:click={() => dispatch("action", "open-inbox")}>查看全部</button>
        {/if}
    </div>

    {#if !recentNotes}
        <div class="workbench-empty">
            <strong>加载中...</strong>
            <span>正在获取笔记状态。</span>
        </div>
    {:else if recentNotes.length === 0}
        <div class="workbench-empty">
            <strong>暂无新增笔记</strong>
            <span>同步后新增的划线、想法和公众号笔记会显示在这里。</span>
            {#if summary && summary.syncProblemCount > 0}
                <div class="workbench-empty-actions">
                    <button class="workbench-panel-link" on:click={() => dispatch("action", "open-diagnostics")}>查看诊断</button>
                    <button class="workbench-panel-link" on:click={() => dispatch("action", "sync-weread-update")}>重新同步</button>
                </div>
            {/if}
        </div>
    {:else}
        <div class="workbench-note-list">
            {#each recentNotes as view (view.id)}
                <div
                    class="note-card"
                    role="button"
                    tabindex="0"
                    on:click={() => dispatch("action", "open-inbox")}
                    on:keydown={handleCardKeydown}
                >
                    <div class="note-row-main">
                        <div class="note-content">
                            {#if view.summary}
                                <div class="note-summary">{view.summary}</div>
                            {/if}
                        </div>
                        <div class="note-badges">
                            <span class="note-badge {getItemTypeBadgeClass(view)}">{view.typeLabel}</span>
                            {#if view.blockIndexed}
                                <span class="note-indexed">已定位到同步块</span>
                            {:else}
                                <span class="note-missing">待建立索引</span>
                            {/if}
                        </div>
                    </div>
                    <div class="note-row-meta">
                        <span class="note-source">{view.title}</span>
                        {#if view.sectionLabel}
                            <span class="note-sep">·</span>
                            <span class="note-section">{view.sectionLabel}</span>
                        {/if}
                        {#if view.createdAtText}
                            <span class="note-sep">·</span>
                            <span class="note-time">{view.createdAtText}</span>
                        {/if}
                    </div>
                    <div class="note-row-actions">
                        <button type="button" on:click={(event) => openBlock(event, view)}>打开块</button>
                        {#if view.status !== "processed"}
                            <button type="button" on:click={(event) => markProcessed(event, view)}>已处理</button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>

<style>
    .workbench-panel {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        align-content: start;
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
    .note-card {
        border: 1px solid var(--b3-border-color);
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
        border: 1px dashed var(--b3-border-color);
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
        gap: 6px;
        max-height: min(420px, 48vh);
        overflow-y: auto;
        padding-right: 4px;
    }

    .note-card {
        display: grid;
        gap: 4px;
        padding: 8px 10px;
        text-align: left;
    }

    .note-card:hover,
    .workbench-panel-link:hover {
        border-color: var(--b3-theme-primary);
    }

    .note-row-main {
        display: flex;
        gap: 8px;
        min-width: 0;
    }

    .note-content {
        flex: 1;
        min-width: 0;
    }

    .note-badges {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 6px;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .note-summary {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .note-badge {
        flex-shrink: 0;
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 500;
    }

    .badge-bookmark {
        background: var(--b3-theme-primary-light);
        color: var(--b3-theme-primary);
    }

    .badge-review {
        background: var(--b3-card-success-background, #e8f5e9);
        color: var(--b3-theme-success, #4caf50);
    }

    .badge-mp {
        background: var(--b3-card-warning-background, #fff3e0);
        color: var(--b3-card-warning-color, #ff9800);
    }

    .note-indexed {
        font-size: 11px;
        color: var(--b3-theme-success, #4caf50);
    }

    .note-missing {
        font-size: 11px;
        color: var(--b3-card-warning-color, #ff9800);
    }

    .note-row-meta {
        display: flex;
        align-items: center;
        gap: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        overflow: hidden;
    }

    .note-source {
        flex-shrink: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 45%;
    }

    .note-sep {
        flex-shrink: 0;
        margin: 0 4px;
        opacity: 0.5;
    }

    .note-section {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .note-time {
        flex-shrink: 0;
        margin-left: auto;
    }

    .note-row-actions {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: var(--b3-theme-primary);
    }

    .note-row-actions button {
        border: none;
        background: none;
        padding: 0;
        font: inherit;
        cursor: pointer;
    }
</style>
