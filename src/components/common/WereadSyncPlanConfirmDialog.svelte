<script lang="ts">
  import type { WereadSyncPlanConfirmPayload } from "../../utils/weread/api/wereadSyncProgress";
  import { t } from "../../utils/i18n";

  export let plugin: any;
  export let payload: WereadSyncPlanConfirmPayload;
  export let onConfirm: () => void;
  export let onCancel: () => void;

  const MAX_DISPLAY_ITEMS = 30;
  const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

  $: modeLabel = payload.mode === "all" ? tx("planModeAll", "全部同步") : tx("planModeUpdate", "更新同步");
  $: sourceTypeLabel = payload.sourceType === "book" ? tx("planNormalBooks", "普通书籍") : tx("planMpAccounts", "公众号");
  $: displayItems = payload.plannedItems.slice(0, MAX_DISPLAY_ITEMS);
  $: remainingCount = Math.max(0, payload.plannedItems.length - MAX_DISPLAY_ITEMS);
  $: isAllMode = payload.mode === "all";
</script>

<div class="sync-plan-confirm">
  <div class="confirm-header">
    <p class="confirm-title">{tx("planTitle", "确认微信读书同步")}</p>
  </div>

  <div class="confirm-info">
    <div class="info-row">
      <span class="info-label">{tx("planMode", "同步模式：")}</span>
      <span class="info-value" class:all-mode={isAllMode}>{modeLabel}</span>
    </div>
    <div class="info-row">
      <span class="info-label">{tx("planSourceType", "来源类型：")}</span>
      <span class="info-value">{sourceTypeLabel}</span>
    </div>
    <div class="info-row">
      <span class="info-label">{tx("planWillSync", "本次将同步：")}</span>
      <span class="info-value highlight">{tx("planItemCount", "{count} 项", { count: payload.plannedItems.length })}</span>
    </div>
    {#if payload.skippedCount && payload.skippedCount > 0}
      <div class="info-row">
        <span class="info-label">{tx("planSkipped", "跳过：")}</span>
        <span class="info-value skipped">{tx("planSkippedCount", "{count} 项（无变化或未就绪）", { count: payload.skippedCount })}</span>
      </div>
    {/if}
  </div>

  {#if isAllMode}
    <div class="warning-banner">
      <span class="warning-icon">⚠</span>
      <span>{tx("planFullSyncWarning", "全部同步可能会重建较多内容，请确认后继续")}</span>
    </div>
  {/if}

  <div class="items-list">
    <div class="items-header">{tx("planItemsHeader", "本次将同步的{sourceType}：", { sourceType: sourceTypeLabel })}</div>
    <div class="items-scroll">
      {#each displayItems as item}
        <div class="item-row">
          <span class="item-title">{item.title || item.bookID}</span>
          {#if item.reason}
            <span class="item-reason">（{item.reason}）</span>
          {/if}
        </div>
      {/each}
      {#if remainingCount > 0}
        <div class="item-remaining">{tx("planRemaining", "还有 {count} 条...", { count: remainingCount })}</div>
      {/if}
    </div>
  </div>

  <div class="confirm-actions">
    <button class="b3-button b3-button--cancel" on:click={onCancel}>{t(plugin, "cancel", "取消")}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" on:click={onConfirm}>{tx("planConfirm", "确认同步")}</button>
  </div>
</div>

<style>
  .sync-plan-confirm {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
    max-height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }

  .confirm-header {
    text-align: center;
  }

  .confirm-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--b3-theme-on-background);
    margin: 0;
  }

  .confirm-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--b3-theme-surface);
    border-radius: 8px;
    border: 1px solid var(--b3-border-color);
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .info-label {
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
    min-width: 80px;
  }

  .info-value {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-background);
  }

  .info-value.all-mode {
    color: var(--b3-theme-primary);
  }

  .info-value.highlight {
    color: var(--b3-theme-primary);
    font-weight: 600;
  }

  .info-value.skipped {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .warning-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--b3-card-warning-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--b3-theme-on-background);
  }

  .warning-icon {
    font-size: 16px;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .items-header {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface-light);
  }

  .items-scroll {
    flex: 1;
    min-height: 80px;
    max-height: none;
    overflow-y: auto;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 8px;
    background: var(--b3-theme-surface);
  }

  .item-row {
    padding: 4px 0;
    font-size: 13px;
    color: var(--b3-theme-on-background);
    border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 50%, transparent);
  }

  .item-row:last-child {
    border-bottom: none;
  }

  .item-title {
    font-weight: 500;
  }

  .item-reason {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .item-remaining {
    padding: 4px 0;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
    font-style: italic;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
    border-top: 1px solid var(--b3-border-color);
  }

  @media (max-width: 600px) {
    .sync-plan-confirm {
      gap: 10px;
      padding:
        calc(10px + env(safe-area-inset-top))
        calc(10px + env(safe-area-inset-right))
        calc(10px + env(safe-area-inset-bottom))
        calc(10px + env(safe-area-inset-left));
    }

    .confirm-info {
      gap: 6px;
      padding: 10px;
    }

    .info-row {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    .warning-banner {
      align-items: flex-start;
      padding: 8px 10px;
    }

    .confirm-actions {
      gap: 8px;
    }

    .confirm-actions .fn__space {
      display: none;
    }

    .confirm-actions .b3-button {
      flex: 1;
      min-height: 40px;
    }
  }
</style>
