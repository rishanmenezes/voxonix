import type {
  Point3D,
  HandObservation,
  BimanualObservation,
  Handedness,
  SignClassificationResult,
  SignCategory,
  SignRecognitionConfig,
  SignTelemetry,
  KinematicPoint,
  UpperBodyPoseObservation,
  FaceNonManualObservation,
} from "./types";
import { LearnedSignClassifier } from "./learned-sign-classifier";
import { TemporalSignClassifier } from "./temporal-sign-classifier";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

export interface SignClassificationEngineOptions {
  localPeerId: string;
  localDisplayName?: string;
  initialConfig?: Partial<SignRecognitionConfig>;
  onSignDetected?: (result: SignClassificationResult) => void;
  onWordFinalized?: (caption: CaptionPayload) => void;
  onTelemetry?: (telemetry: SignTelemetry) => void;
}

export class SignClassificationEngine {
  private localPeerId: string;
  private localDisplayName: string;
  private config: SignRecognitionConfig = {
    enabled: false,
    mode: "all",
    vocabularyTier: "production-safe",
    stabilityThresholdMs: 350, // 350ms steady hold required to commit letter
    minConfidence: 0.6,
    minMargin: 0.2,
    autoSpaceTimeoutMs: 1800, // 1.8s pause to complete word
    repeatHoldIntervalMs: 1100, // 1.1s continuous hold adds repeat letter (e.g. LL in HELLO)
    showHUD: true,
    enablePoseContext: true,
    enableFaceContext: true,
  };

  // Temporal Sign Classifier (YES, NO, THANK YOU, HELLO, J, Z)
  private temporalClassifier = new TemporalSignClassifier();

  // Temporal debounce & stability tracker
  private candidateLabel = "None";
  private candidateCategory: SignCategory = "idle";
  private candidateConfidence = 0;
  private candidateHand: Handedness = "Right";
  private candidateFirstSeenTimestamp = 0;
  private lastDebouncedCommittedLabel = "";
  private lastCommitTimestamp = 0;
  private repeatCountForCurrentHold = 0;

  // Dynamic Trajectory Tracking ('J' & 'Z')
  private pinkyTrajectoryBuffer: KinematicPoint[] = [];
  private indexTrajectoryBuffer: KinematicPoint[] = [];
  private dynamicTrackingLabel = "";
  private dynamicProgress = 0;
  private lastRejectionReason = "";

  // Word assembly buffer
  private currentWordBuffer = "";
  private autoSpaceTimer: ReturnType<typeof setTimeout> | null = null;
  private totalSignsEmitted = 0;
  private lastEmittedText = "";

  // Performance telemetry
  private frameCount = 0;
  private lastFpsCalculationTime = 0;
  private currentFps = 0;
  private lastInferenceLatencyMs = 0;

  private onSignDetected?: (result: SignClassificationResult) => void;
  private onWordFinalized?: (caption: CaptionPayload) => void;
  private onTelemetry?: (telemetry: SignTelemetry) => void;

  constructor(options: SignClassificationEngineOptions) {
    this.localPeerId = options.localPeerId;
    this.localDisplayName = options.localDisplayName || "You";
    if (options.initialConfig) {
      this.config = { ...this.config, ...options.initialConfig };
    }
    this.onSignDetected = options.onSignDetected;
    this.onWordFinalized = options.onWordFinalized;
    this.onTelemetry = options.onTelemetry;
  }

  public setLocalPeerId(peerId: string): void {
    this.localPeerId = peerId;
  }

