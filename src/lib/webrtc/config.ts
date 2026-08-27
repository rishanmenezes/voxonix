/**
 * WebRTC and Signaling Configuration for Voxonix
 */

/**
 * Maximum number of participants allowed in a single call room (Mesh architecture).
 * Configurable demo limit.
 */
export const MAX_PARTICIPANTS = 6;

/**
 * STUN / ICE server configuration.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};
