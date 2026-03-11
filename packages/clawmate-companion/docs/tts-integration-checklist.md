# ClawMate TTS 集成落地清单

## 方案选择

采用低风险方案：

- 主要语音触发规则放在独立 TTS skill 中
- `SOUL.md` 只补充极少量“语音表达风格”信息
- 插件不负责语义判断，只负责 TTS 合成、音频落盘、返回媒体路径
- 第一版不做 `prepare_tts`
- 第一版只保留一个工具：`clawmate_generate_tts`

这样做的原因：

- 当前插件不能自己调 LLM，语义判断必须继续借助 Agent + SOUL + skill
- 生图的两步链是为 prompt engineering 服务，TTS 第一版不需要复制这套复杂度
- 规则放 skill 比放 SOUL 更容易迭代，也不会把每轮对话上下文塞得太重

## 一、建议新增哪些文件

### 必需新增

- `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.md`
- `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.zh.md`
- `packages/clawmate-companion/src/core/tts.ts`
- `packages/clawmate-companion/src/core/tts/aliyun.ts`
- `packages/clawmate-companion/src/plugin.tts.test.ts`

### 建议新增的调试脚本

- `packages/clawmate-companion/scripts/probe-qwen-tts.ts`

### 当前文档

- `packages/clawmate-companion/docs/tts-integration-checklist.md`

## 二、需要修改的已有文件

- `packages/clawmate-companion/src/plugin.ts`
- `packages/clawmate-companion/src/core/types.ts`
- `packages/clawmate-companion/src/core/config.ts`
- `packages/clawmate-companion/openclaw.plugin.json`
- `packages/clawmate-companion/skills/clawmate-companion/assets/characters/brooke/character-prompt.md`

## 三、`plugin.ts` 里加哪些 tool / config

## 3.1 新增配置：`tts`

建议新增一个顶层配置对象：

```json
{
  "tts": {
    "enabled": false,
    "model": "qwen3-tts-flash",
    "voice": "Chelsie",
    "languageType": "Chinese",
    "apiKeyEnv": "DASHSCOPE_API_KEY",
    "baseUrl": "https://dashscope.aliyuncs.com/api/v1",
    "degradeMessage": "语音暂时发送失败，我先打字陪你。"
  }
}
```

建议字段说明：

- `enabled`
  - 是否开启 TTS 能力
- `model`
  - 第一版固定默认 `qwen3-tts-flash`
- `voice`
  - 第一版固定默认 `Chelsie`
- `languageType`
  - 默认 `Chinese`
- `apiKeyEnv`
  - 默认从 `DASHSCOPE_API_KEY` 读取
- `baseUrl`
  - 中国内地默认北京 endpoint
- `degradeMessage`
  - TTS 失败时给用户的降级文本

对应修改位置：

- `src/plugin.ts`
  - `PluginConfigOverrideInput`
  - `PluginConfigInput`
  - `defaults`
  - `mergePluginConfigInput`
- `src/core/types.ts`
  - 新增 `TtsConfig`
  - 在 `ClawMateConfig` 中加入 `tts`
- `src/core/config.ts`
  - 新增 `normalizeTts`
- `openclaw.plugin.json`
  - 为 `configSchema` 增加 `tts`
  - 如有 `agents` 级配置，也同步加 `tts`

## 3.2 新增工具：`clawmate_generate_tts`

第一版只新增一个执行型工具，不新增 `prepare_tts`。

建议工具签名：

```ts
clawmate_generate_tts({
  text: string
})
```

第一版不要把工具参数做复杂，原因：

- 语义判断不在工具里
- 音色和模型都由插件配置固定
- 风格控制先交给 Agent 生成 `spokenText`

建议工具行为：

1. 检查 `config.tts.enabled`
2. 读取：
   - `model`
   - `voice`
   - `languageType`
   - `baseUrl`
   - `apiKeyEnv`
3. 调用 DashScope / Qwen TTS
4. 获取返回的远端音频 URL
5. 下载音频到本地
6. 返回结构化 JSON

建议返回格式：

```json
{
  "ok": true,
  "audioPath": "/absolute/path/to/clawmate-tts.wav",
  "mediaLine": "MEDIA: /absolute/path/to/clawmate-tts.wav",
  "model": "qwen3-tts-flash",
  "voice": "Chelsie"
}
```

