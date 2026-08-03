import type { ProviderResult } from '../../models/ProviderResult';
import type { IMetadataMergePolicy } from './IMetadataMergePolicy';

export class DefaultMetadataMergePolicy implements IMetadataMergePolicy {
  public merge<TDTO = unknown>(results: ProviderResult<TDTO>[]): TDTO | null {
    const validResults = results.filter(
      (r) => r.status === 'success' && r.payload !== null && r.payload !== undefined
    );

    if (validResults.length === 0) {
      return null;
    }

    // Sort by provider priority descending (highest priority first)
    const sorted = [...validResults].sort((a, b) => b.providerInfo.priority - a.providerInfo.priority);

    if (sorted.length === 1) {
      return sorted[0].payload as TDTO;
    }

    // Overlay fields from lowest priority to highest priority
    const merged: Record<string, unknown> = {};
    const reversed = [...sorted].reverse();

    for (const res of reversed) {
      const payload = res.payload as Record<string, unknown>;
      if (payload && typeof payload === 'object') {
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) {
            merged[key] = value;
          }
        }
      }
    }

    return merged as TDTO;
  }
}
