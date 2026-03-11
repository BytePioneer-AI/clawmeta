import { ClawMateError } from "../errors";

export interface GenerateAliyunTtsOptions {
  text: string;
  model: string;
  voice: string;
  languageType: string;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface GenerateAliyunTtsResult {
  audioUrl: string;
  requestId: string | null;
  model: string;
  voice: string;
}

interface DashScopeAudioOutput {
  url?: unknown;
}

interface DashScopeResponseBody {
  output?: {
    audio?: DashScopeAudioOutput;
  };
  code?: unknown;
  message?: unknown;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildGenerationUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/services/aigc/multimodal-generation/generation`;
}

export async function generateAliyunTts(
  options: GenerateAliyunTtsOptions,
): Promise<GenerateAliyunTtsResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildGenerationUrl(options.baseUrl);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      input: {
        text: options.text,
        voice: options.voice,
        language_type: options.languageType,
      },
    }),
  });

  const requestId =
    response.headers.get("x-dashscope-request-id") ??
    response.headers.get("x-request-id") ??
    null;

  let body: DashScopeResponseBody | null = null;
  let rawText = "";
  try {
    rawText = await response.text();
    body = rawText ? (JSON.parse(rawText) as DashScopeResponseBody) : null;
  } catch (error) {
    throw new ClawMateError("TTS provider 响应解析失败", {
      code: "TTS_RESPONSE_PARSE_ERROR",
      transient: true,
      requestId,
      details: {
        cause: error instanceof Error ? error.message : String(error),
        responseText: rawText,
      },
    });
  }

  if (!response.ok) {
    throw new ClawMateError(toOptionalString(body?.message) ?? `TTS provider 请求失败: HTTP ${response.status}`, {
      code: toOptionalString(body?.code) ?? "TTS_PROVIDER_HTTP_ERROR",
      transient: response.status >= 500,
      requestId,
      details: body,
    });
  }

  const audioUrl = toOptionalString(body?.output?.audio?.url);
  if (!audioUrl) {
    throw new ClawMateError("TTS provider 响应中缺少 audio url", {
      code: "TTS_AUDIO_URL_MISSING",
      requestId,
      details: body,
    });
  }

  return {
    audioUrl,
    requestId,
    model: options.model,
    voice: options.voice,
  };
}
