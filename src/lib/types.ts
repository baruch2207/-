export type Topic = "fear_falling" | "mood" | "pain" | "loneliness" | "progress" | "general";
export type ClinicianRole = "פיזיותרפיסט/ית" | "רופא/ה" | "אח/ות" | "עובד/ת סוציאלי/ת" | "פסיכולוג/ית" | "מרפא/ה בעיסוק" | "מנהל/ת טיפול";
export type Phase = "admission" | "week1" | "week2" | "discharge";

export interface ClinicianMetric {
  id: string;
  label: string;
  value: string;
  confirmedBy: ClinicianRole;
  confirmedAt: string; // ISO
}

export interface WeeklyPoint {
  phase: Phase;
  fim: number; // simulated FIM total 18-126
  steps: number; // supervised steps per session (simulated)
}

export interface Achievement {
  id: string;
  text: string;
  approvedBy: ClinicianRole;
  approvedAt: string;
}

export interface PatientProfile {
  id: string;
  alias: string; // synthetic first name
  age: number;
  condition: string;
  primaryTopic: Topic;
  protocolIds: string[];
  admittedAt: string;
  phase: Phase;
  caseManagerState: "קליטה" | "תכנון שיקום" | "שיקום פעיל" | "תכנון שחרור" | "שוחרר";
  approvedNotes: string[];
  metrics: ClinicianMetric[];
  weekly: WeeklyPoint[];
  achievements: Achievement[];
  goal?: { text: string; approvedBy: ClinicianRole; approvedAt: string };
  clinicianNote?: { text: string; role: ClinicianRole; at: string };
}

export type AlertPriority = "critical" | "high" | "medium" | "low";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type SafetyCategory = "chest_pain" | "breathing" | "neuro" | "suicidality" | "abuse" | "fall" | "verification" | "distress";

export interface DemoAlert {
  id: string;
  patientId: string;
  priority: AlertPriority;
  category: SafetyCategory;
  createdAt: string;
  quote: string;
  why: string;
  uncertainty: string;
  clinicianContext: string;
  targetRole: ClinicianRole;
  status: AlertStatus;
}

export interface ChatMessage {
  id: string;
  from: "patient" | "bot";
  text: string;
  at: string;
  quickReplies?: string[] | undefined;
  safety?: boolean | undefined;
  rationale?: Rationale | undefined;
}

export interface Rationale {
  topic: Topic;
  rule: string;
  protocolId?: string | undefined;
  technique?: string | undefined;
  source: "safety-policy" | "local-rules" | "server";
}

export interface MemoryFact {
  key: string;
  value: string;
  source: "patient-testimony" | "clinician-confirmed";
  at: string;
}

export interface QuizState {
  instrumentId: string;
  index: number;
  answers: string[];
}

export interface PatientMemory {
  messages: ChatMessage[];
  slot: { topic: Topic; step: number } | null;
  quiz: QuizState | null;
  facts: MemoryFact[];
  recentVariants: string[];
  verifications: { at: string; claim: string; clinician: string }[];
}

export interface StationOutcome {
  id: string;
  patientId: string;
  station: string;
  outcome: "completed" | "adapted" | "not_done";
  at: string;
}
