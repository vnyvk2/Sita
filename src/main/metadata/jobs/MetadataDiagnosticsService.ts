import type { MetadataProviderId } from '../../../common/metadata/types';

export interface OperationTelemetry {
  operationId: string;
  providerId?: MetadataProviderId;
  durationMs: number;
  songsProcessed: number;
  matchesCount: number;
  warningsCount: number;
  errorsCount: number;
  timestamp: number;
  success: boolean;
}

export class MetadataDiagnosticsService {
  private readonly telemetryRecords: OperationTelemetry[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords = 100) {
    this.maxRecords = maxRecords;
  }

  public recordOperation(telemetry: Omit<OperationTelemetry, 'timestamp'>): OperationTelemetry {
    const record: OperationTelemetry = {
      ...telemetry,
      timestamp: Date.now()
    };

    this.telemetryRecords.push(record);
    if (this.telemetryRecords.length > this.maxRecords) {
      this.telemetryRecords.shift();
    }

    return record;
  }

  public getSummary() {
    const totalOps = this.telemetryRecords.length;
    if (totalOps === 0) {
      return { totalOperations: 0, successRate: 1, averageDurationMs: 0, totalSongsProcessed: 0 };
    }

    const successfulOps = this.telemetryRecords.filter((r) => r.success).length;
    const totalDuration = this.telemetryRecords.reduce((acc, r) => acc + r.durationMs, 0);
    const totalSongs = this.telemetryRecords.reduce((acc, r) => acc + r.songsProcessed, 0);

    return {
      totalOperations: totalOps,
      successRate: successfulOps / totalOps,
      averageDurationMs: totalDuration / totalOps,
      totalSongsProcessed: totalSongs
    };
  }

  public getRecords(): OperationTelemetry[] {
    return [...this.telemetryRecords];
  }
}
