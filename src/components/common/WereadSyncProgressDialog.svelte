<script lang="ts">
  import { tick } from "svelte";
  import {
    createWereadSyncProgressViewState,
    reduceWereadSyncProgressViewState,
    type WereadSyncProgressEvent,
    type WereadSyncStage,
  } from "../../utils/weread/api/wereadSyncProgress";

  export let onClose: () => void;

  let events: WereadSyncProgressEvent[] = [];
  let currentMessage = "";
  let isFinished = false;
  let summaryMessage = "";
  let finalStatus: "success" | "failed" | "cancelled" | "" = "";
  let progressView = createWereadSyncProgressViewState();
  let eventsScroll: HTMLDivElement;

  // 汇总统计
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let plannedCount = 0;
  let plannedBySource = { book: 0, mp: 0 };

  export function addEvent(event: WereadSyncProgressEvent) {
    const loggedEvent = { ...event, timestamp: event.timestamp || Date.now() };
    events = [...events, loggedEvent];
    progressView = reduceWereadSyncProgressViewState(progressView, loggedEvent);

    void tick().then(() => {
      if (eventsScroll) eventsScroll.scrollTop = eventsScroll.scrollHeight;
    });

    if (event.sourceType && event.total !== undefined) {
      plannedBySource = {
        ...plannedBySource,
        [event.sourceType]: Math.max(plannedBySource[event.sourceType], event.total),
      };
      plannedCount = plannedBySource.book + plannedBySource.mp;
    }

    if (event.stage === "cancelled") {
      // 取消事件直接结束
      isFinished = true;
      summaryMessage = event.message;
      finalStatus = "cancelled";
    } else if (event.stage === "finished" && !event.sourceType) {
      // 只有 sourceType 为空的 finished 才是最终完成
      isFinished = true;
      summaryMessage = event.message;
      if (event.total !== undefined) {
        plannedCount = event.total;
      }
      finalStatus = event.status === "failed" ? "failed" : "success";
    } else if (event.stage === "finished" && event.sourceType) {
      // sourceType 级别的 finished 只作为普通日志追加
      currentMessage = event.message;
    } else {
      currentMessage = event.message;
      if (event.stage === "item_success") {
        successCount++;
        plannedCount = Math.max(plannedCount, successCount + failedCount);
      }
      if (event.stage === "item_failed") {
        failedCount++;
        plannedCount = Math.max(plannedCount, successCount + failedCount);
      }
      if (event.stage === "item_skipped") {
        skippedCount++;
      }
    }
  }

  function getStageLabel(stage: WereadSyncStage): string {
    switch (stage) {
      case "checking_sources": return "检查来源";
      case "planning": return "计划中";
      case "confirming": return "确认中";
      case "preparing": return "准备中";
      case "writing": return "写入中";
      case "item_success": return "成功";
      case "item_failed": return "失败";
      case "item_skipped": return "跳过";
      case "finished": return "完成";
      case "cancelled": return "取消";
      default: return stage;
    }
  }

  function getStageClass(stage: WereadSyncStage): string {
    switch (stage) {
      case "item_success": return "success";
      case "item_failed": return "failed";
      case "item_skipped": return "skipped";
      case "finished": return "finished";
      case "cancelled": return "cancelled";
      default: return "running";
    }
  }

  function getProgressPercent(): number {
    if (isFinished && finalStatus !== "cancelled") return 100;
    return progressView.percent;
  }

  function handleClose() {
    onClose();
  }
</script>

