import { jest } from '@jest/globals';
import { config } from '../../src/config/env.js';
import { ChatGptProvider } from '../../src/infrastructure/chatGptProvider.js';
import { Evidence } from '../../src/core/interfaces.js';

// Setup Mock OpenAI SDK
const mockCreate = jest.fn();
jest.unstable_mockModule('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    }),
  };
});

describe('ChatGptProvider OpenAI SDK Integration & Validation', () => {
  let provider: ChatGptProvider;
  let originalMode: 'LIVE' | 'HYBRID' | 'SIMULATION';
  let originalApiKey: string;

  const mockEvidence: Evidence = {
    targetId: 'facebook/react',
    daysSinceIssueCreated: 2,
    daysSinceLastComment: 1,
    issueVelocity: 'NORMAL',
    maintainerResponseTimeMs: 1800000,
    commitFrequencyPerWeek: 35,
    openIssueCount: 12,
    securityAdvisories: 'LOW',
    repositoryHealth: 'EXCELLENT',
  };

  beforeAll(() => {
    originalMode = config.mode;
    originalApiKey = config.OPENAI_API_KEY;
    // Set config values to activate OpenAI SDK instantiation
    config.mode = 'LIVE';
    config.OPENAI_API_KEY = 'sk-valid-openai-key-for-test';
  });

  afterAll(() => {
    config.mode = originalMode;
    config.OPENAI_API_KEY = originalApiKey;
  });

  beforeEach(async () => {
    mockCreate.mockReset();
    // Dynamically import ChatGptProvider to pick up mocked openai module
    const module = await import('../../src/infrastructure/chatGptProvider.js');
    provider = new module.ChatGptProvider();
  });

  test('Should analyze and map successful ChatGPT structured JSON response', async () => {
    const mockResponseContent = JSON.stringify({
      target_id: 'facebook/react',
      incident_type: 'DEPENDENCY',
      severity: 'LOW',
      developer_sentiment: 'ACTIVE',
      days_stagnant: 0,
      confidence: 0.99,
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: mockResponseContent } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });

    const result = await provider.analyze(mockEvidence);

    expect(result.incidentType).toBe('DEPENDENCY');
    expect(result.sentiment).toBe('ACTIVE');
    expect(result.daysStagnant).toBe(0);
    expect(result.confidence).toBe(0.99);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('Should retry once with corrective prompt on malformed JSON, then succeed', async () => {
    // First call returns malformed JSON
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'This is not JSON!' } }],
      usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
    });

    // Second call (correction retry) returns valid SRE analysis JSON
    const mockCorrectionContent = JSON.stringify({
      target_id: 'facebook/react',
      incident_type: 'DEPENDENCY',
      severity: 'HIGH',
      developer_sentiment: 'FRUSTRATED',
      days_stagnant: 18,
      confidence: 0.91,
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: mockCorrectionContent } }],
      usage: { prompt_tokens: 200, completion_tokens: 60, total_tokens: 260 },
    });

    const result = await provider.analyze(mockEvidence);

    expect(result.sentiment).toBe('FRUSTRATED');
    expect(result.daysStagnant).toBe(18);
    expect(result.confidence).toBe(0.91);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Assert corrective retry was called with the malformed error details
    expect(mockCreate.mock.calls[1][0].messages[1].content).toContain('validation');
  });

  test('Should fall back to local heuristic SRE parser when OpenAI request crashes', async () => {
    // Both attempts throw network exceptions
    mockCreate.mockRejectedValue(new Error('OpenAI Connection Timeout'));

    // 1st run: fails, failureCount = 1
    await expect(provider.analyze(mockEvidence)).rejects.toThrow('OpenAI Connection Timeout');

    // 2nd run: fails, failureCount = 2
    await expect(provider.analyze(mockEvidence)).rejects.toThrow('OpenAI Connection Timeout');

    // 3rd run: failureCount = 3, trips to OPEN, returns heuristic fallback
    const result = await provider.analyze(mockEvidence);

    expect(result.incidentType).toBe('DEPENDENCY');
    expect(result.sentiment).toBe('ACTIVE');
    expect(result.daysStagnant).toBe(0); // Healthy fallback
    expect(mockCreate).toHaveBeenCalledTimes(12); // 4 attempts on run 1, 4 attempts on run 2, 4 attempts on run 3 (trips on catch block)
  }, 25000);
});
