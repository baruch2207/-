// Questionnaire engine: contextual follow-up prompts INSIDE the chat, never standalone forms.
// IMPORTANT: only simulated demo items exist here. Validated scoring is allowed ONLY when ALL
// official authorized items are administered unchanged – which never happens in this demo –
// so this module NEVER produces a numeric score, only qualitative insights.
import { instrumentRegistry, RESEARCH_MARKER, type InstrumentProtocol } from "./protocols";
import type { QuizState, Topic } from "./types";

const topicInstrument: Partial<Record<Topic, string>> = {
  mood: "phq2",
  fear_falling: "sfesi",
  loneliness: "ucla3",
};

export const QUIZ_TRIGGER = "📝 סקירה קצרה (מדומה)";

export function instrumentById(id: string): InstrumentProtocol | undefined {
  return instrumentRegistry.find((i) => i.id === id);
}

/** Returns a fresh quiz for the topic, or null when no patient-rated instrument fits. */
export function quizForTopic(topic: Topic): QuizState | null {
  const id = topicInstrument[topic];
  if (!id) return null;
  const inst = instrumentById(id);
  if (!inst || inst.rater !== "מטופל") return null;
  return { instrumentId: id, index: 0, answers: [] };
}

export function currentItem(q: QuizState): { inst: InstrumentProtocol; item: string } | null {
  const inst = instrumentById(q.instrumentId);
  const item = inst?.demoItems[q.index];
  return inst && item ? { inst, item } : null;
}

export function answerQuiz(q: QuizState, answer: string): QuizState {
  return { ...q, index: q.index + 1, answers: [...q.answers, answer] };
}

export function isDone(q: QuizState): boolean {
  const inst = instrumentById(q.instrumentId);
  return !inst || q.index >= inst.demoItems.length;
}

/**
 * Qualitative summary only. Demo items are explicitly NOT the validated wording,
 * so a numeric score would be false – we record an insight for the team instead.
 */
export function qualitativeInsight(q: QuizState): string {
  const inst = instrumentById(q.instrumentId);
  const listed = q.answers.map((a, i) => `${i + 1}. ${a}`).join("; ");
  return `תובנה איכותנית (${inst?.name ?? q.instrumentId}, פריטים מדומים – לא ציון מתוקף): ${listed}`;
}

export const quizDisclaimer = `פריטים מדומים בשיחה – לא הכלי המקורי ולא ציון מתוקף. ${RESEARCH_MARKER}`;
