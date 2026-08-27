import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

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
});

describe("loadPlanModeConfig", () => {
	test("uses alt+p when no configuration is present", async () => {
		const paths = await createConfigPaths();

		expect(loadPlanModeConfig(paths.projectDirPath, { agentDirPath: paths.agentDirPath })).toEqual({
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
});
