import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDiscoverAgents,
  mockGetAgent,
  mockResolveDID,
  mockGetAgentCard,
} = vi.hoisted(() => ({
  mockDiscoverAgents: vi.fn(),
  mockGetAgent: vi.fn(),
  mockResolveDID: vi.fn(),
  mockGetAgentCard: vi.fn(),
}));

vi.mock("@a2aletheia/sdk", () => ({
  AletheiaClient: class {
    setAuthToken() {}

    discoverAgents = mockDiscoverAgents;

    getAgent = mockGetAgent;

    resolveDID = mockResolveDID;
  },
  ConsoleLogger: class {
    debug() {}
    info() {}
    warn() {}
  },
  resolveApiUrl: (url?: string) => url ?? "https://registry.example.com",
}));

vi.mock("@a2a-js/sdk", () => ({
  AGENT_CARD_PATH: ".well-known/agent-card.json",
}));

vi.mock("@a2a-js/sdk/client", () => {
  class MockClientFactory {
    createFromAgentCard() {
      return {
        getAgentCard: mockGetAgentCard,
      };
    }
  }

  return {
    ClientFactory: MockClientFactory,
    ClientFactoryOptions: {
      default: {},
      createFrom: () => ({}),
    },
    JsonRpcTransportFactory: vi.fn(function JsonRpcTransportFactory() {}),
    RestTransportFactory: vi.fn(function RestTransportFactory() {}),
    createAuthenticatingFetchWithRetry: vi.fn(),
  };
});

const { AletheiaA2A } = await import("../aletheia-a2a.js");

describe("AletheiaA2A.connectByUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDID.mockResolvedValue({
      id: "did:web:agent.example.com",
    });
    mockGetAgent.mockResolvedValue({
      did: "did:web:agent.example.com",
      name: "Agent",
      url: "https://agent.example.com",
      isLive: true,
      trustScore: 90,
      isBattleTested: false,
    });
    mockGetAgentCard.mockResolvedValue({
      name: "Agent",
      capabilities: {},
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "Agent",
        capabilities: {},
      }),
    }));
  });

  it("resolves URLs through the registry and preserves scoped cache isolation", async () => {
    mockDiscoverAgents
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValue({
        items: [
          {
            did: "did:web:agent.example.com",
            name: "Agent",
            url: "https://agent.example.com",
            isLive: true,
            trustScore: 90,
            isBattleTested: false,
          },
        ],
        total: 1,
      });

    const client = new AletheiaA2A({
      registryUrl: "https://registry.example.com",
      requireLive: false,
      verifyIdentity: true,
    });

    const first = await client.connectByUrl("https://agent.example.com/", {
      scope: "chat-a",
    });
    const second = await client.connectByUrl("https://agent.example.com", {
      scope: "chat-a",
    });
    const third = await client.connectByUrl("https://agent.example.com", {
      scope: "chat-b",
    });

    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(mockDiscoverAgents).toHaveBeenCalledWith({
      url: "https://agent.example.com/",
      isLive: undefined,
      limit: 10,
    });
    expect(mockDiscoverAgents).toHaveBeenCalledWith({
      url: "https://agent.example.com",
      isLive: undefined,
      limit: 10,
    });
    expect(mockResolveDID).toHaveBeenCalledWith("did:web:agent.example.com");
  });
});
