<script lang="ts">
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import AboutTab from "../tabs/AboutTab.svelte";
    import { t } from "../../utils/i18n";

    export let i18n: any;
    export let close: () => void = () => {};
    const tx = (key: string, fallback: string) => t(i18n, key, fallback);
</script>

<div class="settings-dialog settings-dialog-about">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="info" size={20} /></div>
        <div>
            <h2>{tx("settingsAboutTitle", "关于插件")}</h2>
            <p>{tx("settingsAboutDesc", "插件信息、教程、反馈渠道和参考项目。")}</p>
        </div>
    </header>
    <div class="settings-dialog-about-body">
        <div class="siyuan-douban-plugin settings-dialog-about-content">
            <AboutTab bind:i18n />
        </div>
    </div>
    <footer class="settings-dialog-actions">
        <button class="b3-button b3-button--primary" on:click={close}>{tx("uiClose", "关闭")}</button>
    </footer>
</div>

<style>
    .settings-dialog { display: flex; flex-direction: column; gap: 16px; padding: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); width: 100%; height: 100%; box-sizing: border-box; overflow: auto; min-width: 0; }
    .settings-dialog-header { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0; }
    .settings-dialog-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); }
    h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 1.5; }
    .settings-dialog-about-body { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
    .settings-dialog-about-body > .settings-dialog-about-content { display: block; width: 100%; height: 100%; min-height: 0; }
    .settings-dialog-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
</style>
