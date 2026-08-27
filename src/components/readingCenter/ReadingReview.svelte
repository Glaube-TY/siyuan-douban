<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import { getBlockByID } from "../../api";
    import type { ReadingReviewItem, ReadingReviewRating } from "../../types/readingReview";
    import {
        getReadingReviewIntervalPreview,
        loadReadingReviewItemsStrict,
        updateReadingReviewItemStrict,
    } from "../../utils/readingCenter/readingReviewService";
    import type { ReadingReviewUpdateAction } from "../../utils/readingCenter/readingReviewService";
    import { openDoc } from "../../utils/openDoc";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let embedded = false;

    type ReviewView = "today" | "queue";

    const dispatch = createEventDispatcher();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    let reviewItems: ReadingReviewItem[] = [];
    let dueItems: ReadingReviewItem[] = [];
    let activeQueueItems: ReadingReviewItem[] = [];
    let activeView: ReviewView = "today";
    let hasUserSelectedView = false;
    let futureCount = 0;
    let dueSourceCount = 0;
    let isLoading = true;
    let loadError = "";
    let isMutating = false;
    let openingItemId: string | null = null;

    onMount(() => {
        void load();
    });

    async function load() {
        isLoading = true;
        loadError = "";
        try {
            const nextItems = (await loadReadingReviewItemsStrict(plugin))
                .slice()
                .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
            reviewItems = nextItems;
            if (!hasUserSelectedView) {
                const activeItems = nextItems.filter((item) => item.status === "active");
                const dueCount = activeItems.filter(isDue).length;
                activeView = dueCount > 0 ? "today" : activeItems.length > 0 ? "queue" : "today";
            }
        } catch (error) {
            reviewItems = [];
            loadError = errorMessage(error);
            showMessage(tx("reviewLoadFailed", "复习队列读取失败"));
            console.error("[ReadingReview] load failed:", error);
        } finally {
            isLoading = false;
        }
    }

    async function updateItem(item: ReadingReviewItem, action: ReadingReviewUpdateAction) {
        if (isMutating) return;
        hasUserSelectedView = true;
        isMutating = true;
        try {
            const verified = await updateReadingReviewItemStrict(plugin, item.id, action);
            if (action === "remove") {
                showMessage(tx("reviewRemoved", "已移出复习队列"));
            } else {
                showMessage(tx(
                    "reviewRatingSaved",
                    "已记录为“{rating}”，下次复习：{date}",
                    {
                        rating: ratingLabel(action),
                        date: formatReviewDate(verified.nextReviewAt),
                    },
                ));
            }
            await load();
        } catch (error) {
            showMessage(tx("reviewUpdateFailed", "复习状态更新失败：{error}", { error: errorMessage(error) }));
        } finally {
            isMutating = false;
        }
    }

    async function openItem(item: ReadingReviewItem) {
        if (openingItemId === item.id) return;
        openingItemId = item.id;
        try {
            let preciseLocationStale = false;
            let preciseLocationCheckFailed = false;
            if (item.blockId) {
                try {
                    if (await getBlockByID(item.blockId)) {
                        openDoc(plugin, item.blockId, 1);
                        return;
                    }
                    preciseLocationStale = true;
                } catch (error) {
                    preciseLocationCheckFailed = true;
                    console.warn("[ReadingReview] precise block check failed:", error);
                }
            }

            if (!item.noteDocId) {
                showNoLocalNote();
                return;
            }

            try {
                if (await getBlockByID(item.noteDocId)) {
                    openDoc(plugin, item.noteDocId, 1);
                    if (preciseLocationCheckFailed) {
                        showMessage(tx(
                            "reviewPreciseLocationCheckFailed",
                            "无法确认原复习位置，已尝试打开对应笔记文档。",
                        ));
                    } else if (preciseLocationStale) {
                        showMessage(tx(
                            "reviewPreciseLocationStale",
                            "原复习位置已发生变化，已打开对应笔记文档。",
                        ));
                    }
                    return;
                }
                showNoLocalNote();
            } catch (error) {
                console.warn("[ReadingReview] note document check failed:", error);
                openDoc(plugin, item.noteDocId, 1);
                showMessage(tx(
                    "reviewPreciseLocationCheckFailed",
                    "无法确认原复习位置，已尝试打开对应笔记文档。",
                ));
            }
        } catch (error) {
            console.warn("[ReadingReview] open failed:", error);
            showNoLocalNote();
        } finally {
            openingItemId = null;
        }
    }

    function showNoLocalNote() {
        showMessage(tx("reviewItemNoLocalNote", "该复习条目暂无可打开的本地笔记"));
    }

    function ratingLabel(rating: ReadingReviewRating): string {
        if (rating === "forgot") return tx("reviewRatingForgot", "忘记");
        if (rating === "fuzzy") return tx("reviewRatingFuzzy", "模糊");
        return tx("reviewRemember", "记住");
    }

    function formatReviewDate(ts?: number) {
        return ts ? new Date(ts).toLocaleDateString() : "--";
    }

    function selectView(view: ReviewView) {
        hasUserSelectedView = true;
        activeView = view;
    }

    function isDue(item: ReadingReviewItem): boolean {
        return item.status === "active" && item.nextReviewAt <= Date.now();
    }

    function queueScheduleLabel(item: ReadingReviewItem): string {
        return isDue(item)
            ? tx("reviewDueTodayLabel", "今日到期")
            : tx("reviewNextDate", "下次：{date}", { date: formatReviewDate(item.nextReviewAt) });
    }

    function queueContent(item: ReadingReviewItem): string {
        const comment = String(item.comment || "").trim();
        const content = String(item.content || "").trim();
        return comment || content || tx("syncResultNoContent", "暂无内容");
    }

    function formatIntervalLabel(days: number): string {
        return tx("reviewIntervalDays", "{count}天", { count: days });
    }

    function getIntervalPreview(item: ReadingReviewItem) {
        return getReadingReviewIntervalPreview(item);
    }

    function hasDistinctQuote(item: ReadingReviewItem): boolean {
        const content = String(item.content || "").trim();
        const comment = String(item.comment || "").trim();
        return !!content && (!comment || content !== comment);
    }

    function errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    $: dueItems = reviewItems.filter(isDue);
    $: activeQueueItems = reviewItems
        .filter((item) => item.status === "active")
        .slice()
        .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    $: futureCount = activeQueueItems.filter((item) => !isDue(item)).length;
    $: dueSourceCount = new Set(dueItems.map((item) => item.sourceKey)).size;
