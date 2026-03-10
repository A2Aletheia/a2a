import { describe, it, expect } from "vitest";
import {
  validateScope,
  validateAmount,
  signUserDelegation,
  verifyUserDelegation,
} from "../user-delegation.js";
import {
  requestDelegation,
  requestOAuth,
  extractFlowRequest,
  FLOW_REQUEST_EXTENSION,
  isOAuthFlow,
} from "../flow-types.js";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { UserDelegation, AmountBasis } from "../types.js";

describe("skill-authorization", () => {
  describe("validateScope", () => {
    it("accepts wildcard scope", () => {
      expect(validateScope("*", "hotel-booking")).toBe(true);
      expect(validateScope("*", "payment")).toBe(true);
      expect(validateScope("*", "any-scope")).toBe(true);
    });

    it("accepts exact match", () => {
      expect(validateScope("hotel-booking", "hotel-booking")).toBe(true);
      expect(validateScope("payment", "payment")).toBe(true);
    });

    it("accepts multiple scopes (space-separated)", () => {
      expect(validateScope("hotel-booking payment", "hotel-booking")).toBe(true);
      expect(validateScope("hotel-booking payment", "payment")).toBe(true);
      expect(validateScope("read write admin", "write")).toBe(true);
    });

    it("rejects missing scope", () => {
      expect(validateScope("hotel-booking", "payment")).toBe(false);
      expect(validateScope("read write", "admin")).toBe(false);
    });
  });

  describe("validateAmount", () => {
    it("accepts amount within limit", () => {
      const result = validateAmount("100.00", "USD", { max: "200.00", currency: "USD" });
      expect(result.valid).toBe(true);
      expect(result.exceedsBy).toBeUndefined();
    });

    it("accepts amount exactly at limit", () => {
      const result = validateAmount("200.00", "USD", { max: "200.00", currency: "USD" });
      expect(result.valid).toBe(true);
    });

    it("rejects amount exceeding limit", () => {
      const result = validateAmount("300.00", "USD", { max: "200.00", currency: "USD" });
      expect(result.valid).toBe(false);
      expect(result.exceedsBy).toBe("100.00");
    });

    it("accepts any amount when no limit", () => {
      const result = validateAmount("1000000.00", "USD");
      expect(result.valid).toBe(true);
    });

    it("rejects currency mismatch", () => {
      const result = validateAmount("100.00", "EUR", { max: "200.00", currency: "USD" });
      expect(result.valid).toBe(false);
    });

    it("handles invalid amounts", () => {
      const result = validateAmount("invalid", "USD", { max: "200.00", currency: "USD" });
      expect(result.valid).toBe(false);
    });
  });

  describe("requestDelegation with amount", () => {
    it("creates delegation flow with amount limit", () => {
      const flow = requestDelegation({
        scope: "payment",
        delegateDid: "did:key:z6MktestAgent",
        reason: "Payment requires authorization",
        amount: { max: "500.00", currency: "USD" },
      });

      expect(flow.type).toBe("urn:a2a:flow:delegation");
      expect(flow.payload.scope).toBe("payment");
      expect(flow.payload.amount).toEqual({ max: "500.00", currency: "USD" });
      expect(flow.message).toBe("Payment requires authorization");
    });

    it("creates delegation flow with basis", () => {
      const basis: AmountBasis = {
        description: "Hotel booking",
        items: [
          { label: "Room rate", quantity: 3, unitPrice: "100.00", amount: "300.00" },
          { label: "Tax", amount: "30.00" },
        ],
        total: "330.00",
      };

      const flow = requestDelegation({
        scope: "hotel-booking",
        delegateDid: "did:key:z6MktestAgent",
        basis,
      });

      expect(flow.payload.basis).toEqual(basis);
      expect(flow.payload.basis).toBe(basis);
    });

    it("extracts flow from metadata", () => {
      const flow = requestDelegation({
        scope: "payment",
        delegateDid: "did:key:z6MktestAgent",
        amount: { max: "100.00", currency: "USD" },
      });

      const metadata = { [FLOW_REQUEST_EXTENSION]: flow };
      const extracted = extractFlowRequest(metadata);

      expect(extracted).not.toBeNull();
      if (!extracted) {
        throw new Error("Expected flow request to be extracted");
      }
      expect(extracted.payload.amount).toEqual({
        max: "100.00",
        currency: "USD",
      });
    });
  });

  describe("oauth flow helpers", () => {
    it("creates oauth flow request with required payload", () => {
      const flow = requestOAuth({
        provider: "notion",
        authUrl: "https://notion.so/oauth/authorize?state=abc",
        grantId: "grant-123",
        reason: "Connect your Notion account",
        metadata: { contextId: "ctx-1", redirectUri: "https://app.example.com/callback" },
      });

      expect(flow.type).toBe("urn:a2a:flow:oauth");
      expect(flow.payload.provider).toBe("notion");
      expect(flow.payload.authUrl).toBe(
        "https://notion.so/oauth/authorize?state=abc",
      );
      expect(flow.payload.grantId).toBe("grant-123");
      expect(flow.payload.contextId).toBe("ctx-1");
      expect(flow.payload.redirectUri).toBe("https://app.example.com/callback");
      expect(flow.message).toBe("Connect your Notion account");
      expect(isOAuthFlow(flow)).toBe(true);
    });

    it("keeps helper arguments authoritative over colliding oauth metadata", () => {
      const flow = requestOAuth({
        provider: "notion",
        authUrl: "https://notion.so/oauth/authorize?state=abc",
        grantId: "grant-123",
        metadata: {
          provider: "github",
          authUrl: "https://github.com/login/oauth/authorize",
          grantId: "grant-overridden",
          contextId: "ctx-1",
        },
      });

      expect(flow.payload.provider).toBe("notion");
      expect(flow.payload.authUrl).toBe(
        "https://notion.so/oauth/authorize?state=abc",
      );
      expect(flow.payload.grantId).toBe("grant-123");
      expect(flow.payload.contextId).toBe("ctx-1");
    });

    it("extracts oauth flow from metadata", () => {
      const flow = requestOAuth({
        provider: "notion",
        authUrl: "https://notion.so/oauth/authorize?state=abc",
        grantId: "grant-123",
      });

      const metadata = { [FLOW_REQUEST_EXTENSION]: flow };
      const extracted = extractFlowRequest(metadata);

      expect(extracted).not.toBeNull();
      expect(extracted?.type).toBe("urn:a2a:flow:oauth");
      expect(extracted && isOAuthFlow(extracted)).toBe(true);
      expect(extracted?.payload.grantId).toBe("grant-123");
    });
  });

  describe("EIP-712 signing with amountLimit", () => {
    it("signs and verifies delegation with amountLimit", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MktestAgent",
        scope: "payment",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
        amountLimit: { max: "500.00", currency: "USD" },
      };

      const envelope = await signUserDelegation(delegation, privateKey);
      const result = await verifyUserDelegation(envelope, "did:key:z6MktestAgent");

      expect(result.valid).toBe(true);
      expect(result.amountLimit).toEqual({ max: "500.00", currency: "USD" });
    });

    it("verifies delegation without amountLimit", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MktestAgent",
        scope: "hotel-booking",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
      };

      const envelope = await signUserDelegation(delegation, privateKey);
      const result = await verifyUserDelegation(envelope, "did:key:z6MktestAgent");

      expect(result.valid).toBe(true);
      expect(result.amountLimit).toBeUndefined();
    });

    it("rejects tampered amountLimit", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      const delegation: UserDelegation = {
        userAddress: account.address,
        delegateDid: "did:key:z6MktestAgent",
        scope: "payment",
        exp: BigInt(Math.floor(Date.now() / 1000) + 1800),
        nonce: crypto.randomUUID(),
        amountLimit: { max: "100.00", currency: "USD" },
      };

      const envelope = await signUserDelegation(delegation, privateKey);

      envelope.delegation.amountLimit = { max: "1000000.00", currency: "USD" };

      const result = await verifyUserDelegation(envelope, "did:key:z6MktestAgent");
      expect(result.valid).toBe(false);
    });
  });
});
