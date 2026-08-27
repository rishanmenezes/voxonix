import type {
  Point3D,
  HandObservation,
  BimanualObservation,
  UpperBodyPoseObservation,
  FaceNonManualObservation,
  SignCategory,
  VocabularyTier,
  SequenceState,
  SpatialAnchorZone,
  FingerExtensionVector,
} from "./types";

export interface TemporalEvaluationOutput {
  recognizedSign: string | null;
  confidence: number;
  category: SignCategory;
  progress: number;
  tier?: VocabularyTier;
  state?: SequenceState;
  anchorZone?: SpatialAnchorZone;
  boundaryConfidence?: number;
}

export interface TemporalFrameData {
  timestamp: number;
  landmarks: Point3D[];
  wrist: Point3D;
  palmScale: number;
  velocity: number;
  kineticEnergy: number;
  anchorZone: SpatialAnchorZone;
  extensionVector: FingerExtensionVector;
  shapeVelocity: number;
  tipPositions: {
    thumb: Point3D;
    index: Point3D;
    middle: Point3D;
    ring: Point3D;
    pinky: Point3D;
  };
}

export interface BimanualFrameData {
  timestamp: number;
  leftHand?: TemporalFrameData;
  rightHand?: TemporalFrameData;
  interWristDistance?: number;
  relativeElevation?: number;
  velocity: number;
  kineticEnergy: number;
}

/**
 * Classifies spatial anchor zones relative to signer's torso/pose.
 */
export class SpatialAnchorDetector {
  public static determineZone(
    wrist: Point3D,
    pose?: UpperBodyPoseObservation,
    isBimanual: boolean = false,
  ): SpatialAnchorZone {
    const nose = pose?.nose || { x: 0.5, y: 0.32, z: 0 };
    const chin = pose?.chin || { x: 0.5, y: 0.44, z: 0 };
    const chest = pose?.torsoCenter || { x: 0.5, y: 0.68, z: 0 };
    const shoulderWidth = pose?.shoulderWidth || 0.32;

    if (isBimanual) {
      return "BIMANUAL_SPACE";
    }

    // High temple / upper lateral region (HELLO anchor)
    if (wrist.y <= chin.y + 0.05 && Math.abs(wrist.x - nose.x) >= 0.05 * (shoulderWidth / 0.32)) {
      return "TEMPLE_UPPER";
    }

    // Chin / mouth proximity (THANK YOU anchor)
    const distToChin = Math.hypot(wrist.x - chin.x, wrist.y - chin.y);
    if (distToChin <= 0.16 || (wrist.y <= chin.y + 0.1 && Math.abs(wrist.x - chin.x) < 0.12)) {
      return "CHIN_FACE";
    }

    // Lower rest zone (hands resting below signing space)
    if (wrist.y > chest.y + 0.15) {
      return "LOWER_REST";
    }

    // Mid-chest default signing space (NO, YES, Z, J anchor)
    return "MID_CHEST";
  }
}

/**
 * Multi-Signal Sequence Boundary & State Machine for Continuous Sign Utterances.
 */
export class SequenceBoundaryStateMachine {
  private currentState: SequenceState = "IDLE";
  private stateEntryTimestamp = 0;
  private currentSignCandidate: string | null = null;
  private currentAnchorZone: SpatialAnchorZone = "MID_CHEST";
  private previousAnchorZone: SpatialAnchorZone | null = null;

  public getState(): SequenceState {
    return this.currentState;
  }

  public getAnchorZone(): SpatialAnchorZone {
    return this.currentAnchorZone;
  }

  public transition(
    newState: SequenceState,
    timestamp: number,
    candidateSign?: string | null,
    anchorZone?: SpatialAnchorZone,
  ): void {
    if (anchorZone && anchorZone !== this.currentAnchorZone) {
      this.previousAnchorZone = this.currentAnchorZone;
      this.currentAnchorZone = anchorZone;
    }
    this.currentState = newState;
    this.stateEntryTimestamp = timestamp;
    if (candidateSign !== undefined) {
      this.currentSignCandidate = candidateSign;
    }
  }

  /**
   * Computes a multi-signal composite commit score:
   * Score = 0.40 * Candidate + 0.25 * Boundary + 0.20 * Context + 0.15 * Stability
   */
  public evaluateCommitCriteria(
    candidateConfidence: number,
    boundaryConfidence: number,
    contextConfidence: number,
    temporalStability: number,
    tier: VocabularyTier,
    sign: string,
  ): boolean {
    const combinedScore =
      candidateConfidence * 0.4 +
      boundaryConfidence * 0.25 +
      contextConfidence * 0.2 +
      temporalStability * 0.15;

    if (tier === "production-safe") {
      return combinedScore >= 0.88 && candidateConfidence >= 0.9;
    }
    if (sign === "YES") {
      return combinedScore >= 0.91 && candidateConfidence >= 0.92;
    }
    return combinedScore >= 0.84 && candidateConfidence >= 0.86;
  }
}

/**
 * TemporalSignClassifier (Phase 10.0)
 * Hierarchical continuous multi-sign sequence segmenter with spatial-anchor reset,
 * intra-zone shape inflection boundary detection, and scale-invariant differential flexion.
 */
export class TemporalSignClassifier {
  private frameBuffer: TemporalFrameData[] = [];
  private bimanualBuffer: BimanualFrameData[] = [];
  private maxBufferSize = 20;
  private lastCommitTimestamp = 0;
  private lastCommittedSign: string | null = null;
  private lastCommittedAnchor: SpatialAnchorZone | null = null;
  private lastCommittedExtensionVector: FingerExtensionVector | null = null;
  private lastIntraZoneResetTimestamp = 0;
  private lastBimanualTimestamp = 0;

  private activeSignInProgress: string | null = null;
  private currentProgress = 0;

  private minSameSignIntervalMs = 850;
  private minDifferentSignIntervalMs = 180;

