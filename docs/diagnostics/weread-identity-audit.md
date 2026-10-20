# 微信读书身份只读审计

源码基线：`7644dc40decc45d355d890d5b8950cd780e4fa99`。本报告只记录不可识别的状态，不包含真实来源名称、身份值、路径、原始响应或笔记内容。

## 真实 API 已验证

- 本机思源鉴权成功。`lsNotebooks` 返回 HTTP 200、code 0，`data.notebooks` 为数组。
- 配置经 `getFile` 读取，在内存中解析；数据库块经 SELECT 定位，属性视图实际结构为 `data.av.keyValues`。
- 来源唯一；通过合法 ISBN 找到唯一数据库候选，匹配禁用标题身份回退。来源名称与数据库标题不同不妨碍该强身份匹配。
- 主键列为 `block`，ISBN 列为 `number`，bookID 列为 `text`。行 ID 来自单元格 `blockID`，文档 ID 来自主键单元格 `block.id`；当前两者相等。单元格自身 `id` 与行 ID 不同，`itemID` 未出现。ISBN 位于 `number.formattedContent`，bookID 的 `text.content` 为空字符串。
- 文档存在且类型为 `d`，绑定类别为 `bound`，`custom-avs` 包含对应 AV。无需补建文档。
- 未发现重复 ISBN 行、精确 bookID 行、目标身份孤立字段冲突、其他来源占用当前文档或重复身份单元格。
- 同步历史存在并指向相同文档，细粒度索引的来源身份及文档指针一致。只读附加检查中，索引管理的块属于该文档；历史与索引时间字段来源不同，不能单凭时间不等判定损坏。
- `pendingImport=false`，未忽略，未设置 BookID 导入偏好，自定义 ISBN 存储缺失。临时来源缓存及历史均为数组。
- 当前属于“ISBN 正确、bookID 为空、文档已绑定”类别。按当前检测代码，此强身份绑定不再作为新来源返回；不能据此推断过去的缓存状态。

## 安装构建与运行时

- 配置的开发部署目标与 API 当前工作空间对应。
- 验收前本地 `dev/index.js` 与 `dist/index.js` 哈希相同；实际安装的 `index.js` 与两者均不同。
- 已安装磁盘文件包含 `claim.column_readback`、`CLAIM_READBACK_FAILED`、`DOCUMENT_INDEX_NOT_VISIBLE` 和只读准备阶段标记，缺少 `APPROVED_SOURCE_NOT_READY`。
- 可以确认安装文件存在版本差异，不能确认哪个提交的 JS 正在内存中运行。**运行时版本尚未确认**。本轮没有部署、重载或停启插件。

## 历史失败阶段与证据限度

保存的目标报告中存在 `ISBN_MATCH_FAILED`、`BOOK_SKIPPED_BY_USER` 分类，但没有可提取的原始 `stage/reasonCode` 诊断片段。`syncReportBuilder.inferReasonCode()` 会按文案归类；`ISBN_MATCH_FAILED` 不是 `claim` 阶段的直接证据。

当前快照对照：

- `isbn.inspect`：合法 ISBN、唯一强身份候选，无目标孤立冲突。
- `note.input`：当前已 `bound`，`ensureExistingBookNoteDocument()` 会直接返回；`note.repair/before_create/create/document/readback` 的历史执行过程无法回放。
- `claim.input`：当前来源、ISBN、文档 ID 满足输入条件，bookID 尚未设置。
- `claim.preflight/document`：当前文档有效；无历史 expected 快照，无法排除当时的身份变化或 SQL 索引延迟。
- `claim.column/column_readback`：当前已有单一 text 列；无法证明过去创建列后的可见时序。
- `claim.before_write`：当前未见占用、重复单元格或共享文档冲突；不能证明历史检查也通过。
- `claim.write/readback`：未执行写入，无法区分“写入失败”与“写入成功但当时回读不可见”。当前为空不能证明从未写入过。

最新源码已包含文档 SQL 可见性重试、成功创建列后的可见性重试、成功写入后的有界回读，以及阶段诊断。它们覆盖对应代码路径，但没有证据证明历史错误正是这些条件，不能宣称真实问题已解决。孤立字段保护、任务快照变化以及部分底层异常仍可能只有通用文案；此次记录不足以把它们认定为根因。

