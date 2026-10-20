<script lang="ts">
    import { onMount } from "svelte";
    import { getCurrentValidBookIdentifiers } from "@/utils/weread/getCurrentValidBookIdentifiers";
    import { loadCustomISBNBooksWithMigration } from "@/utils/weread/wereadSyncStorage";
    import wereadManageISBN from "./wereadManageISBN.svelte";
    import wereadIgnoredBooksDialog from "./wereadIgnoredBooksDialog.svelte";
    import wereadUseBookIDBooksDialog from "./wereadUseBookIDBooksDialog.svelte";
    import WereadSyncedDataDialog from "./WereadSyncedDataDialog.svelte";
    import WereadBookIDRepairPanel from "./WereadBookIDRepairPanel.svelte";
    import { t } from "../../utils/i18n";
    import { loadPluginStorageJsonStateStrict } from "../../utils/storage/pluginStorageStrict";

    type TabKey = "synced" | "ignored" | "isbn" | "bookid" | "repair";

    export let plugin: any;
    export let onConfirm: () => void;
    export let onCancel: () => void;
    export let initialTab: TabKey = "synced";

    let activeTab: TabKey = initialTab;

    let syncedRecords: any[] = [];
    let customISBNBooks: any[] = [];
    let ignoredBooks: any[] = [];
    let useBookIDBooks: any[] = [];
    let temporaryNotebooks: any[] = [];
    let validISBNs: string[] = [];
    let validBookIDs: string[] = [];
    let isLoading = true;
    let loadError = "";

    const tx = (key: string, fallback: string) => t(plugin, key, fallback);
    $: tabs = [
        { key: "synced" as TabKey, label: tx("managementSynced", "已同步数据") },
        { key: "ignored" as TabKey, label: tx("managementIgnored", "忽略书籍") },
        { key: "isbn" as TabKey, label: tx("managementCustomIsbn", "自定义 ISBN") },
        { key: "bookid" as TabKey, label: tx("managementBookId", "bookID 同步") },
        { key: "repair" as TabKey, label: tx("wereadRepairTab", "身份关联") },
    ];

    async function readArray(key: string): Promise<any[]> {
        const state = await loadPluginStorageJsonStateStrict(plugin, key);
        if (!state.exists || (key === "temporary_weread_notebooksList" && state.value === null)) return [];
        if (!Array.isArray(state.value) || state.value.some(record => !record || typeof record !== "object" || Array.isArray(record))) throw new Error("Invalid management storage");
        if (key === "weread_useBookIDBooks" && (state.value.some(record => typeof record.bookID !== "string" || !record.bookID.trim()) || new Set(state.value.map(record => record.bookID)).size !== state.value.length)) throw new Error("Invalid BookID management storage");
        return state.value;
    }

    onMount(async () => {
        try {
            const [synced, ignored, customISBN, useBookID, temporary, identifiers] = await Promise.all([
                readArray("weread_notebooks"),
                readArray("weread_ignoredBooks"),
                loadCustomISBNBooksWithMigration(plugin, { migrate: false }),
                readArray("weread_useBookIDBooks"),
                readArray("temporary_weread_notebooksList"),
                getCurrentValidBookIdentifiers(plugin, { cleanupOrphans: false }),
            ]);
            syncedRecords = Array.isArray(synced) ? synced : [];
            customISBNBooks = Array.isArray(customISBN) ? customISBN : [];
            ignoredBooks = Array.isArray(ignored) ? ignored : [];
            useBookIDBooks = Array.isArray(useBookID) ? useBookID : [];
            temporaryNotebooks = Array.isArray(temporary) ? temporary : [];
            validISBNs = Array.from(identifiers.validISBNs);
            validBookIDs = Array.from(identifiers.validBookIDs);
        } catch (e) {
            loadError = e instanceof Error && e.name === "WereadCustomISBNStorageError"
                ? e.message
                : tx("wereadManagementLoadFailed", "无法加载微信读书管理数据，请检查存储后重试。");
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="weread-book-management-dialog">
    <div class="management-tabs">
        {#each tabs as tab}
            <button
                class="management-tab"
                class:active={activeTab === tab.key}
                aria-pressed={activeTab === tab.key}
                on:click={() => (activeTab = tab.key)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="management-body">
        {#if activeTab === "repair"}
            <WereadBookIDRepairPanel {plugin} />
        {:else if isLoading}
            <div class="management-empty">{tx("uiLoading", "加载中...")}</div>
        {:else if loadError}
            <div class="management-empty" role="alert">{loadError}</div>
        {:else if activeTab === "synced"}
            {#if syncedRecords.length === 0}
                <div class="management-empty">{tx("managementNoSynced", "暂无已同步数据")}</div>
            {:else}
                <WereadSyncedDataDialog
                    {plugin}
                    {syncedRecords}
                    {ignoredBooks}
                    {temporaryNotebooks}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            {/if}
        {:else if activeTab === "ignored"}
            {#if ignoredBooks.length === 0}
                <div class="management-empty">{tx("managementNoIgnored", "暂无忽略书籍记录")}</div>
            {:else}
                <svelte:component
                    this={wereadIgnoredBooksDialog}
                    {plugin}
                    {ignoredBooks}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            {/if}
        {:else if activeTab === "isbn"}
            {#if customISBNBooks.length === 0}
                <div class="management-empty">{tx("managementNoIsbn", "暂无自定义 ISBN 记录")}</div>
            {:else}
                <svelte:component
                    this={wereadManageISBN}
                    {plugin}
                    {customISBNBooks}
                    {validISBNs}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            {/if}
        {:else if activeTab === "bookid"}
            {#if useBookIDBooks.length === 0}
                <div class="management-empty">{tx("managementNoBookId", "暂无 bookID 同步记录")}</div>
            {:else}
                <svelte:component
                    this={wereadUseBookIDBooksDialog}
                    {plugin}
                    {useBookIDBooks}
                    {validBookIDs}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            {/if}
        {/if}
    </div>
</div>

<style>
    .weread-book-management-dialog {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .management-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 12px 16px 0;
        border-bottom: 1px solid var(--b3-border-color);
        flex-shrink: 0;
    }

    .management-tab {
        padding: 8px 14px;
        border: none;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        cursor: pointer;
        transition: color 0.15s ease, border-color 0.15s ease;
    }

    .management-tab:focus-visible {
        outline: 2px solid var(--b3-theme-primary);
        outline-offset: -2px;
    }

    .management-tab:hover {
        color: var(--b3-theme-on-surface);
    }

    .management-tab.active {
        color: var(--b3-theme-primary);
        border-bottom-color: var(--b3-theme-primary);
    }

    .management-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 12px 16px 16px;
    }

    .management-empty {
        display: grid;
        place-items: center;
        min-height: 160px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }
</style>
