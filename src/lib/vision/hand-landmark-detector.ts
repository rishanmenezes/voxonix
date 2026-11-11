import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  SignRecognizerProvider,
  VisionObservation,
  HandObservation,
  Handedness,
} from "./types";

const WASM_CDN_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandLandmarkDetector implements SignRecognizerProvider {
  public readonly id = "mediapipe-hand-landmarker-livestream";
  public readonly name = "MediaPipe Hand Landmarker (LIVE_STREAM Mode)";

  private handLandmarker: HandLandmarker | null = null;
  private isInitializing = false;
  private isReady = false;
  private lastProcessedTimestamp = -1;
  private droppedFramesCount = 0;
  private onObservationCallback?: (obs: VisionObservation) => void;
  private latestObservation: VisionObservation | null = null;

  public isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof WebAssembly !== "undefined"
    );
  }

  public async initialize(onObservationCallback?: (obs: VisionObservation) => void): Promise<void> {
    if (this.isReady || this.isInitializing) return;
    this.isInitializing = true;
    this.onObservationCallback = onObservationCallback;

    const handleResults = (results: HandLandmarkerResult, timestamp: number) => {
      const hands: HandObservation[] = [];

      if (results.landmarks && results.landmarks.length > 0) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const rawLandmarks = results.landmarks[i];
          const rawWorld = results.worldLandmarks?.[i];
          const handednessInfo = results.handednesses?.[i]?.[0];

          const handedness: Handedness = handednessInfo?.categoryName === "Left" ? "Left" : "Right";
          const score = handednessInfo?.score ?? 0.8;

          hands.push({
            handedness,
            score,
            landmarks: rawLandmarks.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
            worldLandmarks: rawWorld?.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
          });
        }
      }

      const observation: VisionObservation = {
        timestamp,
        hands,
      };

      this.latestObservation = observation;
      if (this.onObservationCallback) {
        this.onObservationCallback(observation);
      }
    };

    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN_PATH);

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isReady = true;
    } catch (err) {
      console.warn(
        "[HandLandmarkDetector] Failed GPU delegate live-stream init, falling back to CPU delegate:",
        err,
      );
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN_PATH);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_PATH,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.isReady = true;
      } catch (fallbackErr) {
        console.error(
          "[HandLandmarkDetector] Fatal landmark detector initialization error:",
          fallbackErr,
        );
        throw fallbackErr;
      }
    } finally {
      this.isInitializing = false;
    }
  }

  public async processFrame(
    videoElement: HTMLVideoElement,
    timestamp: number,
  ): Promise<VisionObservation | null> {
    if (
      !this.isReady ||
      !this.handLandmarker ||
      !videoElement ||
      videoElement.readyState < 2 ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return null;
    }

    // MediaPipe requires strictly monotonically increasing timestamps in video stream mode
    const frameTime =
      timestamp > this.lastProcessedTimestamp ? timestamp : this.lastProcessedTimestamp + 1;
    this.lastProcessedTimestamp = frameTime;

    try {
      const results = this.handLandmarker.detectForVideo(videoElement, frameTime);
      const hands: HandObservation[] = [];

      if (results.landmarks && results.landmarks.length > 0) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const rawLandmarks = results.landmarks[i];
          const rawWorld = results.worldLandmarks?.[i];
          const handednessInfo = results.handednesses?.[i]?.[0];

          const handedness: Handedness = handednessInfo?.categoryName === "Left" ? "Left" : "Right";
          const score = handednessInfo?.score ?? 0.8;

          hands.push({
            handedness,
            score,
            landmarks: rawLandmarks.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
            worldLandmarks: rawWorld?.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
          });
        }
      }

      let bimanual = undefined;
      if (hands.length >= 2) {
        const rightHand = hands.find((h) => h.handedness === "Right") || hands[0];
        const leftHand = hands.find((h) => h.handedness === "Left") || hands[1];
        const rw = rightHand.landmarks[0];
        const lw = leftHand.landmarks[0];
        const interDist = Math.hypot(rw.x - lw.x, rw.y - lw.y, rw.z - lw.z);
        bimanual = {
          dominantHand: rightHand,
          nonDominantHand: leftHand,
          interWristDistance: Math.round(interDist * 1000) / 1000,
          relativeElevation: Math.round((rw.y - lw.y) * 1000) / 1000,
          isSymmetricMovement: Math.abs(rw.y - lw.y) < 0.08,
        };
      }

      const observation: VisionObservation = {
        timestamp: frameTime,
        hands,
        bimanual,
      };

      this.latestObservation = observation;
      if (this.onObservationCallback) {
        this.onObservationCallback(observation);
      }
      return observation;
    } catch (err) {
      this.droppedFramesCount++;
      console.warn("[HandLandmarkDetector] Frame dispatch error:", err);
      return this.latestObservation;
    }
  }

  public getDroppedFramesCount(): number {
    return this.droppedFramesCount;
  }

  public close(): void {
    if (this.handLandmarker) {
      try {
        this.handLandmarker.close();
      } catch {
        // ignore
      }
      this.handLandmarker = null;
    }
    this.latestObservation = null;
    this.isReady = false;
    this.isInitializing = false;
  }
}
