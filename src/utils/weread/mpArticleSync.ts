/**
 * 微信读书公众号账号级同步助手
 * 负责公众号账号笔记 -> 文章中间数据聚合（供账号级文档模板渲染使用）
 */

import { formatWereadTimestamp } from "./wereadTemplateRender";

// ========== 最小本地类型定义 ==========

/** 公众号账号内文章引用信息（标准化后） */
export interface MpArticleRefInfo {
    reviewId: string;
    title: string;
    picUrl: string;
    createTime: number;
}

/** 原始 payload 中的 refMpInfo/refMpInfos 项 */
interface RawRefMpInfo {
    reviewId: string;
    title: string;
    pic_url?: string;
    picUrl?: string;
    createTime: number;
}

/** 原始 bookmark 项（最小形态，兼容 WereadHighlightRecord） */
interface RawBookmark {
    bookmarkId?: string;
    bookId: string;
    markText: string;
    range: string;
    createTime: number;
    refMpReviewId?: string;
}

/** 原始 review 项（旧包装形态） */
interface RawReviewItem {
    review: {
        reviewId: string;
        range: string;
        content: string;
        createTime: number;
        refMpInfo?: RawRefMpInfo;
        abstract?: string;
        contextAbstract?: string;
    };
}

/** 评论主体对象（新形态，如 WereadCommentRecord） */
interface ReviewBodyLike {
    reviewId: string;
    range?: string;
    content?: string;
    createTime?: number;
    refMpInfo?: RawRefMpInfo;
    abstract?: string;
    contextAbstract?: string;
}

/** 公众号评论 payload 最小兼容类型 */
export interface MpReviewPayloadLike {
    reviews?: Array<RawReviewItem | ReviewBodyLike>;
}

/** 公众号划线记录 */
export interface MpBookmarkRecord {
    bookId: string;
    bookmarkId: string;
    markText: string;
    range: string;
    createTime: number;
    refMpReviewId: string;
}

/** 公众号评论记录 */
export interface MpReviewRecord {
    reviewId: string;
    range: string;
    content: string;
    createTime: number;
    refMpInfo?: MpArticleRefInfo;
    abstract?: string;
    contextAbstract?: string;
}

/** 公众号账号信息（最小输入形态，兼容 WereadBookDetail） */
export interface MpBookInfo {
    bookId: string;
    title: string;
    author?: string;
    cover?: string;
    intro?: string;
    type?: number;
    updateTime?: number;
    coverBoxInfo?: { mp_avatar?: string };
}

/**
 * 公众号账号内文章分组（中间渲染单元）
 * 仅用于账号级文档内 articles section 渲染，不直接落库
 * 注意：rawBookID/articleID/syncID 属于插件内部同步/聚合语义，不再对模板开放
 * 数据库层公众号账号行只靠 bookID 识别
 */
export interface MpArticleGroup {
    rawBookID: string;  // 内部字段：用于聚合分组，不再对模板开放
    articleID: string;  // 内部字段：用于聚合分组，不再对模板开放
    syncID: string;  // 内部字段：用于调试追踪，不再对模板开放
    accountTitle: string;
    accountIntro: string;
    accountCover: string;
    articleTitle: string;
    articleCover: string;  // 已停用：按当前规则统一置空，只保留账号级封面
    articleCreateTime: number;
    updatedTime: number;
    bookmarks: MpBookmarkRecord[];
    reviews: MpReviewRecord[];
}

// ========== 纯数据 Helper 函数 ==========

/**
 * 判断是否为微信读书公众号账号来源
 * @param bookId 书籍/账号 ID
 * @param book 可选的书籍信息对象
 */
export function isWereadMpAccountSource(bookId: string, book?: { type?: number }): boolean {
    if (bookId?.startsWith("MP_WXS_")) return true;
    if (book?.type === 3) return true;
    return false;
}

/**
 * 归一化微信读书时间戳为秒级
 * @param ts 输入时间戳（可能是秒或毫秒）
 */
export function normalizeWereadTimestamp(ts: number | undefined | null): number {
    if (!ts || ts <= 0) return 0;
    if (ts > 1e12) return Math.floor(ts / 1000);
    return Math.floor(ts);
}

/**
 * 解析公众号账号封面
 * @param bookInfo 公众号账号信息
 */
