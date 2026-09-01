import React from 'react';

import type { WorkflowType } from '../../hooks/useMetadataWorkflow';

import styles from './MetadataCenter.module.css';

export interface WorkflowTabsProps {
  activeTab: WorkflowType;
  onTabChange: (tab: WorkflowType) => void;
}

export const WorkflowTabs: React.FC<WorkflowTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs: Array<{ id: WorkflowType; label: string; icon: string }> = [
    { id: 'album', label: 'Album', icon: 'album' },
    { id: 'track', label: 'Track', icon: 'audiotrack' },
    { id: 'genre', label: 'Genre & Style', icon: 'label' },
    { id: 'artwork', label: 'Artwork', icon: 'image' }
  ];

  return (
    <div className={styles.tabsContainer}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`${styles.tabButton} ${isActive ? styles.activeTab : ''}`}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
