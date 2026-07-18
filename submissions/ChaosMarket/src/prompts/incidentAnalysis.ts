import { Evidence } from '../core/interfaces.js';

/**
 * Prompt Version: v1.0
 * Model: GPT-5.5 / GPT-4
 * Temperature: 0
 * Description: Ingests repository telemetry metrics and asks ChatGPT to classify SRE incidents.
 */
export const incidentAnalysisMetadata = {
  version: 'v1.0',
  model: 'gpt-5.5',
  timestamp: '2026-07-18T11:42:00Z',
  temperature: 0,
};

/**
 * Generates the user analysis prompt using the collected SRE evidence.
 */
export function getIncidentAnalysisPrompt(evidence: Evidence): string {
  return `Analyze the following repository telemetry metrics and identify if there is an infrastructure fragility incident:
${JSON.stringify(evidence, null, 2)}

Return a raw JSON object matching this schema:
{
  "target_id": "${evidence.targetId}",
  "incident_type": "DEPENDENCY" | "OUTAGE" | "EXPLOIT",
  "severity": "HIGH" | "MEDIUM" | "LOW",
  "developer_sentiment": "FRUSTRATED" | "STALLED" | "ACTIVE",
  "days_stagnant": number,
  "confidence": number (float between 0.0 and 1.0)
}

Rules:
1. Return ONLY the raw JSON object.
2. Do NOT wrap output inside markdown formatting blocks like \`\`\`json.
3. The target_id must be exactly "${evidence.targetId}".
4. Calculate days_stagnant based on when the last comment occurred compared to current dates.
5. Provide a realistic confidence value representing your evaluation reliability.`;
}
