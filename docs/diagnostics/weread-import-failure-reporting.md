# 微信读书新来源导入失败：报告诊断链路

本轮基线：`1c77cc8a7a9279f5c23ec2bff29c7dc44fe05b96`。本次只修改诊断传递、分类和展示，不改变身份匹配、文档补建、认领、回读及自动同步的业务决策。

## 旧报告为什么可能误导

身份处理模块的 Error 已带有 `stage`、`reasonCode` 和控制台诊断快照，但普通书及 BookID 导入 catch 只传递 message。任务追加导入失败报告时没有指定高层原因和建议；正常同步报告又可能因为 message 中出现 ISBN 和“失败”，推断为 `ISBN_MATCH_FAILED`。这不足以区分 ISBN 匹配失败与匹配之后的认领、绑定、验证失败。

例如 `claim.readback / CLAIM_READBACK_FAILED` 证明此次错误来自认领回读；即使 message 提到 ISBN，也不能改称 ISBN 缺失。只有高层原因码而没有可信阶段，同样不能推断实际失败发生在回读。

## 两层诊断与传递

`extractWereadBookIdentityFailure(error)` 仅接受真实 Error 自有的数据属性。阶段必须属于当前模块定义的 isbn/claim/note 阶段集合，精确原因码必须是长度不超过 64 的大写英文数字下划线码。访问器属性、未知阶段、普通对象和不合法码均不接受。它不读取 message、stack 或 diagnostic。

普通书和 BookID 导入失败结果统一使用 `WereadNewSourceImportFailure`，可选 `identityFailure` 只包含 stage/reasonCode。原有部分写入警告、成功来源集合及 pendingImport 逻辑保持不变。公众号导入不强行附加普通书身份诊断。

任务将失败结果传给统一报告项构建函数，明确生成失败状态、来源、标题、分类、建议、零新增笔记数及可读说明；不再展开完整失败对象到报告。精确诊断保留为 reasonText 末尾的 `[stage/reasonCode]`，同一标记只保留一次。没有新报告存储格式，也没有历史数据迁移。

分类规则：

- `isbn.inspect / ISBN_MATCH_MISSING` 或 `isbn.inspect / ISBN_MISMATCH` → `ISBN_MATCH_FAILED`。
- 其他有效身份流程诊断，包括 isbn.link、claim 的输入/预检/文档/列/写前/写入/回读，以及 note 补建、绑定与验证 → `BOOK_IDENTITY_LINK_FAILED`。具体失败仍以标记中的真实阶段及原因区分。
- 新来源导入异常没有可信结构化信息 → `UNKNOWN_ERROR`，保留必要说明，不制造 claim 阶段。ISBN 格式错误、孤立字段错误及底层未携带结构化属性的异常，不能凭文字升级为确定的认领失败。
- 普通书/公众号原有正常同步结果继续使用原分类；删除“出现 ISBN 和失败就认定匹配失败”的宽泛规则。已有历史报告原样可读。

正常同步的兼容识别仅接受生成器的固定中英文“本地状态变化”或“回读验证失败”说明，加合法阶段/精确码的完整末尾标记；任意外部方括号文本不参与身份分类。这属于历史文本推断，不等同于本轮从 Error 数据属性取得的直接结构化证据，也不用于构造 identityFailure。没有匹配这类限定文本时，保留既有通用分类或 UNKNOWN_ERROR。

## 查看报告与建议

同步结果中心已有的 managementData 消费 reasonText/suggestion，无需增加页面。新增中英文身份关联建议，提示检查已有 ISBN、bookID 和笔记绑定，在书籍管理“身份关联”中检查符合条件的记录，避免反复导入。英文界面将未知中文说明转为通用诊断提示时保留末尾诊断标记；这只是显示文本，不把标记提升为可信的结构化异常。

报告继续经原 readingStorage 保存，并应用原失败/成功状态。报告项只显式写入现有字段，不带完整 Error、属性视图 JSON、调试快照或堆栈。现有凭据脱敏扩展至 `Authorization: token` 形式；不应将凭据放进异常文案。

MCP 的报告读取验证将 reasonCode 作为可选字符串，不枚举原因码，因此能读取新增分类；本轮未修改 MCP 接口或 Kernel 源码。

## 合成验证与证据限制

`node scripts/smoke_weread_import_failure_diagnostics.cjs` 实际执行 22 个场景通过，覆盖各类阶段、无结构化异常、重复标记、安全字段、BookID/普通书/公众号、旧报告读取和中英文显示。多组测试执行真实 commit catch → 同步任务 → 报告构建 → 原存储及状态保存代码，仅外部 I/O 和宿主使用合成数据。

测试核对业务写入计数：失败来源不进入强制同步，未增加认领/文档创建/笔记写入；部分失败保持待处理，失败报告只记一次；取消保持零持久化写入和零报告；一新来源加两已有来源仍为 1 import + 2 update，失败新来源不阻止两项已批准更新。

本轮实际完整回归：身份补全 smoke 22 项、只读探针 smoke 11 项、只读诊断 smoke 16 项，以及书籍身份、同步确认、临时缓存 smoke 全部通过。`pnpm check`（中英文各 1171 项及 manifest）、`pnpm exec tsc --noEmit`、`pnpm build` 均退出码 0。没有 lint 脚本；已有 Sass、unused export/import 及 npm 环境警告保留。构建只同步仓库 dev 目录，实际安装文件构建前后哈希不变；kernel.js 哈希也保持不变。未重复执行独立 app/kernel 构建。

这些结果不能证明历史真实错误已经定位。没有当时的可信 stage/reasonCode 或日志，不能将历史的通用“本地状态变化”确定为 CLAIM_READBACK_FAILED，也不能用当前 eligible 检查倒推此前失败阶段。

本轮没有执行真实导入、身份补全、笔记同步、数据库修改、缓存重置、部署、重载或思源重启；没有对用户真实书籍进行写入。构建设置 `SIYUAN_SKIP_DEV_DEPLOY=1`。最新版仍未获得真实部署及 UI 验收，须用户未来明确授权后另行验证实际错误报告、原生界面和受控操作。
