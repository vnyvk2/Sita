/**
 * Minimal asset job handler for Phase C4-A.
 *
 * Implements the lifecycle for CMD_GENERATE_ASSET without yet migrating
 * real Sharp / Taglib / waveform native algorithms (which belong exclusively to C4-B).
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Zero database dependencies, zero ORM imports.
 * 2. Pure CPU / deterministic execution.
 * 3. AbortController / cancellation respect.
 */

export interface ExecuteAssetOptions {
  taskId: string;
  jobType: 'artwork' | 'waveform';
  input: {
    sourceFilePath: string;
    destinationPath: string;
    metadata?: Record<string, unknown>;
  };
  abortSignal?: AbortSignal;
}

export type AssetExecutionResult =
  | {
      success: true;
      outputFilePath: string;
      metadata: Record<string, unknown>;
      cancelled?: false;
    }
  | {
      success: false;
      error: string;
      cancelled?: boolean;
    };

export async function executeAssetJob(options: ExecuteAssetOptions): Promise<AssetExecutionResult> {
  const { taskId, jobType, input, abortSignal } = options;

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: `Asset task ${taskId} was cancelled before execution.`,
      cancelled: true
    };
  }

  // Small async delay simulating I/O to allow cancellation testing
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: `Asset task ${taskId} was cancelled during execution.`,
      cancelled: true
    };
  }

  // Deterministic failure trigger for testing failure paths
  if (input.sourceFilePath.includes('__FAIL__')) {
    return {
      success: false,
      error: `Simulated asset generation failure for ${input.sourceFilePath}`
    };
  }

  return {
    success: true,
    outputFilePath: input.destinationPath,
    metadata: {
      jobType,
      processedBy: 'assetJobHandler',
      ...input.metadata
    }
  };
}
