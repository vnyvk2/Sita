import React from 'react';
import type { GlobalFieldDiff } from '../../hooks/useAlbumAutoTag';

export interface GlobalFieldDiffTableProps {
  diffs: GlobalFieldDiff[];
  selectedFields: Set<string>;
  onToggleField: (fieldId: string) => void;
  onSelectAll: () => void;
  onSelectChanged: () => void;
  onClear: () => void;
}

export const GlobalFieldDiffTable: React.FC<GlobalFieldDiffTableProps> = ({
  diffs,
  selectedFields,
  onToggleField,
  onSelectAll,
  onSelectChanged,
  onClear
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section Header & Bulk Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', textTransform: 'uppercase' }}>
          Global / Album Metadata Changes
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={onSelectAll}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#CBD5E1',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onSelectChanged}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#CBD5E1',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Select Changed
          </button>
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94A3B8',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Diff Table */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.6)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ width: '36px', padding: '10px 12px', textAlign: 'center' }}></th>
              <th style={{ width: '140px', padding: '10px 12px' }}>FIELD</th>
              <th style={{ padding: '10px 12px' }}>CURRENT (LOCAL)</th>
              <th style={{ width: '24px', padding: '10px 0', textAlign: 'center' }}></th>
              <th style={{ padding: '10px 12px' }}>SUGGESTED (REMOTE)</th>
              <th style={{ width: '100px', padding: '10px 12px', textAlign: 'right' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((diff, idx) => {
              const isSelected = selectedFields.has(diff.fieldId);
              const statusColor =
                diff.status === 'changed'
                  ? '#F59E0B'
                  : diff.status === 'new'
                  ? '#10B981'
                  : '#94A3B8';
              const statusBg =
                diff.status === 'changed'
                  ? 'rgba(245, 158, 11, 0.2)'
                  : diff.status === 'new'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(255, 255, 255, 0.06)';

              return (
                <tr
                  key={diff.fieldId}
                  onClick={() => onToggleField(diff.fieldId)}
                  style={{
                    borderBottom: idx < diffs.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  {/* Checkbox */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleField(diff.fieldId);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>

                  {/* Field Name */}
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#FFFFFF' }}>
                    {diff.fieldName}
                  </td>

                  {/* Current Local Value */}
                  <td style={{ padding: '10px 12px', color: '#94A3B8', fontWeight: 500 }}>
                    {diff.oldValue}
                  </td>

                  {/* Arrow */}
                  <td style={{ padding: '10px 0', textAlign: 'center', color: '#94A3B8', fontWeight: 700 }}>
                    →
                  </td>

                  {/* Suggested Remote Value */}
                  <td style={{ padding: '10px 12px', color: isSelected ? '#FFFFFF' : '#CBD5E1', fontWeight: diff.isChanged ? 700 : 500 }}>
                    {diff.suggestedValue}
                  </td>

                  {/* Status Badge */}
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: statusBg,
                        color: statusColor,
                        border: `1px solid ${statusBg}`
                      }}
                    >
                      {diff.status}
                    </span>
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
