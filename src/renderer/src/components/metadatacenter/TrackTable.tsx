import React, { useState } from 'react';
import type { WorkflowMatch } from '../../../../common/metadata/preview';
import styles from './MetadataCenter.module.css';

export interface TrackTableProps {
  matches: WorkflowMatch[];
  selectedTrackIds: Set<number>;
  onToggleTrack: (songId: number) => void;
}

export const TrackTable: React.FC<TrackTableProps> = ({ matches, selectedTrackIds, onToggleTrack }) => {
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);

  if (!matches || matches.length === 0) return null;

  const toggleExpand = (songId: number) => {
    setExpandedTrackId((prev) => (prev === songId ? null : songId));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="material-symbols-rounded" style={{ fontSize: '16px', color: '#38BDF8' }}>
          queue_music
        </span>
        <span>Track Match List ({matches.length} Tracks)</span>
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
            <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94A3B8' }}>
              <th style={{ padding: '10px 14px', width: '40px' }}>✓</th>
              <th style={{ padding: '10px 14px', width: '40px' }}>#</th>
              <th style={{ padding: '10px 14px' }}>Track Title</th>
              <th style={{ padding: '10px 14px' }}>Current Value</th>
              <th style={{ padding: '10px 14px' }}>Suggested Value</th>
              <th style={{ padding: '10px 14px', width: '90px' }}>Confidence</th>
              <th style={{ padding: '10px 14px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, idx) => {
              const isSelected = selectedTrackIds.has(m.localSongId);
              const isExpanded = expandedTrackId === m.localSongId;
              const hasDiff = m.fieldDiffs?.some((d) => d.status === 'changed' || d.status === 'new');
              const statusClass = hasDiff ? styles.rowMajorChange : styles.rowUnchanged;
              const statusColor = hasDiff ? '#10B981' : '#64748B';

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
                    <td style={{ padding: '12px 14px', color: '#64748B' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#F8FAFC' }}>
                      {m.suggestedMetadata?.title || 'Unknown Track'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748B' }}>
                      {m.fieldDiffs?.find((d) => d.fieldId === 'title')?.oldValue || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: statusColor, fontWeight: 600 }}>
                      {m.suggestedMetadata?.title || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${statusColor}22`,
                          color: statusColor
                        }}
                      >
                        {Math.round((m.confidence ?? 0.85) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        onClick={() => toggleExpand(m.localSongId)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94A3B8',
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
                      <td colSpan={7} style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', fontSize: '12px' }}>
                          {m.fieldDiffs?.map((fd) => (
                            <div key={fd.fieldId} style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                              <span style={{ color: '#94A3B8', fontWeight: 600 }}>{fd.fieldName}:</span>{' '}
                              <span style={{ color: fd.status === 'changed' ? '#34D399' : '#F1F5F9', fontWeight: fd.status === 'changed' ? 600 : 400 }}>
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