失败时：

```json
{
  "ok": false,
  "message": "语音暂时发送失败，我先打字陪你。",
  "error": "..."
}
```

## 3.3 `plugin.ts` 里建议增加的辅助逻辑

### A. 本地音频落盘

建议新增一组与图片平行的 helper：

- `resolveGeneratedAudioDir(now = new Date())`
- `buildLocalAudioPath(requestId, extWithDot)`
- `persistRemoteAudio(audioUrl, requestId)`
- `persistAudioToLocal(audioRef, requestId)`

建议保存目录：

`~/.openclaw/media/clawmate-voice/{YYYY-MM-DD}/`

建议第一版先直接保存为 `.wav`。

说明：

- 共享媒体解析已经支持 `audio` 类型和 `MEDIA:` 行
- `.wav` 能作为通用音频文件被识别
- 某些通道可能把 `.wav` 当文件发送而不是原生语音消息，这属于后续优化项，不阻塞第一版

### B. `before_agent_start` 的轻提示

不建议把完整 TTS 规则写进 `prependContext`。

只建议补一条很轻的提醒，例如：

```text
当某条回复更适合用短语音表达时，可使用 clawmate-companion-tts skill。发语音时不要重复发送同内容文字。
```

触发条件建议：

- `config.tts.enabled === true`

这样可以提醒 Agent 有这项能力，但不会把整张规则表塞进每轮上下文。

### C. 不做的事情

第一版不建议在 `plugin.ts` 里做这些事：

- 不做“自动判断该不该发语音”的硬编码逻辑
- 不做基于对话频率的冷却器
- 不做 `prepare_tts`
- 不做 `qwen3-tts-instruct-flash`
- 不做音频转码
- 不做主动语音推送

## 3.4 阿里云请求代码放在什么位置

这里建议区分两类代码：

### A. 运行时请求代码

运行时真正调用阿里云 TTS 的代码，不应放在 `scripts/`。

建议分层：

- `src/core/tts.ts`
  - TTS 统一入口
  - 负责参数整理、失败结构统一、对外暴露 `generateTts`
- `src/core/tts/aliyun.ts`
  - 只负责阿里云实现
  - 包括：
    - 组装请求体
    - 发起 HTTP 请求
    - 解析响应
    - 返回 `audioUrl`

这样做的好处：

- `plugin.ts` 不直接堆 HTTP 细节
- 后续如果要加别家 TTS，不会把阿里云逻辑写死在入口层
- 测试时可以更容易 mock

### B. 手动验证 / 联调脚本

调试脚本建议单独放：

- `packages/clawmate-companion/scripts/probe-qwen-tts.ts`

它的用途是：

- 本地验证 API Key / endpoint / 模型 / 音色是否可用
- 快速检查返回的是远端 URL 还是流式音频
- 排查地区、权限、SDK/HTTP 参数问题

不要把这个脚本当作运行时模块复用。

原因：

- `scripts/` 更适合人工执行的 probe、冒烟测试、一次性联调
- 运行时逻辑应留在 `src/`

## 3.5 第一版推荐的阿里云接入路线

第一版建议优先接阿里云官方 DashScope 原生接口，不建议先走 OpenAI 兼容层。

推荐原因：

- 你当前要接的是 `qwen3-tts-flash + Chelsie`
- 阿里云官方的 Qwen-TTS 文档主示例走的是 DashScope 原生接口
- 官方示例明确使用：
  - SDK：`dashscope.MultiModalConversation.call(...)`
  - HTTP：`POST /api/v1/services/aigc/multimodal-generation/generation`
- 对 `voice`、`language_type`、`stream` 这些参数的文档最明确

所以第一版应采用：

- `src/core/tts/aliyun.ts`
- 直接调 DashScope HTTP API

而不是复用当前生图里的 `openai-compatible.ts`

## 四、`src/core/tts.ts` 应该负责什么

建议把 TTS 执行逻辑单独收进 `src/core/tts.ts`，避免 `plugin.ts` 继续膨胀。

建议职责：

- 接收 `text` 和 `config.tts`
- 选择具体 provider 实现（第一版固定阿里云）
- 调用 `src/core/tts/aliyun.ts`
- 返回：
  - 远端音频 URL
  - requestId（如果有）
  - model / voice

