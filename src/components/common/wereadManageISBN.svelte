<script lang="ts">
    import { showMessage } from "siyuan";
    import { isValidISBN, normalizeISBN } from "@/utils/bookHandling/isbn";

    import { onMount, onDestroy } from "svelte";
    import { readWereadManagementSnapshot, saveWereadManagementData, wereadManagementSaveMessage, type WereadManagementSnapshot } from "../../utils/weread/wereadManagementSaveGuard";
    export let plugin;

    export let customISBNBooks: Array<{
        title: string;
        customISBN: string;
        bookID: string;
    }>;
    export let onConfirm: () => void;
    export let onCancel: () => void;
    export let validISBNs: string[] = [];
    const validISBNSet = new Set(validISBNs.filter(isValidISBN).map(normalizeISBN));

    function isCustomISBNStale(book: { title: string; customISBN: string; bookID: string }): boolean {
        return !isValidISBN(book.customISBN) || !validISBNSet.has(normalizeISBN(book.customISBN));
    }

    const originalBooks = structuredClone(customISBNBooks);
    const editableBooks = structuredClone(originalBooks);
    const effectiveBooks = editableBooks.filter(book => !isCustomISBNStale(book));
    const staleBooks = editableBooks.filter(book => isCustomISBNStale(book));

    let localEffectiveBooks = [...effectiveBooks];
    let localStaleBooks = [...staleBooks];
    let isSaving = false;
    let isLoading = true;
    let needsRecheck = false;
    let errorText = "";
    let alive = true;
    let snapshot: WereadManagementSnapshot;
    $: busy = isSaving || isLoading || needsRecheck;
    onMount(async () => {
        try {
            snapshot = await readWereadManagementSnapshot(plugin, "weread_customBooksISBN", originalBooks);
        } catch (error) {
            needsRecheck = true;
            errorText = wereadManagementSaveMessage(plugin, error?.status);
        } finally { isLoading = false; }
    });
    onDestroy(() => { alive = false; });
    const handleCancel = () => { if (!isSaving) onCancel(); };


    const handleDeleteEffective = (bookID: string) => {
        if (isSaving || isLoading || needsRecheck) return;
        localEffectiveBooks = localEffectiveBooks.filter((book) => book.bookID !== bookID);
    };

    const handleDeleteStale = (bookID: string) => {
        if (isSaving || isLoading || needsRecheck) return;
        localStaleBooks = localStaleBooks.filter((book) => book.bookID !== bookID);
    };

    const handleClearStale = () => {
        if (isSaving || isLoading || needsRecheck) return;
        localStaleBooks = [];
    };

    function editedISBNBooks() {
        const edited = new Map([...localEffectiveBooks, ...localStaleBooks].map(book => [book.bookID, book]));
        return originalBooks.filter(book => edited.has(book.bookID)).map(book => edited.get(book.bookID));
    }
    const handleSave = async () => {
        if (isSaving || isLoading || needsRecheck) return;
        isSaving = true; errorText = "";
        try {
            const result = await saveWereadManagementData(plugin, "weread_customBooksISBN", snapshot, editedISBNBooks(), () => alive);
            if (!alive) return;
            if (result.status === "success") onConfirm();
            else {
                needsRecheck = !!result.requiresReopen;
                errorText = wereadManagementSaveMessage(plugin, result.status);
                showMessage(errorText);
            }
        } finally { if (alive) isSaving = false; }
    };
</script>

