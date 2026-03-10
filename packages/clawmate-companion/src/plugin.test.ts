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
    api,
    hooks,
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

test("resolveRuntimeConfig applies agent overrides and keeps global defaults", () => {
  const api = {
    resolvePath(input: string) {
      return input;
    },
    pluginConfig: {
      selectedCharacter: "brooke-anime",
      defaultProvider: "volcengine",
      fallback: {
        enabled: true,
        order: ["volcengine"],
      },
      providers: {
        volcengine: { model: "seedream-a", extra: "global" },
      },
      agents: {
        "ding-work": {
          selectedCharacter: "brooke",
          defaultProvider: "aliyun",
          fallback: {
            order: ["aliyun", "volcengine"],
          },
          providers: {
            volcengine: { model: "seedream-b" },
            aliyun: { model: "wan2.6-image" },
          },
        },
      },
    },
  };

  const workConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-work" });
  assert.equal(workConfig.selectedCharacter, "brooke");
  assert.equal(workConfig.defaultProvider, "aliyun");
  assert.deepEqual(workConfig.fallback, {
    enabled: true,
    order: ["aliyun", "volcengine"],
  });
  assert.deepEqual(workConfig.providers.volcengine, {
    model: "seedream-b",
    extra: "global",
  });
  assert.deepEqual(workConfig.providers.aliyun, {
    model: "wan2.6-image",
  });

  const defaultConfig = __testing.resolveRuntimeConfig(api as never, { agentId: "ding-main" });
  assert.equal(defaultConfig.selectedCharacter, "brooke-anime");
  assert.equal(defaultConfig.defaultProvider, "volcengine");
});

test("isAgentEnabledForRuntime respects explicit disable and legacy agent overrides", () => {
  assert.equal(__testing.isAgentEnabledForRuntime({
    agents: {
      "ding-main": {
        enabled: false,
      },
    },
  }, "ding-main"), false);

  assert.equal(__testing.isAgentEnabledForRuntime({
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, "ding-main"), true);
});

test("resolveSoulMdPath prefers the current workspace", async () => {
  const workspaceDir = await makeTempDir("clawmate-workspace-");
  assert.equal(__testing.resolveSoulMdPath(workspaceDir), path.join(workspaceDir, "SOUL.md"));
});

test("before_agent_start injects SOUL.md into the active workspace", async () => {
  const workspaceDir = await makeTempDir("clawmate-soul-");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
  });

  const hook = plugin.getHook("before_agent_start");
  await hook({}, {
    agentId: "ding-main",
    workspaceDir,
    sessionId: "session-1",
  });

  const soulPath = path.join(workspaceDir, "SOUL.md");
  const soul = await fs.readFile(soulPath, "utf8");
  assert.match(soul, /CLAWMATE-COMPANION:PERSONA:BEGIN/);
  assert.match(soul, /ClawMate Companion Persona \(brooke\)/);
});

test("before_agent_start skips SOUL injection for agents without explicit config", async () => {
  const workspaceDir = await makeTempDir("clawmate-soul-skip-");
  await fs.writeFile(path.join(workspaceDir, "SOUL.md"), [
    "<!-- CLAWMATE-COMPANION:PERSONA:BEGIN -->",
    "## ClawMate Companion Persona (brooke)",
    "",
    "legacy persona",
    "<!-- CLAWMATE-COMPANION:PERSONA:END -->",
    "",
    "keep me",
  ].join("\n"), "utf8");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  });

  const hook = plugin.getHook("before_agent_start");
  await hook({}, {
    agentId: "ding-work",
    workspaceDir,
    sessionId: "session-1",
  });

  const soul = await fs.readFile(path.join(workspaceDir, "SOUL.md"), "utf8");
  assert.doesNotMatch(soul, /CLAWMATE-COMPANION:PERSONA:BEGIN/);
  assert.match(soul, /keep me/);
});

test("before_agent_start uses shared defaults for explicitly enabled agents", async () => {
  const workspaceDir = await makeTempDir("clawmate-soul-enabled-");
  const plugin = createMockApi({
    selectedCharacter: "brooke-anime",
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  });

  const hook = plugin.getHook("before_agent_start");
  await hook({}, {
    agentId: "ding-main",
    workspaceDir,
    sessionId: "session-1",
  });

  const soul = await fs.readFile(path.join(workspaceDir, "SOUL.md"), "utf8");
  assert.match(soul, /ClawMate Companion Persona \(brooke-anime\)/);
});

