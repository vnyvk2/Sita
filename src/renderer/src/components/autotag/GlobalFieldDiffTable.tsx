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
        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-color-dimmed)', textTransform: 'uppercase' }}>
          Global / Album Metadata Changes
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={onSelectAll}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-color-dimmed)',
              fontSize: '0.72rem',
              cursor: 'pointer'
            }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onSelectChanged}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-color-dimmed)',
              fontSize: '0.72rem',
              cursor: 'pointer'
            }}
          >
            Select Changed
          </button>
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-color-dimmed)',
              fontSize: '0.72rem',
              cursor: 'pointer'
            }}
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Diff Table */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-color-dimmed)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ width: '36px', padding: '8px 12px', textAlign: 'center' }}></th>
              <th style={{ width: '130px', padding: '8px 12px' }}>FIELD</th>
              <th style={{ padding: '8px 12px' }}>CURRENT (LOCAL)</th>
              <th style={{ width: '24px', padding: '8px 0', textAlign: 'center' }}></th>
              <th style={{ padding: '8px 12px' }}>SUGGESTED (REMOTE)</th>
              <th style={{ width: '90px', padding: '8px 12px', textAlign: 'right' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((diff, idx) => {
              const isSelected = selectedFields.has(diff.fieldId);
              const statusColor =
                diff.status === 'changed'
                  ? '#f59e0b'
                  : diff.status === 'new'
                  ? '#10b981'
                  : 'var(--text-color-dimmed)';
              const statusBg =
                diff.status === 'changed'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : diff.status === 'new'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(255, 255, 255, 0.04)';

              return (
                <tr
                  key={diff.fieldId}
                  onClick={() => onToggleField(diff.fieldId)}
                  style={{
                    borderBottom: idx < diffs.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  {/* Checkbox */}
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
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
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-color-white)' }}>
                    {diff.fieldName}
                  </td>

                  {/* Current Local Value */}
                  <td style={{ padding: '8px 12px', color: 'var(--text-color-dimmed)' }}>
                    {diff.oldValue}
                  </td>

                  {/* Arrow */}
                  <td style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-color-dimmed)', opacity: 0.6 }}>
                    →
                  </td>

                  {/* Suggested Remote Value */}
                  <td style={{ padding: '8px 12px', color: isSelected ? 'var(--text-color-white)' : 'var(--text-color-dimmed)', fontWeight: diff.isChanged ? 600 : 400 }}>
                    {diff.suggestedValue}
                  </td>

                  {/* Status Badge */}
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
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
