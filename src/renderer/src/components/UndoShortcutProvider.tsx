import React from 'react';
import { useUndoRedo } from '../hooks/collections/useUndoRedo';

export const UndoShortcutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Mount the global keyboard listener
  useUndoRedo();
  
  return <>{children}</>;
};
