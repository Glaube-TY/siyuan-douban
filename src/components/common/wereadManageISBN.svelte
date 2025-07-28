<script lang="ts">
    export let plugin;

    export let customISBNBooks: Array<{
        title: string;
        customISBN: string;
        bookID: string;
    }>;
    export let onConfirm: () => void;
    export let onCancel: () => void;

    // 创建本地副本用于编辑
    let localBooks = [...customISBNBooks];

    // 删除记录
    const handleDelete = (bookID: string) => {
        localBooks = localBooks.filter((book) => book.bookID !== bookID);
    };
</script>

<div class="custom-ISBN-dialog">
    <table class="isbn-table">
        <thead>
            <tr>
                <th>{plugin.i18n.bookTitle1}</th>
                <th>{plugin.i18n.bookIsbn1}</th>
                <th>{plugin.i18n.operation}</th>
            </tr>
        </thead>
        <tbody>
            {#each localBooks as book (book.bookID)}
                <tr>
                    <td>{book.title}</td>
                    <td>
                        <input
                            type="text"
                            bind:value={book.customISBN}
                            placeholder={plugin.i18n.bookIsbnManual}
                        />
                    </td>
                    <td>
                        <button on:click={() => handleDelete(book.bookID)}
                            >{plugin.i18n.delete}</button
                        >
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    <div class="dialog-actions">
        <button
            on:click={() => {
                plugin.saveData("weread_customBooksISBN", localBooks);
                onConfirm();
            }}>{plugin.i18n.confirm}</button
        >

        <button on:click={onCancel}>{plugin.i18n.cancel}</button>
    </div>
</div>

<style lang="scss">
    .custom-ISBN-dialog {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        justify-content: center;

        .isbn-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem;

            th,
            td {
                padding: 8px;
                border: 1px solid var(--b3-border-color);
                text-align: left;
            }

            input {
                width: fit-content;
                padding: 4px;
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
    }
</style>
