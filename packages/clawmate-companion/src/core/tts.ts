import { ClawMateError } from "./errors";
import { generateAliyunTts } from "./tts/aliyun";
import type { ClawMateConfig, GenerateTtsResult } from "./types";

export interface GenerateTtsOptions {
  text: string;
  config: ClawMateConfig;
  fetchImpl?: typeof fetch;
}

export async function generateTts(options: GenerateTtsOptions): Promise<GenerateTtsResult> {
  const { text, config, fetchImpl } = options;
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {
      ok: false,
      message: "语音内容不能为空。",
      error: "TTS_EMPTY_TEXT",
    };
  }

  if (!config.tts.enabled) {
    return {
      ok: false,
      message: "语音功能未启用，我先打字陪你。",
      error: "TTS_NOT_ENABLED",
    };
  }

  const apiKey = process.env[config.tts.apiKeyEnv]?.trim() ?? "";
  if (!apiKey) {
    return {
      ok: false,
      message: config.tts.degradeMessage,
      error: `TTS_API_KEY_MISSING:${config.tts.apiKeyEnv}`,
    };
  }

  try {
    const result = await generateAliyunTts({
      text: trimmedText,
      model: config.tts.model,
      voice: config.tts.voice,
      languageType: config.tts.languageType,
      apiKey,
      baseUrl: config.tts.baseUrl,
      fetchImpl,
    });

    return {
      ok: true,
      audioUrl: result.audioUrl,
      requestId: result.requestId,
      model: result.model,
      voice: result.voice,
    };
  } catch (error) {
    const typedError =
      error instanceof ClawMateError
        ? error
        : new ClawMateError(error instanceof Error ? error.message : String(error), {
            code: "TTS_UNKNOWN_ERROR",
          });

    return {
      ok: false,
      message: config.tts.degradeMessage,
      error: typedError.message,
      requestId: typedError.requestId,
    };
  }
}
