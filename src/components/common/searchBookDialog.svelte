<script lang="ts">
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let plugin: any;
    export let showSearchDialog: boolean;
    export let searchKeyword: string;
    export let webviewRef: any;
</script>

{#if showSearchDialog}
    <div class="b3-dialog-container" style="z-index: 9999;">
        <div
            class="b3-dialog-scrim"
            role="button"
            tabindex="0"
            on:click|self={() => dispatch("close")}
            on:keydown={(e) =>
                (e.key === "Enter" || e.key === " ") && dispatch("close")}
        ></div>
        <div class="b3-dialog-card" style="width: 90vw; max-width: 1200px;">
            <div class="b3-dialog__header">
                <div
                    style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
                >
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>🔍</span>
                        <p class="b3-dialog__title">
                            {plugin.i18n.searchBook} - 《{decodeURIComponent(
                                searchKeyword,
                            )}》
                        </p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>⚠</span>
                        <p class="b3-dialog__title">
                            {plugin.i18n.searchBookLoading}
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button
                            class="b3-button dialog-btn"
                            on:click={async () => {
                                try {
                                    const html =
                                        await webviewRef.executeJavaScript(
                                            "document.documentElement.outerHTML;",
                                            { userGesture: true },
                                        );
                                    dispatch("select", html);
                                    dispatch("close");
                                } catch (error) {
                                    console.error(
                                        "Page content failed to obtain:",
                                        error,
                                    );
                                }
                            }}>{plugin.i18n.confirm}</button
                        >
                        <button
                            class="b3-button dialog-btn b3-button--primary"
                            on:click={() => {
                                dispatch("browserWindowSearch");
                            }}>🔄 {plugin.i18n.refreshSearch || "重新搜索"}</button
                        >

                        <button
                            class="b3-button dialog-btn"
                            on:click={() => dispatch("close")}
                            >{plugin.i18n.cancel}</button
                        >
                    </div>
                </div>
            </div>
            <div class="b3-dialog__body" style="height: 80vh; padding: 0;">
                <webview
                    bind:this={webviewRef}
                    src={`https://search.douban.com/book/subject_search?search_text=${searchKeyword}&cat=1001`}
                    style="width: 100%; height: 100%; border: none;"
                    webpreferences="javascript=yes"
                    nodeintegration
                    disablewebsecurity
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
                    httpreferrer="https://www.douban.com/"
                ></webview>
            </div>
        </div>
    </div>
{/if}
