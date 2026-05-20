# 微信读书 API 接口参考（当前版：API Key / 官方接口）

## 0. 文档优先级与使用说明

**文档优先级：**
1. 本项目开发以 `docs/weread-api-reference-current.md` 为最高优先级。
2. `docs/weread-skills/` 仅为上游能力参考，不代表当前项目全部使用。
3. 如果 `weread-skills` 与当前主文档冲突，以当前主文档为准。
4. 当前项目明确不调用 `/book/getprogress`、`/book/underlines`、`/book/readreviews`。
5. 当前官方 API 不提供 AI 总结，模板不再支持 `AISummary`。

**脱敏结构示例说明：**
本文档中的 JSON 示例均为脱敏结构示例，不依赖真实接口测试文件。
真实接口测试 JSON 已不纳入仓库，避免泄露个人微信读书数据。
后续如需确认新字段，必须重新使用 Apifox 测试，并只把脱敏后的字段结构补充到本文档。

---

## 1. 文档说明

本文档记录微信读书插件当前使用的官方 API 接口，用于后续开发维护。

**重要声明：**
- 当前项目**只使用 API Key / 官方接口模式**。
- 旧 Cookie 接口已废弃，详见 `weread-old-api-reference.md`。

---

## 2. 统一调用方式

所有接口统一通过 `callWereadApi` 方法调用：

```typescript
import { callWereadApi } from "./wereadApiGateway";

const result = await callWereadApi<T>(apiKey, apiName, params);
```

**调用规则：**
1. 每个请求自动注入 `skill_version: "1.0.3"`，开发者无需手动添加。
2. 参数直接放在请求体里，不要包 `params` 对象。
3. API Key 不允许 `console.log`。
4. 鉴权失败返回 `{ errcode: -2013, errmsg: "鉴权失败" }`。
5. 正常响应不一定有 `errcode`，只要有业务字段即可视为成功。
6. 请求方式：`POST /api/agent/gateway`，Header 带 `Authorization: Bearer {apiKey}`。

---

## 3. 接口清单

### 认证 / 能力
| 接口 | 用途 |
|------|------|
| `/_list` | 验证 API Key、查看接口能力列表 |

### 书架 / 有笔记
| 接口 | 用途 |
|------|------|
| `/user/notebooks` | 获取有笔记书籍（分页，游标翻页） |
| `/shelf/sync` | 获取书架全量数据（普通书 + 公众号账号混在 books 中） |

### 普通书同步
| 接口 | 用途 |
|------|------|
| `/book/info` | 书籍详情 |
| `/book/chapterinfo` | 章节信息 |
| `/book/bookmarklist` | 个人划线 |
| `/review/list/mine` | 个人书评 / 想法（分页，游标翻页） |
| `/book/bestbookmarks` | 热门划线 |

### 公众号同步
| 接口 | 用途 |
|------|------|
| `/book/bookmarklist` | 公众号文章划线 |
| `/review/list/mine` | 公众号文章想法 |
| `/review/single` | 补全纯划线公众号文章标题 |
| `/book/info` | 公众号账号基本信息（**不要用此接口补公众号文章标题**） |

### 搜索
| 接口 | 用途 |
|------|------|
| `/store/search` | 搜索书籍、公众号账号、公众号文章 |

### 阅读统计
| 接口 | 用途 |
|------|------|
| `/readdata/detail` | 周 / 月 / 年 / 总阅读统计 |
| `/shelf/sync` | 书架条目统计 |

### 明确暂不使用
| 接口 | 说明 |
|------|------|
| `/book/getprogress` | 当前不要调用 |
| `/book/underlines` | 当前不要调用 |
| `/book/readreviews` | 当前不要调用 |
| AI 总结 | 最新官方 API 不提供，模板中不再支持 `AISummary` |

---

## 4. 接口详细说明

### 4.1 `/_list` — 验证 API Key / 能力列表

**请求参数：** 无业务参数。

**成功返回结构：**
```json
{
  "errcode": 0,
  "usage": "POST /api/agent/gateway with header 'Authorization: Bearer wrk-xxxxx'",
  "request_format": "{\"api_name\": \"/book/info\", ...params}",
  "apis": [
    {
      "api_name": "/review/single",
      "description": "获取单条想法/评论的详情",
      "need_login": true,
      "params": [ ... ],
      "response_fields": [ "reviewId", "review", "synckey", ... ]
    },
    ...
  ]
}
```

**关键字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `errcode` | number | 0 表示成功 |
| `apis` | array | 接口能力列表，每项包含 `api_name` / `description` / `need_login` / `params` / `response_fields` |

**失败返回：**
```json
{ "errcode": -2013, "errlog": "xxx", "errmsg": "鉴权失败" }
```

