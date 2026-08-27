<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { svelteDialog } from "../../libs/dialog";
    import type { ReadingAnnotation, ReadingAnnotationArchive } from "../../types/readingAnnotation";
    import { getIgnoredBookIDSet } from "../../utils/weread/wereadSyncStorage";
    import { loadPluginStorageJsonStateStrict } from "../../utils/storage/pluginStorageStrict";
    import { loadReadingAnnotationArchiveState } from "../../utils/storage/readingAnnotationStorage";
    import { openSiyuanBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import { t } from "../../utils/i18n";
    import ReadingTopicPickerDialog from "./ReadingTopicPickerDialog.svelte";

    export let plugin: any;
    export let refreshKey = 0;
    export let mobile = false;

    type LoadState = "loading" | "loaded" | "error";
    type AnnotationTypeFilter = "all" | "highlight" | "review";
    type SourceFilter = "all" | "weread-book" | "weread-mp";
    type SortMode = "newest" | "oldest" | "title";

    const dispatch = createEventDispatcher<{
        requestFullSync: void;
        requestOpenTopics: void;
    }>();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    let loadState: LoadState = "loading";
    let archive: ReadingAnnotationArchive | null = null;
    let archiveExists = false;
    let errorMessage = "";
    let hasSyncedRecords = false;
    let expectedSourceKeys = new Set<string>();
    let archivedSourceCount = 0;
    let archiveIncomplete = false;
    let archiveMissing = false;
    let annotations: ReadingAnnotation[] = [];
    let bookOptions: Array<{ sourceKey: string; title: string }> = [];
    let visibleAnnotations: ReadingAnnotation[] = [];
    let requestedRefreshKey = refreshKey;
    let mounted = false;
    let loadToken = 0;

    let searchQuery = "";
    let typeFilter: AnnotationTypeFilter = "all";
    let sourceFilter: SourceFilter = "all";
    let bookFilter = "";
    let sortMode: SortMode = "newest";

    onMount(() => {
        mounted = true;
        void loadArchive();
    });

    $: if (mounted && refreshKey !== requestedRefreshKey) {
        requestedRefreshKey = refreshKey;
        void loadArchive();
    }

    $: annotations = archive ? Object.values(archive.sources).flatMap((source) => source.annotations) : [];
    $: bookOptions = buildBookOptions(annotations);
    $: visibleAnnotations = filterAnnotations(annotations);
    $: archiveIncomplete = expectedSourceKeys.size > 0 && archivedSourceCount < expectedSourceKeys.size;
    $: archiveMissing = !archiveExists && expectedSourceKeys.size > 0;

    async function loadArchive(): Promise<void> {
        const token = ++loadToken;
        loadState = "loading";
        errorMessage = "";

        try {
            const [archiveState, syncedState, ignoredState] = await Promise.all([
                loadReadingAnnotationArchiveState(plugin),
                loadPluginStorageJsonStateStrict(plugin, "weread_notebooks"),
                loadPluginStorageJsonStateStrict(plugin, "weread_ignoredBooks"),
            ]);
            if (token !== loadToken) return;

            const notebooks = toRecordArray(syncedState, "weread_notebooks");
            const ignoredBooks = toRecordArray(ignoredState, "weread_ignoredBooks");
            const nextExpectedKeys = buildExpectedSourceKeys(notebooks, getIgnoredBookIDSet(ignoredBooks));
            archive = archiveState.archive;
            archiveExists = archiveState.exists;
            hasSyncedRecords = notebooks.length > 0;
            expectedSourceKeys = nextExpectedKeys;
            archivedSourceCount = Array.from(nextExpectedKeys).filter((sourceKey) => !!archive?.sources[sourceKey]).length;
            if (!nextExpectedKeys.size) bookFilter = "";
            loadState = "loaded";
        } catch (error: any) {
            if (token !== loadToken) return;
            loadState = "error";
            errorMessage = error?.message || String(error) || "未知错误";
        }
    }

    function filterAnnotations(items: ReadingAnnotation[]): ReadingAnnotation[] {
        const query = searchQuery.trim().toLocaleLowerCase();
        const filtered = items.filter((annotation) => {
            if (typeFilter !== "all" && annotation.annotationType !== typeFilter) return false;
            if (sourceFilter !== "all" && annotation.sourceType !== sourceFilter) return false;
            if (bookFilter && annotation.sourceKey !== bookFilter) return false;
            if (!query) return true;
            return [
                annotation.content,
                annotation.quote,
                annotation.title,
                annotation.chapterTitle,
                annotation.articleTitle,
            ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
        });

        return filtered.sort((left, right) => {
            if (sortMode === "title") {
                return left.title.localeCompare(right.title) || annotationTime(right) - annotationTime(left);
            }
            const delta = annotationTime(right) - annotationTime(left);
            return sortMode === "newest" ? delta : -delta;
        });
    }

    function buildBookOptions(items: ReadingAnnotation[]): Array<{ sourceKey: string; title: string }> {
        const options = new Map<string, string>();
        for (const annotation of items) {
            if (!options.has(annotation.sourceKey)) options.set(annotation.sourceKey, annotation.title);
        }
        return Array.from(options, ([sourceKey, title]) => ({ sourceKey, title }))
            .sort((left, right) => left.title.localeCompare(right.title) || left.sourceKey.localeCompare(right.sourceKey));
    }

    function buildExpectedSourceKeys(records: any[], ignoredBookIDs: Set<string>): Set<string> {
        const sourceKeys = new Set<string>();
        for (const record of records) {
            const bookID = String(record?.bookID || record?.bookId || record?.syncID || "").trim();
            if (!bookID || ignoredBookIDs.has(bookID)) continue;
            const sourceType = String(record?.sourceType || "");
            const isMp = sourceType === "weread_mp_account" || sourceType === "weread-mp" || /^MP(?:_|$)/.test(bookID);
            sourceKeys.add(`${isMp ? "weread-mp" : "weread-book"}:${bookID}`);
        }
        return sourceKeys;
    }

    function toRecordArray(state: { exists: boolean; value?: unknown }, key: string): any[] {
        if (!state.exists) return [];
        if (!Array.isArray(state.value)) throw new Error(`${key} 数据格式无效`);
        return state.value;
    }

    function annotationTime(annotation: ReadingAnnotation): number {
        return annotation.createdAt ?? annotation.syncedAt ?? 0;
    }

    function formatTime(annotation: ReadingAnnotation): string {
        const timestamp = annotationTime(annotation);
        const milliseconds = timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;
        if (!milliseconds) return "—";
        return new Date(milliseconds).toLocaleString();
    }

    function contextTitle(annotation: ReadingAnnotation): string {
        return annotation.sourceType === "weread-mp"
            ? annotation.articleTitle || ""
            : annotation.chapterTitle || "";
    }

    function openAnnotation(annotation: ReadingAnnotation): void {
        if (annotation.blockId && openSiyuanBlock(plugin, annotation.blockId)) return;
        if (annotation.noteDocId && openSiyuanDoc(plugin, annotation.noteDocId)) return;
        showMessage(tx("readingAnnotationsNoPosition", "当前批注暂无可定位的本地笔记位置，请重新同步该来源。"));
    }

    function openTopicPicker(annotation: ReadingAnnotation): void {
        let dialogRef: any;
        const isMobileViewport = mobile || (typeof window !== "undefined"
            && window.matchMedia?.("(max-width: 600px)").matches);
        dialogRef = svelteDialog({
            title: tx("topicPickerTitle", "选择主题"),
            width: isMobileViewport ? "100vw" : "min(520px, 92vw)",
            height: isMobileViewport ? "100dvh" : "min(620px, 80vh)",
            disableClose: true,
            hideCloseIcon: true,
            constructor: (container: HTMLElement) => new ReadingTopicPickerDialog({
                target: container,
                props: {
                    plugin,
                    annotation,
                    close: () => dialogRef?.close?.(),
                    onRequestTopics: () => {
                        dialogRef?.close?.();
                        dispatch("requestOpenTopics");
                    },
                },
            }),
        });
        if (isMobileViewport) {
            dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
        }
    }
</script>

<div class="reading-annotations" class:reading-annotations-mobile={mobile}>
    {#if loadState === "loading"}
        <div class="annotation-state" role="status">{tx("readingAnnotationsLoading", "正在读取历史批注索引...")}</div>
    {:else if loadState === "error"}
        <div class="annotation-state annotation-state-error" role="alert">
            {tx("readingAnnotationsLoadFailed", "历史批注索引读取失败：{error}", { error: errorMessage })}
        </div>
    {:else if !hasSyncedRecords || (expectedSourceKeys.size === 0 && annotations.length === 0)}
        <div class="annotation-state">
            {tx("readingAnnotationsNoData", "暂无历史批注，完成微信读书同步后会自动建立。")}
        </div>
    {:else}
        {#if archiveMissing || archiveIncomplete}
            <div class="archive-notice" role="status">
                <p>
                    {archiveMissing
                        ? tx("readingAnnotationsArchiveMissing", "当前还没有完整历史批注索引，执行一次全部同步即可建立。")
                        : tx("readingAnnotationsArchiveIncomplete", "部分已同步来源尚未建立历史批注索引，可执行一次全部同步补全。")}
                </p>
                <button type="button" on:click={() => dispatch("requestFullSync")}>
                    {tx("readingAnnotationsBuildArchive", "执行全部同步")}
                </button>
            </div>
        {/if}

        <div class="annotation-toolbar">
            <input
                type="search"
                bind:value={searchQuery}
                aria-label={tx("readingAnnotationsSearch", "搜索历史批注")}
                placeholder={tx("readingAnnotationsSearch", "搜索历史批注")}
            />
            <div class="annotation-filters">
                <select bind:value={typeFilter} aria-label={tx("readingAnnotationsAllTypes", "全部类型")}>
                    <option value="all">{tx("readingAnnotationsAllTypes", "全部类型")}</option>
                    <option value="highlight">{tx("readingAnnotationsHighlights", "划线")}</option>
                    <option value="review">{tx("readingAnnotationsReviews", "想法")}</option>
                </select>
                <select bind:value={sourceFilter} aria-label={tx("readingAnnotationsAllSources", "全部来源")}>
                    <option value="all">{tx("readingAnnotationsAllSources", "全部来源")}</option>
                    <option value="weread-book">{tx("readingAnnotationsBooks", "普通书")}</option>
                    <option value="weread-mp">{tx("readingAnnotationsMp", "公众号")}</option>
                </select>
                <select bind:value={bookFilter} aria-label={tx("readingAnnotationsAllBooks", "全部书籍")}>
                    <option value="">{tx("readingAnnotationsAllBooks", "全部书籍")}</option>
                    {#each bookOptions as book (book.sourceKey)}
                        <option value={book.sourceKey}>{book.title} · {book.sourceKey}</option>
                    {/each}
                </select>
                <select bind:value={sortMode} aria-label={tx("readingAnnotationsSortNewest", "最新优先")}>
                    <option value="newest">{tx("readingAnnotationsSortNewest", "最新优先")}</option>
                    <option value="oldest">{tx("readingAnnotationsSortOldest", "最早优先")}</option>
                    <option value="title">{tx("readingAnnotationsSortTitle", "按标题")}</option>
                </select>
            </div>
        </div>

        <div class="annotation-summary">
            <span>{tx("readingAnnotationsCount", "共 {total} 条 · 当前显示 {visible} 条", { total: annotations.length, visible: visibleAnnotations.length })}</span>
            {#if archiveMissing || archiveIncomplete}
                <span>{tx("readingAnnotationsArchiveCoverage", "已建立 {archivedSources}/{expectedSources} 个来源", { archivedSources: archivedSourceCount, expectedSources: expectedSourceKeys.size })}</span>
            {/if}
        </div>

        {#if annotations.length === 0}
            <div class="annotation-state">{tx("readingAnnotationsNoData", "暂无历史批注，完成微信读书同步后会自动建立。")}</div>
        {:else if visibleAnnotations.length === 0}
            <div class="annotation-state">{tx("readingAnnotationsNoMatches", "没有符合当前筛选条件的批注。")}</div>
        {:else}
            <div class="annotation-grid">
                {#each visibleAnnotations as annotation (annotation.id)}
                    <article class="annotation-card">
                        <div class="annotation-card-header">
                            <div class="annotation-badges">
                                <span class="annotation-badge annotation-badge-type">
                                    {annotation.annotationType === "highlight"
                                        ? tx("readingAnnotationsHighlight", "划线")
                                        : tx("readingAnnotationsReview", "想法")}
                                </span>
                                <span class="annotation-badge">
                                    {annotation.sourceType === "weread-book"
                                        ? tx("readingAnnotationsSourceBook", "普通书")
                                        : tx("readingAnnotationsSourceMp", "公众号")}
                                </span>
                            </div>
                            <time datetime={String(annotationTime(annotation))}>{formatTime(annotation)}</time>
                        </div>
                        <h3>{annotation.title}</h3>
                        {#if contextTitle(annotation)}<div class="annotation-context">{contextTitle(annotation)}</div>{/if}
                        {#if annotation.annotationType === "review" && annotation.quote?.trim() && annotation.quote.trim() !== annotation.content.trim()}
                            <blockquote>{annotation.quote}</blockquote>
                        {/if}
                        <p class="annotation-content">{annotation.content}</p>
                        <div class="annotation-card-footer">
                            <span class="annotation-source">{annotation.sourceType === "weread-mp" ? tx("readingAnnotationsAccount", "账号") : tx("readingAnnotationsBook", "书籍")}</span>
                            <div class="annotation-actions">
                                <button type="button" on:click={() => openAnnotation(annotation)}>
                                    {tx("readingAnnotationsOpenOriginal", "打开原笔记")}
                                </button>
                                <button type="button" on:click={() => openTopicPicker(annotation)}>
                                    {tx("readingAnnotationsAddTopic", "加入主题")}
                                </button>
                            </div>
                        </div>
                    </article>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    .reading-annotations {
        display: grid;
        gap: 10px;
        min-width: 0;
    }

    .archive-notice,
    .annotation-state,
    .annotation-toolbar,
    .annotation-summary,
    .annotation-card {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        background: var(--b3-theme-surface, #fff);
    }

    .archive-notice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-color: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 30%, var(--b3-border-color, #e0e0e0));
        background: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 7%, var(--b3-theme-surface, #fff));
    }

    .archive-notice p,
    .annotation-card h3,
    .annotation-content,
    .annotation-context,
    blockquote,
    .annotation-state {
        margin: 0;
    }

    .archive-notice p {
        min-width: 0;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 12px;
        line-height: 1.5;
    }

    button,
    input,
    select {
        min-height: 30px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        font: inherit;
        font-size: 12px;
    }

    button {
        padding: 5px 9px;
        cursor: pointer;
    }

    button:hover {
        border-color: var(--b3-theme-primary, #4caf50);
        color: var(--b3-theme-primary, #4caf50);
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
        outline: 2px solid var(--b3-theme-primary, #4caf50);
        outline-offset: 1px;
    }

    .annotation-toolbar {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr);
        gap: 8px;
        padding: 8px;
    }

    .annotation-toolbar input,
    .annotation-filters select {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 5px 8px;
    }

    .annotation-filters {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        min-width: 0;
    }

    .annotation-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 14px;
        padding: 8px 10px;
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 12px;
    }

    .annotation-state {
        padding: 24px 16px;
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    .annotation-state-error {
        color: var(--b3-theme-error, #d33);
        text-align: left;
    }

    .annotation-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 10px;
        min-width: 0;
    }

    .annotation-card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 9px;
        padding: 12px;
        overflow: hidden;
    }

    .annotation-card-header,
    .annotation-card-footer,
    .annotation-badges,
    .annotation-actions {
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .annotation-card-header,
    .annotation-card-footer {
        justify-content: space-between;
        gap: 8px;
    }

    .annotation-badges,
    .annotation-actions {
        flex-wrap: wrap;
        gap: 6px;
    }

    .annotation-badge {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 2px 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-on-surface-light, #6b7280) 10%, transparent);
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 11px;
        white-space: nowrap;
    }

    .annotation-badge-type {
        background: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 12%, transparent);
        color: var(--b3-theme-primary, #4caf50);
    }

    .annotation-card time,
    .annotation-source {
        flex: 0 0 auto;
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 11px;
    }

    .annotation-card h3 {
        overflow: hidden;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 14px;
        font-weight: 650;
        line-height: 1.4;
        overflow-wrap: anywhere;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .annotation-context {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 12px;
        line-height: 1.45;
    }

    blockquote {
        padding-left: 9px;
        border-left: 2px solid var(--b3-border-color, #e0e0e0);
        color: var(--b3-theme-on-surface-light, #6b7280);
        font-size: 12px;
        line-height: 1.55;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    .annotation-content {
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 13px;
        line-height: 1.65;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    .annotation-card-footer {
        align-items: flex-end;
        margin-top: auto;
        padding-top: 2px;
    }

    .annotation-actions {
        justify-content: flex-end;
    }

    .annotation-actions button {
        white-space: nowrap;
    }

    @media (max-width: 760px) {
        .annotation-grid {
            grid-template-columns: minmax(0, 1fr);
        }

        .annotation-toolbar {
            grid-template-columns: 1fr;
        }

        .annotation-filters {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 430px) {
        .annotation-filters {
            grid-template-columns: 1fr;
        }

        .archive-notice,
        .annotation-card-footer {
            align-items: stretch;
            flex-direction: column;
        }

        .annotation-actions {
            justify-content: flex-start;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        button {
            transition: none;
        }
    }
</style>