<div class="sync-progress">
  <div class="progress-header">
    <p class="progress-title">微信读书同步进度</p>
    <div class="progress-bar-container">
      <div
        class="progress-bar"
        class:progress-bar-indeterminate={!progressView.determinate && !isFinished}
        style:width={progressView.determinate || isFinished ? `${getProgressPercent()}%` : undefined}
      ></div>
    </div>
    <p class="progress-percent">
      {#if !progressView.determinate && !isFinished}
        {progressView.label}
      {:else}
        {getProgressPercent()}%
      {/if}
    </p>
  </div>

  {#if currentMessage && !isFinished}
    <div class="current-status">
      <span class="status-icon">⏳</span>
      <span class="status-text">{currentMessage}</span>
    </div>
  {/if}

  {#if isFinished}
    <div class="summary">
      <div class="summary-title">
        {#if finalStatus === "cancelled"}
          同步已取消
        {:else if finalStatus === "failed"}
          同步失败
        {:else}
          同步完成
        {/if}
      </div>
      <div class="summary-stats">
        <div class="stat-item success">
          <span class="stat-label">成功</span>
          <span class="stat-value">{successCount}</span>
        </div>
        <div class="stat-item failed">
          <span class="stat-label">失败</span>
          <span class="stat-value">{failedCount}</span>
        </div>
        <div class="stat-item skipped">
          <span class="stat-label">跳过</span>
          <span class="stat-value">{skippedCount}</span>
        </div>
        <div class="stat-item planned">
          <span class="stat-label">计划</span>
          <span class="stat-value">{plannedCount}</span>
        </div>
      </div>
      {#if summaryMessage}
        <div class="summary-message">{summaryMessage}</div>
      {/if}
    </div>
  {/if}

  <div class="events-list">
    <div class="events-header">同步详情：</div>
    <div class="events-scroll" bind:this={eventsScroll}>
      {#each events as event}
        <div class="event-row {getStageClass(event.stage)}">
          <span class="event-time">{new Date(event.timestamp || 0).toLocaleTimeString([], { hour12: false })}</span>
          <span class="event-stage">{getStageLabel(event.stage)}</span>
          {#if event.sourceType}
            <span class="event-source">[{event.sourceType === "book" ? "书" : "公"}]</span>
          {/if}
          {#if event.title}
            <span class="event-title">{event.title}</span>
          {/if}
          <span class="event-message">{event.message}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="progress-actions">
    <button class="b3-button" on:click={handleClose}>
      {isFinished ? "关闭" : "隐藏"}
    </button>
  </div>
</div>

<style>
  .sync-progress {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 70vh;
    overflow: hidden;
  }

  .progress-header {
    text-align: center;
  }

  .progress-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--b3-theme-on-background);
    margin: 0 0 12px 0;
  }

  .progress-bar-container {
    width: 100%;
    height: 8px;
    background: var(--b3-theme-surface);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--b3-border-color);
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--b3-theme-primary), var(--b3-theme-primary-light));
    transition: width 0.3s ease;
  }

  .progress-bar-indeterminate {
    width: 32%;
    animation: progress-indeterminate 1.2s ease-in-out infinite;
  }

  @keyframes progress-indeterminate {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(320%); }
  }

  .progress-percent {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    margin: 8px 0 0 0;
  }

  .current-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    border-radius: 8px;
    font-size: 13px;
    color: var(--b3-theme-on-background);
  }

  .status-icon {
    font-size: 16px;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--b3-theme-surface);
    border-radius: 8px;
    border: 1px solid var(--b3-border-color);
  }

  .summary-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--b3-theme-on-background);
    text-align: center;
  }

  .summary-stats {
    display: flex;
    justify-content: center;
    gap: 24px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
  }

  .stat-item.success .stat-value {
    color: var(--b3-theme-success);
  }

  .stat-item.failed .stat-value {
    color: var(--b3-theme-error);
  }

  .stat-item.skipped .stat-value {
    color: var(--b3-theme-on-surface-light);
  }

  .stat-item.planned .stat-value {
    color: var(--b3-theme-primary);
  }

  .summary-message {
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .events-header {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface-light);
  }

  .events-scroll {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 8px;
    background: var(--b3-theme-surface);
    font-size: 12px;
  }

  .event-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 50%, transparent);
  }

  .event-row:last-child {
    border-bottom: none;
  }

  .event-stage {
    font-weight: 600;
    min-width: 40px;
  }

  .event-time {
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface-light);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
  }

  .event-row.success .event-stage {
    color: var(--b3-theme-success);
  }

  .event-row.failed .event-stage {
    color: var(--b3-theme-error);
  }

  .event-row.skipped .event-stage {
    color: var(--b3-theme-on-surface-light);
  }

  .event-row.running .event-stage {
    color: var(--b3-theme-primary);
  }

  .event-row.finished .event-stage {
    color: var(--b3-theme-primary);
  }

  .event-row.cancelled .event-stage {
    color: var(--b3-theme-on-surface-light);
  }

  .event-source {
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
    min-width: 20px;
  }

  .event-title {
    font-weight: 500;
    color: var(--b3-theme-on-background);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-message {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--b3-theme-on-surface-light);
  }

  .progress-actions {
    display: flex;
    justify-content: center;
    padding-top: 8px;
    border-top: 1px solid var(--b3-border-color);
  }
</style>