  public updateConfig(patch: Partial<SignRecognitionConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled) {
      this.clearBuffer();
      this.temporalClassifier.reset();
    }
    this.emitTelemetry();
  }

  public getConfig(): SignRecognitionConfig {
    return { ...this.config };
  }

  /**
   * Process a single hand observation frame, evaluate static features and dynamic trajectory kinematics.
   */
  public evaluateHand(
    hand: HandObservation,
    timestamp: number,
    pose?: UpperBodyPoseObservation,
    face?: FaceNonManualObservation,
    bimanual?: BimanualObservation,
  ): SignClassificationResult {
    const startMs = performance.now();
    this.updateFps(timestamp);

    if (bimanual) {
      this.temporalClassifier.pushBimanualFrame(bimanual, timestamp);
    }

    if (!hand.landmarks || hand.landmarks.length < 21) {
      this.resetCandidateState();
      if (!bimanual) {
        this.temporalClassifier.reset();
      }
      this.lastInferenceLatencyMs = Math.round(performance.now() - startMs);
      const result: SignClassificationResult = {
        label: "None",
        confidence: 0,
        category: "idle",
        hand: hand.handedness,
        isDebounced: false,
        stableDurationMs: 0,
        isRejectedUnknown: true,
      };
      this.emitTelemetry();
      if (this.onSignDetected) this.onSignDetected(result);
      return result;
    }

    // 1. Push frame into Temporal Sequence Classifier with Pose, Face, and Bimanual Context
    this.temporalClassifier.pushFrame(hand, timestamp, pose);
    const temporalOutput = this.temporalClassifier.evaluate(
      timestamp,
      pose,
      face,
      this.config.vocabularyTier,
      bimanual,
    );

    if (temporalOutput.recognizedSign && temporalOutput.confidence >= this.config.minConfidence) {
      this.lastInferenceLatencyMs = Math.round(performance.now() - startMs);
      this.dynamicTrackingLabel = temporalOutput.recognizedSign;
      this.dynamicProgress = 1.0;

      // Immediately emit finalized phrase for temporal conversational signs
      this.handleCommittedSign(
        temporalOutput.recognizedSign,
        temporalOutput.category,
        hand.handedness,
      );

      const result: SignClassificationResult = {
        label: temporalOutput.recognizedSign,
        confidence: temporalOutput.confidence,
        category: temporalOutput.category,
        hand: hand.handedness,
        isDebounced: true,
        stableDurationMs: 500,
        trajectoryProgress: 1.0,
      };

      this.emitTelemetry();
      if (this.onSignDetected) this.onSignDetected(result);
      return result;
    }

    // 2. Evaluate Dynamic Trajectories fallback (J / Z)
    const dynamicResult = this.evaluateDynamicTrajectories(hand, timestamp);
    if (dynamicResult) {
      this.lastInferenceLatencyMs = Math.round(performance.now() - startMs);
      this.emitTelemetry();
      if (this.onSignDetected) this.onSignDetected(dynamicResult);
      return dynamicResult;
    }

    // 3. Evaluate Static Handshapes via Learned Classifier with Margin Gating
    const { label, confidence, category } = this.classifyHandshape(hand.landmarks);
    this.lastInferenceLatencyMs = Math.round(performance.now() - startMs);

    if (label !== "None" && confidence >= this.config.minConfidence) {
      if (label === this.candidateLabel) {
        const heldDuration = timestamp - this.candidateFirstSeenTimestamp;
        const isPastInitialThreshold = heldDuration >= this.config.stabilityThresholdMs;

        let didCommit = false;

        // First commit
        if (isPastInitialThreshold && this.lastDebouncedCommittedLabel !== label) {
          this.lastDebouncedCommittedLabel = label;
          this.lastCommitTimestamp = timestamp;
          this.repeatCountForCurrentHold = 0;
          this.handleCommittedSign(label, category, hand.handedness);
          didCommit = true;
        } else if (
          // Repeated letter support on continuous hold (e.g. LL in HELLO)
          isPastInitialThreshold &&
          this.lastDebouncedCommittedLabel === label &&
          category === "static-fingerspelling"
        ) {
          const timeSinceFirstCommit = timestamp - this.lastCommitTimestamp;
          const expectedRepeats = Math.floor(
            timeSinceFirstCommit / this.config.repeatHoldIntervalMs,
          );
          if (expectedRepeats > this.repeatCountForCurrentHold && expectedRepeats <= 2) {
            this.repeatCountForCurrentHold = expectedRepeats;
            this.handleCommittedSign(label, category, hand.handedness);
            didCommit = true;
          }
        }

        const result: SignClassificationResult = {
          label,
          confidence,
          category,
          hand: hand.handedness,
          isDebounced: didCommit,
          stableDurationMs: heldDuration,
        };

        this.candidateConfidence = confidence;
        this.emitTelemetry();
        if (this.onSignDetected) this.onSignDetected(result);
        return result;
      } else {
        // New candidate handshape
        this.candidateLabel = label;
        this.candidateCategory = category;
        this.candidateConfidence = confidence;
        this.candidateHand = hand.handedness;
        this.candidateFirstSeenTimestamp = timestamp;
        this.lastDebouncedCommittedLabel = "";
        this.repeatCountForCurrentHold = 0;
      }
    } else {
      this.resetCandidateState();
    }

    const result: SignClassificationResult = {
      label: this.candidateLabel,
      confidence: this.candidateConfidence,
      category: this.candidateCategory,
      hand: hand.handedness,
      isDebounced: false,
      stableDurationMs: 0,
    };

    this.emitTelemetry();
    if (this.onSignDetected) this.onSignDetected(result);
    return result;
  }

  private resetCandidateState(): void {
    this.candidateLabel = "None";
    this.candidateCategory = "idle";
    this.candidateConfidence = 0;
    this.candidateFirstSeenTimestamp = 0;
    this.lastDebouncedCommittedLabel = "";
    this.repeatCountForCurrentHold = 0;
    this.dynamicTrackingLabel = "";
    this.dynamicProgress = 0;
  }

  /**
   * Evaluates Dynamic Trajectory kinematics for ASL letters 'J' (Pinky Swoop) and 'Z' (Index Zigzag).
   */
  private evaluateDynamicTrajectories(
    hand: HandObservation,
    timestamp: number,
  ): SignClassificationResult | null {
    const landmarks = hand.landmarks;
    const pinkyTip = landmarks[20];
    const indexTip = landmarks[8];

    // Maintain sliding trajectory buffers (max 25 points, ~600ms)
    this.pinkyTrajectoryBuffer.push({ x: pinkyTip.x, y: pinkyTip.y, timestamp });
    this.indexTrajectoryBuffer.push({ x: indexTip.x, y: indexTip.y, timestamp });

    const pruneOld = (buf: KinematicPoint[]) => {
      while (buf.length > 0 && timestamp - buf[0].timestamp > 800) {
        buf.shift();
      }
      if (buf.length > 30) buf.shift();
    };
    pruneOld(this.pinkyTrajectoryBuffer);
    pruneOld(this.indexTrajectoryBuffer);

    // ── Check ASL 'J' Trajectory (starts with ASL 'I' shape + downward-curving hook) ──
    const isPinkyExtended = landmarks[20].y < landmarks[18].y && landmarks[18].y < landmarks[17].y;
    const isOtherCurled = landmarks[8].y > landmarks[5].y && landmarks[12].y > landmarks[9].y;

    if (isPinkyExtended && isOtherCurled && this.pinkyTrajectoryBuffer.length >= 8) {
      const pStart = this.pinkyTrajectoryBuffer[0];
      const pMid = this.pinkyTrajectoryBuffer[Math.floor(this.pinkyTrajectoryBuffer.length / 2)];
      const pEnd = this.pinkyTrajectoryBuffer[this.pinkyTrajectoryBuffer.length - 1];

      const downDy = pMid.y - pStart.y;
      const hookDx = pEnd.x - pMid.x;
      const hookDy = pEnd.y - pMid.y;

      // Downward stroke then swoop left/up
      if (downDy > 0.06 && hookDx < -0.03 && hookDy < 0.02) {
        this.pinkyTrajectoryBuffer = [];
        this.dynamicTrackingLabel = "J";
        this.dynamicProgress = 1.0;
        this.handleCommittedSign("J", "dynamic-trajectory", hand.handedness);
        return {
          label: "J",
          confidence: 0.91,
          category: "dynamic-trajectory",
          hand: hand.handedness,
          isDebounced: true,
          stableDurationMs: 500,
          trajectoryProgress: 1.0,
        };
      }
    }

    // ── Check ASL 'Z' Trajectory (starts with ASL 'D' shape + zigzag stroke) ──
    const isIndexExtended = landmarks[8].y < landmarks[6].y && landmarks[6].y < landmarks[5].y;
    const isMiddleCurled = landmarks[12].y > landmarks[9].y && landmarks[16].y > landmarks[13].y;

    if (isIndexExtended && isMiddleCurled && this.indexTrajectoryBuffer.length >= 12) {
      const b = this.indexTrajectoryBuffer;
      const p0 = b[0];
      const p1 = b[Math.floor(b.length * 0.33)];
      const p2 = b[Math.floor(b.length * 0.66)];
      const p3 = b[b.length - 1];

      const s1Dx = p1.x - p0.x; // Stroke 1: Right ->
      const s2Dx = p2.x - p1.x; // Stroke 2: Down-Left \
      const s2Dy = p2.y - p1.y;
      const s3Dx = p3.x - p2.x; // Stroke 3: Right ->

      if (s1Dx > 0.04 && s2Dx < -0.04 && s2Dy > 0.04 && s3Dx > 0.03) {
        this.indexTrajectoryBuffer = [];
        this.dynamicTrackingLabel = "Z";
        this.dynamicProgress = 1.0;
        this.handleCommittedSign("Z", "dynamic-trajectory", hand.handedness);
        return {
          label: "Z",
          confidence: 0.9,
          category: "dynamic-trajectory",
          hand: hand.handedness,
          isDebounced: true,
          stableDurationMs: 650,
          trajectoryProgress: 1.0,
        };
      }
    }

    return null;
  }

  /**
   * Evaluates static handshape using the Lightweight Learned Sign Classifier.
   */
  public classifyHandshape(landmarks: Point3D[]): {
    label: string;
    confidence: number;
    category: SignCategory;
  } {
    if (!landmarks || landmarks.length < 21) {
      return { label: "None", confidence: 0, category: "idle" };
    }

    const output = LearnedSignClassifier.getInstance().predict(
      landmarks,
      this.config.minConfidence,
    );

    return {
      label: output.label,
      confidence: output.confidence,
      category: output.category,
    };
  }

  private handleCommittedSign(label: string, category: SignCategory, hand: "Left" | "Right"): void {
    if (this.autoSpaceTimer) {
      clearTimeout(this.autoSpaceTimer);
      this.autoSpaceTimer = null;
    }

    if (category === "temporal-asl-sign" || category === "generic-gesture") {
      this.finalizeBufferedWord();
      this.emitCommunicationEvent(label, true, {
        isGesture: category === "generic-gesture",
        signHand: hand,
      });
      return;
    }

    if (category === "static-fingerspelling" || category === "dynamic-trajectory") {
      this.currentWordBuffer += label;
      this.emitTelemetry();

      this.emitCommunicationEvent(this.currentWordBuffer, false, { signHand: hand });

      this.autoSpaceTimer = setTimeout(() => {
        this.finalizeBufferedWord();
      }, this.config.autoSpaceTimeoutMs);
    }
  }

  public finalizeBufferedWord(): void {
    if (this.autoSpaceTimer) {
      clearTimeout(this.autoSpaceTimer);
      this.autoSpaceTimer = null;
    }

    const trimmed = this.currentWordBuffer.trim();
    if (!trimmed) return;

    this.emitCommunicationEvent(trimmed, true, { signHand: this.candidateHand });
    this.currentWordBuffer = "";
    this.emitTelemetry();
  }

  public backspace(): void {
    if (this.currentWordBuffer.length > 0) {
      this.currentWordBuffer = this.currentWordBuffer.slice(0, -1);
      this.emitTelemetry();
      if (this.currentWordBuffer.length > 0) {
        this.emitCommunicationEvent(this.currentWordBuffer, false, {
          signHand: this.candidateHand,
        });
      }
    }
  }

  public clearBuffer(): void {
    if (this.autoSpaceTimer) {
      clearTimeout(this.autoSpaceTimer);
      this.autoSpaceTimer = null;
    }
    this.currentWordBuffer = "";
    this.candidateLabel = "None";
    this.candidateConfidence = 0;
    this.pinkyTrajectoryBuffer = [];
    this.indexTrajectoryBuffer = [];
    this.dynamicTrackingLabel = "";
    this.dynamicProgress = 0;
    this.emitTelemetry();
  }

  private emitCommunicationEvent(
    text: string,
    isFinal: boolean,
    metadata?: { signHand?: "Left" | "Right"; isGesture?: boolean },
  ): void {
    const utteranceId = `sign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = Date.now();

    const payload: CaptionPayload = {
      captionId: `c_${utteranceId}_1`,
      utteranceId,
      revision: 1,
      source: "sign",
      speakerPeerId: this.localPeerId,
      speakerDisplayName: this.localDisplayName,
      text,
      isFinal,
      timestamp,
      clientSentAt: timestamp,
      confidence: this.candidateConfidence,
      metadata: {
        signHand: metadata?.signHand,
        isGesture: metadata?.isGesture,
      },
    };

    if (isFinal) {
      this.totalSignsEmitted++;
      this.lastEmittedText = `${metadata?.isGesture ? "[Gesture]" : "[Sign]"} ${text}`;
    }

    if (this.onWordFinalized && isFinal) {
      this.onWordFinalized(payload);
    }
  }

  private distance3D(a: Point3D, b: Point3D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private updateFps(timestamp: number): void {
    this.frameCount++;
    if (this.lastFpsCalculationTime === 0) {
      this.lastFpsCalculationTime = timestamp;
      return;
    }
    const elapsed = timestamp - this.lastFpsCalculationTime;
    if (elapsed >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsCalculationTime = timestamp;
    }
  }

  public getTelemetry(): SignTelemetry {
    return {
      isLoaded: true,
      detectorBackend: "MediaPipe Hands (Tasks Vision WASM/WebGL)",
      executionMode: "LIVE_STREAM",
      fps: this.currentFps,
      inferenceLatencyMs: this.lastInferenceLatencyMs,
      droppedFramesCount: 0,
      activeHandCount: this.candidateLabel !== "None" ? 1 : 0,
      currentDetectedLabel: this.candidateLabel,
      currentConfidence: this.candidateConfidence,
      currentCategory: this.candidateCategory,
      stableHeldMs:
        this.candidateFirstSeenTimestamp > 0
          ? Math.max(0, Date.now() - this.candidateFirstSeenTimestamp)
          : 0,
      bufferedWord: this.currentWordBuffer,
      totalSignsEmitted: this.totalSignsEmitted,
      lastEmittedText: this.lastEmittedText,
      dynamicTrackingLabel: this.dynamicTrackingLabel,
      dynamicProgress: this.dynamicProgress,
    };
  }

  private emitTelemetry(): void {
    if (this.onTelemetry) {
      this.onTelemetry(this.getTelemetry());
    }
  }

  public destroy(): void {
    this.clearBuffer();
  }
}
