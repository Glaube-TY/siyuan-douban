# WeRead bookID 身份补全：本机运行验收

## 后续部署预检（基线 5349a38）

本轮起点为 `5349a38f21851c44d405d2d91e296a6dfa9b44c1`，工作区干净，远端 main 相同。用户在本轮明确选择：**“暂不部署，完成预检与报告”**。没有取得部署或重载许可，没有执行本地终端同意门槛，也没有进行备份、部署、插件启停或服务重启。

真实客户端发现结果与授权分别记录：

- Windows 控制工具找到正在运行的思源 v3.8.7 客户端；窗口截图两次超时，只读可访问性树没有可操作的业务控件，未能检查设备开关。
- Chrome DevTools 和 Playwright 均因本机缺少所配置的 Chrome 可执行文件无法连接。没有安装浏览器，没有以新浏览器 origin 的默认设置代替真实客户端设置。
- 实际客户端 `autoSync`、当前微信读书任务及思源同步任务仍未确认；不能宣称关闭或空闲。本轮未触发同步，没有修改设置。
- 没有再次运行纯模拟 UI 验收，也没有将上一轮模拟结果计作本轮真实 UI 通过。

新增 `scripts/preflight_weread_plugin_deploy.cjs`，默认且始终只读。通过真实 API 校验笔记本响应并取得工作空间，复用现有部署目标解析；检查插件名、路径归属、目录重叠、根目录及嵌套符号链接、构建完整性、dev/dist 全文件一致性、未知文件、部署标记及已知并发进程。脚本不调用部署函数，不提供写入 API，错误不输出原始路径或进程命令行。

只读运行方法（凭据仅从安全环境传入）：

```text
node scripts/preflight_weread_plugin_deploy.cjs
```

本轮真实预检：目标工作空间匹配、插件名正确、无路径重叠、无符号链接，未发现额外安装文件或已知并发 watch/deploy 进程。拟增加 0 个、拟删除 0 个，拟覆盖 `index.js`、`index.css`、`i18n/en_US.json`、`i18n/zh_CN.json`。未知额外文件即使看起来是旧产物也会阻止就绪，绝不自动删除。进程检查仅覆盖可识别的 watch/deploy 命令，不能证明所有客户端内部任务空闲。

提交前预检返回 `WORKTREE_DIRTY`，这是本轮新增工具及报告尚未提交的正常阻止条件，没有绕过。`filesReady` 仅指文件和进程预检结果；脚本始终返回 `clientSafetyConfirmed: false`、`deploymentPerformed: false`，不能当作部署授权。

本轮重新执行生产候选只读探针，仍返回匹配 1、eligible 1、`BOOKID_MISSING`，conflict/invalid_binding/already_linked 均为 0。真实 UI 未打开候选确认，因此没有“真实取消前后”对比结果；不以本轮没有调用业务写入等同于完成真实取消零写入验收。

本轮实际执行且退出码为 0：

- 新部署预检 smoke：9 个合成场景，覆盖干净/脏工作区、额外文件保留、增改计划不执行、错误工作空间和插件、构建缺失和不一致、未知来源文件、目录链接及并发进程识别。
- 身份补全 smoke 22 项、探针 smoke 11 项、只读诊断 smoke 16 项，以及身份匹配、同步确认、临时缓存 smoke 全部通过，均为 Mock I/O。
- `pnpm check`、`pnpm exec tsc --noEmit`、`pnpm build` 通过。只执行一次完整 build，包含 app/kernel/sync-dev，全程设置 `SIYUAN_SKIP_DEV_DEPLOY=1`；仓库内镜像 copied 0 / unchanged 13 / deleted 0。
- 新构建的身份关联、缺少 bookID 及快照保护实现标记存在；dev/dist 与已安装公共文件 SHA-256 与下方记录相同，安装文件未变。
- 没有 lint 脚本；现有 Sass、unused export/import 和 npm 配置警告仍在。

源码审阅中，前端卸载清理协调器、计时器、监听器及组件；Kernel shutdown 注销能力及 RPC，没有发现该卸载路径删除用户持久化数据。本轮没有实际重载，不能把源码审阅当作生命周期运行验收。

仍未验证新版内存加载、身份关联标签、真实二次确认/取消、其他四个标签、真实 Console/Network 和窄窗口排版。本轮未发现有真实 UI 复现证据的生产缺陷，没有修改生产代码。后续须取得新一次明确许可及终端同意输入，确认实际开关与任务状态后再备份、受控部署和重载；现阶段不具备直接进行真实单书补全写入的验收条件。

