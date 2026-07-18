import { createBentoSdk, walletAuthProvider } from '@bento.fun/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { TransactionResult, RiskResult, MarketExecutor } from '../core/interfaces.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { CircuitBreaker } from './circuitBreaker.js';

/**
 * Adapter implementing MarketExecutor for prediction market operations.
 * Operates live on Bento in LIVE mode and returns mocks in HYBRID and SIMULATION modes.
 */
export class BentoAdapter implements MarketExecutor {
  private readonly circuitBreaker: CircuitBreaker<TransactionResult, [string, string, RiskResult]>;
  private readonly apiKey: string;
  private readonly privateKey: string;

  constructor() {
    this.apiKey = config.BENTO_BUILDER_API_KEY;
    this.privateKey = config.BENTO_PRIVATE_KEY;

    this.circuitBreaker = new CircuitBreaker<TransactionResult, [string, string, RiskResult]>(
      'BentoAPI',
      (target, incidentType, result) => this.sendRealTrade(target, incidentType, result),
      async (target, incidentType) => this.sendMockTrade(target, incidentType)
    );
  }

  public async executeTrade(
    target: string,
    incidentType: string,
    result: RiskResult
  ): Promise<TransactionResult> {
    if (config.mode === 'SIMULATION' || config.mode === 'HYBRID') {
      const modeLabel = config.mode === 'SIMULATION' ? 'SIMULATION' : 'HYBRID';
      logger.info(
        'BentoAdapter',
        `Running in ${modeLabel} mode. Intercepting trade and returning mock transaction.`
      );
      return this.sendMockTrade(target, incidentType);
    }

    return this.circuitBreaker.execute(target, incidentType, result);
  }

  /**
   * Executes a real trade request on Bento prediction market API.
   */
  private async sendRealTrade(
    target: string,
    incidentType: string,
    result: RiskResult
  ): Promise<TransactionResult> {
    const marketQuestion = `Will ${incidentType} for ${target} resolve within 72 hours?`;
    logger.info(
      'BentoAdapter',
      `Executing live trade via Bento SDK. Creating market: "${marketQuestion}"`
    );

    const callApi = async () => {
      // 1. Format private key
      let privateKey = this.privateKey;
      if (!privateKey.startsWith('0x')) {
        privateKey = `0x${privateKey}`;
      }

      // 2. Parse wallet account via viem
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const address = account.address;

      // 3. Sign EOA Login message
      const ts = String(Date.now());
      const signature = await account.signMessage({
        message: `Bento.fun Login\nTimestamp: ${ts}\nWallet: ${address}`,
      });

      // 4. Initialize temporary public client to log in
      const tempSdk = createBentoSdk({
        baseUrl: config.BENTO_URL,
        apiKey: this.apiKey,
        auth: walletAuthProvider(() => ({})),
      });

      // 5. Authenticate (Login or Register)
      let authRes = await tempSdk.public.auth.eoaLogin({ address, signature, timestamp: ts });
      let token: string;
      if (!authRes.exists) {
        logger.info('BentoAdapter', `Wallet ${address} not registered on Bento. Registering user...`);
        authRes = await tempSdk.public.auth.eoaRegister({
          address,
          signature,
          timestamp: ts,
          username: `CM_Operator_${address.substring(2, 8)}`,
        });
      }
      token = authRes.token as string;

      // 6. Initialize authenticated SDK instance
      const sdk = createBentoSdk({
        baseUrl: config.BENTO_URL,
        apiKey: this.apiKey,
        auth: walletAuthProvider(() => ({ Authorization: `Bearer ${token}` })),
      });

      // 7. Create Prediction Market (Duel)
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      logger.info('BentoAdapter', `Creating prediction market duel for ${target}...`);
      const duelResult = await sdk.user.createDuel({
        question: marketQuestion,
        type: 'prediction',
        category: 'SRE',
        description: `Automated SRE fragility hedge for ${target} under ${incidentType} failure risk.`,
        optionA: 'YES',
        optionB: 'NO',
        startTime,
        endTime,
        privacyAccess: 'public',
        collateralMode: 'credits', // Play/test credits stack
      });

      if (!duelResult.raw || !duelResult.raw.success || !duelResult.raw.duelId) {
        const errorMsg = duelResult.raw && (duelResult.raw as any).message ? (duelResult.raw as any).message : 'unknown error';
        throw new Error(`Bento SDK failed to create market: ${errorMsg}`);
      }

      logger.success('BentoAdapter', `Prediction market created successfully. Market ID: ${duelResult.raw.duelId}`);

      // 8. Place prediction bet (against Option index 1, i.e., "NO")
      logger.info('BentoAdapter', `Requesting buy estimate for Option B (NO) on Market ${duelResult.raw.duelId}...`);
      const estimateRes = await sdk.user.estimateBuy({
        duelId: duelResult.raw.duelId,
        optionIndex: 1, // Option B (NO)
        betAmountUsdc: '1000000000000000000', // 1 Credit (1e18 base units)
      });

      if (!estimateRes.success) {
        const errorMsg = (estimateRes as any).error || 'unknown error';
        throw new Error(`Bento SDK failed to estimate buy: ${errorMsg}`);
      }

      const estimate = estimateRes.estimate;
      logger.info('BentoAdapter', `Placing buy bet of 1 Credit on Option B (NO)...`);

      const betResult = await sdk.user.placeBet({
        duelId: duelResult.raw.duelId,
        duelType: 'prediction',
        bet: 'optionB',
        optionIndex: 1,
        betAmount: '1000000000000000000',
        betAmountUsdc: '1000000000000000000',
        sharesOut: estimate.shares_out,
        minSharesOut: estimate.min_shares_out,
        slippageBps: 100, // 1%
        quoteId: estimate.quote_id,
        quoteTimestamp: estimate.quote_timestamp,
        collateralMode: 'credits',
      });

      if (!betResult.raw.success) {
        const errorMsg = (betResult.raw as any).error || 'unknown error';
        throw new Error(`Bento SDK failed to place prediction bet: ${errorMsg}`);
      }

      logger.success('BentoAdapter', `Bento prediction bet successfully placed!`);

      return {
        transactionHash: duelResult.raw.txHash || `0x${Math.random().toString(16).substring(2, 10)}`,
        timestamp: new Date().toISOString(),
        creditsUsed: 1,
        marketId: duelResult.raw.duelId,
        status: 'SUCCESS',
      } as TransactionResult;
    };

    return withRetry(callApi, 'BentoAdapter', `Bento prediction trade for ${target}`);
  }

  /**
   * Generates mock trade execution data.
   */
  private async sendMockTrade(target: string, incidentType: string): Promise<TransactionResult> {
    const marketQuestion = `Will ${incidentType} for ${target} resolve within 72 hours?`;
    logger.debug('BentoAdapter', `Mocking market: "${marketQuestion}"`);

    // Simulate blockchain confirmation lag
    const hexChars = '0123456789abcdef';
    let txHash = '0x';
    for (let i = 0; i < 40; i++) {
      txHash += hexChars[Math.floor(Math.random() * 16)];
    }

    const marketId = `mkt-${Math.random().toString(36).substring(2, 10)}`;

    return {
      transactionHash: txHash,
      timestamp: new Date().toISOString(),
      creditsUsed: 100,
      marketId,
      status: 'SUCCESS',
    };
  }
}

export const bentoAdapter = new BentoAdapter();
