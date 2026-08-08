import React from 'react';
import type { WorkflowType } from '../../hooks/useMetadataWorkflow';

export interface WorkflowTabsProps {
  activeTab: WorkflowType;
  onTabChange: (tab: WorkflowType) => void;
}

export const WorkflowTabs: React.FC<WorkflowTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs: Array<{ id: WorkflowType; label: string; icon: string; disabled?: boolean }> = [
    { id: 'album', label: 'Album', icon: '💿' },
    { id: 'track', label: 'Track', icon: '🎵' },
    { id: 'genre', label: 'Genre & Style', icon: '🏷️' },
    { id: 'artwork', label: 'Artwork', icon: '🖼️' }
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '0 16px',
        background: 'rgba(0, 0, 0, 0.2)'
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#60A5FA' : 'rgba(255, 255, 255, 0.7)',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #60A5FA' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
