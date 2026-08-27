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

    const dispatch = createEventDispatcher();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    let reviewItems: ReadingReviewItem[] = [];
    let dueItems: ReadingReviewItem[] = [];
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
            reviewItems = (await loadReadingReviewItemsStrict(plugin))
                .slice()
                .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
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

    $: dueItems = reviewItems.filter((item) => item.status === "active" && item.nextReviewAt <= Date.now());
    $: futureCount = Math.max(0, reviewItems.filter((item) => item.status === "active").length - dueItems.length);
    $: dueSourceCount = new Set(dueItems.map((item) => item.sourceKey)).size;
</script>

<div class="reading-page">
    <div class="page-header">
        <button type="button" class="back-btn" on:click={() => dispatch("back")}>{tx("uiBackOverview", "返回总览")}</button>
        <div>
            <h2>{tx("reviewTodayTitle", "今日复习")}</h2>
            <p>
                {#if isLoading}
                    {tx("uiLoading", "加载中...")}
                {:else if loadError}
                    {tx("reviewLoadFailed", "复习队列读取失败")}
                {:else}
                    {tx("reviewTodaySummary", "{count} 条待复习，来自 {sources} 个来源", { count: dueItems.length, sources: dueSourceCount })}
                {/if}
            </p>
        </div>
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
    {:else}
        {#if futureCount > 0}
            <div class="future" role="status">{tx("reviewQueueFuture", "复习队列中还有 {count} 条未到期内容", { count: futureCount })}</div>
        {/if}

        {#if dueItems.length === 0}
            <div class="empty">{tx("reviewTodayEmpty", "今天没有到期复习内容")}</div>
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
    {/if}
</div>

<style>
    .reading-page { max-width: 960px; margin: 0 auto; padding: clamp(16px, 2vw, 28px); }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    h2, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { line-height: 1.55; font-size: 13px; }
    button { border: 1px solid var(--b3-border-color, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
    button:disabled { cursor: default; opacity: 0.55; }
    .state, .future, .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; }
    .state, .future, .empty { padding: 16px; }
    .loading { color: var(--b3-theme-on-surface-light, #666); text-align: center; }
    .load-error { display: grid; gap: 8px; border-color: var(--b3-theme-error, #d33); }
    .load-error strong { color: var(--b3-theme-error, #d33); }
    .load-error small { overflow-wrap: anywhere; }
    .load-error button { width: fit-content; }
    .future { margin-bottom: 10px; color: var(--b3-theme-primary, #4285f4); font-size: 13px; }
    .empty { padding: 40px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
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
</style>

