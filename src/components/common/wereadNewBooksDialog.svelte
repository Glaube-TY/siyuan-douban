<script lang="ts">
    import { I18N } from "siyuan";

    export let i18n: I18N;

    export let books: Array<{
        title: string;
        isbn: string;
        bookID: string;
    }>;
    export let onConfirm: (
        selectedBooks: Array<{ title: string; isbn: string; bookID: string }>,
        ignoredBooks: Array<{ title: string; isbn: string; bookID: string }>,
    ) => void;
    export let onContinue: (
        ignoredBooks: Array<{ title: string; isbn: string; bookID: string }>,
    ) => void;
    export let onCancel: () => void;

    let originalISBNs = new Map(books.map((book) => [book.bookID, book.isbn]));
    let selectedBooks = [];
    let ignoredBooks = [];

    const isValidISBN = (isbn: string) => {
        const cleaned = isbn.replace(/[-\s]/g, "");
        return cleaned.length === 13 || cleaned.length === 10;
    };

    $: allSelected =
        books.length > 0 &&
        books.every((book) => selectedBooks.some((b) => b.isbn === book.isbn));

    function toggleAllBooks() {
        if (allSelected) {
            selectedBooks = [];
        } else {
            selectedBooks = [...books];
        }
    }

    function toggleBook(book) {
        const index = selectedBooks.findIndex((b) => b.isbn === book.isbn);
        if (index > -1) {
            selectedBooks.splice(index, 1);
        } else {
            selectedBooks.push(book);
        }
    }

    function toggleIgnore(book) {
        const index = ignoredBooks.findIndex((b) => b.isbn === book.isbn);
        if (index > -1) {
            ignoredBooks.splice(index, 1);
        } else {
            ignoredBooks.push(book);
        }
    }
</script>

<div class="notebooks-dialog">
    <div class="confirm-btn-container">
        <button
            class="confirm-btn"
            on:click={() => onConfirm(selectedBooks, ignoredBooks)}
            >{i18n.confirmSelect}</button
        >
        <button class="continue-btn" on:click={() => onContinue(ignoredBooks)}
            >{i18n.continueSync}</button
        >
        <button class="cancel-btn" on:click={() => onCancel()}>取消同步</button>
    </div>
    <p style="text-align: center;">
        {i18n.selectBooksTip}
    </p>
    <table class="book-table">
        <thead>
            <tr>
                <th>
                    <input
                        type="checkbox"
                        title={i18n.selectAll}
                        on:change={toggleAllBooks}
                        checked={allSelected}
                    />
                    {i18n.select}
                </th>
                <th class="book-title">{i18n.bookTitle1}</th>
                <th class="book-isbn">{i18n.bookIsbn1}</th>
                <th class="ignore-column">{i18n.ignore}</th>
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
                            disabled={!isValidISBN(book.isbn)}
                        />
                    </td>
                    <td>{book.title}</td>
                    <td>
                        <input
                            type="text"
                            bind:value={book.isbn}
                            class="isbn-input"
                            disabled={originalISBNs.get(book.bookID) !== ""}
                            placeholder={originalISBNs.get(book.bookID)
                                ? i18n.bookIsbnExist
                                : book.isbn
                                  ? isValidISBN(book.isbn)
                                      ? i18n.bookIsbnValid
                                      : i18n.bookIsbnInvalid
                                  : i18n.bookIsbnManual}
                            class:invalid={!isValidISBN(book.isbn) &&
                                book.isbn !== ""}
                        />
                    </td>
                    <td class="ignore-checkbox">
                        <input
                            type="checkbox"
                            on:change={() => toggleIgnore(book)}
                            checked={ignoredBooks.some(
                                (b) => b.isbn === book.isbn,
                            )}
                        />
                    </td>
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

            input[type="checkbox"]:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                filter: grayscale(50%);
            }

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

            .isbn-input {
                width: 100%;
                padding: 2px 4px;
                border: none;
                background: transparent;
                &:focus {
                    outline: 1px solid var(--b3-theme-primary);
                }
                &:invalid {
                    outline: 1px solid var(--b3-theme-error);
                    background-color: #ffe6e6;
                }
            }

            .ignore-column {
                width: 60px;
            }
            .ignore-checkbox {
                text-align: center;
                input[type="checkbox"] {
                    margin: 0;
                    transform: scale(1.2);
                }
            }
        }
    }
</style>
