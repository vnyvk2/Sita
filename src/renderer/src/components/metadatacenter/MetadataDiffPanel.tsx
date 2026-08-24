import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MetadataFieldDiff } from '../../../../common/metadata/types';
import styles from './MetadataCenter.module.css';

export interface MetadataDiffPanelProps {
  fieldDiffs: MetadataFieldDiff[];
  selectedFieldIds: Set<string>;
  onToggleField: (fieldId: string) => void;
}

export const MetadataDiffPanel: React.FC<MetadataDiffPanelProps> = ({
  fieldDiffs,
  selectedFieldIds,
  onToggleField
}) => {
  const { t } = useTranslation();
  if (!fieldDiffs || fieldDiffs.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="material-symbols-rounded" style={{ fontSize: '16px', color: 'var(--text-color-highlight)' }}>
          tune
        </span>
        <span>Selective Field Changes ({fieldDiffs.filter((d) => selectedFieldIds.has(d.fieldId)).length} Selected)</span>
      </div>

      <div className={styles.diffGrid}>
        {fieldDiffs.map((diff) => {
          const isSelected = selectedFieldIds.has(diff.fieldId);
          const isChanged = diff.status === 'changed' || diff.status === 'new';

          return (
            <label
              key={diff.fieldId}
              className={`${styles.diffCard} ${isSelected ? styles.selectedDiffCard : ''}`}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleField(diff.fieldId)}
                style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#10B981' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-color-dimmed)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {diff.fieldName}
                    </span>
                    {diff.fieldId === 'style' && (
                      <span style={{ fontSize: '10px', color: 'var(--text-color-dimmed)', fontStyle: 'italic', fontWeight: 500, textTransform: 'none' }}>
                        · {t('common.addedToGenres', 'Added to Genres')}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: isChanged ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                      color: isChanged ? '#34D399' : 'var(--text-color-dimmed)'
                    }}
                  >
                    {diff.status}
                  </span>
                </div>

                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  <div style={{ color: 'var(--text-color-dimmed)', textDecoration: isChanged ? 'line-through' : 'none' }}>
                    Current: {diff.oldValue !== undefined && diff.oldValue !== '' ? String(diff.oldValue) : 'None'}
                  </div>
                  {isChanged && (
                    <div style={{ color: '#34D399', fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                        arrow_forward
                      </span>
                      <span>{diff.suggestedValue !== undefined && diff.suggestedValue !== '' ? String(diff.suggestedValue) : 'None'}</span>
                    </div>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};
