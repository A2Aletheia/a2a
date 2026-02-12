export class AletheiaA2AError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
    options?: { cause?: Error },
  ) {
    super(message, options);
    this.name = "AletheiaA2AError";
    this.code = code;
  }
}

export class AgentNotFoundError extends AletheiaA2AError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, "AGENT_NOT_FOUND", options);
    this.name = "AgentNotFoundError";
  }
}

export class DIDResolutionError extends AletheiaA2AError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, "DID_RESOLUTION_FAILED", options);
    this.name = "DIDResolutionError";
  }
}

export class AgentNotLiveError extends AletheiaA2AError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, "AGENT_NOT_LIVE", options);
    this.name = "AgentNotLiveError";
  }
}

export class TrustScoreBelowThresholdError extends AletheiaA2AError {
  readonly trustScore: number | null;
  readonly threshold: number;

  constructor(
    trustScore: number | null,
    threshold: number,
    options?: { cause?: Error },
  ) {
    super(
      `Agent trust score ${trustScore ?? "unknown"} is below threshold ${threshold}`,
      "TRUST_SCORE_BELOW_THRESHOLD",
      options,
    );
    this.name = "TrustScoreBelowThresholdError";
    this.trustScore = trustScore;
    this.threshold = threshold;
  }
}

export class A2AProtocolError extends AletheiaA2AError {
  readonly rpcCode: number | undefined;

  constructor(
    message: string,
    options?: { cause?: Error; rpcCode?: number },
  ) {
    super(message, "A2A_PROTOCOL_ERROR", options);
    this.name = "A2AProtocolError";
    this.rpcCode = options?.rpcCode;
  }
}
