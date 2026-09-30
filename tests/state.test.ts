import { describe, expect, test } from "vitest";
import { createPlanModeStateManager, getLatestState } from "../state";
import { createContext, customEntry } from "../test-utils/context.js";
import { createExtensionHarness } from "../test-utils/extension-runtime-harness.js";

describe("getLatestState", () => {
	test("returns inactive state when no persisted state exists", () => {
		const state = getLatestState(createContext());
		expect(state.active).toBe(false);
		expect(state.version).toBe(1);
	});
	test("prefers latest session state even when current branch has stale active state", () => {
		const ctx = createContext({ sessionManager: {
			getEntries: () => [
				customEntry("pi-plan:state", { version: 1, active: true, planFilePath: "/tmp/old.plan.md", lastPlanLeafId: "leaf-old" }, "state-1"),
				customEntry("pi-plan:state", { version: 1, active: false, planFilePath: "/tmp/new.plan.md", lastPlanLeafId: "leaf-new" }, "state-2"),
			],
			getBranch: () => [customEntry("pi-plan:state", { version: 1, active: true, planFilePath: "/tmp/old.plan.md" })],
		} });
		const state = getLatestState(ctx);
		expect(state.active).toBe(false);
		expect(state.planFilePath).toBe("/tmp/new.plan.md");
		expect(state.lastPlanLeafId).toBe("leaf-new");
	});
});

describe("createPlanModeStateManager tool visibility", () => {
	test("adds plan mode tools when plan mode starts", () => {
		const harness = createExtensionHarness();
		const manager = createPlanModeStateManager(harness.pi);
		manager.startPlanMode(createContext({ hasUI: false }), { planFilePath: "/tmp/session.plan.md" });
		expect(harness.pi.setActiveTools).toHaveBeenCalledExactlyOnceWith(
			["read", "bash", "edit", "write", "request_user_input", "set_plan"],
		);
	});
	test("removes plan mode tools when refreshed state is inactive", () => {
		const harness = createExtensionHarness();
		harness.pi.setActiveTools(["read", "bash", "set_plan", "request_user_input"]);
		const manager = createPlanModeStateManager(harness.pi);
		manager.refresh(createContext({ hasUI: false, sessionManager: {
			getEntries: () => [customEntry("pi-plan:state", { version: 1, active: false, planFilePath: "/tmp/session.plan.md" })],
		} }));
		expect(harness.pi.setActiveTools).toHaveBeenLastCalledWith(["read", "bash"]);
		expect(harness.pi.getActiveTools()).toEqual(["read", "bash"]);
	});
});