<div class="custom-ISBN-dialog" aria-busy={isSaving || isLoading}>
    {#if errorText}<p class="management-save-error" role="alert">{errorText}</p>{/if}
    {#if localStaleBooks.length > 0}
    <div class="stale-notice">⚠️ {plugin.i18n.managementStaleNotice || "以下历史项未找到匹配的本地书籍。书名相同不能证明身份一致，这些记录不会阻止来源重新进入待处理列表。"}</div>
    <div class="table-container stale-table">
        <table class="isbn-table">
            <thead>
                <tr>
                    <th>{plugin.i18n.bookTitle1}</th>
                    <th>{plugin.i18n.bookIsbn1}</th>
                    <th>{plugin.i18n.delete}</th>
                </tr>
            </thead>
            <tbody>
                {#each localStaleBooks as book (book.bookID)}
                    <tr class="stale-row">
                        <td>{book.title}</td>
                        <td>
                            <input
                                type="text"
                                bind:value={book.customISBN}
                                disabled={busy}
                                placeholder={plugin.i18n.bookIsbnManual}
                                class="isbn-input"
                            />
                        </td>
                        <td>
                            <button
                                disabled={busy}
                                on:click={() => handleDeleteStale(book.bookID)}
                                class="delete-btn"
                                title="{plugin.i18n.delete}"
                            >
                                🗑️
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <div class="stale-actions">
        <button class="clear-stale-btn" disabled={busy} on:click={handleClearStale}>
            {(plugin.i18n.managementClearStale || "一键清理失效项（{count}）").replace("{count}", String(localStaleBooks.length))}
        </button>
    </div>
    {/if}

    {#if localEffectiveBooks.length > 0}
    <div class="table-container">
        <table class="isbn-table">
            <thead>
                <tr>
                    <th>{plugin.i18n.bookTitle1}</th>
                    <th>{plugin.i18n.bookIsbn1}</th>
                    <th>{plugin.i18n.delete}</th>
                </tr>
            </thead>
            <tbody>
                {#each localEffectiveBooks as book (book.bookID)}
                    <tr>
                        <td>{book.title}</td>
                        <td>
                            <input
                                type="text"
                                bind:value={book.customISBN}
                                disabled={busy}
                                placeholder={plugin.i18n.bookIsbnManual}
                                class="isbn-input"
                            />
                        </td>
                        <td>
                            <button
                                disabled={busy}
                                on:click={() => handleDeleteEffective(book.bookID)}
                                class="delete-btn"
                                title="{plugin.i18n.delete}"
                            >
                                🗑️
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    {/if}

    <div class="dialog-actions">
        <button on:click={handleSave} disabled={busy}>{plugin.i18n.confirm}</button>
        <button on:click={handleCancel} disabled={isSaving}>{plugin.i18n.cancel}</button>
    </div>
</div>

<style lang="scss">
    .management-save-error {
        align-self: stretch;
        max-width: 100%;
        margin: 0;
        overflow-wrap: anywhere;
        white-space: normal;
        color: var(--b3-theme-error);
    }

    .custom-ISBN-dialog {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        justify-content: center;

        .table-container {
            width: 100%;
            max-height: 600px; /* 设置最大高度 */
            overflow-y: auto; /* 超出时显示垂直滚动条 */
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
        }

        .isbn-table {
            width: 100%;
            border-collapse: collapse;

            th,
            td {
                padding: 12px;
                border: 1px solid var(--b3-border-color);
                text-align: left;
                vertical-align: middle;
            }

            th {
                text-align: center;
                font-weight: 600;
            }

            td:nth-child(2) {
                min-width: 200px;
                max-width: 250px;
                position: relative;
            }

            td:nth-child(3) {
                text-align: center;
                width: 60px;
                padding: 8px;
            }

            th {
                background-color: var(--b3-theme-surface-light);
                position: sticky;
                top: 0;
                z-index: 1;
            }

            input {
                width: fit-content;
                padding: 4px;
            }

            .isbn-input {
                width: calc(100% - 24px); /* 减去左右padding */
                padding: 8px 12px;
                border: 2px solid var(--b3-border-color);
                border-radius: 6px;
                font-size: 14px;
                transition: all 0.3s ease;
                background-color: var(--b3-theme-background);
                color: var(--b3-theme-on-background, #1f2937);
                box-sizing: border-box; /* 确保padding包含在width内 */

                &:focus {
                    outline: none;
                    border-color: var(--b3-theme-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }

                &::placeholder {
                    color: var(--b3-theme-on-surface, #6b7280);
                    opacity: 0.7;
                }
            }

            .delete-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                padding: 0;
                border: none;
                border-radius: 6px;
                background-color: transparent;
                color: var(--b3-theme-error);
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 16px;

                &:hover {
                    background-color: rgba(239, 68, 68, 0.1);
                    transform: scale(1.1);
                }

                &:active {
                    transform: scale(0.95);
                }
            }
        }

        .dialog-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
            justify-content: center;

            button {
                padding: 10px 20px;
                border-radius: 8px;
                border: 1px solid var(--b3-border-color);
            }
        }

        .stale-notice {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--b3-theme-surface);
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            font-size: 12px;
            color: var(--b3-theme-on-background);
            margin-bottom: 8px;
        }

        .stale-table {
            margin-bottom: 8px;
        }

        .stale-row {
            opacity: 0.65;
        }

        .stale-actions {
            width: 100%;
            display: flex;
            justify-content: flex-end;
            margin-bottom: 8px;

            .clear-stale-btn {
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 4px;
                border: 1px solid var(--b3-border-color);
                background-color: var(--b3-theme-background);
                color: var(--b3-theme-error);
                cursor: pointer;
                &:hover {
                    background-color: rgba(239, 68, 68, 0.1);
                }
            }
        }
    }
</style>