## 同步计划与事务边界：代码审计及 Mock 验证

`runWereadApiSyncTask()` 从用户选择的新来源建立 import 项；已有来源按增量计划建立 update 项，排除未选择的新来源，并按来源类型加 bookID 去重。确认 UI 分别计算 `import_*`、`update`、`ignore`，实际同步数排除 ignore。一本新来源加两本已有来源更新应显示导入 1、更新 2，总同步 3。

最终确认前使用内存缓存和禁止保存的 planningPlugin，迁移选项为 `migrate:false`。取消时不进入 commit；批准后重新比对身份、配置、缓存合并及授权，再保存和执行。批准集合限制重新规划范围，未就绪、消失、目标变化的批准项形成明确失败，导入失败项保持待处理而不强制同步。

现有 smoke 实际通过混合计划、取消零写入、未批准来源排除、批准项失效、目标变化、部分导入失败及连续无变化更新场景。**这是模拟 I/O 证据，不是真实同步/写入验收。**

一个展示口径差异尚未修改：任务 `skippedCount` 目前只相加 `skippedUnchanged`，UI 文案却包括“未就绪”。这不影响导入 1 / 更新 2 的分类，但跳过总量不能当作全部未执行来源总量。

## 可复用工具与验证

运行 `node scripts/diagnose_weread_identity_readonly.cjs --title <来源名称>`，可用 `--url`、`--timeout-ms`；凭据仅从进程环境 `SIYUAN_API_TOKEN` 读取。默认脱敏 JSON 输出，不自行保存文件；应把本地结果留在仓库外。需要已安装的项目 TypeScript 开发依赖，用于复用现有解析、匹配及只读迁移 helper。

请求只准入指定读取端点；SQL 限 SELECT，ID 严格校验；文件不存在、损坏、读取失败分开处理，只有 temporary 的已知历史 null 可兼容。未知结构停止，来源候选歧义不选目标。未加载真实写入实现，不调用 claim、repair、import 或同步任务。

实际验收命令及结果：

- `node scripts/smoke_weread_identity_readonly.cjs`：16 个合成场景通过。
- `node scripts/smoke_weread_book_identity.cjs`：通过，包括标题/副标题、独立身份、文档补建和回读、孤立字段保护、连续无变化更新。
- `node scripts/smoke_weread_sync_confirmation.cjs`：通过，包括混合计划、取消零写入和批准项最终结果。
- `node scripts/smoke_weread_temporary_cache.cjs`：通过。
- `pnpm check`：通过（包含 i18n 与 manifest 检查）。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：通过，均设置 `SIYUAN_SKIP_DEV_DEPLOY=1`，构建前确认工作区 dev 不是安装目录的别名。
- `git diff --check`：通过。没有 lint 脚本，未运行 lint。构建保留已有 Sass、Svelte 未使用导出及外部 import 等警告。

真实 API 调用没有业务写入；没有读取微信授权存储、执行同步、清理、认领或修改用户状态。代码变更仅包括通用诊断脚本、合成测试和本抽象报告。

## 下一轮精确取证位置

首先由用户在可控条件下确认运行时加载版本；本轮不自动部署。随后如需复现，应另行取得写入测试许可并使用备份或独立测试数据，保留以下函数实际抛出的 stage/reasonCode：

- `wereadBookIdentity.ts`：`inspectWereadISBNSourceToDatabase()` 的精确候选及 expectedRowBlockID 检查；`claimWereadBookIDOnExistingRow()` 的 before_write、write、readback 条件。
- `ensureExistingBookNoteDocument.ts`：仅在实际绑定不为 bound 时检查 input、repair、document、readback。
- `runWereadApiSyncTask.ts`：若失败发生在最终确认后，区分任务快照变化与具体认领错误。
- `syncReportBuilder.ts`：核对实际 reasonText 中是否保留原始阶段片段，避免把推断的报告分类当成根因。

没有证据支持直接修改上述业务判断。若只处理跳过数量口径，应另开范围明确的展示任务，核对 `runWereadApiSyncTask()` 与 `WereadSyncPlanConfirmDialog.svelte`。

**结论：当前只读证据不足，仍需验证实际运行时版本和原始失败阶段；尚未确认历史导入失败的根因。**