建议导出：

```ts
export interface GenerateTtsOptions {
  text: string;
  config: ClawMateConfig;
}

export interface GenerateTtsResult {
  ok: true;
  audioUrl: string;
  requestId: string | null;
  model: string;
  voice: string;
}

export interface GenerateTtsFailure {
  ok: false;
  message: string;
  error: string;
}

export async function generateTts(
  options: GenerateTtsOptions
): Promise<GenerateTtsResult | GenerateTtsFailure>
```

## 五、阿里云的是 OpenAI 规范吗

结论要分两层看：

- `阿里云百炼平台整体`：支持 OpenAI 兼容接口
- `你这次要接的 Qwen-TTS 第一版实现`：不建议假设它就是当前项目里那种 OpenAI-compatible provider 形态

### 5.1 可以说“支持 OpenAI 兼容”

官方文档明确说：

- 阿里云百炼提供兼容 OpenAI 的 API
- 可以使用 OpenAI 官方 SDK 调百炼
- 可用于文本、图像、视频、语音合成、语音识别等模型

因此，从平台能力角度说：

- `是，百炼支持 OpenAI 兼容`

### 5.2 但 Qwen-TTS 官方主文档不是按你项目当前的 OpenAI provider 方式写的

你现在项目里的“OpenAI-compatible”主要是图像 provider 那一套：

- `src/core/providers/openai-compatible.ts`

而 Qwen-TTS 官方主文档给出的主调用方式是：

- DashScope SDK：`MultiModalConversation.call(...)`
- DashScope HTTP：
  - `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

所以在本项目里，应理解为：

- `平台支持 OpenAI 兼容`
- `但 Qwen-TTS 第一版接入，建议走 DashScope 原生接口`

### 5.3 第一版为什么不建议直接按 OpenAI-compatible 接

原因不是“绝对不能”，而是“当前风险更高”：

- Qwen-TTS 官方主文档和参数命名都围绕 DashScope 展开
- 你现在需要的字段是：
  - `voice`
  - `language_type`
  - `stream`
- 这些在 Qwen-TTS 原生文档里是清晰的
- 但在当前项目里，如果硬复用 `openai-compatible.ts`，会把 TTS 混进原本为图像生成设计的抽象层

因此第一版落地建议是：

- 运行时：走 DashScope 原生 HTTP
- 结构上：单独做 `src/core/tts/aliyun.ts`
- 后续如果确认 OpenAI `audio/speech` 路径在你目标通道和模型上更顺，再额外加兼容适配

## 六、`TTS SKILL.md` 应该怎么写

建议 skill 名称：

- 英文目录名：`clawmate-companion-tts`
- frontmatter:

```md
---
name: clawmate-companion-tts
description: Send contextualized voice messages for ClawMate when the current moment is better expressed by voice
---
```

## 6.1 Skill 的核心职责

这个 skill 不负责合成参数调优，只负责三件事：

1. 判断当前回复是否应该用语音
2. 生成适合口播的 `spokenText`
3. 调用 `clawmate_generate_tts`

## 6.2 Skill 的推荐结构

### A. When to Use

直接写你已经确认的规则：

- `必须发`
  - 用户明确要求“给我发语音”“读给我听”“你讲给我听”
  - 晚安陪伴、哄睡、讲故事、念情话
  - 用户明显在寻求安慰：委屈、孤独、焦虑、崩溃、想哭

- `适合发`
  - 早安、晚安、下班问候、节日祝福、鼓励、庆祝、想念、撒娇
  - 用户很久没来后的第一条主动关怀

- `不要发`
  - 工具型问答、知识解释、长列表、代码、设置说明
  - 用户明显在追求高频快速对话
  - 当前内容过长，不适合直接用语音表达
  - 用户刚表达“现在不方便听”“先别发语音”

### B. Workflow

建议写成单工具流：

1. 先判断这条回复是否应该走语音
2. 如果不该发语音，直接正常文字回复，不调用工具
3. 如果该发语音，先写一段适合口播的 `spokenText`
4. 调用 `clawmate_generate_tts({ text: spokenText })`
5. 成功时只输出：

```text
MEDIA: <audioPath>
```

6. 不要再把同内容文本发给用户
7. 失败时使用工具返回的 `message` 降级成文字回复

### C. Spoken Text Rules

这一段很关键，建议明确写出来：

- `spokenText` 是给语音说的，不是给用户看的
- 口语化、亲密、自然，像真实女友发短语音
- 通常控制在 `1-3` 句话
- 优先短句，不要长段说明
- 不要写 Markdown
- 不要写列表
- 不要写代码
- 不要写教程步骤
- 不要照搬一整段长文字回复
- 可以比普通文字更软、更近、更像陪伴

### D. Prohibited Actions

- 不要为代码、教程、长说明调用 TTS
- 不要同时发送同内容文字和语音
- 不要杜撰本地音频路径
- 不要在没必要时调用工具

## 6.3 `SKILL.zh.md`

建议内容与英文版完全对应，只是中文表述更自然一些。

重点不是逐字翻译，而是保证这些规则被中文 Agent 更稳定地理解：

- `必须发 / 适合发 / 不要发`
- 发语音时不重复发文字
- 工具失败时降级成文字
- `spokenText` 要短、口语化、适合口播

## 七、`character-prompt.md` 里只加哪几行最合适

不要把“必须发 / 适合发 / 不要发”整套规则写进角色 prompt。

角色 prompt 只负责“她发语音时应该怎么说”，不负责“什么时候发语音”。

最适合补在 `## Speaking Style` 后面，新增一个极小的 subsection：

