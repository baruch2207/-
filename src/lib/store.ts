import { useSyncExternalStore } from "react";
import { seedAlerts, seedPatients } from "./fixtures";
import { emptyMemory } from "./engine";
import type { CheckIn } from "./ward";
import type { DemoAlert, PatientMemory, PatientProfile, StationOutcome } from "./types";

// Client-only demo store. SYNTHETIC DATA ONLY – never real PHI.
export interface DemoState {
  patients: PatientProfile[];
  alerts: DemoAlert[];
  memory: Record<string, PatientMemory>;
  outcomes: StationOutcome[];
  activePatientId: string;
  checkIns: CheckIn[];
  /** Bedside kiosk: a signed-in staff member handed this device to a patient. */
  kiosk: { patientId: string; liveAvatar: boolean; startedAt: string } | null;
  settings: { rate: number; autoSpeak: boolean; staffUnlocked: boolean; useServer: boolean };
}

const KEY = "ori-beyachad-demo-v1";
const initial = (): DemoState => ({
  patients: structuredClone(seedPatients),
  alerts: structuredClone(seedAlerts),
  memory: {},
  outcomes: [],
  activePatientId: "p1",
  checkIns: [],
  kiosk: null,
  settings: { rate: 0.88, autoSpeak: true, staffUnlocked: false, useServer: false },
});

let state: DemoState = initial();
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...initial(), ...JSON.parse(raw) };
    state = { ...state, settings: { ...state.settings, staffUnlocked: sessionStorage.getItem(KEY + "-staff") === "1" } };
  } catch { /* corrupted demo data: keep defaults */ }
  listeners.forEach((l) => l());
}

export function setState(fn: (s: DemoState) => DemoState) {
  state = fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    sessionStorage.setItem(KEY + "-staff", state.settings.staffUnlocked ? "1" : "0");
  } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function resetDemo() { setState(() => initial()); }

const serverSnapshot = initial();
export function useDemo(): DemoState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); queueMicrotask(hydrate); return () => listeners.delete(l); },
    () => state,
    () => serverSnapshot,
  );
}

export const getMemory = (s: DemoState, id: string): PatientMemory => ({ ...emptyMemory(), ...s.memory[id] });
export const activePatient = (s: DemoState) => s.patients.find((p) => p.id === s.activePatientId) ?? s.patients[0];

/** Adds an alert locally (dedup by id). Cloud sync is done by the caller. */
export function pushAlert(alert: DemoAlert) {
  setState((st) => (st.alerts.some((a) => a.id === alert.id) ? st : { ...st, alerts: [alert, ...st.alerts] }));
}
