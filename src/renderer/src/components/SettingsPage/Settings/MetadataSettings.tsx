import React, { useEffect, useRef, useState, type ChangeEvent } from 'react';

import type {
  AvailableSearchProviderInfo,
  MetadataProviderId,
  MetadataProviderPreferences,
  SearchRankingWeights
} from '../../../../../common/metadata/types';
import { DEFAULT_SEARCH_RANKING_WEIGHTS } from '../../../../../common/metadata/types';
import { metadataApi } from '../../../services/metadataApi';
import Checkbox from '../../Checkbox';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

interface RankingWeightField {
  key: keyof SearchRankingWeights;
  label: string;
  description: string;
}

const RANKING_WEIGHT_MIN = -100;
const RANKING_WEIGHT_MAX = 200;

const RANKING_WEIGHT_FIELDS: RankingWeightField[] = [
  {
    key: 'artistMatch',
    label: 'Artist similarity',
    description: 'Points added for how closely the release artist matches your search.'
  },
  {
    key: 'titleMatch',
    label: 'Title similarity',
    description: 'Points added for how closely the release title matches your search.'
  },
  {
    key: 'officialStatus',
    label: 'Official release bonus',
    description: 'Points added to official releases.'
  },
  {
    key: 'bootlegPenalty',
    label: 'Bootleg penalty',
    description: 'Points removed from bootleg / pseudo-releases. Usually negative.'
  },
  {
    key: 'primaryTypeAlbum',
    label: 'Album type bonus',
    description: 'Points added when the candidate is a studio album.'
  },
  {
    key: 'primaryTypeEP',
    label: 'EP type bonus',
    description: 'Points added when the candidate is an EP.'
  },
  {
    key: 'compilationPenalty',
    label: 'Compilation penalty',
    description: 'Points removed from compilations unless you searched for one. Usually negative.'
  },
  {
    key: 'livePenalty',
    label: 'Live recording penalty',
    description: 'Points removed from live recordings. Usually negative.'
  },
  {
    key: 'trackCountMatch',
    label: 'Track count match',
    description: 'Points added when the track count matches your files exactly.'
  },
  {
    key: 'editionBoost',
    label: 'Deluxe edition boost',
    description: 'Points added to deluxe / special editions when your search mentions one.'
  },
  {
    key: 'remasterBoost',
    label: 'Remaster boost',
    description: 'Points added to remasters when your search mentions one.'
  }
];

const GENRE_PROVIDER_OPTIONS: { id: MetadataProviderId; label: string }[] = [
  { id: 'discogs', label: 'Discogs' },
  { id: 'musicbrainz', label: 'MusicBrainz Tags' }
];

const numberInputClass =
  'px-2 py-1 w-20 text-sm text-right rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3/50 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors';

