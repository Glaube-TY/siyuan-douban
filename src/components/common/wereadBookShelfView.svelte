<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { openDoc } from "@/utils/openDoc";

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

    onMount(() => {
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

    function isMpAccount(book: typeof books[0]): boolean {
        return book.sourceType === "weread_mp_account" || (book.bookId || "").startsWith("MP_WXS_");
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
</script>

<div class="weread-bookshelf-view" bind:this={containerEl}>
    <div class="weread-bookshelf-rows">
        {#each chunkBooks(books, columns) as rowBooks}
            <div class="weread-bookshelf-row">
                <div class="weread-bookshelf-books" style="grid-template-columns: repeat({columns}, minmax(0, 1fr));">
                    {#each rowBooks as book}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                            class="weread-bookshelf-item"
                            class:has-local-doc={canOpenBook(book)}
                            class:not-openable={!canOpenBook(book)}
                            on:mouseenter={(event) => showTooltip(book, event)}
                            on:mousemove={moveTooltip}
                            on:mouseleave={hideTooltip}
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
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="weread-bookshelf-board"></div>
            </div>
        {/each}
    </div>

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
                    <span class="label">类型</span>
                    <span class="value">{hoveredBook.sourceType === "local_book" ? "本地书籍" : isMpAccount(hoveredBook) ? "公众号" : "普通书"}</span>
                </div>
            </div>
        </div>
    {/if}
</div>