```md
### Voice Message Style

- When sending a voice message, speak like a real short voice note instead of reading an article aloud.
- Keep voice messages short, natural, and intimate, usually 1-3 sentences.
- Do not read code, bullet lists, setup instructions, or long explanations in voice.
- In comforting, bedtime, storytelling, and affectionate moments, sound softer and gentler.
- If a voice message is sent, do not repeat the same content in text.
```

这样足够了。

原因：

- 它只补“表达风格”，不污染主角色设定
- 与 Brooke 当前“natural, brief, warm and reliable” 的说话风格一致
- 不会把触发逻辑塞进 SOUL

## 八、关于 `SOUL.md` 注入的上线风险

这里有一个必须提前注意的点：

当前注入逻辑是“同一个 `characterId` 已存在就跳过”，不是按 prompt 内容刷新。

这意味着：

- 你即使修改了 `brooke/character-prompt.md`
- 已经存在的 `SOUL.md` 也不会自动更新

第一版因为主要规则放 skill，所以这个风险可控。

但如果要让新增的 `Voice Message Style` 立刻生效，需要至少满足以下其一：

- 手动删除工作区里旧的 ClawMate persona 段后重新启动
- 临时切换一次角色再切回
- 后续再做“基于 prompt hash/version 的 SOUL 刷新”

建议第一版先不改注入机制，把这个作为 rollout 注意事项记录下来。

## 九、第一版的推荐测试点

- `clawmate_generate_tts` 成功时能返回本地绝对路径
- 返回结果中包含 `mediaLine`
- 工具失败时能返回 `degradeMessage`
- Skill 文案能稳定约束“发语音时不再发同内容文字”
- 音频文件通过 `MEDIA:` 行能被上层媒体发送逻辑识别
- QQ / WeCom 之类通道至少能把音频作为媒体发出去

## 十、建议的实施顺序

1. 新增 `src/core/tts/aliyun.ts`
2. 新增 `src/core/tts.ts`
3. 扩展 `types.ts` / `config.ts` / `openclaw.plugin.json`
4. 在 `plugin.ts` 注册 `clawmate_generate_tts`
5. 加本地音频落盘 helper
6. 新增 `clawmate-companion-tts` skill
7. 新增 `scripts/probe-qwen-tts.ts`
8. 给 `brooke/character-prompt.md` 只加最小语音风格片段
9. 增加 TTS 相关测试
10. 最后再决定是否要做 SOUL 刷新机制

## 十一、当前不建议做的扩展

这些可以留到第二阶段：

- `qwen3-tts-instruct-flash`
- 多音色切换
- 情绪参数化
- 连续语音模式
- 语音主动推送
- 音频转码与不同通道专用格式优化
- 语音播放统计驱动的触发策略
