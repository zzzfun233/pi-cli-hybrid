import { useState, useEffect, useRef } from 'react';
import type { WorkspaceInfo } from '../types/types';

export function useWorkspace() {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceInfo | null>(() => {
    try {
      const stored = localStorage.getItem('blankAI_currentWorkspace');
      if (stored) {
        const workspace = JSON.parse(stored);
        if (workspace?.path && workspace?.name) return workspace;
      }
    } catch (e) {
      console.error('Failed to parse blankAI_currentWorkspace on init:', e);
    }
    return null;
  });

  const currentWorkspaceRef = useRef<WorkspaceInfo | null>(currentWorkspace);

  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
    try {
      if (currentWorkspace) {
        localStorage.setItem('blankAI_currentWorkspace', JSON.stringify(currentWorkspace));
      } else {
        localStorage.removeItem('blankAI_currentWorkspace');
      }
    } catch (e) {
      console.error('Failed to persist current workspace:', e);
    }
  }, [currentWorkspace]);

  const selectWorkspaceFolder = async () => {
    const api = (window as any).api;
    if (!api?.selectWorkspaceFolder) return null;

    const workspace = await api.selectWorkspaceFolder();
    if (workspace?.path) {
      setCurrentWorkspace(workspace);
    }
    return workspace;
  };

  return {
    currentWorkspace,
    setCurrentWorkspace,
    currentWorkspaceRef,
    selectWorkspaceFolder
  };
}