export function resolveMpAccountCover(bookInfo: MpBookInfo): string {
    const DEFAULT_PLACEHOLDER = "/t8_0.jpg";
    const cover = bookInfo.cover || "";
    const mpAvatar = bookInfo.coverBoxInfo?.mp_avatar || "";

    // 封面为空或是默认占位图时，优先使用 mp_avatar
    if (!cover || cover.includes(DEFAULT_PLACEHOLDER)) {
        return mpAvatar || cover;
    }
    return cover;
}

/**
 * 标准化原始 refMpInfo 为本地结构
 */
function normalizeRefMpInfo(raw: RawRefMpInfo): MpArticleRefInfo {
    return {
        reviewId: raw.reviewId,
        title: raw.title,
        picUrl: raw.pic_url || raw.picUrl || "",
        createTime: normalizeWereadTimestamp(raw.createTime)
    };
}

/**
 * 标准化公众号评论记录
 * 兼容两种形态：
 * A. 旧包装形态: { review: {...}, reviewId?: ... }
 * B. 新主体形态: { reviewId, range, content, createTime, refMpInfo }
 */
function normalizeMpReviewRecord(item: RawReviewItem | ReviewBodyLike): MpReviewRecord | null {
    if (!item) return null;

    // 判断是否为旧包装形态（有 review 属性且 review 里有 reviewId）
    const isWrapped = 'review' in item && item.review && typeof item.review === 'object' && 'reviewId' in item.review;

    const body = isWrapped ? (item as RawReviewItem).review : (item as ReviewBodyLike);
    if (!body?.reviewId) return null;

    const rawRefInfo = body.refMpInfo;
    return {
        reviewId: body.reviewId,
        range: body.range || "",
        content: body.content || "",
        createTime: normalizeWereadTimestamp(body.createTime),
        refMpInfo: rawRefInfo ? normalizeRefMpInfo(rawRefInfo) : undefined,
        abstract: body.abstract || "",
        contextAbstract: body.contextAbstract || ""
    };
}

/**
 * 构建文章 ID -> 引用信息映射
 * @param bookmarkPayload 划线数据负载
 * @param reviewPayload 评论数据负载
 */
export function buildRefMpInfoMap(
    bookmarkPayload: { refMpInfos?: RawRefMpInfo[] },
    reviewPayload: MpReviewPayloadLike
): Map<string, MpArticleRefInfo> {
    const map = new Map<string, MpArticleRefInfo>();

    // 优先从 bookmarkPayload.refMpInfos 建立映射
    if (bookmarkPayload?.refMpInfos) {
        for (const raw of bookmarkPayload.refMpInfos) {
            if (raw?.reviewId) {
                map.set(raw.reviewId, normalizeRefMpInfo(raw));
            }
        }
    }

    // 再用 reviewPayload 补充缺失字段（只补空字段，不覆盖已有值）
    if (reviewPayload?.reviews) {
        for (const item of reviewPayload.reviews) {
            const record = normalizeMpReviewRecord(item);
            if (!record?.refMpInfo?.reviewId) continue;

            const raw = record.refMpInfo;
            const existing = map.get(raw.reviewId);
            const normalized = normalizeRefMpInfo(raw);

            if (!existing) {
                // 不存在则新增
                map.set(raw.reviewId, normalized);
            } else {
                // 已存在则只补缺失字段
                const merged: MpArticleRefInfo = {
                    reviewId: existing.reviewId,
                    title: existing.title || normalized.title,
                    picUrl: existing.picUrl || normalized.picUrl,
                    createTime: existing.createTime || normalized.createTime
                };
                map.set(raw.reviewId, merged);
            }
        }
    }

    return map;
}

/**
 * 提取并标准化公众号划线记录
 * @param bookmarkPayload 划线数据负载（支持 .updated 或 .bookmarks）
 */
export function extractMpBookmarks(bookmarkPayload: { updated?: RawBookmark[]; bookmarks?: RawBookmark[] }): MpBookmarkRecord[] {
    // 优先读取 updated（真实接口返回），其次 bookmarks（兼容旧形式）
    const rawBookmarks = bookmarkPayload?.updated || bookmarkPayload?.bookmarks || [];

    return rawBookmarks
        .filter(b => b?.refMpReviewId)
        .map(b => ({
            bookId: b.bookId,
            bookmarkId: b.bookmarkId,
            markText: b.markText || "",
            range: b.range || "",
            createTime: normalizeWereadTimestamp(b.createTime),
            refMpReviewId: b.refMpReviewId!
        }));
}