test("tool factory returns no tools for agents without explicit config", () => {
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    agents: {
      "ding-main": {
        enabled: true,
      },
    },
  });
  const toolFactory = plugin.getToolFactory();

  const tools = toolFactory({ agentId: "ding-work", sessionId: "session-b" });
  assert.deepEqual(tools, []);
});

test("selfie prepare state is isolated per tool factory run", async () => {
  const plugin = createMockApi({
    selectedCharacter: "brooke",
  });
  const toolFactory = plugin.getToolFactory();

  const runATools = toolFactory({ agentId: "ding-main", sessionId: "session-a" });
  const runBTools = toolFactory({ agentId: "ding-work", sessionId: "session-b" });

  const prepareA = runATools.find((tool) => tool.name === "clawmate_prepare_selfie");
  const generateB = runBTools.find((tool) => tool.name === "clawmate_generate_selfie");
  assert.ok(prepareA);
  assert.ok(generateB);

  await prepareA.execute("tool-1", { mode: "direct" });
  const result = await generateB.execute("tool-2", { mode: "direct", prompt: "test prompt" });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(payload.error, /必须先调用 clawmate_prepare_selfie/);
});

test("character prepare state is isolated by session and cleared on reset", async () => {
  const userCharacterRoot = await makeTempDir("clawmate-characters-");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    userCharacterRoot,
  });
  const toolFactory = plugin.getToolFactory();

  const sessionATools = toolFactory({ agentId: "ding-main", sessionId: "session-a" });
  const sessionBTools = toolFactory({ agentId: "ding-main", sessionId: "session-b" });

  const prepareCharacterA = sessionATools.find((tool) => tool.name === "clawmate_prepare_character");
  const createCharacterA = sessionATools.find((tool) => tool.name === "clawmate_create_character");
  const createCharacterB = sessionBTools.find((tool) => tool.name === "clawmate_create_character");
  assert.ok(prepareCharacterA);
  assert.ok(createCharacterA);
  assert.ok(createCharacterB);

  await prepareCharacterA.execute("tool-3", { description: "一个喜欢画画的大学生，动漫风格" });

  const crossSession = await createCharacterB.execute("tool-4", {
    characterId: "test-role-b",
    meta: { id: "test-role-b", name: "测试角色B" },
    characterPrompt: "test prompt",
  });
  const crossSessionPayload = JSON.parse(crossSession.content[0]?.text ?? "{}");
  assert.equal(crossSessionPayload.ok, false);
  assert.match(crossSessionPayload.error, /必须先调用 clawmate_prepare_character/);

  const beforeReset = plugin.getHook("before_reset");
  await beforeReset({}, {
    agentId: "ding-main",
    sessionId: "session-a",
  });

  const afterReset = await createCharacterA.execute("tool-5", {
    characterId: "test-role-a",
    meta: { id: "test-role-a", name: "测试角色A" },
    characterPrompt: "test prompt",
  });
  const afterResetPayload = JSON.parse(afterReset.content[0]?.text ?? "{}");
  assert.equal(afterResetPayload.ok, false);
  assert.match(afterResetPayload.error, /必须先调用 clawmate_prepare_character/);
});

test("character prepare state is cleared on session_end", async () => {
  const userCharacterRoot = await makeTempDir("clawmate-characters-end-");
  const plugin = createMockApi({
    selectedCharacter: "brooke",
    userCharacterRoot,
  });
  const toolFactory = plugin.getToolFactory();
  const sessionTools = toolFactory({ agentId: "ding-main", sessionId: "session-end-case" });

  const prepareCharacter = sessionTools.find((tool) => tool.name === "clawmate_prepare_character");
  const createCharacter = sessionTools.find((tool) => tool.name === "clawmate_create_character");
  assert.ok(prepareCharacter);
  assert.ok(createCharacter);

  await prepareCharacter.execute("tool-6", { description: "一个写实风格的书店店长" });

  const sessionEnd = plugin.getHook("session_end");
  await sessionEnd({}, {
    agentId: "ding-main",
    sessionId: "session-end-case",
  });

  const afterSessionEnd = await createCharacter.execute("tool-7", {
    characterId: "test-role-end",
    meta: { id: "test-role-end", name: "测试角色End" },
    characterPrompt: "test prompt",
  });
  const payload = JSON.parse(afterSessionEnd.content[0]?.text ?? "{}");
  assert.equal(payload.ok, false);
  assert.match(payload.error, /必须先调用 clawmate_prepare_character/);
});
