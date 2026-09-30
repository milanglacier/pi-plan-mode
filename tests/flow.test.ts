import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "../types.js";
import { registrationAPI, wrapCommand, wrapShortcut, type FlowStateManager, type CommandHandler, type ShortcutHandler, type NavigateOptions } from "../test-utils/flow-fixtures.js";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
	BorderedLoader: class BorderedLoader {
		onAbort?: () => void;
	},
}));

const { registerPlanModeCommand } = await import("../flow");

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { recursive: true, force: true });
	}
});

function createRegisteredBindings(stateManager: FlowStateManager) {
	let handler: CommandHandler | undefined;
	let shortcutHandler: ShortcutHandler | undefined;
	const shortcutKeys: string[] = [];

	registerPlanModeCommand(
		registrationAPI({
			registerCommand: (_name, command) => { handler = command.handler; },
			registerShortcut: (shortcut, options) => {
				shortcutKeys.push(shortcut);
				shortcutHandler = options.handler;
			},
		} satisfies Pick<ExtensionAPI, "registerCommand" | "registerShortcut">),
		{ stateManager },
	);

	if (!handler) {
		throw new Error("Failed to register /plan handler");
	}
	if (!shortcutHandler) {
		throw new Error("Failed to register Alt+P shortcut handler");
	}

	return {
		handler: wrapCommand(handler),
		shortcutHandler: wrapShortcut(shortcutHandler),
		shortcutKeys,
	};
}

function createRegisteredHandler(stateManager: FlowStateManager) {
	return createRegisteredBindings(stateManager).handler;
}

describe("/plan Alt+P shortcut", () => {
	test("registers alt+p", () => {
		const { shortcutKeys } = createRegisteredBindings({
			getState: () => ({ version: 1, active: false }),
			setState: () => {},
			startPlanMode: () => {},
		});

		expect(shortcutKeys).toEqual(["alt+p"]);
	});

	test("starts plan mode without sending /plan text", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: undefined,
		};

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		await shortcutHandler({
			cwd: tmpDir,
			hasUI: false,
			isIdle: () => true,
			ui: {
				notify: () => {},
			},
			sessionManager: {
				getLeafId: () => "leaf-1",
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(startCalls).toEqual([
			{
				originLeafId: "leaf-1",
				planFilePath,
			},
		]);
	});

	test("shows start location choices when shortcut enters plan mode from branchable history", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: undefined,
		};

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: Array<{ prompt: string; choices: string[] }> = [];
		await shortcutHandler({
			cwd: tmpDir,
			hasUI: true,
			isIdle: () => true,
			ui: {
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Current branch";
				},
				notify: () => {},
			},
			sessionManager: {
				getLeafId: () => "leaf-2",
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{ id: "leaf-2", type: "message", message: { role: "assistant" } },
				],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(selectCalls).toEqual([
			{
				prompt: "Start planning in:",
				choices: ["Empty branch", "Current branch"],
			},
		]);
		expect(startCalls).toEqual([
			{
				originLeafId: "leaf-2",
				planFilePath,
			},
		]);
	});

	test("uses the same end flow when shortcut is pressed in active mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");
		let state: PlanModeState = {
			version: 1,
			active: true,
			originLeafId: "origin-leaf",
			planFilePath,
			lastPlanLeafId: undefined,
		};
		const setStateCalls: PlanModeState[] = [];
		const setEditorTextCalls: string[] = [];
		const branchCalls: string[] = [];
		const selectCalls: Array<{ prompt: string; choices: string[] }> = [];

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				setStateCalls.push(nextState);
				state = nextState;
			},
			startPlanMode: () => {},
		});

		await shortcutHandler({
			cwd: tmpDir,
			hasUI: true,
			isIdle: () => true,
			ui: {
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Exit";
				},
				notify: () => {},
				setEditorText: (text: string) => {
					setEditorTextCalls.push(text);
				},
				getEditorText: () => "",
			},
			sessionManager: {
				getLeafId: () => "planning-leaf",
				getEntries: () => [
					{
						id: "origin-leaf",
						type: "message",
						message: { role: "assistant" },
					},
					{
						id: "planning-leaf",
						type: "message",
						message: { role: "assistant" },
					},
				],
				getEntry: (entryId: string) =>
					entryId === "origin-leaf"
						? {
								id: "origin-leaf",
								type: "message",
								parentId: "user-1",
								message: { role: "assistant" },
							}
						: undefined,
				branch: (entryId: string) => {
					branchCalls.push(entryId);
				},
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(selectCalls).toEqual([
			{
				prompt: "Plan mode action (Esc stays in Plan mode)",
				choices: ["Exit", "Exit & summarize branch"],
			},
		]);
		expect(branchCalls).toEqual(["origin-leaf"]);
		expect(setStateCalls.at(-1)).toEqual({
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: "planning-leaf",
		});
		expect(setEditorTextCalls).toEqual([
			`Plan file: ${planFilePath}\nImplement the approved plan in this file. Keep changes focused, update tests, and summarize what was implemented.`,
		]);
	});
});

