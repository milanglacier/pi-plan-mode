import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PLAN_MODE_CONFIG_FILENAME = "pi-plan-mode.jsonc";
export const DEFAULT_TOGGLE_PLAN_MODE_KEYBINDINGS = ["alt+p"] as const;

export interface PlanModeConfig {
	keybinding: {
		toggle_plan_mode: string[];
	};
}

interface ConfigFile {
	keybinding?: unknown;
}

export interface PlanModeConfigPathOverrides {
	agentDirPath?: string;
	globalConfigPath?: string;
	includeProjectConfig?: boolean;
	projectConfigPath?: string;
}

const KEYBINDING_MODIFIERS = new Set(["alt", "ctrl", "shift", "super"]);
const KEYBINDING_BASE_KEYS = new Set([
	..."abcdefghijklmnopqrstuvwxyz0123456789",
	"escape",
	"esc",
	"enter",
	"return",
	"tab",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
	..."`-=[]\\;',./!@#$%^&*()_|~{}:<>?",
	"+",
]);

function isValidKeybinding(value: string): boolean {
	const normalizedValue = value.toLowerCase();
	let baseKey: string | undefined;
	let modifierParts: string[];

	if (normalizedValue === "+") {
		baseKey = "+";
		modifierParts = [];
	} else if (normalizedValue.endsWith("++")) {
		baseKey = "+";
		modifierParts = normalizedValue.slice(0, -2).split("+");
	} else {
		const parts = normalizedValue.split("+");
		baseKey = parts.pop();
		modifierParts = parts;
	}

	if (!baseKey || !KEYBINDING_BASE_KEYS.has(baseKey)) {
		return false;
	}

	const modifiers = new Set<string>();
	for (const modifier of modifierParts) {
		if (!KEYBINDING_MODIFIERS.has(modifier) || modifiers.has(modifier)) {
			return false;
		}
		modifiers.add(modifier);
	}

	return true;
}

function stripJsonComments(source: string): string {
	let result = "";
	let inString = false;
	let escaped = false;

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		const nextCharacter = source[index + 1];

		if (inString) {
			result += character;
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '"') {
			inString = true;
			result += character;
			continue;
		}

		if (character === "/" && nextCharacter === "/") {
			index += 2;
			while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
				index += 1;
			}
			if (index < source.length) {
				result += source[index];
			}
			continue;
		}

		if (character === "/" && nextCharacter === "*") {
			index += 2;
			while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
				if (source[index] === "\n" || source[index] === "\r") {
					result += source[index];
				}
				index += 1;
			}
			if (index >= source.length) {
				throw new Error("unterminated block comment");
			}
			index += 1;
			continue;
		}

		result += character;
	}

	return result;
}

function stripTrailingCommas(source: string): string {
	let result = "";
	let inString = false;
	let escaped = false;

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];

		if (inString) {
			result += character;
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '"') {
			inString = true;
			result += character;
			continue;
		}

		if (character === ",") {
			let nextIndex = index + 1;
			while (/\s/.test(source[nextIndex] ?? "")) {
				nextIndex += 1;
			}
			if (source[nextIndex] === "]" || source[nextIndex] === "}") {
				index = nextIndex - 1;
				continue;
			}
		}

		result += character;
	}

	return result;
}

function parseJsonc(source: string): unknown {
	const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
	return JSON.parse(stripTrailingCommas(stripJsonComments(withoutBom)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfigFile(filePath: string): ConfigFile | undefined {
	let source: string;
	try {
		source = readFileSync(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		console.warn(`Could not read pi-plan-mode config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}

	try {
		const parsed = parseJsonc(source);
		if (!isRecord(parsed)) {
			throw new Error("configuration must contain a JSON object");
		}
		return parsed;
	} catch (error) {
		console.warn(`Could not parse pi-plan-mode config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

function readTogglePlanModeKeybindings(config: ConfigFile | undefined, filePath: string): string[] | undefined {
	if (!config || !isRecord(config.keybinding) || !("toggle_plan_mode" in config.keybinding)) {
		return undefined;
	}

	const value = config.keybinding.toggle_plan_mode;
	if (!Array.isArray(value) || !value.every((key) => typeof key === "string" && key.trim().length > 0)) {
		console.warn(`Ignoring invalid keybinding.toggle_plan_mode in ${filePath}: expected a list of valid keybindings.`);
		return undefined;
	}

	const keybindings = value.map((key) => key.trim());
	if (!keybindings.every(isValidKeybinding)) {
		console.warn(`Ignoring invalid keybinding.toggle_plan_mode in ${filePath}: expected a list of valid keybindings.`);
		return undefined;
	}

	return keybindings;
}

export function loadPlanModeConfig(cwd: string, options?: PlanModeConfigPathOverrides): PlanModeConfig {
	const globalConfigPath =
		options?.globalConfigPath ?? path.join(options?.agentDirPath ?? getAgentDir(), PLAN_MODE_CONFIG_FILENAME);
	const projectConfigPath =
		options?.projectConfigPath ?? path.join(cwd, CONFIG_DIR_NAME, PLAN_MODE_CONFIG_FILENAME);

	const globalConfig = readConfigFile(globalConfigPath);
	const projectConfig = options?.includeProjectConfig === false ? undefined : readConfigFile(projectConfigPath);
	const globalKeybindings = readTogglePlanModeKeybindings(globalConfig, globalConfigPath);
	const projectKeybindings = readTogglePlanModeKeybindings(projectConfig, projectConfigPath);

	return {
		keybinding: {
			toggle_plan_mode: [...(projectKeybindings ?? globalKeybindings ?? DEFAULT_TOGGLE_PLAN_MODE_KEYBINDINGS)],
		},
	};
}
