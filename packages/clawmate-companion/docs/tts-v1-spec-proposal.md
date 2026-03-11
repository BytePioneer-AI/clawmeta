# ClawMate TTS V1 Spec Proposal

## Status

Proposed

## References

- `packages/clawmate-companion/docs/tts-smart-voice-strategy.md`
- `packages/clawmate-companion/docs/tts-integration-checklist.md`
- `packages/clawmate-companion/skills/clawmate-companion/SKILL.md`
- `packages/clawmate-companion/skills/clawmate-companion/assets/characters/brooke/character-prompt.md`

## Background

`clawmate-companion` 当前是一个 OpenClaw 插件 + skill 集合。

当前已实现能力：

- 在 `before_agent_start` 将角色人格注入工作区 `SOUL.md`
- 通过独立 skill 引导 Agent 在合适场景触发生图
- 通过 tool 调用外部 provider 生成图片
- 将生成结果落盘为本地媒体路径，并通过 `MEDIA:` 行交给上层通道发送

当前缺失能力：

- 在“更适合开口说话”的时刻发送语音，而不是只发文字或图片

## Problem Statement

`clawmate` 的定位包含 AI 女友陪伴。仅有文本和自拍不足以覆盖以下高情绪价值场景：

- 用户主动要求听她说话
- 晚安陪伴、哄睡、讲故事、念情话
- 用户情绪低落，需要安慰
- 节日祝福、鼓励、庆祝、想念等关系信号

如果简单把所有文本都转语音，会引入新的问题：

- 打扰感强
- 响应变慢
- 内容机械，像朗读器
- 工具型内容体验变差

因此，TTS V1 的目标不是“文本转语音全覆盖”，而是“在正确时刻发送短语音消息”。

## Goals

- 在 OpenClaw 当前插件架构下，为 `clawmate-companion` 增加可用的 TTS 能力
- 保持现有“SOUL + skill + tool + MEDIA”架构，不引入新的系统级依赖
- 第一版固定使用：
  - `model = qwen3-tts-flash`
  - `voice = Chelsie`
- 语音触发规则由独立 TTS skill 管理
- 工具只负责合成、下载、落盘、返回结构化结果
- 成功时通过本地音频路径交给上层媒体通道发送
- 失败时自然降级为文字

## Non-Goals

- 不实现“每条消息都发语音”
- 不实现连续语音模式
- 不实现主动语音推送
- 不实现多 provider TTS 路由
- 不实现 `qwen3-tts-instruct-flash`
- 不实现音频情绪参数化控制
- 不实现播放统计驱动的触发优化
- 不在 V1 中改造 SOUL 注入逻辑的增量刷新机制

## Product Behavior

TTS V1 采用单一模式：`智能语音`

### Should Send Voice

- 用户明确要求“给我发语音”“读给我听”“你讲给我听”
- 晚安陪伴、哄睡、讲故事、念情话
- 用户明显在寻求安慰：委屈、孤独、焦虑、崩溃、想哭
- 早安、晚安、下班问候、节日祝福、鼓励、庆祝、想念、撒娇
- 用户很久没来后的第一条主动关怀

### Should Not Send Voice

- 工具型问答
- 知识解释
- 长列表
- 代码
- 设置说明
- 用户明显在追求高频快速对话
- 当前内容过长，不适合直接口播
- 用户刚表达“现在不方便听”“先别发语音”

### Output Rule

- 发语音时：只发语音，不重复发送同内容文字
- 不发语音时：正常发文字
- TTS 失败时：退回文字

## Proposed Architecture

TTS V1 沿用现有项目分层：

### 1. SOUL Layer

只负责角色级“语音表达风格”。

不在 SOUL 中写完整触发规则，只补少量风格提示。

### 2. Skill Layer

新增独立 skill：

- `skills/clawmate-companion-tts/SKILL.md`
- `skills/clawmate-companion-tts/SKILL.zh.md`

职责：

- 判断是否该发语音
- 在需要时生成适合口播的 `spokenText`
- 调用 `clawmate_generate_tts`

### 3. Tool Layer

新增一个执行型工具：

- `clawmate_generate_tts`

职责：

