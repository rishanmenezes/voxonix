// ASL manual alphabet descriptors & visual finger cues
export interface SignGlyphInfo {
  letter: string;
  description: string;
  handshapeSummary: string;
  category: "static" | "dynamic";
}

export const ASL_SIGN_DICTIONARY: Record<string, SignGlyphInfo> = {
  A: {
    letter: "A",
    description: "Fist with thumb resting vertically along the side of the index finger.",
    handshapeSummary: "Fist, side thumb",
    category: "static",
  },
  B: {
    letter: "B",
    description: "Four fingers extended upright together, thumb folded flat across palm.",
    handshapeSummary: "Flat hand, tucked thumb",
    category: "static",
  },
  C: {
    letter: "C",
    description: "Hand curved forward in the shape of a 'C' with space between thumb and fingers.",
    handshapeSummary: "Curved C-arc",
    category: "static",
  },
  D: {
    letter: "D",
    description:
      "Index finger pointing upright, thumb and remaining fingers touching to form a loop.",
    handshapeSummary: "Index up, circle base",
    category: "static",
  },
  E: {
    letter: "E",
    description: "Fingertips tightly curled downward, thumb tucked horizontally below fingers.",
    handshapeSummary: "Claw fist, tucked thumb",
    category: "static",
  },
  F: {
    letter: "F",
    description:
      "Index and thumb touching at tips to form a circle, middle, ring, pinky extended upright.",
    handshapeSummary: "OK circle, 3 fingers up",
    category: "static",
  },
  G: {
    letter: "G",
    description: "Index finger and thumb pointing horizontally to the side like a pinch.",
    handshapeSummary: "Horizontal pinch",
    category: "static",
  },
  H: {
    letter: "H",
    description: "Index and middle fingers extended together pointing horizontally to the side.",
    handshapeSummary: "2 fingers horizontal",
    category: "static",
  },
  I: {
    letter: "I",
    description:
      "Pinky extended straight upright, other three fingers curled into fist with thumb.",
    handshapeSummary: "Pinky upright",
    category: "static",
  },
  J: {
    letter: "J",
    description: "Start with pinky upright ('I' shape) and trace a downward hook in the air.",
    handshapeSummary: "Pinky swooping hook",
    category: "dynamic",
  },
  K: {
    letter: "K",
    description:
      "Index finger upright, middle finger forward at 45 degrees, thumb resting between them.",
    handshapeSummary: "V with thumb wedge",
    category: "static",
  },
  L: {
    letter: "L",
    description:
      "Index finger pointing upright, thumb extended outward at 90 degrees forming an 'L'.",
    handshapeSummary: "L-shape angle",
    category: "static",
  },
  M: {
    letter: "M",
    description: "Fist with thumb tucked under the index, middle, and ring fingers.",
    handshapeSummary: "3 fingers over thumb",
    category: "static",
  },
  N: {
    letter: "N",
    description: "Fist with thumb tucked under the index and middle fingers.",
    handshapeSummary: "2 fingers over thumb",
    category: "static",
  },
  O: {
    letter: "O",
    description: "All fingertips curved forward touching the thumb tip to form an 'O' ring.",
    handshapeSummary: "Closed O-circle",
    category: "static",
  },
  P: {
    letter: "P",
    description: "Like 'K' shape but with hand rotated pointing downward.",
    handshapeSummary: "Downward K-point",
    category: "static",
  },
  Q: {
    letter: "Q",
    description: "Like 'G' shape pointing downward toward the ground.",
    handshapeSummary: "Downward pinch",
    category: "static",
  },
  R: {
    letter: "R",
    description: "Index and middle fingers extended upright and crossed over each other.",
    handshapeSummary: "Crossed fingers",
    category: "static",
  },
  S: {
    letter: "S",
    description: "Fist with thumb folded tightly across the front of all fingers.",
    handshapeSummary: "Fist, front thumb",
    category: "static",
  },
  T: {
    letter: "T",
    description: "Fist with thumb tucked between index and middle fingers.",
    handshapeSummary: "Thumb under index",
    category: "static",
  },
  U: {
    letter: "U",
    description: "Index and middle fingers extended upright together, ring and pinky curled.",
    handshapeSummary: "2 fingers together up",
    category: "static",
  },
  V: {
    letter: "V",
    description: "Index and middle fingers extended upright spread apart in a peace sign.",
    handshapeSummary: "V peace sign",
    category: "static",
  },
  W: {
    letter: "W",
    description: "Index, middle, and ring fingers extended upright spread apart forming a 'W'.",
    handshapeSummary: "3 fingers spread up",
    category: "static",
  },
  X: {
    letter: "X",
    description: "Fist with index finger bent into a small hook or claw shape.",
    handshapeSummary: "Index hook claw",
    category: "static",
  },
  Y: {
    letter: "Y",
    description: "Thumb and pinky extended outward (shaka sign), middle three fingers curled.",
    handshapeSummary: "Shaka thumb & pinky",
    category: "static",
  },
  Z: {
    letter: "Z",
    description: "Index finger extended upright, tracing a 'Z' zigzag stroke in the air.",
    handshapeSummary: "Index zigzag trace",
    category: "dynamic",
  },
};
