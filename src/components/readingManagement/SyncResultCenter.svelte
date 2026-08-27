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
    import type { InboxMutationResult } from "../../utils/readingManagement/inboxActions";
    import {
        markInboxSourceProcessedStrict,
        setInboxItemStatusStrict,
        setInboxItemsStatusStrict,
    } from "../../utils/readingManagement/inboxActions";
    import { addRecentNoteToReview } from "../../utils/readingCenter/readingReviewService";
    import { openLocatedBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import {
        buildDiagnosticSummary,
        cleanupProcessedInboxItems,
        keepRecentSyncReports,
    } from "../../utils/readingManagement/maintenanceActions";
    import { localizeKnownUiText, t } from "../../utils/i18n";
    import ContextTutorialLink from "../common/ContextTutorialLink.svelte";
    import { READING_NOTES_LINKS } from "../../utils/core/externalLinks";

    export let plugin: any;
    export let initialView: "todo" | "issues" | "records" = "todo";
    export let focus: "new" | "issues" | "diagnostics" | "changes" = "new";

    const dispatch = createEventDispatcher<{
        back: void;
        action: WorkbenchAction;
        addToTopic: { item: ReadingInboxItem };
    }>();

    let data: SyncOutcomeData | null = null;
    let diagnostics: DiagnosticSummary | null = null;
    let isLoading = true;
    let loadError = "";
    let isInboxMutating = false;
    let reviewMutatingId: string | null = null;
    let isCleaningReports = false;
    let activeView: "todo" | "issues" | "records" = initialView;
    let recordsFilter: "changed" | "problem" = focus === "issues" || focus === "diagnostics" ? "problem" : "changed";
    let diagnosticsOpen = focus === "diagnostics";
    let expandedGroups = new Set<string>();
    let selectedIds = new Set<string>();
    let resultCenterEl: HTMLElement | null = null;
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    function noteTypeLabel(item: RecentNoteView): string {
        if (item.sourceType === "mp") return tx("uiMpAccount", "公众号");
        return item.itemType === "review" ? tx("syncResultReviews", "评论") : tx("syncResultBookmarks", "划线");
    }

    function reportStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            success: tx("syncStatusSuccess", "成功"),
            partial: tx("syncStatusPartial", "部分成功"),
            partial_success: tx("syncStatusPartial", "部分成功"),
            failed: tx("syncStatusFailed", "失败"),
            running: tx("syncStatusRunning", "进行中"),
            cancelled: tx("syncStatusCancelled", "已取消"),
            skipped: tx("progressSkipped", "跳过"),
            new_source: tx("syncResultNewSource", "新来源"),
            not_ready: tx("syncResultNotReady", "未就绪"),
            warning: tx("syncResultWarning", "警告"),
        };
        return labels[status] || status;
    }

    function issueReason(issue: SyncOutcomeIssue): string {
        const labels = {
            unbound_with_notes: tx("syncIssueUnbound", "微信读书已有笔记内容，但尚未绑定真实的读书笔记文档。"),
            document_missing: tx("syncIssueMissingDoc", "原绑定的读书笔记文档已经不存在，请检查书架中的绑定。"),
            document_invalid: tx("syncIssueInvalidDoc", "绑定 ID 指向的块不是文档块，请检查书架中的绑定。"),
            sync_failed: tx("syncIssueFailed", "最近一次同步失败，请查看同步记录确认原因。"),
            index_broken: tx("syncIssueBrokenIndex", "已有块索引结构损坏，并且已经影响最近同步。"),
        };
        return labels[issue.issueCode];
    }

    function issueActionLabel(issue: SyncOutcomeIssue): string {
        if (issue.action === "open_shelf") return tx("syncIssueOpenShelf", "打开书架检查");
        if (issue.action === "open_diagnostics") return tx("syncIssueOpenDiagnostics", "查看诊断信息");
        return tx("syncIssueOpenRecords", "查看同步记录");
    }

    function errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    function showBookStatusWarning(result: InboxMutationResult) {
        if (!result.bookStatusWarning) return;
        showMessage(tx("syncResultSavedWithStatusWarning", "待办状态已保存，但书籍摘要状态刷新失败：{error}", {
            error: result.bookStatusWarning,
        }));
    }

    function showMutationError(error: unknown) {
        showMessage(tx("syncResultUpdateFailed", "待办状态更新失败：{error}", { error: errorMessage(error) }));
    }

    onMount(async () => {
        await load();
    });

    async function load() {
        isLoading = true;
        loadError = "";
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
            loadError = error instanceof Error ? error.message : String(error);
            showMessage(tx("syncResultLoadFailedMessage", "阅读待办中心加载失败，请稍后重试"));
        } finally {
            isLoading = false;
        }
    }

    async function switchView(view: "todo" | "issues" | "records") {
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
            showMessage(tx("syncResultNoValidSourceDoc", "该来源暂无有效的读书笔记文档"));
        }
    }

    function openContent(item: RecentNoteView) {
        if (item.locatedBlock && openLocatedBlock(plugin, item.locatedBlock)) return;
        if (item.noteDocId && openSiyuanDoc(plugin, item.noteDocId)) return;
        showMessage(tx("syncResultNoLocatedDoc", "这条内容尚未定位到有效的笔记文档"));
    }

    async function setItemStatus(item: RecentNoteView, status: ReadingInboxStatus) {
        if (isInboxMutating) return;
        isInboxMutating = true;
        try {
            let result: InboxMutationResult;
            try {
                result = await setInboxItemStatusStrict(plugin, item.id, status);
            } catch (error) {
                showMutationError(error);
                return;
            }
            showMessage(status === "processed"
                ? tx("syncResultProcessedMessage", "已标记为已处理")
                : tx("syncResultLaterMessage", "已设为稍后处理"));
            showBookStatusWarning(result);
            await load();
        } finally {
            isInboxMutating = false;
        }
    }

    async function markGroupProcessed(group: SyncOutcomeNewContentGroup) {
        if (isInboxMutating) return;
        isInboxMutating = true;
        try {
            let result: InboxMutationResult;
            try {
                result = await markInboxSourceProcessedStrict(plugin, group.sourceKey);
            } catch (error) {
                showMutationError(error);
                return;
            }
            showMessage(tx("syncResultGroupProcessedMessage", "《{title}》的新增内容已全部处理", { title: group.title }));
            showBookStatusWarning(result);
            await load();
        } finally {
            isInboxMutating = false;
        }
    }

    async function batchSetStatus(status: "processed" | "later") {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (isInboxMutating) return;
        isInboxMutating = true;
        try {
            let result: InboxMutationResult;
            try {
                result = await setInboxItemsStatusStrict(plugin, ids, status);
            } catch (error) {
                showMutationError(error);
                return;
            }
            showMessage(status === "processed"
                ? tx("syncResultBatchProcessedMessage", "已处理 {count} 条内容", { count: ids.length })
                : tx("syncResultBatchLaterMessage", "已将 {count} 条内容设为稍后处理", { count: ids.length }));
            showBookStatusWarning(result);
            await load();
        } finally {
            isInboxMutating = false;
        }
    }

    async function copyText(text: string, message: string) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(message);
        } catch {
            showMessage(tx("uiCopyFailed", "复制失败，请检查剪贴板权限"));
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
            item.comment ? tx("syncResultThoughtPrefix", "想法：{text}", { text: item.comment }) : "",
        ].filter(Boolean).join("\n\n");
    }

    function addToTopic(item: RecentNoteView) {
        dispatch("addToTopic", { item: item.rawItem });
    }

    async function addToReview(item: RecentNoteView) {
        const mutationId = item.rawItem.id;
        if (reviewMutatingId) return;
        reviewMutatingId = mutationId;
        try {
            const result = await addRecentNoteToReview(plugin, item);
            if (result.alreadyExists) {
                showMessage(tx("reviewAlreadyQueued", "该内容已在复习队列中"));
            } else if (result.reactivated) {
                showMessage(tx("reviewReactivated", "已重新加入复习"));
            } else {
                showMessage(tx("reviewAdded", "已加入复习，将在约 1 天后进入首次复习"));
            }
        } catch (error) {
            showMessage(tx("reviewAddFailed", "加入复习失败：{error}", { error: errorMessage(error) }));
        } finally {
            reviewMutatingId = null;
        }
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
            showMessage(tx("syncResultNoRecordDoc", "该记录没有有效的笔记文档"));
        }
    }

    async function copyDiagnostics() {
        if (!diagnostics) return;
        await copyText(JSON.stringify(diagnostics, null, 2), tx("syncResultDiagnosticsCopied", "已复制诊断摘要"));
    }

    async function cleanProcessed() {
        if (isInboxMutating) return;
        isInboxMutating = true;
        try {
            let result: { removed: number; remaining: number };
            try {
                result = await cleanupProcessedInboxItems(plugin);
            } catch (error) {
                showMessage(tx("syncResultCleanupFailed", "清理失败：{error}", {
                    error: error instanceof Error ? error.message : String(error),
                }));
                return;
            }
            showMessage(tx("syncResultProcessedCleaned", "已清理 {count} 条已处理记录", { count: result.removed }));
            await load();
        } finally {
            isInboxMutating = false;
        }
    }

    async function cleanReports() {
        if (isCleaningReports) return;
        isCleaningReports = true;
        try {
            let result: { removed: number; remaining: number };
            try {
                result = await keepRecentSyncReports(plugin, 10);
            } catch (error) {
                showMessage(tx("syncResultCleanupFailed", "清理失败：{error}", {
                    error: error instanceof Error ? error.message : String(error),
                }));
                return;
            }
            showMessage(tx("syncResultReportsCleaned", "已清理 {count} 条旧同步报告", { count: result.removed }));
            await load();
        } finally {
            isCleaningReports = false;
        }
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
        <button type="button" class="back-button" on:click={() => dispatch("back")}>{tx("uiBackOverview", "返回总览")}</button>
        <div>
            <h2>{tx("syncResultTitle", "阅读待办中心")}</h2>
            <p>{tx("syncResultSubtitle", "集中处理新内容、同步问题和历史记录")}</p>
        </div>
        <ContextTutorialLink
            href={READING_NOTES_LINKS.wereadResultsTutorial}
            label={tx("tutorialSyncResults", "查看同步结果教程")}
            compact
        />
    </header>

    <nav class="main-tabs" aria-label={tx("syncResultViewLabel", "阅读待办中心视图")}>
        <button
            type="button"
            class:active={activeView === "todo"}
            aria-current={activeView === "todo" ? "page" : undefined}
            on:click={() => switchView("todo")}
        >
            {tx("syncResultTodo", "待处理")}
            {#if data}<span>{data.summary.pendingContentCount}</span>{/if}
        </button>
        <button
            type="button"
            class:active={activeView === "issues"}
            aria-current={activeView === "issues" ? "page" : undefined}
            on:click={() => switchView("issues")}
        >
            {tx("syncResultIssuesTab", "问题")}
            {#if data}<span>{data.issues.length}</span>{/if}
        </button>
        <button
            type="button"
            class:active={activeView === "records"}
            aria-current={activeView === "records" ? "page" : undefined}
            on:click={() => switchView("records")}
        >{tx("syncResultRecords", "记录")}</button>
    </nav>

    {#if isLoading}
        <div class="empty-state" role="status" aria-live="polite">{tx("syncResultLoading", "正在汇总同步结果...")}</div>
    {:else if loadError || !data}
        <div class="empty-state error-state" role="alert">
            <strong>{tx("syncResultDataLoadFailed", "阅读待办中心读取失败")}</strong>
            <p>{tx("syncResultDataLoadFailedDesc", "部分本地状态无法读取，系统没有将异常数据当作空内容处理。")}</p>
            {#if loadError}<small>{loadError}</small>{/if}
            <button type="button" on:click={load}>{tx("uiRetry", "重试")}</button>
        </div>
    {:else if activeView === "todo"}
        <div class="todo-view">
            <section class="content-section">
                <div class="section-heading">
                    <div><h3>{tx("syncResultNewContent", "新增内容")}</h3><p>{tx("syncResultNewContentDesc", "按书籍或公众号分组，时间表示同步发现时间")}</p></div>
                    <strong>{data.summary.pendingContentCount}</strong>
                </div>

                {#if selectedIds.size > 0}
                    <div class="batch-bar">
                        <span>{tx("syncResultSelected", "已选 {count} 条", { count: selectedIds.size })}</span>
                        <button type="button" disabled={isInboxMutating} on:click={() => batchSetStatus("processed")}>{tx("syncResultMarkProcessed", "标记已处理")}</button>
                        <button type="button" disabled={isInboxMutating} on:click={() => batchSetStatus("later")}>{tx("syncResultLater", "稍后处理")}</button>
                    </div>
                {/if}

                {#if data.newContentGroups.length === 0}
                    <div class="compact-empty">{tx("syncResultNoPendingContent", "没有待处理的新增内容")}</div>
                {:else}
                    <div class="content-groups">
                        {#each data.newContentGroups as group (group.sourceKey)}
                            <article class="content-group">
                                <div class="group-heading">
                                    <div class="group-title">
                                        <span>{group.sourceType === "mp" ? tx("uiMpAccount", "公众号") : tx("uiNormalBook", "普通书")}</span>
                                        <h4>{group.title}</h4>
                                        <p>
                                            {tx("syncResultTotal", "共 {count} 条", { count: group.totalCount })}
                                            {#if group.bookmarkCount > 0} · {tx("syncResultBookmarks", "划线 {count}", { count: group.bookmarkCount })}{/if}
                                            {#if group.reviewCount > 0} · {tx("syncResultReviews", "评论 {count}", { count: group.reviewCount })}{/if}
                                            {#if group.mpArticleCount > 0} · {tx("syncResultMpItems", "公众号 {count}", { count: group.mpArticleCount })}{/if}
                                            · {tx("syncResultLatestDiscovered", "最近发现 {time}", { time: group.latestDiscoveredAtText || "--" })}
                                        </p>
                                    </div>
                                    <div class="group-actions">
                                        <button type="button" disabled={!group.noteDocId} on:click={() => openGroupDoc(group)}>{tx("uiOpenNote", "打开笔记")}</button>
                                        <button type="button" on:click={() => toggleGroup(group.sourceKey)}>{expandedGroups.has(group.sourceKey) ? tx("syncResultCollapse", "收起内容") : tx("syncResultViewContent", "查看新增内容")}</button>
                                        <button type="button" disabled={isInboxMutating} on:click={() => markGroupProcessed(group)}>{tx("syncResultMarkGroupProcessed", "全部标记已处理")}</button>
                                    </div>
                                </div>

                                {#if expandedGroups.has(group.sourceKey)}
                                    <div class="content-items">
                                        {#each group.items as item (item.id)}
                                            <article class="content-item">
                                                <label class="item-select">
                                                    <input type="checkbox" checked={selectedIds.has(item.id)} on:change={() => toggleSelected(item.id)} />
                                                    <span>{tx("select", "选择")}</span>
                                                </label>
                                                <button type="button" class="content-open" on:click={() => openContent(item)}>
                                                    <span>{noteTypeLabel(item)} · {tx("syncResultDiscoveredAt", "发现时间 {time}", { time: item.discoveredAtText || "--" })}</span>
                                                    <strong>{item.sectionLabel || tx("syncResultUnnamedSection", "未命名章节")}</strong>
                                                    <p>{item.comment || item.content || tx("syncResultNoContent", "暂无内容")}</p>
                                                </button>
                                                <div class="item-actions">
                                                    <button type="button" disabled={isInboxMutating} on:click={() => setItemStatus(item, "processed")}>{tx("syncResultMarkProcessed", "标记已处理")}</button>
                                                    <details class="more-menu">
                                                        <summary>{tx("uiMore", "更多")}</summary>
                                                        <div>
                                                            <button type="button" disabled={isInboxMutating} on:click={() => setItemStatus(item, "later")}>{tx("syncResultLater", "稍后处理")}</button>
                                                            <button type="button" on:click={() => addToTopic(item)}>{tx("syncResultAddTopic", "加入主题")}</button>
                                                            <button
                                                                type="button"
                                                                disabled={reviewMutatingId !== null}
                                                                on:click={() => void addToReview(item)}
                                                            >
                                                                {reviewMutatingId === item.rawItem.id
                                                                    ? tx("syncResultAddingReview", "加入中...")
                                                                    : tx("syncResultAddReview", "加入复习")}
                                                            </button>
                                                            <button type="button" on:click={() => copyText(buildQuote(item), tx("syncResultCopiedQuote", "已复制引用"))}>{tx("syncResultCopyQuote", "复制引用")}</button>
                                                            <button type="button" on:click={() => copyText(buildMarkdown(item), tx("syncResultCopiedMarkdown", "已复制 Markdown"))}>{tx("syncResultCopyMarkdown", "复制 Markdown")}</button>
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

        </div>
    {:else if activeView === "issues"}
        <div class="issues-view">
            <section class="issue-section">
                <div class="section-heading">
                    <div><h3>{tx("syncResultIssues", "需要处理的问题")}</h3><p>{tx("syncResultIssuesDesc", "这里只显示会影响同步或文档打开的问题")}</p></div>
                    <strong>{data.issues.length}</strong>
                </div>
                {#if issueGroups.length === 0}
                    <div class="compact-empty success">{tx("syncResultNoIssues", "当前没有需要处理的问题")}</div>
                {:else}
                    <div class="issue-groups">
                        {#each issueGroups as [sourceKey, issues] (sourceKey)}
                            <article class="issue-group">
                                <h4>{issues[0].title}</h4>
                                {#each issues as issue (issue.id)}
                                    <div class="issue-row">
                                        <p>{issueReason(issue)}</p>
                                        <button type="button" on:click={() => handleIssue(issue)}>{issueActionLabel(issue)}</button>
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
                    <div><span>{tx("syncResultLatestSync", "最近同步")}</span><strong>{formatTime(data.latestReport.endedAt || data.latestReport.startedAt)}</strong></div>
                    <div><span>{tx("syncResultStatus", "状态")}</span><strong>{reportStatusLabel(data.latestReport.status)}</strong></div>
                    <div><span>{tx("syncResultSuccessFailedSkipped", "成功 / 失败 / 跳过")}</span><strong>{data.latestReport.successCount} / {data.latestReport.failedCount} / {data.latestReport.skippedCount}</strong></div>
                    <div><span>{tx("syncResultAddedUpdatedDeleted", "新增 / 更新 / 删除")}</span><strong>{data.latestReport.addedItemCount} / {data.latestReport.changedItemCount} / {data.latestReport.deletedItemCount}</strong></div>
                </section>
            {:else}
                <div class="compact-empty">{tx("syncResultNoRecords", "尚无同步记录")}</div>
            {/if}

            <div class="record-filters">
                <button type="button" class:active={recordsFilter === "changed"} on:click={() => recordsFilter = "changed"}>{tx("syncResultChanged", "有变化")}</button>
                <button type="button" class:active={recordsFilter === "problem"} on:click={() => recordsFilter = "problem"}>{tx("syncResultProblem", "有问题")}</button>
            </div>

            {#if visibleRecords.length === 0}
                <div class="compact-empty">{tx("syncResultNoFilteredRecords", "当前筛选下没有记录")}</div>
            {:else}
                <div class="record-list">
                    {#each visibleRecords as record (`${record.reportId}:${record.sourceKey}:${record.status}`)}
                        <article class="record-card">
                            <div class="record-heading">
                                <div><h4>{record.title}</h4><p>{record.sourceType === "mp" ? tx("uiMpAccount", "公众号") : tx("uiNormalBook", "普通书")} · {reportStatusLabel(record.status)}</p></div>
                                <span class:problem={record.hasProblem}>{record.hasProblem ? tx("syncResultNeedsAction", "需要处理") : tx("syncResultChanged", "有变化")}</span>
                            </div>
                            <div class="record-counts">
                                <span>{tx("syncResultCountAdded", "新增 {count}", { count: record.addedItemCount })}</span>
                                <span>{tx("syncResultCountUpdated", "更新 {count}", { count: record.changedItemCount })}</span>
                                <span>{tx("syncResultCountDeleted", "删除 {count}", { count: record.deletedItemCount })}</span>
                            </div>
                            {#if record.message}<p class="record-message">{localizeKnownUiText(plugin, record.message)}</p>{/if}
                            {#if record.suggestion}<p class="record-suggestion">{tx("syncResultSuggestion", "建议：{text}", { text: localizeKnownUiText(plugin, record.suggestion) })}</p>{/if}
                            {#if record.noteDocId}<button type="button" class="open-record" on:click={() => openRecordDoc(record)}>{tx("uiOpenNote", "打开笔记")}</button>{/if}
                        </article>
                    {/each}
                </div>
            {/if}

            <details class="diagnostics" bind:open={diagnosticsOpen}>
                <summary>{tx("syncResultDiagnostics", "诊断信息与数据维护")}</summary>
                {#if diagnostics}
                    <div class="diagnostic-grid">
                        <span>{tx("syncResultInboxRecords", "收件箱记录 {count}", { count: diagnostics.cacheStatus.readingInboxItemCount })}</span>
                        <span>{tx("syncResultBookStatuses", "书籍状态 {count}", { count: diagnostics.cacheStatus.readingBookStatusCount })}</span>
                        <span>{tx("syncResultReportCount", "同步报告 {count}", { count: diagnostics.cacheStatus.wereadSyncReportCount })}</span>
                        <span>{tx("syncResultIndexSources", "块索引来源 {count}", { count: diagnostics.cacheStatus.blockIndexSourceCount })}</span>
                        {#if data.latestReport}
                            <span>{tx("syncResultUnchanged", "未变化单元 {count}", { count: data.latestReport.unchangedItemCount })}</span>
                            <span>{tx("syncResultBlockOperations", "块操作 {count}", { count: data.latestReport.blockOperationCount })}</span>
                            <span>{tx("syncResultRebuiltIndexes", "重建索引 {count}", { count: data.latestReport.rebuiltCount })}</span>
                        {/if}
                    </div>
                    {#if (diagnostics.latestReport?.warnings.length || 0) + (diagnostics.latestReport?.errors.length || 0) > 0}
                        <details class="raw-diagnostics">
                            <summary>
                                {tx("syncResultRawWarningsErrors", "原始警告与错误（{count}）", { count: (diagnostics.latestReport?.warnings.length || 0) + (diagnostics.latestReport?.errors.length || 0) })}
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
                    <button type="button" on:click={copyDiagnostics}>{tx("syncResultCopyDiagnostics", "复制诊断摘要")}</button>
                    <button type="button" disabled={isInboxMutating} on:click={cleanProcessed}>{tx("syncResultCleanProcessed", "清理已处理记录")}</button>
                    <button type="button" disabled={isCleaningReports} on:click={cleanReports}>{tx("syncResultCleanReports", "清理旧同步报告")}</button>
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

    .page-header :global(.context-tutorial-link) { margin-left: auto; }

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
    .issues-view,
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

    .error-state {
        display: grid;
        gap: 8px;
        border-color: var(--b3-theme-error);
        background: color-mix(in srgb, var(--b3-theme-error) 8%, var(--b3-theme-surface));
    }

    .error-state strong {
        color: var(--b3-theme-error);
    }

    .error-state p,
    .error-state small {
        overflow-wrap: anywhere;
    }

    .error-state button {
        justify-self: center;
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