/**
 * 提取并标准化公众号评论记录
 * @param reviewPayload 评论数据负载
 */
export function extractMpReviews(reviewPayload: MpReviewPayloadLike): MpReviewRecord[] {
    if (!reviewPayload?.reviews) return [];

    return reviewPayload.reviews
        .map(r => normalizeMpReviewRecord(r))
        .filter((r): r is MpReviewRecord => r !== null);
}

/**
 * 构建公众号账号内文章分组（中间数据聚合）
 * @param rawBookID 原始书籍/账号 ID（即 bookID，数据库层唯一识别键）
 * @param bookInfo 公众号账号信息
 * @param bookmarkPayload 划线数据负载
 * @param reviewPayload 评论数据负载
 * 注意：返回数据中的 rawBookID/articleID/syncID 属于内部同步/聚合语义，不再对模板开放
 */
export function buildMpArticleGroups(
    rawBookID: string,
    bookInfo: MpBookInfo,
    bookmarkPayload: { updated?: RawBookmark[]; bookmarks?: RawBookmark[]; refMpInfos?: RawRefMpInfo[] },
    reviewPayload: MpReviewPayloadLike
): MpArticleGroup[] {
    // 构建文章元数据映射
    const refMpInfoMap = buildRefMpInfoMap(bookmarkPayload, reviewPayload);

    // 提取标准化记录
    const bookmarks = extractMpBookmarks(bookmarkPayload);
    const reviews = extractMpReviews(reviewPayload);

    // 按文章 ID 分组收集 bookmarks
    const bookmarkGroups = new Map<string, MpBookmarkRecord[]>();
    for (const bm of bookmarks) {
        const articleID = bm.refMpReviewId;
        if (!bookmarkGroups.has(articleID)) {
            bookmarkGroups.set(articleID, []);
        }
        bookmarkGroups.get(articleID)!.push(bm);
    }

    // 按文章 ID 分组收集 reviews
    // 注意：review.refMpInfo.reviewId 才是文章 ID，不是 review.reviewId
    const reviewGroups = new Map<string, MpReviewRecord[]>();
    for (const rv of reviews) {
        const articleID = rv.refMpInfo?.reviewId;
        if (articleID) {
            if (!reviewGroups.has(articleID)) {
                reviewGroups.set(articleID, []);
            }
            reviewGroups.get(articleID)!.push(rv);
        }
    }

    // 收集所有文章 ID（来自 bookmark 和 review 的分组）
    const allArticleIDs = new Set<string>([
        ...bookmarkGroups.keys(),
        ...reviewGroups.keys()
    ]);

    // 账号级字段
    const accountTitle = bookInfo.title || "";
    const accountIntro = bookInfo.intro || "";
    const accountCover = resolveMpAccountCover(bookInfo);

    // 构建最终分组
    const groups: MpArticleGroup[] = [];

    for (const articleID of allArticleIDs) {
        const articleBookmarks = bookmarkGroups.get(articleID) || [];
        const articleReviews = reviewGroups.get(articleID) || [];
        const refInfo = refMpInfoMap.get(articleID);

        // 计算 updatedTime：取该文章组内所有记录的最大时间
        const allTimes = [
            ...articleBookmarks.map(b => b.createTime),
            ...articleReviews.map(r => r.createTime)
        ];
        const updatedTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;

        // 文章级字段
        const articleTitle = refInfo?.title || `公众号文章_${articleID}`;
        // 文章级封面：已停用，按当前规则统一置空字符串
        // 只保留账号级封面，文章级封面不再同步到数据库
        const articleCover = "";

        // 文章创建时间：优先 refMpInfo.createTime，其次组内最早记录时间，最后 updatedTime
        let articleCreateTime = normalizeWereadTimestamp(refInfo?.createTime);
        if (!articleCreateTime && allTimes.length > 0) {
            articleCreateTime = Math.min(...allTimes);
        }
        if (!articleCreateTime) {
            articleCreateTime = updatedTime;
        }

        groups.push({
            rawBookID,  // 内部字段：用于聚合分组，不再对模板开放
            articleID,  // 内部字段：用于聚合分组，不再对模板开放
            syncID: `mp:${rawBookID}:${articleID}`,  // 内部字段：用于调试追踪，不再对模板开放
            accountTitle,
            accountIntro,
            accountCover,
            articleTitle,
            articleCover,  // 已停用：统一置空
            articleCreateTime,
            updatedTime,
            bookmarks: articleBookmarks,
            reviews: articleReviews
        });
    }

    // 按文章创建时间升序排列（旧在前，新在后）
    groups.sort((a, b) => a.articleCreateTime - b.articleCreateTime);

    return groups;
}

