<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { CacheStatusView, DiagnosticSummary } from "../../utils/readingManagement/types";
    import {
        buildCacheStatus,
        buildDiagnosticSummary,
        cleanupProcessedInboxItems,
        keepRecentSyncReports,
    } from "../../utils/readingManagement/maintenanceActions";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ back: void }>();

    let status: CacheStatusView | null = null;
    let isLoading = true;

    onMount(loadStatus);

    async function loadStatus() {
        isLoading = true;
        try {
            status = await buildCacheStatus(plugin);
        } finally {
            isLoading = false;
        }
    }

    async function copyDiagnostics() {
        const summary: DiagnosticSummary = await buildDiagnosticSummary(plugin);
        try {
            await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
            showMessage("已复制诊断摘要");
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }

    async function cleanupInbox() {
        if (!window.confirm("只会清理已处理的新增笔记，未处理和稍后处理不会删除。继续吗？")) return;
        const result = await cleanupProcessedInboxItems(plugin);
        await loadStatus();
        showMessage(`已清理 ${result.removed} 条，剩余 ${result.remaining} 条`);
    }

    async function trimReports() {
        if (!window.confirm("只保留最近 20 条同步报告，较旧报告会从缓存中移除。继续吗？")) return;
        const result = await keepRecentSyncReports(plugin, 20);
        await loadStatus();
        showMessage(`已清理 ${result.removed} 条报告，剩余 ${result.remaining} 条`);
    }

    function formatTime(ts?: number): string {
        return ts ? new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    }
</script>

<div class="reading-management-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>数据维护工具</h2>
            <p>用于查看缓存状态、导出诊断摘要和执行低风险清理</p>
        </div>
    </div>

    {#if isLoading || !status}
        <div class="empty">加载中...</div>
    {:else}
        <div class="status-grid">
            <div><strong>{status.temporaryWereadNotebookCount}</strong><span>有笔记书籍缓存</span></div>
            <div><strong>{status.wereadNotebookRecordCount}</strong><span>已同步记录</span></div>
            <div><strong>{status.readingInboxItemCount}</strong><span>收件箱条目</span></div>
            <div><strong>{status.readingBookStatusCount}</strong><span>书籍状态</span></div>
            <div><strong>{status.wereadSyncReportCount}</strong><span>同步报告</span></div>
            <div><strong>{status.blockIndexSourceCount}</strong><span>块索引来源</span></div>
            <div><strong>{formatTime(status.latestSyncTime)}</strong><span>最近同步</span></div>
            <div><strong>{status.apiKeyEncrypted ? "是" : "否"}</strong><span>API Key 加密存储</span></div>
        </div>

        {#if status.apiKeyPlainResidual}
            <div class="notice">检测到旧版明文字段残留。这里不会导出明文，授权设置读取时会按现有逻辑迁移。</div>
        {/if}

        <div class="tool-list">
            <article>
                <h3>导出诊断摘要</h3>
                <p>复制版本、缓存数量、同步报告摘要和最近问题，不包含 API Key 明文或完整笔记正文。</p>
                <button on:click={copyDiagnostics}>复制诊断摘要</button>
            </article>
            <article>
                <h3>清理已处理收件箱</h3>
                <p>只删除状态为已处理的新增笔记，未处理、稍后和已忽略条目会保留。</p>
                <button on:click={cleanupInbox}>清理已处理新增笔记</button>
            </article>
            <article>
                <h3>清理同步报告</h3>
                <p>仅保留最近 20 条同步报告，减少旧诊断缓存。</p>
                <button on:click={trimReports}>仅保留最近 20 条同步报告</button>
            </article>
            <article>
                <h3>重建块级索引</h3>
                <p>入口已预留。后续只会通过现有强制同步入口执行，不直接改 incremental 数据。</p>
                <button on:click={() => showMessage("请通过重新同步该书来重建块级索引。")}>查看说明</button>
            </article>
        </div>
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

    h3 {
        font-size: 14px;
        margin-bottom: 6px;
    }

    .page-header p,
    .tool-list p,
    .status-grid span,
    .notice {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .back-btn,
    .tool-list button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px;
        margin-bottom: 14px;
    }

    .status-grid div,
    .tool-list article,
    .empty,
    .notice {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
    }

    .status-grid div {
        display: grid;
        gap: 4px;
        padding: 12px;
    }

    .status-grid strong {
        font-size: 18px;
        overflow-wrap: anywhere;
    }

    .notice {
        padding: 12px;
        margin-bottom: 14px;
        color: var(--b3-card-warning-color, #FF9800);
    }

    .tool-list {
        display: grid;
        gap: 10px;
    }

    .tool-list article {
        display: grid;
        gap: 8px;
        padding: 14px;
    }

    .tool-list button {
        width: fit-content;
    }

    .empty {
        padding: 48px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #666);
    }
</style>
