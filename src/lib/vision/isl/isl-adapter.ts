import type { HandObservation, Point3D } from "../types";
import type { ISLAdapterConfig, ISLRecognitionResult } from "./isl-types";

/**
 * Decoupled Indian Sign Language (ISL) Recognition Adapter.
 *
 * SCOPE & TRANSPARENCY:
 * - Indian Sign Language recognition is an active research challenge.
 * - This adapter evaluates temporal video and bimanual landmark information.
 * - ALL predictions are strictly marked `isExperimental: true`.
 * - It enforces temporal stability and unknown rejection before committing candidates.
 * - It never silently mutates or autocorrects communication text.
 */
export class ISLRecognitionAdapter {
  private config: ISLAdapterConfig = {
    enabled: true,
    minConfidence: 0.65,
    stabilityThresholdMs: 400,
  };

  private candidateLabel = "None";
  private candidateFirstSeenMs = 0;
  private lastCommittedLabel = "None";
  private lastCommitTimestampMs = 0;
  private cooldownPeriodMs = 1200;

  constructor(initialConfig?: Partial<ISLAdapterConfig>) {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig };
    }
  }

  public updateConfig(patch: Partial<ISLAdapterConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  public getConfig(): ISLAdapterConfig {
    return { ...this.config };
  }

  /**
   * Resets temporal candidate state when hands drop or leave camera view.
   */
  public reset(): void {
    this.candidateLabel = "None";
    this.candidateFirstSeenMs = 0;
    this.lastCommittedLabel = "None";
    this.lastCommitTimestampMs = 0;
  }

  /**
   * Evaluates a frame containing one or two hands for ISL gestures.
   */
  public processFrame(hands: HandObservation[], timestampMs: number): ISLRecognitionResult {
    if (!this.config.enabled || hands.length === 0) {
      this.reset();
      return {
        label: "None",
        confidence: 0,
        isStable: false,
        isExperimental: true,
        backend: "offline-fallback",
        stableDurationMs: 0,
        twoHanded: false,
        isRejectedUnknown: true,
      };
    }

    const isBimanual = hands.length >= 2;
    const primaryHand = hands[0];
    const secondaryHand = isBimanual ? hands[1] : null;

    // Evaluate heuristic kinematics across hands
    const evaluated = this.classifyISLKinematics(primaryHand, secondaryHand);

    if (evaluated.label === "None" || evaluated.confidence < this.config.minConfidence) {
      this.candidateLabel = "None";
      this.candidateFirstSeenMs = 0;
      return {
        label: "None",
        confidence: evaluated.confidence,
        isStable: false,
        isExperimental: true,
        backend: "local-mediapipe-temporal",
        stableDurationMs: 0,
        twoHanded: isBimanual,
        isRejectedUnknown: true,
      };
    }

    // Temporal stability tracking
    if (evaluated.label === this.candidateLabel) {
      const stableDuration = timestampMs - this.candidateFirstSeenMs;
      const isPastThreshold = stableDuration >= this.config.stabilityThresholdMs;

      // Cooldown check to prevent rapid re-triggering
      const timeSinceLastCommit = timestampMs - this.lastCommitTimestampMs;
      const isPastCooldown =
        evaluated.label !== this.lastCommittedLabel || timeSinceLastCommit >= this.cooldownPeriodMs;

      const isCommitted = isPastThreshold && isPastCooldown;

      if (isCommitted) {
        this.lastCommittedLabel = evaluated.label;
        this.lastCommitTimestampMs = timestampMs;
      }

      return {
        label: evaluated.label,
        confidence: evaluated.confidence,
        isStable: isCommitted,
        isExperimental: true,
        backend: "local-mediapipe-temporal",
        stableDurationMs: stableDuration,
        twoHanded: evaluated.twoHanded,
        isRejectedUnknown: false,
      };
    } else {
      // New candidate started
      this.candidateLabel = evaluated.label;
      this.candidateFirstSeenMs = timestampMs;

      return {
        label: evaluated.label,
        confidence: evaluated.confidence,
        isStable: false,
        isExperimental: true,
        backend: "local-mediapipe-temporal",
        stableDurationMs: 0,
        twoHanded: evaluated.twoHanded,
        isRejectedUnknown: false,
      };
    }
  }

  /**
   * Evaluates ISL spatial and bimanual relationships from MediaPipe 3D landmarks.
   */
  private classifyISLKinematics(
    handA: HandObservation,
    handB: HandObservation | null,
  ): { label: string; confidence: number; twoHanded: boolean } {
    const lmA = handA.landmarks;
    if (!lmA || lmA.length < 21) {
      return { label: "None", confidence: 0, twoHanded: false };
    }

    // Helper: 3D Euclidean distance
    const dist = (p1: Point3D, p2: Point3D) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = p1.z - p2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Palm scale
    const palmScaleA = Math.max(0.01, dist(lmA[0], lmA[9]));

    // ── Single Hand ISL Signs ──
    if (!handB) {
      // 1. ISL "Good" (Thumbs Up)
      const isThumbUp = lmA[4].y < lmA[3].y && lmA[3].y < lmA[2].y;
      const isFingersCurled =
        dist(lmA[8], lmA[0]) < 1.1 * palmScaleA &&
        dist(lmA[12], lmA[0]) < 1.1 * palmScaleA &&
        dist(lmA[16], lmA[0]) < 1.1 * palmScaleA;

      if (isThumbUp && isFingersCurled) {
        return { label: "good", confidence: 0.88, twoHanded: false };
      }

      // 2. ISL "Bad" (Downward Palm)
      const isDownwardPalm = lmA[9].y < lmA[0].y && lmA[12].y > lmA[0].y;
      if (isDownwardPalm) {
        return { label: "bad", confidence: 0.72, twoHanded: false };
      }

      return { label: "None", confidence: 0.2, twoHanded: false };
    }

    // ── Bimanual (Two-Handed) ISL Signs ──
    const lmB = handB.landmarks;
    if (!lmB || lmB.length < 21) {
      return { label: "None", confidence: 0, twoHanded: false };
    }

    const wristDist = dist(lmA[0], lmB[0]);
    const indexTipDist = dist(lmA[8], lmB[8]);
    const indexAToThumbB = dist(lmA[8], lmB[4]);
    const indexBToThumbA = dist(lmB[8], lmA[4]);

    // 1. ISL Two-Handed Letter 'A' (Index touching Thumb Tip)
    if (indexAToThumbB < 0.35 * palmScaleA || indexBToThumbA < 0.35 * palmScaleA) {
      return { label: "Letter A", confidence: 0.85, twoHanded: true };
    }

    // 2. ISL Two-Handed Letter 'B' (Two Touching Loops)
    const thumbDist = dist(lmA[4], lmB[4]);
    if (indexTipDist < 0.4 * palmScaleA && thumbDist < 0.4 * palmScaleA) {
      return { label: "Letter B", confidence: 0.82, twoHanded: true };
    }

    // 3. ISL "Today" / "Now" (Both flat palms facing upward, held side by side)
    const areBothHandsLevel = Math.abs(lmA[0].y - lmB[0].y) < 0.15;
    const isSeparationModerate = wristDist > 0.6 * palmScaleA && wristDist < 3.5 * palmScaleA;
    const arePalmsOpen =
      dist(lmA[8], lmA[0]) > 1.2 * palmScaleA && dist(lmB[8], lmB[0]) > 1.2 * palmScaleA;

    if (areBothHandsLevel && isSeparationModerate && arePalmsOpen) {
      return { label: "today", confidence: 0.75, twoHanded: true };
    }

    // 4. ISL "Happy" (Both open hands near chest)
    if (lmA[0].y < 0.6 && lmB[0].y < 0.6 && arePalmsOpen && wristDist < 2.0 * palmScaleA) {
      return { label: "happy", confidence: 0.7, twoHanded: true };
    }

    return { label: "None", confidence: 0.3, twoHanded: true };
  }
}
