import React from 'react';
import type { AlbumMetadata } from '../../../../common/metadata/types';
import { getProviderDisplayName } from '../../../../common/metadata/displayNames';

export interface CandidateMatchesTableProps {
  candidates: AlbumMetadata[];
  selectedCandidateId: string | null;
  loadingCandidateId?: string | null;
  loading: boolean;
  onSelectCandidate: (candidate: AlbumMetadata) => void;
}

export const CandidateMatchesTable: React.FC<CandidateMatchesTableProps> = ({
  candidates,
  selectedCandidateId,
  loadingCandidateId,
  loading,
  onSelectCandidate
}) => {
  if (candidates.length === 0 && !loading) {
    return (
      <div className="p-6 text-center bg-background-color-2/20 dark:bg-dark-background-color-2/30 rounded-xl border border-dashed border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed text-sm">
        No candidate releases found. Enter album and artist above and click Search.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Section Header */}
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-semibold tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase">
          Candidate Releases ({candidates.length})
        </span>
      </div>

      {/* Table Container (Scrollable up to max 4-5 compact rows) */}
      <div className="border border-background-color-2 dark:border-dark-background-color-2 rounded-xl overflow-y-auto max-h-[250px] bg-background-color-2/20 dark:bg-dark-background-color-2/30">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-[2] bg-background-color-2 dark:bg-dark-background-color-2 border-b border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs uppercase tracking-wider">
            <tr>
              <th className="w-9 px-2.5 py-2 text-center"></th>
              <th className="px-3 py-2">RELEASE</th>
              <th className="px-3 py-2">ARTIST</th>
              <th className="px-3 py-2 w-20">YEAR</th>
              <th className="px-3 py-2 w-40">MATCH</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((cand, idx) => {
              const candidateKey = cand.releaseId ?? cand.title;
              const isSelected = selectedCandidateId === candidateKey;
              const isLoadingThis = loadingCandidateId === candidateKey || loadingCandidateId === cand.releaseId;
              const providerLabel = getProviderDisplayName(cand.provider);

              return (
                <tr
                  key={candidateKey}
                  onClick={() => onSelectCandidate(cand)}
                  className={`border-b border-background-color-2/50 dark:border-dark-background-color-2/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-background-color-3/20 dark:bg-dark-background-color-3/20' : 'hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/60'
                  }`}
                >
                  {/* Radio / Loading Indicator */}
                  <td className="px-2.5 py-2 text-center">
                    {isLoadingThis ? (
                      <div className="w-3 h-3 rounded-full border-2 border-font-color-highlight dark:border-dark-font-color-highlight border-t-transparent animate-spin mx-auto" />
                    ) : (
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 mx-auto transition-all ${
                          isSelected
                            ? 'border-font-color-highlight dark:border-dark-font-color-highlight bg-font-color-highlight dark:bg-dark-font-color-highlight'
                            : 'border-font-color-dimmed/60 dark:border-dark-font-color-dimmed/60 bg-transparent'
                        }`}
                      />
                    )}
                  </td>

                  {/* Release Title & Subtitle */}
                  <td className="px-3 py-2">
                    <div className={`text-sm ${isSelected ? 'font-bold text-font-color-highlight dark:text-dark-font-color-highlight' : 'font-semibold text-font-color-black dark:text-font-color-white'}`}>
                      {cand.title}
                    </div>
                    <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5">
                      {cand.trackCount ? `${cand.trackCount} tracks` : 'Official Release'} {cand.releaseType ? `· ${cand.releaseType}` : ''}
                    </div>
                  </td>

                  {/* Artist */}
                  <td className="px-3 py-2 text-font-color-black dark:text-font-color-white text-xs font-medium">
                    {cand.artist || '—'}
                  </td>

                  {/* Year */}
                  <td className="px-3 py-2 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                    {cand.year ?? '—'}
                  </td>

                  {/* Match Rank & Provider */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isLoadingThis ? (
                        <span className="text-[0.7rem] font-semibold px-1.5 py-0.5 rounded bg-background-color-3/30 dark:bg-dark-background-color-3/30 text-font-color-highlight dark:text-dark-font-color-highlight border border-background-color-3/50 dark:border-dark-background-color-3/50">
                          Resolving...
                        </span>
                      ) : (
                        <>
                          <span
                            className={`text-[0.7rem] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide border ${
                              idx === 0
                                ? 'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight'
                                : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed'
                            }`}
                          >
                            {idx === 0 ? 'Best Match' : `#${idx + 1}`}
                          </span>
                          {cand.rankingScore !== undefined && (
                            <span className="text-[0.72rem] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">
                              Score {cand.rankingScore}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-[0.7rem] text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 font-medium">
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

