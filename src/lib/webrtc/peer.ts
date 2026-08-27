/**
 * PeerConnectionManager
 *
 * Track management — two distinct paths:
 *
 * INITIATOR:
 *   addTracks(video, audio)  — addTrack(); browser creates transceivers with MIDs
 *   createOffer()            — SDP reflects those MIDs
 *
 * RESPONDER:
 *   handleOfferWithTracks(offer, video, audio)
 *     1. setRemoteDescription(offer)  — browser creates transceivers whose MIDs
 *        MATCH the offer exactly
 *     2. replaceTrack() on the matched senders to inject local media
 *     3. createAnswer() / setLocalDescription(answer)
 *
 * syncTracks() — post-negotiation track swap via replaceTrack (no renegotiation).
 *   IMPORTANT: this method is async and awaits both replaceTrack calls before
 *   calling emitDiagnostics so the sender counts are always accurate.
 */

import { RTC_CONFIG } from "./config";

export interface PeerStateDiagnostics {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  iceGatheringState: RTCIceGatheringState;
  videoSendersCount: number;
  audioSendersCount: number;
}

export type PeerEventCallbacks = {
  onDiagnosticsChange?: (diag: PeerStateDiagnostics) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
};

export class PeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  public readonly remotePeerId: string;

  // Populated by addTracks() (initiator) or handleOfferWithTracks() (responder).
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;

  // One stable remote MediaStream — mutated in-place as tracks arrive.
  private remoteStream: MediaStream | null = null;

  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private callbacks: PeerEventCallbacks = {};

  constructor(remotePeerId: string = "default", callbacks: PeerEventCallbacks = {}) {
    this.remotePeerId = remotePeerId;
    this.callbacks = callbacks;
    this.initPeerConnection();
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  private initPeerConnection(): void {
    if (typeof window === "undefined" || !("RTCPeerConnection" in window)) {
      this.callbacks.onError?.("RTCPeerConnection is not supported in this environment.");
      return;
    }

    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.remoteStream = new MediaStream();
      this.pendingIceCandidates = [];

      this.pc.ontrack = (event: RTCTrackEvent) => {
        if (!this.remoteStream) return;

        const incoming =
          event.streams && event.streams[0] ? event.streams[0].getTracks() : [event.track];

        for (const t of incoming) {
          if (!this.remoteStream.getTracks().some((e) => e.id === t.id)) {
            this.remoteStream.addTrack(t);
          }
        }

        this.callbacks.onRemoteStream?.(this.remoteStream);
        this.emitDiagnostics();
      };

      this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) this.callbacks.onIceCandidate?.(event.candidate);
      };

      this.pc.onconnectionstatechange = () => this.emitDiagnostics();
      this.pc.oniceconnectionstatechange = () => this.emitDiagnostics();
      this.pc.onsignalingstatechange = () => this.emitDiagnostics();
      this.pc.onicegatheringstatechange = () => this.emitDiagnostics();

      this.emitDiagnostics();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError?.(`RTCPeerConnection init failed: ${msg}`);
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  public emitDiagnostics(): void {
    if (!this.pc) return;
    const senders = this.pc.getSenders();
    this.callbacks.onDiagnosticsChange?.({
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      signalingState: this.pc.signalingState,
      iceGatheringState: this.pc.iceGatheringState,
      videoSendersCount: senders.filter((s) => s.track?.kind === "video").length,
      audioSendersCount: senders.filter((s) => s.track?.kind === "audio").length,
    });
  }

  // ── INITIATOR track management ────────────────────────────────────────────

  /**
   * Called by the INITIATOR before createOffer().
   * Guard: if senders already exist, falls back to syncTracks().
   */
  public addTracks(videoTrack: MediaStreamTrack | null, audioTrack: MediaStreamTrack | null): void {
    if (!this.pc) return;

    if (this.videoSender || this.audioSender) {
      void this.syncTracks(videoTrack, audioTrack);
      return;
    }

    const bundle = new MediaStream();
    if (videoTrack) bundle.addTrack(videoTrack);
    if (audioTrack) bundle.addTrack(audioTrack);

    if (videoTrack) {
      this.videoSender = this.pc.addTrack(videoTrack, bundle);
    } else {
      this.videoSender = this.pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    }

    if (audioTrack) {
      this.audioSender = this.pc.addTrack(audioTrack, bundle);
    } else {
      this.audioSender = this.pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    }

    this.emitDiagnostics();
  }

  // ── RESPONDER track management ────────────────────────────────────────────

  /**
   * RESPONDER only. Correct sequence:
   *   1. setRemoteDescription(offer)  — browser creates transceivers with MIDs
   *      matching the offer exactly.
   *   2. Walk getTransceivers() to find those matched senders and assign them
   *      to this.videoSender / this.audioSender.
   *   3. replaceTrack() with local media on those senders (awaited).
   *   4. createAnswer() / setLocalDescription(answer).
   */
  public async handleOfferWithTracks(
    offer: RTCSessionDescriptionInit,
    videoTrack: MediaStreamTrack | null,
    audioTrack: MediaStreamTrack | null,
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("RTCPeerConnection is not initialized.");

    // Step 1: set remote description — browser creates matched transceivers.
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates();

    // Step 2+3: assign senders from matched transceivers; inject local tracks.
    const transceivers = this.pc.getTransceivers();
    console.log(
      `[PC] handleOfferWithTracks: ${transceivers.length} transceivers after setRemoteDescription`,
    );

    for (const tc of transceivers) {
      const kind = tc.receiver.track.kind;
      console.log(`[PC]   transceiver mid=${tc.mid} kind=${kind} direction=${tc.direction}`);

      if (kind === "video" && !this.videoSender) {
        this.videoSender = tc.sender;
        // Set direction to sendrecv so the responder can SEND video back.
        // After setRemoteDescription the browser sets direction=recvonly
        // (matching the initiator's sendrecv offer from the responder's view).
        // Without explicitly setting sendrecv here, createAnswer() produces a
        // recvonly answer and the responder's sender is never activated —
        // causing the one-way video symptom.
        tc.direction = "sendrecv";
        if (videoTrack) {
          await tc.sender.replaceTrack(videoTrack);
          console.log("[PC]   video sender track replaced with live track");
        } else {
          console.log("[PC]   video sender assigned (null track — will be replaced later)");
        }
      } else if (kind === "audio" && !this.audioSender) {
        this.audioSender = tc.sender;
        // Same fix for audio.
        tc.direction = "sendrecv";
        if (audioTrack) {
          await tc.sender.replaceTrack(audioTrack);
          console.log("[PC]   audio sender track replaced with live track");
        } else {
          console.log("[PC]   audio sender assigned (null track — will be replaced later)");
        }
      }
    }

    console.log(
      `[PC] handleOfferWithTracks done: videoSender=${!!this.videoSender} audioSender=${!!this.audioSender}`,
    );

    // Step 4: create and apply the answer.
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.emitDiagnostics();
    return answer;
  }

  // ── Post-negotiation track sync ───────────────────────────────────────────

  /**
   * Swap tracks after negotiation without renegotiation.
   * ASYNC: awaits both replaceTrack calls before emitDiagnostics so the
   * sender track counts in diagnostics are always up-to-date.
   * Previously this was fire-and-forget, causing vSnd/aSnd to read 0
   * immediately after syncTracks even though the replace was in-flight.
   */
  public async syncTracks(
    videoTrack: MediaStreamTrack | null,
    audioTrack: MediaStreamTrack | null,
  ): Promise<void> {
    if (!this.pc) return;

    const ops: Promise<void>[] = [];

    if (this.videoSender) {
      ops.push(
        this.videoSender.replaceTrack(videoTrack).catch((err) => {
          console.warn("[PC] replaceTrack(video) failed:", err);
        }),
      );
    } else {
      console.warn("[PC] syncTracks: videoSender is null — track not replaced");
    }

    if (this.audioSender) {
      ops.push(
        this.audioSender.replaceTrack(audioTrack).catch((err) => {
          console.warn("[PC] replaceTrack(audio) failed:", err);
        }),
      );
    } else {
      console.warn("[PC] syncTracks: audioSender is null — track not replaced");
    }

    await Promise.all(ops);
    this.emitDiagnostics();
  }

  // ── Initiator offer/answer ────────────────────────────────────────────────

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("RTCPeerConnection is not initialized.");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.emitDiagnostics();
    return offer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error("RTCPeerConnection is not initialized.");
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingIceCandidates();
    this.emitDiagnostics();
  }

  // ── ICE ───────────────────────────────────────────────────────────────────

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) throw new Error("RTCPeerConnection is not initialized.");
    if (!this.pc.remoteDescription?.type) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn("[PC] addIceCandidate failed:", e);
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.pc?.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const cand = this.pendingIceCandidates.shift()!;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn("[PC] flush ICE candidate failed:", e);
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  public close(): void {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.videoSender = null;
    this.audioSender = null;
    this.pendingIceCandidates = [];
    this.remoteStream = null;
  }
}
