import { describe, expect, test } from "vitest";

import { getPiTuiFallbackPaths, requirePiTuiModule } from "../qna/pi-tui-loader";

describe("requirePiTuiModule", () => {
	test("uses pi's extension-provided static import by default", () => {
		const mod = requirePiTuiModule() as { Text?: unknown };

		expect(mod.Text).toBeTypeOf("function");
	});

	test("still supports require-based Bun global fallback for standalone callers", () => {
		const fallbackModule = { Text: class Text {} };
		const calls: string[] = [];
		const fallbackPath = getPiTuiFallbackPaths({ homeDir: "/home/test" })[0];
		const requireFn = (specifier: string) => {
			calls.push(specifier);
			if (specifier === fallbackPath) {
				return fallbackModule;
			}
			const error = new Error(`Cannot find module ${specifier}`) as Error & { code: string };
			error.code = "MODULE_NOT_FOUND";
			throw error;
		};

		expect(requirePiTuiModule({ homeDir: "/home/test", requireFn })).toBe(fallbackModule);
		expect(calls).toEqual(["@earendil-works/pi-tui", fallbackPath]);
	});
});
