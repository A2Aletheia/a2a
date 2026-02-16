---
layout: default
title: "@a2aletheia/a2a SDK"
nav_order: 1
---

# @a2aletheia/a2a SDK

**Aletheia trust-layer wrapper for the A2A (Agent-to-Agent) protocol**

Version: `0.2.7`

The `@a2aletheia/a2a` SDK provides a secure, trust-verified interface for agent-to-agent communication. It wraps the standard A2A protocol with Aletheia's trust layer, enabling verified interactions between autonomous agents.

## Key Features

- **Trust Verification** - Cryptographic verification of agent identities and message authenticity
- **Agent Discovery** - Discover and connect with trusted agents across the network
- **Streaming Support** - Real-time streaming responses for long-running tasks
- **Protocol Compliance** - Full A2A protocol specification compliance
- **Type Safety** - Comprehensive TypeScript definitions for all APIs
- **Error Handling** - Structured error handling with trust-specific error types

## Installation

```bash
npm install @a2aletheia/a2a
```

```bash
yarn add @a2aletheia/a2a
```

```bash
pnpm add @a2aletheia/a2a
```

## Quick Start

```typescript
import { A2AClient } from '@a2aletheia/a2a';

const client = new A2AClient({
  agentUrl: 'https://agent.example.com'
});

const response = await client.sendMessage({
  task: 'analyze',
  input: { data: 'sample data' }
});

console.log(response.result);
```

## Documentation Sections

### [Getting Started](/guides/getting-started)
Learn how to set up your first A2A client, configure trust verification, and make your first agent-to-agent calls.

### [API Reference](/api/)
Complete API documentation for all classes, methods, types, and interfaces.

## Resources

- [npm Package](https://www.npmjs.com/package/@a2aletheia/a2a)
- [GitHub Repository](https://github.com/A2Aletheia/a2a)
- [Aletheia Registry Browser](https://aletheia-psi.vercel.app)