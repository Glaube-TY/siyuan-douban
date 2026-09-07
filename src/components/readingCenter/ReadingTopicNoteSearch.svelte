<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
    import { t } from "../../utils/i18n";
    import {
        loadReadingTopicNoteSearchData,
        searchReadingTopicNotes,
        type ReadingTopicNoteSearchData,
        type ReadingTopicNoteSearchResult,
        type ReadingTopicNoteSearchResults,
    } from "../../utils/readingCenter/readingTopicNoteSearchService";

    export let plugin: any;
    export let currentTopicId = "";
    export let topics: ReadingTopic[] = [];
    export let topicItems: ReadingTopicItem[] = [];
    export let pendingInboxItem: ReadingInboxItem | null = null;
    export let disabled = false;
    export let resetKey = 0;

    type LoadState = "loading" | "loaded" | "error";
    const POPUP_RESULT_LIMIT = 10;

    let loadState: LoadState = "loading";
    let errorMessage = "";
    let searchData: ReadingTopicNoteSearchData | null = null;
    let searchResults: ReadingTopicNoteSearchResults = { totalMatched: 0, visibleResults: [] };
    let visibleResults: ReadingTopicNoteSearchResult[] = [];
    let searchQuery = "";
    let searchOpen = false;
    let searchWrapper: HTMLElement;
    let mounted = false;
    let lastPendingItemId: string | null = null;
    let lastResetKey = resetKey;
    let loadToken = 0;
    const dispatch = createEventDispatcher<{ assign: ReadingTopicNoteSearchResult }>();

    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    onMount(() => {
        mounted = true;
        lastPendingItemId = pendingInboxItem?.id || null;
        if (pendingInboxItem) {
            searchQuery = getPendingSearchQuery(pendingInboxItem);
            searchOpen = searchQuery.length > 0;
        }
        document.addEventListener("pointerdown", handleDocumentPointerDown);
        void loadSearchData();

        return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
    });

    $: if (mounted && (pendingInboxItem?.id || null) !== lastPendingItemId) {
        const nextPendingItemId = pendingInboxItem?.id || null;
        lastPendingItemId = nextPendingItemId;
        if (nextPendingItemId) {
            searchQuery = getPendingSearchQuery(pendingInboxItem!);
            searchOpen = searchQuery.length > 0;
            void loadSearchData();
        } else {
            searchQuery = "";
            searchOpen = false;
            if (searchData?.pendingAnnotationId) {
                searchData = { ...searchData, pendingAnnotationId: undefined };
            }
        }
    }

    $: if (mounted && resetKey !== lastResetKey) {
        lastResetKey = resetKey;
        searchQuery = "";
        searchOpen = false;
    }

    $: searchResults = searchData && searchQuery.trim()
        ? searchReadingTopicNotes(searchData.annotations, topicItems, searchQuery, searchData.pendingAnnotationId)
        : { totalMatched: 0, visibleResults: [] };
    $: visibleResults = searchResults.visibleResults.slice(0, POPUP_RESULT_LIMIT);

    function handleSearchInput(event: Event): void {
        const value = (event.currentTarget as HTMLInputElement).value;
        searchQuery = value;
        searchOpen = value.trim().length > 0;
    }

    function handleSearchFocus(): void {
        if (searchQuery.trim()) searchOpen = true;
    }

    function handleSearchKeydown(event: KeyboardEvent): void {
        if (event.key !== "Escape") return;
        event.preventDefault();
        searchOpen = false;
    }

    function handleDocumentPointerDown(event: PointerEvent): void {
        if (!searchOpen || !searchWrapper) return;
        const target = event.target;
        if (target instanceof Node && !searchWrapper.contains(target)) searchOpen = false;
    }

    function getPendingSearchQuery(item: ReadingInboxItem): string {
        const source = item.reviewContent?.trim() || item.content.trim() || item.title.trim();
        return source.replace(/\s+/g, " ").slice(0, 24);
    }

    async function loadSearchData(): Promise<void> {
        const token = ++loadToken;
        loadState = "loading";
        errorMessage = "";
        try {
            const data = await loadReadingTopicNoteSearchData(plugin, pendingInboxItem);
            if (token !== loadToken) return;
            searchData = data;
            loadState = "loaded";
        } catch (error: any) {
            if (token !== loadToken) return;
            loadState = "error";
            errorMessage = error?.message || String(error) || tx("uiUnknownError", "未知错误");
        }
    }

    function topicMembershipLabel(result: ReadingTopicNoteSearchResult): string {
        if (result.topicIds.length === 0) return "";
        const names = result.topicIds.map((topicId) =>
            topics.find((topic) => topic.id === topicId)?.name
            || tx("topicsOtherMembership", "其他主题"));
        const visibleNames = names.slice(0, 3).join(" · ");
        const label = tx("topicsAlreadyIn", "已在：{topics}", { topics: visibleNames });
        const remaining = names.length - 3;
        return remaining > 0
            ? label + " · " + tx("topicsMoreMemberships", "等 {count} 个主题", { count: remaining })
            : label;
    }

    function contextTitle(result: ReadingTopicNoteSearchResult): string {
        return result.annotation.sourceType === "weread-mp"
            ? result.annotation.articleTitle || ""
            : result.annotation.chapterTitle || "";
    }

    function isCurrentTopicResult(result: ReadingTopicNoteSearchResult): boolean {
        return result.topicIds.includes(currentTopicId);
    }
