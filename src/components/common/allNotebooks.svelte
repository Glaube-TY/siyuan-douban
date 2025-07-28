<script lang="ts">
    export let plugin: any;
    export let books: Array<{
        title: string;
        author: string;
        categories: string[];
        noteCount: number;
        reviewCount: number;
        cover: string;
        publishTime: string;
        price: number;
        format: string;
        isbn: string;
        publisher: string;
        totalWords: number;
        star: number;
        ratingCount: number;
        AISummary: string;
        intro: string;
    }>;
</script>

<div class="notebooks-dialog">
    <table class="book-table">
        <thead>
            <tr>
                <th>{plugin.i18n.cover1}</th>
                <th>{plugin.i18n.title1}</th>
                <th>{plugin.i18n.author1}</th>
                <th>{plugin.i18n.publisher1}</th>
                <th>{plugin.i18n.publishTime1}</th>
                <th>{plugin.i18n.isbn1}</th>
                <th>{plugin.i18n.price1}</th>
                <th>{plugin.i18n.totalWords1}</th>
                <th>{plugin.i18n.star1}</th>
                <th>{plugin.i18n.noteCount1}</th>
                <th>{plugin.i18n.reviewCount1}</th>
            </tr>
        </thead>
        <tbody>
            {#each books as book}
                <tr class="book-row">
                    <td
                        ><img
                            src={book.cover}
                            class="book-cover"
                            alt={plugin.i18n.cover1}
                        /></td
                    >
                    <td>{book.title}</td>
                    <td>{book.author}</td>
                    <td>{book.publisher}</td>
                    <td>{book.publishTime?.split(" ")[0]}</td>
                    <td>{book.isbn}</td>
                    <td class="number-cell">¥{book.price}</td>
                    <td class="number-cell">{book.totalWords}</td>
                    <td class="number-cell">{book.star/10}</td>
                    <td class="number-cell">{book.noteCount}</td>
                    <td class="number-cell">{book.reviewCount}</td>
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

        .book-table {
            min-width: 800px;
            width: auto;
            border-collapse: collapse;
            margin: 10px 0;

            .book-cover {
                width: 40px;
                height: 60px;
                border-radius: 3px;
                object-fit: cover;
            }

            th,
            td {
                padding: 4px 8px;
                border: 1px solid #eee;
                text-align: left;
                max-width: 100px;
            }

            th {
                background-color: var(--b3-theme-background-light);
                font-weight: bold;
            }

            .number-cell {
                font-family: monospace;
            }

            .book-row:hover {
                background-color: #f8f8f8;
            }
        }
    }
</style>
