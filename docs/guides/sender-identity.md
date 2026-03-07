---
layout: default
title: Sender Identity (Layer 1)
nav_order: 5
parent: Guides
has_children: false
nav_category: guides
---

# Sender Identity (Layer 1)

By default, A2A messages are anonymous — the receiving agent has no idea who sent the message. Layer 1 adds Ed25519 cryptographic signatures so the receiver can verify **which agent** is calling.

## Signing Outbound Messages

Provide a `signingIdentity` (DID + Ed25519 private key) and set `signOutboundMessages: true`. Every outbound message will automatically include a signed envelope in the A2A metadata.

```typescript
import { AletheiaA2A } from "@a2aletheia/a2a";

const client = new AletheiaA2A({
  registryUrl: "https://registry.aletheia.dev",
  signOutboundMessages: true,
  signingIdentity: {
    did: "did:key:z6Mk...",              // Your agent's DID
    privateKey: process.env.AGENT_KEY!,   // Ed25519 hex
  },
});

// Messages now carry:
// metadata["urn:aletheia:sender-identity:v1"] = {
//   senderDid, signature, timestamp, messageId
// }
const result = await client.sendByCapability("translate", "Hello");
```

## Verifying Inbound Senders

Enable `verifySenderIdentity` on a `PeerAgent` to automatically verify incoming message signatures. Use `getVerifiedSender(context)` inside the handler.

```typescript
import { PeerAgent, getVerifiedSender } from "@a2aletheia/a2a";

const peer = new PeerAgent({
  name: "Hotel Agent",
  // ... other config ...
  verifySenderIdentity: true,
  // requireSignedMessages: true,  // reject unsigned
  // maxMessageAge: 300_000,       // 5 min replay window
});

peer.handle(async (context, response) => {
  const sender = getVerifiedSender(context);

  if (sender?.signatureValid) {
    console.log(`Verified call from: ${sender.did}`);
  } else if (!sender) {
    console.log("Unsigned message (no sender identity)");
  } else {
    console.log("Signature verification FAILED");
  }

  response.text("Hello from Hotel Agent");
});
```

## VerifiedSender

```typescript
interface VerifiedSender {
  did: string;            // Sender's DID
  signatureValid: boolean; // Ed25519 signature valid
  didResolved: boolean;    // DID document resolved
  signedAt: number;        // Timestamp from signature
}
```

## Security Properties

Layer 1 protects against:

- **Agent impersonation** — wrong key produces an invalid signature
- **Replay attacks** — 5-minute timestamp window
- **Message tampering** — parts digest is signed

---

## API Reference

### computePartsDigest()

Compute a SHA-256 digest of message parts for signing.

```typescript
async function computePartsDigest(parts: unknown[]): Promise<string>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `parts` | `unknown[]` | Message parts to digest |

**Returns:** `Promise<string>` - Hex-encoded SHA-256 digest

---

### createSenderEnvelope()

Sign an outbound message and produce a SenderIdentityEnvelope.

```typescript
async function createSenderEnvelope(
  messageId: string,
  partsDigest: string,
  identity: AgentSigningIdentity
): Promise<SenderIdentityEnvelope>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `messageId` | `string` | Unique message identifier |
| `partsDigest` | `string` | SHA-256 digest of message parts |
| `identity` | `AgentSigningIdentity` | Agent's DID and private key |

**Returns:** `Promise<SenderIdentityEnvelope>`

---

### extractSenderEnvelope()

Extract a SenderIdentityEnvelope from A2A message metadata.

```typescript
function extractSenderEnvelope(
  metadata?: Record<string, unknown> | null
): SenderIdentityEnvelope | null
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `metadata` | `Record<string, unknown> \| null` | Message metadata |

**Returns:** `SenderIdentityEnvelope | null`

---

### verifySenderEnvelope()

Verify a SenderIdentityEnvelope from an inbound message.

```typescript
async function verifySenderEnvelope(
  envelope: SenderIdentityEnvelope,
  partsDigest: string,
  options?: { maxMessageAge?: number }
): Promise<VerifiedSender>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `envelope` | `SenderIdentityEnvelope` | The envelope to verify |
| `partsDigest` | `string` | Expected parts digest |
| `options.maxMessageAge` | `number` | Maximum message age in ms (default: 300000) |

**Returns:** `Promise<VerifiedSender>`

---

### getVerifiedSender()

Retrieve the verified sender identity for a request context.

```typescript
function getVerifiedSender(context: object): VerifiedSender | undefined
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `object` | Agent context from handler |

**Returns:** `VerifiedSender | undefined`

