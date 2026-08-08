import React, { useState } from 'react';

export interface TrackTableProps {
  matches: any[];
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>
        Track List ({matches.length} tracks)
      </div>

      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#9CA3AF' }}>
              <th style={{ padding: '10px 12px', width: '40px' }}>✓</th>
              <th style={{ padding: '10px 12px', width: '40px' }}>#</th>
              <th style={{ padding: '10px 12px' }}>Track Title</th>
              <th style={{ padding: '10px 12px' }}>Current</th>
              <th style={{ padding: '10px 12px' }}>Suggested</th>
              <th style={{ padding: '10px 12px', width: '90px' }}>Match</th>
              <th style={{ padding: '10px 12px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m: any, idx: number) => {
              const isSelected = selectedTrackIds.has(m.localSongId);
              const isExpanded = expandedTrackId === m.localSongId;
              const hasDiff = m.fieldDiffs?.some((d: any) => d.status === 'changed' || d.status === 'new');
              const statusColor = hasDiff ? '#FBBF24' : '#34D399';

              return (
                <React.Fragment key={m.localSongId || idx}>
                  <tr
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: isSelected ? 'transparent' : 'rgba(0, 0, 0, 0.2)',
                      opacity: isSelected ? 1 : 0.6,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleTrack(m.localSongId)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px', color: '#9CA3AF' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#FFF' }}>
                      {m.suggestedMetadata?.title || 'Unknown Title'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                      {m.fieldDiffs?.find((d: any) => d.fieldId === 'title')?.oldValue || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: statusColor, fontWeight: 500 }}>
                      {m.suggestedMetadata?.title || '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: `${statusColor}22`,
                          color: statusColor
                        }}
                      >
                        {Math.round((m.confidence ?? 0.9) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => toggleExpand(m.localSongId)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(255, 255, 255, 0.5)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                          {m.fieldDiffs?.map((fd: any) => (
                            <div key={fd.fieldId} style={{ padding: '6px 10px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.04)' }}>
                              <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{fd.fieldName}:</span>{' '}
                              <span style={{ color: fd.status === 'changed' ? '#34D399' : 'rgba(255, 255, 255, 0.7)' }}>
                                {fd.suggestedValue || fd.oldValue || '—'}
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
