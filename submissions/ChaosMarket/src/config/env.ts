import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
  ANAKIN_API_KEY: z.string().default('mock_anakin_key'),
  ANAKIN_BASE_URL: z.string().default('https://api.anakin.sre/v1'),
  BENTO_BUILDER_API_KEY: z.string().default('mock_bento_key'),
  BENTO_PRIVATE_KEY: z.string().default('mock_bento_private_key'),
  BENTO_URL: z.string().default('https://api.bento.fun'),
  PARLAY_TOURNMENT_URL: z.string().optional(),
  TARGET_REPO: z.string().default('facebook/react'),
  POLL_INTERVAL: z.coerce.number().int().positive().default(60000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'success', 'none']).default('debug'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // OpenAI ChatGPT Settings
  OPENAI_API_KEY: z.string().default('mock_openai_key'),
  OPENAI_MODEL: z.string().default('gpt-5.5'),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format());
  process.exit(1);
}

const env = parsedEnv.data;

// Parse command line arguments
const args = process.argv;

// Runtime Mode Parsing
let mode: 'LIVE' | 'HYBRID' | 'SIMULATION' = 'SIMULATION';
const modeIndex = args.indexOf('--mode');
if (modeIndex !== -1 && modeIndex + 1 < args.length) {
  const val = args[modeIndex + 1].toUpperCase();
  if (val === 'LIVE' || val === 'HYBRID' || val === 'SIMULATION') {
    mode = val;
  }
} else {
  // If keys are mock or empty, default to SIMULATION; otherwise LIVE
  if (
    env.ANAKIN_API_KEY === 'mock_anakin_key' ||
    env.BENTO_BUILDER_API_KEY === 'mock_bento_key' ||
    !env.ANAKIN_API_KEY ||
    !env.BENTO_BUILDER_API_KEY
  ) {
    mode = 'SIMULATION';
  } else {
    mode = 'LIVE';
  }
}

// Target Repository Parsing
let targetRepo = env.TARGET_REPO;
const targetIndex = args.indexOf('--target');
if (targetIndex !== -1 && targetIndex + 1 < args.length) {
  targetRepo = args[targetIndex + 1];
}

// Health Check Flag
const isHealthCheck = args.includes('--health');

// Simulation Trigger Type Parsing
let simulationType: 'DEPENDENCY' | 'OUTAGE' | 'EXPLOIT' | 'ALL' = 'ALL';
if (args.includes('--dependency')) {
  simulationType = 'DEPENDENCY';
} else if (args.includes('--outage')) {
  simulationType = 'OUTAGE';
} else if (args.includes('--exploit')) {
  simulationType = 'EXPLOIT';
}

export const config = {
  ...env,
  mode,
  targetRepo,
  isHealthCheck,
  simulationType,
};