</script>

<section class="topic-note-search" aria-labelledby="topic-note-search-label">
    <div class="topic-note-search-wrapper" bind:this={searchWrapper}>
        <label id="topic-note-search-label" class="sr-only" for="reading-topic-note-search">
            {tx("topicsNoteSearchLabel", "搜索阅读笔记")}
        </label>
        <input
            id="reading-topic-note-search"
            class="topic-note-search-input"
            type="search"
            bind:value={searchQuery}
            aria-label={tx("topicsNoteSearchLabel", "搜索阅读笔记")}
            placeholder={tx("topicsNoteSearchPlaceholder", "搜索笔记、书名、章节或内容…")}
            disabled={disabled}
            on:input={handleSearchInput}
            on:focus={handleSearchFocus}
            on:keydown={handleSearchKeydown}
        />

        {#if searchOpen && searchQuery.trim()}
            <div
                class="topic-note-search-popup"
                role="region"
                aria-label={tx("topicsNoteSearchLabel", "搜索阅读笔记")}
            >
                {#if loadState === "loading"}
                    <div class="topic-note-state" role="status">{tx("topicsNoteSearchLoading", "正在加载笔记索引…")}</div>
                {:else if loadState === "error"}
                    <div class="topic-note-state topic-note-state-error" role="alert">
                        {tx("topicsNoteSearchLoadFailed", "阅读笔记读取失败：{error}", { error: errorMessage })}
                    </div>
                {:else}
                    <div class="topic-note-search-summary" aria-live="polite">
                        {tx("topicsSearchResults", "搜索结果 · {count} 条", { count: searchResults.totalMatched })}
                    </div>

                    {#if visibleResults.length === 0}
                        <div class="topic-note-state" role="status">
                            {tx("topicsSearchNoMatches", "没有找到匹配的笔记")}
                        </div>
                    {:else}
                        <div class="topic-note-results" role="list">
                            {#each visibleResults as result (result.annotation.id)}
                                <div class="topic-note-result" role="listitem">
                                    <button
                                        type="button"
                                        class="topic-note-result-main"
                                        disabled={disabled || isCurrentTopicResult(result)}
                                        on:click={() => dispatch("assign", result)}
                                    >
                                        <span class="topic-note-result-header">
                                            <span class="topic-note-badges">
                                                {#if result.isPending}
                                                    <span class="topic-note-badge topic-note-badge-pending">
                                                        {tx("topicsPendingNote", "待加入笔记")}
                                                    </span>
                                                {/if}
                                                <span class="topic-note-badge">
                                                    {result.annotation.annotationType === "highlight"
                                                        ? tx("readingAnnotationsHighlight", "划线")
                                                        : tx("readingAnnotationsReview", "想法")}
                                                </span>
                                                <span class="topic-note-badge">
                                                    {result.annotation.sourceType === "weread-mp"
                                                        ? tx("readingAnnotationsSourceMp", "公众号")
                                                        : tx("readingAnnotationsSourceBook", "普通书")}
                                                </span>
                                            </span>
                                            <strong>{result.annotation.title}</strong>
                                        </span>
                                        {#if contextTitle(result)}
                                            <span class="topic-note-context">{contextTitle(result)}</span>
                                        {/if}
                                        <span class="topic-note-content">{result.annotation.content}</span>
                                        {#if topicMembershipLabel(result)}
                                            <span class="topic-note-membership">{topicMembershipLabel(result)}</span>
                                        {/if}
                                    </button>
                                    <div class="topic-note-result-actions">
                                        <button
                                            type="button"
                                            class="topic-note-add"
                                            disabled={disabled || isCurrentTopicResult(result)}
                                            on:click={() => dispatch("assign", result)}
                                        >
                                            {isCurrentTopicResult(result)
                                                ? tx("topicsAlreadyInCurrent", "已在当前主题")
                                                : tx("topicsAddSearchResult", "加入")}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}

                    {#if searchResults.totalMatched > visibleResults.length}
                        <div class="topic-note-search-footer" role="status">
                            {tx(
                                "topicsSearchMoreResults",
                                "找到 {total} 条，当前显示前 {visible} 条，请继续输入关键词缩小范围。",
                                { total: searchResults.totalMatched, visible: visibleResults.length },
                            )}
                        </div>
                    {/if}

                    {#if searchData?.coverage.archiveMissing || searchData?.coverage.archiveIncomplete}
                        <div class="topic-note-archive-notice" role="status">
                            {tx("topicsArchiveIncomplete", "历史索引未完整建立，当前结果可能不完整。")}
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
</section>

<style>
    .topic-note-search {
        min-width: 0;
        margin-bottom: 12px;
    }

    .topic-note-search-wrapper {
        position: relative;
        z-index: 20;
        min-width: 0;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    .topic-note-search-input {
        width: 100%;
        min-width: 0;
        min-height: 32px;
        box-sizing: border-box;
        padding: 6px 9px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        font: inherit;
        font-size: 12px;
    }

    .topic-note-search-input:focus-visible,
    button:focus-visible {
        outline: 2px solid var(--b3-theme-primary, #4caf50);
        outline-offset: 1px;
    }

    .topic-note-search-popup {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 20;
        max-height: min(50vh, 360px);
        min-width: 0;
        overflow-y: auto;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        box-shadow: 0 4px 14px rgb(0 0 0 / 12%);
    }

    .topic-note-search-summary {
        padding: 7px 8px;
        border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 11px;
    }

    .topic-note-state {
        padding: 14px 10px;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 11px;
        line-height: 1.5;
        text-align: center;
    }

    .topic-note-state-error {
        color: var(--b3-theme-error, #c0392b);
        text-align: left;
        overflow-wrap: anywhere;
    }

    .topic-note-results {
        display: grid;
        min-width: 0;
    }

    .topic-note-result {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        min-width: 0;
        padding: 7px 8px;
        border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
    }

    .topic-note-result-main {
        display: grid;
        gap: 4px;
        width: 100%;
        min-width: 0;
        margin: 0;
        padding: 1px 2px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-on-surface, #1f2937);
        cursor: pointer;
        font: inherit;
        text-align: left;
    }

    .topic-note-result-main:disabled {
        cursor: default;
        opacity: 1;
    }

    .topic-note-result-header,
    .topic-note-badges,
    .topic-note-result-actions {
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .topic-note-result-header {
        align-items: baseline;
        gap: 6px;
    }

    .topic-note-result-header strong {
        min-width: 0;
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 12px;
        line-height: 1.4;
    }

    .topic-note-badges {
        flex: 0 0 auto;
        flex-wrap: wrap;
        gap: 4px;
    }

    .topic-note-badge {
        display: inline-flex;
        align-items: center;
        min-height: 19px;
        padding: 2px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-on-surface-light, #666) 10%, transparent);
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 10px;
        white-space: nowrap;
    }

    .topic-note-badge-pending {
        background: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 13%, transparent);
        color: var(--b3-theme-primary, #4caf50);
    }

    .topic-note-context,
    .topic-note-membership,
    .topic-note-content {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 10px;
        line-height: 1.45;
    }

    .topic-note-content {
        display: -webkit-box;
        max-height: 3em;
        margin: 0;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 11px;
        line-height: 1.5;
        white-space: pre-wrap;
    }

    .topic-note-membership {
        color: var(--b3-theme-primary, #4caf50);
    }

    .topic-note-result-actions {
        flex: 0 0 auto;
        flex-wrap: wrap;
        align-self: center;
        justify-content: flex-end;
        gap: 4px;
    }

    .topic-note-result-actions button {
        min-height: 32px;
        padding: 5px 7px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        white-space: nowrap;
    }

    .topic-note-result-actions button:hover:not(:disabled) {
        border-color: var(--b3-theme-primary, #4caf50);
        color: var(--b3-theme-primary, #4caf50);
    }

    .topic-note-add {
        border-color: var(--b3-theme-primary, #4caf50) !important;
        color: var(--b3-theme-primary, #4caf50) !important;
    }

    .topic-note-result-actions button:disabled {
        cursor: default;
        opacity: 0.62;
    }

    .topic-note-search-footer,
    .topic-note-archive-notice {
        padding: 7px 8px;
        border-top: 1px solid var(--b3-border-color, #e0e0e0);
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 10px;
        line-height: 1.45;
    }

    .topic-note-archive-notice {
        color: var(--b3-theme-warning, #996c00);
    }

    @media (max-width: 800px) {
        .topic-note-result {
            grid-template-columns: 1fr;
        }

        .topic-note-result-actions {
            width: 100%;
            justify-content: flex-start;
        }
    }

    @media (max-width: 430px) {
        .topic-note-result-header {
            align-items: flex-start;
            flex-direction: column;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        button {
            transition: none;
        }
    }
</style>