describe("/plan continue planning", () => {
	test("navigates to saved planning leaf before activating plan mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: "planning-leaf",
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: Array<{ entryId: string; options: NavigateOptions }> = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: false,
			waitForIdle: () => undefined,
			navigateTree: (entryId, options) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			ui: {
				notify: () => {},
			},
			sessionManager: {
				getLeafId: () => "current-leaf",
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{
						id: "planning-leaf",
						type: "message",
						message: { role: "assistant" },
					},
				],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(navigateCalls).toEqual([
			{
				entryId: "planning-leaf",
				options: {
					summarize: false,
					label: "plan",
				},
			},
		]);
		expect(startCalls).toEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});

	test("shows an info notification when continue resumes saved planning branch in UI mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: "planning-leaf",
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: Array<{ entryId: string; options: NavigateOptions }> = [];
		const notifications: Array<{ message: string; level: string | undefined }> = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			waitForIdle: () => undefined,
			navigateTree: (entryId, options) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			ui: {
				select: () => "Continue planning",
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
			sessionManager: {
				getLeafId: () => "current-leaf",
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{
						id: "planning-leaf",
						type: "message",
						message: { role: "assistant" },
					},
				],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(navigateCalls).toEqual([
			{
				entryId: "planning-leaf",
				options: {
					summarize: false,
					label: "plan",
				},
			},
		]);
		expect(notifications).toContainEqual({
			message: "Resumed previous planning branch.",
			level: "info",
		});
		expect(startCalls).toEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});

	test("falls back to current leaf when saved planning leaf is unavailable", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: "missing-leaf",
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: Array<{ entryId: string; options: NavigateOptions }> = [];
		const notifications: Array<{ message: string; level: string | undefined }> = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: false,
			waitForIdle: () => undefined,
			navigateTree: (entryId, options) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
			sessionManager: {
				getLeafId: () => "current-leaf",
				getEntries: () => [{ id: "user-1", type: "message", message: { role: "user" } }],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(navigateCalls.length).toBe(0);
		expect(notifications).toContainEqual({
			message: "Saved planning branch is unavailable. Continuing from the current branch tip.",
			level: "warning",
		});
		expect(startCalls).toEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});
});

describe("/plan start location prompt", () => {
	test("skips empty-vs-current selection when there is no prior history", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");

		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: undefined,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: Array<{ prompt: string; choices: string[] }> = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			waitForIdle: () => undefined,
			ui: {
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Current branch";
				},
				notify: () => {},
			},
			sessionManager: {
				getLeafId: () => "leaf-1",
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(selectCalls).toEqual([]);
		expect(startCalls).toEqual([
			{
				originLeafId: "leaf-1",
				planFilePath,
			},
		]);
	});

	test("offers start-fresh without branch chooser when an existing plan is present", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: Array<{ originLeafId?: string; planFilePath: string }> = [];
		let state: PlanModeState = {
			version: 1,
			active: false,
			planFilePath,
			lastPlanLeafId: undefined,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: Array<{ prompt: string; choices: string[] }> = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			waitForIdle: () => undefined,
			ui: {
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Start fresh";
				},
				notify: () => {},
			},
			sessionManager: {
				getLeafId: () => "leaf-1",
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getSessionFile: () => undefined,
				getSessionDir: () => tmpDir,
				getSessionId: () => "session-1",
			},
		});

		expect(selectCalls).toEqual([
			{
				prompt: `Start planning:\nPlan file: ${planFilePath}`,
				choices: ["Continue planning", "Start fresh"],
			},
		]);
		expect(startCalls).toHaveLength(1);
		expect(startCalls[0]).toEqual({
			originLeafId: "leaf-1",
			planFilePath: expect.any(String),
		});
		expect(startCalls[0].planFilePath).not.toBe(planFilePath);
	});
});
