// Physio progression ladders, from the user's uploaded protocol "התקדמות בפזיותרפיה".
// SYNTHETIC DEMO ONLY.
export interface Station {
  id: string;
  name: string;
  verb: string;
  distances: number[] | null; // meters; null = no distance
  assists: string[];
}

export const stations: Station[] = [
  { id: "forearm", name: "הליכון אמות", verb: "הליכה בתמיכת הליכון אמות", distances: [20, 50, 100], assists: ["עזרה רבה", "עזרה בינונית", "עזרה קלה"] },
  { id: "rollator", name: "הליכון גלגלים", verb: "הליכה בתמיכת הליכון גלגלים", distances: [20, 50, 100], assists: ["עזרה בינונית", "עזרה קלה", "השגחה", "עצמאי"] },
  { id: "cane", name: "מקל", verb: "הליכה בתמיכת מקל", distances: [20, 50, 100], assists: ["השגחה", "עצמאי"] },
  { id: "noaid", name: "ללא אביזרי עזר", verb: "הליכה ללא אביזר עזר", distances: [20, 50], assists: ["השגחה", "עצמאי"] },
  { id: "stairs", name: "מדרגות", verb: "עלייה וירידה במדרגות עם מעקה", distances: null, assists: ["עזרה בינונית", "עזרה קלה", "השגחה", "עצמאי"] },
  { id: "sit-stand", name: "מעבר ישיבה–עמידה", verb: "מעבר מישיבה לעמידה ולהפך עם הליכון גלגלים", distances: null, assists: ["עזרה רבה", "עזרה בינונית", "עזרה קלה", "השגחה", "עצמאי"] },
  { id: "sit-lie", name: "מעבר ישיבה–שכיבה", verb: "מעבר מישיבה לשכיבה ולהפך", distances: null, assists: ["עזרה רבה", "עזרה בינונית", "עזרה קלה", "השגחה", "עצמאי"] },
];

/** Ladder order: within each assist level, distances grow; then assist decreases. */
export function ladder(st: Station): string[] {
  return st.assists.flatMap((a) => (st.distances ? st.distances.map((d) => `${d} מ׳ · ${a}`) : [a]));
}

/** Demo "yesterday" level index, deterministic per patient+station. */
export function demoYesterday(patientId: string, st: Station): number {
  const n = [...(patientId + st.id)].reduce((s, c) => s + c.charCodeAt(0), 0);
  return n % Math.max(1, ladder(st).length - 1);
}

export function todayOptions(level: number, st: Station) {
  const l = ladder(st);
  const next = Math.min(level + 1, l.length - 1);
  const easier = Math.max(level - 1, 0);
  return { advance: { idx: next, text: l[next] ?? "" }, repeat: { idx: level, text: l[level] ?? "" }, easier: { idx: easier, text: l[easier] ?? "" } };
}