// ========== 公众号账号内文章片段（Note/Comment）生成 ==========

/** 文章片段评论项（中间数据） */
export interface MpArticleCommentItem {
    content: string;
    createTime: number;
}

/** 文章片段 Note 项（中间数据） */
export interface MpArticleNoteItem {
    noteType: "highlight" | "comment_only";
    range: string;
    rangeStart: number;
    highlightText: string;
    highlightCreateTime: number;
    createTime: number;
    highlightComment: string;
    comments: MpArticleCommentItem[];
    latestCommentCreateTime: number;
}

/**
 * 解析微信读书 range 字符串的起始值
 * @param range 例如 "69-156"
 * @returns 起始值，非法 range 返回 Number.MAX_SAFE_INTEGER
 */
function parseWereadRangeStart(range: string): number {
    if (!range) return Number.MAX_SAFE_INTEGER;
    const parts = range.split("-");
    if (parts.length < 1) return Number.MAX_SAFE_INTEGER;
    const start = parseInt(parts[0], 10);
    return isNaN(start) ? Number.MAX_SAFE_INTEGER : start;
}

/**
 * 构建账号级文档内文章片段的 note 列表（中间数据）
 * @param group 文章分组（中间数据）
 */
export function buildMpArticleNotes(group: MpArticleGroup): MpArticleNoteItem[] {
    const notes: MpArticleNoteItem[] = [];

    // 按 range 分组收集 bookmarks
    const bookmarkRangeMap = new Map<string, MpBookmarkRecord[]>();
    for (const bm of group.bookmarks) {
        const range = bm.range;
        if (!bookmarkRangeMap.has(range)) {
            bookmarkRangeMap.set(range, []);
        }
        bookmarkRangeMap.get(range)!.push(bm);
    }

    // 按 range 分组收集 reviews
    const reviewRangeMap = new Map<string, MpReviewRecord[]>();
    for (const rv of group.reviews) {
        const range = rv.range;
        if (!range) continue; // 跳过无 range 的 review
        if (!reviewRangeMap.has(range)) {
            reviewRangeMap.set(range, []);
        }
        reviewRangeMap.get(range)!.push(rv);
    }

    // 收集所有 range（来自 bookmark 和 review）
    const allRanges = new Set<string>([
        ...bookmarkRangeMap.keys(),
        ...reviewRangeMap.keys()
    ]);

    for (const range of allRanges) {
        const rangeBookmarks = bookmarkRangeMap.get(range) || [];
        const rangeReviews = reviewRangeMap.get(range) || [];

        // 对评论按 createTime 升序排序（旧在前，新在后）
        const sortedReviews = [...rangeReviews].sort((a, b) => a.createTime - b.createTime);

        // 映射为 MpArticleCommentItem
        const comments: MpArticleCommentItem[] = sortedReviews.map(r => ({
            content: r.content,
            createTime: r.createTime
        }));

        // 计算评论相关字段
        const highlightComment = comments.map(c => c.content).join("\n");
        const latestCommentCreateTime = comments.length > 0 ? comments[comments.length - 1].createTime : 0;
        const earliestCommentTime = comments.length > 0 ? comments[0].createTime : 0;

        if (rangeBookmarks.length > 0) {
            // 有 bookmark，生成 highlight note
            // 取该 range 下最早的 bookmark 时间
            const earliestBookmarkTime = rangeBookmarks
                .map(b => b.createTime)
                .reduce((min, t) => (t < min ? t : min), rangeBookmarks[0].createTime);

            // 取第一条非空 markText
            const highlightText = rangeBookmarks
                .map(b => b.markText)
                .find(t => t?.trim()) || "";

            notes.push({
                noteType: "highlight",
                range,
                rangeStart: parseWereadRangeStart(range),
                highlightText,
                highlightCreateTime: earliestBookmarkTime,
                createTime: earliestBookmarkTime || earliestCommentTime || 0,
                highlightComment,
                comments,
                latestCommentCreateTime
            });
        } else {
            // 无 bookmark，生成 comment-only note
            // 从评论中回填被评论文本（abstract/contextAbstract）
            const fallbackHighlightText = sortedReviews
                .map(r => r.abstract || r.contextAbstract || "")
                .find(t => t.trim()) || "";

            notes.push({
                noteType: "comment_only",
                range,
                rangeStart: parseWereadRangeStart(range),
                highlightText: fallbackHighlightText,
                highlightCreateTime: 0,
                createTime: earliestCommentTime,
                highlightComment,
                comments,
                latestCommentCreateTime
            });
        }
    }

    // 按 rangeStart 升序，rangeStart 相同再按 createTime 升序
    notes.sort((a, b) => {
        if (a.rangeStart !== b.rangeStart) {
            return a.rangeStart - b.rangeStart;
        }
        return a.createTime - b.createTime;
    });

    return notes;
}

