import { vi } from "vitest";

type Handler = (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;

export function createExtensionHarness() {
	const commands = new Map<string, unknown>();
	const shortcuts = new Map<string, unknown>();
	const tools = new Map<string, any>();
	const renderers = new Map<string, unknown>();
	const handlers = new Map<string, Handler[]>();
	let activeTools = ["read", "bash", "edit", "write"];
	const entries: unknown[] = [];
	const sentMessages: unknown[] = [];

	const ctx: any = {
		cwd: process.cwd(),
		hasUI: true,
		isIdle: () => true,
		waitForIdle: vi.fn(async () => {}),
		navigateTree: vi.fn(async () => ({ cancelled: false })),
		ui: {
			confirm: vi.fn(async () => true),
			custom: vi.fn(async () => ({ cancelled: false })),
			getEditorText: vi.fn(() => ""),
			notify: vi.fn(),
			select: vi.fn(() => undefined),
			setEditorText: vi.fn(),
			setWidget: vi.fn(),
		},
		sessionManager: {
			appendLabelChange: vi.fn(),
			branch: vi.fn(),
			getBranch: vi.fn(() => entries),
			getEntries: vi.fn(() => entries),
			getEntry: vi.fn(() => undefined),
			getLeafId: vi.fn(() => "leaf-1"),
			getSessionDir: vi.fn(() => process.cwd()),
			getSessionFile: vi.fn(() => undefined),
			getSessionId: vi.fn(() => "session-1"),
			resetLeaf: vi.fn(),
		},
	};

	const pi: any = {
		appendEntry: vi.fn((customType: string, data: unknown) => {
			entries.push({ type: "custom", customType, data });
		}),
		getActiveTools: vi.fn(() => activeTools),
		on: vi.fn((eventName: string, handler: Handler) => {
			const eventHandlers = handlers.get(eventName) ?? [];
			eventHandlers.push(handler);
			handlers.set(eventName, eventHandlers);
		}),
		registerCommand: vi.fn((name: string, command: unknown) => {
			commands.set(name, command);
		}),
		registerMessageRenderer: vi.fn((customType: string, renderer: unknown) => {
			renderers.set(customType, renderer);
		}),
		registerShortcut: vi.fn((shortcut: string, options: unknown) => {
			shortcuts.set(shortcut, options);
		}),
		registerTool: vi.fn((tool: any) => {
			tools.set(tool.name, tool);
		}),
		sendMessage: vi.fn((message: unknown) => {
			sentMessages.push(message);
		}),
		setActiveTools: vi.fn((nextTools: string[]) => {
			activeTools = nextTools;
		}),
	};

	const emitAsync = async (eventName: string, event: unknown = { type: eventName }, eventCtx: unknown = ctx) => {
		const results = [];
		for (const handler of handlers.get(eventName) ?? []) {
			results.push(await handler(event, eventCtx));
		}
		return results;
	};

	const emit = (eventName: string, event: unknown = { type: eventName }, eventCtx: unknown = ctx) => {
		const results = [];
		for (const handler of handlers.get(eventName) ?? []) {
			results.push(handler(event, eventCtx));
		}
		return results;
	};

	return {
		commands,
		ctx,
		emit,
		emitAsync,
		entries,
		handlers,
		pi,
		renderers,
		shortcuts,
		sentMessages,
		tools,
	};
}