## 上一轮已完成的证据

验收日期：2026-10-20。被测生产代码提交：`32ff36db3be420bcbdf46eab53b499d129da006f`；开始时 HEAD 与远端 main 一致，工作区干净。本轮仅新增只读探针、合成测试及本报告，没有修改生产代码、版本号或发布配置。

## 结论与安全边界

真实思源 API 已连接，生产候选检查函数针对本次筛选对象返回唯一 `eligible / BOOKID_MISSING` 候选。最新本地构建包含身份关联功能，但实际安装的前端文件仍是不同构建；未确认客户端内存版本。

**未进行真实部署或重载。** 可用工具无法访问实际运行的思源客户端 origin 下的 localStorage，也无法确认当前微信读书及思源同步任务是否空闲。代码中的默认 `autoSync: false` 不能代替实际设备状态证据。按任务规定，安全条件不成立时保留安装目录，继续只读和合成验收。

本轮没有调用真实身份补全、导入或同步函数，没有向用户数据库、笔记、缓存、历史、设置或 localStorage 写入；未点击真实业务最终确认。没有进行安装步骤，因此没有制作部署备份。此结论描述本轮工具执行范围，不保证其他正在运行的客户端没有独立活动。

## 构建、安装与路径核对

通过真实 API 确定当前工作空间；对路径解析及真实路径进行检查：配置部署目标与当前工作空间插件目录一致，插件名为 `siyuan-douban`，仓库 dev/dist 与实际安装目录没有路径重叠。检查部署脚本现有的目标验证、镜像与覆盖保护，未绕过或调用真实部署。

对进程检查排除检查器本身及其父进程后，没有发现明确匹配本仓库的 watch/deploy 进程。这不证明客户端内部任务空闲，也不排除所有外部写入者。

SHA-256（均为公共插件生成文件，无用户数据）：

- dev/dist `index.js`：`0417f0c64cd04b5f7c29d4777434062e44d7cb0056606dace87258cc14ce4343`
- 已安装 `index.js`：`f6d065cff8abb27e715a9ad574ce8a56299b54368b4fb02bf61de3e5dfedac2c`
- dev/dist/已安装 `kernel.js`：`57a037f9935e940bc93887211135c89fbed6a9cccc174a7c04bc8b25f52df7d8`
- dev/dist/已安装 `plugin.json`：`b10bd4e533fe56163ac42a6906ab47e04b0a17ced84ab6986995816f0f31bcf3`

构建前后真实安装文件哈希保持不变。dev 与 dist 一致；dist 包含新身份关联实现，已安装前端未找到该实现标记。不能用版本号或磁盘哈希推断客户端已经加载新版。

构建均设置 `SIYUAN_SKIP_DEV_DEPLOY=1`。dist 正常生成前端、kernel、manifest、i18n 及插件资源；最终构建仅执行仓库内 dist→dev 镜像，未部署到真实插件目录。

## 真实思源 API：只读证据

实际调用 `/api/notebook/lsNotebooks` 成功，鉴权及响应结构检查通过。探针复用现有 `createClient()`，只开放文件读取、SELECT SQL、属性视图及笔记本读取；生产 API 的其余函数和插件 saveData 均为拒绝调用的保护桩。

新脚本直接加载生产 `inspectWereadBookIDRepairCandidates()`，没有实现另一套身份算法，也没有暴露修复入口。标题参数只筛选服务返回的候选；零匹配或多个匹配不能进入确认流程。仓库脚本仅从 `SIYUAN_API_TOKEN` 获取凭据；本次凭据仅经本机临时进程环境传入，没有写入仓库或报告。

实际运行的脱敏结果：

```json
{
  "inspection": { "status": "ok", "reasonCode": "INSPECTED" },
  "matchedCandidateCount": 1,
  "eligibleCount": 1,
  "conflictCount": 0,
  "invalidBindingCount": 0,
  "alreadyLinkedCount": 0,
  "targetStatus": "eligible",
  "targetReasonCode": "BOOKID_MISSING",
  "canEnterConfirmation": true
}
```

这证实本次实际存储能通过生产服务的 ISBN 强身份、历史记录、唯一行、文档类型与 AV 绑定等只读校验，当前可进入用户确认流程。**没有证实真实补全写入成功**，也没有证实实际客户端新版 UI 已加载。

