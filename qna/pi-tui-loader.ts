/**
<!-- {=sharedQnaPiTuiLoaderOverview} -->

`local qna helpers` centralizes `@earendil-works/pi-tui` loading so first-party packages reuse one
fallback strategy instead of embedding Bun-global lookup logic in multiple runtime modules.

The shared loader returns pi's extension-provided `@earendil-works/pi-tui` module by default.
Custom require functions can still exercise the normal package resolution path and Bun global
fallback locations for tests or standalone callers running outside pi's extension loader.

<!-- {/sharedQnaPiTuiLoaderOverview} -->
*/
import * as piTuiModule from "@earendil-works/pi-tui";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export type PiTuiRequire = (specifier: string) => unknown;

export interface PiTuiLoaderOptions {
	homeDir?: string;
	bunInstallDir?: string | undefined;
	requireFn?: PiTuiRequire;
}

/**
<!-- {=sharedQnaGetPiTuiFallbackPathsDocs} -->

Return the ordered list of Bun global fallback paths to try for `@earendil-works/pi-tui`.

The list prefers an explicit `BUN_INSTALL` root when provided and always includes the default
`~/.bun/install/global/node_modules/@earendil-works/pi-tui` fallback without duplicates.

<!-- {/sharedQnaGetPiTuiFallbackPathsDocs} -->
*/
export function getPiTuiFallbackPaths(options: Omit<PiTuiLoaderOptions, "requireFn"> = {}): string[] {
	const homeDir = options.homeDir ?? os.homedir();
	const roots = new Set<string>();
	if (options.bunInstallDir) {
		roots.add(options.bunInstallDir);
	}
	roots.add(path.join(homeDir, ".bun"));
	return [...roots].map((root) => path.join(root, "install", "global", "node_modules", "@earendil-works", "pi-tui"));
}

/**
<!-- {=sharedQnaRequirePiTuiModuleDocs} -->

Load `@earendil-works/pi-tui` with a shared fallback strategy.

Pi exposes `@earendil-works/pi-tui` as an available extension import. Returning the static import
keeps us on pi's module resolver; using `createRequire(import.meta.url)` in that path bypasses pi's
resolver and can crash render callbacks when the peer dependency is not locally installed.

When a custom `requireFn` or fallback path options are provided, the loader keeps the older
standalone behavior: try normal package resolution, then walk Bun-global fallback locations, and
finally throw a helpful error that names every checked location when none resolve.

<!-- {/sharedQnaRequirePiTuiModuleDocs} -->
*/
export function requirePiTuiModule(options: PiTuiLoaderOptions = {}): unknown {
	if (!options.requireFn && !options.homeDir && !options.bunInstallDir) {
		return piTuiModule;
	}

	const requireFn = options.requireFn ?? createRequire(import.meta.url);
	try {
		return requireFn("@earendil-works/pi-tui");
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "MODULE_NOT_FOUND") {
			throw error;
		}

		const fallbackPaths = getPiTuiFallbackPaths(options);
		for (const fallbackPath of fallbackPaths) {
			try {
				return requireFn(fallbackPath);
			} catch (fallbackError) {
				const fallbackCode = (fallbackError as { code?: string }).code;
				if (fallbackCode !== "MODULE_NOT_FOUND") {
					throw fallbackError;
				}
			}
		}

		throw new Error(
			`Unable to load @earendil-works/pi-tui. Checked the local dependency and Bun global fallbacks: ${fallbackPaths.join(", ")}`,
			{ cause: error },
		);
	}
}
