<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { openDoc } from "@/utils/openDoc";
    import type { ReadingBookStatus, ReadingBookReviewStatus } from "@/types/readingStatus";
    import { READING_BOOK_STATUS_LABELS } from "@/types/readingStatus";
    import { getReadingBookStatuses, getReadingSourceKey, updateReadingBookStatusValue, upsertReadingBookStatus } from "@/utils/storage/readingStorage";

    export let plugin: any;
    export let closeDialog: () => void = () => {};
    export let showLocalDocBadge = true;
    export let openAllBooks = false;
    export let books: Array<{
        title?: string;
        author?: string;
        cover?: string;
        publishTime?: string;
        price?: number;
        isbn?: string;
        publisher?: string;
        totalWords?: number;
        bookId?: string;
        bookID?: string;
        sourceType?: string;
        noteCount?: number;
        reviewCount?: number;
        star?: number;
        localDocBlockID?: string;
        localDocMatchType?: string;
        blockID?: string;
        pages?: string | number;
        category?: string;
        readingStatus?: string;
    }>;

    let containerEl: HTMLDivElement;
    let columns = 5;
    let hoveredBook: typeof books[0] | null = null;
    let tooltipX = 0;
    let tooltipY = 0;
    let observer: ResizeObserver | null = null;
    let statuses: ReadingBookStatus[] = [];
    let viewMode: "shelf" | "list" | "compact" = "shelf";
    let filterMode: "all" | "reading" | "to_review" | "reviewed" | "new" | "failed" | "mp" | "book" = "all";
    let sortMode: "title" | "author" | "recentSync" | "newNotes" = "title";
    let query = "";
    let contextBook: typeof books[0] | null = null;
    let contextX = 0;
    let contextY = 0;

    const statusOptions = Object.entries(READING_BOOK_STATUS_LABELS) as Array<[ReadingBookReviewStatus, string]>;

    onMount(() => {
        loadStatuses();
        observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (width >= 1100) columns = 6;
                else if (width >= 920) columns = 5;
                else if (width >= 760) columns = 4;
                else if (width >= 560) columns = 3;
                else columns = 2;
            }
        });
        observer.observe(containerEl);
    });

    onDestroy(() => {
        if (observer) observer.disconnect();
    });

    function chunkBooks(arr: typeof books, cols: number): typeof books[] {
        const result: typeof books[] = [];
        for (let i = 0; i < arr.length; i += cols) {
            result.push(arr.slice(i, i + cols));
        }
        return result;
    }

    async function loadStatuses() {
        statuses = await getReadingBookStatuses(plugin);
    }

    function isMpAccount(book: typeof books[0]): boolean {
        return book.sourceType === "weread_mp_account" || (book.bookId || "").startsWith("MP_WXS_");
    }

    function getBookID(book: typeof books[0]): string {
        return book.bookID || book.bookId || book.blockID || book.localDocBlockID || book.title || "";
    }

    function getBookSourceKey(book: typeof books[0]): string {
        if (book.sourceType === "local_book") return getReadingSourceKey("local-book", getBookID(book));
        if (isMpAccount(book)) return getReadingSourceKey("weread-mp", getBookID(book));
        return getReadingSourceKey("weread-book", getBookID(book));
    }

    function getBookStatus(book: typeof books[0]): ReadingBookStatus | undefined {
        return statuses.find((item) => item.sourceKey === getBookSourceKey(book));
    }

    function getStatusLabel(book: typeof books[0]): string {
        const status = getBookStatus(book)?.status;
        return status ? READING_BOOK_STATUS_LABELS[status] : "未开始";
    }

    function getStatusDotClass(book: typeof books[0]): string {
        const status = getBookStatus(book);
        if (status?.syncFailed) return "sync-failed";
        if (status?.hasNewNotes) return "has-new";
        if (status?.status === "archived") return "archived";
        if (status?.status === "to_review" || status?.status === "reviewing") return "to-review";
        if (status?.status === "reviewed") return "reviewed";
        return "default";
    }

    function formatWordCount(words: number | undefined): string {
        if (!words) return "暂无";
        if (words >= 10000) return `${(words / 10000).toFixed(1)}万字`;
        return `${words}字`;
    }

    function formatPrice(price: number | undefined): string {
        if (price === undefined || price === null) return "暂无";
        return `¥${price}`;
    }

    function formatStar(star: number | undefined): string {
        if (star === undefined || star === null) return "暂无";
        return `${(star / 10).toFixed(1)}`;
    }

    function getOpenDocID(book: typeof books[0]): string {
        if (book.localDocBlockID) return book.localDocBlockID;
        if (openAllBooks && book.blockID) return book.blockID;
        return "";
    }

    function canOpenBook(book: typeof books[0]): boolean {
        return !!getOpenDocID(book);
    }

    function handleOpenBook(book: typeof books[0]) {
        const docID = getOpenDocID(book);
        if (!docID) return;

        openDoc(plugin, docID, 1);

        closeDialog?.();

        if (plugin?.closeSettingsDialog) {
            plugin.closeSettingsDialog();
        }
    }

    function showTooltip(book: typeof books[0], event: MouseEvent) {
        hoveredBook = book;
        moveTooltip(event);
    }

    function moveTooltip(event: MouseEvent) {
        const width = 280;
        const height = 260;
        let x = event.clientX + 16;
        let y = event.clientY + 16;

        if (x + width > window.innerWidth - 12) x = event.clientX - width - 16;
        if (y + height > window.innerHeight - 12) y = event.clientY - height - 16;
        if (x < 12) x = 12;
        if (y < 12) y = 12;

        tooltipX = x;
        tooltipY = y;
    }

    function hideTooltip() {
        hoveredBook = null;
    }

    function showContextMenu(book: typeof books[0], event: MouseEvent) {
        event.preventDefault();
        contextBook = book;
        contextX = Math.min(event.clientX, window.innerWidth - 220);
        contextY = Math.min(event.clientY, window.innerHeight - 220);
        hideTooltip();
    }

    function hideContextMenu() {
        contextBook = null;
    }

    async function setBookStatus(book: typeof books[0], status: ReadingBookReviewStatus) {
        const sourceKey = getBookSourceKey(book);
        const existing = getBookStatus(book);
        if (!existing) {
            await upsertReadingBookStatus(plugin, {
                sourceKey,
                sourceType: book.sourceType === "local_book" ? "local-book" : isMpAccount(book) ? "weread-mp" : "weread-book",
                bookID: getBookID(book),
                isbn: book.isbn,
                title: book.title || getBookID(book),
                noteDocId: getOpenDocID(book),
                status,
            });
        } else {
            await updateReadingBookStatusValue(plugin, sourceKey, status);
        }
        await loadStatuses();
        hideContextMenu();
    }

    function handleContextStatusChange(event: Event) {
        if (!contextBook) return;
        const value = (event.currentTarget as HTMLSelectElement).value as ReadingBookReviewStatus;
        setBookStatus(contextBook, value);
    }

    function openContextBook() {
        if (!contextBook) return;
        handleOpenBook(contextBook);
    }

    function copyContextBook() {
        if (!contextBook) return;
        copyBookInfo(contextBook);
    }

    async function copyBookInfo(book: typeof books[0]) {
        const text = [
            `书名：${book.title || ""}`,
            `作者：${book.author || ""}`,
            `ISBN：${book.isbn || ""}`,
            `BookID：${book.bookID || book.bookId || ""}`,
            `状态：${getStatusLabel(book)}`,
        ].join("\n");
        try {
            await navigator.clipboard.writeText(text);
            showMessage("已复制书籍信息");
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
        hideContextMenu();
    }

    function actionHint(message: string) {
        showMessage(message);
        hideContextMenu();
    }

    $: filteredBooks = books.filter((book) => {
        const status = getBookStatus(book);
        const text = `${book.title || ""} ${book.author || ""} ${book.isbn || ""} ${book.bookID || book.bookId || ""} ${getStatusLabel(book)}`.toLowerCase();
        if (query && !text.includes(query.toLowerCase())) return false;
        if (filterMode === "reading") return status?.status === "reading";
        if (filterMode === "to_review") return status?.status === "to_review" || status?.status === "reviewing";
        if (filterMode === "reviewed") return status?.status === "reviewed";
        if (filterMode === "new") return !!status?.hasNewNotes;
        if (filterMode === "failed") return !!status?.syncFailed;
        if (filterMode === "mp") return isMpAccount(book);
        if (filterMode === "book") return !isMpAccount(book);
        return true;
    });

    $: visibleBooks = [...filteredBooks].sort((a, b) => {
        const statusA = getBookStatus(a);
        const statusB = getBookStatus(b);
        if (sortMode === "recentSync") return (statusB?.lastSyncedAt || 0) - (statusA?.lastSyncedAt || 0);
        if (sortMode === "newNotes") return (statusB?.lastNewNoteCount || 0) - (statusA?.lastNewNoteCount || 0);
        if (sortMode === "author") return (a.author || "").localeCompare(b.author || "", "zh-CN");
        return (a.title || "").localeCompare(b.title || "", "zh-CN");
    });
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="weread-bookshelf-view" bind:this={containerEl} on:click={hideContextMenu}>
    <div class="weread-bookshelf-toolbar">
        <input bind:value={query} placeholder="搜索书名、作者、ISBN、BookID、状态" />
        <select bind:value={filterMode}>
            <option value="all">全部</option>
            <option value="reading">在读</option>
            <option value="to_review">待整理</option>
            <option value="reviewed">已整理</option>
            <option value="new">有新增笔记</option>
            <option value="failed">同步失败</option>
            <option value="mp">公众号</option>
            <option value="book">普通书</option>
        </select>
        <select bind:value={sortMode}>
            <option value="title">书名</option>
            <option value="author">作者</option>
            <option value="recentSync">最近同步</option>
            <option value="newNotes">新增笔记数量</option>
        </select>
        <div class="view-switch">
            <button class:active={viewMode === "shelf"} on:click={() => (viewMode = "shelf")}>书架</button>
            <button class:active={viewMode === "list"} on:click={() => (viewMode = "list")}>列表</button>
            <button class:active={viewMode === "compact"} on:click={() => (viewMode = "compact")}>紧凑</button>
        </div>
    </div>

    {#if viewMode === "list"}
        <div class="weread-bookshelf-list">
            {#each visibleBooks as book (getBookSourceKey(book))}
                <div class="weread-bookshelf-list-row" on:contextmenu={(event) => showContextMenu(book, event)}>
                    <img src={book.cover || ""} alt="" />
                    <div class="list-title">
                        <strong>{book.title || "暂无"}</strong>
                        <span>{book.author || "暂无作者"}</span>
                    </div>
                    <span>{getStatusLabel(book)}</span>
                    <span>{getBookStatus(book)?.lastNewNoteCount || 0}</span>
                    <button disabled={!canOpenBook(book)} on:click={() => handleOpenBook(book)}>打开</button>
                </div>
            {/each}
        </div>
    {:else}
    <div class="weread-bookshelf-rows">
        {#each chunkBooks(visibleBooks, viewMode === "compact" ? Math.min(columns + 2, 8) : columns) as rowBooks}
            <div class="weread-bookshelf-row">
                <div class="weread-bookshelf-books" class:compact={viewMode === "compact"} style="grid-template-columns: repeat({viewMode === "compact" ? Math.min(columns + 2, 8) : columns}, minmax(0, 1fr));">
                    {#each rowBooks as book}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                            class="weread-bookshelf-item"
                            class:has-local-doc={canOpenBook(book)}
                            class:not-openable={!canOpenBook(book)}
                            on:mouseenter={(event) => showTooltip(book, event)}
                            on:mousemove={moveTooltip}
                            on:mouseleave={hideTooltip}
                            on:contextmenu={(event) => showContextMenu(book, event)}
                        >
                            <div class="weread-bookshelf-book">
                                <div
                                    class="weread-bookshelf-cover"
                                    role="button"
                                    aria-disabled={!canOpenBook(book)}
                                    tabindex={canOpenBook(book) ? 0 : -1}
                                    on:click={() => handleOpenBook(book)}
                                    on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenBook(book); } }}
                                >
                                    {#if book.cover}
                                        <img
                                            class="weread-bookshelf-cover-img"
                                            src={book.cover}
                                            alt={book.title || ""}
                                            loading="lazy"
                                        />
                                    {:else}
                                        <div class="weread-bookshelf-placeholder">
                                            <span>?</span>
                                        </div>
                                    {/if}
                                    {#if showLocalDocBadge && book.localDocBlockID}
                                        <span class="weread-bookshelf-local-doc-badge">✓</span>
                                    {/if}
                                    <span class="weread-bookshelf-status-dot {getStatusDotClass(book)}" title={getStatusLabel(book)}></span>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="weread-bookshelf-board"></div>
            </div>
        {/each}
    </div>
    {/if}

    {#if hoveredBook}
        <div
            class="weread-bookshelf-tooltip"
            style="left:{tooltipX}px; top:{tooltipY}px;"
        >
            <div class="weread-bookshelf-tooltip-title">{hoveredBook.title || "暂无"}</div>
            <div class="weread-bookshelf-tooltip-meta">
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">作者</span>
                    <span class="value">{hoveredBook.author || "暂无"}</span>
                </div>
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">出版社</span>
                    <span class="value">{hoveredBook.publisher || "暂无"}</span>
                </div>
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">出版时间</span>
                    <span class="value">{hoveredBook.publishTime ? hoveredBook.publishTime.split(" ")[0] : "暂无"}</span>
                </div>
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">ISBN</span>
                    <span class="value">{hoveredBook.isbn || "暂无"}</span>
                </div>
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">字数</span>
                    <span class="value">{formatWordCount(hoveredBook.totalWords)}</span>
                </div>
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">价格</span>
                    <span class="value">{formatPrice(hoveredBook.price)}</span>
                </div>
                {#if hoveredBook.noteCount !== undefined}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">笔记</span>
                        <span class="value">{hoveredBook.noteCount} 条</span>
                    </div>
                {/if}
                {#if hoveredBook.reviewCount !== undefined}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">书评</span>
                        <span class="value">{hoveredBook.reviewCount} 条</span>
                    </div>
                {/if}
                {#if hoveredBook.star !== undefined}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">评分</span>
                        <span class="value">{formatStar(hoveredBook.star)}</span>
                    </div>
                {/if}
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">本地笔记</span>
                    <span class="value">{canOpenBook(hoveredBook) ? "可打开" : "暂无"}</span>
                </div>
                {#if hoveredBook.pages}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">页数</span>
                        <span class="value">{hoveredBook.pages}</span>
                    </div>
                {/if}
                {#if hoveredBook.category}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">分类</span>
                        <span class="value">{hoveredBook.category}</span>
                    </div>
                {/if}
                {#if hoveredBook.readingStatus}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">状态</span>
                        <span class="value">{hoveredBook.readingStatus}</span>
                    </div>
                {/if}
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">整理状态</span>
                    <span class="value">{getStatusLabel(hoveredBook)}</span>
                </div>
                {#if getBookStatus(hoveredBook)?.hasNewNotes}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">新增笔记</span>
                        <span class="value">{getBookStatus(hoveredBook)?.lastNewNoteCount || 0} 条</span>
                    </div>
                {/if}
                {#if getBookStatus(hoveredBook)?.syncFailed}
                    <div class="weread-bookshelf-tooltip-row">
                        <span class="label">同步状态</span>
                        <span class="value">同步失败</span>
                    </div>
                {/if}
                <div class="weread-bookshelf-tooltip-row">
                    <span class="label">类型</span>
                    <span class="value">{hoveredBook.sourceType === "local_book" ? "本地书籍" : isMpAccount(hoveredBook) ? "公众号" : "普通书"}</span>
                </div>
            </div>
        </div>
    {/if}

    {#if contextBook}
        <div class="weread-bookshelf-context-menu" style="left:{contextX}px; top:{contextY}px;" on:click|stopPropagation>
            <button disabled={!canOpenBook(contextBook)} on:click={openContextBook}>打开笔记</button>
            <div class="context-select">
                <span>整理状态</span>
                <select value={getBookStatus(contextBook)?.status || "not_started"} on:change={handleContextStatusChange}>
                    {#each statusOptions as [value, label]}
                        <option value={value}>{label}</option>
                    {/each}
                </select>
            </div>
            <button on:click={() => actionHint("请从阅读中心新增笔记收件箱查看该书新增内容")}>查看新增笔记</button>
            <button on:click={() => actionHint("请在微信读书页使用更新同步")}>立即同步此书</button>
            <button on:click={copyContextBook}>复制书籍信息</button>
            <button disabled={!canOpenBook(contextBook)} on:click={openContextBook}>在数据库中定位</button>
            <button on:click={() => actionHint("可在微信读书忽略书籍管理中维护忽略列表")}>忽略微信读书同步</button>
        </div>
    {/if}
</div>

<style>
    .weread-bookshelf-view {
        position: relative;
        min-height: 0;
    }

    .weread-bookshelf-toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: var(--b3-theme-surface, #fff);
        border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
    }

    .weread-bookshelf-toolbar input,
    .weread-bookshelf-toolbar select,
    .view-switch button,
    .weread-bookshelf-list-row button,
    .weread-bookshelf-context-menu button,
    .weread-bookshelf-context-menu select {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        font-size: 12px;
        padding: 6px 10px;
    }

    .weread-bookshelf-toolbar input {
        min-width: min(340px, 100%);
        flex: 1;
    }

    .view-switch {
        display: inline-flex;
        gap: 4px;
    }

    .view-switch button {
        cursor: pointer;
    }

    .view-switch button.active {
        border-color: var(--b3-theme-primary, #4CAF50);
        color: var(--b3-theme-primary, #4CAF50);
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 10%, transparent);
    }

    .weread-bookshelf-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
    }

    .weread-bookshelf-list-row {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 96px 80px 72px;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        background: var(--b3-theme-surface, #fff);
    }

    .weread-bookshelf-list-row img {
        width: 36px;
        height: 50px;
        object-fit: cover;
        border-radius: 4px;
        background: var(--b3-theme-background, #f5f5f5);
    }

    .list-title {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .list-title strong,
    .list-title span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .list-title span,
    .weread-bookshelf-list-row > span {
        color: var(--b3-theme-on-surface-light, #777);
        font-size: 12px;
    }

    .weread-bookshelf-books.compact .weread-bookshelf-cover {
        transform: scale(0.86);
        transform-origin: bottom center;
    }

    .weread-bookshelf-cover {
        position: relative;
    }

    .weread-bookshelf-status-dot {
        position: absolute;
        right: -4px;
        bottom: -4px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid var(--b3-theme-surface, #fff);
        background: #9E9E9E;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }

    .weread-bookshelf-status-dot.has-new {
        background: #2196F3;
    }

    .weread-bookshelf-status-dot.to-review {
        background: #FF9800;
    }

    .weread-bookshelf-status-dot.sync-failed {
        background: #F44336;
    }

    .weread-bookshelf-status-dot.reviewed {
        background: #4CAF50;
    }

    .weread-bookshelf-status-dot.archived {
        background: #9E9E9E;
    }

    .weread-bookshelf-context-menu {
        position: fixed;
        z-index: 10000;
        width: 220px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    }

    .weread-bookshelf-context-menu button {
        text-align: left;
        cursor: pointer;
    }

    .weread-bookshelf-context-menu button:disabled,
    .weread-bookshelf-list-row button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .context-select {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #666);
    }

    @media (max-width: 720px) {
        .weread-bookshelf-list-row {
            grid-template-columns: 38px minmax(0, 1fr) 72px;
        }

        .weread-bookshelf-list-row > span:nth-of-type(2),
        .weread-bookshelf-list-row button {
            display: none;
        }
    }
</style>