// ========== 公众号账号级文章渲染单元 ==========

/**
 * 账号级文档内文章渲染单元（中间数据，用于模板渲染）
 * 注意：这是账号级文档内的 articles section 数据，不直接作为数据库来源记录
 * 注意：syncID/rawBookID/articleID 属于内部同步/聚合语义，不再对模板开放
 * articleCover 已停用，不再对模板开放
 * 数据库层公众号账号行只靠 bookID 识别
 */
export interface MpArticleSyncUnit {
    syncID: string;  // 内部字段：用于调试追踪，不再对模板开放
    rawBookID: string;  // 内部字段：用于聚合分组，不再对模板开放
    articleID: string;  // 内部字段：用于聚合分组，不再对模板开放
    articleTitle: string;
    articleCover: string;  // 已停用：不再对模板开放，统一置空
    articleCreateTime: number;
    updatedTime: number;
    notes: MpArticleNoteItem[];
}

/**
 * 构建账号级文档内文章渲染单元列表（中间数据聚合）
 * @param rawBookID 原始书籍/账号 ID（即 bookID，数据库层唯一识别键）
 * @param bookInfo 公众号账号信息
 * @param bookmarkPayload 划线数据负载
 * @param reviewPayload 评论数据负载
 * 注意：返回数据中的 syncID/rawBookID/articleID 属于内部同步/聚合语义，不再对模板开放
 */
export function buildMpArticleSyncUnits(
    rawBookID: string,
    bookInfo: MpBookInfo,
    bookmarkPayload: { updated?: RawBookmark[]; bookmarks?: RawBookmark[]; refMpInfos?: RawRefMpInfo[] },
    reviewPayload: MpReviewPayloadLike
): MpArticleSyncUnit[] {
    // 先获取文章分组
    const groups = buildMpArticleGroups(rawBookID, bookInfo, bookmarkPayload, reviewPayload);

    // 构建同步单元
    return groups.map(group => {
        const notes = buildMpArticleNotes(group);

        return {
            syncID: group.syncID,  // 内部字段：不再对模板开放
            rawBookID: group.rawBookID,  // 内部字段：不再对模板开放
            articleID: group.articleID,  // 内部字段：不再对模板开放
            articleTitle: group.articleTitle,
            // 文章级封面：已停用，统一置空，只保留账号级封面
            articleCover: "",
            articleCreateTime: group.articleCreateTime,
            updatedTime: group.updatedTime,
            notes
        };
    });
}

// ========== 公众号账号级模板变量构建 ==========

/** 账号级文档内文章片段模板变量 */
export interface MpAccountArticleTemplateVars {
    /** 内部排序字段：文章更新时间原始数值，仅供渲染层排序使用，不对用户开放 */
    __sortUpdateTime: number;
    articleTitle: string;
    articleCreateTime1: string;
    articleCreateTime2: string;
    articleCreateTime3: string;
    articleCreateTime4: string;
    articleCreateTime5: string;
    articleCreateTime6: string;
    articleCreateTime7: string;
    articleCreateTime8: string;
    articleCreateTime9: string;
    articleCreateTime10: string;
    updateTime1: string;
    updateTime2: string;
    updateTime3: string;
    updateTime4: string;
    updateTime5: string;
    updateTime6: string;
    updateTime7: string;
    updateTime8: string;
    updateTime9: string;
    updateTime10: string;
    noteCount: number;
    notes: MpArticleNoteTemplateVars[];
}