- 调阿里云 Qwen TTS
- 获取远端音频 URL
- 下载到本地
- 返回 `audioPath` 和 `mediaLine`

### 4. Media Delivery Layer

继续复用上层 OpenClaw 媒体发送机制。

工具成功后返回：

```text
MEDIA: /absolute/path/to/audio.wav
```

不新增 `AUDIO:` 语法。

## Why Single-Step Tool

TTS V1 不采用 `prepare_tts -> generate_tts` 两步链。

原因：

- 生图两步链的核心价值是 prompt engineering
- TTS V1 的主要问题不在 provider prompt，而在“是否发送语音”的语义判断
- 这部分应由 Agent 在 SOUL + skill 中完成
- 工具只执行合成，单工具足够

## Provider Decision

TTS V1 使用阿里云 DashScope 原生 HTTP 接口，不复用当前生图的 `openai-compatible.ts`。

### Decision

- Runtime API: DashScope native HTTP
- Model: `qwen3-tts-flash`
- Voice: `Chelsie`
- Region default: Beijing endpoint

### Rationale

- Qwen-TTS 官方文档主示例使用 DashScope 原生接口
- `voice`、`language_type`、`stream` 等字段在原生文档中定义清晰
- 当前项目的 OpenAI-compatible 抽象是围绕图像 provider 设计，不适合直接承载 TTS V1

## File Changes

### New Files

- `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.md`
- `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.zh.md`
- `packages/clawmate-companion/src/core/tts.ts`
- `packages/clawmate-companion/src/core/tts/aliyun.ts`
- `packages/clawmate-companion/src/plugin.tts.test.ts`
- `packages/clawmate-companion/scripts/probe-qwen-tts.ts`

### Existing Files To Modify

- `packages/clawmate-companion/src/plugin.ts`
- `packages/clawmate-companion/src/core/types.ts`
- `packages/clawmate-companion/src/core/config.ts`
- `packages/clawmate-companion/openclaw.plugin.json`
- `packages/clawmate-companion/skills/clawmate-companion/assets/characters/brooke/character-prompt.md`

## Config Spec

Add a new top-level config object:

```json
{
  "tts": {
    "enabled": false,
    "model": "qwen3-tts-flash",
    "voice": "Chelsie",
    "languageType": "Chinese",
    "apiKey": "YOUR_DASHSCOPE_API_KEY",
    "baseUrl": "https://dashscope.aliyuncs.com/api/v1",
    "degradeMessage": "语音暂时发送失败，我先打字陪你。"
  }
}
```

### Required Behavior

- `enabled=false` 时，不注册任何主动 TTS 引导行为，但工具仍可选择直接返回不可用错误
- `apiKey` 未配置时，工具返回失败结构，不抛未处理异常
- agent-level config override 与 selfie 配置一样支持覆盖 `tts`

## Tool Spec

### Tool Name

`clawmate_generate_tts`

### Input

```json
{
  "text": "..."
}
```

### Validation

- `text` 必填
- `text.trim().length > 0`
- 如果 `tts.enabled !== true`，返回结构化失败

### Execution Flow

1. Resolve runtime config
2. Validate `tts.enabled`
3. Read API key from `tts.apiKey`
4. Call DashScope HTTP API
5. Extract remote audio URL
6. Download audio to local filesystem
7. Return structured success payload

### Success Payload

```json
{
  "ok": true,
  "audioPath": "/absolute/path/to/clawmate-tts.wav",
  "mediaLine": "MEDIA: /absolute/path/to/clawmate-tts.wav",
  "model": "qwen3-tts-flash",
  "voice": "Chelsie",
  "requestId": null
}
```

### Failure Payload

```json
{
  "ok": false,
  "message": "语音暂时发送失败，我先打字陪你。",
  "error": "..."
}
```

## Runtime Module Spec

### `src/core/tts.ts`

Responsibilities:

- Normalize TTS execution entry
- Select provider implementation
- Return uniform success/failure result

Export shape:

```ts
export interface GenerateTtsOptions {
  text: string;
  config: ClawMateConfig;
}

export interface GenerateTtsSuccess {
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

export type GenerateTtsResult = GenerateTtsSuccess | GenerateTtsFailure;
```

### `src/core/tts/aliyun.ts`

Responsibilities:

