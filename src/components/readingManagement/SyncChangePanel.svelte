<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { SyncChangeReportView, SyncChangeSummaryView } from "../../utils/readingManagement/types";
    import { buildSyncChangeReportView } from "../../utils/readingManagement/managementData";
    import { locateBookFirstManagedBlock, openLocatedBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import { loadWereadNoteUnitBlockIndex } from "../../utils/weread/incremental/blockIndexStorage";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ back: void; action: WorkbenchAction }>();

    let report: SyncChangeReportView | null = null;
    let blockIndex: any = null;
    let isLoading = true;
    let filter: "all" | "added" | "changed" | "deleted" | "problem" | "rebuilt" | "skipped" | "book" | "mp" = "all";

    const filters = [
        { key: "all", label: "全部" },
        { key: "added", label: "有新增" },
        { key: "changed", label: "有更新" },
        { key: "deleted", label: "有删除" },
        { key: "problem", label: "有问题" },
        { key: "rebuilt", label: "重建索引" },
        { key: "skipped", label: "跳过" },
        { key: "book", label: "普通书" },
        { key: "mp", label: "公众号" },
    ] as const;

    onMount(async () => {
        try {
            const [nextReport, nextIndex] = await Promise.all([
                buildSyncChangeReportView(plugin),
                loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
            ]);
            report = nextReport;
            blockIndex = nextIndex;
        } finally {
            isLoading = false;
        }
    });

    function filterItem(item: SyncChangeSummaryView): boolean {
        if (filter === "all") return true;
        if (filter === "added") return item.addedItemCount > 0;
        if (filter === "changed") return item.changedItemCount > 0;
        if (filter === "deleted") return item.deletedItemCount > 0;
        if (filter === "problem") return item.status !== "success";
        if (filter === "rebuilt") return item.rebuilt;
        if (filter === "skipped") return item.status === "skipped";
        if (filter === "book") return item.sourceType === "book";
        if (filter === "mp") return item.sourceType === "mp";
        return true;
    }

    function openDoc(item: SyncChangeSummaryView) {
        if (!item.noteDocId) {
            showMessage("该来源暂无可打开的本地笔记");
            return;
        }
        openSiyuanDoc(plugin, item.noteDocId);
    }

    function openFirstBlock(item: SyncChangeSummaryView) {
        const located = locateBookFirstManagedBlock(item.sourceKey, blockIndex);
        if (!located) {
            showMessage("还没有定位到对应的思源块。");
            return;
        }
        openLocatedBlock(plugin, located);
    }

    function formatTime(ts?: number): string {
        return ts ? new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    }

    $: visibleItems = report ? report.items.filter(filterItem) : [];
</script>

<div class="reading-management-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>本次同步变化</h2>
            <p>查看最近一次同步的新增、更新、删除和块操作统计</p>
        </div>
        <button class="header-action" on:click={() => dispatch("action", "open-maintenance")}>数据维护</button>
    </div>

    {#if isLoading}
        <div class="empty">加载中...</div>
    {:else if !report}
        <div class="empty">暂无同步变化报告</div>
    {:else}
        <div class="summary-grid">
            <div><strong>{formatTime(report.startedAt)}</strong><span>同步时间</span></div>
            <div><strong>{report.statusLabel}</strong><span>总状态</span></div>
            <div><strong>{report.successCount}</strong><span>成功书籍</span></div>
            <div><strong>{report.failedCount}</strong><span>失败书籍</span></div>
            <div><strong>{report.skippedCount}</strong><span>跳过书籍</span></div>
            <div><strong>{report.addedItemCount}</strong><span>新增单元</span></div>
            <div><strong>{report.changedItemCount}</strong><span>更新单元</span></div>
            <div><strong>{report.deletedItemCount}</strong><span>删除单元</span></div>
            <div><strong>{report.rebuiltCount}</strong><span>重建索引</span></div>
            <div><strong>{report.blockOperationCount}</strong><span>块操作</span></div>
        </div>

        <div class="filter-bar">
            {#each filters as option (option.key)}
                <button class:active={filter === option.key} on:click={() => (filter = option.key)}>{option.label}</button>
            {/each}
        </div>

        {#if visibleItems.length === 0}
            <div class="empty">该筛选条件下暂无记录</div>
        {:else}
            <div class="change-list">
                {#each visibleItems as item (`${item.reportId}:${item.sourceKey}:${item.status}`)}
                    <article class="change-card">
                        <div class="card-head">
                            <div>
                                <h3>{item.title}</h3>
                                <p>{item.sourceType === "mp" ? "公众号" : "普通书"} · {item.statusLabel}</p>
                            </div>
                            {#if item.rebuilt}<span class="pill">已重建索引</span>{/if}
                        </div>
                        <div class="change-stats">
                            <span>新增 {item.addedItemCount}</span>
                            <span>更新 {item.changedItemCount}</span>
                            <span>删除 {item.deletedItemCount}</span>
                            <span>未变 {item.unchangedItemCount}</span>
                            <span>块操作 {item.blockOperationCount}</span>
                        </div>
                        {#if item.message}
                            <p class="message">{item.message}</p>
                        {/if}
                        <p class="hint">当前版本优先记录统计，后续同步会逐步补充具体明细。</p>
                        <div class="actions">
                            <button on:click={() => openFirstBlock(item)}>打开同步块</button>
                            <button disabled={!item.noteDocId} on:click={() => openDoc(item)}>打开笔记</button>
                        </div>
                    </article>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    .reading-management-page {
        max-width: 1180px;
        margin: 0 auto;
        padding: clamp(16px, 2vw, 28px);
    }

    .page-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
    }

    .page-header div {
        flex: 1;
        min-width: 0;
    }

    h2,
    h3,
    p {
        margin: 0;
    }

    h2 {
        font-size: 20px;
        margin-bottom: 4px;
    }

    .page-header p,
    .card-head p,
    .message,
    .hint {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .back-btn,
    .header-action,
    .filter-bar button,
    .actions button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .actions button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        margin-bottom: 14px;
    }

    .summary-grid div,
    .change-card,
    .empty {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
    }

    .summary-grid div {
        display: grid;
        gap: 4px;
        padding: 12px;
    }

    .summary-grid strong {
        font-size: 18px;
    }

    .summary-grid span {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 12px;
    }

    .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px;
        margin-bottom: 14px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
    }

    .filter-bar button.active {
        color: #fff;
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .change-list {
        display: grid;
        gap: 10px;
    }

    .change-card {
        display: grid;
        gap: 10px;
        padding: 14px;
    }

    .card-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
    }

    h3 {
        font-size: 14px;
        margin-bottom: 4px;
    }

    .pill {
        height: fit-content;
        border-radius: 999px;
        padding: 2px 8px;
        color: var(--b3-theme-primary, #4CAF50);
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 12%, transparent);
        font-size: 11px;
        white-space: nowrap;
    }

    .change-stats,
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .change-stats span {
        border-radius: 999px;
        padding: 2px 8px;
        background: var(--b3-theme-background, #f5f5f5);
        font-size: 12px;
    }

    .empty {
        padding: 48px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #666);
    }
</style>