const MetadataSettings: React.FC = () => {
  const [preferences, setPreferences] = useState<MetadataProviderPreferences | null>(null);
  const [availableProviders, setAvailableProviders] = useState<AvailableSearchProviderInfo[]>([
    { id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showAdvancedScoring, setShowAdvancedScoring] = useState(false);
  const [weightsDraft, setWeightsDraft] = useState<SearchRankingWeights | null>(null);
  const weightsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferencesRef = useRef<MetadataProviderPreferences | null>(null);
  const weightsLatestRef = useRef<SearchRankingWeights | null>(null);
  const weightsDirtyRef = useRef(false);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([metadataApi.getMetadataPreferences(), metadataApi.getAvailableSearchProviders()])
      .then(([prefs, providers]) => {
        if (!isMounted) return;
        if (prefs) {
          setPreferences(prefs);
          const draft = prefs.searchRankingWeights ?? { ...DEFAULT_SEARCH_RANKING_WEIGHTS };
          setWeightsDraft(draft);
          weightsLatestRef.current = draft;
          weightsDirtyRef.current = false;
        }
        if (providers && providers.length > 0) setAvailableProviders(providers);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      if (weightsSaveTimer.current) clearTimeout(weightsSaveTimer.current);
      if (weightsDirtyRef.current && weightsLatestRef.current && preferencesRef.current) {
        weightsDirtyRef.current = false;
        void metadataApi
          .saveMetadataPreferences({
            ...preferencesRef.current,
            searchRankingWeights: weightsLatestRef.current
          })
          .catch(() => undefined);
      }
    };
  }, []);

  const handleToggleProvider = async (providerId: MetadataProviderId, enabled: boolean) => {
    if (!preferences) return;

    let newEnabled = enabled
      ? [...preferences.enabledSearchProviders, providerId]
      : preferences.enabledSearchProviders.filter((p) => p !== providerId);

    // Guard: Prevent disabling all providers
    if (newEnabled.length === 0) {
      newEnabled = [providerId];
    }

    // Keep unique
    newEnabled = Array.from(new Set(newEnabled));

    let newPriority = preferences.searchProviderPriority.filter((p) => newEnabled.includes(p));
    if (enabled && !newPriority.includes(providerId)) {
      newPriority.push(providerId);
    }
    if (newPriority.length === 0) {
      newPriority = [...newEnabled];
    }

    const updated = {
      ...preferences,
      enabledSearchProviders: newEnabled,
      searchProviderPriority: newPriority
    };

    setPreferences(updated);
    await savePreferencesUpdate(updated);
  };

  const handleMovePriority = async (index: number, direction: 'up' | 'down') => {
    if (!preferences) return;
    const priority = [...preferences.searchProviderPriority];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= priority.length) return;

    const temp = priority[index];
    priority[index] = priority[targetIndex];
    priority[targetIndex] = temp;

    const updated = {
      ...preferences,
      searchProviderPriority: priority
    };

    setPreferences(updated);
    await savePreferencesUpdate(updated);
  };

  const commitWeights = (next: SearchRankingWeights, immediate = false) => {
    weightsLatestRef.current = next;
    setWeightsDraft(next);

    if (!preferencesRef.current) return;

    if (weightsSaveTimer.current) clearTimeout(weightsSaveTimer.current);

    if (immediate) {
      weightsDirtyRef.current = false;
      void savePreferencesUpdate({ ...preferencesRef.current, searchRankingWeights: next });
    } else {
      weightsDirtyRef.current = true;
      weightsSaveTimer.current = setTimeout(() => {
        weightsDirtyRef.current = false;
        if (preferencesRef.current) {
          void savePreferencesUpdate({ ...preferencesRef.current, searchRankingWeights: next });
        }
      }, 600);
    }
  };

  const handleWeightChange = (key: keyof SearchRankingWeights, value: string) => {
    if (!preferences) return;

    const base = weightsLatestRef.current ??
      preferences.searchRankingWeights ?? { ...DEFAULT_SEARCH_RANKING_WEIGHTS };

    const parsed = value.trim() === '' ? 0 : Number(value);
    if (!Number.isFinite(parsed)) return;

    const clamped = Math.max(RANKING_WEIGHT_MIN, Math.min(RANKING_WEIGHT_MAX, Math.round(parsed)));
    commitWeights({ ...base, [key]: clamped });
  };

  const handleResetWeights = () => {
    commitWeights({ ...DEFAULT_SEARCH_RANKING_WEIGHTS }, true);
  };

  const handleGenreProviderChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!preferences) return;
    const providerId = e.target.value as MetadataProviderId;
    const updated = { ...preferences, defaultGenreProvider: providerId };
    setPreferences(updated);
    void savePreferencesUpdate(updated);
  };

  const saveSequenceRef = useRef(0);

  const savePreferencesUpdate = async (newPrefs: MetadataProviderPreferences) => {
    const currentSeq = ++saveSequenceRef.current;
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await metadataApi.saveMetadataPreferences(newPrefs);
      if (saved && currentSeq === saveSequenceRef.current) {
        setPreferences(saved);
        setSaveMessage('Preferences saved.');
        setTimeout(() => {
          if (currentSeq === saveSequenceRef.current) {
            setSaveMessage(null);
          }
        }, 2500);
      }
    } catch (err: unknown) {
      if (currentSeq === saveSequenceRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setSaveMessage(`Error: ${msg}`);
      }
    } finally {
      if (currentSeq === saveSequenceRef.current) {
        setSaving(false);
      }
    }
  };

  if (loading || !preferences) {
    return null;
  }

  return (
    <CollapsibleSettingsSection
      id="metadata-settings-container"
      sectionKey="metadata"
      title="Metadata & AutoTag Sources"
      iconName="travel_explore"
      className="metadata-settings-container"
    >
      <p className="text-font-color-dim mb-4 text-sm">
        Configure multi-source release discovery, Best Match ranking behavior, and specialized field
        enrichment providers.
      </p>

      <ul className="marker:bg-background-color-3 dark:marker:bg-dark-background-color-3 list-disc pl-6">
        {/* Search Providers & Priority */}
        <li className="mb-6">
          <div className="secondary-container mb-2">
            <div className="mb-1 text-base font-semibold">Release Discovery Sources & Priority</div>
            <div className="description text-font-color-dim mb-3 text-xs">
              Enable providers to participate in &quot;Best Match&quot; searches. Candidates are
              ranked primarily by match quality (Definitive &gt; Probable &gt; Weak); the list order
              below only decides ties between equally-matched candidates — #1 is preferred first.
              Disabled sources sit at the bottom.
            </div>

            <div className="flex max-w-md flex-col gap-2">
              {[
                ...preferences.searchProviderPriority
                  .map((id) => availableProviders.find((p) => p.id === id))
                  .filter((p): p is AvailableSearchProviderInfo => Boolean(p)),
                ...availableProviders.filter(
                  (p) => !preferences.searchProviderPriority.includes(p.id)
                )
              ].map((prov) => {
                const isEnabled = preferences.enabledSearchProviders.includes(prov.id);
                const priorityIndex = preferences.searchProviderPriority.indexOf(prov.id);

                return (
                  <div
                    key={prov.id}
                    className={`bg-background-color-2/50 border-font-color-dim/20 flex items-center justify-between rounded-lg border p-3 transition-opacity ${
                      isEnabled ? '' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isEnabled && priorityIndex >= 0 && (
                        <span
                          className="bg-background-color-3 text-font-color-highlight flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                          title={`Tie-break priority ${priorityIndex + 1}`}
                        >
                          {priorityIndex + 1}
                        </span>
                      )}
                      <Checkbox
                        id={`search-prov-${prov.id}`}
                        isChecked={isEnabled}
                        checkedStateUpdateFunction={(checked) =>
                          handleToggleProvider(prov.id, checked)
                        }
                        labelContent={prov.displayName}
                      />
                    </div>

                    {isEnabled && priorityIndex >= 0 && (
                      <div className="flex items-center">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={priorityIndex === 0 || saving}
                            onClick={() => handleMovePriority(priorityIndex, 'up')}
                            className="hover:bg-background-color-3 cursor-pointer rounded px-1.5 text-[0.6rem] leading-none disabled:opacity-30"
                            title="Higher priority — wins ties against the provider below"
                            aria-label={`Raise ${prov.displayName} priority`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={
                              priorityIndex === preferences.searchProviderPriority.length - 1 ||
                              saving
                            }
                            onClick={() => handleMovePriority(priorityIndex, 'down')}
                            className="hover:bg-background-color-3 cursor-pointer rounded px-1.5 text-[0.6rem] leading-none disabled:opacity-30"
                            title="Lower priority — loses ties against the provider above"
                            aria-label={`Lower ${prov.displayName} priority`}
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!availableProviders.some((prov) => prov.id === 'discogs') && (
              <div className="text-font-color-dim mt-2 max-w-md text-xs">
                Discogs appears here once a personal access token is configured via{' '}
                <code className="bg-background-color-2 rounded px-1 py-0.5 text-[0.7rem]">
                  MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN
                </code>{' '}
                in your .env file, followed by an app restart. See .env.example.
              </div>
            )}
          </div>
        </li>

        {/* Best Match Scoring (Advanced) */}
        <li className="mb-6">
          <div className="secondary-container">
            <button
              type="button"
              onClick={() => setShowAdvancedScoring((prev) => !prev)}
              className="group flex w-full cursor-pointer items-center gap-2 text-left"
            >
              <span className="text-font-color-dim group-hover:text-font-color-black dark:group-hover:text-dark-font-color-white text-xs transition-colors">
                {showAdvancedScoring ? '▼' : '▶'}
              </span>
              <div>
                <div className="text-base font-semibold">Best Match Scoring (Advanced)</div>
                <div className="description text-font-color-dim mt-0.5 text-xs">
                  Tune how release candidates are scored. Changes apply to new searches immediately.
                </div>
              </div>
            </button>

            {showAdvancedScoring && weightsDraft && (
              <div className="mt-4">
                <div className="flex max-w-md flex-col gap-2">
                  {RANKING_WEIGHT_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="bg-background-color-2/50 border-font-color-dim/20 flex items-center justify-between gap-4 rounded-lg border p-2.5"
                    >
                      <span
                        className="text-font-color-black dark:text-dark-font-color-white text-sm"
                        title={field.description}
                      >
                        {field.label}
                      </span>
                      <input
                        type="number"
                        min={RANKING_WEIGHT_MIN}
                        max={RANKING_WEIGHT_MAX}
                        step={1}
                        value={weightsDraft[field.key]}
                        onChange={(e) => handleWeightChange(field.key, e.target.value)}
                        className={numberInputClass}
                        aria-label={field.label}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex max-w-md items-center justify-between">
                  <span className="text-font-color-dim text-xs">
                    Quality bands: Definitive ≈ score ≥160 · Probable ≥120 · otherwise Weak.
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleResetWeights()}
                    className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-dark-font-color-white cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </li>

        {/* Enrichment Federation Strategy */}
        <li className="mb-4">
          <div className="secondary-container">
            <div className="mb-1 text-base font-semibold">Specialized Field Enrichment</div>
            <div className="description text-font-color-dim mb-3 text-xs">
              Preferred federation sources for specialized fields during preview building.
            </div>

            <div className="grid max-w-xl grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="bg-background-color-2/50 border-font-color-dim/20 rounded-lg border p-3">
                <div className="text-font-color-dim text-xs font-semibold tracking-wider uppercase">
                  Cover Art
                </div>
                <div className="mt-1 font-medium">Cover Art Archive</div>
                <div className="text-font-color-dim mt-0.5 text-xs">Sole artwork source</div>
              </div>
              <div className="bg-background-color-2/50 border-font-color-dim/20 rounded-lg border p-3">
                <div className="text-font-color-dim text-xs font-semibold tracking-wider uppercase">
                  Genres & Styles
                </div>
                <select
                  value={preferences.defaultGenreProvider}
                  onChange={handleGenreProviderChange}
                  className={`bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-3/50 dark:border-dark-background-color-2 focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight mt-1 w-full cursor-pointer rounded-lg border px-2 py-1 text-sm transition-colors outline-none`}
                  aria-label="Preferred genre provider"
                >
                  {GENRE_PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-background-color-2/50 border-font-color-dim/20 rounded-lg border p-3">
                <div className="text-font-color-dim text-xs font-semibold tracking-wider uppercase">
                  Lyrics
                </div>
                <div className="mt-1 font-medium">LRCLIB</div>
                <div className="text-font-color-dim mt-0.5 text-xs">Adapter pending</div>
              </div>
            </div>
          </div>
        </li>
      </ul>

      {saveMessage && (
        <div className="text-font-color-highlight mt-3 text-xs font-medium">{saveMessage}</div>
      )}
    </CollapsibleSettingsSection>
  );
};

export default MetadataSettings;
