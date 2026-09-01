import React from 'react';

import { getProviderDisplayName } from '../../../../common/metadata/displayNames';
import type { AlbumMetadata, MatchQualityBandName } from '../../../../common/metadata/types';

const QUALITY_BAND_CHIP_CLASS: Record<MatchQualityBandName, string> = {
  Definitive: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  Probable: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400',
  Weak: 'bg-rose-500/15 border-rose-500/30 text-rose-500 dark:text-rose-400'
};

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function formatScoreTooltip(cand: AlbumMetadata): string | undefined {
  const b = cand.rankingBreakdown;
  if (!b) {
    return cand.rankingScore !== undefined ? `Total score ${cand.rankingScore}` : undefined;
  }

  const parts = [
    `Base ${Math.round(b.baseScore)}`,
    `Artist ${signed(b.artistScore)}`,
    `Title ${signed(b.titleScore)}`,
    `Status ${signed(b.statusScore)}`,
    `Type ${signed(b.primaryTypeScore)}`
  ];
  if (b.secondaryTypePenalty !== 0) parts.push(`Secondary ${signed(b.secondaryTypePenalty)}`);
  if (b.trackCountBonus !== 0) parts.push(`Tracks ${signed(b.trackCountBonus)}`);
  if (b.editionBoost !== 0) parts.push(`Edition ${signed(b.editionBoost)}`);
  parts.push(`= ${cand.rankingScore ?? Math.round(cand.rankingScore ?? 0)}`);

  if (cand.qualityBand) parts.push(`(${cand.qualityBand})`);
  return parts.join(' · ');
}

export interface CandidateMatchesTableProps {
  candidates: AlbumMetadata[];
  selectedCandidateId: string | null;
  loadingCandidateId?: string | null;
  loading: boolean;
  onSelectCandidate: (candidate: AlbumMetadata) => void;
}

export const CandidateMatchesTable: React.FC<CandidateMatchesTableProps> = ({
  candidates = [],
  selectedCandidateId,
  loadingCandidateId,
  loading,
  onSelectCandidate
}) => {
  if (candidates.length === 0 && !loading) {
    return (
      <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/30 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded-xl border border-dashed p-6 text-center text-sm">
        No candidate releases found. Enter album and artist above and click Search.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Section Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
          Candidate Releases ({candidates.length})
        </span>
      </div>

      {/* Table Container (Scrollable up to max 4-5 compact rows) */}
      <div className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/20 dark:bg-dark-background-color-2/30 max-h-[250px] overflow-y-auto rounded-xl border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed sticky top-0 z-[2] border-b text-xs tracking-wider uppercase">
            <tr>
              <th className="w-9 px-2.5 py-2 text-center"></th>
              <th className="px-3 py-2">RELEASE</th>
              <th className="px-3 py-2">ARTIST</th>
              <th className="w-20 px-3 py-2">YEAR</th>
              <th className="w-40 px-3 py-2">MATCH</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((cand, idx) => {
              const candidateKey = cand.releaseId ?? cand.title;
              const isSelected = selectedCandidateId === candidateKey;
              const isLoadingThis =
                loadingCandidateId === candidateKey || loadingCandidateId === cand.releaseId;
              const providerLabel = getProviderDisplayName(cand.provider);

              return (
                <tr
                  key={candidateKey}
                  onClick={() => onSelectCandidate(cand)}
                  className={`border-background-color-2/50 dark:border-dark-background-color-2/50 cursor-pointer border-b transition-colors ${
                    isSelected
                      ? 'bg-background-color-3/20 dark:bg-dark-background-color-3/20'
                      : 'hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/60'
                  }`}
                >
                  {/* Radio / Loading Indicator */}
                  <td className="px-2.5 py-2 text-center">
                    {isLoadingThis ? (
                      <div className="border-font-color-highlight dark:border-dark-font-color-highlight mx-auto h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
                    ) : (
                      <div
                        className={`mx-auto h-3.5 w-3.5 rounded-full border-2 transition-all ${
                          isSelected
                            ? 'border-font-color-highlight dark:border-dark-font-color-highlight bg-font-color-highlight dark:bg-dark-font-color-highlight'
                            : 'border-font-color-dimmed/60 dark:border-dark-font-color-dimmed/60 bg-transparent'
                        }`}
                      />
                    )}
                  </td>

                  {/* Release Title & Subtitle */}
                  <td className="px-3 py-2">
                    <div
                      className={`text-sm ${isSelected ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-bold' : 'text-font-color-black dark:text-font-color-white font-semibold'}`}
                    >
                      {cand.title}
                    </div>
                    <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 text-xs">
                      {cand.trackCount ? `${cand.trackCount} tracks` : 'Official Release'}{' '}
                      {cand.releaseType ? `· ${cand.releaseType}` : ''}
                    </div>
                  </td>

                  {/* Artist */}
                  <td className="text-font-color-black dark:text-font-color-white px-3 py-2 text-xs font-medium">
                    {cand.artist || '—'}
                  </td>

                  {/* Year */}
                  <td className="text-font-color-dimmed dark:text-dark-font-color-dimmed px-3 py-2 text-xs">
                    {cand.year ?? '—'}
                  </td>

                  {/* Match Rank & Provider */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isLoadingThis ? (
                        <span className="bg-background-color-3/30 dark:bg-dark-background-color-3/30 text-font-color-highlight dark:text-dark-font-color-highlight border-background-color-3/50 dark:border-dark-background-color-3/50 rounded border px-1.5 py-0.5 text-[0.7rem] font-semibold">
                          Resolving...
                        </span>
                      ) : (
                        <>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase ${
                              idx === 0
                                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed'
                            }`}
                          >
                            {idx === 0 ? 'Best Match' : `#${idx + 1}`}
                          </span>
                          {cand.qualityBand && (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold ${QUALITY_BAND_CHIP_CLASS[cand.qualityBand]}`}
                              title={`Match quality: ${cand.qualityBand}`}
                            >
                              {cand.qualityBand}
                            </span>
                          )}
                          {cand.rankingScore !== undefined && (
                            <span
                              className="text-font-color-dimmed dark:text-dark-font-color-dimmed cursor-help text-[0.72rem] font-medium"
                              title={formatScoreTooltip(cand)}
                            >
                              Score {cand.rankingScore}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 text-[0.7rem] font-medium">
                      {providerLabel}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
