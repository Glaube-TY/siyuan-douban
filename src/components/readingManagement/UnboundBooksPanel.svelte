<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { BookHealthView } from "../../utils/readingManagement/types";
    import { buildUnboundBookViews } from "../../utils/readingManagement/managementData";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ back: void; action: WorkbenchAction }>();

    let items: BookHealthView[] = [];
    let isLoading = true;
    let query = "";

    onMount(async () => {
        try {
            items = await buildUnboundBookViews(plugin);
        } finally {
            isLoading = false;
        }
    });

    function getReason(item: BookHealthView): string {
        if (item.sourceType === "mp") return "公众号还没有导入到本地笔记。";
        if (!item.isbn) return "这本书缺少 ISBN，无法稳定匹配本地书籍。";
        return "还没有绑定到本地读书笔记文档。";
    }

    $: visibleItems = items.filter((item) => {
        const text = `${item.title} ${item.author || ""} ${item.isbn || ""} ${item.bookID || ""}`.toLowerCase();
        return !query || text.includes(query.toLowerCase());
    });
</script>

<div class="reading-management-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>未绑定书籍处理</h2>
            <p>查看哪些微信读书来源还不能写入本地笔记，并选择下一步处理入口</p>
        </div>
    </div>

    <div class="toolbar">
        <input bind:value={query} placeholder="搜索书名 / 作者 / ISBN / BookID" />
        <button on:click={() => dispatch("action", "open-local-shelf")}>打开书架</button>
        <button on:click={() => dispatch("action", "search")}>搜索添加</button>
    </div>

    {#if isLoading}
        <div class="empty">加载中...</div>
    {:else if visibleItems.length === 0}
        <div class="empty">当前没有未绑定书籍</div>
    {:else}
        <div class="book-list">
            {#each visibleItems as item (item.id)}
                <article class="book-card">
                    <div class="card-head">
                        <div>
                            <h3>{item.title}</h3>
                            <p>{item.sourceLabel} · {item.author || "未知作者"}</p>
                        </div>
                        <span class="pill">未绑定</span>
                    </div>
                    <div class="meta">
                        <span>BookID：{item.bookID || "--"}</span>
                        <span>ISBN：{item.isbn || "--"}</span>
                        <span>笔记数：{item.noteCount ?? "--"}</span>
                    </div>
                    <p class="reason">{getReason(item)}</p>
                    <p class="suggestion">{item.recommendedAction}</p>
                    <div class="actions">
                        <button on:click={() => dispatch("action", "open-local-shelf")}>打开书架</button>
                        <button on:click={() => dispatch("action", "search")}>搜索添加</button>
                        <button on:click={() => showMessage(item.recommendedAction)}>查看详情</button>
                        <button on:click={() => showMessage("忽略入口已预留；不会自动创建或自动绑定文档。")}>忽略</button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<style>
    .reading-management-page {
        max-width: 1180px;
        margin: 0 auto;
        padding: clamp(16px, 2vw, 28px);
    }

    .page-header,
    .toolbar,
    .card-head,
    .meta,
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .page-header {
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

    h3 {
        font-size: 14px;
        margin-bottom: 4px;
    }

    .page-header p,
    .card-head p,
    .reason,
    .suggestion,
    .meta {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .toolbar {
        align-items: center;
        padding: 8px;
        margin-bottom: 14px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
    }

    .toolbar input {
        min-width: 220px;
        flex: 1;
        height: 32px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        padding: 0 10px;
        background: var(--b3-theme-surface, #fff);
    }

    .back-btn,
    .toolbar button,
    .actions button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .book-list {
        display: grid;
        gap: 10px;
    }

    .book-card,
    .empty {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
    }

    .book-card {
        display: grid;
        gap: 10px;
        padding: 14px;
    }

    .card-head {
        justify-content: space-between;
    }

    .pill {
        height: fit-content;
        border-radius: 999px;
        padding: 2px 8px;
        color: var(--b3-card-warning-color, #FF9800);
        background: rgba(255, 152, 0, 0.1);
        font-size: 11px;
    }

    .meta span {
        overflow-wrap: anywhere;
    }

    .suggestion {
        color: var(--b3-theme-primary, #4CAF50);
    }

    .empty {
        padding: 48px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #666);
    }
</style>
