import React from 'react';

export interface MetadataDiffPanelProps {
  supportedFields?: any[];
  selectedFieldIds: Set<string>;
  onToggleField: (fieldId: string) => void;
  matches: any[];
}

export const MetadataDiffPanel: React.FC<MetadataDiffPanelProps> = ({
  supportedFields: _supportedFields,
  selectedFieldIds,
  onToggleField,
  matches
}) => {
  if (!matches || matches.length === 0) return null;

  // Aggregate field diffs across matches
  const sampleMatch = matches[0];
  const fieldDiffs = sampleMatch?.fieldDiffs || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '4px' }}>
        Selective Metadata Changes
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {fieldDiffs.map((diff: any) => {
          const isSelected = selectedFieldIds.has(diff.fieldId);
          const isChanged = diff.status === 'changed' || diff.status === 'new';

          return (
            <div
              key={diff.fieldId}
              onClick={() => onToggleField(diff.fieldId)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                borderRadius: '8px',
                background: isSelected ? 'rgba(96, 165, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: isSelected ? '1px solid rgba(96, 165, 250, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}} // handled by parent onClick
                style={{ marginTop: '3px', cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    {diff.fieldName}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: isChanged ? 'rgba(59, 130, 246, 0.2)' : 'rgba(156, 163, 175, 0.15)',
                      color: isChanged ? '#60A5FA' : '#9CA3AF'
                    }}
                  >
                    {diff.status}
                  </span>
                </div>

                <div style={{ marginTop: '6px', fontSize: '13px' }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.5)', textDecoration: isChanged ? 'line-through' : 'none' }}>
                    Current: {diff.oldValue || 'None'}
                  </div>
                  {isChanged && (
                    <div style={{ color: '#34D399', fontWeight: 600, marginTop: '2px' }}>
                      Suggested: {diff.suggestedValue || 'None'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
