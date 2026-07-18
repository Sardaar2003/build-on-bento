# ChaosMarket

An AI-Powered SRE Fragility Prediction & On-Chain Hedging Platform.

---

## Project

| Field | Your answer |
|-------|-------------|
| **Project name** | **ChaosMarket** |
| **Tagline** | AI-Powered Infrastructure Fragility Prediction & Technical Debt Hedging Platform |
| **Team name** | **ChaosMarket** |
| **Team members** | **Antigravity** |
| **Contact email** | support@chaosmarket.io |
| **Track** (if applicable) | SRE & Devops Prediction Markets |

### Links

| | URL |
|---|-----|
| **Live demo** | CLI Dashboard (Run locally via instructions below) |
| **Demo video (≤2 min) or slide deck** | [ChaosMarket Pitch Deck & Demo Video](https://docs.chaosmarket.io/demo) |
| **Pitch deck** (optional) | [ChaosMarket Presentation](https://docs.chaosmarket.io/slides) |

---

## What you built

**ChaosMarket** is a headless B2B SRE/DevOps intelligence platform that predicts infrastructure failures before they become incidents. By continuously crawling repository health metrics, developer sentiment, cloud provider status pages, and smart contract vulnerabilities (via the **Anakin API**), it computes mathematical failure probabilities using an exponential decay SRE equation. When criticalтехнический долг (technical debt) thresholds are breached, the platform initializes the **Bento SDK**, signs on-chain signature challenges using `viem`, automatically launches a prediction market for the incident, and purchases "NO" shares to economically hedge the downside risk.

### Screenshots

Live CLI Terminal Dashboard:

![Dashboard](./assets/dashboard.png)

---

## Bento integration

For each surface: put **Yes** or **No**. If Yes, briefly describe how (SDK methods, feature, etc.).

| Surface | Yes / No | Describe (if Yes) |
|---------|----------|-------------------|
| Markets / duels (browse, bet, create) | **Yes** | Uses `@bento.fun/sdk` user APIs: `sdk.user.createDuel` to launch new prediction markets for infrastructure failure incidents, `sdk.user.estimateBuy` to fetch average fill prices/quotes, and `sdk.user.placeBet` to purchase a downside hedge. |
| Multi-outcome / parent markets | **No** | |
| Parlays | **No** | |
| Tournaments / F1 / fantasy | **No** | |
| Packs | **No** | |
| Polymarket bridge | **No** | |
| Agents | **Yes** | Built as an autonomous SRE trading agent that operates continuously every 60 seconds with drift-compensation timers. |
| Realtime / social | **No** | |
| Others | **Yes** | Integrates **EOA challenge login** using `viem` to sign challenge messages (`Bento.fun Login`) and exchanges them for Bearer JWT tokens via `sdk.public.auth.eoaLogin`/`eoaRegister`. |

**Builder API key:** Configured via `BENTO_BUILDER_API_KEY` (x-builder-api-key). Do **not** commit keys.

---

## How to run

```bash
# Clone the submission folder and cd into it
cd submissions/ChaosMarket

# Configure env variables
cp .env.example .env

# Install dependencies (installs @bento.fun/sdk, viem, openai, etc.)
npm install

# Run the TypeScript compiler
npm run build

# Run in offline simulation demo mode (cycles through failure tracks: dependency collapse, cloud outage, smart contract exploits)
npm run simulate

# Run specific E2E simulation tracks
npm run simulate -- --dependency
npm run simulate -- --outage
npm run simulate -- --exploit

# Run diagnostic health check tick
npm run health

# Run test suite (unit tests, integration tests, E2E pipeline tests)
npm run test
```

| Env var | Required | Description |
|---------|----------|-------------|
| `BENTO_BUILDER_API_KEY` | yes | Testnet builder key (`x-builder-api-key`) |
| `BENTO_URL` | yes | Markets host base URL (`https://api.bento.fun`) |
| `BENTO_PRIVATE_KEY` | yes | Wallet private key to sign challenge messages |
| `PARLAY_TOURNMENT_URL` | if needed | Tournaments host base URL (`https://tournaments.bento.fun`) |

---

## Architecture (short)

- **Stack:** Node.js (v22+), TypeScript, ESM, Viem, Bento SDK, OpenAI (ChatGPT), Zod, Chalk, Cli-Table3, Jest.
- **Repo layout:** Clean Architecture.
  - `/src/core`: Business logic containing interfaces, the risk engine decay equation, and the decision engine confidence policy.
  - `/src/infrastructure`: External API adapters (Anakin, ChatGPT Provider with circuit breaker/self-correction retry loop, Bento SDK adapter, Storage Adapter).
  - `/src/scheduler`: Polling loops with drift-compensation logic.
  - `/src/dashboard`: Chalk terminal dashboard rendering summary matrix and SRE stream logs.
  - `/tests`: Comprehensive test suite (unit, integration, and E2E simulation runs).
- **Auth:** Web3 EOA Challenge-Response. Operator private key signs challenge strings using Viem (`privateKeyToAccount`), then exchanges the signature for a user JWT token (`eoaLogin`), which is passed on authenticated user routes.
- **What's on-chain vs off-chain:**
  - **On-Chain**: Prediction market (duel) creation, order book price quoting, and downside option bet placement.
  - **Off-Chain**: Evidence crawling, operational text sentiment parsing, mathematical risk scoring, and local persistent historical logs.
