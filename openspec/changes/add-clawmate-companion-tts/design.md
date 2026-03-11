## Context

`clawmate-companion` 当前架构已经稳定使用三层协作：

- `SOUL.md` 注入负责角色人格
- skill 负责告诉 Agent 何时触发某种能力
- tool 负责执行外部调用并返回本地 `MEDIA:` 路径

现有自拍能力使用两步链，是因为生图 prompt engineering 足够复杂，需要 Tool 1 返回参考包，再由 Agent 生成提示词。TTS V1 的主要问题不同：不是复杂 prompt，而是“什么时候该发语音”和“语音该说成什么样”。同时，项目约束明确要求插件本身不能调用 LLM，因此语义判断必须继续由 Agent 在 SOUL + skill 的上下文中完成。

此外，仓库上层媒体链路已经支持本地媒体文件和 `MEDIA:` 行分发，包含音频扩展名识别。这意味着 TTS 最合理的实现路径不是引入新的出站协议，而是复用现有本地媒体传输方式。

## Goals / Non-Goals

**Goals:**
- 在现有插件架构下增加一个低风险的 TTS V1 能力
- 将“是否发语音”的判断留在 Agent 侧，由独立 TTS skill 承担规则约束
- 新增单一执行型工具 `clawmate_generate_tts`，负责阿里云 Qwen TTS 调用和本地音频落盘
- 复用现有 `MEDIA:` 传输路径，使成功结果以本地音频文件形式交给上层通道发送
- 保持 `SOUL.md` 只承载轻量语音风格，不把完整触发规则写进角色 prompt

**Non-Goals:**
- 不实现“每条消息都发语音”
- 不做 `prepare_tts -> generate_tts` 两步工具链
- 不做 `qwen3-tts-instruct-flash` 或多音色切换
- 不做主动语音推送、频率控制器或播放统计优化
- 不在 V1 中改造 `SOUL.md` 注入刷新逻辑

## Decisions

### 1. Use a dedicated TTS skill instead of encoding trigger rules into SOUL

TTS 的触发规则会持续迭代，而 `SOUL.md` 是每轮对话都会读取的核心上下文。如果把“必须发 / 适合发 / 不要发”的完整矩阵塞进角色 prompt，会让人格层过重，并增加模型误触发语音的概率。

因此：

- `SOUL.md` 只补充语音表达风格
- 独立 `clawmate-companion-tts` skill 负责触发规则和工具调用说明

备选方案：

- 直接在 `character-prompt.md` 中写完整 TTS 决策规则

不采用原因：

- 上下文噪音更大
- 不利于后续单独迭代 TTS 规则
- 当前 `SOUL.md` 注入逻辑不会自动刷新同角色 prompt，升级风险更高

### 2. Use a single execution tool for V1

TTS V1 不采用自拍的两步工具链。

原因：

- 自拍两步链的收益来自 prompt engineering
- TTS V1 的关键决策已经在 Agent 侧完成
- 工具只需执行合成和文件落盘，单工具足够清晰

因此新增：

- `clawmate_generate_tts({ text })`

备选方案：

- 增加 `clawmate_prepare_tts`

不采用原因：

- 会把原本应该由 skill + Agent 处理的判断逻辑重新工具化
- 增加复杂度，但对 V1 质量提升有限

### 3. Use DashScope native HTTP instead of reusing the image-oriented OpenAI-compatible layer

阿里云百炼整体支持 OpenAI 兼容接口，但当前项目中的 `openai-compatible.ts` 是为图像 provider 抽象设计的，并不适合作为 TTS V1 的第一落点。

因此第一版采用：

- `src/core/tts/aliyun.ts`
- 直接调用 DashScope 原生 HTTP 接口
- 固定默认：
  - `model = qwen3-tts-flash`
  - `voice = Chelsie`
  - `languageType = Chinese`

备选方案：

- 直接复用现有 `src/core/providers/openai-compatible.ts`

不采用原因：

- 抽象层语义不匹配
- Qwen-TTS 官方文档主示例围绕 DashScope 原生接口
- `voice`、`language_type`、`stream` 等字段在原生接口中更清晰

### 4. Persist audio locally and return `MEDIA:` paths

插件现有图片能力会把远端资源下载到本地后再返回 `MEDIA:` 行。TTS 沿用同一思路，避免依赖远端临时链接。

因此：

- 音频下载到 `~/.openclaw/media/clawmate-voice/{YYYY-MM-DD}/`
- V1 默认保存为 `.wav`
- 工具成功返回：
  - `audioPath`
  - `mediaLine`

备选方案：

- 直接把远端 DashScope 音频 URL 返回给上层

不采用原因：

- 远端链接有时效
- 本地媒体路径更符合当前项目设计
- 现有上层通道已经更擅长处理本地媒体文件

### 5. Add only minimal voice-style guidance to Brooke

内置 Brooke 角色已经具备“natural, brief, warm and reliable”的说话风格。TTS V1 只需要补足“短语音条而非朗读器”的风格约束。

因此在 `character-prompt.md` 中只增加一个很小的 `Voice Message Style` 小节，约束：

- 语音应短、自然、亲密
- 不读代码、列表、安装步骤和长解释
- 安慰、晚安、故事等场景更柔和
- 发语音时不重复发同内容文字

备选方案：

- 在角色 prompt 中写完整触发决策矩阵

不采用原因：

- 触发逻辑应属于 skill，不属于人格定义

## Risks / Trade-offs

- [Existing SOUL content may not refresh for current users] → Keep most behavior rules in the new TTS skill; document that `SOUL.md` may require manual refresh for prompt updates.
- [Some channels may send `.wav` as file instead of native voice] → Use `.wav` for V1 to minimize implementation risk, and defer channel-specific transcoding to a follow-up change.
- [Agent may overuse voice if skill wording is too broad] → Keep the skill explicit about “must / prefer / skip” conditions and prohibit TTS for code, lists, and long explanations.
- [Aliyun credential or region misconfiguration may degrade UX] → Add clear `tts.degradeMessage`, validate API key presence, and ship a dedicated `probe-qwen-tts.ts` script.

## Migration Plan

1. Add the new `tts` config schema with `enabled: false` by default.
2. Ship the new TTS tool and skill without changing existing selfie behavior.
3. Enable TTS explicitly in environments with a configured `DASHSCOPE_API_KEY`.
4. If needed, manually refresh or recreate the injected ClawMate persona block in `SOUL.md` to pick up Brooke voice-style additions.

Rollback is straightforward:

- Disable `config.tts.enabled`
- Remove the TTS skill reference from plugin output if necessary
- Existing text and selfie flows remain unaffected

## Open Questions

- 是否要在第一版同时生成 `proposal.zh.md` / `design.zh.md` / `tasks.zh.md` 风格的中文 OpenSpec 辅助文档，还是保持最小 OpenSpec 产物即可？
- 是否需要在 `before_agent_start` 增加一条轻量 `prependContext`，还是只依赖 skill 发现能力？
- 某些目标通道如果对 `.wav` 作为语音支持较差，第二阶段是否优先做 `.amr` 或 `.mp3` 转码适配？
