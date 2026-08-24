<script lang="ts">
    import { showMessage } from "siyuan";
    import { t } from "../../utils/i18n";
    import {
        getIgnoredBookIDSet,
        getWereadStorageKey,
        loadIgnoredBooks,
        replaceIgnoredBooks,
    } from "../../utils/weread/wereadSyncStorage";

    export let plugin: any;
    export let syncedRecords: any[] = [];
    export let ignoredBooks: any[] = [];
    export let temporaryNotebooks: any[] = [];
    export let onConfirm: () => void;
    export let onCancel: () => void;

    type SyncedRow = {
        bookID: string;
        title: string;
        isbn: string;
        author: string;
        sourceType: string;
        isMpAccount: boolean;
    };

    let search = "";
    let sourceFilter = "all";
    let statusFilter = "all";
    let isSaving = false;
    let localIgnoredBookIDs = getIgnoredBookIDSet(ignoredBooks);

    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    function getBookID(record: any): string {
        return getWereadStorageKey(record);
    }

    function isMpAccount(sourceType: string, bookID: string): boolean {
        return sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_");
    }

    function buildRows(records: any[], cacheRecords: any[]): SyncedRow[] {
        const cacheByBookID = new Map<string, any>();
        for (const record of Array.isArray(cacheRecords) ? cacheRecords : []) {
            const bookID = getBookID(record);
            if (bookID) cacheByBookID.set(bookID, record);
        }

        const rowsByBookID = new Map<string, SyncedRow>();
        for (const record of Array.isArray(records) ? records : []) {
            const bookID = getBookID(record);
            if (!bookID || rowsByBookID.has(bookID)) continue;

            const cache = cacheByBookID.get(bookID) || {};
            const sourceType = cache.sourceType || record.sourceType || "";
            rowsByBookID.set(bookID, {
                bookID,
                title: String(cache.title || record.title || bookID),
                isbn: String(cache.isbn || record.isbn || ""),
                author: String(cache.author || record.author || ""),
                sourceType,
                isMpAccount: isMpAccount(sourceType, bookID),
            });
        }
        return Array.from(rowsByBookID.values());
    }

    $: rows = buildRows(syncedRecords, temporaryNotebooks);
    $: normalizedSearch = search.trim().toLowerCase();
    $: activeCount = rows.filter((row) => !localIgnoredBookIDs.has(row.bookID)).length;
    $: ignoredCount = rows.length - activeCount;
    $: filteredRows = rows.filter((row) => {
        const matchesSearch = !normalizedSearch
            || row.title.toLowerCase().includes(normalizedSearch)
            || row.bookID.toLowerCase().includes(normalizedSearch);
        const matchesSource = sourceFilter === "all"
            || (sourceFilter === "mp" && row.isMpAccount)
            || (sourceFilter === "book" && !row.isMpAccount);
        const isIgnored = localIgnoredBookIDs.has(row.bookID);
        const matchesStatus = statusFilter === "all"
            || (statusFilter === "active" && !isIgnored)
            || (statusFilter === "ignored" && isIgnored);
        return matchesSearch && matchesSource && matchesStatus;
    });

    function toggleSync(row: SyncedRow) {
        const next = new Set(localIgnoredBookIDs);
        if (next.has(row.bookID)) {
            next.delete(row.bookID);
        } else {
            next.add(row.bookID);
        }
        localIgnoredBookIDs = next;
    }

    async function save() {
        if (isSaving) return;
        isSaving = true;
        try {
            const syncedBookIDs = new Set(rows.map((row) => row.bookID));
            const currentIgnoredBooks = await loadIgnoredBooks(plugin);
            const preservedIgnored = currentIgnoredBooks.filter((record) => !syncedBookIDs.has(getBookID(record)));
            const stoppedRecords = rows
                .filter((row) => localIgnoredBookIDs.has(row.bookID))
                .map((row) => ({
                    bookID: row.bookID,
                    title: row.title,
                    isbn: row.isbn,
                    sourceType: row.sourceType || (row.isMpAccount ? "weread_mp_account" : "weread_book"),
                    author: row.author,
                }));

            await replaceIgnoredBooks(plugin, [...preservedIgnored, ...stoppedRecords]);
            onConfirm();
        } catch (error) {
            console.error("[WereadSyncedDataDialog] 保存停止同步设置失败", error);
            showMessage(tx("syncedDataSaveFailed", "保存已同步数据设置失败"));
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="synced-data-dialog">
    <div class="synced-toolbar">
        <input
            class="b3-text-field synced-search"
            type="search"
            bind:value={search}
            placeholder={tx("syncedDataSearchPlaceholder", "搜索标题或 bookID")}
            aria-label={tx("syncedDataSearchPlaceholder", "搜索标题或 bookID")}
        />
        <select class="b3-select" bind:value={sourceFilter} aria-label={tx("syncedDataSourceFilter", "来源筛选")}>
            <option value="all">{tx("syncedDataAllSources", "全部来源")}</option>
            <option value="book">{tx("syncedDataNormalBooks", "普通书")}</option>
            <option value="mp">{tx("syncedDataMpAccounts", "公众号")}</option>
        </select>
        <select class="b3-select" bind:value={statusFilter} aria-label={tx("syncedDataStatusFilter", "状态筛选")}>
            <option value="all">{tx("syncedDataAllStatuses", "全部状态")}</option>
            <option value="active">{tx("syncedDataActive", "参与同步")}</option>
            <option value="ignored">{tx("syncedDataIgnored", "已停止同步")}</option>
        </select>
    </div>

    <div class="synced-summary">
        {tx("syncedDataSummary", "已同步 {total} 项 · 参与同步 {active} 项 · 已停止 {ignored} 项", {
            total: rows.length,
            active: activeCount,
            ignored: ignoredCount,
        })}
    </div>

    <div class="synced-list" role="list">
        {#if filteredRows.length === 0}
            <div class="synced-empty">{tx("managementNoSynced", "暂无已同步数据")}</div>
        {:else}
            {#each filteredRows as row (row.bookID)}
                <div class="synced-row" role="listitem">
                    <div class="synced-info">
                        <div class="synced-title">{row.title}</div>
                        <div class="synced-book-id">{row.bookID}</div>
                    </div>
                    <div class="synced-meta">
                        <span>{row.isMpAccount ? tx("syncedDataMpAccounts", "公众号") : tx("syncedDataNormalBooks", "普通书")}</span>
                        <span class:stopped={localIgnoredBookIDs.has(row.bookID)}>
                            {localIgnoredBookIDs.has(row.bookID) ? tx("syncedDataIgnored", "已停止同步") : tx("syncedDataActive", "参与同步")}
                        </span>
                    </div>
                    <button
                        type="button"
                        class="synced-toggle"
                        class:resume={localIgnoredBookIDs.has(row.bookID)}
                        aria-pressed={!localIgnoredBookIDs.has(row.bookID)}
                        aria-label={localIgnoredBookIDs.has(row.bookID)
                            ? tx("syncedDataResumeSync", "恢复同步")
                            : tx("syncedDataStopSync", "停止同步")}
                        on:click={() => toggleSync(row)}
                    >
                        {localIgnoredBookIDs.has(row.bookID) ? tx("syncedDataResumeSync", "恢复同步") : tx("syncedDataStopSync", "停止同步")}
                    </button>
                </div>
            {/each}
        {/if}
    </div>

    <div class="synced-actions">
        <button type="button" class="b3-button b3-button--primary" disabled={isSaving} on:click={save}>
            {tx("confirm", "确认")}
        </button>
        <button type="button" class="b3-button" disabled={isSaving} on:click={onCancel}>
            {tx("cancel", "取消")}
        </button>
    </div>
</div>

<style>
    .synced-data-dialog {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
    }

    .synced-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .synced-search {
        flex: 1 1 220px;
        min-width: 0;
    }

    .synced-toolbar select {
        flex: 0 1 140px;
        min-width: 110px;
        max-width: 100%;
    }

    .synced-summary {
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .synced-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        overflow: auto;
    }

    .synced-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }

    .synced-info {
        flex: 1 1 220px;
        min-width: 0;
    }

    .synced-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .synced-book-id {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .synced-meta {
        display: flex;
        flex: 0 1 150px;
        flex-direction: column;
        gap: 3px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .synced-meta .stopped {
        color: var(--b3-theme-error);
    }

    .synced-toggle {
        flex: 0 0 auto;
        min-width: 84px;
        padding: 6px 10px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-primary);
        cursor: pointer;
    }

    .synced-toggle.resume {
        border-color: var(--b3-theme-success);
        color: var(--b3-theme-success);
    }

    .synced-empty {
        display: grid;
        min-height: 120px;
        place-items: center;
        color: var(--b3-theme-on-surface-light);
    }

    .synced-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 4px;
    }

    @media (max-width: 560px) {
        .synced-meta {
            flex: 1 1 140px;
        }

        .synced-toggle {
            flex: 1 1 100%;
        }
    }
</style>
