<script lang="ts">
    import type { I18N } from "siyuan";
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let i18n: I18N;
    export let bookDatabassID: string;
    export let tempRatings: string;
    export let tempCategories: string;
    export let tempStatuses: string;
    export let addNotes1: boolean;
    export let databaseStatusMessage: string;
    export let noteTemplate: string;
</script>

<div class="settings">
    <h3>{i18n.bookDatabaseID}</h3>
    <div class="form-row">
        <input
            type="text"
            bind:value={bookDatabassID}
            placeholder={i18n.bookDatabaseIDPlaceholder}
        />
        {databaseStatusMessage}
    </div>

    <h3>{i18n.preferenceSettings}</h3>
    <div class="form-row custom-options">
        <label
            >{i18n.ratingsLevels}
            <input bind:value={tempRatings} />
        </label>
    </div>

    <div class="form-row custom-options">
        <label
            >{i18n.bookCategories}
            <input bind:value={tempCategories} />
        </label>
    </div>

    <div class="form-row custom-options">
        <label
            >{i18n.readingStatuses}
            <input bind:value={tempStatuses} />
        </label>
    </div>

    <div class="form-row template">
        <label>
            <input type="checkbox" bind:checked={addNotes1} />
            {i18n.defaultGenerateNotes}
        </label>
        <button class="b3-button" on:click={() => dispatch("openTemplate")}
            >📝 {i18n.setTemplate}</button
        >
    </div>

    <div class="saveButton">
        <button on:click={() => dispatch("save")}>{i18n.saveSettings}</button>
    </div>
</div>
