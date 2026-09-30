import type { ExtensionCommandContext, ExtensionToolContext, SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const scratch = mkdtempSync(join(tmpdir(), "pi-plan-harness-"));
const runtime = await ModelRuntime.create({
	allowModelNetwork: false, authPath: join(scratch, "auth.json"), modelsPath: null,
	modelsStorePath: join(scratch, "models.json"), refreshOnCreate: false,
});
const modelRegistry = new ModelRegistry(runtime);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

export type TestContext = ExtensionCommandContext & ExtensionToolContext;
export type TestSessionManager = TestContext["sessionManager"] & Pick<SessionManager, "appendLabelChange" | "branch" | "resetLeaf">;
export type ContextOverrides = Partial<Omit<TestContext, "ui" | "sessionManager">> & {
	ui?: Partial<TestContext["ui"]>;
	sessionManager?: Partial<TestSessionManager>;
};

export function unsupported(name: string): never {
	throw new Error(`The plan test harness does not implement ${name}.`);
}

/** Supplies complete upstream contracts while checking each test's overrides. */
export function createContext(overrides: ContextOverrides = {}): TestContext & { sessionManager: TestSessionManager } {
	const sessionManager: TestSessionManager = {
		buildContextEntries: () => [],
		buildSessionProjection: () => ({ entries: [], messages: [], thinkingLevel: "off", model: null }),
		getBranch: () => [], getCwd: () => "/tmp", getEntries: () => [],
		getEntry: () => undefined, getHeader: () => null, getLabel: () => undefined,
		getLeafEntry: () => undefined, getLeafId: () => "leaf-1", getSessionDir: () => "/tmp",
		getSessionFile: () => undefined, getSessionId: () => "session-1", getSessionName: () => "",
		getTree: () => [], appendLabelChange: () => "label-1", branch() {}, resetLeaf() {},
		...overrides.sessionManager,
	};
	const ui: TestContext["ui"] = {
		get theme() { return unsupported("ui.theme"); },
		addAutocompleteProvider() {}, confirm: async () => true,
		custom: async () => unsupported("ui.custom"), editor: async () => undefined,
		getAllThemes: () => [], getEditorComponent: () => undefined, getEditorText: () => "",
		getTheme: () => undefined, getToolsExpanded: () => false,
		input: async () => undefined, notify() {}, onTerminalInput: () => () => {},
		pasteToEditor() {}, select: async () => undefined, setEditorComponent() {},
		setEditorText() {}, setFooter() {}, setHeader() {}, setHiddenThinkingLabel() {},
		setStatus() {}, setTheme: () => ({ success: true }), setTitle() {}, setToolsExpanded() {},
		setWidget() {}, setWorkingIndicator() {}, setWorkingMessage() {}, setWorkingVisible() {},
		...overrides.ui,
	};
	const ctx: TestContext & { sessionManager: TestSessionManager } = {
		cwd: process.cwd(), mode: "tui", hasUI: true, model: undefined, scopedModels: [], signal: undefined,
		modelRegistry,
		abort() {}, compact() {}, shutdown() {}, getContextUsage: () => undefined,
		getSystemPrompt: () => "", getSystemPromptOptions: () => ({ cwd: process.cwd() }),
		isIdle: () => true, isProjectTrusted: () => true,
		hasPendingMessages: () => false, waitForIdle: async () => {}, reload: async () => {},
		navigateTree: async () => ({ cancelled: false }), fork: async () => ({ cancelled: false }),
		newSession: async () => ({ cancelled: false }), switchSession: async () => ({ cancelled: false }),
		tools: [], executeTool: async () => unsupported("executeTool"),
		...overrides, ui, sessionManager,
	};
	// Theme access is explicit; context spreads preserve the remaining services.
	Object.defineProperty(ui, "theme", { enumerable: false });
	return ctx;
}

/** Adds the persistent metadata required by a custom session entry. */
export function customEntry(customType: string, data: unknown, id = "custom-1"): SessionEntry {
	return { type: "custom", customType, data, id, parentId: null, timestamp: "2026-01-01T00:00:00.000Z" };
}

export function messageEntry(id: string, role: "user" | "assistant", parentId: string | null = null): SessionEntry {
	const base = { id, parentId, timestamp: "2026-01-01T00:00:00.000Z", type: "message" as const };
	if (role === "user") return { ...base, message: { role, content: "", timestamp: 0 } };
	return { ...base, message: {
		role, content: [], api: "openai-responses", provider: "openai", model: "test-model", stopReason: "stop", timestamp: 0,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	} };
}
