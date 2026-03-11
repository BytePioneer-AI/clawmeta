## Why

`clawmate-companion` 目前只能通过文本和自拍增强陪伴感，无法在“更适合开口说话”的时刻发送语音。对于 AI 女友定位，这会错失高情绪价值场景，例如安慰、晚安陪伴、讲故事和用户明确要求“读给我听”的请求。

现在补齐 TTS 的时机合适，因为项目已经具备 `SOUL.md` 注入、skill 引导和 `MEDIA:` 本地媒体发送链路，只缺少一层面向语音的选择性触发和执行能力。

## What Changes

- 为 `clawmate-companion` 增加一个独立的 TTS capability，支持在合适场景生成短语音消息。
- 新增独立 TTS skill，用于指导 Agent 在“必须发 / 适合发 / 不要发”三类场景中决定是否调用 TTS。
- 新增 `clawmate_generate_tts` 工具，负责调用阿里云 Qwen TTS、下载音频并返回本地 `MEDIA:` 路径。
- 为插件配置新增 `tts` 配置对象，支持开关、模型、音色、区域 endpoint、API Key 环境变量和降级文案。
- 为内置 Brooke 角色补充最小化的语音表达风格提示，使语音更像短语音条而不是朗读长文。

## Capabilities

### New Capabilities
- `clawmate-companion-tts`: Add selective voice-note generation for ClawMate Companion, including a dedicated TTS skill, Aliyun Qwen TTS execution, local audio persistence, and media-based delivery.

### Modified Capabilities

## Impact

- Affected code:
  - `packages/clawmate-companion/src/plugin.ts`
  - `packages/clawmate-companion/src/core/types.ts`
  - `packages/clawmate-companion/src/core/config.ts`
  - `packages/clawmate-companion/openclaw.plugin.json`
  - `packages/clawmate-companion/skills/clawmate-companion/assets/characters/brooke/character-prompt.md`
- New runtime modules:
  - `packages/clawmate-companion/src/core/tts.ts`
  - `packages/clawmate-companion/src/core/tts/aliyun.ts`
- New agent guidance:
  - `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.md`
  - `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.zh.md`
- New validation tooling:
  - `packages/clawmate-companion/scripts/probe-qwen-tts.ts`
- External dependency impact:
  - Uses Alibaba Cloud DashScope Qwen TTS over HTTP and requires a valid `DASHSCOPE_API_KEY`
