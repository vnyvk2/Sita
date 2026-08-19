import React, { useEffect, useRef, useState } from 'react';
import type {
  AvailableSearchProviderInfo,
  MetadataProviderId,
  MetadataProviderPreferences
} from '../../../../../common/metadata/types';
import { metadataApi } from '../../../services/metadataApi';
import Checkbox from '../../Checkbox';

const MetadataSettings: React.FC = () => {
  const [preferences, setPreferences] = useState<MetadataProviderPreferences | null>(null);
  const [availableProviders, setAvailableProviders] = useState<AvailableSearchProviderInfo[]>([
    { id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true },
    { id: 'discogs', displayName: 'Discogs', isOnline: true }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      metadataApi.getMetadataPreferences(),
      metadataApi.getAvailableSearchProviders()
    ])
      .then(([prefs, providers]) => {
        if (!isMounted) return;
        if (prefs) setPreferences(prefs);
        if (providers && providers.length > 0) setAvailableProviders(providers);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
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
    <li className="main-container metadata-settings-container mb-16" id="metadata-settings-container">
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center text-2xl font-medium">
        <span className="material-icons-round-outlined mr-2">travel_explore</span>
        Metadata & AutoTag Sources
      </div>

      <p className="text-font-color-dim text-sm mb-4">
        Configure multi-source release discovery, user search priority ordering, and field-level enrichment providers.
      </p>

      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        {/* Search Providers & Priority */}
        <li className="mb-6">
          <div className="secondary-container mb-2">
            <div className="font-semibold text-base mb-1">Release Discovery Sources & Priority</div>
            <div className="description text-xs text-font-color-dim mb-3">
              Enable providers to participate in &quot;Best Match&quot; searches. Reorder to set tie-breaker priority for matching releases.
            </div>

            <div className="flex flex-col gap-2 max-w-md">
              {availableProviders.map((prov) => {
                const isEnabled = preferences.enabledSearchProviders.includes(prov.id);
                const priorityIndex = preferences.searchProviderPriority.indexOf(prov.id);

                return (
                  <div
                    key={prov.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background-color-2/50 border border-font-color-dim/20"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`search-prov-${prov.id}`}
                        isChecked={isEnabled}
                        checkedStateUpdateFunction={(checked) => handleToggleProvider(prov.id, checked)}
                        labelContent={prov.displayName}
                      />
                    </div>

                    {isEnabled && priorityIndex >= 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-background-color-3 text-font-color-highlight">
                          Priority #{priorityIndex + 1}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={priorityIndex === 0 || saving}
                            onClick={() => handleMovePriority(priorityIndex, 'up')}
                            className="p-1 text-xs rounded hover:bg-background-color-3 disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={priorityIndex === preferences.searchProviderPriority.length - 1 || saving}
                            onClick={() => handleMovePriority(priorityIndex, 'down')}
                            className="p-1 text-xs rounded hover:bg-background-color-3 disabled:opacity-30 cursor-pointer"
                            title="Move Down"
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
          </div>
        </li>

        {/* Enrichment Federation Strategy */}
        <li className="mb-4">
          <div className="secondary-container">
            <div className="font-semibold text-base mb-1">Specialized Field Enrichment</div>
            <div className="description text-xs text-font-color-dim mb-3">
              Automated federation sources for specialized fields.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl text-sm">
              <div className="p-3 rounded-lg bg-background-color-2/50 border border-font-color-dim/20">
                <div className="text-xs font-semibold text-font-color-dim uppercase tracking-wider">Cover Art</div>
                <div className="font-medium mt-1">Cover Art Archive</div>
              </div>
              <div className="p-3 rounded-lg bg-background-color-2/50 border border-font-color-dim/20">
                <div className="text-xs font-semibold text-font-color-dim uppercase tracking-wider">Genres & Styles</div>
                <div className="font-medium mt-1">Discogs</div>
              </div>
              <div className="p-3 rounded-lg bg-background-color-2/50 border border-font-color-dim/20">
                <div className="text-xs font-semibold text-font-color-dim uppercase tracking-wider">Lyrics</div>
                <div className="font-medium mt-1">LRCLIB</div>
              </div>
            </div>
          </div>
        </li>
      </ul>

      {saveMessage && (
        <div className="mt-3 text-xs font-medium text-font-color-highlight">
          {saveMessage}
        </div>
      )}
    </li>
  );
};

export default MetadataSettings;
