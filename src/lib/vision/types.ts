export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type Handedness = "Left" | "Right";

export interface HandObservation {
  handedness: Handedness;
  landmarks: Point3D[]; // 21 3D normalized coordinates (0..1)
  worldLandmarks?: Point3D[]; // 21 3D metric world coordinates (meters)
  score: number; // Detection confidence score (0..1)
}

/**
 * Upper Body Pose Landmark Reference for Signing Space Normalization
 * Key landmarks: 0: Nose, 11: Left Shoulder, 12: Right Shoulder, 13: Left Elbow, 14: Right Elbow
 */
export interface UpperBodyPoseObservation {
  nose?: Point3D;
  chin?: Point3D;
  leftShoulder?: Point3D;
  rightShoulder?: Point3D;
  leftElbow?: Point3D;
  rightElbow?: Point3D;
  shoulderWidth?: number;
  torsoCenter?: Point3D;
  score: number;
}

/**
 * Facial Non-Manual Marker Cues (ASL Grammatical & Affective Signals)
 */
export interface FaceNonManualObservation {
  eyebrowsRaised: boolean; // Yes/No question markers
  eyebrowsFurrowed: boolean; // Wh- question markers
  mouthMorpheme: "neutral" | "open" | "pursed" | "smile" | "cha" | "puff";
  headNod: boolean; // Affirmation (YES congruent)
  headShake: boolean; // Negation (NO congruent)
  headTilt: boolean;
  score: number;
}

/**
 * Bimanual Observation (Simultaneous Two-Hand Coordination)
 */
export interface BimanualObservation {
  dominantHand?: HandObservation;
  nonDominantHand?: HandObservation;
  interWristDistance?: number;
  relativeElevation?: number; // y_dom - y_nondom
  isSymmetricMovement?: boolean;
  leftHandLandmarks?: Point3D[];
  rightHandLandmarks?: Point3D[];
}

/**
 * Extensible Multi-Modal Vision Observation
 */
export interface VisionObservation {
  timestamp: number;
  hands: HandObservation[];
  bimanual?: BimanualObservation;
  pose?: UpperBodyPoseObservation;
  face?: FaceNonManualObservation;
}

export type SignCategory =
  | "static-fingerspelling"
  | "dynamic-trajectory"
  | "temporal-asl-sign"
  | "bimanual-asl-sign"
  | "continuous-sequence"
  | "generic-gesture"
  | "idle";

export type VocabularyTier = "production-safe" | "experimental" | "all-dev";

export interface ContinuousSequenceSegment {
  startMs: number;
  endMs: number;
  signLabel: string;
  confidence: number;
  isBimanual: boolean;
  coArticulationTransitionMs: number;
}

export interface SequenceRecognitionMetrics {
  sequencePhrase: string;
  signsCount: number;
  truePositives: number;
  falsePositives: number;
  missedSigns: number;
  coArticulationRecoveryRate: number;
  duplicateEventDrops: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface ContinuousSequenceBenchmarkResult {
  totalContinuousPhrasesEvaluated: number;
  overallSequenceAccuracy: number;
  coArticulationRecoveryRate: number;
  duplicateEventsSuppressedCount: number;
  falseSequenceEventsPerHour: number;
  perPhraseMetrics: Record<string, SequenceRecognitionMetrics>;
}

export interface SignClassificationResult {
  label: string;
  confidence: number;
  category: SignCategory;
  hand: Handedness;
  isDebounced: boolean; // True once held steadily past stabilityThresholdMs or trajectory completes
  stableDurationMs: number;
  trajectoryProgress?: number; // 0.0 - 1.0 for dynamic signs
  isRejectedUnknown?: boolean;
  rejectionReason?: string;
  tier?: VocabularyTier;
  continuousSequence?: ContinuousSequenceSegment[];
}

export interface SignRecognitionConfig {
  enabled: boolean;
  mode: "fingerspelling" | "temporal-asl" | "all";
  vocabularyTier: VocabularyTier; // "production-safe" (NO, THANK YOU) | "experimental" (+ HELLO, YES, Z, PLAY, HELP) | "all-dev" (+ J, static)
  stabilityThresholdMs: number; // Duration handshape must remain steady (default: 350ms)
  minConfidence: number; // Minimum confidence to accept classification (default: 0.60)
  minMargin: number; // Minimum margin between top-1 and top-2 probabilities (default: 0.20)
  autoSpaceTimeoutMs: number; // Inactivity delay before committing accumulated word (default: 1800ms)
  repeatHoldIntervalMs: number; // Duration to hold for double letter (e.g. LL in HELLO) (default: 1100ms)
  showHUD: boolean; // Overlay visual tracking skeleton on self camera tile
  enableBimanual?: boolean; // Enable 2-hand detection & tracking
  enablePoseContext?: boolean; // Enable pose spatial normalization
  enableFaceContext?: boolean; // Enable facial non-manual marker gating
  enableContinuousSequences?: boolean; // Enable fluid multi-sign sequence segmentation
}

export interface SignTelemetry {
  isLoaded: boolean;
  detectorBackend: string;
  executionMode: "LIVE_STREAM" | "VIDEO";
  fps: number;
  inferenceLatencyMs: number;
  droppedFramesCount: number;
  activeHandCount: number;
  currentDetectedLabel: string;
  currentConfidence: number;
  currentCategory: SignCategory;
  stableHeldMs: number;
  bufferedWord: string;
  totalSignsEmitted: number;
  lastEmittedText?: string;
  dynamicTrackingLabel?: string;
  dynamicProgress?: number;
  rejectionReason?: string;
  activeTier?: VocabularyTier;
  bimanualActive?: boolean;
  continuousSequenceActive?: boolean;
  recentSegmentedSigns?: string[];
}

export interface KinematicPoint {
  x: number;
  y: number;
  z?: number;
  timestamp: number;
}

export interface LetterMetrics {
  letter: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalSamples: number;
}

export interface TrajectoryBenchmarkResult {
  totalTrajectorySamples: number;
  jMetrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1: number;
  };
  zMetrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1: number;
  };
  negativeRejectionRate: number;
}

