/**
 * 微信读书模板渲染辅助函数
 * 供公众号账号级模板渲染与中间片段渲染共用
 */

/**
 * 通用评论渲染辅助：处理多行评论内容的缩进对齐
 * @param commentsTpl 评论模板片段（{{#comments}}...{{/comments}} 内部）
 * @param comments 评论数组
 */
export function renderCommentsWithIndent<T extends { content: string; commentCreateTime1?: string; commentCreateTime2?: string; commentCreateTime3?: string; commentCreateTime4?: string; commentCreateTime5?: string; commentCreateTime6?: string; commentCreateTime7?: string; commentCreateTime8?: string; commentCreateTime9?: string; commentCreateTime10?: string }>(
    commentsTpl: string,
    comments: T[]
): string {
    if (!comments || comments.length === 0) return '';
    // 计算 {{content}} 所在行的占位符前缀，用于多行内容对齐
    // 例如模板行 "  - 💬 {{content}}"，取 "  - 💬 " 并转为等宽空格 "      "
    const contentLineMatch = commentsTpl.match(/^(.*)\{\{content\}\}/m);
    const continuationIndent = contentLineMatch
        ? contentLineMatch[1].replace(/[^\s]/g, ' ')
        : '';
    return comments.map(c => {
        const content = c.content || '';
        // 多行内容：第一行原样，后续行补等宽空格前缀，保持子内容层级
        const indentedContent = content.includes('\n')
            ? content.split('\n').map((line, idx) => idx === 0 ? line : continuationIndent + line).join('\n')
            : content;
        return commentsTpl
            .replace(/\{\{content\}\}/g, indentedContent)
            .replace(/\{\{commentCreateTime1\}\}/g, c.commentCreateTime1 || '')
            .replace(/\{\{commentCreateTime2\}\}/g, c.commentCreateTime2 || '')
            .replace(/\{\{commentCreateTime3\}\}/g, c.commentCreateTime3 || '')
            .replace(/\{\{commentCreateTime4\}\}/g, c.commentCreateTime4 || '')
            .replace(/\{\{commentCreateTime5\}\}/g, c.commentCreateTime5 || '')
            .replace(/\{\{commentCreateTime6\}\}/g, c.commentCreateTime6 || '')
            .replace(/\{\{commentCreateTime7\}\}/g, c.commentCreateTime7 || '')
            .replace(/\{\{commentCreateTime8\}\}/g, c.commentCreateTime8 || '')
            .replace(/\{\{commentCreateTime9\}\}/g, c.commentCreateTime9 || '')
            .replace(/\{\{commentCreateTime10\}\}/g, c.commentCreateTime10 || '');
    }).join('\n');
}

/**
 * 渲染 note 条件 section
 * 处理 {{#fieldName}}...{{/fieldName}} 条件块
 * 当 note 上 fieldName 有值（非空）时保留内容，无值时删除整段
 */
export function renderNoteConditionalSections(
    template: string,
    note: Record<string, any>
): string {
    // 定义 note 上可能的一层字段（不含嵌套对象和数组）
    const singleFields = [
        'highlightText', 'highlightComment', 'formattedNote',
        'createTime1', 'createTime2', 'createTime3', 'createTime4', 'createTime5',
        'createTime6', 'createTime7', 'createTime8', 'createTime9', 'createTime10',
        'highlightCreateTime1', 'highlightCreateTime2', 'highlightCreateTime3', 'highlightCreateTime4', 'highlightCreateTime5',
        'highlightCreateTime6', 'highlightCreateTime7', 'highlightCreateTime8', 'highlightCreateTime9', 'highlightCreateTime10',
        'commentCreateTime1', 'commentCreateTime2', 'commentCreateTime3', 'commentCreateTime4', 'commentCreateTime5',
        'commentCreateTime6', 'commentCreateTime7', 'commentCreateTime8', 'commentCreateTime9', 'commentCreateTime10',
    ];

    let result = template;
    for (const field of singleFields) {
        const value = note[field];
        const hasValue = value !== null && value !== undefined && value !== '';
        // 匹配 {{#fieldName}}...{{/fieldName}} 块
        result = result.replace(new RegExp(`\\{\\{#${field}\\}\\}([\\s\\S]*?)\\{\\{\\/${field}\\}\\}`, 'g'),
            (_, innerContent) => hasValue ? innerContent : '');
    }
    return result;
}

/**
 * 通用 note 模板变量类型（新旧链路共用）
 */
