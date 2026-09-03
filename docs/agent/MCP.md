# MCP 与 Kernel Plugin 规则

本文件适用于 MCP、Kernel Plugin、Agent Capability、外部工具接口和 `kernel.js` 的修改；不适用于普通前端 UI 修改。

## 架构边界

- MCP 能力必须由 Kernel Plugin 通过 `siyuan.agent.registerCapability` 注册，禁止在前端重新实现独立 MCP Server。
- 外部能力必须使用领域级接口；禁止提供任意 SQL、任意文件读写、任意插件存储读取、任意 HTTP 请求或任意脚本执行等万能工具。
- Kernel Runtime 与 Frontend Runtime 完全独立，不得假定模块变量、锁、缓存或 DOM 状态可以跨 Runtime 共享。
- Kernel 访问插件数据优先使用 `siyuan.storage`；访问思源 API 使用 Kernel Plugin 支持的 `siyuan.client`，禁止依赖前端 `fetchSyncPost`。
- 微信读书同步最终应由 Kernel 成为状态和执行 Owner；迁移完成前，MCP 不得复制或直接调用前端同步流程。

## 数据与安全

- API Token、微信读书 API Key、`apiKeyEncrypted`、思源认证信息、`CRYPTO_KEY`、Authorization Header 和其他 secret 永远不得出现在 MCP 输出、错误或日志中。
- MCP 读取必须遵守根 `AGENTS.md` 的数据规则：读取失败、权限错误、损坏数据和文件不存在必须区分，不能伪装成空数组或默认值。
- 列表能力必须提供有限的分页或等价数量边界；禁止一次返回大型存档。
- MCP 返回值必须是 JSON-safe 的稳定领域对象，不暴露任意底层存储对象或 raw 数据。

## Capability 与生命周期

- Capability 必须正确声明 effects：纯本地读取使用 `{ localRead: true }`；本地写入使用 `localWrite`；访问微信读书、豆瓣等外部服务时才增加 `dataEgress`。
- Capability 本地名称必须稳定；业务代码只能使用本地名称注销，不得硬编码思源生成的带 hash 的最终 Tool 名。
- 注册应集中管理并具备失败回滚；卸载时逐一注销，单项失败不能阻止其余能力清理。
- 第一阶段只读能力不得注册写操作、同步触发器或实时 Runtime 状态桥。

## 存储与写入

- Kernel Adapter 必须复用严格存储边界和安全路径校验；不得把“按 storageName 读取任意文件”注册为 MCP 能力。
- 未来 MCP 写能力必须复用严格 mutation、保存后回读和数据损失保护机制，禁止绕过业务层直接覆盖存储文件。

## 验收

- 每次 MCP/Kernel 修改都必须验证 `index.js`、`kernel.js` 和 `package.zip` 的生成及发布完整性，并区分代码/构建检查和真实思源运行时 `tools/list` 检查。