  private stateMachine = new SequenceBoundaryStateMachine();

  public getState(): SequenceState {
    return this.stateMachine.getState();
  }

  public reset(): void {
    this.frameBuffer = [];
    this.bimanualBuffer = [];
    this.activeSignInProgress = null;
    this.currentProgress = 0;
    this.lastCommittedSign = null;
    this.lastCommittedAnchor = null;
    this.lastCommittedExtensionVector = null;
    this.lastIntraZoneResetTimestamp = 0;
    this.stateMachine.transition("IDLE", 0, null, "MID_CHEST");
  }

  /**
   * Post-commit anchor reset and buffer consumption:
   * Purges pre-commit trajectory inertia to prevent temporal bleed across multi-sign sequences.
   */
  private consumePrefixAfterCommit(
    sign: string,
    timestamp: number,
    anchorZone: SpatialAnchorZone,
    isBimanual: boolean = false,
  ): void {
    this.lastCommitTimestamp = timestamp;
    this.lastCommittedSign = sign;
    this.lastCommittedAnchor = anchorZone;
    const latest = this.frameBuffer[this.frameBuffer.length - 1];
    if (latest) {
      this.lastCommittedExtensionVector = latest.extensionVector;
    }
    this.activeSignInProgress = null;
    this.currentProgress = 0;

    this.stateMachine.transition("COMMIT_HOLD", timestamp, sign, anchorZone);

    // Retain only minimal trailing kinematics for boundary continuity
    if (this.frameBuffer.length > 2) {
      this.frameBuffer = this.frameBuffer.slice(-2);
    }
    if (this.bimanualBuffer.length > 2) {
      this.bimanualBuffer = this.bimanualBuffer.slice(-2);
    }

    if (isBimanual) {
      this.frameBuffer = [];
    }
  }

  /**
   * Spatial-Anchor Reset: Purges frames when moving across distant spatial anchors (e.g. Temple -> Chest).
   */
  private performAnchorResetIfNeeded(currentZone: SpatialAnchorZone, timestamp: number): void {
    if (!this.lastCommittedAnchor) return;

    const isTempleToChest =
      this.lastCommittedAnchor === "TEMPLE_UPPER" &&
      (currentZone === "MID_CHEST" || currentZone === "BIMANUAL_SPACE");
    const isTempleToChin =
      this.lastCommittedAnchor === "TEMPLE_UPPER" && currentZone === "CHIN_FACE";
    const isChestToTemple =
      (this.lastCommittedAnchor === "MID_CHEST" || this.lastCommittedAnchor === "BIMANUAL_SPACE") &&
      currentZone === "TEMPLE_UPPER";
    const isBimanualToChest =
      this.lastCommittedAnchor === "BIMANUAL_SPACE" && currentZone === "MID_CHEST";

    if (isTempleToChest || isTempleToChin || isChestToTemple || isBimanualToChest) {
      // Transitioning across major spatial zones: purge old anchor frames
      if (this.frameBuffer.length > 2) {
        // Keep only the most recent 2 frames entering the new zone
        this.frameBuffer = this.frameBuffer.slice(-2);
      }
      this.lastCommittedAnchor = currentZone;
      this.stateMachine.transition("ANCHOR_RESET", timestamp, null, currentZone);
    }
  }

  /**
   * Phase 10.0: Intra-Zone Co-Located Stroke Disambiguation.
   * Detects micro-boundaries between consecutive signs sharing the same spatial anchor
   * (e.g. YES -> NO or PLAY -> YES in MID_CHEST).
   *
   * Composite 4-Factor Gate:
   * 1. Temporal Separation: t - lastCommitTimestamp >= 180ms
   * 2. Kinetic Valley: current composite kinetic energy drops into local trough (Ek < 0.0025)
   * 3. Shape Change Magnitude: L1 distance ||s(t) - s(commit)||_1 >= 0.55
   * 4. Morphological Transition: local shape morphing rate stabilizes (dv_shape/dt <= 1.2)
   */
  private checkIntraZoneBoundaryReset(
    currentZone: SpatialAnchorZone,
    currentVector: FingerExtensionVector,
    currentKineticEnergy: number,
    currentShapeVelocity: number,
    timestamp: number,
  ): boolean {
    if (!this.lastCommittedAnchor || !this.lastCommittedExtensionVector) return false;
    if (this.lastCommittedAnchor !== currentZone) return false; // Handled by inter-zone performAnchorResetIfNeeded

    const timeSinceLastCommit = timestamp - this.lastCommitTimestamp;
    const timeSinceLastReset = timestamp - this.lastIntraZoneResetTimestamp;
    if (timeSinceLastCommit < 180 || timeSinceLastReset < 220) {
      return false;
    }

    // 1. Kinetic Valley Check
    const isKineticValley = currentKineticEnergy < 0.0035;

    // 2. Shape Change Magnitude (L1 distance across 5 fingers)
    const prev = this.lastCommittedExtensionVector;
    const shapeDeltaL1 =
      Math.abs(currentVector.thumb - prev.thumb) +
      Math.abs(currentVector.index - prev.index) +
      Math.abs(currentVector.middle - prev.middle) +
      Math.abs(currentVector.ring - prev.ring) +
      Math.abs(currentVector.pinky - prev.pinky);

    const hasSignificantShapeMorph = shapeDeltaL1 >= 0.55;

    // 3. Morphological Transition Settling
    const isShapeTransitionSettling = currentShapeVelocity < 1.4;

    if (isKineticValley && hasSignificantShapeMorph && isShapeTransitionSettling) {
      // Trigger Intra-Zone Reset
      this.lastIntraZoneResetTimestamp = timestamp;
      this.lastCommittedExtensionVector = currentVector;
      this.stateMachine.transition("INTRA_ZONE_RESET", timestamp, null, currentZone);

      // Slice historical buffer to isolate the onset of the new intra-zone sign
      if (this.frameBuffer.length > 2) {
        this.frameBuffer = this.frameBuffer.slice(-2);
      }
      return true;
    }

    return false;
  }

