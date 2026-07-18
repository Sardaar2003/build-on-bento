import { RiskEngine } from '../../src/core/riskEngine.js';
import { Evidence, IncidentAnalysis } from '../../src/core/interfaces.js';

describe('RiskEngine Mathematical Calculations', () => {
  let riskEngine: RiskEngine;

  beforeEach(() => {
    riskEngine = new RiskEngine();
  });

  test('Should calculate 0 probability when daysStagnant is 0', () => {
    const evidence: Evidence = {
      targetId: 'test/repo',
      daysSinceIssueCreated: 0,
      daysSinceLastComment: 0,
      issueVelocity: 'NORMAL',
      maintainerResponseTimeMs: 1000,
      commitFrequencyPerWeek: 10,
      openIssueCount: 5,
      securityAdvisories: 'LOW',
      repositoryHealth: 'EXCELLENT',
    };

    const analysis: IncidentAnalysis = {
      targetId: 'test/repo',
      incidentType: 'DEPENDENCY',
      severity: 'HIGH',
      sentiment: 'ACTIVE',
      daysStagnant: 0,
      confidence: 0.9,
    };

    const result = riskEngine.calculate(analysis, evidence);

    expect(result.probability).toBeCloseTo(0, 4);
    expect(result.recommendation).toBe('IGNORE');
    expect(result.action).toBe('NONE');
    expect(result.catastrophic).toBe(false);
  });

  test('Should compute correct SRE probability for known parameters', () => {
    const evidence: Evidence = {
      targetId: 'test/repo',
      daysSinceIssueCreated: 15,
      daysSinceLastComment: 10,
      issueVelocity: 'NORMAL',
      maintainerResponseTimeMs: 50000,
      commitFrequencyPerWeek: 5,
      openIssueCount: 20,
      securityAdvisories: 'LOW', // multiplier = 0.90
      repositoryHealth: 'EXCELLENT', // multiplier = 0.80
    };

    const analysis: IncidentAnalysis = {
      targetId: 'test/repo',
      incidentType: 'DEPENDENCY',
      severity: 'HIGH', // weight = 0.85
      sentiment: 'STALLED', // multiplier = 1.20
      daysStagnant: 10, // lambda = 0.15 => timeFactor = 1 - e^(-1.5) ~= 0.776869
      confidence: 0.85,
    };

    // Calculation:
    // P = 0.85 * 1.20 * (1 - e^-1.5) * 0.80 * 1.00 * 0.90
    //   = 1.02 * 0.7768698 * 0.72
    //   = 0.792407 * 0.72
    //   = 0.570533

    const result = riskEngine.calculate(analysis, evidence);

    expect(result.probability).toBeCloseTo(0.5705, 4);
    expect(result.recommendation).toBe('MONITOR');
    expect(result.action).toBe('POLL');
    expect(result.catastrophic).toBe(false);
  });

  test('Should clamp probability to 1.0 on extreme SRE parameters', () => {
    const evidence: Evidence = {
      targetId: 'test/repo',
      daysSinceIssueCreated: 50,
      daysSinceLastComment: 45,
      issueVelocity: 'HIGH', // multiplier = 1.20
      maintainerResponseTimeMs: 10000000,
      commitFrequencyPerWeek: 0,
      openIssueCount: 150,
      securityAdvisories: 'CRITICAL', // multiplier = 1.30
      repositoryHealth: 'POOR', // multiplier = 1.25
    };

    const analysis: IncidentAnalysis = {
      targetId: 'test/repo',
      incidentType: 'EXPLOIT',
      severity: 'HIGH', // weight = 0.85
      sentiment: 'FRUSTRATED', // multiplier = 1.20
      daysStagnant: 40, // timeFactor ~= 1.0
      confidence: 0.95,
    };

    const result = riskEngine.calculate(analysis, evidence);

    expect(result.probability).toBe(1.0);
    expect(result.recommendation).toBe('SHORT');
    expect(result.action).toBe('EXECUTE');
    expect(result.catastrophic).toBe(true);
  });
});
