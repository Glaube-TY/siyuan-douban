<script lang="ts">
    import { showMessage } from "siyuan";
    import { getWereadStorageKey, replaceIgnoredBooks } from "../../utils/weread/wereadSyncStorage";

    export let plugin;
    export let ignoredBooks: Array<{
        title?: string;
        isbn?: string;
        bookID?: string;
        bookId?: string;
        syncID?: string;
    }>;
    export let onConfirm: () => void;
    export let onCancel: () => void;

    // 创建本地副本用于操作
    let localIgnoredBooks = [...ignoredBooks];
    let isSaving = false;

    // 取消忽略；已同步来源的效果是恢复后续同步
    const handleRestore = (bookID: string) => {
        localIgnoredBooks = localIgnoredBooks.filter(
            (book) => getWereadStorageKey(book) !== bookID,
        );
    };

    async function handleSave() {
        if (isSaving) return;
        isSaving = true;
        try {
            await replaceIgnoredBooks(plugin, localIgnoredBooks);
            onConfirm();
        } catch (error) {
            console.error("[wereadIgnoredBooksDialog] 保存忽略书籍失败", error);
            showMessage(plugin.i18n.syncedDataSaveFailed || "保存忽略书籍设置失败");
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="ignored-books-dialog">
    <div class="table-container">
        <table class="ignored-table">
            <thead>
                <tr>
                    <th>{plugin.i18n.bookTitle1}</th>
                    <th>{plugin.i18n.ignoredRestoreSync || "取消忽略 / 恢复同步"}</th>
                </tr>
            </thead>
            <tbody>
                {#each localIgnoredBooks as book (getWereadStorageKey(book))}
                    <tr>
                        <td>{book.title || getWereadStorageKey(book)}</td>
                        <td>
                            <button 
                                on:click={() => handleRestore(getWereadStorageKey(book))}
                                class="delete-btn"
                                title={plugin.i18n.ignoredRestoreSync || "取消忽略 / 恢复同步"}
                                aria-label={plugin.i18n.ignoredRestoreSync || "取消忽略 / 恢复同步"}
                            >
                                ↩️
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    <div class="dialog-actions">
        <button
            disabled={isSaving}
            on:click={handleSave}>{plugin.i18n.confirm}</button
        >

        <button disabled={isSaving} on:click={onCancel}>{plugin.i18n.cancel}</button>
    </div>
</div>

<style lang="scss">
    .ignored-books-dialog {
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

        .ignored-table {
            width: 100%;
            border-collapse: collapse;

            th,
            td {
                padding: 8px 12px;
                border: 1px solid var(--b3-border-color);
                text-align: left;
                vertical-align: middle;
                word-break: break-word;
                overflow-wrap: break-word;
            }

            th {
                background-color: var(--b3-theme-surface-light);
                position: sticky;
                top: 0;
                z-index: 1;
                text-align: center;
                font-weight: 600;
                color: var(--b3-theme-on-background);
                padding: 12px 8px;
            }

            /* 标题行居中 */
            thead th:nth-child(1),
            thead th:nth-child(2) {
                text-align: center;
            }

            /* 内容列对齐 */
            tbody td:nth-child(1) {
                text-align: left;
                width: auto; /* 自动宽度，占据剩余空间 */
            }

            tbody td:nth-child(2) {
                text-align: center;
                width: 80px;
                padding: 8px;
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
            gap: 1rem;
            margin-top: 1rem;

            button {
                padding: 10px 20px;
                border-radius: 8px;
                border: 1px solid var(--b3-border-color);
                &:hover {
                    background-color: var(--b3-theme-primary);
                    color: white;
                }
            }
        }
    }
</style>
