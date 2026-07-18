import chalk from 'chalk';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'DEBUG' | 'NONE';

export class Logger {
  private levelThresholds: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    SUCCESS: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5,
  };

  private currentThreshold: number;

  constructor(configuredLevel: string = 'DEBUG') {
    const normLevel = configuredLevel.toUpperCase() as LogLevel;
    this.currentThreshold = this.levelThresholds[normLevel] ?? 0;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelThresholds[level] >= this.currentThreshold;
  }

  private formatMessage(level: LogLevel, component: string, message: string): string {
    const timestamp = new Date().toISOString();
    let levelStr = level.padEnd(7);

    switch (level) {
      case 'SUCCESS':
        levelStr = chalk.bold.green(levelStr);
        break;
      case 'INFO':
        levelStr = chalk.bold.cyan(levelStr);
        break;
      case 'WARN':
        levelStr = chalk.bold.yellow(levelStr);
        break;
      case 'ERROR':
        levelStr = chalk.bold.red(levelStr);
        break;
      case 'DEBUG':
        levelStr = chalk.bold.blue(levelStr);
        break;
    }

    const componentStr = chalk.gray(`[${component}]`);
    return `${timestamp} ${levelStr} ${componentStr} ${message}`;
  }

  public info(component: string, message: string): void {
    if (this.shouldLog('INFO')) {
      console.log(this.formatMessage('INFO', component, message));
    }
  }

  public warn(component: string, message: string): void {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatMessage('WARN', component, message));
    }
  }

  public error(component: string, message: string): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', component, message));
    }
  }

  public success(component: string, message: string): void {
    if (this.shouldLog('SUCCESS')) {
      console.log(this.formatMessage('SUCCESS', component, message));
    }
  }

  public debug(component: string, message: string): void {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', component, message));
    }
  }

  public custom(component: string, message: string): void {
    console.log(this.formatMessage('INFO', component, message));
  }
}

// Global logger instance with default level
export const logger = new Logger(process.env.LOG_LEVEL || 'DEBUG');
