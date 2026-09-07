import { describe, it, expect } from "vitest";
import { extractHandFeatures } from "../vision/feature-extractor";
import { LearnedSignClassifier } from "../vision/learned-sign-classifier";
import type { Point3D } from "../vision/types";

function createMockLandmarks(fingerSpread = 0.05): Point3D[] {
  const landmarks: Point3D[] = [];
  // 0: Wrist
  landmarks.push({ x: 0.5, y: 0.8, z: 0 });
  // 1..4: Thumb
  landmarks.push({ x: 0.45, y: 0.75, z: 0 });
  landmarks.push({ x: 0.42, y: 0.7, z: 0 });
  landmarks.push({ x: 0.4, y: 0.65, z: 0 });
  landmarks.push({ x: 0.38, y: 0.6, z: 0 });
  // 5..8: Index
  landmarks.push({ x: 0.48, y: 0.6, z: 0 });
  landmarks.push({ x: 0.48, y: 0.5, z: 0 });
  landmarks.push({ x: 0.48, y: 0.4, z: 0 });
  landmarks.push({ x: 0.48, y: 0.3, z: 0 });
  // 9..12: Middle
  landmarks.push({ x: 0.52, y: 0.6, z: 0 });
  landmarks.push({ x: 0.52, y: 0.48, z: 0 });
  landmarks.push({ x: 0.52, y: 0.38, z: 0 });
  landmarks.push({ x: 0.52, y: 0.28, z: 0 });
  // 13..16: Ring
  landmarks.push({ x: 0.56, y: 0.62, z: 0 });
  landmarks.push({ x: 0.56, y: 0.52, z: 0 });
  landmarks.push({ x: 0.56, y: 0.42, z: 0 });
  landmarks.push({ x: 0.56, y: 0.32, z: 0 });
  // 17..20: Pinky
  landmarks.push({ x: 0.6 + fingerSpread, y: 0.65, z: 0 });
  landmarks.push({ x: 0.6 + fingerSpread, y: 0.56, z: 0 });
  landmarks.push({ x: 0.6 + fingerSpread, y: 0.48, z: 0 });
  landmarks.push({ x: 0.6 + fingerSpread, y: 0.4, z: 0 });

  return landmarks;
}

describe("Sign Classification Invariants", () => {
  it("extracts an 83-dimensional normalized feature vector from 21 landmarks", () => {
    const landmarks = createMockLandmarks();
    const result = extractHandFeatures(landmarks);

    expect(result).not.toBeNull();
    expect(result?.vector).toHaveLength(83);
    expect(result?.palmScale).toBeGreaterThan(0);
    // Verify no NaN or Infinity in vector
    result?.vector.forEach((val) => {
      expect(Number.isFinite(val)).toBe(true);
    });
  });

  it("returns null on missing or incomplete landmark arrays (< 21 points)", () => {
    expect(extractHandFeatures([])).toBeNull();
    expect(extractHandFeatures(createMockLandmarks().slice(0, 10))).toBeNull();
  });

  it("evaluates classification candidate through LearnedSignClassifier", () => {
    const classifier = new LearnedSignClassifier();
    const landmarks = createMockLandmarks();
    const result = classifier.predict(landmarks, 0.55, 0.15);

    expect(result).toBeDefined();
    expect(result.label).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.topMargin).toBeGreaterThanOrEqual(0);
  });
});
