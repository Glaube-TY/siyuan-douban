# 双 Agent 本地交接协议

- 规划 Agent 与执行 Agent 必须使用同一物理项目根目录：`D:\MyCode\siyuanPlugin\siyuan-douban`。
- 规划 Agent 负责只读检查、生成计划、审查结果和沉淀已验证经验；不得修改业务代码、业务配置、依赖、生成物或 Git 历史。
- 执行 Agent 只执行 `.agent-handoff/NEXT_TASK.md` 中 `status: ready` 的任务，并在同一文件的“执行回执”中记录实际修改、命令和结果。
- 通讯状态只放在 `.agent-handoff/LESSONS.md` 与 `.agent-handoff/NEXT_TASK.md`；该目录不得提交或推送。
- 规划 Agent 在生成任务前必须读取本文件、两个通讯文件并检查工作区差异；执行后必须重新读取并以实际差异和验证结果审查，不以口头结论代替证据。
- `LESSONS.md` 只记录已由代码、测试、构建或实际故障确认且会影响未来任务的通用经验。
