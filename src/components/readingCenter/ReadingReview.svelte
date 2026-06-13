<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { ReadingReviewItem } from "../../types/readingReview";
    import { createReadingId, getReadingInboxItems, getReadingReviewItems, saveReadingReviewItems } from "../../utils/storage/readingStorage";
    import { openDoc } from "../../utils/openDoc";

    export let plugin: any;

    const dispatch = createEventDispatcher();
    const DAY = 24 * 60 * 60 * 1000;

    let reviewItems: ReadingReviewItem[] = [];

    onMount(loadAndGenerate);

    async function loadAndGenerate() {
        const existing = await getReadingReviewItems(plugin);
        const inbox = await getReadingInboxItems(plugin);
        const map = new Map(existing.map((item) => [item.id, item]));
        for (const item of inbox) {
            if (item.status === "ignored") continue;
            const id = createReadingId("review", [item.id]);
            if (!map.has(id)) {
                map.set(id, {
                    id,
                    inboxItemId: item.id,
                    sourceKey: item.sourceKey,
                    content: item.content || item.reviewContent || "",
                    title: item.title,
                    noteDocId: item.noteDocId,
                    nextReviewAt: item.createdAt + DAY,
                    reviewCount: 0,
                    status: "active",
                });
            }
        }
        reviewItems = Array.from(map.values()).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
        await saveReadingReviewItems(plugin, reviewItems);
    }

    async function updateItem(item: ReadingReviewItem, action: "remember" | "later" | "ignore") {
        const now = Date.now();
        if (action === "ignore") {
            item.status = "ignored";
        } else {
            item.status = "active";
            item.lastReviewAt = now;
            item.reviewCount += 1;
            item.nextReviewAt = now + (action === "remember" ? 30 * DAY : 7 * DAY);
        }
        await saveReadingReviewItems(plugin, reviewItems);
        reviewItems = [...reviewItems];
    }

    function openItem(item: ReadingReviewItem) {
        if (!item.noteDocId) {
            showMessage("该复习条目暂无可打开的本地笔记");
            return;
        }
        openDoc(plugin, item.noteDocId, 1);
    }

    function formatDate(ts?: number) {
        return ts ? new Date(ts).toLocaleDateString("zh-CN") : "--";
    }

    $: dueItems = reviewItems.filter((item) => item.status === "active" && item.nextReviewAt <= Date.now());
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>今日复习</h2>
            <p>{dueItems.length} 条待复习，来自 {new Set(dueItems.map((item) => item.sourceKey)).size} 个来源</p>
        </div>
    </div>

    {#if dueItems.length === 0}
        <div class="empty">今天没有到期复习内容</div>
    {:else}
        <div class="review-list">
            {#each dueItems as item (item.id)}
                <article>
                    <div class="title">{item.title}</div>
                    <p>{item.content}</p>
                    <div class="meta">
                        <span>复习 {item.reviewCount} 次</span>
                        <span>上次：{formatDate(item.lastReviewAt)}</span>
                    </div>
                    <div class="actions">
                        <button on:click={() => updateItem(item, "remember")}>记住了</button>
                        <button on:click={() => updateItem(item, "later")}>稍后再看</button>
                        <button on:click={() => openItem(item)}>打开原笔记</button>
                        <button on:click={() => updateItem(item, "ignore")}>忽略</button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<style>
    .reading-page { max-width: 960px; margin: 0 auto; padding: clamp(16px, 2vw, 28px); }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    h2, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { line-height: 1.55; font-size: 13px; }
    button { border: 1px solid var(--b3-theme-border, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
    .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-theme-border, #e0e0e0); border-radius: 8px; }
    .empty { padding: 40px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
    .review-list { display: flex; flex-direction: column; gap: 10px; }
    article { padding: 14px; }
    .title { font-weight: 700; margin-bottom: 8px; }
    .meta { display: flex; gap: 12px; margin-top: 10px; color: var(--b3-theme-on-surface-light, #777); font-size: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>

