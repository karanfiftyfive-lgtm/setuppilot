// Typed access to the static JSON in data/. Static imports only: no fs, so core stays pure.
import catalogJson from "../data/catalog.json";
import goalsJson from "../data/goals.json";
import explanationsJson from "../data/explanations.json";
import type { Catalog, Goal, StepId, StepText } from "./types";

export interface Explanations {
  steps: Record<StepId, StepText & { osPromptWarning: boolean }>;
  errors: Record<string, { title: string; help: string }>;
  tips: { closePrograms: string; addRam: string; addGpu: string; remoteMachine: string };
  weakPc: { title: string; body: string };
  labels: { demo: string };
  toolConfig: { contextNote: string; providerName: string; claudeCodeHeader: string[]; rulesFile: string[] };
}

export const catalog = catalogJson as unknown as Catalog;
export const goals = (goalsJson as unknown as { goals: Goal[] }).goals;
export const explanations = explanationsJson as unknown as Explanations;
