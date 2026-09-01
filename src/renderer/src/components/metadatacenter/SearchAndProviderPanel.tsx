import React from 'react';

import styles from './MetadataCenter.module.css';

export interface SearchAndProviderPanelProps {
  title: string;
  artist: string;
  selectedProvider: string;
  loading: boolean;
  onTitleChange: (val: string) => void;
  onArtistChange: (val: string) => void;
  onProviderChange: (providerId: string) => void;
  onSearch: () => void;
}

export const SearchAndProviderPanel: React.FC<SearchAndProviderPanelProps> = ({
  title,
  artist,
  selectedProvider,
  loading,
  onTitleChange,
  onArtistChange,
  onProviderChange,
  onSearch
}) => {
  const providers: Array<{ id: string; label: string }> = [
    { id: 'auto', label: 'Auto (Best Match)' },
    { id: 'musicbrainz', label: 'MusicBrainz' },
    { id: 'discogs', label: 'Discogs' }
  ];

  return (
    <div className={styles.searchBar}>
      <span
        className="material-symbols-rounded"
        style={{ color: 'var(--text-color-dimmed)', fontSize: '20px' }}
      >
        search
      </span>
      <input
        type="text"
        placeholder="Album / Title..."
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className={styles.searchInput}
      />
      <input
        type="text"
        placeholder="Artist..."
        value={artist}
        onChange={(e) => onArtistChange(e.target.value)}
        className={styles.searchInput}
        style={{ width: '180px', flex: 'none' }}
      />

      <div className={styles.providerPillGroup}>
        {providers.map((p) => {
          const isActive = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onProviderChange(p.id)}
              className={`${styles.providerPill} ${isActive ? styles.activeProviderPill : ''}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <button onClick={onSearch} disabled={loading} className={styles.searchButton}>
        <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
          {loading ? 'sync' : 'auto_fix_high'}
        </span>
        <span>{loading ? 'Searching...' : 'Search'}</span>
      </button>
    </div>
  );
};