</script>

<div class="reading-page" class:reading-page-embedded={embedded}>
    <div class="page-header">
        {#if !embedded}
            <button type="button" class="back-btn" on:click={() => dispatch("back")}>{tx("uiBackOverview", "返回总览")}</button>
        {/if}
        <div class="page-heading">
            <h2>{activeView === "today" ? tx("reviewTodayTitle", "今日复习") : tx("reviewQueueTab", "复习队列")}</h2>
            <p>
                {#if isLoading}
                    {tx("uiLoading", "加载中...")}
                {:else if loadError}
                    {tx("reviewLoadFailed", "复习队列读取失败")}
                {:else if activeView === "queue"}
                    {tx("reviewQueueSummary", "复习队列共 {count} 条，今日到期 {due} 条", { count: activeQueueItems.length, due: dueItems.length })}
                {:else}
                    {tx("reviewTodaySummary", "{count} 条待复习，来自 {sources} 个来源", { count: dueItems.length, sources: dueSourceCount })}
                {/if}
            </p>
        </div>
    </div>

    <div class="review-tabs" role="tablist" aria-label={tx("reviewViewLabel", "复习视图")}>
        <button
            id="review-tab-today"
            type="button"
            role="tab"
            class:active={activeView === "today"}
            aria-selected={activeView === "today"}
            aria-controls="review-panel-today"
            on:click={() => selectView("today")}
        >
            {tx("reviewViewToday", "今日复习")}
        </button>
        <button
            id="review-tab-queue"
            type="button"
            role="tab"
            class:active={activeView === "queue"}
            aria-selected={activeView === "queue"}
            aria-controls="review-panel-queue"
            on:click={() => selectView("queue")}
        >
            {tx("reviewQueueTab", "复习队列")}
        </button>
    </div>

    {#if isLoading}
        <div class="state loading" role="status" aria-live="polite">{tx("uiLoading", "加载中...")}</div>
    {:else if loadError}
        <div class="state load-error" role="alert">
            <strong>{tx("reviewLoadFailed", "复习队列读取失败")}</strong>
            <p>{tx("reviewLoadFailedDesc", "当前无法读取复习队列，为避免误判未显示为空。")}</p>
            <small>{loadError}</small>
            <button type="button" on:click={() => void load()}>{tx("uiRetry", "重试")}</button>
        </div>
    {:else if activeView === "today"}
        <div id="review-panel-today" class="review-view" role="tabpanel" aria-labelledby="review-tab-today" tabindex="0">
            {#if futureCount > 0}
                <div class="future" role="status">{tx("reviewQueueFuture", "复习队列中还有 {count} 条未到期内容", { count: futureCount })}</div>
            {/if}

            {#if dueItems.length === 0}
                <div class="empty">
                    <div>{tx("reviewTodayEmpty", "今天没有到期复习内容")}</div>
                    {#if activeQueueItems.length > 0}
                        <button type="button" class="empty-action" on:click={() => selectView("queue")}>{tx("reviewViewReview", "查看复习")}</button>
                    {/if}
                </div>
            {:else}
                <div class="review-list">
                    {#each dueItems as item (item.id)}
                        {@const preview = getIntervalPreview(item)}
                        <article>
                            <div class="title">{item.title}</div>
                            {#if item.sectionLabel}
                                <div class="section-label">{item.sectionLabel}</div>
                            {/if}
                            {#if item.comment}
                                {#if hasDistinctQuote(item)}
                                    <p class="review-quote">{item.content}</p>
                                {/if}
                                <p class="review-thought">{tx("syncResultThoughtPrefix", "想法：{text}", { text: item.comment })}</p>
                            {:else if item.content}
                                <p class="review-content">{item.content}</p>
                            {:else}
                                <p class="review-content-empty">{tx("syncResultNoContent", "暂无内容")}</p>
                            {/if}
                            <div class="meta">
                                <span>{tx("reviewTimes", "复习 {count} 次", { count: item.reviewCount })}</span>
                                <span>{tx("reviewLastTime", "上次：")}{formatReviewDate(item.lastReviewAt)}</span>
                            </div>
                            <div class="actions">
                                <div class="review-rating-actions">
                                    <button type="button" class="review-rating-forgot" disabled={isMutating} on:click={() => updateItem(item, "forgot")}>{tx("reviewRatingForgot", "忘记")} · {formatIntervalLabel(preview.forgot)}</button>
                                    <button type="button" class="review-rating-fuzzy" disabled={isMutating} on:click={() => updateItem(item, "fuzzy")}>{tx("reviewRatingFuzzy", "模糊")} · {formatIntervalLabel(preview.fuzzy)}</button>
                                    <button type="button" class="review-rating-remembered" disabled={isMutating} on:click={() => updateItem(item, "remembered")}>{tx("reviewRemember", "记住")} · {formatIntervalLabel(preview.remembered)}</button>
                                </div>
                                <div class="review-secondary-actions">
                                    <button type="button" disabled={isMutating || openingItemId === item.id} on:click={() => void openItem(item)}>{tx("uiOpenOriginalNote", "打开原笔记")}</button>
                                    <button type="button" disabled={isMutating} on:click={() => updateItem(item, "remove")}>{tx("reviewRemoveFromQueue", "移出复习")}</button>
                                </div>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    {:else}
        <div id="review-panel-queue" class="review-view queue-view" role="tabpanel" aria-labelledby="review-tab-queue" tabindex="0">
            <div class="queue-summary">
                <span>{tx("reviewQueueSummary", "复习队列共 {count} 条，今日到期 {due} 条", { count: activeQueueItems.length, due: dueItems.length })}</span>
                {#if dueItems.length > 0}
                    <button type="button" on:click={() => selectView("today")}>{tx("reviewStart", "开始复习")}</button>
                {/if}
            </div>

            {#if activeQueueItems.length === 0}
                <div class="empty queue-empty">
                    <strong>{tx("reviewQueueEmpty", "复习队列为空")}</strong>
                    <p>{tx("reviewQueueEmptyDesc", "可在阅读待办中心将重要的划线、想法等内容加入复习。")}</p>
                </div>
            {:else}
                <div class="queue-list">
                    {#each activeQueueItems as item (item.id)}
                        <article class="queue-card">
                            <div class="queue-card-heading">
                                <div class="title">{item.title}</div>
                                <span class="queue-status" class:queue-status-due={isDue(item)}>{queueScheduleLabel(item)}</span>
                            </div>
                            {#if item.sectionLabel}
                                <div class="section-label">{item.sectionLabel}</div>
                            {/if}
                            <p class="queue-content">{queueContent(item)}</p>
                            <div class="meta">
                                <span>{tx("reviewTimes", "复习 {count} 次", { count: item.reviewCount })}</span>
                            </div>
                            <div class="queue-actions">
                                <button type="button" disabled={isMutating || openingItemId === item.id} on:click={() => void openItem(item)}>{tx("uiOpenOriginalNote", "打开原笔记")}</button>
                                <button type="button" disabled={isMutating} on:click={() => updateItem(item, "remove")}>{tx("reviewRemoveFromQueue", "移出复习")}</button>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .reading-page { max-width: 960px; margin: 0 auto; padding: clamp(16px, 2vw, 28px); }
    .reading-page-embedded { max-width: none; margin: 0; padding: 0; }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .page-heading { min-width: 0; }
    h2, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { line-height: 1.55; font-size: 13px; }
    button { border: 1px solid var(--b3-border-color, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
    button:disabled { cursor: default; opacity: 0.55; }
    .review-tabs { display: flex; flex: 0 0 auto; flex-wrap: nowrap; gap: 2px; width: fit-content; max-width: 100%; margin-bottom: 14px; padding: 3px; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; background: color-mix(in srgb, var(--b3-theme-surface, #fff) 82%, var(--b3-theme-background, #f5f5f5)); scrollbar-width: thin; }
    .review-tabs button { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; min-height: 32px; padding: 6px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--b3-theme-on-surface, #555); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; line-height: 1.25; white-space: nowrap; }
    .review-tabs button:hover { background: var(--b3-theme-background, #f5f5f5); }
    .review-tabs button.active { border-color: color-mix(in srgb, var(--b3-theme-primary, #4285f4) 32%, var(--b3-border-color, #e0e0e0)); background: color-mix(in srgb, var(--b3-theme-primary, #4285f4) 10%, var(--b3-theme-surface, #fff)); color: var(--b3-theme-primary, #4285f4); }
    .review-tabs button:focus-visible { outline: 2px solid var(--b3-theme-primary, #4285f4); outline-offset: 1px; }
    .review-view { min-width: 0; }
    .state, .future, .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; }
    .state, .future, .empty { padding: 16px; }
    .loading { color: var(--b3-theme-on-surface-light, #666); text-align: center; }
    .load-error { display: grid; gap: 8px; border-color: var(--b3-theme-error, #d33); }
    .load-error strong { color: var(--b3-theme-error, #d33); }
    .load-error small { overflow-wrap: anywhere; }
    .load-error button { width: fit-content; }
    .future { margin-bottom: 10px; color: var(--b3-theme-primary, #4285f4); font-size: 13px; }
    .empty { padding: 40px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
    .empty-action { margin-top: 12px; color: var(--b3-theme-primary, #4285f4); }
    .review-list { display: flex; flex-direction: column; gap: 10px; }
    article { padding: 14px; }
    .title { font-weight: 700; margin-bottom: 8px; }
    .section-label { margin: -2px 0 10px; color: var(--b3-theme-on-surface-light, #777); font-size: 12px; }
    .review-quote { margin: 0; border-left: 3px solid var(--b3-theme-primary, #4285f4); padding-left: 10px; color: var(--b3-theme-on-surface-light, #777); font-size: 12px; }
    .review-thought { margin-top: 10px; color: var(--b3-theme-on-background, #222); font-weight: 500; }
    .review-content, .review-content-empty { margin: 0; }
    .review-content-empty { color: var(--b3-theme-on-surface-light, #777); }
    .meta { display: flex; gap: 12px; margin-top: 10px; color: var(--b3-theme-on-surface-light, #777); font-size: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .review-rating-actions, .review-secondary-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .review-secondary-actions { width: 100%; }
    .review-rating-forgot { border-color: var(--b3-theme-warning, var(--b3-border-color, #e0e0e0)); color: var(--b3-theme-warning, var(--b3-theme-on-surface-light, #777)); }
    .review-rating-remembered { border-color: var(--b3-theme-primary, #4285f4); background: var(--b3-theme-primary, #4285f4); color: var(--b3-theme-on-primary, #fff); }
    .queue-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 10px 12px; border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; background: var(--b3-theme-surface, #fff); color: var(--b3-theme-on-surface-light, #666); font-size: 13px; }
    .queue-list { display: flex; flex-direction: column; gap: 10px; }
    .queue-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .queue-card-heading .title { min-width: 0; flex: 1 1 240px; }
    .queue-status { flex: 0 0 auto; padding: 3px 7px; border-radius: 999px; background: color-mix(in srgb, var(--b3-theme-on-surface-light, #777) 10%, var(--b3-theme-surface, #fff)); color: var(--b3-theme-on-surface-light, #777); font-size: 12px; white-space: nowrap; }
    .queue-status-due { background: color-mix(in srgb, var(--b3-theme-primary, #4285f4) 12%, var(--b3-theme-surface, #fff)); color: var(--b3-theme-primary, #4285f4); }
    .queue-content { display: -webkit-box; margin: 0; overflow: hidden; color: var(--b3-theme-on-background, #222); overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
    .queue-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .queue-empty strong { display: block; margin-bottom: 8px; color: var(--b3-theme-on-background, #222); }
    @media (prefers-reduced-motion: reduce) {
        .review-tabs button { transition: none; }
    }
    @media (max-width: 600px) {
        .queue-summary { align-items: flex-start; flex-direction: column; }
        .queue-actions { flex-direction: column; align-items: stretch; }
        .queue-actions button { width: 100%; }
    }
</style>

