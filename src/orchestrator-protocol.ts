/**
 * Orchestrator protocol definition for AgentCard extensions.
 *
 * An orchestrator (like Aria) advertises its capabilities in its AgentCard
 * so agents know what flows they can request.
 */

import { ORCHESTRATOR_PROTOCOL_URN, type FlowType } from "./flow-types.js";

export { ORCHESTRATOR_PROTOCOL_URN } from "./flow-types.js";

/**
 * Protocol an orchestrator advertises in its AgentCard.
 * Agents read this to know what flows the orchestrator supports.
 */
export interface OrchestratorProtocol {
  version: "1.0";
  flows: FlowType[];
}

/**
 * Extension for AgentCard.capabilities.extensions.
 *
 * @example
 * ```typescript
 * const agentCard = {
 *   name: "Aria",
 *   capabilities: {
 *     extensions: {
 *       [ORCHESTRATOR_PROTOCOL_URN]: {
 *         version: "1.0",
 *         flows: ["delegation", "payment", "oauth"],
 *       },
 *     },
 *   },
 * };
 * ```
 */
export interface OrchestratorExtension {
  [ORCHESTRATOR_PROTOCOL_URN]: OrchestratorProtocol;
}
