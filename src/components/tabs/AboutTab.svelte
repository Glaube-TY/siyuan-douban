<script lang="ts">
    export const LINKS = {
        github: "https://github.com/Glaube-TY/siyuan-douban",
        feishu: "https://ttl8ygt82u.feishu.cn/wiki/VZdjwDNxWi4j0jkdyxMcOg2VnFf",
        notion: "https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82",
        author: "https://github.com/Glaube-TY",
        ld246: "https://ld246.com/member/GlaubeTY",
        douban: "https://book.douban.com/",
        issues: "https://github.com/Glaube-TY/siyuan-douban/issues",
        tencent: "https://pd.qq.com/s/724c4lpoc"
    };
</script>

<div class="about">
    <div class="about-header">
        <h3>📚 豆瓣书籍插件</h3>
        <p class="motto">让阅读管理更优雅</p>
    </div>

    <div class="about-grid">
        <div class="about-card">
            <span class="icon">🌐</span>
            <div>
                <p class="label">插件主页：</p>
                <a href={LINKS.github} class="link">siyuan-douban</a>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">📜</span>
            <div>
                <p class="label">插件教程：</p>
                <a href={LINKS.feishu} class="link">飞书文档（主要）</a>
                <p><a href={LINKS.notion} class="link">Notion（辅助）</a></p>
            </div>
        </div>

        <div class="about-card">
            <span class="icon">👨</span>
            <div>
                <p class="label">开发者：Glaube-TY</p>
                <a href={LINKS.author} class="link">Github 主页</a>
                <p><a href={LINKS.ld246} class="link">链滴主页</a></p>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">📊</span>
            <div>
                <p class="label">数据来源：</p>
                <a href={LINKS.douban} class="link">豆瓣读书</a>
            </div>
        </div>

        <div class="about-card">
            <span class="icon">💖</span>
            <div>
                <p class="label">支持开发者：</p>
                <a href={LINKS.feishu} class="link">🌹 请作者喝咖啡</a>
            </div>
            <span class="icon">&nbsp;&nbsp;&nbsp;</span>
            <span class="icon">⁉</span>
            <div>
                <p class="label">反馈&建议：</p>
                <a href={LINKS.issues} class="link">Github Issues</a>
                <p><a href={LINKS.tencent} class="link">腾讯频道</a></p>
            </div>
        </div>
    </div>

    <div class="about-footer">
        <p>❤ 由一位热爱阅读的开发者制作，希望为你带来更好的知识管理体验</p>
    </div>
</div>