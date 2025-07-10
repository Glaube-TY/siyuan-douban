<script lang="ts">
    export let plugin;
    export let ignoredBooks: Array<{
        title: string;
        isbn: string;
        bookID: string;
    }>;
    export let onConfirm: () => void;
    export let onCancel: () => void;

    // 创建本地副本用于操作
    let localIgnoredBooks = [...ignoredBooks];

    // 删除记录
    const handleDelete = (bookID: string) => {
        localIgnoredBooks = localIgnoredBooks.filter(
            (book) => book.bookID !== bookID,
        );
    };
</script>

<div class="ignored-books-dialog">
    <table class="ignored-table">
        <thead>
            <tr>
                <th>书名</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody>
            {#each localIgnoredBooks as book (book.bookID)}
                <tr>
                    <td>{book.title}</td>
                    <td>
                        <button on:click={() => handleDelete(book.bookID)}
                            >删除</button
                        >
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    <div class="dialog-actions">
        <button
            on:click={() => {
                // 保存修改后的数据
                plugin.saveData("weread_ignoredBooks", localIgnoredBooks);
                onConfirm();
            }}>确认修改</button
        >

        <button on:click={onCancel}>取消</button>
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

        .ignored-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;

            th,
            td {
                padding: 8px;
                border: 1px solid #ddd;
                text-align: left;
            }

            button {
                padding: 10px 20px;
                border-radius: 8px;
                border: 1px solid var(--b3-border-color);

                &:hover {
                    background-color: red;
                    color: white;
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
