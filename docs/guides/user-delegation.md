---
layout: default
title: User Delegation (Layer 2)
nav_order: 6
parent: Guides
has_children: false
nav_category: guides
---

# User Delegation (Layer 2)

Layer 1 tells you *which agent* is calling. Layer 2 tells you *which user* the agent is acting on behalf of. The user signs an EIP-712 delegation with their wallet (MetaMask), which the receiving agent can verify independently — never trusting the sending agent's word alone.

## Signing a Delegation

On the frontend, use wagmi's `useSignTypedData` with the exported `DELEGATION_DOMAIN` and `DELEGATION_TYPES`. On the server/tests, use `signUserDelegation()`.

### Frontend (wagmi)

```typescript
import { useSignTypedData } from "wagmi";
import {
  DELEGATION_DOMAIN,
  DELEGATION_TYPES,
  type UserDelegation,
} from "@a2aletheia/a2a";

const { signTypedDataAsync } = useSignTypedData();

const delegation: UserDelegation = {
  userAddress: address,                    // Connected wallet
  delegateDid: "did:key:z6Mk...aria",     // Agent's DID
  scope: "hotel-booking",
  exp: BigInt(Math.floor(Date.now() / 1000) + 1800), // 30 min
  nonce: crypto.randomUUID(),
};

const signature = await signTypedDataAsync({
  domain: DELEGATION_DOMAIN,
  types: DELEGATION_TYPES,
  primaryType: "UserDelegation",
  message: { ...delegation, exp: delegation.exp },
});

// Attach to TrustedAgent for outbound messages
trustedAgent.setUserDelegation({ delegation, signature });
```

## Verifying a User Delegation

Enable `verifyUserDelegation` on a `PeerAgent`. Use `getVerifiedUser(context)` inside the handler.

```typescript
import { PeerAgent, getVerifiedSender, getVerifiedUser } from "@a2aletheia/a2a";

const peer = new PeerAgent({
  name: "Hotel Agent",
  // ... other config ...
  verifySenderIdentity: true,    // Layer 1
  verifyUserDelegation: true,    // Layer 2
  // requireUserDelegation: true, // reject without delegation
});

peer.handle(async (context, response) => {
  const sender = getVerifiedSender(context);  // Which agent?
  const user = getVerifiedUser(context);      // Which user?

  if (sender?.signatureValid && user?.valid) {
    // Both layers verified
    const userData = await db.getUser(user.address);
    response.text(`Hello ${userData.name}, booking confirmed.`);
  } else if (user?.expired) {
    response.fail("Delegation expired, please re-authorize");
  } else {
    response.fail("Identity verification failed");
  }
});
```

## VerifiedUser

```typescript
interface VerifiedUser {
  address: string;      // Recovered wallet address
  delegatedTo: string;  // Agent DID this delegation is for
  scope: string;        // What's authorized
  valid: boolean;       // Signature + not expired + delegate matches
  expired: boolean;     // Whether delegation has expired
}
```

## Security Properties

Layer 2 protects against:

- **Agent lying about user** — wallet signature is verified independently
- **Stolen delegation reuse** — bound to a specific agent DID
- **Scope creep** — scoped authorization
- **Expired credentials** — configurable TTL

---

## Constants

### DELEGATION_DOMAIN

EIP-712 domain for typed data signing.

```typescript
const DELEGATION_DOMAIN = {
  name: "Aletheia User Delegation",
  version: "1",
} as const;
```

---

### DELEGATION_TYPES

EIP-712 type definitions for user delegation.

```typescript
const DELEGATION_TYPES = {
  UserDelegation: [
    { name: "userAddress", type: "address" },
    { name: "delegateDid", type: "string" },
    { name: "scope", type: "string" },
    { name: "exp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;
```

---

## API Reference

### signUserDelegation()

Sign a user delegation using a raw private key. For server-side use and tests only.

```typescript
async function signUserDelegation(
  delegation: UserDelegation,
  privateKey: string
): Promise<UserDelegationEnvelope>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `delegation` | `UserDelegation` | Delegation object to sign |
| `privateKey` | `string` | Ethereum private key (hex) |

**Returns:** `Promise<UserDelegationEnvelope>`

---

### verifyUserDelegation()

Verify a user delegation envelope.

```typescript
async function verifyUserDelegation(
  envelope: UserDelegationEnvelope,
  expectedAgentDid?: string
): Promise<VerifiedUser>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `envelope` | `UserDelegationEnvelope` | The envelope to verify |
| `expectedAgentDid` | `string` | Expected delegate DID (from Layer 1 sender) |

**Returns:** `Promise<VerifiedUser>`

---

### extractUserDelegation()

Extract a UserDelegationEnvelope from A2A message metadata.

```typescript
function extractUserDelegation(
  metadata?: Record<string, unknown> | null
): UserDelegationEnvelope | null
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `metadata` | `Record<string, unknown> \| null` | Message metadata |

**Returns:** `UserDelegationEnvelope | null`

---

### getVerifiedUser()

Retrieve the verified user delegation for a request context.

```typescript
function getVerifiedUser(context: object): VerifiedUser | undefined
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `object` | Agent context from handler |

**Returns:** `VerifiedUser | undefined`