export interface TemporalSignMetric {
  sign: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalSamples: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  tier: "production-safe" | "experimental" | "dev-only";
  isBimanual?: boolean;
}

export interface ThresholdCalibrationPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  rejectionRate: number;
}

export interface AdversarialStressMetrics {
  fastSpeedRecall: number; // ~250ms executions
  normalSpeedRecall: number; // ~500ms executions
  slowSpeedRecall: number; // ~850ms executions
  noisyLightingRecall: number; // High sensor noise / low light
  occlusionRecall: number; // Boundary clipping / partial finger overlap
  repeatedSignSuccessRate: number; // Back-to-back sign repetitions
  hardNegativeRejectionRate: number; // Rejection of casual waving, chin scratch, etc.
}

export interface AblationStudyResult {
  handOnly: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    hardNegativeRejection: number;
    falseEventsPerMin: number;
  };
  handPlusPose: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    hardNegativeRejection: number;
    falseEventsPerMin: number;
  };
  handPlusPosePlusFace: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    hardNegativeRejection: number;
    falseEventsPerMin: number;
  };
}

export interface LongCallBenchmarkResult {
  simulatedDurationMinutes: number;
  totalFramesEvaluated: number;
  falseEventsPerHourIdle: number; // False sign triggers per hour while resting
  falseEventsPerHourConversation: number; // False triggers per hour while speaking naturally
  productionCandidateFprPerHour: number; // False triggers in production-safe mode per hour
  totalAccidentalTriggers: number;
  distinctFalseEventsCount: number;
}

export interface FalseEventRateMetrics {
  falseEventsPerMinuteIdle: number;
  falseEventsPerMinuteConversation: number;
  falseEventsPerHourIdle: number;
  falseEventsPerHourConversation: number;
  distinctFalseEventsCount: number;
  multiTriggeredSequencesCount: number;
  collisionsByNegativeType: Record<string, string[]>;
}

export interface RealUserPilotResult {
  totalParticipants: number;
  totalSessions: number;
  totalCallMinutes: number;
  noMetrics: {
    truePositives: number;
    falsePositives: number;
    missedSigns: number;
    precision: number;
    recall: number;
    f1Score: number;
    totalAttempts: number;
  };
  thankYouMetrics: {
    truePositives: number;
    falsePositives: number;
    missedSigns: number;
    precision: number;
    recall: number;
    f1Score: number;
    totalAttempts: number;
  };
  falseEventsPerHourProduction: number;
  falseEventsPerHourExperimental: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  mobileSuccessRate: number;
  pilotFailures: { issue: string; cause: string; impact: string }[];
}

export type SpatialAnchorZone =
  | "TEMPLE_UPPER"
  | "CHIN_FACE"
  | "MID_CHEST"
  | "LOWER_REST"
  | "BIMANUAL_SPACE";

export interface FingerExtensionVector {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  compositeOpenness: number;
}

export type SequenceState =
  | "IDLE"
  | "TRANSIT_COARTICULATION"
  | "ANCHOR_RESET"
  | "INTRA_ZONE_RESET"
  | "STROKE_ONSET"
  | "STROKE_ACTIVE"
  | "COMMIT_HOLD";

