# 微信读书旧接口纪念版（Cookie / Web 接口）

> 本文档仅作为历史记录。旧接口已废弃，不再维护，不再恢复 fallback。
> 当前项目只使用 API Key / 官方接口模式，详见 `weread-api-reference-current.md`。

## 旧接口特点

1. 使用 Cookie 鉴权。
2. 通过 `forwardProxy` 请求微信读书 Web 接口。
3. 请求头里带 Cookie。
4. 部分接口是 GET，章节接口曾使用 Electron 隐藏窗口执行 fetch。
5. 旧接口已经废弃，仅作为历史记录。

## 旧接口清单

| 旧方法 | 请求方式 / URL | 作用 |
|--------|---------------|------|
| `getNotebooks` | GET `https://weread.qq.com/api/user/notebook` | 获取有笔记书籍 |
| `getBook` | GET `https://weread.qq.com/web/book/info?bookId=xxx` | 获取书籍详情 |
| `getBookShelf` | GET `https://weread.qq.com/web/shelf/sync?...` | 获取书架 |
| `getBookHighlights` | GET `https://weread.qq.com/web/book/bookmarklist?bookId=xxx` | 获取划线 |
| `getBookComments` | GET `https://weread.qq.com/web/review/list?...` | 获取评论 / 想法 |
| `getBookBestHighlights` | GET `https://weread.qq.com/web/book/bestbookmarks?bookId=xxx` | 获取热门划线 |
| `getBookChapterInfos` | POST `https://weread.qq.com/web/book/chapterInfos` | 通过隐藏窗口执行 fetch，获取章节信息 |

## 旧接口返回概要

1. 有笔记书籍返回 `books`。
2. 书籍详情返回 `bookId` / `title` / `author` / `cover` / `isbn` / `publisher` 等。
3. 划线返回 `updated` 数组。
4. 评论返回 `reviews`。
5. 热门划线返回 `items`。
6. 章节返回章节列表。

## 迁移说明

1. 旧 Cookie 接口已删除或拆分，不再恢复。
2. 旧接口里的能力基本迁移到当前 API Key 接口。
3. AI 总结没有迁移，因为当前官方 API 不提供。
4. 热门划线已迁移到 `/book/bestbookmarks`。
5. 公众号同步是当前接口模式下新增和完善的能力。
