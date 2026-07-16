<script lang="ts">
    import { createEventDispatcher, onMount, tick } from "svelte";
    import { showMessage } from "siyuan";
    import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
    import type { WorkbenchAction } from "../../types/workbench";
    import {
        buildSyncOutcomeData,
    } from "../../utils/readingManagement/managementData";
    import type {
        DiagnosticSummary,
        RecentNoteView,
        SyncOutcomeData,
        SyncOutcomeIssue,
        SyncOutcomeNewContentGroup,
        SyncOutcomeRecord,
    } from "../../utils/readingManagement/types";
    import { openLocatedBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import {
        markSourceInboxItemsProcessed,
        updateReadingInboxItemStatus,
        updateReadingInboxItemsStatus,
    } from "../../utils/storage/readingStorage";
    import {
        buildDiagnosticSummary,
        cleanupProcessedInboxItems,
        keepRecentSyncReports,
    } from "../../utils/readingManagement/maintenanceActions";

    export let plugin: any;
    export let initialView: "todo" | "records" = "todo";
    export let focus: "new" | "issues" | "diagnostics" | "changes" = "new";

    const dispatch = createEventDispatcher<{
        back: void;
        action: WorkbenchAction;
        addToTopic: { item: ReadingInboxItem };
    }>();

    let data: SyncOutcomeData | null = null;
    let diagnostics: DiagnosticSummary | null = null;
    let isLoading = true;
    let activeView: "todo" | "records" = initialView;
    let recordsFilter: "changed" | "problem" = focus === "issues" || focus === "diagnostics" ? "problem" : "changed";
    let diagnosticsOpen = focus === "diagnostics";
    let expandedGroups = new Set<string>();
    let selectedIds = new Set<string>();
    let resultCenterEl: HTMLElement | null = null;
    let issueSectionEl: HTMLElement | null = null;

    onMount(async () => {
        await load();
        if (initialView === "todo" && focus === "issues") {
            await tick();
            issueSectionEl?.scrollIntoView({ block: "start" });
        }
    });

    async function load() {
        isLoading = true;
        try {
            [data, diagnostics] = await Promise.all([
                buildSyncOutcomeData(plugin),
                buildDiagnosticSummary(plugin),
            ]);
            selectedIds = new Set();
        } catch (error) {
            console.error("[SyncResultCenter] load failed:", error);
            data = null;
            diagnostics = null;
            showMessage("同步结果与待办加载失败，请稍后重试");
        } finally {
            isLoading = false;
        }
    }

    async function switchView(view: "todo" | "records") {
        activeView = view;
        await tick();
        resultCenterEl?.scrollIntoView({ block: "start" });
    }

    function toggleGroup(sourceKey: string) {
        const next = new Set(expandedGroups);
        if (next.has(sourceKey)) next.delete(sourceKey);
        else next.add(sourceKey);
        expandedGroups = next;
    }

    function toggleSelected(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectedIds = next;
    }

    function openGroupDoc(group: SyncOutcomeNewContentGroup) {
        if (!group.noteDocId || !openSiyuanDoc(plugin, group.noteDocId)) {
            showMessage("该来源暂无有效的读书笔记文档");
        }
    }

    function openContent(item: RecentNoteView) {
        if (item.locatedBlock && openLocatedBlock(plugin, item.locatedBlock)) return;
        if (item.noteDocId && openSiyuanDoc(plugin, item.noteDocId)) return;
        showMessage("这条内容尚未定位到有效的笔记文档");
    }

    async function setItemStatus(item: RecentNoteView, status: ReadingInboxStatus) {
        await updateReadingInboxItemStatus(plugin, item.id, status);
        await load();
        showMessage(status === "processed" ? "已标记为已处理" : "已设为稍后处理");
    }

    async function markGroupProcessed(group: SyncOutcomeNewContentGroup) {
        await markSourceInboxItemsProcessed(plugin, group.sourceKey);
        await load();
        showMessage(`《${group.title}》的新增内容已全部处理`);
    }

    async function batchSetStatus(status: "processed" | "later") {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        await updateReadingInboxItemsStatus(plugin, ids, status);
        await load();
        showMessage(`已处理 ${ids.length} 条内容`);
    }

    async function copyText(text: string, message: string) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(message);
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }

    function buildQuote(item: RecentNoteView): string {
        const section = item.sectionLabel ? ` - ${item.sectionLabel}` : "";
        return `《${item.title}》${section}\n${item.comment || item.content || item.summary}`;
    }

    function buildMarkdown(item: RecentNoteView): string {
        return [
            `### ${item.title}`,
            item.sectionLabel ? `> ${item.sectionLabel}` : "",
            item.content ? `> ${item.content}` : "",
            item.comment ? `想法：${item.comment}` : "",
        ].filter(Boolean).join("\n\n");
    }

    function addToTopic(item: RecentNoteView) {
        dispatch("addToTopic", { item: item.rawItem });
    }

    async function handleIssue(issue: SyncOutcomeIssue) {
        if (issue.action === "open_records") {
            recordsFilter = "problem";
            await switchView("records");
            return;
        }
        if (issue.action === "open_diagnostics") {
            recordsFilter = "problem";
            diagnosticsOpen = true;
            await switchView("records");
            return;
        }
        dispatch("action", "open-local-shelf");
    }

    function openRecordDoc(record: SyncOutcomeRecord) {
        if (!record.noteDocId || !openSiyuanDoc(plugin, record.noteDocId)) {
            showMessage("该记录没有有效的笔记文档");
        }
    }

    async function copyDiagnostics() {
        if (!diagnostics) return;
        await copyText(JSON.stringify(diagnostics, null, 2), "已复制诊断摘要");
    }

    async function cleanProcessed() {
        const result = await cleanupProcessedInboxItems(plugin);
        await load();
        showMessage(`已清理 ${result.removed} 条已处理记录`);
    }

    async function cleanReports() {
        const result = await keepRecentSyncReports(plugin, 10);
        await load();
        showMessage(`已清理 ${result.removed} 条旧同步报告`);
    }

    function formatTime(timestamp?: number): string {
        if (!timestamp) return "--";
        return new Date(timestamp).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    $: visibleRecords = (data?.records || []).filter((record) =>
        recordsFilter === "changed" ? record.hasChanges : record.hasProblem
    );
    $: issueGroups = Array.from(
        (data?.issues || []).reduce((map, issue) => {
            const current = map.get(issue.sourceKey) || [];
            current.push(issue);
            map.set(issue.sourceKey, current);
            return map;
        }, new Map<string, SyncOutcomeIssue[]>()).entries()
    );
</script>

<div class="result-center" bind:this={resultCenterEl}>
    <header class="page-header">
        <button type="button" class="back-button" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>同步结果与待办</h2>
            <p>查看新增内容、需要处理的问题和最近同步记录</p>
        </div>
    </header>

    <nav class="main-tabs" aria-label="同步结果视图">
        <button type="button" class:active={activeView === "todo"} on:click={() => switchView("todo")}>
            待处理
            {#if data}<span>{data.summary.pendingContentCount + data.summary.actionableIssueCount}</span>{/if}
        </button>
        <button type="button" class:active={activeView === "records"} on:click={() => switchView("records")}>同步记录</button>
    </nav>

    {#if isLoading}
        <div class="empty-state">正在汇总同步结果...</div>
    {:else if !data}
        <div class="empty-state">同步结果加载失败</div>
    {:else if activeView === "todo"}
        <div class="todo-view">
            <section class="content-section">
                <div class="section-heading">
                    <div><h3>新增内容</h3><p>按书籍或公众号分组，时间表示同步发现时间</p></div>
                    <strong>{data.summary.pendingContentCount}</strong>
                </div>

                {#if selectedIds.size > 0}
                    <div class="batch-bar">
                        <span>已选 {selectedIds.size} 条</span>
                        <button type="button" on:click={() => batchSetStatus("processed")}>标记已处理</button>
                        <button type="button" on:click={() => batchSetStatus("later")}>稍后处理</button>
                    </div>
                {/if}

                {#if data.newContentGroups.length === 0}
                    <div class="compact-empty">没有待处理的新增内容</div>
                {:else}
                    <div class="content-groups">
                        {#each data.newContentGroups as group (group.sourceKey)}
                            <article class="content-group">
                                <div class="group-heading">
                                    <div class="group-title">
                                        <span>{group.sourceType === "mp" ? "公众号" : "普通书"}</span>
                                        <h4>{group.title}</h4>
                                        <p>
                                            共 {group.totalCount} 条
                                            {#if group.bookmarkCount > 0} · 划线 {group.bookmarkCount}{/if}
                                            {#if group.reviewCount > 0} · 评论 {group.reviewCount}{/if}
                                            {#if group.mpArticleCount > 0} · 公众号 {group.mpArticleCount}{/if}
                                            · 最近发现 {group.latestDiscoveredAtText || "--"}
                                        </p>
                                    </div>
                                    <div class="group-actions">
                                        <button type="button" disabled={!group.noteDocId} on:click={() => openGroupDoc(group)}>打开笔记</button>
                                        <button type="button" on:click={() => toggleGroup(group.sourceKey)}>{expandedGroups.has(group.sourceKey) ? "收起内容" : "查看新增内容"}</button>
                                        <button type="button" on:click={() => markGroupProcessed(group)}>全部标记已处理</button>
                                    </div>
                                </div>

                                {#if expandedGroups.has(group.sourceKey)}
                                    <div class="content-items">
                                        {#each group.items as item (item.id)}
                                            <article class="content-item">
                                                <label class="item-select">
                                                    <input type="checkbox" checked={selectedIds.has(item.id)} on:change={() => toggleSelected(item.id)} />
                                                    <span>选择</span>
                                                </label>
                                                <button type="button" class="content-open" on:click={() => openContent(item)}>
                                                    <span>{item.typeLabel} · 发现时间 {item.discoveredAtText || "--"}</span>
                                                    <strong>{item.sectionLabel || "未命名章节"}</strong>
                                                    <p>{item.comment || item.content || "暂无内容"}</p>
                                                </button>
                                                <div class="item-actions">
                                                    <button type="button" on:click={() => setItemStatus(item, "processed")}>标记已处理</button>
                                                    <details class="more-menu">
                                                        <summary>更多</summary>
                                                        <div>
                                                            <button type="button" on:click={() => setItemStatus(item, "later")}>稍后处理</button>
                                                            <button type="button" on:click={() => copyText(buildQuote(item), "已复制引用")}>复制引用</button>
                                                            <button type="button" on:click={() => copyText(buildMarkdown(item), "已复制 Markdown")}>复制 Markdown</button>
                                                            <button type="button" on:click={() => addToTopic(item)}>加入主题</button>
                                                        </div>
                                                    </details>
                                                </div>
                                            </article>
                                        {/each}
                                    </div>
                                {/if}
                            </article>
                        {/each}
                    </div>
                {/if}
            </section>

            <section class="issue-section" bind:this={issueSectionEl}>
                <div class="section-heading">
                    <div><h3>需要处理的问题</h3><p>这里只显示会影响同步或文档打开的问题</p></div>
                    <strong>{data.issues.length}</strong>
                </div>
                {#if issueGroups.length === 0}
                    <div class="compact-empty success">当前没有需要处理的问题</div>
                {:else}
                    <div class="issue-groups">
                        {#each issueGroups as [sourceKey, issues] (sourceKey)}
                            <article class="issue-group">
                                <h4>{issues[0].title}</h4>
                                {#each issues as issue (issue.id)}
                                    <div class="issue-row">
                                        <p>{issue.reason}</p>
                                        <button type="button" on:click={() => handleIssue(issue)}>{issue.actionLabel}</button>
                                    </div>
                                {/each}
                            </article>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    {:else}
        <div class="records-view">
            {#if data.latestReport}
                <section class="report-summary">
                    <div><span>最近同步</span><strong>{formatTime(data.latestReport.endedAt || data.latestReport.startedAt)}</strong></div>
                    <div><span>状态</span><strong>{data.latestReport.statusLabel}</strong></div>
                    <div><span>成功 / 失败 / 跳过</span><strong>{data.latestReport.successCount} / {data.latestReport.failedCount} / {data.latestReport.skippedCount}</strong></div>
                    <div><span>新增 / 更新 / 删除</span><strong>{data.latestReport.addedItemCount} / {data.latestReport.changedItemCount} / {data.latestReport.deletedItemCount}</strong></div>
                </section>
            {:else}
                <div class="compact-empty">尚无同步记录</div>
            {/if}

            <div class="record-filters">
                <button type="button" class:active={recordsFilter === "changed"} on:click={() => recordsFilter = "changed"}>有变化</button>
                <button type="button" class:active={recordsFilter === "problem"} on:click={() => recordsFilter = "problem"}>有问题</button>
            </div>

            {#if visibleRecords.length === 0}
                <div class="compact-empty">当前筛选下没有记录</div>
            {:else}
                <div class="record-list">
                    {#each visibleRecords as record (`${record.reportId}:${record.sourceKey}:${record.status}`)}
                        <article class="record-card">
                            <div class="record-heading">
                                <div><h4>{record.title}</h4><p>{record.sourceType === "mp" ? "公众号" : "普通书"} · {record.statusLabel}</p></div>
                                <span class:problem={record.hasProblem}>{record.hasProblem ? "需要处理" : "有变化"}</span>
                            </div>
                            <div class="record-counts">
                                <span>新增 {record.addedItemCount}</span>
                                <span>更新 {record.changedItemCount}</span>
                                <span>删除 {record.deletedItemCount}</span>
                            </div>
                            {#if record.message}<p class="record-message">{record.message}</p>{/if}
                            {#if record.suggestion}<p class="record-suggestion">建议：{record.suggestion}</p>{/if}
                            {#if record.noteDocId}<button type="button" class="open-record" on:click={() => openRecordDoc(record)}>打开笔记</button>{/if}
                        </article>
                    {/each}
                </div>
            {/if}

            <details class="diagnostics" bind:open={diagnosticsOpen}>
                <summary>诊断信息与数据维护</summary>
                {#if diagnostics}
                    <div class="diagnostic-grid">
                        <span>收件箱记录 {diagnostics.cacheStatus.readingInboxItemCount}</span>
                        <span>书籍状态 {diagnostics.cacheStatus.readingBookStatusCount}</span>
                        <span>同步报告 {diagnostics.cacheStatus.wereadSyncReportCount}</span>
                        <span>块索引来源 {diagnostics.cacheStatus.blockIndexSourceCount}</span>
                        {#if data.latestReport}
                            <span>未变化单元 {data.latestReport.unchangedItemCount}</span>
                            <span>块操作 {data.latestReport.blockOperationCount}</span>
                            <span>重建索引 {data.latestReport.rebuiltCount}</span>
                        {/if}
                    </div>
                    {#if (diagnostics.latestReport?.warnings.length || 0) + (diagnostics.latestReport?.errors.length || 0) > 0}
                        <details class="raw-diagnostics">
                            <summary>
                                原始警告与错误（{(diagnostics.latestReport?.warnings.length || 0) + (diagnostics.latestReport?.errors.length || 0)}）
                            </summary>
                            <ul>
                                {#each diagnostics.latestReport?.warnings || [] as warning}
                                    <li>{warning}</li>
                                {/each}
                                {#each diagnostics.latestReport?.errors || [] as error}
                                    <li>{error}</li>
                                {/each}
                            </ul>
                        </details>
                    {/if}
                {/if}
                <div class="diagnostic-actions">
                    <button type="button" on:click={copyDiagnostics}>复制诊断摘要</button>
                    <button type="button" on:click={cleanProcessed}>清理已处理记录</button>
                    <button type="button" on:click={cleanReports}>清理旧同步报告</button>
                </div>
            </details>
        </div>
    {/if}
</div>

<style>
    .result-center {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
        padding: clamp(14px, 2vw, 24px);
        box-sizing: border-box;
        color: var(--b3-theme-on-background);
        overflow-wrap: anywhere;
    }

    .page-header,
    .section-heading,
    .group-heading,
    .record-heading,
    .issue-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .page-header {
        justify-content: flex-start;
        margin-bottom: 14px;
    }

    h2,
    h3,
    h4,
    p {
        margin: 0;
    }

    h2 { font-size: 20px; }
    h3 { font-size: 16px; }
    h4 { font-size: 14px; }

    .page-header p,
    .section-heading p,
    .group-title p,
    .record-heading p,
    .record-message,
    .record-suggestion {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    button,
    summary {
        font: inherit;
    }

    button {
        min-height: 34px;
        padding: 0 11px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
    }

    button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .back-button {
        flex: 0 0 auto;
    }

    .main-tabs,
    .record-filters {
        display: flex;
        gap: 6px;
        margin-bottom: 14px;
        padding: 5px;
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-surface);
    }

    .main-tabs button,
    .record-filters button {
        border-color: transparent;
        background: transparent;
    }

    .main-tabs button.active,
    .record-filters button.active {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary-light);
        color: var(--b3-theme-on-background);
    }

    .main-tabs span {
        margin-left: 6px;
        color: var(--b3-theme-primary);
    }

    .todo-view,
    .records-view,
    .content-section,
    .issue-section,
    .content-groups,
    .issue-groups,
    .record-list,
    .content-items {
        display: grid;
        gap: 12px;
    }

    .issue-section {
        margin-top: 18px;
    }

    .section-heading {
        align-items: flex-start;
    }

    .section-heading strong {
        min-width: 32px;
        text-align: right;
        color: var(--b3-theme-primary);
        font-size: 18px;
    }

    .content-group,
    .issue-group,
    .record-card,
    .diagnostics,
    .compact-empty,
    .empty-state {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
    }

    .content-group,
    .issue-group,
    .record-card {
        padding: 14px;
    }

    .group-heading {
        align-items: flex-start;
    }

    .group-title {
        min-width: 0;
    }

    .group-title > span {
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 700;
    }

    .group-title h4 {
        margin: 3px 0;
    }

    .group-actions,
    .item-actions,
    .diagnostic-actions,
    .batch-bar,
    .record-counts {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
    }

    .group-actions {
        justify-content: flex-end;
    }

    .content-items {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--b3-border-color);
    }

    .content-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
        padding: 10px;
        border-radius: 8px;
        background: var(--b3-theme-background);
    }

    .item-select {
        display: grid;
        justify-items: center;
        gap: 2px;
        color: var(--b3-theme-on-surface-light);
        font-size: 10px;
    }

    .content-open {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        text-align: left;
    }

    .content-open span {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
    }

    .content-open p {
        display: -webkit-box;
        overflow: hidden;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }

    .more-menu {
        position: relative;
    }

    .more-menu summary {
        display: grid;
        place-items: center;
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        cursor: pointer;
        list-style: none;
        font-size: 12px;
    }

    .more-menu summary::-webkit-details-marker { display: none; }

    .more-menu div {
        position: absolute;
        z-index: 5;
        top: calc(100% + 4px);
        right: 0;
        display: grid;
        width: 150px;
        gap: 4px;
        padding: 6px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        box-shadow: 0 6px 20px var(--b3-mask-background);
    }

    .batch-bar {
        align-items: center;
        padding: 8px;
        border-radius: 8px;
        background: var(--b3-theme-primary-light);
        font-size: 12px;
    }

    .issue-group h4 {
        margin-bottom: 8px;
    }

    .issue-row {
        padding: 8px 0;
        border-top: 1px solid var(--b3-border-color);
    }

    .issue-row p {
        color: var(--b3-card-warning-color);
        font-size: 12px;
    }

    .report-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
    }

    .report-summary div {
        display: grid;
        gap: 4px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .report-summary span,
    .diagnostic-grid {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
    }

    .record-heading > span {
        padding: 3px 7px;
        border-radius: 999px;
        background: var(--b3-card-success-background);
        color: var(--b3-theme-on-background);
        font-size: 11px;
    }

    .record-heading > span.problem {
        background: var(--b3-card-error-background);
    }

    .record-counts span {
        padding: 3px 7px;
        border-radius: 999px;
        background: var(--b3-theme-background);
        font-size: 11px;
    }

    .open-record {
        width: fit-content;
    }

    .diagnostics {
        padding: 12px;
    }

    .diagnostics summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
    }

    .raw-diagnostics {
        margin: 0 0 12px;
        padding: 8px;
        border-radius: 7px;
        background: var(--b3-theme-background);
    }

    .raw-diagnostics summary {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-weight: 400;
    }

    .raw-diagnostics ul {
        margin: 8px 0 0;
        padding-left: 20px;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        overflow-wrap: anywhere;
    }

    .diagnostic-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin: 12px 0;
    }

    .diagnostic-grid span {
        padding: 8px;
        border-radius: 7px;
        background: var(--b3-theme-background);
    }

    .compact-empty,
    .empty-state {
        padding: 28px 14px;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
        font-size: 13px;
    }

    .compact-empty.success {
        background: var(--b3-card-success-background);
        color: var(--b3-theme-on-background);
    }

    @media (max-width: 700px) {
        .result-center {
            padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
        }

        .page-header {
            align-items: flex-start;
        }

        .main-tabs button {
            flex: 1;
            min-height: 42px;
        }

        .group-heading,
        .record-heading,
        .issue-row {
            align-items: stretch;
            flex-direction: column;
        }

        .group-actions {
            display: grid;
            grid-template-columns: 1fr;
        }

        .group-actions button,
        .issue-row button,
        .diagnostic-actions button {
            min-height: 42px;
        }

        .content-item {
            grid-template-columns: auto minmax(0, 1fr);
        }

        .item-actions {
            grid-column: 1 / -1;
            justify-content: flex-end;
        }

        .more-menu div {
            position: static;
            width: auto;
            margin-top: 4px;
            box-shadow: none;
        }

        .report-summary,
        .diagnostic-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
