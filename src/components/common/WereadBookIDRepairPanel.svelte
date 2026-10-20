<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Dialog } from "siyuan";
    import { t } from "../../utils/i18n";
    import { inspectWereadBookIDRepairCandidates, repairWereadBookIDForExistingSource, type WereadBookIDRepairCandidate, type WereadBookIDRepairResult } from "../../utils/weread/api/wereadBookIDRepair";

    export let plugin: any;
    let loading = true;
    let writing = false;
    let alive = true;
    let error = "";
    let items: WereadBookIDRepairCandidate[] = [];
    let outcomes: Record<string, WereadBookIDRepairResult> = {};
    let confirmation: Dialog | null = null;
    const tx = (key: string, fallback: string, params = {}) => t(plugin, key, fallback, params);
    $: busy = writing || !!confirmation;
    $: eligibleCount = items.filter(item => item.status === "eligible" && !outcomes[item.bookID]).length;

    function statusText(status: string) {
        const labels = {
            eligible: tx("wereadRepairEligible", "缺少 bookID，可补全关联"),
            already_linked: tx("wereadRepairLinked", "身份已关联，无需补全"),
            conflict: tx("wereadRepairConflict", "身份冲突，已停止关联"),
            invalid_binding: tx("wereadRepairInvalidBinding", "笔记或数据库绑定异常"),
            insufficient_evidence: tx("wereadRepairInsufficient", "缺少唯一且可靠的身份证据"),
            read_error: tx("wereadRepairReadError", "检查失败，请重试"),
            success: tx("wereadRepairSuccess", "关联成功，bookID 已回读验证"),
        };
        return labels[status] || labels.read_error;
    }
    async function refresh() {
        if (writing || confirmation) return;
        loading = true; error = ""; outcomes = {};
        try {
            const result = await inspectWereadBookIDRepairCandidates(plugin);
            if (!alive) return;
            items = result.items;
            if (result.status !== "ok") error = `${statusText(result.status)} [${result.reasonCode}]`;
        } catch {
            if (alive) error = statusText("read_error");
        } finally { if (alive) loading = false; }
    }
    async function link(item: WereadBookIDRepairCandidate) {
        writing = true;
        try {
            const result = await repairWereadBookIDForExistingSource(plugin, item.bookID, item.snapshot);
            if (alive) outcomes = { ...outcomes, [item.bookID]: result };
        } catch {
            if (alive) outcomes = { ...outcomes, [item.bookID]: { status: "read_error", reasonCode: "CLAIM_RESULT_UNVERIFIED" } };
        } finally { if (alive) writing = false; }
    }
    function confirmLink(item: WereadBookIDRepairCandidate) {
        if (writing || confirmation || loading || item.status !== "eligible" || !item.snapshot || outcomes[item.bookID]) return;
        confirmation = new Dialog({
            title: tx("wereadRepairConfirmTitle", "确认补全 bookID 关联"),
            content: '<div class="b3-dialog__content"><p data-prompt class="ft__breakword"></p><p data-scope class="ft__breakword"></p></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" data-cancel></button><div class="fn__space"></div><button class="b3-button b3-button--text" data-confirm></button></div>',
            width: "min(520px, 92vw)",
            destroyCallback: () => { confirmation = null; },
        });
        const dialog = confirmation;
        dialog.element.querySelector("[data-prompt]").textContent = tx("wereadRepairConfirmSource", "将微信读书来源“{source}”关联至本地书籍“{local}”（ISBN：{isbn}）？", { source: item.sourceTitle, local: item.localTitle, isbn: item.isbn });
        dialog.element.querySelector("[data-scope]").textContent = tx("wereadRepairConfirmScope", "本次只补充 bookID，不会新建数据库行、重建读书笔记或修改现有笔记内容。无法唯一确认身份时将停止操作。");
        const cancel = dialog.element.querySelector<HTMLButtonElement>("[data-cancel]");
        const confirm = dialog.element.querySelector<HTMLButtonElement>("[data-confirm]");
        cancel.textContent = tx("wereadRepairCancel", "取消");
        confirm.textContent = tx("wereadRepairAction", "补全关联");
        cancel.onclick = () => dialog.destroy();
        confirm.onclick = () => {
            if (!alive || writing || confirmation !== dialog) return;
            confirm.disabled = true;
            dialog.destroy();
            void link(item);
        };
        cancel.focus();
    }
    onMount(refresh);
    onDestroy(() => { alive = false; confirmation?.destroy(); });