**项目用途：** 用户输入 API Key 后首先调用此接口验证 Key 是否有效。

---

### 4.2 `/user/notebooks` — 获取有笔记书籍

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `count` | int | 否 | 20 | 每页数量 |
| `lastSort` | int | 否 | — | 翻页游标（上一页最后一条的 sort 值） |

**返回结构：**
```json
{
  "synckey": 1778659506,
  "totalBookCount": 103,
  "totalNoteCount": 2041,
  "noBookReviewCount": 0,
  "hasMore": 1,
  "books": [
    {
      "bookId": "MP_WXS_0000000001",
      "reviewCount": 2,
      "noteCount": 3,
      "bookmarkCount": 0,
      "markedStatus": 1,
      "readingProgress": 0,
      "sort": 1776515078,
      "book": {
        "bookId": "MP_WXS_0000000001",
        "title": "公众号名称",
        "author": "公众号",
        "cover": "http://wx.qlogo.cn/mmhead/...",
        "type": 3,
        "price": 0,
        "payType": 32,
        "format": "epub",
        "bookStatus": 2,
        "free": 1,
        "ispub": 0,
        "publishTime": "",
        "isbn": "",
        "categories": [],
        ...
      }
    },
    {
      "bookId": "00000001",
      "reviewCount": 1,
      "noteCount": 12,
      "bookmarkCount": 5,
      "markedStatus": 2,
      "readingProgress": 0,
      "sort": 1776515077,
      "book": {
        "bookId": "00000001",
        "title": "书名",
        "author": "作者名",
        "translator": "译者名",
        "cover": "https://cdn.weread.qq.com/weread/cover/...",
        "type": 0,
        "price": 48.3,
        "payType": 1048577,
        "format": "epub",
        "bookStatus": 1,
        "finished": 1,
        "free": 0,
        "ispub": 1,
        "publishTime": "2021-01-01 00:00:00",
        "isbn": "9787111000000",
        "categories": [
          { "categoryId": 1500000, "subCategoryId": 1500005, "categoryType": 0, "title": "科学技术-自然科学" }
        ],
        ...
      }
    }
  ]
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `synckey` | number | 同步游标 |
| `totalBookCount` | number | 有笔记书籍总数 |
| `totalNoteCount` | number | 笔记总数 |
| `noBookReviewCount` | number | 无书籍关联的评论数 |
| `hasMore` | number | 0=无更多，1=有更多 |
| `books` | array | 书籍列表 |

books[].book 对象：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID。公众号账号以 `MP_WXS_` 开头 |
| `title` | string | 书名 |
| `author` | string | 作者 |
| `cover` | string | 封面 URL |
| `type` | number | 0=普通书，3=公众号 |
| `price` | number | 价格（元） |
| `payType` | number | 付费类型 |
| `format` | string | 格式，如 "epub" |
| `bookStatus` | number | 书籍状态 |
| `finished` | number | 0=未完结，1=已完结 |
| `free` | number | 0=付费，1=免费 |
| `ispub` | number | 0=未出版，1=已出版 |
| `publishTime` | string | 出版时间，格式 "YYYY-MM-DD 00:00:00" |
| `isbn` | string | ISBN 号 |
| `categories` | array | 分类信息，每项含 `categoryId` / `subCategoryId` / `title` |
| `translator` | string | 译者（普通书可能有） |

books[] 外层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `reviewCount` | number | 书评数 |
| `noteCount` | number | 笔记数 |
| `bookmarkCount` | number | 划线数 |
| `markedStatus` | number | 标记状态 |
| `readingProgress` | number | 阅读进度 |
| `sort` | number | 排序值，用于翻页游标 |

**翻页逻辑：** 用 `lastSort` 游标翻页。取上一页最后一条的 `sort` 值作为下一页的 `lastSort`。当 `hasMore === 0` 或 `books` 为空时停止。

**项目用途：** 获取有笔记书籍列表，保存到 `temporary_weread_notebooksList`，用于同步时判断哪些书有笔记。

**注意事项：**
- 公众号账号和普通书混在同一个 `books` 数组中，通过 `book.type === 3` 或 `bookId` 以 `MP_WXS_` 开头区分。
- 公众号书的 `isbn` / `publishTime` / `translator` 通常为空。

---

### 4.3 `/shelf/sync` — 获取书架全量数据

**请求参数：** 无业务参数。

**返回结构：**
```json
{
  "mp": {
    "show": 1,
    "book": {
      "bookId": "mpbook",
      "title": "文章收藏",
      "cover": "https://weread-1258476243.file.myqcloud.com/app/assets/bookcover/book_cover_app_favorite_articles.png",
      "secret": 1,
      "payType": 32,
      "paid": 0,
      "updateTime": 1754730119,
      "readUpdateTime": 1755766074,
      "isTop": false
    }
  },
  "albums": [
    {
      "albumInfo": {
        "albumId": "0000000001",
        "name": "专辑名称",
        "authorName": "主播名",
        "cover": "https://wehear-1258476243.file.myqcloud.com/hemera/cover/...",
        "updateTime": 1757686622,
        "payType": 1,
        "type": 0,
        "trackCount": 192,
        "finishStatus": "已完结",
        "finish": 1,
        "off": 0,
        "intro": "专辑简介...",
        "free": 0
      },
      "albumInfoExtra": {
        "albumId": "0000000001",
        "secret": 0,
        "lecturePaid": 0,
        "lectureReadUpdateTime": 1742638700,
        "isTop": false
      }
    }
  ],
  "archive": [],
  "books": [
    {
      "bookId": "00000002",
      "title": "书名",
      "author": "作者名",
      "cover": "https://cdn.weread.qq.com/weread/cover/...",
      "category": "分类-子分类",
      "finishReading": 1,
      "readUpdateTime": 1719031144,
      "secret": 0,
      "updateTime": 1760166679
    }
  ]
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `mp` | object | 公众号相关，包含 `show` 和 `book`（文章收藏） |
| `albums` | array | 听书 / 讲书专辑列表 |
| `archive` | array | 归档书籍 |
| `books` | array | 书架书籍列表（普通书 + 公众号账号混在一起） |

books[] 项：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID。公众号账号以 `MP_WXS_` 开头 |
| `title` | string | 书名 |
| `author` | string | 作者 |
| `cover` | string | 封面 URL |
| `category` | string | 分类，如 "政治军事-军事" |
| `finishReading` | number | 0=未读完，1=已读完 |
| `readUpdateTime` | number | 阅读更新时间戳 |
| `secret` | number | 私密标记 |
| `updateTime` | number | 更新时间戳 |

**项目用途：**
- 获取书架全量数据，用于书架视图展示。
- 普通书和公众号账号混在 `books` 中，通过 `bookId` 前缀 `MP_WXS_` 区分。
- 阅读统计中也用此接口获取书架条目统计。

**注意事项：**
- `MP_WXS_` 开头的是公众号账号。
- `books` 中不包含书籍详情（如 isbn / publisher / intro 等），需要额外调用 `/book/info`。

---

### 4.4 `/book/info` — 书籍详情

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | 是 | 书籍 ID |

**返回结构（普通书）：**
```json
{
  "bookId": "00000001",
  "title": "书名",
  "author": "作者名",
  "cover": "https://cdn.weread.qq.com/weread/cover/...",
  "publisher": "出版社名",
  "intro": "本书是一部从某角度讲述某领域发展历程的书籍...",
  "newRatingCount": 7110,
  "newRating": 909,
  "category": "经济理财-财经",
  "isbn": "9787111000000",
  "newRatingDetail": {
    "good": 6571,
    "fair": 424,
    "poor": 115,
    "recent": 96,
    "deepV": 1677,
    "myRating": "",
    "title": "神作"
  },
  "publishTime": "2021-11-01 00:00:00"
}
```

**返回结构（公众号账号）：**
```json
{
  "bookId": "MP_WXS_0000000001",
  "title": "公众号名称",
  "author": "公众号",
  "cover": "http://wx.qlogo.cn/mmhead/...",
  "publisher": "",
  "newRatingDetail": {
    "good": 11,
    "fair": 0,
    "poor": 0,
    "recent": 0,
    "deepV": 0,
    "myRating": "",
    "title": "评分不足"
  },
  "intro": "公众号简介...",
  "publishTime": "",
  "isbn": "",
  "newRatingCount": 11,
  "newRating": 0
}
```

**关键字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID |
| `title` | string | 书名 |
| `author` | string | 作者 |
| `cover` | string | 封面 URL |
| `publisher` | string | 出版社（公众号通常为空） |
| `intro` | string | 书籍简介 |
| `category` | string | 分类（公众号通常无此字段） |
| `isbn` | string | ISBN（公众号通常为空） |
| `publishTime` | string | 出版时间，格式 "YYYY-MM-DD 00:00:00" |
| `newRating` | number | 评分（十分制，909 = 9.09 分） |
| `newRatingCount` | number | 评分人数 |
| `newRatingDetail` | object | 评分详情 |

newRatingDetail：
| 字段 | 类型 | 说明 |
|------|------|------|
| `good` | number | 好评数 |
| `fair` | number | 一般数 |
| `poor` | number | 差评数 |
| `recent` | number | 近期评分数 |
| `deepV` | number | 资深会员评分数 |
| `myRating` | string | 我的评分 |
| `title` | string | 评标签，如 "神作" / "好评如潮" / "评分不足" |

**项目用途：** 普通书同步时获取书籍详情（书名 / 作者 / 封面 / ISBN / 出版社 / 简介等）。公众号账号同步时也调用此接口获取账号基本信息。

**注意事项：**
- **不要用 `/book/info` 补公众号文章标题**。公众号文章标题应从 `/review/single` 的 `review.mpInfo.title` 获取。
- 公众号书的 `isbn` / `publishTime` / `publisher` / `category` 通常为空或不存在。

---

### 4.5 `/book/chapterinfo` — 章节信息

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | 是 | 书籍 ID |

**返回结构：**
```json
{
  "bookId": "00000001",
  "synckey": 1228752148,
  "chapterUpdateTime": 1724165112,
  "chapters": [
    {
      "chapterUid": 1,
      "chapterIdx": 1,
      "updateTime": 1706723404,
      "level": 1,
      "title": "封面",
      "wordCount": 1,
      "price": 0,
      "isMPChapter": 0,
      "paid": 0
    },
    {
      "chapterUid": 32,
      "chapterIdx": 2,
      "updateTime": 1712126200,
      "level": 1,
      "title": "版权信息",
      "wordCount": 122,
      "price": 0,
      "isMPChapter": 0,
      "paid": 0
    },
    {
      "chapterUid": 38,
      "chapterIdx": 8,
      "updateTime": 1706723404,
      "level": 2,
      "title": "第一章 章节标题",
      "wordCount": 12686,
      "price": 0,
      "isMPChapter": 0,
      "paid": 0
    }
  ]
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID |
| `synckey` | number | 同步游标 |
| `chapterUpdateTime` | number | 章节更新时间戳 |
| `chapters` | array | 章节列表 |

chapters[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `chapterUid` | number | 章节 UID（唯一标识） |
| `chapterIdx` | number | 章节序号（从 1 开始） |
| `updateTime` | number | 章节更新时间戳 |
| `level` | number | 层级：1=一级标题，2=二级标题 |
| `title` | string | 章节标题 |
| `wordCount` | number | 字数 |
| `price` | number | 价格（-1 表示付费章节） |
| `isMPChapter` | number | 0=普通章节，1=公众号章节 |
| `paid` | number | 0=未付费，1=已付费 |

**项目用途：**
- 普通书同步时获取章节列表，用于划线 / 想法的章节标题补全。
- 热门划线接口返回的 `chapters` 也可用于补章节标题。

---

### 4.6 `/book/bookmarklist` — 个人划线

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | 是 | 书籍 ID |

**返回结构：**
```json
{
  "synckey": 1767056906,
  "updated": [
    {
      "bookId": "00000001",
      "chapterIdx": 12,
      "bookmarkId": "00000001_42_3450-3501",
      "chapterUid": 42,
      "colorStyle": 3,
      "createTime": 1767056906,
      "markText": "这是一段划线文本，内容是书中的某句话。",
      "range": "3450-3501",
      "type": 1
    }
  ],
  "removed": [],
  "chapters": [
    { "chapterUid": 42, "chapterIdx": 12, "title": "第五章 章节标题", ... }
  ],
  "book": {
    "bookId": "00000001",
    "title": "书名",
    "author": "作者名",
    "cover": "https://cdn.weread.qq.com/weread/cover/...",
    "payType": 1048577
  }
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `synckey` | number | 同步游标 |
| `updated` | array | 新增 / 更新的划线列表 |
| `removed` | array | 已删除的划线列表 |
| `chapters` | array | 章节信息（可用于补章节标题） |
| `book` | object | 书籍基本信息 |

updated[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID |
| `bookmarkId` | string | 划线 ID，格式如 "bookId_chapterUid_start-end" |
| `chapterUid` | number | 章节 UID |
| `chapterIdx` | number | 章节序号 |
| `colorStyle` | number | 颜色样式 |
| `createTime` | number | 创建时间戳 |
| `markText` | string | 划线文本 |
| `range` | string | 范围，格式 "start-end" |
| `type` | number | 类型，1=划线 |

**项目用途：** 普通书同步时获取用户的个人划线数据。

---

### 4.7 `/review/list/mine` — 个人书评 / 想法

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `bookid` | string | 是 | — | 书籍 ID（注意参数名是小写 `bookid`） |
| `synckey` | int | 否 | 0 | 翻页游标 |
| `count` | int | 否 | 20 | 每页数量 |

**返回结构（普通书）：**
```json
{
  "synckey": 1777394009,
  "totalCount": 3,
  "reviews": [
    {
      "reviewId": "00000001_xxxxxxxx",
      "review": {
        "abstract": "这是划线原文的摘要内容...",
        "atUserVids": [],
        "bookId": "00000001",
        "bookVersion": 1228752148,
        "chapterName": "第三章 章节标题",
        "chapterUid": 40,
        "content": "这是用户写的想法内容",
        "contextAbstract": "",
        "friendship": 0,
        "htmlContent": "",
        "isPrivate": 0,
        "notVisibleToFriends": 0,
        "onlyVisibleOneBook": 1,
        "range": "12721-12785",
        "createTime": 1766550949,
        "title": "",
        "type": 1,
        "chapterIdx": 10,
        "reviewId": "00000001_xxxxxxxx",
        "userVid": 00000001,
        "topics": [],
        "flag": 1073741824,
        "isLike": 0,
        "isReposted": 0,
        "book": {
          "bookId": "00000001",
          "format": "epub",
          "title": "书名",
          "author": "作者名",
          "cover": "https://cdn.weread.qq.com/weread/cover/...",
          "payType": 1048577
        },
        "chapterTitle": "第三章 章节标题",
        "author": {
          "userVid": 00000001,
          "name": "用户名",
          "avatar": "https://thirdwx.qlogo.cn/mmopen/...",
          "nick": "用户名",
          "isDeepV": true,
          "deepVTitle": "资深会员",
          "signature": "",
          "medalInfo": { "id": "M3-0-1000", "desc": "阅读天数", "title": "阅读天数", "levelIndex": 1000 }
        }
      },
      "likesCount": 6
    }
  ],
  "hasMore": 0,
  "removed": []
}
```

**返回结构（公众号）：**
```json
{
  "synckey": 1776665092,
  "totalCount": 1,
  "reviews": [
    {
      "reviewId": "00000002_xxxxxxxx",
      "review": {
        "abstract": "这是公众号文章中的划线摘要...",
        "bookId": "MP_WXS_0000000001",
        "bookVersion": 1776412146,
        "content": "用户写的想法",
        "friendship": 0,
        "isPrivate": 0,
        "notVisibleToFriends": 0,
        "range": "98-184",
        "refMpInfo": {
          "createTime": 1776412116,
          "pic_url": "https://mmbiz.qpic.cn/sz_mmbiz_jpg/...",
          "reviewId": "MP_WXS_0000000001_xxxxxxxx",
          "title": "公众号文章标题"
        },
        "type": 1,
        "reviewId": "00000002_xxxxxxxx",
        "userVid": 00000002,
        "createTime": 1776665092,
        "chapterUid": 1599230761,
        "flag": 0,
        "isLike": 0,
        "isReposted": 0,
        "book": {
          "bookId": "MP_WXS_0000000001",
          "format": "epub",
          "title": "公众号名称",
          "author": "公众号",
          "payType": 32
        },
        "author": {
          "userVid": 00000002,
          "name": "用户名",
          "avatar": "https://thirdwx.qlogo.cn/mmopen/...",
          "nick": "用户名",
          "isDeepV": false
        }
      }
    }
  ],
  "removed": [],
  "hasMore": 0
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `synckey` | number | 同步游标，用于翻页 |
| `totalCount` | number | 总想法数 |
| `reviews` | array | 想法 / 书评列表 |
| `hasMore` | number | 0=无更多，1=有更多 |
| `removed` | array | 已删除的想法列表 |

reviews[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `reviewId` | string | 想法 ID |
| `review` | object | 想法详情 |
| `likesCount` | number | 点赞数 |

review 对象：
| 字段 | 类型 | 说明 |
|------|------|------|
| `reviewId` | string | 想法 ID |
| `bookId` | string | 书籍 ID |
| `content` | string | 想法内容（用户写的笔记） |
| `abstract` | string | 划线原文摘要 |
| `range` | string | 划线范围，格式 "start-end" |
| `chapterUid` | number | 章节 UID |
| `chapterIdx` | number | 章节序号 |
| `chapterName` | string | 章节名称（普通书有） |
| `chapterTitle` | string | 章节标题（普通书有） |
| `createTime` | number | 创建时间戳 |
| `type` | number | 类型：1=想法，其他值可能有不同含义 |
| `isPrivate` | number | 0=公开，1=私密 |
| `refMpInfo` | object | 公众号文章信息（仅公众号有） |
| `book` | object | 书籍基本信息 |
| `author` | object | 作者信息 |

refMpInfo（公众号特有）：
| 字段 | 类型 | 说明 |
|------|------|------|
| `createTime` | number | 文章创建时间戳 |
| `pic_url` | string | 文章封面 URL |
| `reviewId` | string | 文章对应的 reviewId |
| `title` | string | 文章标题 |

**翻页逻辑：** 用 `synckey` 游标翻页。当 `hasMore === 0` 或 `reviews` 为空时停止。如果 `reviews` 为空但 `hasMore` 为 1，也应停止（防止死循环）。

**项目用途：**
- 普通书同步时获取用户的个人想法 / 书评。
- 公众号同步时获取公众号文章的想法。公众号想法中 `refMpInfo` 包含文章标题和封面。

---

### 4.8 `/book/bestbookmarks` — 热门划线

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `bookId` | string | 是 | — | 书籍 ID |
| `chapterUid` | int | 否 | 0 | 章节 UID（0=全部章节） |
| `synckey` | int | 否 | 0 | 增量同步 key |

**返回结构：**
```json
{
  "synckey": 0,
  "totalCount": 20,
  "items": [
    {
      "bookId": "00000001",
      "bookmarkId": "00000001_42_3450-3501",
      "chapterUid": 42,
      "chapterIdx": 12,
      "markText": "这是一条热门划线文本，被很多人标记。",
      "totalCount": 128,
      "range": "3450-3501"
    }
  ],
  "chapters": [
    {
      "chapterUid": 42,
      "chapterIdx": 12,
      "title": "第五章 章节标题",
      ...
    }
  ]
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `synckey` | number | 同步游标 |
| `totalCount` | number | 热门划线总数 |
| `items` | array | 热门划线列表（按热度排序，最多 20 条） |
| `chapters` | array | 章节列表（可用于补章节标题） |

items[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID |
| `bookmarkId` | string | 划线 ID |
| `chapterUid` | number | 章节 UID |
| `chapterIdx` | number | 章节序号 |
| `markText` | string | 划线文本 |
| `totalCount` | number | 划线人数（热度） |
| `range` | string | 划线范围，格式 "start-end" |

chapters[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `chapterUid` | number | 章节 UID |
| `chapterIdx` | number | 章节序号 |
| `title` | string | 章节标题 |

**项目用途：** 普通书同步时获取热门划线数据，写入增强笔记本的 `bestHighlights.bestBookMarks.items`，模板中可通过 `{{#bestHighlights}}{{bestHighlight}}{{/bestHighlights}}` 渲染。

**注意事项：**
- 此接口调用失败不能导致整本书同步失败，应返回空数组 `[]`。
- `markText` 是核心字段，必须存在。
- `chapters` 可用于补章节标题，如果返回中没有 `chapters`，可用 `/book/chapterinfo` 的结果补。

---

### 4.9 `/review/single` — 单条想法详情（公众号文章标题补全）

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `reviewId` | string | 是 | — | 想法 / 评论 ID |
| `commentsCount` | int | 否 | 10 | 拉取评论数量 |
| `commentsDirection` | int | 否 | 1 | 评论排序方向：0=倒序，1=正序 |
| `likesCount` | int | 否 | 10 | 拉取点赞数量 |
| `likesDirection` | int | 否 | 0 | 点赞排序方向：0=倒序 |
| `synckey` | int | 否 | 0 | 增量同步 key |

**返回结构（纯划线公众号文章）：**
```json
{
  "reviewId": "MP_WXS_0000000001_xxxxxxxx",
  "review": {
    "reviewId": "MP_WXS_0000000001_xxxxxxxx",
    "userVid": 10003,
    "type": 16,
    "content": "",
    "createTime": 1774867314,
    "bookId": "",
    "belongBookId": "MP_WXS_0000000001",
    "mpInfo": {
      "originalId": "xxxxxxxxxxxx",
      "doc_url": "https://mp.weixin.qq.com/s?__biz=xxxxxx&mid=xxxxxx&idx=1&sn=xxxxxx&chksm=xxxxxx#rd",
      "pic_url": "https://mmbiz.qpic.cn/sz_mmbiz_jpg/xxxxxx/0?wx_fmt=jpeg",
      "title": "公众号文章标题",
      "content": "点击查看",
      "mp_name": "公众号名称",
      "avatar": "http://wx.qlogo.cn/mmhead/...",
      "time": 1774867314,
      "payType": 0,
      "readNum": 0,
      "likeNum": 0,
      "inner": 0,
      "coverBoxInfo": { "md5": "xxxxxx", "colors": [...] }
    }
  },
  "synckey": 0,
  "htmlContent": "",
  "bookReviewCount": 0
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `reviewId` | string | 想法 ID |
| `review` | object | 想法详情 |
| `synckey` | number | 同步游标 |
| `htmlContent` | string | HTML 内容 |
| `bookReviewCount` | number | 书评数 |

review.mpInfo（公众号文章信息）：
| 字段 | 类型 | 说明 |
|------|------|------|
| `originalId` | string | 公众号文章原始 ID |
| `doc_url` | string | 微信公众号文章链接 |
| `pic_url` | string | 文章封面 URL |
| `title` | string | **文章标题**（核心字段） |
| `content` | string | 摘要 |
| `mp_name` | string | 公众号名称 |
| `avatar` | string | 公众号头像 |
| `time` | number | 发布时间戳 |
| `payType` | number | 付费类型 |
| `readNum` | number | 阅读数 |
| `likeNum` | number | 点赞数 |
| `coverBoxInfo` | object | 封面颜色信息 |

**项目用途：** 公众号同步时，对于只有划线没有想法的文章，通过 `/review/single` 获取 `review.mpInfo.title` 来补全文章标题。

**注意事项：**
- 纯划线（无想法内容）的公众号文章，`review.content` 为空字符串。
- 有想法内容的公众号文章，`/review/list/mine` 返回中已有 `refMpInfo.title`，不需要再调此接口。

---

### 4.10 `/store/search` — 搜索

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `keyword` | string | 是 | — | 搜索关键词 |
| `scope` | int | 否 | 10 | 搜索类型：0=全部，10=电子书，14=微信听书，6=作者，12=全文，13=书单，2=公众号，4=文章 |
| `maxIdx` | int | 否 | 0 | 翻页偏移 |
| `count` | int | 否 | 15 | 每页数量 |

**返回结构：**
```json
{
  "sid": "xxxxxxxx",
  "hasMore": 0,
  "results": [
    {
      "title": "电子书",
      "books": [
        {
          "searchIdx": 1,
          "bookInfo": {
            "bookId": "00000001",
            "title": "书名",
            "author": "作者名",
            "translator": "",
            "cover": "https://wfqqreader-1252317822.image.myqcloud.com/cover/...",
            "payType": 4097,
            "type": 0,
            "soldout": 0,
            "newRatingDetail": { "title": "好评如潮" },
            "newRatingCount": 646,
            "newRating": 894
          },
          "readingCount": 204
        }
      ],
      "scope": 17,
      "scopeCount": 18,
      "currentCount": 3,
      "type": 1
    },
    {
      "title": "作者",
      "type": 21,
      "scope": 6,
      "scopeCount": 57,
      "currentCount": 1
    },
    {
      "title": "文章",
      "type": 6,
      "scope": 4,
      "scopeCount": 321,
      "currentCount": 1
    }
  ]
}
```

**关键字段：**

顶层：
| 字段 | 类型 | 说明 |
|------|------|------|
| `sid` | string | 搜索会话 ID |
| `hasMore` | number | 0=无更多，1=有更多 |
| `results` | array | 搜索结果分组 |

results[]：
| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 分组标题，如 "电子书" / "作者" / "文章" / "书单" |
| `type` | number | 分组类型 |
| `scope` | number | 搜索范围 |
| `scopeCount` | number | 该范围总结果数 |
| `currentCount` | number | 当前返回结果数 |
| `books` | array | 书籍列表（电子书 / 待上架分组有） |

books[].bookInfo：
| 字段 | 类型 | 说明 |
|------|------|------|
| `bookId` | string | 书籍 ID |
| `title` | string | 书名 |
| `author` | string | 作者 |
| `cover` | string | 封面 URL |
| `payType` | number | 付费类型 |
| `type` | number | 0=普通书 |
| `soldout` | number | 0=在售，1=售罄 |
| `newRating` | number | 评分（十分制） |
| `newRatingCount` | number | 评分人数 |
| `newRatingDetail` | object | 评分详情 |

**项目用途：** 搜索书籍、公众号账号、公众号文章。通过 `scope` 参数切换搜索类型。

---

### 4.11 `/readdata/detail` — 阅读统计

**请求参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `mode` | string | 否 | "monthly" | 统计维度：weekly=本周，monthly=本月，annually=本年，overall=总计 |
| `baseTime` | int | 否 | 0 | 基准时间戳（0=当前周期，传历史时间戳可查看历史周期数据） |

**返回结构（weekly）：**
```json
{
  "readTimes": {
    "1779033600": 200,
    "1779120000": 179
  },
  "readDays": 2,
  "totalReadTime": 379,
  "dayAverageReadTime": 189,
  "readLongest": [
    {
      "book": {
        "bookId": "00000001",
        "title": "书名",
        "author": "作者名",
        "translator": "译者名",
        "intro": "书籍简介...",
        "cover": "https://cdn.weread.qq.com/weread/cover/...",
        "format": "epub",
        "type": 0,
        "payType": 1048577,
        "finished": 1,
        "free": 0,
        "ispub": 1,
        "publishTime": "2021-01-01 00:00:00",
        ...
      },
      "readTime": 374,
      "tags": []
    }
  ],
  "rank": {
    "text": "朋友中排第1名",
    "scheme": "weread://fRank"
  },
  "registTime": 1643386721,
  "baseTime": 1779033600,
  "preferBooks": [
    { "type": 13, "title": "我的最爱" },
    { "type": 1, "title": "近期偏爱" },
    { "type": 0, "title": "常读常新" },
    { "type": 5, "title": "思考最多" },
    { "type": 3, "title": "最沉浸的" },
    { "type": 4, "title": "读到深夜" },
    { "type": 7, "title": "第一本阅读" },
    { "type": 6, "title": "最爱品类" },
    { "type": 2, "title": "最爱分享" },
    { "type": 12, "title": "共读最多" },
    { "type": 10, "title": "欣赏小众" },
    { "type": 8, "title": "总有一天读完" }
  ],
  "readDistributionWord": "点评分布",
  "readRecordsWord": "书籍分布"
}
```

**关键字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `readTimes` | object | 每日阅读时长，键为时间戳（秒），值为阅读秒数 |
| `readDays` | number | 阅读天数 |
| `totalReadTime` | number | 总阅读时长，单位**秒** |
| `dayAverageReadTime` | number | 日均阅读时长，单位**秒** |
| `compare` | object | 对比数据（某些 mode 有） |
| `baseTime` | number | 基准时间戳 |
| `readLongest` | array | 阅读时长最长的书籍列表 |
| `readLongest[].readTime` | number | 阅读时长，单位**秒** |
| `readLongest[].book` | object | 书籍基本信息 |
| `readLongest[].tags` | array | 标签 |
| `rank` | object | 排名信息 |
| `rank.text` | string | 排名文本，如 "朋友中排第1名" |
| `rank.scheme` | string | 跳转链接 |
| `registTime` | number | 注册时间戳 |
| `preferCategory` | array | 偏好分类数组 |
| `preferCategory[].categoryTitle` | string | 分类名称 |
| `preferCategory[].readingTime` | number | 该分类阅读时长，单位秒 |
| `preferCategory[].readingCount` | number | 该分类阅读数量 |
| `readStat` | array | 阅读分布统计 |
| `readStat[].stat` | string | 统计项名称，如 读过 / 读完 / 阅读 / 笔记 |
| `readStat[].counts` | string | 统计值，可能带单位，如 3本 / 11天 / 123条 |
| `preferCategoryWord` | string | 偏好分类描述文本 |
| `preferTime` | object | 偏好时段 |
| `preferTimeWord` | string | 偏好时段描述文本 |
| `preferAuthor` | object | 偏好作者 |
| `authorCount` | number | 作者数量 |
| `preferPublisher` | object | 偏好出版社 |
| `preferCp` | object | 偏好内容提供方 |
| `readRate` | object | 阅读比率 |
| `wrReadTime` | number | 微信读书阅读时长 |
| `wrListenTime` | number | 微信听书收听时长 |
| `medals` | array | 勋章列表 |
| `preferBooks` | array | 偏好书籍分类 |
| `preferBooks[].type` | number | 分类类型 |
| `preferBooks[].title` | string | 分类名称 |
| `recordReadingTime` | number | 记录阅读时长 |
| `readRecordsWord` | string | 阅读记录描述 |
| `readDistributionWord` | string | 阅读分布描述 |

**项目用途：** 获取用户阅读统计数据，支持周 / 月 / 年 / 总计四个维度。

**注意事项：**
- `readTimes` / `totalReadTime` / `dayAverageReadTime` / `readLongest[].readTime` 单位都是**秒**。
- `readTimes` 的 key 是时间戳字符串，value 是秒。
- `weekly/monthly` 通常按日聚合，`annually` 通常按月聚合，`overall` 通常按年聚合。
- UI 展示时要根据 `mode` 选择日期粒度。
- `preferBooks` 数组中的 `title` 是分类名称（如 "我的最爱"），不是书名。

---

## 5. 项目使用关系

1. **API Key 验证**使用 `/_list`。
2. **有笔记书籍缓存**使用 `/user/notebooks`，保存到 `temporary_weread_notebooksList`。
3. **普通书同步**组合使用 `/book/info`、`/book/chapterinfo`、`/book/bookmarklist`、`/review/list/mine`、`/book/bestbookmarks`。
4. **公众号账号同步**组合使用 `/book/bookmarklist`、`/review/list/mine`、`/review/single`。
5. **阅读统计**组合使用 `/readdata/detail` 和 `/shelf/sync`。
6. **新书确认**导入后必须保留 `forceBookIDs` / `forceMpBookIDs` 同轮同步语义。
7. **文档匹配优先级**：bookID 精确匹配 > ISBN 归一化匹配 > 唯一书名匹配。
8. **文档没有微信读书同步位置标记**不是失败原因，写入时应自动追加标记。
