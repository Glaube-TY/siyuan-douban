<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { svelteDialog } from "../../libs/dialog";
    import TemplateEditorDialog from "../common/templateEditorDialog.svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import { createWereadNotesTemplateDialog } from "../../utils/weread/wereadDialogs";
    import { loadTemplateSettings, saveTemplateSettings } from "../../utils/settings/templateSettingsService";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let i18n: any = {};
    export let close: () => void = () => {};
    export let onSaved: () => void = () => {};

    let addNotes = true;
    let isSYTemplateRender = false;
    let noteTemplate = "";
    let wereadTemplates = "";
    let wereadMpTemplates = "";
    let wereadPositionMark = "";
    let isLoading = true;
    let isSaving = false;
    const tx = (key: string, fallback: string) => t(plugin, key, fallback);

    onMount(async () => {
        const data = await loadTemplateSettings(plugin);
        addNotes = data.addNotes;
        isSYTemplateRender = data.isSYTemplateRender;
        noteTemplate = data.noteTemplate;
        wereadTemplates = data.wereadTemplates;
        wereadMpTemplates = data.wereadMpTemplates;
        wereadPositionMark = data.wereadPositionMark;
        isLoading = false;
    });

    function editNoteTemplate() {
        const dialog = svelteDialog({
            title: tx("settingsLocalBookTemplate", "书籍笔记模板"),
            width: "800px",
            height: "520px",
            constructor: (containerEl: HTMLElement) => new TemplateEditorDialog({
                target: containerEl,
                props: { plugin, noteTemplate },
            }),
        });
        dialog.component.$on("close", () => dialog.close());
        dialog.component.$on("save", (event: CustomEvent<string>) => {
            noteTemplate = event.detail;
            dialog.close();
        });
    }

    function editWereadTemplate(type: "book" | "mp") {
        const isBook = type === "book";
        const opener = createWereadNotesTemplateDialog(
            i18n,
            (value: string) => {
                if (isBook) {
                    wereadTemplates = value;
                } else {
                    wereadMpTemplates = value;
                }
            },
            isBook ? wereadTemplates : wereadMpTemplates,
            isBook ? tx("settingsWereadBookTemplate", "微信读书书籍模板") : tx("settingsWereadMpTemplate", "微信公众号模板"),
        );
        opener();
    }

    async function save() {
        isSaving = true;
        try {
            await saveTemplateSettings(plugin, {
                addNotes,
                isSYTemplateRender,
                noteTemplate,
                wereadTemplates,
                wereadMpTemplates,
                wereadPositionMark,
            });
            showMessage(tx("settingsTemplatesSaved", "模板设置已保存"));
            onSaved();
            close();
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="settings-dialog settings-dialog-template">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="template" size={20} /></div>
        <div>
            <h2>{tx("settingsTemplatesTitle", "模板设置")}</h2>
            <p>{tx("settingsTemplatesDesc", "维护本地书籍笔记、微信读书书籍和公众号模板。")}</p>
        </div>
    </header>

    {#if isLoading}
        <div class="settings-dialog-loading">{tx("uiLoading", "加载中...")}</div>
    {:else}
        <div class="settings-dialog-body">
            <label class="settings-dialog-switch-row">
                <span>
                    <strong>{tx("settingsGenerateNotes", "添加书籍时生成读书笔记")}</strong>
                    <em>{tx("settingsGenerateNotesDesc", "关闭后只添加书籍属性视图记录。")}</em>
                </span>
                <input type="checkbox" class="settings-switch" bind:checked={addNotes} />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>
            <label class="settings-dialog-switch-row">
                <span>
                    <strong>{tx("settingsSiyuanRender", "使用思源模板渲染")}</strong>
                    <em>{tx("settingsSiyuanRenderDesc", "保持旧模板渲染开关，不改变模板占位符。")}</em>
                </span>
                <input type="checkbox" class="settings-switch" bind:checked={isSYTemplateRender} />
                <span class="settings-switch-track"><span class="settings-switch-thumb"></span></span>
            </label>

            <div class="settings-dialog-template-grid">
                <button class="settings-dialog-template-card" on:click={editNoteTemplate}>
                    <SiYuanIcon name="book" size={18} />
                    <span>{tx("settingsLocalBookTemplate", "书籍笔记模板")}</span>
                    <em>{noteTemplate.trim() ? tx("uiConfigured", "已配置") : tx("uiNotConfigured", "未配置")}</em>
                </button>
                <button class="settings-dialog-template-card" on:click={() => editWereadTemplate("book")}>
                    <SiYuanIcon name="weread" pluginName={plugin.name} size={18} />
                    <span>{tx("settingsWereadBookTemplate", "微信读书书籍模板")}</span>
                    <em>{wereadTemplates.trim() ? tx("uiConfigured", "已配置") : tx("uiNotConfigured", "未配置")}</em>
                </button>
                <button class="settings-dialog-template-card" on:click={() => editWereadTemplate("mp")}>
                    <SiYuanIcon name="officialAccount" pluginName={plugin.name} size={18} />
                    <span>{tx("settingsWereadMpTemplate", "公众号模板")}</span>
                    <em>{wereadMpTemplates.trim() ? tx("uiConfigured", "已配置") : tx("uiNotConfigured", "未配置")}</em>
                </button>
            </div>

            <label class="settings-dialog-field">
                <span>{tx("settingsPositionMark", "同步位置标记")}</span>
                <input class="b3-text-field" bind:value={wereadPositionMark} />
            </label>
        </div>
    {/if}

    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--outline" on:click={close}>{t(plugin, "cancel", "取消")}</button>
        <button class="b3-button b3-button--primary" on:click={save} disabled={isSaving}>{tx("uiSave", "保存")}</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 16px; padding: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-header { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0; }
    .settings-dialog-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); }
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; }
    .settings-dialog-body { display: grid; gap: 14px; flex: 1; min-height: 0; overflow: auto; }
    .settings-dialog-field { display: grid; gap: 8px; font-size: 13px; font-weight: 600; }
    .settings-dialog-switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
    .settings-dialog-switch-row span:first-child { display: grid; gap: 3px; }
    .settings-dialog-switch-row strong { font-size: 13px; }
    .settings-dialog-switch-row em { color: var(--b3-theme-on-surface-light); font-size: 12px; font-style: normal; line-height: 1.4; }
    .settings-dialog-template-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .settings-dialog-template-card { display: grid; gap: 6px; justify-items: start; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; text-align: left; }
    .settings-dialog-template-card:hover { border-color: var(--b3-theme-primary); color: var(--b3-theme-primary); }
    .settings-dialog-template-card span { font-size: 13px; font-weight: 600; }
    .settings-dialog-template-card em { color: var(--b3-theme-on-surface-light); font-size: 12px; font-style: normal; }
    .settings-dialog-loading { padding: 32px; text-align: center; color: var(--b3-theme-on-surface-light); }
    .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
    @media (max-width: 720px) { .settings-dialog-template-grid { grid-template-columns: 1fr; } }
</style>
