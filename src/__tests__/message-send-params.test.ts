import { describe, expect, it } from "vitest";

import { buildMessageSendParams, USER_DELEGATION_EXTENSION } from "../types.js";

describe("buildMessageSendParams metadata", () => {
  it("includes caller-provided metadata in the outbound message", async () => {
    const params = await buildMessageSendParams("hello", {
      metadata: {
        walletAddress: "0x1234567890abcdef1234567890ABCDEF12345678",
      },
    });

    expect(params.message.metadata).toMatchObject({
      walletAddress: "0x1234567890abcdef1234567890ABCDEF12345678",
    });
  });

  it("keeps delegation extension metadata authoritative", async () => {
    const params = await buildMessageSendParams("hello", {
      metadata: {
        [USER_DELEGATION_EXTENSION]: "tampered",
      },
      userDelegation: {
        delegation: {
          userAddress: "0x1111111111111111111111111111111111111111",
          delegateDid: "did:key:z6MkDelegate",
          scope: "oauth:complete:notion:grant-1",
          exp: BigInt(9_999_999_999),
          nonce: "nonce-1",
        },
        signature: "0xsignature",
      },
    });

    const metadata = params.message.metadata as Record<string, unknown>;
    expect(typeof metadata[USER_DELEGATION_EXTENSION]).toBe("object");
    expect(
      (
        metadata[USER_DELEGATION_EXTENSION] as {
          signature?: unknown;
        }
      ).signature,
    ).toBe("0xsignature");
  });
});
