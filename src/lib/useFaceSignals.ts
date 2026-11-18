// Background on-device face analysis (MediaPipe). Frames never leave the device; only 3 coarse flags are kept.
import { useEffect, useRef, useState } from "react";
import { aggregate, pushSample, type FaceSample, type VisualContext } from "./faceSignals";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type FaceStatus = "off" | "loading" | "on" | "denied" | "error";

export function useFaceSignals(enabled: boolean) {
  const [status, setStatus] = useState<FaceStatus>("off");
  const ctxRef = useRef<VisualContext | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus("off"); ctxRef.current = null; return; }
    let stopped = false, stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | undefined;
    let lm: { detectForVideo: (v: HTMLVideoElement, t: number) => any; close: () => void } | null = null;
    let buf: FaceSample[] = [];
    setStatus("loading");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 }, audio: false });
      } catch { if (!stopped) setStatus("denied"); return; }
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fs = await FilesetResolver.forVisionTasks(WASM);
        lm = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
        });
        if (stopped) return;
        const video = document.createElement("video"); // hidden, in memory only
        video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play();
        setStatus("on");
        timer = setInterval(() => {
          if (!lm || video.readyState < 2) return;
          const r = lm.detectForVideo(video, performance.now());
          const cats: { categoryName: string; score: number }[] = r.faceBlendshapes?.[0]?.categories ?? [];
          const g = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
          const m: number[] | undefined = r.facialTransformationMatrixes?.[0]?.data;
          // Rotation-matrix approximations: yaw from m[8], pitch from m[9].
          const s: FaceSample = {
            t: Date.now(), present: cats.length > 0,
            browDown: (g("browDownLeft") + g("browDownRight")) / 2,
            eyeBlink: (g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2,
            smile: (g("mouthSmileLeft") + g("mouthSmileRight")) / 2,
            yawAbs: m ? Math.abs(m[8] ?? 0) : 0, pitchDown: m ? Math.max(0, -(m[9] ?? 0)) : 0,
          };
          buf = pushSample(buf, s);
          ctxRef.current = aggregate(buf);
        }, 250); // ~4 fps, battery-friendly
      } catch { if (!stopped) setStatus("error"); }
    })();
    return () => {
      stopped = true; if (timer) clearInterval(timer);
      lm?.close(); stream?.getTracks().forEach((t) => t.stop()); ctxRef.current = null;
    };
  }, [enabled]);

  return { status, get: () => ctxRef.current ?? undefined };
}

export const faceStatusLabel: Record<FaceStatus, string> = {
  off: "זיהוי פנים כבוי", loading: "מפעיל זיהוי פנים…", on: "👁 זיהוי פנים פעיל (במכשיר בלבד)",
  denied: "אין הרשאת מצלמה — השיחה ממשיכה כרגיל", error: "זיהוי פנים לא זמין בדפדפן זה",
};