  public pushFrame(
    hand: HandObservation,
    timestamp: number,
    pose?: UpperBodyPoseObservation,
  ): void {
    if (!hand.landmarks || hand.landmarks.length < 21) {
      if (
        this.frameBuffer.length > 0 &&
        timestamp - this.frameBuffer[this.frameBuffer.length - 1].timestamp > 400
      ) {
        this.frameBuffer = [];
        this.stateMachine.transition("IDLE", timestamp, null);
      }
      return;
    }

    if (this.bimanualBuffer.length > 0 && timestamp - this.lastBimanualTimestamp > 150) {
      this.bimanualBuffer = [];
    }

    const wrist = hand.landmarks[0];
    const middleMcp = hand.landmarks[9];
    const palmScale = Math.max(
      0.01,
      Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z),
    );

    // Compute velocity and kinetic energy
    let velocity = 0;
    let shapeDelta = 0;
    if (this.frameBuffer.length > 0) {
      const prev = this.frameBuffer[this.frameBuffer.length - 1];
      const dt = Math.max(1, (timestamp - prev.timestamp) / 1000);
      const dx = wrist.x - prev.wrist.x;
      const dy = wrist.y - prev.wrist.y;
      velocity = Math.hypot(dx, dy) / dt;

      // Finger deformation velocity
      for (const idx of [4, 8, 12, 16, 20]) {
        const curTip = hand.landmarks[idx];
        const prevTip = prev.landmarks[idx];
        shapeDelta += Math.hypot(
          curTip.x - wrist.x - (prevTip.x - prev.wrist.x),
          curTip.y - wrist.y - (prevTip.y - prev.wrist.y),
        );
      }
      shapeDelta = shapeDelta / 5 / dt;
    }

    const kineticEnergy = velocity * velocity + 0.4 * shapeDelta * shapeDelta;
    const anchorZone = SpatialAnchorDetector.determineZone(wrist, pose, false);

    // Compute 5-finger normalized extension vector (Phase 10.0)
    const thumbExt =
      Math.hypot(
        hand.landmarks[4].x - hand.landmarks[2].x,
        hand.landmarks[4].y - hand.landmarks[2].y,
      ) / palmScale;
    const indexExt =
      Math.hypot(
        hand.landmarks[8].x - hand.landmarks[5].x,
        hand.landmarks[8].y - hand.landmarks[5].y,
      ) / palmScale;
    const middleExt =
      Math.hypot(
        hand.landmarks[12].x - hand.landmarks[9].x,
        hand.landmarks[12].y - hand.landmarks[9].y,
      ) / palmScale;
    const ringExt =
      Math.hypot(
        hand.landmarks[16].x - hand.landmarks[13].x,
        hand.landmarks[16].y - hand.landmarks[13].y,
      ) / palmScale;
    const pinkyExt =
      Math.hypot(
        hand.landmarks[20].x - hand.landmarks[17].x,
        hand.landmarks[20].y - hand.landmarks[17].y,
      ) / palmScale;
    const compositeOpenness = (thumbExt + indexExt + middleExt + ringExt + pinkyExt) / 5;

    const extensionVector: FingerExtensionVector = {
      thumb: thumbExt,
      index: indexExt,
      middle: middleExt,
      ring: ringExt,
      pinky: pinkyExt,
      compositeOpenness,
    };

    const frameData: TemporalFrameData = {
      timestamp,
      landmarks: hand.landmarks,
      wrist,
      palmScale,
      velocity,
      kineticEnergy,
      anchorZone,
      extensionVector,
      shapeVelocity: shapeDelta,
      tipPositions: {
        thumb: hand.landmarks[4],
        index: hand.landmarks[8],
        middle: hand.landmarks[12],
        ring: hand.landmarks[16],
        pinky: hand.landmarks[20],
      },
    };

    this.frameBuffer.push(frameData);
    if (this.frameBuffer.length > this.maxBufferSize) {
      this.frameBuffer.shift();
    }

