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
    export let isSYTemplateRender: boolean;
    export let databaseStatusMessage: string;
</script>

<div class="settings-panel">
    <div class="settings-section">
        <div class="settings-section-title">{i18n.bookDatabaseID}</div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.bookDatabaseID}</div>
                <div class="settings-item-desc">{i18n.bookDatabaseIDDesc}</div>
            </div>
            <div class="settings-item-control">
                <div class="settings-item-control-inner">
                    <input
                        type="text"
                        bind:value={bookDatabassID}
                        placeholder={i18n.bookDatabaseIDPlaceholder}
                    />
                    {#if databaseStatusMessage}
                        <div class="settings-item-status">{databaseStatusMessage}</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <div class="settings-section">
        <div class="settings-section-title">{i18n.preferenceSettings}</div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.ratingsLevels}</div>
                <div class="settings-item-desc">{i18n.ratingsLevelsDesc}</div>
            </div>
            <div class="settings-item-control">
                <input class="b3-text-field settings-input-wide" bind:value={tempRatings} />
            </div>
        </div>

        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.bookCategories}</div>
                <div class="settings-item-desc">{i18n.bookCategoriesDesc}</div>
            </div>
            <div class="settings-item-control">
                <input class="b3-text-field settings-input-wide" bind:value={tempCategories} />
            </div>
        </div>

        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.readingStatuses}</div>
                <div class="settings-item-desc">{i18n.readingStatusesDesc}</div>
            </div>
            <div class="settings-item-control">
                <input class="b3-text-field settings-input-wide" bind:value={tempStatuses} />
            </div>
        </div>
    </div>

    <div class="settings-section">
        <div class="settings-section-title">{i18n.templateSettings}</div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.toggleGenerateNotes}</div>
                <div class="settings-item-desc">{i18n.toggleGenerateNotesDesc}</div>
            </div>
            <div class="settings-item-control">
                <label class="settings-switch-label">
                    <input type="checkbox" class="settings-switch" bind:checked={addNotes1} />
                    <span class="settings-switch-track">
                        <span class="settings-switch-thumb"></span>
                    </span>
                </label>
            </div>
        </div>

        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.toggleSYTemplateRender}</div>
                <div class="settings-item-desc">{i18n.toggleSYTemplateRenderDesc}</div>
            </div>
            <div class="settings-item-control">
                <label class="settings-switch-label">
                    <input type="checkbox" class="settings-switch" bind:checked={isSYTemplateRender} />
                    <span class="settings-switch-track">
                        <span class="settings-switch-thumb"></span>
                    </span>
                </label>
            </div>
        </div>

        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">{i18n.setTemplate}</div>
                <div class="settings-item-desc">{i18n.setTemplateDesc}</div>
            </div>
            <div class="settings-item-control">
                <button class="b3-button" on:click={() => dispatch("openTemplate")}>
                    {i18n.setTemplate}
                </button>
            </div>
        </div>
    </div>

    <div class="settings-actions">
        <button class="b3-button b3-button--primary" on:click={() => dispatch("save")}>
            {i18n.saveSettings}
        </button>
    </div>
</div>
