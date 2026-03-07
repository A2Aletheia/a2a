/**
 * User delegation — EIP-712 signed proof that a user authorized an agent
 * to act on their behalf.
 *
 * Layer 2: User-to-Agent delegation via Ethereum wallet signatures.
 */

import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  USER_DELEGATION_EXTENSION,
  type UserDelegation,
  type UserDelegationEnvelope,
  type VerifiedUser,
} from "./types.js";

// ---------------------------------------------------------------------------
// EIP-712 type definitions (must match frontend + any verifier exactly)
// ---------------------------------------------------------------------------

export const DELEGATION_DOMAIN = {
  name: "Aletheia User Delegation",
  version: "1",
} as const;

export const DELEGATION_TYPES_WITHOUT_AMOUNT = {
  UserDelegation: [
    { name: "userAddress", type: "address" },
    { name: "delegateDid", type: "string" },
    { name: "scope", type: "string" },
    { name: "exp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

export const DELEGATION_TYPES_WITH_AMOUNT = {
  AmountLimit: [
    { name: "max", type: "string" },
    { name: "currency", type: "string" },
  ],
  UserDelegation: [
    { name: "userAddress", type: "address" },
    { name: "delegateDid", type: "string" },
    { name: "scope", type: "string" },
    { name: "exp", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "amountLimit", type: "AmountLimit" },
  ],
} as const;

export const DELEGATION_TYPES = DELEGATION_TYPES_WITHOUT_AMOUNT;

// WeakMap for request-scoped verified user storage
const verifiedUserMap = new WeakMap<object, VerifiedUser>();

// ---------------------------------------------------------------------------
// Signing (server-side / tests — frontend uses wagmi useSignTypedData)
// ---------------------------------------------------------------------------

/**
 * Sign a user delegation using a raw private key.
 *
 * For server-side use and tests only. In production, the user signs
 * via MetaMask/wagmi `useSignTypedData` on the frontend.
 */
export async function signUserDelegation(
  delegation: UserDelegation,
  privateKey: string,
): Promise<UserDelegationEnvelope> {
  const account = privateKeyToAccount(privateKey as Hex);

  const hasAmountLimit = delegation.amountLimit !== undefined;

  const types = hasAmountLimit
    ? DELEGATION_TYPES_WITH_AMOUNT
    : DELEGATION_TYPES_WITHOUT_AMOUNT;

  const message = hasAmountLimit
    ? {
        userAddress: delegation.userAddress as Hex,
        delegateDid: delegation.delegateDid,
        scope: delegation.scope,
        exp: BigInt(delegation.exp),
        nonce: delegation.nonce,
        amountLimit: delegation.amountLimit,
      }
    : {
        userAddress: delegation.userAddress as Hex,
        delegateDid: delegation.delegateDid,
        scope: delegation.scope,
        exp: BigInt(delegation.exp),
        nonce: delegation.nonce,
      };

  const signature = await account.signTypedData({
    domain: DELEGATION_DOMAIN,
    types,
    primaryType: "UserDelegation",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: message as any,
  });

  return { delegation, signature };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a user delegation envelope.
 *
 * Checks:
 * 1. Delegation has not expired
 * 2. `delegateDid` matches the expected agent DID (Layer 1 sender, if available)
 * 3. Recovered signer address matches claimed `userAddress`
 */
export async function verifyUserDelegation(
  envelope: UserDelegationEnvelope,
  expectedAgentDid?: string,
): Promise<VerifiedUser> {
  const { delegation, signature } = envelope;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const expired = nowSec > BigInt(delegation.exp);

  const delegateMatch = expectedAgentDid
    ? delegation.delegateDid === expectedAgentDid
    : true;

  const hasAmountLimit = delegation.amountLimit !== undefined;

  const types = hasAmountLimit
    ? DELEGATION_TYPES_WITH_AMOUNT
    : DELEGATION_TYPES_WITHOUT_AMOUNT;

  const message = hasAmountLimit
    ? {
        userAddress: delegation.userAddress as Hex,
        delegateDid: delegation.delegateDid,
        scope: delegation.scope,
        exp: BigInt(delegation.exp),
        nonce: delegation.nonce,
        amountLimit: delegation.amountLimit,
      }
    : {
        userAddress: delegation.userAddress as Hex,
        delegateDid: delegation.delegateDid,
        scope: delegation.scope,
        exp: BigInt(delegation.exp),
        nonce: delegation.nonce,
      };

  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverTypedDataAddress({
      domain: DELEGATION_DOMAIN,
      types,
      primaryType: "UserDelegation",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: message as any,
      signature: signature as Hex,
    });
  } catch {
    return {
      address: delegation.userAddress,
      delegatedTo: delegation.delegateDid,
      scope: delegation.scope,
      valid: false,
      expired,
      amountLimit: delegation.amountLimit,
    };
  }

  const addressMatch =
    recoveredAddress.toLowerCase() === delegation.userAddress.toLowerCase();

  return {
    address: recoveredAddress,
    delegatedTo: delegation.delegateDid,
    scope: delegation.scope,
    valid: !expired && delegateMatch && addressMatch,
    expired,
    amountLimit: delegation.amountLimit,
  };
}

// ---------------------------------------------------------------------------
// Extraction from message metadata
// ---------------------------------------------------------------------------

/**
 * Extract a UserDelegationEnvelope from A2A message metadata.
 * Returns null if absent or malformed.
 */
export function extractUserDelegation(
  metadata?: Record<string, unknown> | null,
): UserDelegationEnvelope | null {
  if (!metadata) return null;
  const raw = metadata[USER_DELEGATION_EXTENSION];
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as Record<string, unknown>;
  if (
    !envelope.delegation ||
    typeof envelope.delegation !== "object" ||
    typeof envelope.signature !== "string"
  ) {
    return null;
  }

  const delegation = envelope.delegation as Record<string, unknown>;
  if (
    typeof delegation.userAddress !== "string" ||
    typeof delegation.delegateDid !== "string" ||
    typeof delegation.scope !== "string" ||
    typeof delegation.nonce !== "string" ||
    delegation.exp === undefined
  ) {
    return null;
  }

  return {
    delegation: {
      ...delegation,
      exp: BigInt(delegation.exp as string | number | bigint),
    } as UserDelegation,
    signature: envelope.signature as string,
  };
}

// ---------------------------------------------------------------------------
// Request-scoped verified user storage
// ---------------------------------------------------------------------------

/**
 * Store a VerifiedUser result keyed by request context.
 * @internal Used by the PeerAgent handler wrapper.
 */
export function setVerifiedUser(context: object, user: VerifiedUser): void {
  verifiedUserMap.set(context, user);
}

/**
 * Retrieve the verified user delegation for a request context.
 *
 * Returns `undefined` if the message had no delegation or verification is disabled.
 *
 * @example
 * ```typescript
 * peer.handle(async (context, response) => {
 *   const user = getVerifiedUser(context);
 *   if (user?.valid) {
 *     const userData = await db.getUser(user.address);
 *     response.text(`Hello ${userData.name}`);
 *   }
 * });
 * ```
 */
export function getVerifiedUser(context: object): VerifiedUser | undefined {
  return verifiedUserMap.get(context);
}

// ---------------------------------------------------------------------------
// Scope validation (OAuth-style)
// ---------------------------------------------------------------------------

/**
 * Validate OAuth-style scope strings.
 *
 * @param granted - The scope(s) granted by the user (e.g., "*", "hotel-booking", "payment hotel-booking")
 * @param required - The scope required by the skill (e.g., "hotel-booking")
 * @returns true if the granted scope satisfies the required scope
 */
export function validateScope(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;

  const grantedScopes = granted.split(" ").filter(Boolean);
  return grantedScopes.includes(required);
}

// ---------------------------------------------------------------------------
// Amount validation
// ---------------------------------------------------------------------------

/**
 * Validate amount against delegation limit.
 *
 * @param requestedAmount - The amount requested (as string, e.g., "150.00")
 * @param requestedCurrency - The currency (e.g., "USD")
 * @param delegationLimit - The delegation's amount limit (optional)
 * @returns Validation result with exceedsBy if over limit
 */
export function validateAmount(
  requestedAmount: string,
  requestedCurrency: string,
  delegationLimit?: { max: string; currency: string },
): { valid: boolean; exceedsBy?: string } {
  if (!delegationLimit) {
    return { valid: true };
  }

  if (requestedCurrency !== delegationLimit.currency) {
    return { valid: false };
  }

  const requested = parseFloat(requestedAmount);
  const max = parseFloat(delegationLimit.max);

  if (isNaN(requested) || isNaN(max)) {
    return { valid: false };
  }

  if (requested <= max) {
    return { valid: true };
  }

  return {
    valid: false,
    exceedsBy: (requested - max).toFixed(2),
  };
}
