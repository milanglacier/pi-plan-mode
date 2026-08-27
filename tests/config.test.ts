import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadPlanModeConfig } from "../config";

const tempDirs: string[] = [];

async function createConfigPaths() {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-config-"));
	tempDirs.push(tempDir);

	const agentDirPath = path.join(tempDir, "agent");
	const projectDirPath = path.join(tempDir, "project");
	await mkdir(agentDirPath, { recursive: true });
	await mkdir(path.join(projectDirPath, ".pi"), { recursive: true });

	return { agentDirPath, projectDirPath };
}

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("loadPlanModeConfig", () => {
	test("uses alt+p when no configuration is present", async () => {
		const paths = await createConfigPaths();

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath })).toEqual({
			enable_request_user_input_on_startup: false,
			keybinding: {
				toggle_plan_mode: ["alt+p"],
			},
		});
	});

	test("loads a JSONC keybinding list from the global agent directory", async () => {
		const paths = await createConfigPaths();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{\n\t// Use the plan shortcut from the global config.\n\t"keybinding": {\n\t\t"toggle_plan_mode": ["ctrl+alt+p",],\n\t},\n}\n',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).keybinding.toggle_plan_mode).toEqual([
			"ctrl+alt+p",
		]);
	});

	test("lets project-local configuration override the global keybinding list", async () => {
		const paths = await createConfigPaths();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["ctrl+alt+p"] } }',
			"utf8",
		);
		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["shift+f2", "ctrl+f2"] } }',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).keybinding.toggle_plan_mode).toEqual([
			"shift+f2",
			"ctrl+f2",
		]);
	});

	test("ignores project-local configuration when the project is untrusted", async () => {
		const paths = await createConfigPaths();
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

		expect(
			loadPlanModeConfig(paths.projectDirPath, {
				agentDirPath: paths.agentDirPath,
				includeProjectConfig: false,
			}).keybinding.toggle_plan_mode,
		).toEqual(["ctrl+alt+p"]);
	});

	test("rejects keybindings with unknown modifiers", async () => {
		const paths = await createConfigPaths();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["crtl+p"] } }',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).keybinding.toggle_plan_mode).toEqual([
			"alt+p",
		]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("expected a list of valid keybindings"));
	});

	test("allows project-local configuration to disable the shortcut", async () => {
		const paths = await createConfigPaths();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["ctrl+alt+p"] } }',
			"utf8",
		);
		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": [] } }',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).keybinding.toggle_plan_mode).toEqual([]);
	});

	test("keeps the global setting when the project file omits the option", async () => {
		const paths = await createConfigPaths();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "keybinding": { "toggle_plan_mode": ["ctrl+alt+p"] } }',
			"utf8",
		);
		await writeFile(path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"), '{ "keybinding": {} }', "utf8");

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).keybinding.toggle_plan_mode).toEqual([
			"ctrl+alt+p",
		]);
	});

	test("loads the startup request user input setting and lets project config override it", async () => {
		const paths = await createConfigPaths();
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "enable_request_user_input_on_startup": true }',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).enable_request_user_input_on_startup).toBe(true);

		await writeFile(
			path.join(paths.projectDirPath, ".pi", "pi-plan-mode.jsonc"),
			'{ "enable_request_user_input_on_startup": false }',
			"utf8",
		);
		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).enable_request_user_input_on_startup).toBe(false);
	});

	test("ignores an invalid startup request user input setting", async () => {
		const paths = await createConfigPaths();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await writeFile(
			path.join(paths.agentDirPath, "pi-plan-mode.jsonc"),
			'{ "enable_request_user_input_on_startup": "yes" }',
			"utf8",
		);

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath }).enable_request_user_input_on_startup).toBe(false);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("expected a boolean"));
	});
});
