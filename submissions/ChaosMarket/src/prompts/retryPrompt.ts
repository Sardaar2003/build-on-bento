/**
 * Prompt Version: v1.0
 * Model: GPT-5.5 / GPT-4
 * Temperature: 0
 * Description: Corrective prompt sent to ChatGPT on a JSON parsing failure.
 */
export const retryPromptMetadata = {
  version: 'v1.0',
  model: 'gpt-5.5',
  timestamp: '2026-07-18T11:43:00Z',
  temperature: 0,
};

/**
 * Generates the retry prompt injecting the malformed response and error details.
 */
export function getRetryPrompt(malformedResponse: string, parseError: string): string {
  return `CRITICAL: Your previous response was malformed and failed JSON schema validation.

Validation Error: ${parseError}

Raw Response Received:
"""
${malformedResponse}
"""

Please re-evaluate and correct the output. Return ONLY the valid raw JSON object matching the required schema. Do NOT include markdown codeblocks or conversational explanations.`;
}