/** Note 模板变量 */
export interface MpArticleNoteTemplateVars {
    highlightText: string;
    highlightComment: string;
    createTime1: string;
    createTime2: string;
    createTime3: string;
    createTime4: string;
    createTime5: string;
    createTime6: string;
    createTime7: string;
    createTime8: string;
    createTime9: string;
    createTime10: string;
    highlightCreateTime1: string;
    highlightCreateTime2: string;
    highlightCreateTime3: string;
    highlightCreateTime4: string;
    highlightCreateTime5: string;
    highlightCreateTime6: string;
    highlightCreateTime7: string;
    highlightCreateTime8: string;
    highlightCreateTime9: string;
    highlightCreateTime10: string;
    commentCreateTime1: string;
    commentCreateTime2: string;
    commentCreateTime3: string;
    commentCreateTime4: string;
    commentCreateTime5: string;
    commentCreateTime6: string;
    commentCreateTime7: string;
    commentCreateTime8: string;
    commentCreateTime9: string;
    commentCreateTime10: string;
    comments: { content: string; commentCreateTime1: string; commentCreateTime2: string; commentCreateTime3: string; commentCreateTime4: string; commentCreateTime5: string; commentCreateTime6: string; commentCreateTime7: string; commentCreateTime8: string; commentCreateTime9: string; commentCreateTime10: string; }[];
}

/** 账号级模板变量 */
export interface MpAccountTemplateVars {
    accountTitle: string;
    accountIntro: string;
    accountCover: string;
    updateTime1: string;
    updateTime2: string;
    updateTime3: string;
    updateTime4: string;
    updateTime5: string;
    updateTime6: string;
    updateTime7: string;
    updateTime8: string;
    updateTime9: string;
    updateTime10: string;
    articleCount: number;
    latestArticleTitle: string;
    latestArticleTime1: string;
    latestArticleTime2: string;
    latestArticleTime3: string;
    latestArticleTime4: string;
    latestArticleTime5: string;
    latestArticleTime6: string;
    latestArticleTime7: string;
    latestArticleTime8: string;
    latestArticleTime9: string;
    latestArticleTime10: string;
    articles: MpAccountArticleTemplateVars[];
}

/**
 * 构建账号级模板变量
 * @param rawBookID 原始书籍/账号 ID（即 bookID，数据库层唯一识别键）
 * @param accountInfo 公众号账号信息
 * @param articleUnits 文章同步单元数组
 * @param fallbackUpdateTime 账号级更新时间回退值（当文章单元为空时使用）
 */
