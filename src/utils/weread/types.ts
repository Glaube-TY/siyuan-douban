// ========== 配置相关 ==========

/** 微信读书 Cookie 配置 */
export interface WereadCookieData {
    cookies: string;
    isQRCode: boolean;
}

/** 插件设置 */
export interface PluginSettings {
    ratings: string[];
    categories: string[];
    statuses: string[];
    addNotes: boolean;
    isSYTemplateRender: boolean;
    bookDatabaseID: string;
    noteTemplate: string;
}

// ========== 书籍数据相关 ==========

/** 微信读书书籍摘要（notebook 列表预加载数据） */
export interface WereadBookSummary {
    bookID: string;
    title: string;
    author: string;
    cover: string;
    format: string;
    price: number;
    introduction: string;
    publishTime: string;
    category: string;
    isbn: string;
    publisher: string;
    totalWords: number;
    star: number;
    ratingCount: number;
    AISummary: string;
    noteCount: number;
    reviewCount: number;
    updatedTime: number;
}

/** 微信读书书籍详情 */
export interface WereadBookDetail {
    bookId: string;
    title: string;
    author: string;
    authors: string;
    cover: string;
    format: string;
    price: number;
    intro: string;
    publishTime: string;
    category: string;
    isbn: string;
    publisher: string;
    totalWords: number;
    newRating: number;
    ratingCount: number;
    AISummary: string;
    copyrightInfo?: {
        name?: string;
    };
    newRatingDetail?: {
        title?: string;
    };
}

// ========== 同步记录相关 ==========

/** 微信读书来源类型 */
export type WereadSourceType = "weread_book" | "weread_mp_account" | "weread_mp_article";

/** 同步记录 */
export interface SyncNotebookRecord {
    bookID: string;
    isbn: string;
    title: string;
    author?: string;
    updatedTime: number;
    blockID?: string;
    /** 来源类型，用于区分普通书/公众号账号/公众号文章 */
    sourceType?: WereadSourceType;
    /** 统一同步标识，优先用于去重 */
    syncID?: string;
    /** 原始书籍/账号 ID（公众号场景） */
    rawBookID?: string;
    /** 文章 ID（公众号文章场景） */
    articleID?: string;
}

/** 增强后的同步记录（包含划线和评论数据） */
export interface EnhancedSyncNotebookRecord extends SyncNotebookRecord {
    highlights: any;
    comments: any;
    bookDetails: WereadBookDetail;
    bestHighlights: any;
    chapterInfos: WereadChapterInfosBookRecord | null;
}

// ========== 微信读书 API 响应相关（最小结构） ==========

/** 书架书籍项 */
export interface WereadBookShelfItem {
    bookId: string;
    title: string;
    author: string;
    cover: string;
}

/** 书架响应 */
export interface WereadBookShelfResponse {
    books?: WereadBookShelfItem[];
    archive?: Array<{
        books: WereadBookShelfItem[];
    }>;
}

/** 划线记录 */
export interface WereadHighlightRecord {
    bookId: string;
    chapterUid: number;
    range: string;
    markText: string;
    createTime: number;
}

/** 划线响应 */
export interface WereadHighlightsResponse {
    updated?: WereadHighlightRecord[];
    chapters?: Array<{
        chapterUid: number;
        title: string;
    }>;
}

/** 评论记录 */
export interface WereadCommentRecord {
    reviewId: string;
    bookId: string;
    chapterUid: number;
    range: string;
    content: string;
    createTime: number;
}

/** 评论响应 */
export interface WereadCommentsResponse {
    reviews?: WereadCommentRecord[];
}

/** 热门划线记录 */
export interface WereadBestHighlightRecord {
    bookId: string;
    markText: string;
}

/** 热门划线响应 */
export interface WereadBestHighlightsResponse {
    items?: WereadBestHighlightRecord[];
    bestBookMarks?: {
        items?: WereadBestHighlightRecord[];
    };
}

// ========== 插件接口（极简） ==========

/** ForwardProxy 响应 */
export interface ForwardProxyResponse {
    data: {
        status: number;
        body: string;
    };
}

/** 微信读书模块所需的插件最小接口 */
export interface WereadPluginLike {
    client: {
        getChildBlocks: (params: { id: string }) => Promise<any>;
        insertBlock: (params: any) => Promise<any>;
        deleteBlock: (params: { id: string }) => Promise<any>;
        getConf: () => Promise<any>;
        render: (params: any) => Promise<any>;
        updateBlock: (params: any) => Promise<any>;
        forwardProxy: (params: any) => Promise<any>;
    };
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<any>;
    i18n: Record<string, string>;
}

// ========== 章节目录相关 ==========

/** 微信读书章节信息项 */
export interface WereadChapterInfoItem {
    chapterUid: number;
    chapterIdx: number;
    title: string;
    level: number;
    files?: unknown[];
}

/** 微信读书单本书的章节记录 */
export interface WereadChapterInfosBookRecord {
    bookId: string;
    updated: WereadChapterInfoItem[];
}

/** 微信读书章节信息响应 */
export interface WereadChapterInfosResponse {
    data: WereadChapterInfosBookRecord[];
}

