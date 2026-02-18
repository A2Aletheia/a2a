/**
 * Sender identity — signing outbound messages and verifying inbound senders.
 *
 * Layer 1: Agent-to-Agent identity via Ed25519 + DID.
 */

import {
  signAgentMessage,
  verifyAgentMessageWithDID,
  DIDResolver,
  type SignedMessage,
} from "@a2aletheia/sdk";
import {
  SENDER_IDENTITY_EXTENSION,
  type AgentSigningIdentity,
  type SenderIdentityEnvelope,
  type VerifiedSender,
} from "./types.js";

// Shared resolver instance (did:key is instant, did:web fetches once + cached externally)
const didResolver = new DIDResolver();

// WeakMap for request-scoped verified sender storage
const verifiedSenderMap = new WeakMap<object, VerifiedSender>();

// ---------------------------------------------------------------------------
// Outbound signing
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 digest of message parts for signing.
 * Deterministic for identical input (JSON.stringify is stable for same structure).
 */
export async function computePartsDigest(parts: unknown[]): Promise<string> {
  const canonical = JSON.stringify(parts);
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sign an outbound message and produce a SenderIdentityEnvelope.
 *
 * What gets signed: `{ messageId, partsDigest }` — this binds the signature
 * to a specific message's content, preventing impersonation and tampering.
 */
export async function createSenderEnvelope(
  messageId: string,
  partsDigest: string,
  identity: AgentSigningIdentity,
): Promise<SenderIdentityEnvelope> {
  const signed: SignedMessage<{ messageId: string; partsDigest: string }> =
    await signAgentMessage(
      { messageId, partsDigest },
      identity.privateKey,
      identity.did,
    );

  return {
    senderDid: identity.did,
    signature: signed.signature,
    timestamp: signed.timestamp,
    messageId,
  };
}

// ---------------------------------------------------------------------------
// Inbound verification
// ---------------------------------------------------------------------------

/**
 * Extract a SenderIdentityEnvelope from A2A message metadata.
 * Returns null if absent or malformed.
 */
export function extractSenderEnvelope(
  metadata?: Record<string, unknown> | null,
): SenderIdentityEnvelope | null {
  if (!metadata) return null;
  const raw = metadata[SENDER_IDENTITY_EXTENSION];
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as Record<string, unknown>;
  if (
    typeof envelope.senderDid !== "string" ||
    typeof envelope.signature !== "string" ||
    typeof envelope.timestamp !== "number" ||
    typeof envelope.messageId !== "string"
  ) {
    return null;
  }

  return envelope as unknown as SenderIdentityEnvelope;
}

/**
 * Verify a SenderIdentityEnvelope from an inbound message.
 *
 * 1. Checks timestamp freshness (replay protection)
 * 2. Resolves sender DID document
 * 3. Reconstructs the SignedMessage and verifies the Ed25519 signature
 */
export async function verifySenderEnvelope(
  envelope: SenderIdentityEnvelope,
  partsDigest: string,
  options?: { maxMessageAge?: number },
): Promise<VerifiedSender> {
  const maxAge = options?.maxMessageAge ?? 300_000; // 5 minutes

  // 1. Timestamp freshness (allow 30s forward clock skew)
  const age = Date.now() - envelope.timestamp;
  if (age > maxAge || age < -30_000) {
    return {
      did: envelope.senderDid,
      signatureValid: false,
      didResolved: false,
      signedAt: envelope.timestamp,
    };
  }

  // 2. Resolve sender DID document
  let didResolved = false;
  try {
    const didDocument = await didResolver.resolve(envelope.senderDid);
    didResolved = true;

    // 3. Reconstruct SignedMessage and verify
    const signedMessage: SignedMessage<{
      messageId: string;
      partsDigest: string;
    }> = {
      payload: { messageId: envelope.messageId, partsDigest },
      signature: envelope.signature,
      signer: envelope.senderDid,
      timestamp: envelope.timestamp,
    };

    const signatureValid = await verifyAgentMessageWithDID(
      signedMessage,
      didDocument,
    );

    return {
      did: envelope.senderDid,
      signatureValid,
      didResolved,
      signedAt: envelope.timestamp,
    };
  } catch {
    return {
      did: envelope.senderDid,
      signatureValid: false,
      didResolved,
      signedAt: envelope.timestamp,
    };
  }
}

// ---------------------------------------------------------------------------
// Request-scoped verified sender storage
// ---------------------------------------------------------------------------

/**
 * Store a VerifiedSender result keyed by request context.
 * @internal Used by the PeerAgent handler wrapper.
 */
export function setVerifiedSender(
  context: object,
  sender: VerifiedSender,
): void {
  verifiedSenderMap.set(context, sender);
}

/**
 * Retrieve the verified sender identity for a request context.
 *
 * Returns `undefined` if the message was unsigned or verification is disabled.
 *
 * @example
 * ```typescript
 * peer.handle(async (context, response) => {
 *   const sender = getVerifiedSender(context);
 *   if (sender?.signatureValid) {
 *     console.log(`Message from: ${sender.did}`);
 *   }
 * });
 * ```
 */
export function getVerifiedSender(
  context: object,
): VerifiedSender | undefined {
  return verifiedSenderMap.get(context);
}
