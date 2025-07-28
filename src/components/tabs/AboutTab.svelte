<script lang="ts">
    import { I18N } from "siyuan";

    export let i18n: I18N;

    export const LINKS = {
        github: "https://github.com/Glaube-TY/siyuan-douban",
        feishu: "https://ttl8ygt82u.feishu.cn/wiki/VZdjwDNxWi4j0jkdyxMcOg2VnFf",
        notion: "https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82",
        author: "https://github.com/Glaube-TY",
        ld246: "https://ld246.com/member/GlaubeTY",
        douban: "https://book.douban.com/",
        weread: "https://weread.qq.com/",
        issues: "https://github.com/Glaube-TY/siyuan-douban/issues",
        tencent: "https://pd.qq.com/s/724c4lpoc"
    };
</script>

<div class="about">
    <div class="about-header">
        <h3>📚 {i18n.pluginName}</h3>
        <p class="motto">{i18n.pluginMotto}</p>
    </div>

    <div class="about-grid">
        <div class="about-card">
            <span class="icon">🌐</span>
            <div>
                <p class="label">{i18n.pluginHomepage}：</p>
                <a href={LINKS.github} class="link">siyuan-douban</a>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">📜</span>
            <div>
                <p class="label">{i18n.pluginTutorial}：</p>
                <a href={LINKS.feishu} class="link">{i18n.pluginTutorialLink}</a>
            </div>
        </div>

        <div class="about-card">
            <span class="icon">👨</span>
            <div>
                <p class="label">{i18n.pluginDeveloper}：Glaube-TY</p>
                <a href={LINKS.author} class="link">{i18n.pluginDeveloperLink}</a>
                <p><a href={LINKS.ld246} class="link">{i18n.pluginDeveloperLink2}</a></p>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">📊</span>
            <div>
                <p class="label">{i18n.pluginDataSource}：</p>
                <a href={LINKS.douban} class="link">{i18n.pluginDataSource1}</a>
                <p><a href={LINKS.weread} class="link">{i18n.pluginDataSource2}</a></p>
            </div>
        </div>

        <div class="about-card">
            <span class="icon">💖</span>
            <div>
                <p class="label">{i18n.pluginSupport}：</p>
                <a href={LINKS.feishu} class="link">{i18n.pluginSupport1}</a>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">⁉</span>
            <div>
                <p class="label">{i18n.pluginFeedback}：</p>
                <a href={LINKS.issues} class="link">{i18n.pluginFeedbackLink1}</a>
                <p><a href={LINKS.tencent} class="link">{i18n.pluginFeedbackLink2}</a></p>
            </div>
        </div>
    </div>

    <div class="about-footer">
        <p>{i18n.pluginFooter}</p>
    </div>
</div>