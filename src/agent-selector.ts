import type { Agent } from "@a2aletheia/sdk";
import type { AgentSelector } from "./types.js";
import { AgentNotFoundError } from "./errors.js";

function ensureNonEmpty<T>(agents: T[]): asserts agents is [T, ...T[]] {
  if (agents.length === 0) {
    throw new AgentNotFoundError("No agents match the given criteria");
  }
}

export class HighestTrustSelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    ensureNonEmpty(agents);
    return agents.reduce((best, current) => {
      const bestScore = best.trustScore ?? -1;
      const currentScore = current.trustScore ?? -1;
      if (currentScore > bestScore) return current;
      if (currentScore === bestScore) {
        const bestLiveness = best.lastLivenessCheck?.getTime() ?? 0;
        const currentLiveness = current.lastLivenessCheck?.getTime() ?? 0;
        if (currentLiveness > bestLiveness) return current;
      }
      return best;
    });
  }
}

export class RandomSelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    ensureNonEmpty(agents);
    const selected = agents[Math.floor(Math.random() * agents.length)];
    if (!selected) {
      throw new AgentNotFoundError("No agents match the given criteria");
    }
    return selected;
  }
}

export class FirstMatchSelector implements AgentSelector {
  select(agents: Agent[]): Agent {
    ensureNonEmpty(agents);
    return agents[0];
  }
}
