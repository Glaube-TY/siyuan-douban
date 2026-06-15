<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import { getReadingBookStatuses, getReadingInboxItems } from "../../utils/storage/readingStorage";
    import { safeLoadReadingStatsCache } from "../../utils/readingCenter/readingCenterData";
    import { formatReadingDuration } from "../../utils/weread/api/formatWereadReadingStats";

    export let plugin: any;

    const dispatch = createEventDispatcher();

    let mode: "week" | "month" = "week";
    let markdown = "";

    onMount(generate);
    $: if (mode) generate();

    async function generate() {
        const stats = await safeLoadReadingStatsCache(plugin);
        const inbox = await getReadingInboxItems(plugin);
        const statuses = await getReadingBookStatuses(plugin);
        const now = Date.now();
        const rangeMs = mode === "week" ? 7 * 24 * 60 * 60 * 1000 : 31 * 24 * 60 * 60 * 1000;
        const recentInbox = inbox.filter((item) => now - item.createdAt <= rangeMs);
        const reviewedCount = statuses.filter((item) => item.status === "reviewed").length;
        const pendingCount = statuses.filter((item) => item.status === "to_review" || item.hasNewNotes).length;
        const periodStats = mode === "week" ? stats?.weekly : stats?.monthly;
        const title = mode === "week" ? "阅读周报" : "阅读月报";
        markdown = [
            `# ${title}`,
            "",
            `- 阅读时长：${periodStats ? formatReadingDuration(periodStats.totalReadTime || 0) : "暂无"}`,
            `- 阅读天数：${periodStats?.readDays ?? "暂无"}`,
            `- 新增划线/想法：${recentInbox.length}`,
            `- 普通书新增：${recentInbox.filter((item) => item.sourceType === "weread-book").length}`,
            `- 公众号新增：${recentInbox.filter((item) => item.sourceType === "weread-mp").length}`,
            `- 待整理书籍：${pendingCount}`,
            `- 已整理书籍：${reviewedCount}`,
            "",
            "## 新增内容",
            recentInbox.length === 0 ? "暂无新增内容" : recentInbox.slice(0, 20).map((item) => `- ${item.title}：${item.content || item.reviewContent || ""}`).join("\n"),
        ].join("\n");
    }

    async function copyMarkdown() {
        try {
            await navigator.clipboard.writeText(markdown);
            showMessage("已复制 Markdown");
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>阅读周报 / 月报</h2>
            <p>基于阅读统计和本地缓存生成非 AI 统计报告</p>
        </div>
    </div>

    <div class="subpage-toolbar">
        <div class="subpage-toolbar-group">
            <button class:active={mode === "week"} on:click={() => (mode = "week")}>周报</button>
            <button class:active={mode === "month"} on:click={() => (mode = "month")}>月报</button>
            <button on:click={copyMarkdown}>复制 Markdown</button>
        </div>
    </div>

    <pre>{markdown}</pre>
</div>

<style>
    .reading-page { max-width: 960px; margin: 0 auto; padding: clamp(16px, 2vw, 28px); }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    h2, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { color: var(--b3-theme-on-surface-light, #666); font-size: 13px; }
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
    .subpage-toolbar-group button {
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border-radius: 999px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
    }
    .subpage-toolbar-group button.active {
        color: #fff;
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }
    pre { white-space: pre-wrap; line-height: 1.6; background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; padding: 16px; font-size: 13px; }
</style>

