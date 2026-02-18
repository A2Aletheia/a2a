import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  signUserDelegation,
  verifyUserDelegation,
  extractUserDelegation,
} from "../user-delegation.js";
import { USER_DELEGATION_EXTENSION, type UserDelegation } from "../types.js";

// Test helper: generate a delegation valid for 30 minutes
function makeDelegation(
  overrides?: Partial<UserDelegation>,
): UserDelegation {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    userAddress: account.address,
    delegateDid: "did:key:z6MktestAgent",
    scope: "hotel-booking",
    exp: BigInt(Math.floor(Date.now() / 1000) + 1800), // 30 min from now
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

describe("user-delegation", () => {
  // ---------------------------------------------------------------------------
  // signUserDelegation + verifyUserDelegation round-trip
  // ---------------------------------------------------------------------------

  describe("round-trip sign → verify", () => {
    it("verifies a valid delegation", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MkariaAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);
      const result = await verifyUserDelegation(
        envelope,
        "did:key:z6MkariaAgent",
      );

      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.address.toLowerCase()).toBe(
        account.address.toLowerCase(),
      );
      expect(result.delegatedTo).toBe("did:key:z6MkariaAgent");
      expect(result.scope).toBe("hotel-booking");
    });
  });

  // ---------------------------------------------------------------------------
  // Expiration
  // ---------------------------------------------------------------------------

  describe("expiration", () => {
    it("rejects an expired delegation", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MkariaAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) - 60), // Expired 1 min ago
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);
      const result = await verifyUserDelegation(
        envelope,
        "did:key:z6MkariaAgent",
      );

      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Delegate DID mismatch
  // ---------------------------------------------------------------------------

  describe("delegateDid verification", () => {
    it("rejects when expectedAgentDid does not match", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MkariaAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);

      // Verify with wrong agent DID — stolen delegation attack
      const result = await verifyUserDelegation(
        envelope,
        "did:key:z6MkevilAgent",
      );

      expect(result.valid).toBe(false);
      expect(result.expired).toBe(false);
    });

    it("passes when no expectedAgentDid provided (Layer 1 not available)", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MkariaAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);

      // No expected DID — skip delegate check
      const result = await verifyUserDelegation(envelope);
      expect(result.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Tampered delegation
  // ---------------------------------------------------------------------------

  describe("tampered delegation", () => {
    it("rejects when userAddress is modified", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MkariaAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);

      // Tamper: change userAddress to attacker's address
      const attackerKey = generatePrivateKey();
      const attacker = privateKeyToAccount(attackerKey);
      envelope.delegation.userAddress = attacker.address;

      const result = await verifyUserDelegation(
        envelope,
        "did:key:z6MkariaAgent",
      );
      // Recovered address won't match tampered userAddress
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // extractUserDelegation
  // ---------------------------------------------------------------------------

  describe("extractUserDelegation", () => {
    it("extracts a valid envelope from metadata", () => {
      const delegation = makeDelegation();
      const envelope = {
        delegation,
        signature: "0xabcdef",
      };

      const result = extractUserDelegation({
        [USER_DELEGATION_EXTENSION]: envelope,
      });

      expect(result).not.toBeNull();
      expect(result!.delegation.userAddress).toBe(delegation.userAddress);
      expect(result!.delegation.scope).toBe("hotel-booking");
    });

    it("returns null for missing metadata", () => {
      expect(extractUserDelegation(undefined)).toBeNull();
      expect(extractUserDelegation(null)).toBeNull();
      expect(extractUserDelegation({})).toBeNull();
    });

    it("returns null for malformed envelope", () => {
      expect(
        extractUserDelegation({
          [USER_DELEGATION_EXTENSION]: { delegation: null, signature: "0x" },
        }),
      ).toBeNull();
      expect(
        extractUserDelegation({
          [USER_DELEGATION_EXTENSION]: "not-an-object",
        }),
      ).toBeNull();
    });
  });
});
