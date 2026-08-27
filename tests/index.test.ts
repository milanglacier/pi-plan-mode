import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../test-utils/extension-runtime-harness.js";
import planExtension from "../index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "oh-pi-plan-index-"));
	tempDirs.push(tempDir);
	return tempDir;
}

async function createConfigEnvironment() {
	const tempDir = await createTempDir();
	const agentDirPath = path.join(tempDir, "agent");
	const projectDirPath = path.join(tempDir, "project");
	await mkdir(agentDirPath, { recursive: true });
	await mkdir(path.join(projectDirPath, ".pi"), { recursive: true });
	vi.stubEnv("PI_CODING_AGENT_DIR", agentDirPath);
	return { agentDirPath, projectDirPath };
}

afterEach(async () => {
	while (tempDirs.length > 0) {
		const tempDir = tempDirs.pop();
		if (!tempDir) {
			continue;
		}
		await rm(tempDir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("plan extension", () => {
	it("keeps alt+p as the default plan mode shortcut", async () => {
		const paths = await createConfigEnvironment();
		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect([...harness.shortcuts.keys()]).toEqual(["alt+p"]);

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("registers project-local plan mode keybindings on session start", async () => {
		const paths = await createConfigEnvironment();
		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["ctrl+alt+p", "shift+f2"] } }',
			"utf8",
		);

		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect([...harness.shortcuts.keys()]).toEqual(["ctrl+alt+p", "shift+f2"]);

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("does not register request_user_input on startup by default", async () => {
		const paths = await createConfigEnvironment();
		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.tools.has("request_user_input")).toBe(false);
		expect(harness.pi.getActiveTools()).not.toContain("request_user_input");

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("registers request_user_input on startup when configured", async () => {
		const paths = await createConfigEnvironment();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "enable_request_user_input_on_startup": true }',
			"utf8",
		);
		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.tools.has("request_user_input")).toBe(true);
		expect(harness.pi.getActiveTools()).toContain("request_user_input");

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("toggles request_user_input without changing plan mode", async () => {
		const harness = createExtensionHarness();
		planExtension(harness.pi as never);
		const command = harness.commands.get("request-user-input") as {
			handler: (args: string, ctx: any) => Promise<void>;
		};

		await command.handler("on", harness.ctx);
		expect(harness.tools.has("request_user_input")).toBe(true);
		expect(harness.pi.getActiveTools()).toContain("request_user_input");
		expect(harness.pi.getActiveTools()).not.toContain("set_plan");
		expect(harness.entries).toEqual([]);

		await command.handler("", harness.ctx);
		expect(harness.pi.getActiveTools()).not.toContain("request_user_input");
		expect(harness.entries).toEqual([]);
	});

	it("allows the enabled request_user_input tool to run outside plan mode", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.input = vi.fn(async () => "Ship in two phases");
		planExtension(harness.pi as never);
		const command = harness.commands.get("request-user-input") as {
			handler: (args: string, ctx: any) => Promise<void>;
		};
		await command.handler("on", harness.ctx);

		const tool = harness.tools.get("request_user_input");
		const result = await tool.execute(
			"tool-1",
			{
				questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }],
			},
			new AbortController().signal,
			() => {},
			harness.ctx,
		);

		expect(result.content).toEqual([{ type: "text", text: "1. Any constraints?\n   Answer: Ship in two phases" }]);
	});

	it("keeps resumed plan mode tools during the startup refresh window", async () => {
		const paths = await createConfigEnvironment();
		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: true,
					planFilePath: "/tmp/session.plan.md",
				},
			},
		];
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		const [result] = await harness.emitAsync("before_agent_start", undefined, harness.ctx);

		expect(result).toEqual({
			message: expect.objectContaining({
				customType: "pi-plan:context",
			}),
		});
		expect(harness.pi.getActiveTools()).toEqual(["read", "bash", "edit", "write", "request_user_input", "set_plan"]);

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("keeps request_user_input in plan mode when normal mode is disabled", async () => {
		const harness = createExtensionHarness();
		let planActive = true;
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: planActive,
					planFilePath: "/tmp/session.plan.md",
				},
			},
		];
		planExtension(harness.pi as never);
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);

		const command = harness.commands.get("request-user-input") as {
			handler: (args: string, ctx: any) => Promise<void>;
		};
		await command.handler("off", harness.ctx);

		expect(harness.pi.getActiveTools()).toContain("set_plan");
		expect(harness.pi.getActiveTools()).toContain("request_user_input");

		planActive = false;
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		expect(harness.pi.getActiveTools()).not.toContain("request_user_input");
	});

	it("ignores project-local plan mode keybindings for untrusted projects", async () => {
		const paths = await createConfigEnvironment();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["ctrl+alt+p"] } }',
			"utf8",
		);
		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["p"] } }',
			"utf8",
		);

		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		harness.ctx.isProjectTrusted = () => false;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect([...harness.shortcuts.keys()]).toEqual(["ctrl+alt+p"]);

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("does not register a plan mode shortcut when configured with an empty list", async () => {
		const paths = await createConfigEnvironment();
		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": [] } }',
			"utf8",
		);

		const harness = createExtensionHarness();
		harness.ctx.cwd = paths.projectDirPath;
		planExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(harness.shortcuts.size).toBe(0);

		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	});

	it("writes plans only while plan mode is active", async () => {
		const harness = createExtensionHarness();
		planExtension(harness.pi as never);
		const setPlan = harness.tools.get("set_plan");

		await expect(
			setPlan.execute("tool-1", { plan: "# New plan" }, new AbortController().signal, () => {}, harness.ctx),
		).rejects.toThrow("set_plan is only available while plan mode is active.");
	});

	it("rejects empty plans and writes the canonical plan file when active", async () => {
		const harness = createExtensionHarness();
		const tempDir = await createTempDir();
		const planFilePath = path.join(tempDir, "session.plan.md");
		harness.ctx.ui.setWidget = vi.fn();
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: true,
					originLeafId: "leaf-1",
					planFilePath,
					lastPlanLeafId: null,
				},
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		const setPlan = harness.tools.get("set_plan");

		await expect(
			setPlan.execute("tool-2", { plan: "   " }, new AbortController().signal, () => {}, harness.ctx),
		).rejects.toThrow("set_plan requires non-empty plan text.");

		const result = await setPlan.execute(
			"tool-3",
			{ plan: "# Canonical Plan\n\n- verify behavior\n- add coverage" },
			new AbortController().signal,
			() => {},
			harness.ctx,
		);
		expect(result.content).toEqual([{ type: "text", text: "Plan written." }]);
		expect(result.details).toEqual({
			plan: "# Canonical Plan\n\n- verify behavior\n- add coverage",
		});
		expect(await readFile(planFilePath, "utf8")).toBe("# Canonical Plan\n\n- verify behavior\n- add coverage\n");
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith(
			"pi-plan-banner",
			expect.any(Function),
			expect.objectContaining({ placement: "aboveEditor" }),
		);
	});

	it("injects the plan prompt before agent start when plan mode is active", async () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getEntries = () => [
			{
				type: "custom",
				customType: "pi-plan:state",
				data: {
					version: 1,
					active: true,
					originLeafId: "leaf-1",
					planFilePath: "/tmp/session.plan.md",
					lastPlanLeafId: null,
				},
			},
		];

		planExtension(harness.pi as never);
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		const [entry] = await harness.emitAsync("before_agent_start");

		expect(entry).toEqual({
			message: expect.objectContaining({
				customType: "pi-plan:context",
				content: expect.stringContaining("set_plan"),
				display: false,
			}),
		});
	});
});
