<script lang="ts">
  import { t } from "../../utils/i18n";

  export let plugin: any;
  export let onContinue: () => void;
  export let onWait: () => void;

  const tx = (key: string, fallback: string) => t(plugin, key, fallback);
</script>

<div class="manual-sync-mode-dialog">
  <div class="manual-sync-mode-content">
    <p id="weread-manual-sync-mode-description">
      {tx(
        "wereadAutoSyncManualModeDesc",
        "当前思源不会在启动时自动同步云端数据。如果其他设备存在尚未同步到本机的新数据，此时直接执行读书笔记自动同步可能产生数据冲突。是否仍继续本次自动同步？",
      )}
    </p>
    <p class="manual-sync-mode-safe-tip">
      {tx("wereadAutoSyncManualModeSafeTip", "如需最安全的方式，请选择等待思源同步，并手动完成一次思源数据同步。")}
    </p>
  </div>

  <div class="manual-sync-mode-actions">
    <button type="button" class="b3-button b3-button--cancel" on:click={onWait}>
      {tx("wereadAutoSyncManualModeWait", "等待思源同步")}
    </button>
    <button type="button" class="b3-button b3-button--primary" on:click={onContinue}>
      {tx("wereadAutoSyncManualModeContinue", "仍然继续自动同步")}
    </button>
  </div>
</div>

<style>
  .manual-sync-mode-dialog {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    padding: 18px;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    overflow: auto;
  }

  .manual-sync-mode-content {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }

  p {
    margin: 0;
    color: var(--b3-theme-on-background);
    font-size: 13px;
    line-height: 1.6;
  }

  .manual-sync-mode-safe-tip {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .manual-sync-mode-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--b3-border-color);
  }

  @media (max-width: 600px) {
    .manual-sync-mode-dialog {
      gap: 12px;
      padding:
        calc(12px + env(safe-area-inset-top))
        calc(12px + env(safe-area-inset-right))
        calc(12px + env(safe-area-inset-bottom))
        calc(12px + env(safe-area-inset-left));
    }

    .manual-sync-mode-actions {
      flex-direction: column;
    }

    .manual-sync-mode-actions .b3-button {
      width: 100%;
      min-height: 40px;
    }
  }
</style>
