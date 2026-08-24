<script lang="ts">
    import { I18N } from "siyuan";
    import { READING_NOTES_LINKS } from "@/utils/core/externalLinks";

    export let i18n: I18N;

    export const LINKS = {
        website: READING_NOTES_LINKS.website,
        github: "https://github.com/Glaube-TY/siyuan-douban",
        author: "https://github.com/Glaube-TY",
        ld246: "https://ld246.com/member/GlaubeTY",
        douban: "https://book.douban.com/",
        weread: "https://weread.qq.com/",
        issues: "https://github.com/Glaube-TY/siyuan-douban/issues",
        qqGroup: "https://qm.qq.com/q/uVcJ5zLyGQ",
        tutorial: READING_NOTES_LINKS.tutorial,
        donate: READING_NOTES_LINKS.donate,
    };
</script>

<div class="about">
    <div class="about-header">
        <h3>{i18n.pluginName}</h3>
        <p class="motto">{i18n.pluginMotto}</p>
    </div>

    <div class="about-grid">
        <div class="about-card">
            <div class="card-row">
                <span class="icon">🌐</span>
                <span class="label">{i18n.pluginHomepage}：</span>
                <a href={LINKS.website} class="link">{i18n.pluginWebsiteLink}</a>
                <span>/</span>
                <a href={LINKS.github} class="link">GitHub</a>
            </div>
            <div class="card-row">
                <span class="icon">📜</span>
                <span class="label">{i18n.pluginTutorial}：</span>
                <a href={LINKS.tutorial} class="link">{i18n.pluginTutorialLink}</a>
            </div>
        </div>

        <div class="about-card">
            <div class="card-row">
                <span class="icon">👨</span>
                <span class="label">{i18n.pluginDeveloper}：</span>
                <a href={LINKS.author} class="link">Glaube-TY</a>
            </div>
            <div class="card-row">
                <span class="icon">📊</span>
                <span class="label">{i18n.pluginDataSource}：</span>
                <a href={LINKS.douban} class="link">{i18n.pluginDataSource1}</a>
                <span>/</span>
                <a href={LINKS.weread} class="link">{i18n.pluginDataSource2}</a>
            </div>
        </div>

        <div class="about-card">
            <div class="card-row">
                <span class="icon">💖</span>
                <span class="label">{i18n.pluginSupport}：</span>
                <a href={LINKS.donate} class="link" target="_blank">{i18n.pluginSupport1}</a>
            </div>
            <div class="card-row">
                <span class="icon">⁉</span>
                <span class="label">{i18n.pluginFeedback}：</span>
                <a href={LINKS.issues} class="link">{i18n.pluginFeedbackLink1}</a>
                <span>/</span>
                <a href={LINKS.qqGroup} class="link" target="_blank" rel="noopener noreferrer">{i18n.pluginFeedbackLink2}</a>
            </div>
        </div>
    </div>

    <div class="about-footer">
        <p>{i18n.pluginFooter}</p>
    </div>
</div>
