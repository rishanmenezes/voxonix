import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

/**
 * Compare two conversation events deterministically.
 *
 * Timestamp is the user-visible ordering key. The remaining keys make equal
 * timestamps stable across browsers and avoid relying on arrival order.
 */
export function compareCommunicationEvents(left: CaptionPayload, right: CaptionPayload): number {
  return (
    left.timestamp - right.timestamp ||
    left.utteranceId.localeCompare(right.utteranceId) ||
    left.revision - right.revision ||
    left.captionId.localeCompare(right.captionId)
  );
}

/**
 * Apply one revision to an utterance without allowing a finalized event to be
 * downgraded by a later/interleaved interim result.
 */
export function mergeCommunicationEvent(
  current: CaptionPayload,
  incoming: CaptionPayload,
): CaptionPayload {
  if (incoming.revision < current.revision) return current;
  if (current.isFinal && !incoming.isFinal) return current;

  // A final event wins at the same revision. For two equivalent final
  // revisions, retain the first event so duplicate deliveries are idempotent.
  if (incoming.revision === current.revision) {
    return current.isFinal || !incoming.isFinal ? current : incoming;
  }

  return incoming;
}

/**
 * Insert or revise a bounded conversation timeline.
 *
 * Events are keyed by utteranceId because interim and final results for the
 * same utterance are revisions of one conversation item, not separate
 * messages. The function returns the original array when the incoming event
 * is stale, which keeps React state updates cheap and idempotent.
 */
export function upsertCommunicationEvent(
  events: CaptionPayload[],
  incoming: CaptionPayload,
  maxEvents = 50,
): CaptionPayload[] {
  const existingIndex = events.findIndex((event) => event.utteranceId === incoming.utteranceId);

  if (existingIndex === -1) {
    const next = [...events, incoming].sort(compareCommunicationEvents);
    return next.length > maxEvents ? next.slice(-maxEvents) : next;
  }

  const current = events[existingIndex];
  const merged = mergeCommunicationEvent(current, incoming);
  if (merged === current) return events;

  const next = [...events];
  next[existingIndex] = merged;
  next.sort(compareCommunicationEvents);
  return next;
}

export function finalizedCommunicationEvents(events: readonly CaptionPayload[]): CaptionPayload[] {
  return events.filter((event) => event.isFinal).sort(compareCommunicationEvents);
}
