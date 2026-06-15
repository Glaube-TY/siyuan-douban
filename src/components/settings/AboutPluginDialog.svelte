<script lang="ts">
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import AboutTab from "../tabs/AboutTab.svelte";

    export let i18n: any;
    export let close: () => void = () => {};
    export let onOpenLegacy: () => void = () => {};
</script>

<div class="settings-dialog settings-dialog-about">
    <header class="settings-dialog-header">
        <div class="settings-dialog-icon"><SiYuanIcon name="info" size={20} /></div>
        <div>
            <h2>关于插件</h2>
            <p>插件信息、教程、反馈渠道和参考项目。</p>
        </div>
    </header>
    <div class="settings-dialog-about-body">
        <div class="siyuan-douban-plugin settings-dialog-about-content">
            <AboutTab bind:i18n />
        </div>
    </div>
    <footer class="settings-dialog-actions">
        <button class="settings-dialog-legacy-link" on:click={() => { close(); onOpenLegacy(); }} title="仅用于兼容旧版设置页，日常请使用工作台功能">高级：兼容旧版设置页</button>
        <button class="b3-button b3-button--primary" on:click={close}>关闭</button>
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
    .settings-dialog-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); flex-shrink: 0; }
    .settings-dialog-legacy-link { background: none; border: none; color: var(--b3-theme-on-surface-light); font-size: 11px; cursor: pointer; padding: 4px 6px; border-radius: 4px; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; opacity: 0.6; }
    .settings-dialog-legacy-link:hover { opacity: 1; color: var(--b3-theme-on-background); }
</style>
