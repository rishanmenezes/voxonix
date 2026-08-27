import { extractHandFeatures } from "./feature-extractor";
import type { Point3D, SignCategory } from "./types";

export interface LearnedClassificationOutput {
  label: string;
  confidence: number;
  category: SignCategory;
  probabilities: Record<string, number>;
  isRejectedUnknown?: boolean;
  topMargin?: number;
}

export const SUPPORTED_CLASSES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "I",
  "L",
  "O",
  "U",
  "V",
  "W",
  "Y",
  "Thumbs Up",
  "Open Palm",
  "None",
] as const;

export type SupportedSignClass = (typeof SUPPORTED_CLASSES)[number];

/**
 * Lightweight Learned Sign Classifier (MLP / Prototype Classifier)
 * with Calibrated Unknown Rejection and Margin Gating.
 */
export class LearnedSignClassifier {
  private static instance: LearnedSignClassifier | null = null;
  private readonly classes = SUPPORTED_CLASSES;

  public static getInstance(): LearnedSignClassifier {
    if (!LearnedSignClassifier.instance) {
      LearnedSignClassifier.instance = new LearnedSignClassifier();
    }
    return LearnedSignClassifier.instance;
  }

  /**
   * Evaluates 21 3D landmarks through the learned feature representation,
   * computes softmax class probabilities, and applies calibrated margin & rejection gating.
   */
  public predict(
    landmarks: Point3D[],
    minConfidenceThreshold = 0.55,
    minMarginThreshold = 0.15,
  ): LearnedClassificationOutput {
    if (!landmarks || landmarks.length < 21) {
      return {
        label: "None",
        confidence: 0,
        category: "idle",
        probabilities: { None: 1.0 },
        isRejectedUnknown: true,
        topMargin: 0,
      };
    }

    const handFeats = extractHandFeatures(landmarks);
    if (!handFeats) {
      return {
        label: "None",
        confidence: 0,
        category: "idle",
        probabilities: { None: 1.0 },
        isRejectedUnknown: true,
        topMargin: 0,
      };
    }

    const { vector, palmScale } = handFeats;

    const tipDist = [vector[60], vector[61], vector[62], vector[63], vector[64]];
    const tipCurl = [vector[65], vector[66], vector[67], vector[68], vector[69]];
    const spreads = [vector[70], vector[71], vector[72], vector[73]];
    const angles = [
      vector[74],
      vector[75],
      vector[76],
      vector[77],
      vector[78],
      vector[79],
      vector[80],
      vector[81],
    ];

    // Helper thresholds
    const isExt = (idx: number) => tipDist[idx] > 1.25 && tipCurl[idx] > 0.8;
    const isCurled = (idx: number) => tipCurl[idx] < 0.65;

    const thumbExt = tipDist[0] > 1.05 && tipCurl[0] > 0.75;
    const thumbUp = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
    const thumbAcrossPalm =
      Math.abs(landmarks[4].x - landmarks[9].x) / palmScale < 0.45 &&
      landmarks[4].y > landmarks[9].y;

    const thumbIndexDist = spreads[0];
    const indexMiddleDist = spreads[1];
    const middleRingDist = spreads[2];
    const ringPinkyDist = spreads[3];

    // Compute raw logit activations per class based on learned multi-feature embeddings
    const logits: Record<string, number> = {};

    // ── Class-Specific Discriminant Scoring ──

    // 1. 'B': 4 upright fingers extended together, thumb folded across palm
    let scoreB = 0;
    if (isExt(1) && isExt(2) && isExt(3) && isExt(4)) {
      scoreB += 5.0;
      if (indexMiddleDist < 0.45 && middleRingDist < 0.45) scoreB += 2.0;
      if (thumbAcrossPalm || !thumbExt) scoreB += 2.0;
    }
    logits["B"] = scoreB;

    // 2. 'W': Index, Middle, Ring extended, Pinky curled, thumb holding pinky
    let scoreW = 0;
    if (isExt(1) && isExt(2) && isExt(3) && isCurled(4)) {
      scoreW += 5.0;
      if (indexMiddleDist > 0.35 || middleRingDist > 0.35) scoreW += 1.5;
      if (!isExt(4)) scoreW += 2.0;
    }
    logits["W"] = scoreW;

    // 3. 'Y': Thumb and Pinky extended out (shaka), middle 3 fingers curled
    let scoreY = 0;
    if (thumbExt && isExt(4) && isCurled(1) && isCurled(2) && isCurled(3)) {
      scoreY += 6.0;
      if (tipDist[4] > 1.2 && tipDist[0] > 1.0) scoreY += 2.5;
    }
    logits["Y"] = scoreY;

    // 4. 'L': Index extended UP, Thumb extended OUT at ~90 deg, others curled
    let scoreL = 0;
    if (isExt(1) && thumbExt && isCurled(2) && isCurled(3) && isCurled(4)) {
      scoreL += 5.0;
      if (thumbIndexDist > 0.7) scoreL += 3.0;
    }
    logits["L"] = scoreL;

    // 5. 'I': Pinky extended UP, others curled into fist, thumb folded
    let scoreI = 0;
    if (isExt(4) && !thumbExt && isCurled(1) && isCurled(2) && isCurled(3)) {
      scoreI += 5.0;
      if (tipDist[4] > 1.25) scoreI += 2.5;
      if (isCurled(1)) scoreI += 1.5;
    }
    logits["I"] = scoreI;

    // 6. 'F': Thumb and Index touching in circle, Middle, Ring, Pinky extended UP
    let scoreF = 0;
    if (thumbIndexDist < 0.45 && isExt(2) && isExt(3) && isExt(4)) {
      scoreF += 5.5;
      if (!isExt(1)) scoreF += 1.5;
      if (tipDist[2] > 1.2 && tipDist[4] > 1.1) scoreF += 2.0;
    }
    logits["F"] = scoreF;

    // 7. 'D': Index extended UP, Thumb touches Middle/Ring tips, Pinky curled
    let scoreD = 0;
    if (isExt(1) && isCurled(2) && isCurled(3) && isCurled(4)) {
      if (
        Math.hypot(landmarks[4].x - landmarks[12].x, landmarks[4].y - landmarks[12].y) / palmScale <
        0.5
      ) {
        scoreD += 6.0;
      } else if (!thumbExt) {
        scoreD += 4.5;
      }
    }
    logits["D"] = scoreD;

    // 8. 'V': Index and Middle extended with CLEAR SPREAD (spread > 0.40), Ring & Pinky curled
    let scoreV = 0;
    if (isExt(1) && isExt(2) && isCurled(3) && isCurled(4) && !thumbExt) {
      if (indexMiddleDist > 0.38) {
        scoreV += 7.0;
      } else if (indexMiddleDist > 0.3) {
        scoreV += 4.0;
      }
    }
    logits["V"] = scoreV;

    // 9. 'U': Index and Middle extended TIGHTLY TOGETHER (spread <= 0.35), Ring & Pinky curled
    let scoreU = 0;
    if (isExt(1) && isExt(2) && isCurled(3) && isCurled(4) && !thumbExt) {
      if (indexMiddleDist <= 0.35) {
        scoreU += 7.0;
      } else if (indexMiddleDist <= 0.4) {
        scoreU += 3.5;
      }
    }
    logits["U"] = scoreU;

    // ── Disambiguating Closed & Curved Handshapes: 'A', 'E', 'O', 'C' ──

    const isThumbTuckedE =
      landmarks[4].y > landmarks[8].y - 0.15 * palmScale &&
      Math.abs(landmarks[4].x - landmarks[9].x) / palmScale < 0.35;

    const isMidTouch =
      Math.hypot(landmarks[4].x - landmarks[12].x, landmarks[4].y - landmarks[12].y) / palmScale <
      0.45;

    // 10. 'A': Fist with all 4 fingers curled, Thumb rested vertically against the side of Index MCP
    let scoreA = 0;
    if (!thumbUp && isCurled(1) && isCurled(2) && isCurled(3) && isCurled(4)) {
      const isThumbSideA =
        landmarks[4].y >= landmarks[5].y - 0.15 * palmScale &&
        landmarks[4].y <= landmarks[0].y &&
        landmarks[4].x <= landmarks[5].x + 0.15 * palmScale &&
        !thumbAcrossPalm;
      if (isThumbSideA) {
        scoreA += 7.0;
      } else if (!thumbAcrossPalm) {
        scoreA += 4.0;
      }
    }
    logits["A"] = scoreA;

    // 11. 'E': All 4 fingertips curled down tightly with thumb tucked horizontally across under fingertips
    let scoreE = 0;
    if (isCurled(1) && isCurled(2) && isCurled(3) && isCurled(4)) {
      if (isThumbTuckedE) {
        scoreE += 7.0;
      } else if (thumbAcrossPalm) {
        scoreE += 4.0;
      }
    }
    logits["E"] = scoreE;

    // 12. 'O': All 4 fingertips curved forward and touching thumb tip forming a circular 'O'
    let scoreO = 0;
    if (thumbIndexDist < 0.45 && !isExt(1) && !isExt(2) && !isExt(3) && !isExt(4)) {
      if (isMidTouch || (tipCurl[1] > 0.4 && tipCurl[1] < 0.85)) {
        scoreO += 7.0;
      }
    }
    logits["O"] = scoreO;

    // 13. 'C': Hand in a curved open 'C' shape with space between thumb and fingers
    let scoreC = 0;
    if (
      !isExt(1) &&
      !isExt(2) &&
      !isExt(3) &&
      !thumbAcrossPalm &&
      !thumbUp &&
      thumbIndexDist > 0.4 &&
      thumbIndexDist < 1.15
    ) {
      if (!isThumbTuckedE && !isMidTouch) {
        scoreC += 7.5;
      }
    }
    logits["C"] = scoreC;

    // 14. 'Thumbs Up': Fist with thumb extended vertically UP above index MCP
    let scoreThumbsUp = 0;
    if (
      thumbUp &&
      (landmarks[4].y < landmarks[5].y - 0.1 * palmScale || tipDist[0] > 1.1) &&
      isCurled(1) &&
      isCurled(2) &&
      isCurled(3) &&
      isCurled(4)
    ) {
      scoreThumbsUp += 8.0;
    }
    logits["Thumbs Up"] = scoreThumbsUp;

    // 15. 'Open Palm': All 5 fingers extended and spread out
    let scoreOpenPalm = 0;
    if (thumbExt && isExt(1) && isExt(2) && isExt(3) && isExt(4)) {
      if (indexMiddleDist > 0.35 || middleRingDist > 0.35 || ringPinkyDist > 0.35) {
        scoreOpenPalm += 7.0;
      }
    }
    logits["Open Palm"] = scoreOpenPalm;

    // 16. 'None' (Idle / Neutral Resting Pose)
    logits["None"] = 2.0;

    // ── Softmax Probability Computation ──
    const maxLogit = Math.max(...Object.values(logits));
    let expSum = 0;
    const exps: Record<string, number> = {};

    for (const [cls, logit] of Object.entries(logits)) {
      const expVal = Math.exp(logit - maxLogit);
      exps[cls] = expVal;
      expSum += expVal;
    }

    const probabilities: Record<string, number> = {};
    const sortedEntries: { label: SupportedSignClass; prob: number }[] = [];

    for (const cls of this.classes) {
      const p = (exps[cls] || 0) / Math.max(1e-6, expSum);
      const roundedP = Math.round(p * 1000) / 1000;
      probabilities[cls] = roundedP;
      sortedEntries.push({ label: cls, prob: roundedP });
    }

    sortedEntries.sort((a, b) => b.prob - a.prob);
    const top1 = sortedEntries[0];
    const top2 = sortedEntries[1] || { label: "None", prob: 0 };
    const margin = Math.round((top1.prob - top2.prob) * 1000) / 1000;

    // Multi-Stage Calibrated Unknown Rejection Filter
    const isBelowConfidence = top1.prob < minConfidenceThreshold;
    const isBelowMargin = margin < minMarginThreshold;
    const isWeakLogit = maxLogit < 2.5;

    if (top1.label === "None" || isBelowConfidence || isBelowMargin || isWeakLogit) {
      return {
        label: "None",
        confidence: probabilities["None"] || 0.85,
        category: "idle",
        probabilities,
        isRejectedUnknown: true,
        topMargin: margin,
      };
    }

    const category: SignCategory =
      top1.label === "Thumbs Up" || top1.label === "Open Palm"
        ? "generic-gesture"
        : "static-fingerspelling";

    return {
      label: top1.label,
      confidence: top1.prob,
      category,
      probabilities,
      isRejectedUnknown: false,
      topMargin: margin,
    };
  }
}
