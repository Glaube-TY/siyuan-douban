<script lang="ts">
    import { onMount } from "svelte";
    import { getCurrentValidBookIdentifiers } from "@/utils/weread/getCurrentValidBookIdentifiers";
    import wereadManageISBN from "./wereadManageISBN.svelte";
    import wereadIgnoredBooksDialog from "./wereadIgnoredBooksDialog.svelte";
    import wereadUseBookIDBooksDialog from "./wereadUseBookIDBooksDialog.svelte";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let onConfirm: () => void;
    export let onCancel: () => void;

    type TabKey = "isbn" | "ignored" | "bookid";
    let activeTab: TabKey = "isbn";

    let customISBNBooks: any[] = [];
    let ignoredBooks: any[] = [];
    let useBookIDBooks: any[] = [];
    let validISBNs: string[] = [];
    let validBookIDs: string[] = [];
    let validBookNames: string[] = [];
    let isLoading = true;

    const tx = (key: string, fallback: string) => t(plugin, key, fallback);
    $: tabs = [
        { key: "isbn" as TabKey, label: tx("managementCustomIsbn", "自定义 ISBN") },
        { key: "ignored" as TabKey, label: tx("managementIgnored", "忽略书籍") },
        { key: "bookid" as TabKey, label: tx("managementBookId", "bookID 同步") },
    ];

    onMount(async () => {
        try {
            const [customISBN, ignored, useBookID, identifiers] = await Promise.all([
                plugin.loadData("weread_customBooksISBN"),
                plugin.loadData("weread_ignoredBooks"),
                plugin.loadData("weread_useBookIDBooks"),
                getCurrentValidBookIdentifiers(plugin),
            ]);
            customISBNBooks = Array.isArray(customISBN) ? customISBN : [];
            ignoredBooks = Array.isArray(ignored) ? ignored : [];
            useBookIDBooks = Array.isArray(useBookID) ? useBookID : [];
            validISBNs = Array.from(identifiers.validISBNs);
            validBookIDs = Array.from(identifiers.validBookIDs);
            validBookNames = Array.from(identifiers.validBookNames);
        } catch (e) {
            console.error("[WereadBookManagementDialog] 加载数据失败", e);
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
                on:click={() => (activeTab = tab.key)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="management-body">
        {#if isLoading}
            <div class="management-empty">{tx("uiLoading", "加载中...")}</div>
        {:else if activeTab === "isbn"}
            {#if customISBNBooks.length === 0}
                <div class="management-empty">{tx("managementNoIsbn", "暂无自定义 ISBN 记录")}</div>
            {:else}
                <svelte:component
                    this={wereadManageISBN}
                    {plugin}
                    {customISBNBooks}
                    {validISBNs}
                    {validBookNames}
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
        {:else if activeTab === "bookid"}
            {#if useBookIDBooks.length === 0}
                <div class="management-empty">{tx("managementNoBookId", "暂无 bookID 同步记录")}</div>
            {:else}
                <svelte:component
                    this={wereadUseBookIDBooksDialog}
                    {plugin}
                    {useBookIDBooks}
                    {validBookIDs}
                    {validBookNames}
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
