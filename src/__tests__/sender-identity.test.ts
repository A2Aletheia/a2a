import { describe, it, expect } from "vitest";
import { generateAgentKeyPair } from "@a2aletheia/sdk";
import {
  computePartsDigest,
  createSenderEnvelope,
  extractSenderEnvelope,
  verifySenderEnvelope,
} from "../sender-identity.js";
import { SENDER_IDENTITY_EXTENSION } from "../types.js";

describe("sender-identity", () => {
  // ---------------------------------------------------------------------------
  // computePartsDigest
  // ---------------------------------------------------------------------------

  describe("computePartsDigest", () => {
    it("produces deterministic output for same input", async () => {
      const parts = [{ kind: "text" as const, text: "hello" }];
      const d1 = await computePartsDigest(parts);
      const d2 = await computePartsDigest(parts);
      expect(d1).toBe(d2);
      expect(d1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
    });

    it("produces different output for different input", async () => {
      const d1 = await computePartsDigest([{ kind: "text", text: "hello" }]);
      const d2 = await computePartsDigest([{ kind: "text", text: "world" }]);
      expect(d1).not.toBe(d2);
    });
  });

  // ---------------------------------------------------------------------------
  // createSenderEnvelope
  // ---------------------------------------------------------------------------

  describe("createSenderEnvelope", () => {
    it("produces a valid envelope with correct fields", async () => {
      const keys = await generateAgentKeyPair();
      const envelope = await createSenderEnvelope("msg-123", "digest-abc", {
        did: keys.didKey,
        privateKey: keys.privateKey,
      });

      expect(envelope.senderDid).toBe(keys.didKey);
      expect(envelope.messageId).toBe("msg-123");
      expect(envelope.signature).toMatch(/^[0-9a-f]+$/);
      expect(typeof envelope.timestamp).toBe("number");
      expect(envelope.timestamp).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // extractSenderEnvelope
  // ---------------------------------------------------------------------------

  describe("extractSenderEnvelope", () => {
    it("extracts a valid envelope from metadata", () => {
      const envelope = {
        senderDid: "did:key:z6Mktest",
        signature: "abcdef",
        timestamp: Date.now(),
        messageId: "msg-1",
      };
      const result = extractSenderEnvelope({
        [SENDER_IDENTITY_EXTENSION]: envelope,
      });
      expect(result).toEqual(envelope);
    });

    it("returns null for missing metadata", () => {
      expect(extractSenderEnvelope(undefined)).toBeNull();
      expect(extractSenderEnvelope(null)).toBeNull();
      expect(extractSenderEnvelope({})).toBeNull();
    });

    it("returns null for malformed envelope", () => {
      expect(
        extractSenderEnvelope({
          [SENDER_IDENTITY_EXTENSION]: { senderDid: "did:key:abc" },
        }),
      ).toBeNull();
      expect(
        extractSenderEnvelope({
          [SENDER_IDENTITY_EXTENSION]: "not-an-object",
        }),
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // verifySenderEnvelope (round-trip)
  // ---------------------------------------------------------------------------

  describe("verifySenderEnvelope", () => {
    it("verifies a valid round-trip sign → verify", async () => {
      const keys = await generateAgentKeyPair();
      const parts = [{ kind: "text" as const, text: "Book me a hotel" }];
      const digest = await computePartsDigest(parts);

      const envelope = await createSenderEnvelope("msg-rt-1", digest, {
        did: keys.didKey,
        privateKey: keys.privateKey,
      });

      const result = await verifySenderEnvelope(envelope, digest);
      expect(result.signatureValid).toBe(true);
      expect(result.didResolved).toBe(true);
      expect(result.did).toBe(keys.didKey);
    });

    it("rejects tampered parts digest", async () => {
      const keys = await generateAgentKeyPair();
      const digest = await computePartsDigest([{ kind: "text", text: "original" }]);

      const envelope = await createSenderEnvelope("msg-tamper", digest, {
        did: keys.didKey,
        privateKey: keys.privateKey,
      });

      // Verify with different digest (simulating tampered message)
      const tamperedDigest = await computePartsDigest([
        { kind: "text", text: "tampered" },
      ]);
      const result = await verifySenderEnvelope(envelope, tamperedDigest);
      expect(result.signatureValid).toBe(false);
    });

    it("rejects expired messages", async () => {
      const keys = await generateAgentKeyPair();
      const digest = "test-digest";

      const envelope = await createSenderEnvelope("msg-old", digest, {
        did: keys.didKey,
        privateKey: keys.privateKey,
      });

      // Set timestamp to 10 minutes ago
      envelope.timestamp = Date.now() - 600_000;

      const result = await verifySenderEnvelope(envelope, digest, {
        maxMessageAge: 300_000, // 5 min window
      });
      expect(result.signatureValid).toBe(false);
    });

    it("rejects messages with wrong DID", async () => {
      const keysA = await generateAgentKeyPair();
      const keysB = await generateAgentKeyPair();
      const digest = "test-digest";

      // Sign with key A but claim to be key B
      const envelope = await createSenderEnvelope("msg-impersonate", digest, {
        did: keysA.didKey,
        privateKey: keysA.privateKey,
      });

      // Change the claimed DID to B (the signature was made with A's key)
      envelope.senderDid = keysB.didKey;

      const result = await verifySenderEnvelope(envelope, digest);
      // DID resolves to B's public key, but signature was made with A's key
      expect(result.signatureValid).toBe(false);
      expect(result.didResolved).toBe(true);
    });
  });
});
