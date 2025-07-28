<script lang="ts">
    import { onMount } from "svelte";
    import { I18N, showMessage, fetchPost } from "siyuan";
    import { sql } from "../api";
    import { fetchDoubanBook, fetchBookHtml } from "../utils/douban/book";
    import "./styles/main.scss";
    import { loadAVData } from "../utils/bookHandling";
    import SearchBookDialog from "./common/searchBookDialog.svelte";
    import TemplateEditorDialog from "./common/templateEditorDialog.svelte";
    import BookSearchTab from "./tabs/BookSearchTab.svelte";
    import UserSettingsTab from "./tabs/UserSettingsTab.svelte";
    import WereadTab from "./tabs/WereadTab.svelte";
    import AboutTab from "./tabs/AboutTab.svelte";

    export let i18n: I18N;
    export let plugin: any;

    let inputVales = "";
    let bookInfo: BookInfo | null = null;
    let statusMessage = "";
    let addNotes1 = true;

    let customRatings = [];
    let customCategories = [];
    let customReadingStatuses = [];
    let tempRatings = "";
    let tempCategories = "";
    let tempStatuses = "";

    let bookDatabassID = "";
    let databaseStatusMessage = "";
    let avID = "";

    let myRatingIndex = 0;
    let bookCategoryIndex = 0;
    let readingStatusIndex = 0;

    let showTemplateEditor = false;
    let noteTemplate = "";
    let originalTemplate = "";

    let showSearchDialog = false;
    let searchKeyword = "";
    let webviewRef: any;

    const tabs = [
        "🔍 " + i18n.topTabname1,
        "⚙️ " + i18n.topTabname2,
        "📗 " + i18n.topTabname3,
        "ℹ️ " + i18n.topTabname4,
    ];
    let activeTab = tabs[0];

    interface BookInfo {
        title: string;
        subtitle?: string;
        authors?: string[];
        translators?: string[];
        isbn: string;
        publisher?: string;
        publishDate?: string;
        pages?: string;
        price?: string;
        originalTitle?: string;
        binding?: string;
        series?: string;
        producer?: string;
        rating?: string;
        ratingCount?: string;
        cover?: string;
        myRating?: string;
        bookCategory?: string;
        readingStatus?: string;
        startDate?: string;
        finishDate?: string;
        addNotes?: boolean;
    }

    async function fetchBookData() {
        try {
            // 检查空值
            if (!inputVales) {
                throw new Error(i18n.Error4);
            }

            // 新增ISBN格式判断
            const isISBN = /^(97(8|9))?\d{9}(\d|X)$/.test(inputVales);

            if (isISBN) {
                // ISBN 模式：获取页面并解析
                statusMessage = i18n.statusMessage2;
                const html = await fetchBookHtml(inputVales);
                bookInfo = await fetchDoubanBook(html);
                statusMessage = i18n.statusMessage1;
                bookInfo.addNotes = addNotes1;
                inputVales = bookInfo.isbn;
            } else {
                // 书名搜索模式：打开搜索弹窗
                searchKeyword = encodeURIComponent(inputVales);
                showSearchDialog = true;
            }
        } catch (error) {
            statusMessage = error.message || i18n.statusMessage3;
            console.error("Book acquisition failed:", error);
        }
    }

    async function handleAddBook() {
        if (!bookInfo) return;

        const fullData = {
            ...bookInfo,
            ISBN: inputVales,
            databaseBlockId: bookDatabassID,
            myRating: customRatings[myRatingIndex],
            bookCategory: customCategories[bookCategoryIndex],
            readingStatus: customReadingStatuses[readingStatusIndex],
            startDate: bookInfo.startDate || "",
            finishDate: bookInfo.finishDate || "",
            publishDate: bookInfo.publishDate || "",
            addNotes: bookInfo.addNotes,
            noteTemplate: noteTemplate,
        };

        try {
            const result = await loadAVData(avID, fullData);
            if (result.code === 1) {
                showMessage(`${i18n.showMessage1} ${result.msg}`, 5000);
            } else if (result.code === 0) {
                showMessage(
                    `✅《${bookInfo.title}》${i18n.showMessage2}`,
                    3000,
                );
                await fetchPost("/api/ui/reloadAttributeView", { id: avID });
            }
        } catch (error) {
            showMessage(`${i18n.showMessage1} ${error.message}`, 5000);
        }
    }

    async function handleSaveSettings() {
        // 将临时变量转换为数组
        customRatings = tempRatings.split(/[，,]/).map((s) => s.trim());
        customCategories = tempCategories.split(/[，,]/).map((s) => s.trim());
        customReadingStatuses = tempStatuses
            .split(/[，,]/)
            .map((s) => s.trim());

        try {
            await plugin.saveData("settings.json", {
                ratings: customRatings,
                categories: customCategories,
                statuses: customReadingStatuses,
                addNotes: addNotes1,
                bookDatabaseID: bookDatabassID,
                noteTemplate: noteTemplate,
            });
            showMessage(i18n.showMessage5, 3000);
            await validateDatabaseID();
        } catch (error) {
            showMessage(`${i18n.showMessage6} ${error.message}`, 5000);
        }
    }

    // 验证数据库ID
    async function validateDatabaseID() {
        if (!bookDatabassID) {
            showMessage(i18n.showMessage3, 3000);
            return;
        }

        try {
            databaseStatusMessage = i18n.databaseStatusMessage1;
            const query = `SELECT * FROM blocks WHERE id = "${bookDatabassID}"`;
            const result = await sql(query);

            if (result.length === 0 || !result[0]?.markdown) {
                throw new Error(i18n.Error1);
            }

            const avDivMatch = result[0].markdown.match(/data-av-id="([^"]+)"/);
            if (!avDivMatch) {
                throw new Error(i18n.Error2);
            }

            avID = avDivMatch[1];
            databaseStatusMessage = i18n.databaseStatusMessage2;
        } catch (error) {
            showMessage(`${i18n.showMessage4} ${error.message}`, 5000);
            databaseStatusMessage = `${i18n.showMessage4} ${error.message}`;
            bookDatabassID = "";
            avID = "";
        }
    }

    onMount(() => {
        const savedISBN = localStorage.getItem("lastISBN");
        if (savedISBN) inputVales = savedISBN;

        plugin.loadData("settings.json").then(async (savedSettings) => {
            if (savedSettings) {
                noteTemplate = savedSettings.noteTemplate || ``;
                customRatings = savedSettings.ratings;
                customCategories = savedSettings.categories;
                customReadingStatuses = savedSettings.statuses;
                addNotes1 = savedSettings.addNotes ?? true;
                bookDatabassID = savedSettings.bookDatabaseID || "";

                tempRatings = customRatings.join(", ") || "";
                tempCategories = customCategories.join(", ") || "";
                tempStatuses = customReadingStatuses.join(", ") || "";

                if (bookDatabassID) {
                    await validateDatabaseID();
                }
            }
        });
    });
