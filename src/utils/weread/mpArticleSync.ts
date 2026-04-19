/**
 * 微信读书公众号文章同步助手
 * 负责公众号账号笔记 -> 公众号文章分组的纯数据能力
 */

// ========== 最小本地类型定义 ==========

/** 公众号文章引用信息（标准化后） */
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
    };
}

/** 评论主体对象（新形态，如 WereadCommentRecord） */
interface ReviewBodyLike {
    reviewId: string;
    range?: string;
    content?: string;
    createTime?: number;
    refMpInfo?: RawRefMpInfo;
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

/** 公众号文章分组 */
export interface MpArticleGroup {
    sourceType: "weread_mp_article";
    rawBookID: string;
    articleID: string;
    syncID: string;
    accountTitle: string;
    accountIntro: string;
    accountCover: string;
    articleTitle: string;
    articleCover: string;
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
        refMpInfo: rawRefInfo ? normalizeRefMpInfo(rawRefInfo) : undefined
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
 * 构建公众号文章分组
 * @param rawBookID 原始书籍/账号 ID
 * @param bookInfo 公众号账号信息
 * @param bookmarkPayload 划线数据负载
 * @param reviewPayload 评论数据负载
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
        const articleCover = refInfo?.picUrl || accountCover;

        // 文章创建时间：优先 refMpInfo.createTime，其次组内最早记录时间，最后 updatedTime
        let articleCreateTime = normalizeWereadTimestamp(refInfo?.createTime);
        if (!articleCreateTime && allTimes.length > 0) {
            articleCreateTime = Math.min(...allTimes);
        }
        if (!articleCreateTime) {
            articleCreateTime = updatedTime;
        }

        groups.push({
            sourceType: "weread_mp_article",
            rawBookID,
            articleID,
            syncID: `mp:${rawBookID}:${articleID}`,
            accountTitle,
            accountIntro,
            accountCover,
            articleTitle,
            articleCover,
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

// ========== 公众号文章内 Note 生成 ==========

/** 公众号文章评论项 */
export interface MpArticleCommentItem {
    content: string;
    createTime: number;
}

/** 公众号文章 Note 项 */
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
 * 构建公众号文章内的 note 列表
 * @param group 公众号文章分组
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
            notes.push({
                noteType: "comment_only",
                range,
                rangeStart: parseWereadRangeStart(range),
                highlightText: "",
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

// ========== 公众号文章同步单元 ==========

/** 公众号文章同步单元（可直接用于后续同步流程） */
export interface MpArticleSyncUnit {
    sourceType: "weread_mp_article";
    syncID: string;
    rawBookID: string;
    articleID: string;
    title: string;
    author: string;
    publisher: string;
    cover: string;
    accountTitle: string;
    accountIntro: string;
    accountCover: string;
    articleTitle: string;
    articleCover: string;
    articleCreateTime: number;
    updatedTime: number;
    notes: MpArticleNoteItem[];
}

/**
 * 构建公众号文章同步单元列表
 * @param rawBookID 原始书籍/账号 ID
 * @param bookInfo 公众号账号信息
 * @param bookmarkPayload 划线数据负载
 * @param reviewPayload 评论数据负载
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
            sourceType: "weread_mp_article",
            syncID: group.syncID,
            rawBookID: group.rawBookID,
            articleID: group.articleID,
            title: group.articleTitle,
            author: group.accountTitle,
            publisher: "微信公众号",
            cover: group.articleCover || group.accountCover,
            accountTitle: group.accountTitle,
            accountIntro: group.accountIntro,
            accountCover: group.accountCover,
            articleTitle: group.articleTitle,
            articleCover: group.articleCover,
            articleCreateTime: group.articleCreateTime,
            updatedTime: group.updatedTime,
            notes
        };
    });
}