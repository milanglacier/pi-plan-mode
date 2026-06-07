import { Type } from "typebox";

export const SetPlanSchema = Type.Object(
	{
		plan: Type.String({
			description:
				"Full plan document text. This overwrites the current plan file and should include the complete latest plan.",
		}),
	},
	{ additionalProperties: false },
);

export const RequestUserInputOptionSchema = Type.Object(
	{
		description: Type.String({
			description: "One short sentence explaining impact/tradeoff if selected.",
		}),
		label: Type.String({ description: "User-facing label (1-5 words)." }),
	},
	{ additionalProperties: false },
);

export const RequestUserInputQuestionSchema = Type.Object(
	{
		header: Type.String({
			description: "Short header label shown in the UI (12 or fewer chars).",
		}),
		id: Type.String({
			description: "Stable identifier for mapping answers (snake_case).",
		}),
		options: Type.Optional(
			Type.Array(RequestUserInputOptionSchema, {
				description:
					"Optional multiple-choice options. When omitted or empty, the question is treated as open-ended and accepts freeform input.",
			}),
		),
		question: Type.String({
			description: "Single-sentence prompt shown to the user.",
		}),
	},
	{ additionalProperties: false },
);

export const RequestUserInputSchema = Type.Object(
	{
		questions: Type.Array(RequestUserInputQuestionSchema, {
			description: "Questions to show the user. Prefer 1 and do not exceed 3.",
			maxItems: 3,
			minItems: 1,
		}),
	},
	{ additionalProperties: false },
);