</script>

<section class="repair-panel" aria-label={tx("wereadRepairTab", "身份关联")} aria-busy={loading || writing}>
    <p>{tx("wereadRepairDescription", "检查已同步但缺少 bookID 关联的已有书籍；仅在确认后补充身份，不重新导入。")}</p>
    <div class="repair-toolbar">
        <span role="status" aria-live="polite">{loading ? tx("wereadRepairLoading", "正在检查身份证据…") : tx("wereadRepairCount", "可补全关联：{count} 本", { count: eligibleCount })}</span>
        <button type="button" class="b3-button b3-button--outline" disabled={loading || busy} on:click={refresh}>{tx("wereadRepairRefresh", "重新检查")}</button>
    </div>
    {#if error}
        <p role="alert">{error}</p>
    {:else if !loading}
        {#if eligibleCount === 0}
            <p role="status">{items.every(item => ["success", "already_linked"].includes(outcomes[item.bookID]?.status || item.status)) ? tx("wereadRepairEmpty", "没有需要补全的书籍关联") : tx("wereadRepairNoEligible", "没有可安全补全的关联，请检查以下状态。")}</p>
        {/if}
        <ul class="repair-list">
            {#each items as item (item.bookID)}
                {@const outcome = outcomes[item.bookID]}
                <li>
                    <dl>
                        <div><dt>{tx("wereadRepairSourceTitle", "微信读书来源")}</dt><dd>{item.sourceTitle}</dd></div>
                        <div><dt>{tx("wereadRepairLocalTitle", "本地书籍")}</dt><dd>{item.localTitle || "—"}</dd></div>
                        <div><dt>ISBN</dt><dd>{item.isbn || "—"}</dd></div>
                    </dl>
                    <p role="status" aria-live="polite">{statusText(outcome?.status || item.status)}</p>
                    {#if outcome && !["success", "already_linked"].includes(outcome.status)}
                        <p class="repair-detail">{tx("wereadRepairVerifyAgain", "未能确认关联结果；请重新检查状态，勿连续重试写入。")}{outcome.stage ? ` [${outcome.stage}/${outcome.reasonCode}]` : ` [${outcome.reasonCode}]`}</p>
                    {:else if !["eligible", "already_linked"].includes(item.status)}
                        <p class="repair-detail">{tx("wereadRepairBlocked", "此来源未通过安全检查，不允许补全。请核对 ISBN、历史归属和数据库绑定。")} [{item.reasonCode}]</p>
                    {/if}
                    {#if item.status === "eligible" && !outcome}
                        <button type="button" class="b3-button" disabled={busy} on:click={() => confirmLink(item)}>{writing ? tx("wereadRepairVerifying", "正在关联并验证…") : tx("wereadRepairAction", "补全关联")}</button>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</section>

<style>
    .repair-panel { color: var(--b3-theme-on-background); font-size: 13px; min-width: 0; }
    p { line-height: 1.6; overflow-wrap: anywhere; }
    .repair-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .repair-list { list-style: none; padding: 0; margin: 12px 0 0; }
    li { padding: 16px 0; border-top: 1px solid var(--b3-border-color); }
    dl { margin: 0; display: grid; gap: 8px; }
    dl div { display: grid; grid-template-columns: minmax(100px, 25%) minmax(0, 1fr); gap: 12px; }
    dt, .repair-detail { color: var(--b3-theme-on-surface-light); }
    dd { margin: 0; overflow-wrap: anywhere; }
    button { min-height: 36px; }
    button:focus-visible { outline: 2px solid var(--b3-theme-primary); outline-offset: 2px; }
    @media (max-width: 480px) { dl div { grid-template-columns: 1fr; gap: 4px; } button { min-height: 44px; } }
</style>
