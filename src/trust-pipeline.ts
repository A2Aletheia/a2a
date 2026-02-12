import type { Agent, AletheiaLogger } from "@a2aletheia/sdk";
import type { AletheiaClient } from "@a2aletheia/sdk";
import type { AletheiaA2AConfig, TrustInfo } from "./types.js";
import { buildTrustInfo } from "./types.js";
import {
  DIDResolutionError,
  AgentNotLiveError,
  TrustScoreBelowThresholdError,
} from "./errors.js";

export interface TrustPipelineConfig {
  verifyIdentity: boolean;
  livenessCheckBeforeSend: boolean;
  minTrustScore: number;
  requireLive: boolean;
}

export function buildPipelineConfig(
  config: AletheiaA2AConfig,
): TrustPipelineConfig {
  return {
    verifyIdentity: config.verifyIdentity ?? true,
    livenessCheckBeforeSend: config.livenessCheckBeforeSend ?? false,
    minTrustScore: config.minTrustScore ?? 0,
    requireLive: config.requireLive ?? true,
  };
}

export async function verifySendPreconditions(
  agent: Agent,
  client: AletheiaClient,
  pipelineConfig: TrustPipelineConfig,
  logger?: AletheiaLogger,
): Promise<TrustInfo> {
  // 1. DID resolution
  if (pipelineConfig.verifyIdentity) {
    logger?.debug("Verifying DID identity", { did: agent.did });
    try {
      await client.resolveDID(agent.did);
      logger?.debug("DID verified", { did: agent.did });
    } catch (err) {
      logger?.warn("DID resolution failed", {
        did: agent.did,
        error: String(err),
      });
      throw new DIDResolutionError(`Failed to resolve DID: ${agent.did}`, {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  // 2. Liveness check
  if (pipelineConfig.livenessCheckBeforeSend) {
    logger?.debug("Checking liveness", { did: agent.did });
    try {
      const isLive = await client.checkLiveness(agent.did);
      if (!isLive) {
        logger?.warn("Agent not live", { did: agent.did });
        throw new AgentNotLiveError(`Agent ${agent.did} is not live`);
      }
      logger?.debug("Liveness confirmed", { did: agent.did });
    } catch (err) {
      if (err instanceof AgentNotLiveError) throw err;
      logger?.warn("Liveness check failed", {
        did: agent.did,
        error: String(err),
      });
      throw new AgentNotLiveError(
        `Liveness check failed for agent ${agent.did}`,
        { cause: err instanceof Error ? err : new Error(String(err)) },
      );
    }
  } else if (pipelineConfig.requireLive && !agent.isLive) {
    logger?.warn("Agent not live (cached)", { did: agent.did });
    throw new AgentNotLiveError(
      `Agent ${agent.did} is not live (cached status)`,
    );
  }

  // 3. Trust score gate
  if (
    pipelineConfig.minTrustScore > 0 &&
    (agent.trustScore === null ||
      agent.trustScore < pipelineConfig.minTrustScore)
  ) {
    logger?.warn("Trust score below threshold", {
      did: agent.did,
      score: agent.trustScore,
      threshold: pipelineConfig.minTrustScore,
    });
    throw new TrustScoreBelowThresholdError(
      agent.trustScore,
      pipelineConfig.minTrustScore,
    );
  }

  logger?.info("Trust pipeline passed", {
    did: agent.did,
    trustScore: agent.trustScore,
    isLive: agent.isLive,
  });

  return buildTrustInfo(agent);
}
