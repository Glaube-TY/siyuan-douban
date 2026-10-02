<script lang="ts">
    export let plugin;
    export let useBookIDBooks: Array<{
        title: string;
        isbn: string;
        bookID: string;
    }>;
    export let onConfirm: () => void;
    export let onCancel: () => void;
    export let validBookIDs: string[] = [];

    const validBookIDSet = new Set(validBookIDs);

    function isUseBookIDStale(book: { title: string; isbn: string; bookID: string }): boolean {
        return !book.bookID || !validBookIDSet.has(book.bookID.trim());
    }

    const effectiveBooks = useBookIDBooks.filter(book => !isUseBookIDStale(book));
    const staleBooks = useBookIDBooks.filter(book => isUseBookIDStale(book));

    let localEffectiveBooks = [...effectiveBooks];
    let localStaleBooks = [...staleBooks];

    const handleDeleteEffective = (bookID: string) => {
        localEffectiveBooks = localEffectiveBooks.filter((book) => book.bookID !== bookID);
    };

    const handleDeleteStale = (bookID: string) => {
        localStaleBooks = localStaleBooks.filter((book) => book.bookID !== bookID);
    };

    const handleClearStale = () => {
        localStaleBooks = [];
    };

    const handleSave = () => {
        const merged = [...localEffectiveBooks, ...localStaleBooks];
        plugin.saveData("weread_useBookIDBooks", merged);
        onConfirm();
    };
</script>

<div class="use-bookid-books-dialog">
    {#if localStaleBooks.length > 0}
    <div class="stale-notice">⚠️ {plugin.i18n.managementStaleNotice || "以下历史项未找到匹配的本地书籍。书名相同不能证明身份一致，这些记录不会阻止来源重新进入待处理列表。"}</div>
    <div class="table-container stale-table">
        <table class="use-bookid-table">
            <thead>
                <tr>
                    <th>{plugin.i18n.bookTitle1}</th>
                    <th>{plugin.i18n.delete}</th>
                </tr>
            </thead>
            <tbody>
                {#each localStaleBooks as book (book.bookID)}
                    <tr class="stale-row">
                        <td>{book.title}</td>
                        <td>
                            <button
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
        <button class="clear-stale-btn" on:click={handleClearStale}>
            {(plugin.i18n.managementClearStale || "一键清理失效项（{count}）").replace("{count}", String(localStaleBooks.length))}
        </button>
    </div>
    {/if}

    {#if localEffectiveBooks.length > 0}
    <div class="table-container">
        <table class="use-bookid-table">
            <thead>
                <tr>
                    <th>{plugin.i18n.bookTitle1}</th>
                    <th>{plugin.i18n.delete}</th>
                </tr>
            </thead>
            <tbody>
                {#each localEffectiveBooks as book (book.bookID)}
                    <tr>
                        <td>{book.title}</td>
                        <td>
                            <button
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
        <button on:click={handleSave}>{plugin.i18n.confirm}</button>
        <button on:click={onCancel}>{plugin.i18n.cancel}</button>
    </div>
</div>

<style lang="scss">
    .use-bookid-books-dialog {
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

        .use-bookid-table {
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
