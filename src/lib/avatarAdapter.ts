// Avatar provider adapter. Default is a STILL IMAGE – no lip-sync, no blinking.
export type AvatarMode = "still-image" | "prerecorded-external" | "liveavatar-realtime";

export interface AvatarProvider {
  mode: AvatarMode;
  connected: boolean;
  label: string;
  /** Realtime providers must obtain short-lived session tokens from the server; keys never reach the browser. */
  startSession?: () => Promise<{ sessionUrl: string }>;
  speak?: (text: string) => Promise<void>;
  stop?: () => Promise<void>;
}

export const ORI_PHOTO = "https://dynamic.heygen.ai/image/05fd59911b604c479002cda06ea4d8ad/original.png";
export const PRERECORDED_URL = "https://app.heygen.com/videos/4f1eb51bceec2b0aee94c15b81183d67";

export const stillImageProvider: AvatarProvider = { mode: "still-image", connected: true, label: "תמונה סטטית (ללא סנכרון שפתיים)" };
export const prerecordedProvider: AvatarProvider = { mode: "prerecorded-external", connected: true, label: "סרטון מוקלט מראש – הדגמה (מקור חיצוני)" };
export const liveAvatarProvider: AvatarProvider = { mode: "liveavatar-realtime", connected: false, label: "HeyGen LiveAvatar – לא מחובר" };

export const LIVEAVATAR_SETUP = [
  "1. לקבל חשבון ארגוני HeyGen עם גישת LiveAvatar/Streaming והסכם עיבוד נתונים.",
  "2. לשמור את המפתח כסוד שרת בלבד (HEYGEN_API_KEY) – לעולם לא בדפדפן.",
  "3. ליצור נתיב שרת שמנפיק טוקן סשן קצר-מועד ומחזיר אותו לדפדפן.",
  "4. לממש startSession/speak/stop במתאם זה מול ה-SDK הרשמי, ולשלוח רק טקסט שעבר את מנוע הבטיחות.",
  "5. לסמן 'חי' בממשק רק לאחר שסשן אמיתי נפתח בהצלחה.",
];
