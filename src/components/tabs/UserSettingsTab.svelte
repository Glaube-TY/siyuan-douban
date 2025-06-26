<script lang="ts">
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let bookDatabassID: string;
    export let tempRatings: string;
    export let tempCategories: string;
    export let tempStatuses: string;
    export let addNotes1: boolean;
    export let databaseStatusMessage: string;
    export let noteTemplate: string;
</script>

<div class="settings">
    <h3>书籍数据库块ID</h3>
    <div class="form-row">
        <input
            type="text"
            bind:value={bookDatabassID}
            placeholder="请输入书籍数据库块ID"
        />
        {databaseStatusMessage}
    </div>

    <h3>偏好设置</h3>
    <div class="form-row custom-options">
        <label
            >评分等级（逗号分隔）：
            <input bind:value={tempRatings} />
        </label>
    </div>

    <div class="form-row custom-options">
        <label
            >书籍分类（逗号分隔）：
            <input bind:value={tempCategories} />
        </label>
    </div>

    <div class="form-row custom-options">
        <label
            >阅读状态（逗号分隔）：
            <input bind:value={tempStatuses} />
        </label>
    </div>

    <div class="form-row template">
        <label>
            <input type="checkbox" bind:checked={addNotes1} />
            默认生成读书笔记
        </label>
        <button class="b3-button" on:click={() => dispatch("openTemplate")}
            >📝 设置模板</button
        >
    </div>

    <div class="saveButton">
        <button on:click={() => dispatch("save")}>保存设置</button>
    </div>
</div>
