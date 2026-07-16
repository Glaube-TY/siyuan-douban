export type I18nParams = Record<string, string | number>;

type I18nSource = unknown;

function getDictionary(source: I18nSource): Record<string, unknown> {
    if (!source || typeof source !== "object") return {};
    const dictionary = source as Record<string, unknown>;
    const nested = dictionary.i18n;
    return nested && typeof nested === "object"
        ? nested as Record<string, unknown>
        : dictionary;
}

/**
 * 读取思源根据当前语言注入的插件 i18n，并支持简单的 {name} 插值。
 * fallback 只用于旧版本语言包缺少新键时保证界面可读。
 */
export function t(
    source: I18nSource,
    key: string,
    fallback: string,
    params: I18nParams = {},
): string {
    const dictionary = getDictionary(source);
    const template = typeof dictionary[key] === "string" && dictionary[key]
        ? String(dictionary[key])
        : fallback;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
}

/**
 * 将同步链路产生的历史中文状态文案转换为当前界面语言。
 * 新代码应直接使用 t；这里用于兼容已写入缓存的旧同步报告和底层动态进度消息。
 */
export function localizeKnownUiText(source: I18nSource, value: unknown): string {
    const text = String(value || "");
    if (!text) return "";

    const exact: Record<string, [string, string]> = {
        "同步已取消": ["wereadSyncCancelled", "同步已取消"],
        "无变化跳过": ["syncTextUnchangedSkipped", "无变化跳过"],
        "普通书跳过": ["syncTextNormalBookSkipped", "普通书跳过"],
        "公众号书籍跳过": ["syncTextMpSkipped", "公众号书籍跳过"],
        "普通书没有需要同步的内容": ["syncTextNoBookWork", "普通书没有需要同步的内容"],
        "公众号没有需要同步的内容": ["syncTextNoMpWork", "公众号没有需要同步的内容"],
        "请重新验证微信读书 API Key。": ["syncSuggestionApiKey", "请重新验证微信读书 API Key。"],
        "网络连接超时或请求失败，请稍后重试或检查网络代理。": ["syncSuggestionNetwork", "网络连接超时或请求失败，请稍后重试或检查网络代理。"],
        "请先导入该书，或确认本地数据库里的 ISBN/bookID 是否正确。": ["syncSuggestionTarget", "请先导入该书，或确认本地数据库里的 ISBN/bookID 是否正确。"],
        "请完成新来源导入或重新匹配本地文档后再同步。": ["syncSuggestionReady", "请完成新来源导入或重新匹配本地文档后再同步。"],
        "请检查目标文档是否可写，然后重新同步失败项。": ["syncSuggestionWritable", "请检查目标文档是否可写，然后重新同步失败项。"],
        "可继续同步，后续再次同步会尝试补全公众号文章标题。": ["syncSuggestionMpTitle", "可继续同步，后续再次同步会尝试补全公众号文章标题。"],
        "这是跳过项，如需同步请取消忽略或使用强制同步。": ["syncSuggestionSkipped", "这是跳过项，如需同步请取消忽略或使用强制同步。"],
        "请先在新来源确认弹窗中导入该来源。": ["syncSuggestionNewSource", "请先在新来源确认弹窗中导入该来源。"],
        "请检查缓存数据是否完整，重新拉取有笔记书籍列表。": ["syncSuggestionCache", "请检查缓存数据是否完整，重新拉取有笔记书籍列表。"],
        "请补充 ISBN 或使用 BookID 导入。": ["syncSuggestionIsbn", "请补充 ISBN 或使用 BookID 导入。"],
        "请复制诊断报告并查看控制台日志。": ["syncSuggestionDiagnostics", "请复制诊断报告并查看控制台日志。"],
    };
    if (exact[text]) return t(source, exact[text][0], exact[text][1]);

    const patterns: Array<[RegExp, string, string, string[]]> = [
        [/^同步完成：计划 (\d+)，成功 (\d+)，失败 (\d+)$/, "wereadSyncCompletedSummary", "同步完成：计划 {planned}，成功 {success}，失败 {failed}", ["planned", "success", "failed"]],
        [/^同步成功：新增 (\d+) 条，更新 (\d+) 条，删除 (\d+) 条，未变化 (\d+) 条$/, "syncTextItemSuccess", "同步成功：新增 {added} 条，更新 {updated} 条，删除 {deleted} 条，未变化 {unchanged} 条", ["added", "updated", "deleted", "unchanged"]],
        [/^普通书籍同步完成：成功 (\d+)，失败 (\d+)，计划 (\d+)$/, "syncTextBooksComplete", "普通书籍同步完成：成功 {success}，失败 {failed}，计划 {planned}", ["success", "failed", "planned"]],
        [/^公众号同步完成：成功 (\d+)，失败 (\d+)，计划 (\d+)$/, "syncTextMpComplete", "公众号同步完成：成功 {success}，失败 {failed}，计划 {planned}", ["success", "failed", "planned"]],
        [/^已加载 (\d+) 个来源，正在检查新来源和同步计划\.\.\.$/, "syncTextSourcesLoaded", "已加载 {count} 个来源，正在检查新来源和同步计划...", ["count"]],
        [/^准备同步 (\d+) 本普通书籍$/, "syncTextPrepareBooks", "准备同步 {count} 本普通书籍", ["count"]],
        [/^准备同步 (\d+) 个公众号$/, "syncTextPrepareMp", "准备同步 {count} 个公众号", ["count"]],
        [/^开始写入 (\d+) 本普通书籍$/, "syncTextWriteBooks", "开始写入 {count} 本普通书籍", ["count"]],
        [/^开始写入 (\d+) 个公众号$/, "syncTextWriteMp", "开始写入 {count} 个公众号", ["count"]],
    ];
    for (const [pattern, key, fallback, names] of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const params: I18nParams = {};
        names.forEach((name, index) => { params[name] = match[index + 1]; });
        return t(source, key, fallback, params);
    }

    const englishUi = t(source, "uiClose", "关闭") !== "关闭";
    if (englishUi && /[\u3400-\u9fff]/.test(text)) {
        return t(source, "syncTextSeeDiagnostics", "操作详情请查看同步诊断。");
    }
    return text;
}