</script>

<div class="tab-container">
    <ul class="tab-nav">
        {#each tabs as tab}
            <button
                class:active={tab === activeTab}
                role="tab"
                tabindex="0"
                on:click={() => (activeTab = tab)}
                on:keydown={(e) => e.key === "Enter" && (activeTab = tab)}
            >
                {tab}
            </button>
        {/each}
    </ul>

    <!-- 内容区域 -->
    <div class="tab-content">
        <!-- 第一个标签页 - 书籍查询 -->
        {#if activeTab === tabs[0]}
            <BookSearchTab
                bind:inputVales
                bind:bookInfo
                bind:i18n
                {statusMessage}
                {customRatings}
                {customCategories}
                {customReadingStatuses}
                bind:myRatingIndex
                bind:bookCategoryIndex
                bind:readingStatusIndex
                on:fetchBookData={fetchBookData}
                on:addBook={handleAddBook}
            />

            <!-- 第二个标签页 - 用户设置 -->
        {:else if activeTab === tabs[1]}
            <UserSettingsTab
                bind:bookDatabassID
                bind:i18n
                bind:tempRatings
                bind:tempCategories
                bind:tempStatuses
                bind:addNotes1
                bind:noteTemplate
                {databaseStatusMessage}
                on:validate={validateDatabaseID}
                on:save={handleSaveSettings}
                on:openTemplate={() => {
                    originalTemplate = noteTemplate;
                    showTemplateEditor = true;
                }}
            />
            <!-- 第三个标签页 - 微信读书设置-->
        {:else if activeTab === tabs[2]}
            <WereadTab bind:plugin bind:i18n />

            <!-- 最后一个标签页 - 关于插件 -->
        {:else}
            <AboutTab bind:i18n />
        {/if}
    </div>
</div>

<SearchBookDialog
    bind:plugin
    bind:showSearchDialog
    bind:searchKeyword
    bind:webviewRef
    on:close={() => (showSearchDialog = false)}
    on:select={async ({ detail: html }) => {
        try {
            bookInfo = await fetchDoubanBook(html);
            statusMessage = i18n.statusMessage1;
            bookInfo.addNotes = addNotes1;
            inputVales = bookInfo.isbn;
            showMessage(`${i18n.showMessage7}《${bookInfo.title}》`, 3000);
        } catch (error) {
            showMessage(`${i18n.showMessage8} ${error.message}`, 5000);
            console.error("Book analysis failed:", error);
        }
    }}
/>

<TemplateEditorDialog
    bind:showTemplateEditor
    bind:noteTemplate
    bind:plugin
    on:close={() => {
        noteTemplate = originalTemplate;
        showTemplateEditor = false;
    }}
    on:save={async () => {
        try {
            const currentSettings =
                (await plugin.loadData("settings.json")) || {};
            currentSettings.noteTemplate = noteTemplate;
            await plugin.saveData("settings.json", currentSettings);
            originalTemplate = noteTemplate;
            showTemplateEditor = false;
            showMessage(i18n.showMessage9, 3000);
        } catch (error) {
            showMessage(`${i18n.showMessage10} ${error.message}`, 5000);
        }
    }}
/>
