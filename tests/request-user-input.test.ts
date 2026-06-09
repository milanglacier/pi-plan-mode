import { describe, expect, test, vi } from "vitest";

import {
	buildRequestUserInputResponse,
	buildRequestUserInputSummary,
	collectRequestUserInputAnswers,
	normalizeRequestUserInputQuestions,
	summarizeRequestUserInputAnswer,
	type RequestUserInputQuestionResponse,
} from "../request-user-input";

describe("normalizeRequestUserInputQuestions", () => {
	test("trims ids and defaults options", () => {
		const result = normalizeRequestUserInputQuestions([
			{ id: " runtime ", header: "Runtime", question: "Which runtime?" },
		]);

		if ("error" in result) {
			throw new Error(result.error);
		}

		expect(result.questions[0]).toEqual({
			id: "runtime",
			header: "Runtime",
			question: "Which runtime?",
			options: [],
		});
	});

	test("rejects duplicate ids", () => {
		const result = normalizeRequestUserInputQuestions([
			{ id: "runtime", header: "One", question: "Q1" },
			{ id: "runtime", header: "Two", question: "Q2" },
		]);

		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("Duplicate id: runtime");
		}
	});
});

describe("buildRequestUserInputResponse", () => {
	test("preserves option, other, and note semantics", () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
			},
			{
				id: "notes",
				header: "Notes",
				question: "Any constraints?",
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}

		const responses: RequestUserInputQuestionResponse[] = [
			{
				selectedOptionIndex: 2,
				customText: "Need Bun APIs",
				selectionTouched: true,
				committed: true,
			},
			{
				selectedOptionIndex: 0,
				customText: "Ship in two phases",
				selectionTouched: true,
				committed: true,
			},
		];

		const response = buildRequestUserInputResponse(normalized.questions, responses);
		expect(response.answers.runtime.answers).toEqual(["Other", "user_note: Need Bun APIs"]);
		expect(response.answers.notes.answers).toEqual(["user_note: Ship in two phases"]);
	});
});

describe("collectRequestUserInputAnswers", () => {
	function createCtx(options?: {
		input?: Array<string | undefined>;
		select?: Array<string | undefined>;
	}) {
		const inputValues = [...(options?.input ?? [])];
		const selectValues = [...(options?.select ?? [])];
		return {
			ui: {
				input: vi.fn(async () => inputValues.shift()),
				select: vi.fn(async () => selectValues.shift()),
			},
		};
	}

	test("uses input for open-ended questions", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{ id: "notes", header: "Notes", question: "Any constraints?" },
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ input: ["Ship in two phases"] });

		const response = await collectRequestUserInputAnswers(ctx as never, normalized.questions);

		expect(ctx.ui.input).toHaveBeenCalledWith("Notes\nAny constraints?", "Any constraints?");
		expect(ctx.ui.select).not.toHaveBeenCalled();
		expect(response?.answers.notes.answers).toEqual(["user_note: Ship in two phases"]);
	});

	test("uses select for option questions and maps duplicate labels by prefix", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "First Node" },
					{ label: "Node", description: "Second Node" },
				],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ select: ["2. Node"] });

		const response = await collectRequestUserInputAnswers(ctx as never, normalized.questions);

		expect(ctx.ui.select).toHaveBeenCalledWith("Runtime\nWhich runtime?", ["1. Node", "2. Node", "3. Other"]);
		expect(ctx.ui.input).not.toHaveBeenCalled();
		expect(response?.answers.runtime.answers).toEqual(["Node"]);
	});

	test("asks for follow-up input for Other", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ select: ["2. Other"], input: ["Bun"] });

		const response = await collectRequestUserInputAnswers(ctx as never, normalized.questions);

		expect(ctx.ui.input).toHaveBeenCalledWith("Runtime\nWhich runtime?\nOther answer", "Type your answer");
		expect(response?.answers.runtime.answers).toEqual(["Other", "user_note: Bun"]);
	});

	test("returns null when select is cancelled", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ select: [undefined] });

		await expect(collectRequestUserInputAnswers(ctx as never, normalized.questions)).resolves.toBeNull();
	});

	test("returns null when Other input is cancelled", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ select: ["2. Other"], input: [undefined] });

		await expect(collectRequestUserInputAnswers(ctx as never, normalized.questions)).resolves.toBeNull();
	});

	test("asks multiple questions in order", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{ id: "notes", header: "Notes", question: "Any constraints?" },
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ input: ["Fast"], select: ["1. Node"] });

		const response = await collectRequestUserInputAnswers(ctx as never, normalized.questions);

		expect(ctx.ui.input).toHaveBeenNthCalledWith(1, "Notes\nAny constraints?", "Any constraints?");
		expect(ctx.ui.select).toHaveBeenNthCalledWith(1, "Runtime\nWhich runtime?", ["1. Node", "2. Other"]);
		expect(response?.answers.notes.answers).toEqual(["user_note: Fast"]);
		expect(response?.answers.runtime.answers).toEqual(["Node"]);
	});

	test("passes the abort signal to every built-in dialog", async () => {
		const normalized = normalizeRequestUserInputQuestions([
			{ id: "notes", header: "Notes", question: "Any constraints?" },
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}
		const ctx = createCtx({ input: ["Fast", "Bun"], select: ["2. Other"] });
		const signal = new AbortController().signal;

		const response = await collectRequestUserInputAnswers(ctx as never, normalized.questions, signal);

		expect(ctx.ui.input).toHaveBeenNthCalledWith(1, "Notes\nAny constraints?", "Any constraints?", { signal });
		expect(ctx.ui.select).toHaveBeenNthCalledWith(1, "Runtime\nWhich runtime?", ["1. Node", "2. Other"], {
			signal,
		});
		expect(ctx.ui.input).toHaveBeenNthCalledWith(2, "Runtime\nWhich runtime?\nOther answer", "Type your answer", { signal });
		expect(response?.answers.notes.answers).toEqual(["user_note: Fast"]);
		expect(response?.answers.runtime.answers).toEqual(["Other", "user_note: Bun"]);
	});
});

describe("summary helpers", () => {
	test("formats missing answer marker", () => {
		expect(summarizeRequestUserInputAnswer({ answers: [] })).toBe("(no answer)");
	});

	test("builds readable summary lines", () => {
		const details = {
			questions: [
				{
					id: "runtime",
					header: "Runtime",
					question: "Which runtime?",
					options: [],
				},
			],
			response: {
				answers: {
					runtime: { answers: ["user_note: Bun for startup"] },
				},
			},
		};

		const summary = buildRequestUserInputSummary(details);
		expect(summary).toContain("1. Which runtime?");
		expect(summary).toContain("Bun for startup");
	});
});
