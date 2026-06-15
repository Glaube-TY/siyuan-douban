<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import type { ReadingBookStatus, ReadingBookReviewStatus } from "../../types/readingStatus";
    import { READING_BOOK_STATUS_LABELS } from "../../types/readingStatus";
    import { getReadingBookStatuses, getWereadSourceKey, normalizeReadingBookStatusSource, saveReadingBookStatuses, updateReadingBookStatusValue } from "../../utils/storage/readingStorage";
    import { safeLoadNotebookCache } from "../../utils/readingCenter/readingCenterData";
    import { openDoc } from "../../utils/openDoc";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    export let plugin: any;

    const dispatch = createEventDispatcher();

    let statuses: ReadingBookStatus[] = [];
    let filter: ReadingBookReviewStatus | "all" | "new" | "failed" = "all";
    let query = "";

    const statusOptions = Object.entries(READING_BOOK_STATUS_LABELS) as Array<[ReadingBookReviewStatus, string]>;

    onMount(loadStatuses);

    async function loadStatuses() {
        const existing = await getReadingBookStatuses(plugin);
        const cache = await safeLoadNotebookCache(plugin);

        // 归一化旧脏数据
        const normalized = existing.map((item) => normalizeReadingBookStatusSource(item, cache || undefined));

        // 按归一化后的 sourceKey 去重，保留信息更完整的一条
        const map = new Map<string, ReadingBookStatus>();
        for (const item of normalized) {
            const key = item.sourceKey;
            const prev = map.get(key);
            if (!prev) {
                map.set(key, item);
            } else {
                // 合并：status 保留用户设置过的（非 not_started），其余字段取非空值
                map.set(key, {
                    ...prev,
                    ...item,
                    status: prev.status !== "not_started" ? prev.status : item.status,
                    title: prev.title || item.title,
                    bookID: prev.bookID || item.bookID,
                    isbn: prev.isbn || item.isbn,
                    noteDocId: prev.noteDocId || item.noteDocId,
                    lastSyncedAt: Math.max(prev.lastSyncedAt || 0, item.lastSyncedAt || 0) || prev.lastSyncedAt || item.lastSyncedAt,
                    lastNewNoteCount: Math.max(prev.lastNewNoteCount || 0, item.lastNewNoteCount || 0) || prev.lastNewNoteCount || item.lastNewNoteCount,
                    hasNewNotes: prev.hasNewNotes || item.hasNewNotes,
                    syncFailed: prev.syncFailed || item.syncFailed,
                    lastSyncError: prev.lastSyncError || item.lastSyncError,
                    updatedAt: Math.max(prev.updatedAt || 0, item.updatedAt || 0),
                });
            }
        }

        // 合并缓存中的书籍（补充新书）
        if (cache) {
            for (const book of cache) {
                const bookID = book.bookID || book.bookId || "";
                if (!bookID) continue;
                const sourceType = book.sourceType === "weread_mp_account" ? "weread-mp" : "weread-book";
                const sourceKey = getWereadSourceKey(sourceType === "weread-mp" ? "mp" : "book", bookID);
                if (!map.has(sourceKey)) {
                    map.set(sourceKey, {
                        sourceKey,
                        sourceType,
                        bookID,
                        isbn: book.isbn || "",
                        title: book.title || bookID,
                        status: "not_started",
                        updatedAt: Date.now(),
                    });
                }
            }
        }

        statuses = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
        await saveReadingBookStatuses(plugin, statuses);
    }

    async function setStatus(item: ReadingBookStatus, status: ReadingBookReviewStatus) {
        await updateReadingBookStatusValue(plugin, item.sourceKey, status);
        await loadStatuses();
    }

    function handleStatusChange(item: ReadingBookStatus, event: Event) {
        const value = (event.currentTarget as HTMLSelectElement).value as ReadingBookReviewStatus;
        setStatus(item, value);
    }

    function openBook(item: ReadingBookStatus) {
        if (!item.noteDocId) {
            showMessage("该书暂无可打开的本地笔记");
            return;
        }
        openDoc(plugin, item.noteDocId, 1);
    }

    function formatTime(ts?: number): string {
        return ts ? new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    }

    $: visibleStatuses = statuses.filter((item) => {
        const text = `${item.title} ${item.bookID || ""} ${item.isbn || ""}`.toLowerCase();
        if (query && !text.includes(query.toLowerCase())) return false;
        if (filter === "all") return true;
        if (filter === "new") return item.hasNewNotes;
        if (filter === "failed") return item.syncFailed;
        return item.status === filter;
    });
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>书籍整理状态</h2>
            <p>维护每本书的整理进度，新增笔记和同步失败标签会自动更新</p>
        </div>
    </div>

    <div class="subpage-toolbar">
        <div class="subpage-toolbar-group">
            <input bind:value={query} placeholder="搜索书名 / ISBN / BookID" />
        </div>
        <div class="subpage-toolbar-extra">
            <select bind:value={filter}>
                <option value="all">全部</option>
                {#each statusOptions as [value, label]}
                    <option value={value}>{label}</option>
                {/each}
                <option value="new">有新增笔记</option>
                <option value="failed">同步失败</option>
            </select>
        </div>
    </div>

    <div class="status-grid">
        {#each visibleStatuses as item (item.sourceKey)}
            <article class="status-card">
                <div class="status-main">
                    <div>
                        <div class="title">{item.title}</div>
                        <div class="meta">
                            <span>
                                {#if item.sourceType === "weread-mp"}
                                    <SiYuanIcon name="officialAccount" pluginName={plugin.name} size={12} />
                                    <span>公众号</span>
                                {:else if item.sourceType === "local-book"}
                                    本地书
                                {:else}
                                    普通书
                                {/if}
                            </span>
                            <span>{item.bookID || item.isbn || "无来源 ID"}</span>
                        </div>
                    </div>
                    <select value={item.status} on:change={(event) => handleStatusChange(item, event)}>
                        {#each statusOptions as [value, label]}
                            <option value={value}>{label}</option>
                        {/each}
                    </select>
                </div>
                <div class="badges">
                    {#if item.hasNewNotes}<span>有新增笔记 {item.lastNewNoteCount || ""}</span>{/if}
                    {#if item.syncFailed}<span class="failed">同步失败</span>{/if}
                    <span class:unbound={!item.noteDocId && !item.syncFailed}>{item.noteDocId ? "已绑定文档" : "未绑定文档"}</span>
                </div>
                <div class="footer">
                    <span>最近同步：{formatTime(item.lastSyncedAt)}</span>
                    <button disabled={!item.noteDocId} on:click={() => openBook(item)}>打开笔记</button>
                </div>
            </article>
        {/each}
    </div>
</div>

<style>
    .reading-page {
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

    h2 {
        margin: 0 0 4px 0;
        font-size: 20px;
    }

    p {
        margin: 0;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .back-btn,
    .status-card select,
    .footer button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
    }

    .back-btn,
    .footer button {
        cursor: pointer;
    }

    .subpage-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        height: auto;
        min-height: unset;
        overflow: visible;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
        box-sizing: border-box;
        margin-bottom: 14px;
    }

    .subpage-toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        flex: 1 1 420px;
        min-width: 0;
    }

    .subpage-toolbar-group input {
        height: 32px;
        min-width: 200px;
        flex: 1;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        border-radius: 6px;
        font-size: 12px;
        box-sizing: border-box;
    }

    .subpage-toolbar-extra {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .subpage-toolbar select {
        flex: 0 0 150px;
        height: 32px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        border-radius: 6px;
        padding: 0 10px;
        font-size: 12px;
    }

    @media (max-width: 720px) {
        .subpage-toolbar-group {
            flex-basis: 100%;
        }
        .subpage-toolbar select {
            flex: 1 1 100%;
            width: 100%;
        }
    }

    .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px;
    }

    .status-card {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        padding: 14px;
        min-width: 0;
        overflow: hidden;
        display: grid;
        gap: 12px;
    }

    .status-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 10px;
    }

    .status-card select {
        width: 92px;
        max-width: 92px;
        flex-shrink: 0;
    }

    .title {
        font-size: 14px;
        font-weight: 700;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
    }

    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--b3-theme-on-surface-light, #777);
        font-size: 12px;
        margin-top: 4px;
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .badges span {
        font-size: 11px;
        border-radius: 999px;
        padding: 2px 8px;
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 10%, transparent);
        color: var(--b3-theme-primary, #4CAF50);
    }

    .badges .failed {
        color: #F44336;
        background: rgba(244, 67, 54, 0.1);
    }

    .badges .unbound {
        color: #FF9800;
        background: rgba(255, 152, 0, 0.08);
    }

    .footer {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #777);
    }

    .footer button {
        align-self: flex-end;
    }

    .footer button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    @media (max-width: 480px) {
        .status-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
