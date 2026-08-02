const PERSONAL_SITE_BASE_URL = "https://glaube-ty.top";

const BASIC_USAGE_TUTORIAL = `${PERSONAL_SITE_BASE_URL}/tutorials/siyuan-reading-notes/basic-usage/`;
const TEMPLATE_TUTORIAL = `${PERSONAL_SITE_BASE_URL}/tutorials/siyuan-reading-notes/template-settings/`;
const WEREAD_TUTORIAL = `${PERSONAL_SITE_BASE_URL}/tutorials/siyuan-reading-notes/wechat-reading-sync/`;

export const READING_NOTES_LINKS = {
    website: `${PERSONAL_SITE_BASE_URL}/sites/siyuan-reading-notes/index.html`,
    tutorial: `${PERSONAL_SITE_BASE_URL}/tutorials/siyuan-reading-notes/`,
    basicUsageTutorial: BASIC_USAGE_TUTORIAL,
    databaseTutorial: `${BASIC_USAGE_TUTORIAL}#第一步连接书籍数据库`,
    bookPreferencesTutorial: `${BASIC_USAGE_TUTORIAL}#数据库字段怎样处理`,
    addBookTutorial: `${BASIC_USAGE_TUTORIAL}#第二步搜索并添加书籍`,
    shelfTutorial: `${BASIC_USAGE_TUTORIAL}#第四步使用书架和数据中心`,
    templateTutorial: TEMPLATE_TUTORIAL,
    localBookTemplateTutorial: `${TEMPLATE_TUTORIAL}#编辑书籍笔记模板`,
    wereadTutorial: WEREAD_TUTORIAL,
    wereadAuthTutorial: `${WEREAD_TUTORIAL}#第一步申请并验证-api-key`,
    wereadTemplateTutorial: `${WEREAD_TUTORIAL}#第二步设置同步模板`,
    wereadBookTemplateTutorial: `${WEREAD_TUTORIAL}#普通书籍完整模板`,
    wereadMpTemplateTutorial: `${WEREAD_TUTORIAL}#公众号完整模板`,
    wereadPositionTutorial: `${WEREAD_TUTORIAL}#第三步设置同步位置`,
    wereadSyncTutorial: `${WEREAD_TUTORIAL}#第四步开始同步`,
    wereadResultsTutorial: `${WEREAD_TUTORIAL}#查看同步结果`,
    changelog: `${PERSONAL_SITE_BASE_URL}/tutorials/siyuan-reading-notes/changelog/`,
    donate: `${PERSONAL_SITE_BASE_URL}/da-shang/`,
} as const;
