import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { personFromLandmarks, type Person } from '@lampstand/core';
import modelAssetPath from '../../assets/models/pose_landmarker_lite.task?url';

/**
 * Finds people and their body landmarks in a camera's picture (MediaPipe's pose model, lite, on
 * the GPU). Loaded the first time someone is followed, from files inside Lampstand; nothing
 * leaves this computer (ADR 0007).
 */
let loading: Promise<PoseLandmarker> | null = null;

/** Up to this many people at once (a stage with a band). */
const MAX_PEOPLE = 6;

function load(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: MAX_PEOPLE,
      // Low: measured on real photos, the model's scores for clearly seen people can sit well
      // under 0.5 (none found at 0.2 on a sharp photo of three people standing). Stray finds are
      // weeded out by personFromLandmarks (eyes and both shoulders clearly seen) and duplicates
      // below.
      minPoseDetectionConfidence: 0.1,
      minPosePresenceConfidence: 0.1,
      minTrackingConfidence: 0.3,
    });
    const files = { wasmLoaderPath, wasmBinaryPath };
    // A computer whose GPU can't run it (no WebGL2) runs it on the CPU instead.
    return PoseLandmarker.createFromOptions(files, options('GPU')).catch(() =>
      PoseLandmarker.createFromOptions(files, options('CPU')),
    );
  })().catch((err: unknown) => {
    loading = null; // try again next time
    throw err;
  });
  return loading;
}

/** Get the model ready (the first follow takes a moment). */
export const prepareDetector = (): Promise<unknown> => load();

let lastAt = 0;

/** The people in this frame of the video (empty when it has no picture yet). */
export async function detectPeople(video: HTMLVideoElement): Promise<Person[]> {
  const d = await load();
  if (video.readyState < 2 || video.videoWidth === 0) return [];
  // The model wants timestamps that only go forward.
  const at = Math.max(lastAt + 1, performance.now());
  lastAt = at;
  const result = d.detectForVideo(video, at);
  return distinct(
    result.landmarks.flatMap((l) => {
      const p = personFromLandmarks(l);
      return p ? [p] : [];
    }),
  );
}

/** The same person found twice (at low confidence it happens): keep the first. */
export function distinct(people: readonly Person[]): Person[] {
  const kept: Person[] = [];
  for (const p of people)
    if (!kept.some((k) => Math.hypot(k.eye.x - p.eye.x, k.eye.y - p.eye.y) < 0.03)) kept.push(p);
  return kept;
}