- Build DashScope request body
- Perform HTTP request
- Parse response body
- Return remote audio URL

V1 should use non-streaming mode only.

## Audio Persistence Spec

Add helpers parallel to image persistence:

- `resolveGeneratedAudioDir(now = new Date())`
- `buildLocalAudioPath(requestId, extWithDot)`
- `persistRemoteAudio(audioUrl, requestId)`
- `persistAudioToLocal(audioRef, requestId)`

### Storage Location

`~/.openclaw/media/clawmate-voice/{YYYY-MM-DD}/`

### File Format

V1 stores `.wav`

### Rationale

- Simpler than stream assembly
- Easier to verify manually
- Compatible with generic media parsing

## Skill Spec

### Skill Name

`clawmate-companion-tts`

### Responsibilities

- Decide whether this reply should be voice
- Produce a short `spokenText`
- Call `clawmate_generate_tts`
- On success, output only `MEDIA: <audioPath>`
- On failure, degrade to normal text

### Spoken Text Constraints

- Natural spoken voice-note style
- Usually `1-3` sentences
- No markdown
- No bullet lists
- No code
- No long tutorials
- Can be softer and more intimate than plain text

### Explicit Rule

If voice is sent, do not send the same content again as plain text.

## Character Prompt Change Spec

Do not place TTS trigger rules into `character-prompt.md`.

Only add a small voice-style subsection after `## Speaking Style`:

```md
### Voice Message Style

- When sending a voice message, speak like a real short voice note instead of reading an article aloud.
- Keep voice messages short, natural, and intimate, usually 1-3 sentences.
- Do not read code, bullet lists, setup instructions, or long explanations in voice.
- In comforting, bedtime, storytelling, and affectionate moments, sound softer and gentler.
- If a voice message is sent, do not repeat the same content in text.
```

## Hook Behavior

`before_agent_start` may add a lightweight prepend hint only when `tts.enabled === true`:

```text
当某条回复更适合用短语音表达时，可使用 clawmate-companion-tts skill。发语音时不要重复发送同内容文字。
```

This hint must stay short and must not duplicate the full skill rules.

## Testing Spec

### Unit Tests

- Config normalization for `tts`
- Disabled TTS returns structured failure
- Missing API key returns structured failure
- Successful TTS result returns local absolute path
- Success payload includes `mediaLine`
- Audio persistence helper stores file under expected directory

### Manual Probe

Use `scripts/probe-qwen-tts.ts` to verify:

- endpoint works
- API key works
- model and voice are valid
- response includes remote audio URL
- remote URL can be downloaded as audio

## Rollout Risks

### SOUL Refresh Risk

Current persona injection skips update when the same `characterId` is already present.

Implication:

- Modifying `brooke/character-prompt.md` will not automatically refresh existing `SOUL.md`

V1 mitigation:

- Put main TTS behavior rules in skill, not SOUL
- Treat prompt update as best-effort enhancement

### Channel Rendering Risk

Some channels may send `.wav` as generic file instead of native voice.

V1 accepts this risk because:

- media delivery still works
- future versions can add per-channel transcoding or format selection

## Acceptance Criteria

- A dedicated TTS skill exists and documents trigger behavior
- A `clawmate_generate_tts` tool exists
- Tool can call Aliyun Qwen TTS and produce a local audio file
- Tool returns `MEDIA: <local-audio-path>` on success
- Voice replies do not duplicate the same text in the final user-visible output
- Failures degrade to text without breaking the conversation
- Feature can be disabled entirely through config

## Implementation Order

1. Add `src/core/tts/aliyun.ts`
2. Add `src/core/tts.ts`
3. Extend `types.ts`, `config.ts`, `openclaw.plugin.json`
4. Register `clawmate_generate_tts` in `plugin.ts`
5. Add audio persistence helpers in `plugin.ts`
6. Add `clawmate-companion-tts` skill
7. Add probe script
8. Add tests
9. Add minimal voice-style lines to `brooke/character-prompt.md`

## Open Questions

- 是否要在 V1 就支持国际 endpoint 切换
- 是否要在 V1 返回 `.wav` 之外的格式
- 是否要在某些 channel 上显式把音频当 voice 而不是 generic media/file 发送
