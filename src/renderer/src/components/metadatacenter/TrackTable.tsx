import React, { useState } from 'react';
import type { WorkflowMatch } from '../../../../common/metadata/preview';
import styles from './MetadataCenter.module.css';

export type TrackFilter = 'all' | 'changed' | 'conflicts' | 'perfect';

export interface TrackTableProps {
  matches: WorkflowMatch[];
  selectedTrackIds: Set<number>;
  onToggleTrack: (songId: number) => void;
}

export const TrackTable: React.FC<TrackTableProps> = ({ matches, selectedTrackIds, onToggleTrack }) => {
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);
  const [filter, setFilter] = useState<TrackFilter>('all');

  if (!matches || matches.length === 0) return null;

  const toggleExpand = (songId: number) => {
    setExpandedTrackId((prev) => (prev === songId ? null : songId));
  };

  // Calculate filter counts
  const changedMatches = matches.filter((m) => m.fieldDiffs?.some((d) => d.status === 'changed' || d.status === 'new'));
  const perfectMatches = matches.filter((m) => !m.fieldDiffs?.some((d) => d.status === 'changed' || d.status === 'new'));
  const conflictMatches = matches.filter((m) => (m.confidence ?? 0.85) < 0.7);

  const filteredMatches = matches.filter((m) => {
    const hasDiff = m.fieldDiffs?.some((d) => d.status === 'changed' || d.status === 'new');
    const isConflict = (m.confidence ?? 0.85) < 0.7;
    if (filter === 'changed') return hasDiff;
    if (filter === 'perfect') return !hasDiff;
    if (filter === 'conflicts') return isConflict;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header & Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '16px', color: 'var(--text-color-highlight)' }}>
            queue_music
          </span>
          <span>Track Match List ({matches.length} Tracks)</span>
        </div>

        {/* Filter Pills */}
        <div className={styles.filterPillGroup}>
          <button
            onClick={() => setFilter('all')}
            className={`${styles.filterPill} ${filter === 'all' ? styles.activeFilterPill : ''}`}
          >
            All ({matches.length})
          </button>
          <button
            onClick={() => setFilter('changed')}
            className={`${styles.filterPill} ${filter === 'changed' ? styles.activeFilterPill : ''}`}
          >
            Changed ({changedMatches.length})
          </button>
          <button
            onClick={() => setFilter('perfect')}
            className={`${styles.filterPill} ${filter === 'perfect' ? styles.activeFilterPill : ''}`}
          >
            Perfect ({perfectMatches.length})
          </button>
          {conflictMatches.length > 0 && (
            <button
              onClick={() => setFilter('conflicts')}
              className={`${styles.filterPill} ${filter === 'conflicts' ? styles.activeFilterPill : ''}`}
              style={{ color: 'var(--text-color-crimson)' }}
            >
              Conflicts ({conflictMatches.length})
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.4)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-color-dimmed)' }}>
              <th style={{ padding: '10px 14px', width: '40px' }}>✓</th>
              <th style={{ padding: '10px 14px', width: '40px' }}>#</th>
              <th style={{ padding: '10px 14px' }}>Track Title</th>
              <th style={{ padding: '10px 14px' }}>Suggested Value</th>
              <th style={{ padding: '10px 14px', width: '120px' }}>Status</th>
              <th style={{ padding: '10px 14px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredMatches.map((m, idx) => {
              const isSelected = selectedTrackIds.has(m.localSongId);
              const isExpanded = expandedTrackId === m.localSongId;
              const hasDiff = m.fieldDiffs?.some((d) => d.status === 'changed' || d.status === 'new');
              const isConflict = (m.confidence ?? 0.85) < 0.7;

              let statusLabel = 'Perfect match';
              let statusColor = '#10B981';
              let statusClass = styles.rowUnchanged;

              if (isConflict) {
                statusLabel = 'Conflict';
                statusColor = 'var(--text-color-crimson)';
              } else if (hasDiff) {
                statusLabel = 'Minor rename';
                statusColor = '#F59E0B';
                statusClass = styles.rowMinorChange;
              }

              return (
                <React.Fragment key={m.localSongId || idx}>
                  <tr
                    className={statusClass}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      opacity: isSelected ? 1 : 0.5,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleTrack(m.localSongId)}
                        style={{ cursor: 'pointer', accentColor: '#10B981' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-color-dimmed)' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-color)' }}>
                      {m.suggestedMetadata?.title || 'Unknown Track'}
                    </td>
                    <td style={{ padding: '12px 14px', color: statusColor, fontWeight: 600 }}>
                      {m.suggestedMetadata?.title || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: `${statusColor}22`,
                          color: statusColor,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>●</span>
                        <span>{statusLabel}</span>
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        onClick={() => toggleExpand(m.localSongId)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-color-dimmed)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr style={{ background: 'rgba(15, 23, 42, 0.7)' }}>
                      <td colSpan={6} style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
                          {m.fieldDiffs?.map((fd) => (
                            <div key={fd.fieldId} style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                              <span style={{ color: 'var(--text-color-dimmed)', fontWeight: 600 }}>{fd.fieldName}:</span>{' '}
                              <span style={{ color: fd.status === 'changed' ? '#34D399' : 'var(--text-color)', fontWeight: fd.status === 'changed' ? 600 : 400 }}>
                                {fd.suggestedValue !== undefined ? String(fd.suggestedValue) : String(fd.oldValue ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