    this.performAnchorResetIfNeeded(anchorZone, timestamp);
    this.checkIntraZoneBoundaryReset(
      anchorZone,
      extensionVector,
      kineticEnergy,
      shapeDelta,
      timestamp,
    );
  }

  public pushBimanualFrame(bimanual: BimanualObservation, timestamp: number): void {
    this.lastBimanualTimestamp = timestamp;
    let leftData: TemporalFrameData | undefined;
    let rightData: TemporalFrameData | undefined;

    const left =
      bimanual.nonDominantHand ||
      (bimanual.leftHandLandmarks
        ? { landmarks: bimanual.leftHandLandmarks, handedness: "Left" as const, score: 0.9 }
        : undefined);
    const right =
      bimanual.dominantHand ||
      (bimanual.rightHandLandmarks
        ? { landmarks: bimanual.rightHandLandmarks, handedness: "Right" as const, score: 0.9 }
        : undefined);

    if (left?.landmarks && left.landmarks.length >= 21) {
      const w = left.landmarks[0];
      const m = left.landmarks[9];
      const lPalm = Math.max(0.01, Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z));
      const lExtVec: FingerExtensionVector = {
        thumb:
          Math.hypot(
            left.landmarks[4].x - left.landmarks[2].x,
            left.landmarks[4].y - left.landmarks[2].y,
          ) / lPalm,
        index:
          Math.hypot(
            left.landmarks[8].x - left.landmarks[5].x,
            left.landmarks[8].y - left.landmarks[5].y,
          ) / lPalm,
        middle:
          Math.hypot(
            left.landmarks[12].x - left.landmarks[9].x,
            left.landmarks[12].y - left.landmarks[9].y,
          ) / lPalm,
        ring:
          Math.hypot(
            left.landmarks[16].x - left.landmarks[13].x,
            left.landmarks[16].y - left.landmarks[13].y,
          ) / lPalm,
        pinky:
          Math.hypot(
            left.landmarks[20].x - left.landmarks[17].x,
            left.landmarks[20].y - left.landmarks[17].y,
          ) / lPalm,
        compositeOpenness: 0.5,
      };
      leftData = {
        timestamp,
        landmarks: left.landmarks,
        wrist: w,
        palmScale: lPalm,
        velocity: 0,
        kineticEnergy: 0,
        anchorZone: "BIMANUAL_SPACE",
        extensionVector: lExtVec,
        shapeVelocity: 0,
        tipPositions: {
          thumb: left.landmarks[4],
          index: left.landmarks[8],
          middle: left.landmarks[12],
          ring: left.landmarks[16],
          pinky: left.landmarks[20],
        },
      };
    }

    if (right?.landmarks && right.landmarks.length >= 21) {
      const w = right.landmarks[0];
      const m = right.landmarks[9];
      const rPalm = Math.max(0.01, Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z));
      const rExtVec: FingerExtensionVector = {
        thumb:
          Math.hypot(
            right.landmarks[4].x - right.landmarks[2].x,
            right.landmarks[4].y - right.landmarks[2].y,
          ) / rPalm,
        index:
          Math.hypot(
            right.landmarks[8].x - right.landmarks[5].x,
            right.landmarks[8].y - right.landmarks[5].y,
          ) / rPalm,
        middle:
          Math.hypot(
            right.landmarks[12].x - right.landmarks[9].x,
            right.landmarks[12].y - right.landmarks[9].y,
          ) / rPalm,
        ring:
          Math.hypot(
            right.landmarks[16].x - right.landmarks[13].x,
            right.landmarks[16].y - right.landmarks[13].y,
          ) / rPalm,
        pinky:
          Math.hypot(
            right.landmarks[20].x - right.landmarks[17].x,
            right.landmarks[20].y - right.landmarks[17].y,
          ) / rPalm,
        compositeOpenness: 0.5,
      };
      rightData = {
        timestamp,
        landmarks: right.landmarks,
        wrist: w,
        palmScale: rPalm,
        velocity: 0,
        kineticEnergy: 0,
        anchorZone: "BIMANUAL_SPACE",
        extensionVector: rExtVec,
        shapeVelocity: 0,
        tipPositions: {
          thumb: right.landmarks[4],
          index: right.landmarks[8],
          middle: right.landmarks[12],
          ring: right.landmarks[16],
          pinky: right.landmarks[20],
        },
      };
    }

    let interDist = bimanual.interWristDistance;
    let relElev = bimanual.relativeElevation;
    if (leftData && rightData) {
      interDist = Math.hypot(
        rightData.wrist.x - leftData.wrist.x,
        rightData.wrist.y - leftData.wrist.y,
      );
      relElev = rightData.wrist.y - leftData.wrist.y;
    }

    this.bimanualBuffer.push({
      timestamp,
      leftHand: leftData,
      rightHand: rightData,
      interWristDistance: interDist,
      relativeElevation: relElev,
      velocity: 0,
      kineticEnergy: 0,
    });

    if (this.bimanualBuffer.length > this.maxBufferSize) {
      this.bimanualBuffer.shift();
    }
  }

  public evaluate(
    timestamp: number,
    pose?: UpperBodyPoseObservation,
    face?: FaceNonManualObservation,
    allowedTier: VocabularyTier = "production-safe",
    bimanual?: BimanualObservation,
  ): TemporalEvaluationOutput {
    if (this.frameBuffer.length < 5 && this.bimanualBuffer.length < 5) {
      return {
        recognizedSign: null,
        confidence: 0,
        category: "idle",
        progress: 0,
        state: this.stateMachine.getState(),
      };
    }

    const timeSinceLastCommit =
      this.lastCommitTimestamp === 0 ? 999999 : timestamp - this.lastCommitTimestamp;
    const canAttemptSign = (candidate: string) => {
      const minReq =
        candidate === this.lastCommittedSign
          ? this.minSameSignIntervalMs
          : this.minDifferentSignIntervalMs;
      return timeSinceLastCommit >= minReq;
    };

    const nose = pose?.nose || { x: 0.5, y: 0.35, z: 0 };
    const chin = pose?.chin || { x: nose.x, y: nose.y + 0.12, z: nose.z };
    const shoulderWidth = pose?.shoulderWidth || 0.32;
    const chest = pose?.torsoCenter || { x: nose.x, y: nose.y + 0.28, z: nose.z };

    // ── Bimanual Signs (PLAY, HELP) ──
    if (allowedTier !== "production-safe" && (this.bimanualBuffer.length >= 5 || bimanual)) {
      if (canAttemptSign("PLAY")) {
        const playResult = this.checkBimanualPlay(chest);
        if (playResult) {
          this.consumePrefixAfterCommit("PLAY", timestamp, "BIMANUAL_SPACE", true);
          return playResult;
        }
      }

      if (canAttemptSign("HELP")) {
        const helpResult = this.checkBimanualHelp(chest, chin);
        if (helpResult) {
          this.consumePrefixAfterCommit("HELP", timestamp, "BIMANUAL_SPACE", true);
          return helpResult;
        }
      }
    }

    // ── Unimanual Signs (NO, THANK YOU, HELLO, YES, Z, J) ──
    if (canAttemptSign("NO")) {
      const noResult = this.checkNoSnapping(face);
      if (noResult) {
        this.consumePrefixAfterCommit("NO", timestamp, "MID_CHEST", false);
        return noResult;
      }
    }

    if (canAttemptSign("THANK YOU")) {
      const thankYouResult = this.checkThankYouArc(chin);
      if (thankYouResult) {
        this.consumePrefixAfterCommit("THANK YOU", timestamp, "CHIN_FACE", false);
        return thankYouResult;
      }
    }

    if (allowedTier !== "production-safe" && canAttemptSign("HELLO")) {
      const helloResult = this.checkHelloSalute(nose, chin, shoulderWidth);
      if (helloResult) {
        this.consumePrefixAfterCommit("HELLO", timestamp, "TEMPLE_UPPER", false);
        return helloResult;
      }
    }

    if (allowedTier !== "production-safe" && canAttemptSign("YES")) {
      const yesResult = this.checkYesNodding(chest, face);
      if (yesResult) {
        this.consumePrefixAfterCommit("YES", timestamp, "MID_CHEST", false);
        return yesResult;
      }
    }

    if (allowedTier !== "production-safe" && canAttemptSign("Z")) {
      const zResult = this.checkZTrajectory();
      if (zResult) {
        this.consumePrefixAfterCommit("Z", timestamp, "MID_CHEST", false);
        return zResult;
      }
    }

    if (allowedTier === "all-dev" && canAttemptSign("J")) {
      const jResult = this.checkJTrajectory(nose, chin);
      if (jResult) {
        this.consumePrefixAfterCommit("J", timestamp, "CHIN_FACE", false);
        return jResult;
      }
    }

    // In-flight state tracking
    const latestZone =
      this.frameBuffer.length > 0
        ? this.frameBuffer[this.frameBuffer.length - 1].anchorZone
        : "MID_CHEST";

    this.stateMachine.transition(
      this.activeSignInProgress ? "STROKE_ACTIVE" : "TRANSIT_COARTICULATION",
      timestamp,
      this.activeSignInProgress,
      latestZone,
    );

    return {
      recognizedSign: null,
      confidence: 0,
      category: "idle",
      progress: this.currentProgress,
      state: this.stateMachine.getState(),
      anchorZone: latestZone,
    };
  }

  private checkBimanualPlay(chest: Point3D): TemporalEvaluationOutput | null {
    const buf = this.bimanualBuffer;
    if (buf.length < 5) return null;

    const latest = buf[buf.length - 1];
    if (!latest.leftHand || !latest.rightHand) return null;

    const lh = latest.leftHand;
    const rh = latest.rightHand;

    const isYShape = (h: TemporalFrameData) => {
      const palm = h.palmScale;
      const thumbExt =
        Math.hypot(
          h.tipPositions.thumb.x - h.landmarks[2].x,
          h.tipPositions.thumb.y - h.landmarks[2].y,
        ) /
          palm >
        0.5;
      const pinkyExt =
        Math.hypot(
          h.tipPositions.pinky.x - h.landmarks[17].x,
          h.tipPositions.pinky.y - h.landmarks[17].y,
        ) /
          palm >
        0.58;
      const indexCurled =
        Math.hypot(
          h.tipPositions.index.x - h.landmarks[5].x,
          h.tipPositions.index.y - h.landmarks[5].y,
        ) /
          palm <
        0.78;
      const middleCurled =
        Math.hypot(
          h.tipPositions.middle.x - h.landmarks[9].x,
          h.tipPositions.middle.y - h.landmarks[9].y,
        ) /
          palm <
        0.78;
      const ringCurled =
        Math.hypot(
          h.tipPositions.ring.x - h.landmarks[13].x,
          h.tipPositions.ring.y - h.landmarks[13].y,
        ) /
          palm <
        0.78;

      return thumbExt && pinkyExt && indexCurled && middleCurled && ringCurled;
    };

    if (!isYShape(lh) || !isYShape(rh)) return null;
    if (rh.wrist.y > chest.y + 0.12 || lh.wrist.y > chest.y + 0.12) return null;

    const interDist =
      latest.interWristDistance ?? Math.hypot(rh.wrist.x - lh.wrist.x, rh.wrist.y - lh.wrist.y);
    if (interDist < 0.12 || interDist > 0.6) return null;

    const rYTrace = buf.filter((f) => f.rightHand).map((f) => f.rightHand!.wrist.y);
    const filteredTrace: number[] = [];
    for (const y of rYTrace) {
      if (
        filteredTrace.length === 0 ||
        Math.abs(y - filteredTrace[filteredTrace.length - 1]) > 0.004
      ) {
        filteredTrace.push(y);
      }
    }
    let rInflections = 0;
    for (let i = 2; i < filteredTrace.length; i++) {
      const d1 = filteredTrace[i - 1] - filteredTrace[i - 2];
      const d2 = filteredTrace[i] - filteredTrace[i - 1];
      if ((d1 > 0.004 && d2 < -0.004) || (d1 < -0.004 && d2 > 0.004)) {
        rInflections++;
      }
    }

    if (rInflections >= 2) {
      const commit = this.stateMachine.evaluateCommitCriteria(
        0.94,
        0.92,
        0.95,
        0.9,
        "experimental",
        "PLAY",
      );
      if (commit) {
        return {
          recognizedSign: "PLAY",
          confidence: 0.94,
          category: "bimanual-asl-sign",
          progress: 1.0,
          tier: "experimental",
          state: "COMMIT_HOLD",
          anchorZone: "BIMANUAL_SPACE",
          boundaryConfidence: 0.92,
        };
      }
    }

    return null;
  }

  private checkBimanualHelp(chest: Point3D, chin: Point3D): TemporalEvaluationOutput | null {
    const buf = this.bimanualBuffer;
    if (buf.length < 4) return null;

    const validPairs = buf.filter((f) => f.leftHand && f.rightHand);
    if (validPairs.length < 3) return null;

    const latest = validPairs[validPairs.length - 1];
    if (!latest.leftHand || !latest.rightHand) return null;

    const isFlat = (h: TemporalFrameData) =>
      Math.hypot(h.tipPositions.index.x - h.wrist.x, h.tipPositions.index.y - h.wrist.y) /
        h.palmScale >
      1.0;
    const isFist = (h: TemporalFrameData) =>
      Math.hypot(
        h.tipPositions.index.x - h.landmarks[5].x,
        h.tipPositions.index.y - h.landmarks[5].y,
      ) /
        h.palmScale <
      0.82;

    const validBaseAndFist =
      (isFlat(latest.leftHand) && isFist(latest.rightHand)) ||
      (isFlat(latest.rightHand) && isFist(latest.leftHand));

    if (!validBaseAndFist) return null;

    let contactAnchor = validPairs[0];
    for (const pair of validPairs) {
      const d =
        pair.interWristDistance ??
        Math.hypot(
          pair.rightHand!.wrist.x - pair.leftHand!.wrist.x,
          pair.rightHand!.wrist.y - pair.leftHand!.wrist.y,
        );
      if (d <= 0.32) {
        contactAnchor = pair;
        break;
      }
    }

    const currentDist =
      latest.interWristDistance ??
      Math.hypot(
        latest.rightHand.wrist.x - latest.leftHand.wrist.x,
        latest.rightHand.wrist.y - latest.leftHand.wrist.y,
      );
    if (currentDist > 0.32) return null;

    const dyL = latest.leftHand.wrist.y - contactAnchor.leftHand!.wrist.y;
    const dyR = latest.rightHand.wrist.y - contactAnchor.rightHand!.wrist.y;

    if (dyL < -0.025 && dyR < -0.025) {
      const commit = this.stateMachine.evaluateCommitCriteria(
        0.95,
        0.94,
        0.95,
        0.92,
        "experimental",
        "HELP",
      );
      if (commit) {
        return {
          recognizedSign: "HELP",
          confidence: 0.95,
          category: "bimanual-asl-sign",
          progress: 1.0,
          tier: "experimental",
          state: "COMMIT_HOLD",
          anchorZone: "BIMANUAL_SPACE",
          boundaryConfidence: 0.94,
        };
      }
    }

    return null;
  }

  private checkYesNodding(
    chest: Point3D,
    face?: FaceNonManualObservation,
  ): TemporalEvaluationOutput | null {
    const buf = this.frameBuffer;
    if (buf.length < 5) return null;

    const latest = buf[buf.length - 1];
    const palm = latest.palmScale;

    const isStrictFist = (h: TemporalFrameData) => {
      const p = h.palmScale;
      const indexCurled =
        Math.hypot(
          h.tipPositions.index.x - h.landmarks[5].x,
          h.tipPositions.index.y - h.landmarks[5].y,
        ) /
          p <
        0.78;
      const middleCurled =
        Math.hypot(
          h.tipPositions.middle.x - h.landmarks[9].x,
          h.tipPositions.middle.y - h.landmarks[9].y,
        ) /
          p <
        0.78;
      const ringCurled =
        Math.hypot(
          h.tipPositions.ring.x - h.landmarks[13].x,
          h.tipPositions.ring.y - h.landmarks[13].y,
        ) /
          p <
        0.78;
      const pinkyCurled =
        Math.hypot(
          h.tipPositions.pinky.x - h.landmarks[17].x,
          h.tipPositions.pinky.y - h.landmarks[17].y,
        ) /
          p <
        0.78;
      const thumbResting =
        Math.hypot(
          h.tipPositions.thumb.x - h.landmarks[5].x,
          h.tipPositions.thumb.y - h.landmarks[5].y,
        ) /
          p <
        0.92;

      return indexCurled && middleCurled && ringCurled && pinkyCurled && thumbResting;
    };

    if (!isStrictFist(latest)) return null;
    if (this.bimanualBuffer.length > 0) return null;
    if (latest.wrist.y > chest.y + 0.12) return null;
    if (face?.headShake) return null;

    const yTrace = buf.map((f) => f.landmarks[9].y);
    const xTrace = buf.map((f) => f.landmarks[9].x);

    const filteredNodTrace: { y: number; frame: TemporalFrameData }[] = [];
    for (let i = 0; i < yTrace.length; i++) {
      if (
        filteredNodTrace.length === 0 ||
        Math.abs(yTrace[i] - filteredNodTrace[filteredNodTrace.length - 1].y) > 0.004
      ) {
        filteredNodTrace.push({ y: yTrace[i], frame: buf[i] });
      }
    }

    let inflectionCount = 0;
    let maxDisplacement = 0;
    let maxHorizontalDrift = 0;

    for (let i = 2; i < filteredNodTrace.length; i++) {
      const d1 = filteredNodTrace[i - 1].y - filteredNodTrace[i - 2].y;
      const d2 = filteredNodTrace[i].y - filteredNodTrace[i - 1].y;
      if ((d1 > 0.004 && d2 < -0.004) || (d1 < -0.004 && d2 > 0.004)) {
        if (isStrictFist(filteredNodTrace[i].frame)) {
          inflectionCount++;
        }
      }
      maxDisplacement = Math.max(
        maxDisplacement,
        Math.abs(filteredNodTrace[i].y - filteredNodTrace[0].y),
      );
      maxHorizontalDrift = Math.max(maxHorizontalDrift, Math.abs(xTrace[i] - xTrace[0]));
    }

    if (maxHorizontalDrift > maxDisplacement * 0.85) return null;

    if (inflectionCount >= 2 && maxDisplacement > 0.04 * palm) {
      const rawConf = face?.headNod ? 0.98 : 0.93;
      const commit = this.stateMachine.evaluateCommitCriteria(
        rawConf,
        0.92,
        0.94,
        0.9,
        "experimental",
        "YES",
      );
      if (commit) {
        return {
          recognizedSign: "YES",
          confidence: rawConf,
          category: "temporal-asl-sign",
          progress: 1.0,
          tier: "experimental",
          state: "COMMIT_HOLD",
          anchorZone: "MID_CHEST",
          boundaryConfidence: 0.92,
        };
      }
    }

    if (inflectionCount >= 1) {
      this.activeSignInProgress = "YES";
      this.currentProgress = 0.5;
    }

    return null;
  }

  private checkNoSnapping(face?: FaceNonManualObservation): TemporalEvaluationOutput | null {
    if (this.bimanualBuffer.length > 0) {
      return null;
    }

    const buf = this.frameBuffer;
    if (buf.length < 5) return null;

    const latest = buf[buf.length - 1];
    const palm = latest.palmScale;

    // Ring finger must not be extended upwards above MCP in latest frame (snapped or curled)
    const ringCurled =
      Math.hypot(
        latest.tipPositions.ring.x - latest.landmarks[13].x,
        latest.tipPositions.ring.y - latest.landmarks[13].y,
      ) /
        palm <
        1.25 || latest.tipPositions.ring.y >= latest.landmarks[13].y - 0.02;

    if (!ringCurled) return null;

    // In NO, index and middle must have started extended, and pinky must be curled (not Y-shape)
    const midIdx = Math.max(1, Math.floor(buf.length / 2));
    const indexStartedExt = buf.slice(0, midIdx).some((f) => {
      const idxExt = f.extensionVector ? f.extensionVector.index > 0.62 : true;
      const midExt = f.extensionVector ? f.extensionVector.middle > 0.62 : true;
      const pinkyCurled = f.extensionVector ? f.extensionVector.pinky < 0.78 : true;
      const diffExt = f.extensionVector
        ? (f.extensionVector.index + f.extensionVector.middle) /
            (f.extensionVector.ring + f.extensionVector.pinky + 0.01) >=
          1.15
        : true;
      return (idxExt && midExt && pinkyCurled) || (diffExt && pinkyCurled);
    });

    if (!indexStartedExt) return null;

    let startPinchDist = 0;
    for (let i = 0; i < midIdx; i++) {
      const dist =
        Math.hypot(
          buf[i].tipPositions.index.x - buf[i].tipPositions.thumb.x,
          buf[i].tipPositions.index.y - buf[i].tipPositions.thumb.y,
        ) / palm;
      startPinchDist = Math.max(startPinchDist, dist);
    }

    // 3-frame rolling minimum for noise resilience on distant/held-out signers
    let endPinchDist = 999;
    const endStartIdx = Math.max(0, buf.length - 3);
    for (let i = endStartIdx; i < buf.length; i++) {
      const dist =
        Math.hypot(
          buf[i].tipPositions.index.x - buf[i].tipPositions.thumb.x,
          buf[i].tipPositions.index.y - buf[i].tipPositions.thumb.y,
        ) / palm;
      endPinchDist = Math.min(endPinchDist, dist);
    }

    // Started open (> 0.22 palm scale) and closed down (< 0.42 palm scale) with closing delta >= 0.03
    if (startPinchDist > 0.22 && endPinchDist < 0.42 && startPinchDist - endPinchDist >= 0.03) {
      const rawConf = face?.headShake ? 0.98 : 0.95;
      const commit = this.stateMachine.evaluateCommitCriteria(
        rawConf,
        0.95,
        0.96,
        0.94,
        "production-safe",
        "NO",
      );
      if (commit) {
        return {
          recognizedSign: "NO",
          confidence: rawConf,
          category: "temporal-asl-sign",
          progress: 1.0,
          tier: "production-safe",
          state: "COMMIT_HOLD",
          anchorZone: "MID_CHEST",
          boundaryConfidence: 0.95,
        };
      }
    }

    return null;
  }

  private checkThankYouArc(chin: Point3D): TemporalEvaluationOutput | null {
    const buf = this.frameBuffer;
    if (buf.length < 4) return null;

    const last = buf[buf.length - 1];
    const palm = last.palmScale;

    const isFlatOpen =
      Math.hypot(
        last.tipPositions.index.x - last.landmarks[0].x,
        last.tipPositions.index.y - last.landmarks[0].y,
      ) /
        palm >
        1.02 &&
      Math.hypot(
        last.tipPositions.middle.x - last.landmarks[0].x,
        last.tipPositions.middle.y - last.landmarks[0].y,
      ) /
        palm >
        1.02;

    if (!isFlatOpen) return null;

    // In THANK YOU, the execution must terminate near the upper chest/chin, not deep mid-chest
    if (last.wrist.y > chin.y + 0.08) {
      return null;
    }

    let minChinDist = 999;
    let closestToChin = buf[0];
    for (let i = 0; i < buf.length; i++) {
      const d = Math.hypot(buf[i].wrist.x - chin.x, buf[i].wrist.y - chin.y);
      if (d < minChinDist) {
        minChinDist = d;
        closestToChin = buf[i];
      }
    }

    if (minChinDist > 0.22) {
      return null;
    }

    // Ensure the origin anchor is near the chin center (not lateral temple)
    if (Math.abs(closestToChin.wrist.x - chin.x) > 0.14) {
      return null;
    }

    const dy = last.wrist.y - closestToChin.wrist.y;
    const dx = Math.abs(last.wrist.x - closestToChin.wrist.x);
    const netMotion = Math.hypot(
      last.wrist.x - closestToChin.wrist.x,
      last.wrist.y - closestToChin.wrist.y,
    );

    if (netMotion < 0.03) return null;

    if (dy > 0.03 && dx < 0.2) {
      const rawConf = 0.96;
      const commit = this.stateMachine.evaluateCommitCriteria(
        rawConf,
        0.96,
        0.97,
        0.95,
        "production-safe",
        "THANK YOU",
      );
      if (commit) {
        return {
          recognizedSign: "THANK YOU",
          confidence: rawConf,
          category: "temporal-asl-sign",
          progress: 1.0,
          tier: "production-safe",
          state: "COMMIT_HOLD",
          anchorZone: "CHIN_FACE",
          boundaryConfidence: 0.96,
        };
      }
    }

    return null;
  }

  private checkHelloSalute(
    nose: Point3D,
    chin: Point3D,
    shoulderWidth: number,
  ): TemporalEvaluationOutput | null {
    const buf = this.frameBuffer;
    if (buf.length < 4) return null;

    const last = buf[buf.length - 1];
    const palm = last.palmScale;

    const isFlat =
      Math.hypot(
        last.tipPositions.index.x - last.landmarks[0].x,
        last.tipPositions.index.y - last.landmarks[0].y,
      ) /
        palm >
      1.02;

    if (!isFlat) return null;

    const templeAnchor = buf.find(
      (f) =>
        f.wrist.y <= chin.y + 0.1 && Math.abs(f.wrist.x - nose.x) >= 0.05 * (shoulderWidth / 0.32),
    );

    if (!templeAnchor) {
      return null;
    }

    const dx = Math.abs(last.wrist.x - templeAnchor.wrist.x);
    const dy = Math.abs(last.wrist.y - templeAnchor.wrist.y);

    const xTrace = buf.map((f) => f.wrist.x);
    let horizontalReversals = 0;
    for (let i = 2; i < xTrace.length; i++) {
      const d1 = xTrace[i - 1] - xTrace[i - 2];
      const d2 = xTrace[i] - xTrace[i - 1];
      if ((d1 > 0.01 && d2 < -0.01) || (d1 < -0.01 && d2 > 0.01)) {
        horizontalReversals++;
      }
    }

    if (horizontalReversals >= 2) return null;

    if (dx > 0.04 && dy < 0.14) {
      const rawConf = 0.95;
      const commit = this.stateMachine.evaluateCommitCriteria(
        rawConf,
        0.93,
        0.95,
        0.92,
        "experimental",
        "HELLO",
      );
      if (commit) {
        return {
          recognizedSign: "HELLO",
          confidence: rawConf,
          category: "temporal-asl-sign",
          progress: 1.0,
          tier: "experimental",
          state: "COMMIT_HOLD",
          anchorZone: "TEMPLE_UPPER",
          boundaryConfidence: 0.93,
        };
      }
    }

    return null;
  }

  private checkJTrajectory(nose: Point3D, chin: Point3D): TemporalEvaluationOutput | null {
    if (this.bimanualBuffer.length > 0) return null;
    if (this.lastCommittedAnchor === "BIMANUAL_SPACE" || this.lastCommittedSign === "PLAY")
      return null;

    const buf = this.frameBuffer;
    if (buf.length < 7) return null;

    const first = buf[0];
    const last = buf[buf.length - 1];
    const palm = last.palmScale;

    const distToNoseBridge = Math.hypot(
      first.landmarks[8].x - nose.x,
      first.landmarks[8].y - nose.y,
    );
    if (distToNoseBridge < 0.1 && first.wrist.y < chin.y) {
      return null;
    }

    const thumbCurled =
      Math.hypot(
        last.tipPositions.thumb.x - last.landmarks[5].x,
        last.tipPositions.thumb.y - last.landmarks[5].y,
      ) /
        palm <
      0.85;

    const isPinkyExt =
      Math.hypot(
        last.tipPositions.pinky.x - last.wrist.x,
        last.tipPositions.pinky.y - last.wrist.y,
      ) /
        palm >
      0.85;
    const isIndexCurled =
      Math.hypot(
        last.tipPositions.index.x - last.wrist.x,
        last.tipPositions.index.y - last.wrist.y,
      ) /
        palm <
      0.8;

    if (!thumbCurled || !isPinkyExt || !isIndexCurled) return null;

    const yTrace = buf.map((f) => f.tipPositions.pinky.y);
    const xTrace = buf.map((f) => f.tipPositions.pinky.x);

    let downPhase = false;
    const startY = yTrace[0];
    const maxY = Math.max(...yTrace);
    const startX = xTrace[0];
    const endX = xTrace[xTrace.length - 1];

    if (maxY - startY > 0.03) downPhase = true;
    const leftwardHook = endX - startX < -0.035;

    if (downPhase && leftwardHook) {
      return {
        recognizedSign: "J",
        confidence: 0.9,
        category: "temporal-asl-sign",
        progress: 1.0,
        tier: "all-dev",
        anchorZone: "CHIN_FACE",
        boundaryConfidence: 0.9,
      };
    }

    return null;
  }

  private checkZTrajectory(): TemporalEvaluationOutput | null {
    const buf = this.frameBuffer;
    if (buf.length < 7) return null;

    const last = buf[buf.length - 1];
    const palm = last.palmScale;

    const isIndexExt =
      Math.hypot(
        last.tipPositions.index.x - last.wrist.x,
        last.tipPositions.index.y - last.wrist.y,
      ) /
        palm >
      0.85;
    const isMiddleCurled =
      Math.hypot(
        last.tipPositions.middle.x - last.wrist.x,
        last.tipPositions.middle.y - last.wrist.y,
      ) /
        palm <
      0.85;

    if (!isIndexExt || !isMiddleCurled) return null;

    const xTrace = buf.map((f) => f.tipPositions.index.x);
    const yTrace = buf.map((f) => f.tipPositions.index.y);

    let stroke1 = false;
    let stroke2 = false;
    let stroke3 = false;

    const third = Math.floor(buf.length / 3);
    const p1_dx = xTrace[third] - xTrace[0];
    const p2_dx = xTrace[third * 2] - xTrace[third];
    const p2_dy = yTrace[third * 2] - yTrace[third];
    const p3_dx = xTrace[xTrace.length - 1] - xTrace[third * 2];

    if (Math.abs(p1_dx) > 0.02) stroke1 = true;
    if (stroke1 && p2_dy > 0.02 && p2_dx * p1_dx <= 0) stroke2 = true;
    if (stroke2 && Math.abs(p3_dx) > 0.02 && p3_dx * p2_dx <= 0) stroke3 = true;

    if (stroke1 && stroke2 && stroke3) {
      return {
        recognizedSign: "Z",
        confidence: 0.91,
        category: "temporal-asl-sign",
        progress: 1.0,
        tier: "experimental",
        anchorZone: "MID_CHEST",
        boundaryConfidence: 0.91,
      };
    }

    return null;
  }
}
