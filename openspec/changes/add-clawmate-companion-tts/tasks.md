## 1. Config and plugin surface

- [x] 1.1 Extend `packages/clawmate-companion/openclaw.plugin.json` with a `tts` config schema and agent-level `tts` overrides
- [x] 1.2 Add `TtsConfig` and related result types in `packages/clawmate-companion/src/core/types.ts`
- [x] 1.3 Normalize `tts` config in `packages/clawmate-companion/src/core/config.ts` and merge it in `packages/clawmate-companion/src/plugin.ts`
- [x] 1.4 Register a new `clawmate_generate_tts` tool in `packages/clawmate-companion/src/plugin.ts`

## 2. Aliyun Qwen TTS runtime

- [x] 2.1 Implement `packages/clawmate-companion/src/core/tts/aliyun.ts` for DashScope native HTTP requests
- [x] 2.2 Implement `packages/clawmate-companion/src/core/tts.ts` as the TTS execution entry point and failure normalizer
- [x] 2.3 Add local audio persistence helpers in `packages/clawmate-companion/src/plugin.ts` parallel to the existing image persistence flow
- [x] 2.4 Return structured success and failure payloads that include `audioPath` and `mediaLine`

## 3. Agent guidance and persona updates

- [x] 3.1 Add `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.md` with selective TTS triggering rules and tool workflow
- [x] 3.2 Add `packages/clawmate-companion/skills/clawmate-companion-tts/SKILL.zh.md` with the same constraints for Chinese-first agent behavior
- [x] 3.3 Add a minimal `Voice Message Style` section to Brooke’s `character-prompt.md`
- [x] 3.4 Add an optional lightweight `before_agent_start` TTS hint that only appears when `config.tts.enabled` is true

## 4. Verification and tooling

- [x] 4.1 Add `packages/clawmate-companion/scripts/probe-qwen-tts.ts` for manual API verification
- [x] 4.2 Add `packages/clawmate-companion/src/plugin.tts.test.ts` covering config resolution, tool validation, and success/failure formatting
- [x] 4.3 Verify that TTS media results can be consumed through existing `MEDIA:`-based delivery without duplicate text responses
