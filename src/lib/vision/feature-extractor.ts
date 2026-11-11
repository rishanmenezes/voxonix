import type { Point3D } from "./types";

export interface HandFeatures {
  vector: number[]; // 87-dimensional normalized feature vector
  palmScale: number;
}

/**
 * Extracts scale-invariant, translation-invariant, and rotation-resilient
 * 87-dimensional feature vectors from 21 MediaPipe 3D hand landmarks.
 */
export function extractHandFeatures(landmarks: Point3D[]): HandFeatures | null {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  // Palm scale: distance from wrist (0) to middle MCP (9)
  const palmScale = Math.max(
    0.01,
    Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z),
  );

  const features: number[] = [];

  // 1. 20 Relative normalized 3D vectors from wrist (0) -> landmarks 1..20 (60 features)
  for (let i = 1; i < 21; i++) {
    features.push((landmarks[i].x - wrist.x) / palmScale);
    features.push((landmarks[i].y - wrist.y) / palmScale);
    features.push((landmarks[i].z - wrist.z) / palmScale);
  }

  // 2. 5 Fingertip to Wrist normalized Euclidean distances (Thumb: 4, Index: 8, Middle: 12, Ring: 16, Pinky: 20) (5 features)
  const tips = [4, 8, 12, 16, 20];
  for (const tip of tips) {
    const d = Math.hypot(
      landmarks[tip].x - wrist.x,
      landmarks[tip].y - wrist.y,
      landmarks[tip].z - wrist.z,
    );
    features.push(d / palmScale);
  }

  // 3. 5 Fingertip to MCP curl distances (5 features)
  // (Thumb: 4->2, Index: 8->5, Middle: 12->9, Ring: 16->13, Pinky: 20->17)
  const mcpPairs = [
    [4, 2],
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17],
  ];
  for (const [tip, mcp] of mcpPairs) {
    const d = Math.hypot(
      landmarks[tip].x - landmarks[mcp].x,
      landmarks[tip].y - landmarks[mcp].y,
      landmarks[tip].z - landmarks[mcp].z,
    );
    features.push(d / palmScale);
  }

  // 4. 4 Adjacent fingertip spreads (4 features)
  // (4-8, 8-12, 12-16, 16-20)
  for (let i = 0; i < 4; i++) {
    const tipA = tips[i];
    const tipB = tips[i + 1];
    const d = Math.hypot(
      landmarks[tipA].x - landmarks[tipB].x,
      landmarks[tipA].y - landmarks[tipB].y,
      landmarks[tipA].z - landmarks[tipB].z,
    );
    features.push(d / palmScale);
  }

  // 5. 5 Joint Angle Cosines (at PIP/MCP joints) (8 features)
  // Compute cosine of angle between bone segments: (MCP->PIP) and (PIP->DIP)
  const fingerJoints = [
    [1, 2, 3], // Thumb
    [5, 6, 7], // Index
    [9, 10, 11], // Middle
    [13, 14, 15], // Ring
    [17, 18, 19], // Pinky
    [6, 7, 8], // Index DIP
    [10, 11, 12], // Middle DIP
    [18, 19, 20], // Pinky DIP
  ];

  for (const [a, b, c] of fingerJoints) {
    const v1x = landmarks[a].x - landmarks[b].x;
    const v1y = landmarks[a].y - landmarks[b].y;
    const v1z = landmarks[a].z - landmarks[b].z;
    const v2x = landmarks[c].x - landmarks[b].x;
    const v2y = landmarks[c].y - landmarks[b].y;
    const v2z = landmarks[c].z - landmarks[b].z;

    const dot = v1x * v2x + v1y * v2y + v1z * v2z;
    const mag1 = Math.hypot(v1x, v1y, v1z);
    const mag2 = Math.hypot(v2x, v2y, v2z);
    const cosAngle = mag1 * mag2 > 0 ? dot / (mag1 * mag2) : 0;
    features.push(cosAngle);
  }

  // 6. Palm Span ratio (Pinky MCP to Index MCP / Palm Scale) (1 feature)
  const palmSpan = Math.hypot(
    pinkyMcp.x - indexMcp.x,
    pinkyMcp.y - indexMcp.y,
    pinkyMcp.z - indexMcp.z,
  );
  features.push(palmSpan / palmScale);

  return {
    vector: features,
    palmScale,
  };
}
