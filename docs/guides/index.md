---
layout: default
title: Guides
---

# Guides

Step-by-step tutorials covering every aspect of the `@a2aletheia/a2a` package.

---

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started) | Installation, configuration, and your first trusted message |
| [Trust Pipeline](trust-pipeline) | Understanding trust verification and filtering |
| [Agent Selection](agent-selection) | Built-in and custom agent selection strategies |
| [Context Persistence](context-persistence) | Surviving process restarts with Redis context stores |
| [Sender Identity (Layer 1)](sender-identity) | Ed25519 signatures for agent-to-agent authentication |
| [User Delegation (Layer 2)](user-delegation) | EIP-712 wallet signatures for user authorization |
| [Building Peer Agents](building-peer-agents) | Creating agents that both send and receive messages |
| [Error Handling](error-handling) | Handling errors gracefully in production |

---

## Prerequisites

- **Node.js** 18+ or any modern runtime with ESM support
- **TypeScript** 5.0+ (recommended but not required)
- **npm**, **pnpm**, or **yarn** package manager

## Overview

The `@a2aletheia/a2a` package wraps the A2A protocol with Aletheia's trust layer:

```
@a2aletheia/a2a
├── AletheiaA2A        # Main client for trusted communication
├── PeerAgent          # Full-duplex agent (server + client)
├── TrustedAgent       # Connection handle with trust metadata
├── Agent Selectors    # HighestTrustSelector, RandomSelector, etc.
├── Context Store      # Redis-backed conversation persistence
├── Sender Identity    # Layer 1: Ed25519 agent authentication
└── User Delegation    # Layer 2: EIP-712 user authorization
```

Start with [Getting Started](getting-started) if you're new to the package.
