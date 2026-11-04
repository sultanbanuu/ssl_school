import { z } from "zod";

export const skills = [
  "speaking",
  "vocabulary",
  "listening",
  "sentenceStructure",
] as const;
export const skillLabels = {
  speaking: "Speaking",
  vocabulary: "Vocabulary",
  listening: "Listening",
  sentenceStructure: "Sentence structure",
};
export const defaultWeights = {
  speaking: 35,
  vocabulary: 25,
  listening: 20,
  sentenceStructure: 20,
};
export const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const percent = z.number().finite().min(0).max(100);
export const weightsSchema = z
  .object({
    speaking: percent,
    vocabulary: percent,
    listening: percent,
    sentenceStructure: percent,
  })
  .strict()
  .refine(
    (w) => Math.abs(skills.reduce((sum, k) => sum + w[k], 0) - 100) < 0.001,
    "Weights must total 100%",
  );
const points = z
  .object({
    earned: z.number().finite().min(0).nullable(),
    possible: z.number().finite().positive().max(10000),
  })
  .strict()
  .refine(
    (p) => p.earned === null || p.earned <= p.possible,
    "Points earned cannot exceed points possible",
  );
export const assessmentSchema = z
  .object({
    weights: weightsSchema,
    speaking: z.array(z.number().int().min(0).max(5).nullable()).length(4),
    vocabulary: points,
    listening: points,
    sentenceStructure: points,
    homework: z.enum([
      "Not assigned",
      "Submitted",
      "Not submitted",
      "Reviewed",
    ]),
    feedback: z.string().max(4000),
    target: z.string().max(1000),
  })
  .strict();
export type Assessment = z.infer<typeof assessmentSchema>;
export type Weights = z.infer<typeof weightsSchema>;
export function emptyAssessment(weights: Weights = defaultWeights): Assessment {
  return {
    weights: { ...weights },
    speaking: [null, null, null, null],
    vocabulary: { earned: null, possible: 20 },
    listening: { earned: null, possible: 10 },
    sentenceStructure: { earned: null, possible: 20 },
    homework: "Not assigned",
    feedback: "",
    target: "",
  };
}
export function scores(a: Assessment) {
  const categories = {
    speaking: a.speaking.some((v) => v === null)
      ? null
      : (a.speaking.reduce<number>((sum, n) => sum + (n ?? 0), 0) / 20) * 100,
    vocabulary:
      a.vocabulary.earned === null
        ? null
        : (a.vocabulary.earned / a.vocabulary.possible) * 100,
    listening:
      a.listening.earned === null
        ? null
        : (a.listening.earned / a.listening.possible) * 100,
    sentenceStructure:
      a.sentenceStructure.earned === null
        ? null
        : (a.sentenceStructure.earned / a.sentenceStructure.possible) * 100,
  };
  const incomplete = skills.some(
    (k) => a.weights[k] > 0 && categories[k] === null,
  );
  return {
    categories,
    overall: incomplete
      ? null
      : Math.round(
          skills.reduce(
            (sum, k) => sum + ((categories[k] ?? 0) * a.weights[k]) / 100,
            0,
          ),
        ),
  };
}
