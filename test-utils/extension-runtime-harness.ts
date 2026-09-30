import type { ExtensionAPI, ToolDefinition, MessageRenderer, SessionEntry } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import { createContext, customEntry, unsupported, type TestContext } from "./context.js";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[1];
type Handler = (event: never, ctx: never) => unknown;

export function createExtensionHarness() {
	const commands = new Map<string, Command>();
	const shortcuts = new Map<string, Shortcut>();
	const tools = new Map<string, ToolDefinition>();
	const renderers = new Map<string, MessageRenderer>();
	const handlers = new Map<string, Handler[]>();
	let activeTools = ["read", "bash", "edit", "write"];
	const entries: SessionEntry[] = [];
	const sentMessages: Parameters<ExtensionAPI["sendMessage"]>[0][] = [];
	const ctx = createContext({
		waitForIdle: vi.fn(async () => {}),
		navigateTree: vi.fn(async () => ({ cancelled: false })),
		ui: {
			confirm: vi.fn(async () => true), getEditorText: vi.fn(() => ""),
			input: vi.fn(async () => undefined), notify: vi.fn(), select: vi.fn(async () => undefined),
			setEditorText: vi.fn(), setWidget: vi.fn(),
		},
		sessionManager: {
			appendLabelChange: vi.fn(), branch: vi.fn(), getBranch: vi.fn(() => entries),
			getEntries: vi.fn(() => entries), getEntry: vi.fn(() => undefined),
			getLeafId: vi.fn(() => "leaf-1"), getSessionDir: vi.fn(() => process.cwd()),
			getSessionFile: vi.fn(() => undefined), getSessionId: vi.fn(() => "session-1"), resetLeaf: vi.fn(),
		},
	});
	const pi: ExtensionAPI = {
		appendEntry: vi.fn((customType: string, data: unknown) => {
			entries.push(customEntry(customType, data, `custom-${entries.length + 1}`));
		}),
		getActiveTools: vi.fn(() => activeTools),
		on(eventName: string, handler: Handler) {
			const eventHandlers = handlers.get(eventName) ?? [];
			eventHandlers.push(handler);
			handlers.set(eventName, eventHandlers);
			return () => { const index = eventHandlers.indexOf(handler); if (index >= 0) eventHandlers.splice(index, 1); };
		},
		registerCommand(name, command) { commands.set(name, command); },
		registerMessageRenderer(customType, renderer) {
			// The registry erases custom-message data generics after registration checks them.
			renderers.set(customType, renderer as MessageRenderer);
		},
		registerShortcut(shortcut, options) { shortcuts.set(shortcut, options); },
		registerTool(tool) {
			// The registry erases schema generics after the SDK registration contract checks them.
			tools.set(tool.name, tool as ToolDefinition);
		},
		sendMessage: vi.fn((message) => { sentMessages.push(message); }),
		setActiveTools: vi.fn((nextTools: string[]) => { activeTools = nextTools; }),
		getAllTools: () => [], getCommands: () => [], getFlag: () => undefined,
		getSessionName: () => undefined, getSettings: () => ({}), getThinkingLevel: () => "off",
		getMcpServers: () => [], registerMcpServer() {}, unregisterMcpServer() {},
		registerVirtualModel() {}, unregisterVirtualModel() {}, registerEntryRenderer() {},
		registerFlag() {}, registerMarkdownTransformer() {}, registerProvider() {}, unregisterProvider() {},
		sendUserMessage() {}, setLabel() {}, setModel: async () => true, setSessionName() {}, setThinkingLevel() {},
		exec: async () => unsupported("exec"),
		events: { emit() {}, on: () => () => {} },
	};

	const emit = (eventName: string, event: unknown = { type: eventName }, eventCtx: TestContext = ctx) => {
		// Runtime event names erase the SDK's overload relationship only at dispatch.
		return (handlers.get(eventName) ?? []).map(handler => handler(event as never, eventCtx as never));
	};
	const emitAsync = async (eventName: string, event: unknown = { type: eventName }, eventCtx: TestContext = ctx) => {
		const results: unknown[] = [];
		for (const handler of handlers.get(eventName) ?? []) results.push(await handler(event as never, eventCtx as never));
		return results;
	};
	function getCommand(name: string): Command { return commands.get(name) ?? unsupported(`command ${name}`); }
	function getTool(name: string): ToolDefinition { return tools.get(name) ?? unsupported(`tool ${name}`); }
	return { commands, ctx, emit, emitAsync, entries, handlers, pi, renderers, shortcuts, sentMessages, tools, getCommand, getTool };
}