export interface CommonNoteTemplateVars {
    highlightText?: string;
    highlightComment?: string;
    createTime1?: string;
    createTime2?: string;
    createTime3?: string;
    createTime4?: string;
    createTime5?: string;
    createTime6?: string;
    createTime7?: string;
    createTime8?: string;
    createTime9?: string;
    createTime10?: string;
    highlightCreateTime1?: string;
    highlightCreateTime2?: string;
    highlightCreateTime3?: string;
    highlightCreateTime4?: string;
    highlightCreateTime5?: string;
    highlightCreateTime6?: string;
    highlightCreateTime7?: string;
    highlightCreateTime8?: string;
    highlightCreateTime9?: string;
    highlightCreateTime10?: string;
    commentCreateTime1?: string;
    commentCreateTime2?: string;
    commentCreateTime3?: string;
    commentCreateTime4?: string;
    commentCreateTime5?: string;
    commentCreateTime6?: string;
    commentCreateTime7?: string;
    commentCreateTime8?: string;
    commentCreateTime9?: string;
    commentCreateTime10?: string;
}

/**
 * 通用评论模板变量类型（新旧链路共用）
 */
export interface CommonCommentTemplateVars {
    content: string;
    commentCreateTime1?: string;
    commentCreateTime2?: string;
    commentCreateTime3?: string;
    commentCreateTime4?: string;
    commentCreateTime5?: string;
    commentCreateTime6?: string;
    commentCreateTime7?: string;
    commentCreateTime8?: string;
    commentCreateTime9?: string;
    commentCreateTime10?: string;
}

/**
 * 处理简单条件 section（非数组，单层字段）
 * 例如 {{#fieldName}}...{{/fieldName}}
 * 当值存在（非 null/undefined/空字符串）时保留内容，否则删除整段
 */
export function renderSimpleConditionalSections(
    template: string,
    values: Record<string, any>,
    fields: string[]
): string {
    let result = template;
    for (const field of fields) {
        const regex = new RegExp(`\\{\\{#${field}\\}\\}([\\s\\S]*?)\\{\\{\\/${field}\\}\\}`, 'g');
        result = result.replace(regex, (_, innerContent) => {
            const val = values[field];
            return val != null && val !== '' ? innerContent : '';
        });
    }
    return result;
}

// ========== 时间格式化 Helper（公众号与普通书模板共享） ==========

interface TimeFormat {
    dateSeparator: string;
    timeSeparator: string;
    showSeconds: boolean;
    useChineseUnit: boolean;
    padZero: boolean;
}

const TIME_FORMATS: Record<string, TimeFormat> = {
    'createTime1': { dateSeparator: '/', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime2': { dateSeparator: '-', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime3': { dateSeparator: '.', timeSeparator: ':', showSeconds: false, useChineseUnit: false, padZero: true },
    'createTime4': { dateSeparator: '年', timeSeparator: '时', showSeconds: false, useChineseUnit: true, padZero: true },
    'createTime5': { dateSeparator: '年', timeSeparator: '时', showSeconds: false, useChineseUnit: true, padZero: false },
    'createTime6': { dateSeparator: '/', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime7': { dateSeparator: '-', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime8': { dateSeparator: '.', timeSeparator: ':', showSeconds: true, useChineseUnit: false, padZero: true },
    'createTime9': { dateSeparator: '年', timeSeparator: '时', showSeconds: true, useChineseUnit: true, padZero: true },
    'createTime10': { dateSeparator: '年', timeSeparator: '时', showSeconds: true, useChineseUnit: true, padZero: false },
};

/**
 * 格式化时间戳为人类可读字符串（微信读书模板专用）
 * 支持 createTime1-10、highlightCreateTime1-10、commentCreateTime1-10 等格式键
 * @param timestamp 秒级时间戳
 * @param formatKey 格式键，如 'createTime1', 'highlightCreateTime7'
 * @returns 格式化后的时间字符串
 */
export function formatWereadTimestamp(timestamp: number, formatKey: string = 'createTime1'): string {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp * 1000);
    let format = TIME_FORMATS[formatKey];
    if (!format) {
        // 支持 highlightCreateTimeX 和 commentCreateTimeX 映射到基础格式
        const baseKey = formatKey.replace(/^highlight/, '').replace(/^comment/, '');
        format = TIME_FORMATS[baseKey] || TIME_FORMATS['createTime1'];
    }

    const year = date.getFullYear();
    const month = format.padZero ? String(date.getMonth() + 1).padStart(2, '0') : date.getMonth() + 1;
    const day = format.padZero ? String(date.getDate()).padStart(2, '0') : date.getDate();
    const hour = format.padZero ? String(date.getHours()).padStart(2, '0') : date.getHours();
    const minute = format.padZero ? String(date.getMinutes()).padStart(2, '0') : date.getMinutes();
    const second = format.padZero ? String(date.getSeconds()).padStart(2, '0') : date.getSeconds();

    let result: string;
    if (format.useChineseUnit) {
        result = `${year}${format.dateSeparator}${month}月${day}日 ${hour}${format.timeSeparator}${minute}分`;
        if (format.showSeconds) {
            result += `${second}秒`;
        }
    } else {
        const datePart = `${year}${format.dateSeparator}${month}${format.dateSeparator}${day}`;
        let timePart = `${hour}${format.timeSeparator}${minute}`;
        if (format.showSeconds) {
            timePart += `${format.timeSeparator}${second}`;
        }
        result = `${datePart} ${timePart}`;
    }
    return result;
}