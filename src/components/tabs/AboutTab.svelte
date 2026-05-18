<script lang="ts">
    import { I18N } from "siyuan";

    export let i18n: I18N;

    export const LINKS = {
        github: "https://github.com/Glaube-TY/siyuan-douban",
        notion: "https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82",
        author: "https://github.com/Glaube-TY",
        ld246: "https://ld246.com/member/GlaubeTY",
        douban: "https://book.douban.com/",
        weread: "https://weread.qq.com/",
        issues: "https://github.com/Glaube-TY/siyuan-douban/issues",
        tencent: "https://pd.qq.com/s/724c4lpoc",
        myblog: "https://blog.glaube-ty.top/du-shu-bi-ji-cha-jian",
        donate: "https://blog.glaube-ty.top/da-shang"
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
                <a href={LINKS.github} class="link">siyuan-douban</a>
            </div>
            <div class="card-row">
                <span class="icon">📜</span>
                <span class="label">{i18n.pluginTutorial}：</span>
                <a href={LINKS.myblog} class="link">{i18n.pluginTutorialLink}</a>
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
                <a href={LINKS.tencent} class="link">{i18n.pluginFeedbackLink2}</a>
            </div>
        </div>
    </div>

    <div class="about-footer">
        <p>{i18n.pluginFooter}</p>
    </div>
</div>