export function buildMpAccountTemplateVariables(
    rawBookID: string,
    accountInfo: { accountTitle: string; accountIntro: string; accountCover: string },
    articleUnits: MpArticleSyncUnit[],
    fallbackUpdateTime?: number
): MpAccountTemplateVars {

    // ========== 三层时间语义说明 ==========
    // 1. 顶层 updateTime1~10（accountUpdateTime）：账号级更新时间
    //    - 优先取所有文章中的最大 updatedTime
    //    - 若文章为空，回退到 fallbackUpdateTime（账号来源记录时间）
    //    - 用于模板顶层 {{updateTimeX}}，反映账号整体更新状态
    // 2. 顶层 latestArticleTime1~10：最新发布文章时间
    //    - 按 articleCreateTime 取最新发布文章，显示其发布时间
    //    - 若文章为空，值为 0（模板显示空）
    //    - 用于模板顶层 {{latestArticleTimeX}}，与 updateTimeX 区分
    // 3. article 层 updateTime1~10：单篇文章时间
    //    - 每篇文章各自的 updatedTime
    //    - 用于 articles 循环内 {{updateTimeX}}
    // ======================================

    // 计算账号级 updateTime：优先文章最大时间，其次 fallback，最后 0
    const allUpdateTimes = articleUnits.map(u => u.updatedTime).filter(t => t > 0);
    const accountUpdateTime = allUpdateTimes.length > 0
        ? Math.max(...allUpdateTimes)
        : (fallbackUpdateTime || 0);

    // 找出最新发布文章（按 articleCreateTime，而非 updatedTime）
    // 注意：latestArticleTimeX = 最新发布文章时间，updateTimeX = 账号整体更新时间
    const sortedByCreateTime = [...articleUnits].sort((a, b) => b.articleCreateTime - a.articleCreateTime);
    const latestArticle = sortedByCreateTime[0];

    // 构建文章模板变量
    const articles: MpAccountArticleTemplateVars[] = articleUnits.map(unit => {
        const notes: MpArticleNoteTemplateVars[] = unit.notes.map(note => {
            const createTime = note.createTime || 0;
            const highlightCreateTime = note.highlightCreateTime || 0;
            const latestCommentTime = note.latestCommentCreateTime || 0;

            return {
                highlightText: note.highlightText || "",
                highlightComment: note.highlightComment || "",
                createTime1: formatWereadTimestamp(createTime, 'createTime1'),
                createTime2: formatWereadTimestamp(createTime, 'createTime2'),
                createTime3: formatWereadTimestamp(createTime, 'createTime3'),
                createTime4: formatWereadTimestamp(createTime, 'createTime4'),
                createTime5: formatWereadTimestamp(createTime, 'createTime5'),
                createTime6: formatWereadTimestamp(createTime, 'createTime6'),
                createTime7: formatWereadTimestamp(createTime, 'createTime7'),
                createTime8: formatWereadTimestamp(createTime, 'createTime8'),
                createTime9: formatWereadTimestamp(createTime, 'createTime9'),
                createTime10: formatWereadTimestamp(createTime, 'createTime10'),
                highlightCreateTime1: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime1'),
                highlightCreateTime2: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime2'),
                highlightCreateTime3: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime3'),
                highlightCreateTime4: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime4'),
                highlightCreateTime5: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime5'),
                highlightCreateTime6: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime6'),
                highlightCreateTime7: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime7'),
                highlightCreateTime8: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime8'),
                highlightCreateTime9: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime9'),
                highlightCreateTime10: formatWereadTimestamp(highlightCreateTime, 'highlightCreateTime10'),
                commentCreateTime1: formatWereadTimestamp(latestCommentTime, 'commentCreateTime1'),
                commentCreateTime2: formatWereadTimestamp(latestCommentTime, 'commentCreateTime2'),
                commentCreateTime3: formatWereadTimestamp(latestCommentTime, 'commentCreateTime3'),
                commentCreateTime4: formatWereadTimestamp(latestCommentTime, 'commentCreateTime4'),
                commentCreateTime5: formatWereadTimestamp(latestCommentTime, 'commentCreateTime5'),
                commentCreateTime6: formatWereadTimestamp(latestCommentTime, 'commentCreateTime6'),
                commentCreateTime7: formatWereadTimestamp(latestCommentTime, 'commentCreateTime7'),
                commentCreateTime8: formatWereadTimestamp(latestCommentTime, 'commentCreateTime8'),
                commentCreateTime9: formatWereadTimestamp(latestCommentTime, 'commentCreateTime9'),
                commentCreateTime10: formatWereadTimestamp(latestCommentTime, 'commentCreateTime10'),
                comments: note.comments.map(c => ({
                    content: c.content,
                    commentCreateTime1: formatWereadTimestamp(c.createTime, 'commentCreateTime1'),
                    commentCreateTime2: formatWereadTimestamp(c.createTime, 'commentCreateTime2'),
                    commentCreateTime3: formatWereadTimestamp(c.createTime, 'commentCreateTime3'),
                    commentCreateTime4: formatWereadTimestamp(c.createTime, 'commentCreateTime4'),
                    commentCreateTime5: formatWereadTimestamp(c.createTime, 'commentCreateTime5'),
                    commentCreateTime6: formatWereadTimestamp(c.createTime, 'commentCreateTime6'),
                    commentCreateTime7: formatWereadTimestamp(c.createTime, 'commentCreateTime7'),
                    commentCreateTime8: formatWereadTimestamp(c.createTime, 'commentCreateTime8'),
                    commentCreateTime9: formatWereadTimestamp(c.createTime, 'commentCreateTime9'),
                    commentCreateTime10: formatWereadTimestamp(c.createTime, 'commentCreateTime10'),
                }))
            };
        });

        return {
            // 内部排序字段：文章更新时间原始数值，仅供渲染层排序使用
            __sortUpdateTime: unit.updatedTime || 0,
            articleTitle: unit.articleTitle,
            articleCreateTime1: formatWereadTimestamp(unit.articleCreateTime, 'createTime1'),
            articleCreateTime2: formatWereadTimestamp(unit.articleCreateTime, 'createTime2'),
            articleCreateTime3: formatWereadTimestamp(unit.articleCreateTime, 'createTime3'),
            articleCreateTime4: formatWereadTimestamp(unit.articleCreateTime, 'createTime4'),
            articleCreateTime5: formatWereadTimestamp(unit.articleCreateTime, 'createTime5'),
            articleCreateTime6: formatWereadTimestamp(unit.articleCreateTime, 'createTime6'),
            articleCreateTime7: formatWereadTimestamp(unit.articleCreateTime, 'createTime7'),
            articleCreateTime8: formatWereadTimestamp(unit.articleCreateTime, 'createTime8'),
            articleCreateTime9: formatWereadTimestamp(unit.articleCreateTime, 'createTime9'),
            articleCreateTime10: formatWereadTimestamp(unit.articleCreateTime, 'createTime10'),
            // 单篇文章级 updateTime（第3层语义）
            updateTime1: formatWereadTimestamp(unit.updatedTime, 'createTime1'),
            updateTime2: formatWereadTimestamp(unit.updatedTime, 'createTime2'),
            updateTime3: formatWereadTimestamp(unit.updatedTime, 'createTime3'),
            updateTime4: formatWereadTimestamp(unit.updatedTime, 'createTime4'),
            updateTime5: formatWereadTimestamp(unit.updatedTime, 'createTime5'),
            updateTime6: formatWereadTimestamp(unit.updatedTime, 'createTime6'),
            updateTime7: formatWereadTimestamp(unit.updatedTime, 'createTime7'),
            updateTime8: formatWereadTimestamp(unit.updatedTime, 'createTime8'),
            updateTime9: formatWereadTimestamp(unit.updatedTime, 'createTime9'),
            updateTime10: formatWereadTimestamp(unit.updatedTime, 'createTime10'),
            noteCount: unit.notes.length,
            notes
        };
    });

    return {
        accountTitle: accountInfo.accountTitle,
        accountIntro: accountInfo.accountIntro,
        accountCover: accountInfo.accountCover,
        // 顶层账号级 updateTime（第1层语义）
        updateTime1: formatWereadTimestamp(accountUpdateTime, 'createTime1'),
        updateTime2: formatWereadTimestamp(accountUpdateTime, 'createTime2'),
        updateTime3: formatWereadTimestamp(accountUpdateTime, 'createTime3'),
        updateTime4: formatWereadTimestamp(accountUpdateTime, 'createTime4'),
        updateTime5: formatWereadTimestamp(accountUpdateTime, 'createTime5'),
        updateTime6: formatWereadTimestamp(accountUpdateTime, 'createTime6'),
        updateTime7: formatWereadTimestamp(accountUpdateTime, 'createTime7'),
        updateTime8: formatWereadTimestamp(accountUpdateTime, 'createTime8'),
        updateTime9: formatWereadTimestamp(accountUpdateTime, 'createTime9'),
        updateTime10: formatWereadTimestamp(accountUpdateTime, 'createTime10'),
        articleCount: articleUnits.length,
        // 最新发布文章标题（按 articleCreateTime）
        latestArticleTitle: latestArticle?.articleTitle || "",
        // 最新发布文章时间（按 articleCreateTime，与 updateTimeX 区分）
        latestArticleTime1: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime1'),
        latestArticleTime2: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime2'),
        latestArticleTime3: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime3'),
        latestArticleTime4: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime4'),
        latestArticleTime5: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime5'),
        latestArticleTime6: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime6'),
        latestArticleTime7: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime7'),
        latestArticleTime8: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime8'),
        latestArticleTime9: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime9'),
        latestArticleTime10: formatWereadTimestamp(latestArticle?.articleCreateTime || 0, 'createTime10'),
        articles
    };
}