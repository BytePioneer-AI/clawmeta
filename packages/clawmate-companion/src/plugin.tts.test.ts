import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import registerClawMateCompanion, { __testing } from "./plugin";

type HookHandler = (event: unknown, ctx: Record<string, unknown>) => Promise<unknown> | unknown;
type ToolFactory = (ctx: Record<string, unknown>) => Array<{
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}>;

function createMockApi(pluginConfig: Record<string, unknown> = {}) {
  const hooks = new Map<string, HookHandler[]>();
  let toolFactory: ToolFactory | null = null;

  const api = {
    resolvePath(input: string) {
      return input;
    },
    pluginConfig,
    on(hookName: string, handler: HookHandler) {
      const list = hooks.get(hookName) ?? [];
      list.push(handler);
      hooks.set(hookName, list);
    },
    registerTool(tool: unknown) {
      if (typeof tool === "function") {
        toolFactory = tool as ToolFactory;
        return;
      }
      throw new Error("expected tool factory");
    },
  };

  registerClawMateCompanion(api as never);

  return {
    getHook(name: string) {
      const list = hooks.get(name) ?? [];
      assert.ok(list.length > 0, `missing hook: ${name}`);
      return list[0]!;
    },
    getToolFactory() {
      assert.ok(toolFactory, "missing tool factory");
      return toolFactory;
    },
  };
}

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("resolveRuntimeConfig applies tts defaults and agent overrides", () => {
  const api = {
    resolvePath(input: string) {
      return input;
    },
    pluginConfig: {
      tts: {
        enabled: true,
        model: "qwen3-tts-flash",
        voice: "Chelsie",
      },
      agents: {
        "ding-work": {
          tts: {
            voice: "Cherry",
            apiKeyEnv: "WORK_TTS_KEY",
          },
        },
      },
    },
  };

  const defaultConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-main" });
  assert.equal(defaultConfig.tts.enabled, true);
  assert.equal(defaultConfig.tts.voice, "Chelsie");
  assert.equal(defaultConfig.tts.apiKeyEnv, "DASHSCOPE_API_KEY");

  const workConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-work" });
  assert.equal(workConfig.tts.enabled, true);
  assert.equal(workConfig.tts.model, "qwen3-tts-flash");
  assert.equal(workConfig.tts.voice, "Cherry");
  assert.equal(workConfig.tts.apiKeyEnv, "WORK_TTS_KEY");
});

test("before_agent_start adds TTS prependContext when TTS is enabled", async () => {
  const workspaceDir = await makeTempDir("clawmate-tts-workspace-");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    tts: {
      enabled: true,
    },
  });

  const hook = plugin.getHook("before_agent_start");
  const result = await hook({}, {
    agentId: "ding-main",
    workspaceDir,
    sessionId: "session-1",
  });

  assert.ok(result && typeof result === "object");
  assert.match(String((result as { prependContext?: string }).prependContext ?? ""), /clawmate-companion-tts skill/);
});

test("clawmate_generate_tts returns structured failure when disabled", async () => {
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    tts: {
      enabled: false,
    },
  });
  const toolFactory = plugin.getToolFactory();
  const tools = toolFactory({ agentId: "ding-main", sessionId: "tts-disabled" });
  const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
  assert.ok(ttsTool);

  const result = await ttsTool.execute("tool-tts-disabled", { text: "你好呀" });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(payload.message, /语音功能未启用/);
  assert.match(payload.error, /TTS_NOT_ENABLED/);
});

test("clawmate_generate_tts returns local media path on success", async () => {
  const workspaceDir = await makeTempDir("clawmate-tts-success-");
  const previousOpenClawHome = process.env.OPENCLAW_HOME;
  const previousApiKey = process.env.DASHSCOPE_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENCLAW_HOME = workspaceDir;
  process.env.DASHSCOPE_API_KEY = "test-key";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/services/aigc/multimodal-generation/generation")) {
      return new Response(
        JSON.stringify({
          output: {
            audio: {
              url: "https://example.com/generated-audio.wav",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-dashscope-request-id": "req-tts-1",
          },
        },
      );
    }

    if (url === "https://example.com/generated-audio.wav") {
      return new Response(Buffer.from("RIFFTEST"), {
        status: 200,
        headers: {
          "content-type": "audio/wav",
        },
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    const plugin = createMockApi({
      selectedCharacter: "brooke",
      tts: {
        enabled: true,
      },
    });

    const hook = plugin.getHook("before_agent_start");
    await hook({}, {
      agentId: "ding-main",
      workspaceDir,
      sessionId: "session-tts-success",
    });

    const toolFactory = plugin.getToolFactory();
    const tools = toolFactory({ agentId: "ding-main", sessionId: "tts-success" });
    const ttsTool = tools.find((tool) => tool.name === "clawmate_generate_tts");
    assert.ok(ttsTool);

    const result = await ttsTool.execute("tool-tts-success", { text: "晚安呀，今天辛苦啦。早点休息，我陪着你。" });
    const payload = JSON.parse(result.content[0]?.text ?? "{}");

    assert.equal(payload.ok, true);
    assert.equal(payload.requestId, "req-tts-1");
    assert.equal(payload.voice, "Chelsie");
    assert.match(payload.mediaLine, /^MEDIA:\s+/);
    assert.ok(path.isAbsolute(payload.audioPath));

    await fs.access(payload.audioPath);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOpenClawHome === undefined) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previousOpenClawHome;
    }
    if (previousApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = previousApiKey;
    }
  }
});