可复用命令（先在本地安全环境设置凭据；不要将凭据作为命令参数）：

```text
node scripts/probe_weread_bookid_repair_readonly.cjs --title <本机目标标题>
```

报告不包含真实标题、ISBN、bookID、数据库或文档 ID、原始响应及同步历史。

## 浏览器合成 UI：实际渲染，非真实插件验收

在仓库外启动独立测试页面，加载实际生产 Svelte 面板、候选服务及中英文语言包，所有存储、SQL、AV 与 SiYuan Dialog 使用合成适配器。没有连接用户数据库，没有使用真实凭据；这不是独立思源工作空间，也不是安装插件管理入口的实际运行。

实际通过浏览器操作与 DOM 计数检查：

- 中文、英文均渲染唯一候选；来源与本地书名分别显示，ISBN 和状态正确展示合成数据。
- 重新检查只增加读取计数；打开二次确认显示操作范围，初始键盘焦点在取消按钮。
- 点击取消，以及取消按钮获得焦点后按 Enter，均关闭弹窗，计数保持 `writes=0; saves=0`。
- 强制读取失败显示 `STORAGE_READ_FAILED`，恢复后重新检查成功，不将失败展示为空候选成功。
- 延迟读取期间销毁面板，迟到结果没有重建已销毁 UI；重新挂载后正常读取。
- 实际 viewport 320×844、480×800、1280×900 均检查；各自文档 scrollWidth 等于 viewport 宽度。手机英文确认框长标题换行，取消按钮可见且聚焦。
- 浏览器 warn/error 日志查询为空；没有观察到该合成页面的 Svelte 运行异常。

合成 UI 计数和真实 API 候选计数属于两份独立证据，不能用数量相同声称 UI 已连接真实数据。模拟 Dialog 不足以验证真实 SiYuan SDK 的焦点管理、主题和生命周期。

**未验证：** 真实管理入口、新增标签挂载、其他四个管理标签、真实客户端 Console/Network、插件热重载及原生 Dialog 生命周期。未在真实 UI 打开或取消身份补全确认，更未执行最终补全。

## 实际执行的自动化检查

下列命令均实际执行并以退出码 0 完成，非根据脚本中的 PASS 文案推断：

- `node scripts/smoke_weread_bookid_repair_probe.cjs`：11 个合成场景通过，覆盖唯一候选、歧义、已关联、冲突、无文档、损坏/拒读、历史空状态、公众号排除、只读限制及输出脱敏。
- `node scripts/smoke_weread_bookid_repair.cjs`：22 个场景通过。
- `node scripts/smoke_weread_identity_readonly.cjs`：16 个场景通过。
- `node scripts/smoke_weread_book_identity.cjs`：全部通过。
- `node scripts/smoke_weread_sync_confirmation.cjs`：全部通过，包含 1 import + 2 update、取消零写入、批准项不可用及部分失败报告。
- `node scripts/smoke_weread_temporary_cache.cjs`：全部通过。
- `pnpm check`：中英文 i18n 各 1170 项及 manifest 检查通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build:app`、`pnpm build:kernel`、`pnpm build`：均通过。

package.json 没有 lint 脚本，未执行 lint。构建保留已有 Sass legacy API、Svelte unused localMatch、unused I18N 及 npm 环境配置警告；未因本轮新增脚本产生构建失败。身份 smoke 的负向用例出现预期 SQL 格式错误日志，最终命令退出码为 0。

这些 Mock 测试验证安全认领、写前快照、同步计划与缓存契约，不能代替真实账户同步、真实 SDK 或真实写入验收。自动同步入口没有新增身份修复调用；本轮未改变 MCP/Kernel 生命周期代码。

## 未完成项与下一步

本轮已运行路径未发现需修改生产代码的具体缺陷；原生客户端加载及 Dialog 生命周期缺少证据，不能据此排除原生集成问题。

下一步应先取得实际客户端可观察的设备 autoSync 值和任务状态，确认无同步及部署竞争；满足安全条件后在仓库外备份生成文件，使用现有受保护部署流程，单独核实重载及内存版本。随后在真实管理入口检查标签、只读刷新和取消零写入。

当前还不适合直接进入真实单书补全写入验收。完成上述部署和真实取消验收，并取得明确单书写入授权及备份确认后，才能进行一次受控补全，再只读回查身份与历史。
