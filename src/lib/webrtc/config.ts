/**
 * WebRTC and Signaling Configuration for Voxonix
 */

/**
 * Maximum number of participants allowed in a single VOXONIX call room.
 */
/**
 * VOXONIX is deliberately a one-to-one communication service. Keeping this
 * invariant at the protocol boundary prevents an otherwise invisible third
 * participant from joining a room the UI cannot represent safely.
 */
export const MAX_PARTICIPANTS = 2;

/**
 * STUN / ICE server configuration.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};
