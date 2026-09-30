import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { createContext, messageEntry, type ContextOverrides, type TestContext, type TestSessionManager } from "./context.js";
import type { registerPlanModeCommand } from "../flow.js";

type SyncOrAsync<F> = F extends (...args: infer A) => infer R ? (...args: A) => R | Awaited<R> : never;
type Message = Extract<Extract<SessionEntry, { type: "message" }>["message"], { role: "user" | "assistant" }>;
type MessageDraft = { id: string; parentId?: string | null; type: "message"; message: Pick<Message, "role"> };
type SessionFixture = Omit<Partial<TestSessionManager>, "getEntries" | "getEntry"> & {
	getEntries?: () => Array<SessionEntry | MessageDraft>;
	getEntry?: (id: string) => SessionEntry | MessageDraft | undefined;
};
export type FlowContextOverrides = Omit<ContextOverrides, "ui" | "sessionManager" | "waitForIdle" | "navigateTree"> & {
	ui?: Omit<Partial<TestContext["ui"]>, "select" | "notify"> & {
		select?: SyncOrAsync<TestContext["ui"]["select"]>;
		notify?: (message: string, type: NonNullable<Parameters<TestContext["ui"]["notify"]>[1]>) => void;
	};
	sessionManager?: SessionFixture;
	waitForIdle?: SyncOrAsync<TestContext["waitForIdle"]>;
	navigateTree?: SyncOrAsync<TestContext["navigateTree"]>;
};
function completeEntry(entry: SessionEntry | MessageDraft): SessionEntry {
	if ("timestamp" in entry) return entry;
	return messageEntry(entry.id, entry.message.role, entry.parentId ?? null);
}

/** Converts concise message drafts and synchronous test responses to SDK records and promises. */
export function createFlowContext(overrides: FlowContextOverrides = {}): TestContext {
	const { ui = {}, sessionManager = {}, waitForIdle, navigateTree, ...rest } = overrides;
	const { select, notify, ...uiRest } = ui;
	const { getEntries, getEntry, ...sessionRest } = sessionManager;
	return createContext({
		...rest,
		...(waitForIdle ? { waitForIdle: async () => waitForIdle() } : {}),
		...(navigateTree ? { navigateTree: async (...args) => navigateTree(...args) } : {}),
		ui: {
			...uiRest,
			...(select ? { select: async (...args) => select(...args) } : {}),
			...(notify ? { notify: (message, type = "info") => notify(message, type) } : {}),
		},
		sessionManager: {
			...sessionRest,
			...(getEntries ? { getEntries: () => getEntries().map(completeEntry) } : {}),
			...(getEntry ? { getEntry: (id) => { const entry = getEntry(id); return entry ? completeEntry(entry) : undefined; } } : {}),
		},
	});
}

export type FlowStateManager = Parameters<typeof registerPlanModeCommand>[1]["stateManager"];
export type PlanModeExited = NonNullable<Parameters<typeof registerPlanModeCommand>[1]["onPlanModeExited"]>;
export type CommandHandler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
export type ShortcutHandler = Parameters<ExtensionAPI["registerShortcut"]>[1]["handler"];

/** Checks the registration subset before adapting it at the partial-runtime boundary. */
export function registrationAPI(api: Pick<ExtensionAPI, "registerCommand" | "registerShortcut">): ExtensionAPI {
	// Flow registration exercises only these two independently checked members.
	return api as ExtensionAPI;
}

export function wrapCommand(handler: CommandHandler) {
	return (args: string, overrides: FlowContextOverrides) => handler(args, createFlowContext(overrides));
}
export function wrapShortcut(handler: ShortcutHandler) {
	return (overrides: FlowContextOverrides) => handler(createFlowContext(overrides));
}

export type NavigateOptions = Parameters<ExtensionCommandContext["navigateTree"]>[1];
