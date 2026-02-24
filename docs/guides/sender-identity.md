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
