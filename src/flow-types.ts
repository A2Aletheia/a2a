/**
 * Flow types and utilities for orchestrator-agent communication.
 *
 * A flow is a request from an agent to the orchestrator to execute
 * a user interaction (delegation, payment, confirmation) before
 * continuing the conversation.
 *
 * @example
 * ```typescript
 * import { requestDelegation, getVerifiedUser } from "@a2aletheia/a2a";
 *
 * agent.handle(async (context, response) => {
 *   const user = getVerifiedUser(context);
 *   if (needsAuth && !user?.valid) {
 *     response.flow(requestDelegation({
 *       scope: "payment",
 *       delegateDid: context.agentDid,
 *       reason: "Payment requires authorization",
 *     }));
 *     return;
 *   }
 *   // ... proceed
 * });
 * ```
 */

import type { FlowRequest } from "@a2aletheia/sdk/agent";
import type { AmountBasis, SkillAuthorizationConfig } from "./types.js";

export type { FlowType, FlowRequest } from "@a2aletheia/sdk/agent";

export const ORCHESTRATOR_PROTOCOL_URN = "urn:a2a:orchestrator:v1" as const;
export const FLOW_REQUEST_EXTENSION = "urn:a2a:flow-request:v1" as const;

/**
 * @deprecated Use `SkillAuthorizationConfig` instead.
 * Alias for backwards compatibility.
 */
export type SkillAuthorization = SkillAuthorizationConfig;

export function requestDelegation(params: {
  scope: string;
  delegateDid: string;
  reason?: string;
  amount?: {
    max: string;
    currency: string;
  };
  basis?: AmountBasis;
}): FlowRequest {
  return {
    type: "urn:a2a:flow:delegation",
    payload: {
      scope: params.scope,
      delegateDid: params.delegateDid,
      amount: params.amount,
      basis: params.basis,
    },
    message: params.reason ?? "Authorization required",
  };
}

export function requestPayment(params: {
  amount: string;
  currency: string;
  recipient: string;
  reason?: string;
}): FlowRequest {
  return {
    type: "urn:a2a:flow:payment",
    payload: {
      amount: params.amount,
      currency: params.currency,
      recipient: params.recipient,
    },
    message: params.reason ?? "Payment required",
  };
}

export function requestConfirmation(params: {
  message: string;
  options?: string[];
}): FlowRequest {
  return {
    type: "urn:a2a:flow:confirmation",
    payload: {
      options: params.options,
    },
    message: params.message,
  };
}

export function isFlowRequest(data: unknown): data is FlowRequest {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    obj.type.startsWith("urn:a2a:flow:") &&
    typeof obj.payload === "object" &&
    typeof obj.message === "string"
  );
}

export function extractFlowRequest(
  metadata?: Record<string, unknown> | null,
): FlowRequest | null {
  if (!metadata) return null;
  const raw = metadata[FLOW_REQUEST_EXTENSION];
  if (!isFlowRequest(raw)) return null;
  return raw;
}

export function isDelegationFlow(flow: FlowRequest): boolean {
  return flow.type === "urn:a2a:flow:delegation";
}

export function isPaymentFlow(flow: FlowRequest): boolean {
  return flow.type === "urn:a2a:flow:payment";
}

export function isConfirmationFlow(flow: FlowRequest): boolean {
  return flow.type === "urn:a2a:flow:confirmation";
}
