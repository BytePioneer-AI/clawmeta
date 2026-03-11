import process from "node:process";
import { generateAliyunTts } from "../src/core/tts/aliyun";

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(" ").trim() || "你好呀，我是 Brooke，今天也想陪着你。";
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/api/v1").replace(/\/+$/, "");
  const model = process.env.CLAWMATE_TTS_MODEL?.trim() || "qwen3-tts-flash";
  const voice = process.env.CLAWMATE_TTS_VOICE?.trim() || "Chelsie";
  const languageType = process.env.CLAWMATE_TTS_LANGUAGE?.trim() || "Chinese";

  if (!apiKey) {
    console.error("Missing DASHSCOPE_API_KEY");
    process.exitCode = 1;
    return;
  }

  const result = await generateAliyunTts({
    text,
    apiKey,
    baseUrl,
    model,
    voice,
    languageType,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
