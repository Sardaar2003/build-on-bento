import fs from 'fs/promises';
import path from 'path';
import {
  IncidentAnalysis,
  RiskResult,
  TransactionResult,
  SchedulerState,
  HealthStatus,
  StorageProvider,
} from '../core/interfaces.js';
import { logger } from '../utils/logger.js';

/**
 * File-system based implementation of the StorageProvider interface.
 * Implements append-only storage in JSON arrays.
 */
export class StorageAdapter implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir = './data') {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * Appends a record to a JSON file.
   */
  private async appendToFile<T>(filename: string, record: T): Promise<void> {
    const filePath = path.join(this.baseDir, filename);
    try {
      // Ensure the directory exists
      await fs.mkdir(this.baseDir, { recursive: true });

      let data: T[] = [];
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        data = JSON.parse(fileContent);
        if (!Array.isArray(data)) {
          data = [];
        }
      } catch (readError) {
        // If file doesn't exist or is invalid, start with an empty array
        data = [];
      }

      data.push(record);
      
      // Write the updated array with indentation for readability
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('StorageAdapter', `Failed to write record to ${filename}: ${errorMessage}`);
      throw error;
    }
  }

  public async saveIncident(incident: IncidentAnalysis): Promise<void> {
    logger.debug('StorageAdapter', `Saving incident record for target ${incident.targetId}`);
    await this.appendToFile('incidents.json', incident);
  }

  public async saveRisk(result: RiskResult): Promise<void> {
    logger.debug('StorageAdapter', `Saving risk calculation: probability ${result.probability}`);
    await this.appendToFile('risk-history.json', result);
  }

  public async saveTransaction(tx: TransactionResult): Promise<void> {
    logger.debug('StorageAdapter', `Saving transaction log: hash ${tx.transactionHash}`);
    await this.appendToFile('transactions.json', tx);
  }

  public async saveSchedulerState(state: SchedulerState): Promise<void> {
    logger.debug('StorageAdapter', `Saving scheduler status: drift ${state.driftMs}ms`);
    await this.appendToFile('scheduler-state.json', state);
  }

  public async saveHealth(health: HealthStatus): Promise<void> {
    logger.debug('StorageAdapter', `Saving system health status: memory usage ${health.memoryUsageMb}MB`);
    await this.appendToFile('health.json', health);
  }

  public async hasMarketBeenExecuted(targetId: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, 'ledger.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ledger = JSON.parse(content);
      if (Array.isArray(ledger)) {
        return ledger.some((entry: any) => entry.targetId === targetId);
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  public async markMarketExecuted(targetId: string, txHash: string): Promise<void> {
    const filePath = path.join(this.baseDir, 'ledger.json');
    let ledger: any[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        ledger = parsed;
      }
    } catch (error) {
      // Ledger file doesn't exist yet
    }

    ledger.push({
      targetId,
      txHash,
      timestamp: new Date().toISOString(),
    });

    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(ledger, null, 2), 'utf-8');
      logger.debug('StorageAdapter', `Marked market executed for target ${targetId} with tx ${txHash}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('StorageAdapter', `Failed to write market execution ledger: ${errorMessage}`);
      throw error;
    }
  }
}
export const storageAdapter = new StorageAdapter();
