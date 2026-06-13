# 项目代码结构开发规范

本项目是一个长期维护的思源笔记插件。后续新增功能、重构功能、修复问题时，必须优先保持代码结构清晰、职责单一、便于维护，避免为了快速实现而把多个功能堆进同一个文件。

## 一、基本原则

1. 新增功能前，必须先分析现有代码结构，优先复用已有工具函数、组件、类型和业务流程。
2. 不要在一个文件里混合多个不相关功能。
3. 一个文件夹下应尽量只放同一类职责的实现。
4. UI 组件、业务逻辑、数据适配、类型定义、存储逻辑、接口调用应尽量分层。
5. 不要把复杂业务逻辑直接写在 Svelte 组件里。
6. 不要把大量 UI DOM 拼接逻辑写在 `src/index.ts` 中。
7. 不要为了单点修复而破坏整体结构。
8. 如果一个文件明显过长，应优先拆分为更小的组件或工具模块。
9. 新增文件和目录命名必须清晰表达职责。
10. 所有修改必须尽量低风险，不破坏现有功能。

## 二、推荐目录划分

### 组件目录

页面级组件建议放在：

```text
src/components/<feature-name>/
```

例如：

```text
src/components/readingCenter/
src/components/readingInbox/
src/components/syncReport/
src/components/bookStatus/
src/components/readingTopics/
```

组件目录内部可以继续拆分：

```text
src/components/readingCenter/ReadingCenter.svelte
src/components/readingCenter/ReadingDashboardCards.svelte
src/components/readingCenter/ReadingQuickActions.svelte
src/components/readingCenter/RecentNoteChanges.svelte
src/components/readingCenter/ReadingStatusPanel.svelte
```

### 业务逻辑目录

与 UI 无关的业务逻辑建议放在：

```text
src/utils/<feature-name>/
```

例如：

```text
src/utils/readingCenter/
src/utils/readingInbox/
src/utils/syncReport/
src/utils/bookStatus/
src/utils/readingTopics/
```

### 类型定义目录

跨组件、跨模块使用的类型建议放在：

```text
src/types/
```

例如：

```text
src/types/readingCenter.ts
src/types/readingInbox.ts
src/types/syncReport.ts
src/types/bookStatus.ts
src/types/readingTopic.ts
```

### 存储逻辑目录

本地配置、缓存、状态读写建议统一放在：

```text
src/utils/storage/
```

例如：

```text
src/utils/storage/readingStorage.ts
src/utils/storage/syncReportStorage.ts
src/utils/storage/bookStatusStorage.ts
```

不要让各个组件直接到处读写插件配置，避免后续难以维护。

## 三、文件职责要求

### Svelte 组件

Svelte 组件主要负责：

- 展示 UI；
- 响应用户交互；
- 调用外部业务函数；
- 维护少量页面状态。

Svelte 组件不应承担：

- 复杂数据适配；
- 接口请求细节；
- 大量本地缓存读写；
- 大段同步流程；
- 多个功能模块混杂逻辑。

### utils 文件

工具函数应保持职责单一。

例如：

- `readingCenterData.ts` 只负责阅读中心数据聚合
- `syncReportBuilder.ts` 只负责同步报告生成
- `bookStatusManager.ts` 只负责书籍状态读写和计算

不要把阅读中心、同步报告、书籍状态、收件箱逻辑全部塞进一个 utils 文件。

### index.ts

`src/index.ts` 是插件入口文件，只应负责：

- 插件生命周期；
- 注册命令；
- 注册顶栏按钮；
- 注册自定义 tab；
- 初始化必要服务；
- 调用其他模块。

不要在 `src/index.ts` 中写复杂页面逻辑、同步业务逻辑或大量 DOM 结构。

## 四、新功能开发要求

每次新增功能前，必须先做以下分析：

- 使用 codegraph 分析当前相关代码结构；
- 找出已有实现；
- 判断是否可复用；
- 判断是否需要新建目录；
- 给出最小改动方案；
- 使用 diff 代码模式输出修改。

新增功能时必须遵守：

- 优先新增独立组件和工具模块；
- 不要直接大范围修改已有核心流程；
- 不要把新功能塞进已有大文件；
- 不要把临时逻辑写成长期结构；
- 不要新增重复实现；
- 不要破坏现有功能。

## 五、微信读书同步相关限制

涉及微信读书 API Key 主线时，必须遵守：

- 不恢复 Cookie fallback；
- UI 不出现 skills / v3 / Cookie；
- 请求体字段 skill_version 必须保留；
- 不要改动已验证的同步主链路；
- 不要并发写入思源文档；
- 不要记录 API Key 到日志；
- 不要调用未确认接口；
- 不要假装支持官方 API 不存在的字段。

## 六、检查要求

每次修改完成后，必须执行：

```bash
npx tsc --noEmit
npm run build
```

确保 TypeScript 编译无错误，构建成功。
