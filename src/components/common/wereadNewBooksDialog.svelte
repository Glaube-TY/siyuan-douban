<script lang="ts">
    export let books: Array<{
        title: string;
        isbn: string;
    }>;
    export let onConfirm: (
        selectedBooks: Array<{ title: string; isbn: string }>,
    ) => void;
    export let onCancel: () => void;
    export let onContinue: () => void;

    let selectedBooks = [];

    // 添加复选框绑定
    function toggleBook(book) {
        const index = selectedBooks.findIndex((b) => b.isbn === book.isbn);
        if (index > -1) {
            selectedBooks.splice(index, 1);
        } else {
            selectedBooks.push(book);
        }
    }
</script>

<div class="notebooks-dialog">
    <div class="confirm-btn-container">
        <button class="confirm-btn" on:click={() => onConfirm(selectedBooks)}>确认选择</button>
        <button class="continue-btn" on:click={() => onContinue()}>继续同步</button>
        <button class="cancel-btn" on:click={() => onCancel()}>取消同步</button>
    </div>
    <table class="book-table">
        <thead>
            <tr>
                <th>选择</th>
                <th class="book-title">书名</th>
                <th class="book-isbn">ISBN</th>
            </tr>
        </thead>
        <tbody>
            {#each books as book}
                <tr class="book-row">
                    <td>
                        <input
                            type="checkbox"
                            on:change={() => toggleBook(book)}
                            checked={selectedBooks.some(
                                (b) => b.isbn === book.isbn,
                            )}
                        />
                    </td>
                    <td>{book.title}</td>
                    <td>{book.isbn}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style lang="scss">
    .notebooks-dialog {
        padding: 10px;
        max-height: 80vh;
        overflow: auto;
        width: 100%;
        max-width: 90vw;

        .confirm-btn-container {
            display: flex;
            justify-content: center;
            gap: 10px;

            button {
                padding: 10px 20px;
                border-radius: 8px;
                border: 1px solid var(--b3-border-color);
            }

            .confirm-btn {
                &:hover {
                    background-color: var(--b3-theme-primary);
                    color: white;
                }
            }

            .cancel-btn {
                &:hover {
                    background-color: var(--b3-theme-error);
                    color: white;
                }
            }
        }

        .book-table {
            width: auto;
            border-collapse: collapse;
            margin: 10px 0;

            th,
            td {
                padding: 4px 8px;
                border: 1px solid #eee;
                text-align: left;
            }

            th {
                background-color: var(--b3-theme-background-light);
                font-weight: bold;
            }

            .book-row:hover {
                background-color: #f8f8f8;
            }
        }
    }
</style>
