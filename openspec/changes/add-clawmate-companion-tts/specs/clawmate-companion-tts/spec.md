## ADDED Requirements

### Requirement: The plugin SHALL provide a dedicated TTS generation tool

`clawmate-companion` SHALL expose a tool that converts short spoken text into a locally persisted audio file for outbound media delivery.

#### Scenario: Successful TTS generation returns a local media path
- **WHEN** the Agent calls `clawmate_generate_tts` with non-empty text and TTS is enabled
- **THEN** the plugin MUST synthesize audio using the configured TTS settings
- **AND** the plugin MUST persist the generated audio to a local absolute filesystem path
- **AND** the tool response MUST include a `mediaLine` in the form `MEDIA: <local-audio-path>`

#### Scenario: Empty text input is rejected
- **WHEN** the Agent calls `clawmate_generate_tts` with missing or whitespace-only text
- **THEN** the plugin MUST return a structured failure result
- **AND** the plugin MUST NOT call the upstream TTS provider

#### Scenario: Disabled TTS returns a structured failure
- **WHEN** the Agent calls `clawmate_generate_tts` while `config.tts.enabled` is false
- **THEN** the plugin MUST return a structured failure result
- **AND** the result MUST explain that TTS is not enabled

### Requirement: TTS execution SHALL use configurable Aliyun Qwen TTS settings

The plugin SHALL resolve TTS execution settings from plugin configuration and use Alibaba Cloud DashScope native HTTP requests for V1 synthesis.

#### Scenario: Default TTS settings are applied
- **GIVEN** the plugin enables TTS without custom overrides
- **WHEN** the Agent calls `clawmate_generate_tts`
- **THEN** the plugin MUST use `qwen3-tts-flash` as the default model
- **AND** the plugin MUST use `Chelsie` as the default voice
- **AND** the plugin MUST use the configured DashScope base URL and API key environment variable

#### Scenario: Missing API key degrades gracefully
- **GIVEN** TTS is enabled
- **AND** the configured API key environment variable is unset
- **WHEN** the Agent calls `clawmate_generate_tts`
- **THEN** the plugin MUST return a structured failure result
- **AND** the failure MUST use the configured TTS degrade message

### Requirement: The system SHALL provide selective TTS guidance to the Agent

The built-in ClawMate guidance for TTS SHALL instruct the Agent to use voice selectively instead of turning every response into speech.

#### Scenario: Direct voice requests are treated as voice-eligible
- **WHEN** the user explicitly asks to hear the character speak
- **THEN** the TTS skill MUST guide the Agent to prefer `clawmate_generate_tts`

#### Scenario: Tool-like and long-form content is treated as text-only
- **WHEN** the reply is primarily code, setup instructions, long lists, or detailed knowledge explanation
- **THEN** the TTS skill MUST guide the Agent not to call `clawmate_generate_tts`

#### Scenario: Voice replies suppress duplicate text output
- **WHEN** the Agent chooses to send a TTS reply
- **THEN** the TTS skill MUST instruct the Agent not to send the same content as visible text alongside the audio media

### Requirement: Built-in Brooke persona SHALL define short voice-note behavior

The built-in Brooke character prompt SHALL describe voice messages as short, natural voice notes rather than article-style narration.

#### Scenario: Brooke voice guidance favors short intimate delivery
- **WHEN** Brooke sends a voice message
- **THEN** the injected persona guidance MUST describe the tone as short, natural, and intimate
- **AND** it MUST discourage reading code, bullet lists, setup instructions, or long explanations aloud
