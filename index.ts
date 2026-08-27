import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadPlanModeConfig } from "./config";
import { registerPlanModeCommand } from "./flow";
import { resolveActivePlanFilePath } from "./plan-files";
import { loadPlanModePrompt } from "./prompts";
import { registerRequestUserInputTool } from "./request-user-input";
import { SetPlanSchema } from "./schemas";
import { CONTEXT_ENTRY_TYPE, createPlanModeStateManager } from "./state";

function summarizeSnippet(text: string, maxLength: number = 120): string {
	const singleLine = text.replaceAll(/\s+/g, " ").trim();
	if (!singleLine) {
		return "";
	}
	if (singleLine.length <= maxLength) {
		return singleLine;
	}
	return `${singleLine.slice(0, maxLength - 3)}...`;
}

interface SetPlanDetails {
	plan: string;
}

interface PlanModeExitDetails {
	planFilePath: string;
	planText?: string;
}

const PLAN_MODE_EXIT_ENTRY_TYPE = "pi-plan:exit";
const REQUEST_USER_INPUT_TOOL_NAME = "request_user_input";
const STARTUP_REFRESH_DELAY_MS = 250;

type RequestUserInputMode = "default" | "on" | "off";

export default function (pi: ExtensionAPI) {
	let requestUserInputMode: RequestUserInputMode = "default";
	let requestUserInputToolRegistered = false;

	const ensureRequestUserInputTool = () => {
		if (requestUserInputToolRegistered) {
			return;
		}

		registerRequestUserInputTool(pi);
		requestUserInputToolRegistered = true;
	};

	const isRequestUserInputEnabled = (planModeActive: boolean) => planModeActive || requestUserInputMode === "on";
	const isRequestUserInputEnabledInNormalMode = () => requestUserInputMode === "on";

	const stateManager = createPlanModeStateManager(pi, {
		shouldEnableRequestUserInput: isRequestUserInputEnabled,
		ensureRequestUserInputTool,
	});

	const syncRequestUserInputTool = () => {
		const shouldEnable = isRequestUserInputEnabled(stateManager.getState().active);
		if (shouldEnable) {
			ensureRequestUserInputTool();
		}

		const activeTools = pi.getActiveTools();
		const nextTools = shouldEnable
			? activeTools.includes(REQUEST_USER_INPUT_TOOL_NAME)
				? activeTools
				: [...activeTools, REQUEST_USER_INPUT_TOOL_NAME]
			: activeTools.filter((toolName) => toolName !== REQUEST_USER_INPUT_TOOL_NAME);

		const toolsChanged =
			activeTools.length !== nextTools.length || activeTools.some((toolName, index) => toolName !== nextTools[index]);
		if (toolsChanged) {
			pi.setActiveTools(nextTools);
		}
	};

	pi.registerMessageRenderer(PLAN_MODE_EXIT_ENTRY_TYPE, (message, { expanded }, theme) => {
		const render = (text: string) => new Text(text, 1, 0, (segment) => theme.bg("customMessageBg", segment));
		const details = message.details as PlanModeExitDetails | undefined;
		const title = String(message.content || "Plan mode ended.");
		const lines = [theme.fg("accent", theme.bold(title))];

		if (!details?.planFilePath) {
			return render(lines.join("\n"));
		}

		if (!details.planText?.trim()) {
			lines.push(theme.fg("warning", "No plan created."));
			return render(lines.join("\n"));
		}

		lines.push(theme.fg("muted", `Plan file: ${details.planFilePath}`));
		if (!expanded) {
			lines.push(theme.fg("dim", keyHint("app.tools.expand", "to expand")));
			return render(lines.join("\n"));
		}

		lines.push("");
		lines.push(details.planText);
		return render(lines.join("\n"));
	});

	pi.registerTool({
		description:
			"Overwrite the plan file with the full latest plan text. Call this whenever the plan changes so the plan file stays canonical.",
		async execute(
			_toolCallId,
			params: { plan: string },
			_signal,
			_onUpdate,
			ctx,
		): Promise<AgentToolResult<SetPlanDetails>> {
			if (!stateManager.getState().active) {
				throw new Error("set_plan is only available while plan mode is active.");
			}

			const planFilePath = resolveActivePlanFilePath(ctx, stateManager.getState().planFilePath);
			if (!planFilePath) {
				throw new Error("No active plan file. Restart plan mode and try again.");
			}

			const plan = String(params.plan ?? "").trim();
			if (!plan) {
				throw new Error("set_plan requires non-empty plan text.");
			}

			await mkdir(path.dirname(planFilePath), { recursive: true });
			await writeFile(planFilePath, `${plan}\n`, "utf8");

			if (stateManager.getState().planFilePath !== planFilePath) {
				stateManager.setState(ctx, {
					...stateManager.getState(),
					planFilePath,
				});
			}
			return {
				content: [{ type: "text", text: "Plan written." }],
				details: {
					plan,
				},
			};
		},
		label: "set_plan",
		name: "set_plan",
		parameters: SetPlanSchema,
		renderCall(args, theme) {
			const preview = summarizeSnippet(String(args.plan ?? ""), 90);
			return new Text(
				`${theme.fg("toolTitle", theme.bold("set_plan "))}${theme.fg("muted", preview || "(empty)")}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("muted", "Writing plan..."), 0, 0);
			}

			const details = result.details as SetPlanDetails | undefined;
			if (!details?.plan) {
				const text = result.content.find((item) => item.type === "text");
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			if (!expanded) {
				return new Text(
					`${theme.fg("success", "Plan written.")}\n${theme.fg("dim", keyHint("app.tools.expand", "to view plan"))}`,
					0,
					0,
				);
			}

			return new Text(`${theme.fg("success", "Plan written.")}\n${details.plan}`, 0, 0);
		},
	});

	pi.registerCommand("request-user-input", {
		description: "Enable, disable, or toggle the request_user_input tool.",
		handler: async (args, ctx) => {
			const requestedMode = String(args ?? "").trim().toLowerCase();
			if (requestedMode && !["on", "off", "toggle"].includes(requestedMode)) {
				ctx.ui.notify("Usage: /request-user-input [on|off|toggle]", "warning");
				return;
			}

			await ctx.waitForIdle();

			const isEnabled = isRequestUserInputEnabledInNormalMode();
			if (requestedMode === "on") {
				requestUserInputMode = "on";
			} else if (requestedMode === "off") {
				requestUserInputMode = "off";
			} else {
				requestUserInputMode = isEnabled ? "off" : "on";
			}

			stateManager.syncTools();
			const enabled = isRequestUserInputEnabledInNormalMode();
			ctx.ui.notify(`request_user_input ${enabled ? "enabled" : "disabled"} in normal mode.`, "info");
		},
	});

	const planModeCommand = registerPlanModeCommand(
		pi,
		{
			onPlanModeExited: ({ planFilePath, planText }) => {
				pi.sendMessage({
					customType: PLAN_MODE_EXIT_ENTRY_TYPE,
					content: "Plan mode ended.",
					display: true,
					details: {
						planFilePath,
						planText,
					},
				});
			},
			stateManager,
		},
		{ togglePlanModeKeybindings: [] },
	);

	pi.on("before_agent_start", async (_event, ctx) => {
		stateManager.refresh(ctx);
		if (!stateManager.getState().active) {
			return;
		}

		const prompt = await loadPlanModePrompt();
		return {
			message: {
				content: prompt,
				customType: CONTEXT_ENTRY_TYPE,
				display: false,
			},
		};
	});

	let startupRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	let planModeShortcutsConfigured = false;
	const cancelStartupRefresh = () => {
		if (!startupRefreshTimer) {
			return;
		}
		clearTimeout(startupRefreshTimer);
		startupRefreshTimer = undefined;
	};
	const refreshState = (ctx: ExtensionContext) => {
		cancelStartupRefresh();
		stateManager.refresh(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		const config = loadPlanModeConfig(ctx.cwd, { includeProjectConfig: ctx.isProjectTrusted() });
		requestUserInputMode = config.enable_request_user_input_on_startup ? "on" : "default";
		syncRequestUserInputTool();

		if (!planModeShortcutsConfigured) {
			planModeCommand.registerTogglePlanModeShortcuts(config.keybinding.toggle_plan_mode);
			planModeShortcutsConfigured = true;
		}

		cancelStartupRefresh();
		startupRefreshTimer = setTimeout(() => {
			startupRefreshTimer = undefined;
			stateManager.refresh(ctx);
		}, STARTUP_REFRESH_DELAY_MS);
		startupRefreshTimer.unref?.();
	});

	pi.on("session_tree", async (_event, ctx) => {
		refreshState(ctx);
	});

	pi.on("session_shutdown", async () => {
		cancelStartupRefresh();
	});
}