export interface BoundaryDetectionMetrics {
  totalTransitionsExpected: number;
  boundaryTruePositives: number;
  boundaryFalsePositives: number; // Over-segmentation / false splits
  boundaryFalseNegatives: number; // Under-segmentation / missed transit cuts
  boundaryPrecision: number;
  boundaryRecall: number;
  boundaryF1: number;
  isolatedSignClassificationAccuracy: number; // Accuracy of sign classification given correct boundary
  intraZoneTransitionsExpected?: number;
  intraZoneTruePositives?: number;
  intraZoneFalsePositives?: number;
  intraZoneFalseNegatives?: number;
  intraZoneF1?: number;
}

export interface DetailedSequenceErrorMetrics {
  totalSequencesEvaluated: number;
  totalSignsExpected: number;
  totalSignsEmitted: number;
  exactMatches: number;
  sequenceExactMatchRate: number; // % (predicted === expected exactly)
  insertions: number; // I: extra unprompted signs inserted
  deletions: number; // D: expected signs completely omitted
  substitutions: number; // S: expected sign replaced with wrong sign
  orderingErrors: number; // O: signs emitted out of order
  boundaryErrors: number; // B: premature boundary splits or co-articulation leaks
  duplicateEventDrops: number; // suppressed immediate re-triggers
  signErrorRate: number; // (I + D + S + O + B) / totalSignsExpected * 100
  boundaryErrorRate: number; // (B / totalSequences) * 100
  duplicateEventRate: number; // (duplicateEventDrops / totalSignsEmitted) * 100
}

export interface SequenceRecognitionMetrics {
  sequencePhrase: string;
  signsCount: number;
  expectedSequence: string[];
  totalSamples: number;
  exactMatches: number;
  exactMatchRate: number;
  insertions: number;
  deletions: number;
  substitutions: number;
  orderingErrors: number;
  boundaryErrors: number;
  duplicateEventDrops: number;
  truePositives: number;
  falsePositives: number;
  missedSigns: number;
  coArticulationRecoveryRate: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface ContinuousSequenceBenchmarkResult {
  totalContinuousPhrasesEvaluated: number;
  overallSequenceAccuracy: number;
  sequenceExactMatchRate: number;
  overallSignErrorRate: number;
  boundaryErrorRate: number;
  duplicateEventsSuppressedCount: number;
  falseSequenceEventsPerHour: number;
  twoSignSequenceExactMatchRate: number;
  threeSignSequenceExactMatchRate: number;
  fourSignSequenceExactMatchRate: number;
  helloRootedSequenceExactMatchRate: number;
  bimanualToUnimanualExactMatchRate: number;
  intraZoneSequenceExactMatchRate?: number;
  boundaryMetrics: BoundaryDetectionMetrics;
  summaryErrorMetrics: DetailedSequenceErrorMetrics;
  perPhraseMetrics: Record<string, SequenceRecognitionMetrics>;
}

export interface TemporalBenchmarkResult {
  totalSequenceSamples: number;
  signMetrics: Record<string, TemporalSignMetric>;
  negativeRejectionRate: number;
  unknownRejectionRate: number;
  adversarialMetrics?: AdversarialStressMetrics;
  calibrationCurve?: ThresholdCalibrationPoint[];
  trainSplitMetrics?: { accuracy: number; samples: number };
  heldOutSplitMetrics?: { accuracy: number; samples: number };
  ablationStudy?: AblationStudyResult;
  falseEventRates?: FalseEventRateMetrics;
  longCallEvaluation?: LongCallBenchmarkResult;
  realUserPilot?: RealUserPilotResult;
  continuousSequenceBenchmark?: ContinuousSequenceBenchmarkResult;
}

export interface BenchmarkEvaluationResult {
  totalSamples: number;
  signersCount: number;
  overallAccuracy: number;
  seenSignersAccuracy?: number;
  heldOutSignersAccuracy?: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  letterMetrics: Record<string, LetterMetrics>;
  confusionMatrix: Record<string, Record<string, number>>;
  signerAccuracies: Record<string, number>;
  trajectoryBenchmark?: TrajectoryBenchmarkResult;
  temporalBenchmark?: TemporalBenchmarkResult;
  rejectionMetrics?: {
    totalUnknownEvaluated: number;
    unknownCorrectlyRejected: number;
    unknownRejectionRate: number;
    marginGatingRejectionRate: number;
  };
  comparisonWithOldRuleClassifier?: {
    oldRuleAccuracy: number;
    newLearnedAccuracy: number;
    accuracyDelta: number;
  };
  evaluatedAt: string;
}

export interface SignRecognizerProvider {
  id: string;
  name: string;
  isSupported(): boolean;
  initialize(onObservationCallback?: (obs: VisionObservation) => void): Promise<void>;
  processFrame(
    videoElement: HTMLVideoElement,
    timestamp: number,
  ): Promise<VisionObservation | null>;
  close(): void;
}
