import { useState, useEffect } from 'react';

const readBooleanSetting = (key: string, fallback: boolean) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) !== false : fallback;
  } catch {
    return fallback;
  }
};

const readStringSetting = (key: string, fallback: string) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) || fallback : fallback;
  } catch {
    return fallback;
  }
};

export function useSettings() {
  const showThinking = (() => {
    try {
      const stored = localStorage.getItem('blankAI_showThinking');
      return stored ? JSON.parse(stored) !== false : true;
    } catch {
      return true;
    }
  })();

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('blankAI_sidebarWidth');
      return stored ? parseInt(stored, 10) : 300;
    } catch {
      return 300;
    }
  });

  useEffect(() => {
    localStorage.setItem('blankAI_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  const [groupProcessBlocks, setGroupProcessBlocks] = useState(() => readBooleanSetting('blankAI_groupProcessBlocks', true));
  const [collapseProcess, setCollapseProcess] = useState(() => readBooleanSetting('blankAI_collapseProcess', true));
  const [collapseTools, setCollapseTools] = useState(() => readBooleanSetting('blankAI_collapseTools', true));
  const [processDisplayOrder, setProcessDisplayOrder] = useState(() => readStringSetting('blankAI_processDisplayOrder', 'tool-first'));

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('blankAI_collapsedGroups');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('blankAI_collapsedGroups', JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; value?: boolean }>).detail;
      if (detail?.key === 'blankAI_groupProcessBlocks') {
        setGroupProcessBlocks(detail.value !== false);
      } else if (detail?.key === 'blankAI_collapseProcess') {
        setCollapseProcess(detail.value !== false);
      } else if (detail?.key === 'blankAI_collapseTools') {
        setCollapseTools(detail.value !== false);
      } else if (detail?.key === 'blankAI_processDisplayOrder') {
        setProcessDisplayOrder(String(detail.value || 'tool-first'));
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'blankAI_groupProcessBlocks') {
        setGroupProcessBlocks(readBooleanSetting('blankAI_groupProcessBlocks', true));
      } else if (event.key === 'blankAI_collapseProcess') {
        setCollapseProcess(readBooleanSetting('blankAI_collapseProcess', true));
      } else if (event.key === 'blankAI_collapseTools') {
        setCollapseTools(readBooleanSetting('blankAI_collapseTools', true));
      } else if (event.key === 'blankAI_processDisplayOrder') {
        setProcessDisplayOrder(readStringSetting('blankAI_processDisplayOrder', 'tool-first'));
      }
    };

    window.addEventListener('blankAI-settings-change', handleSettingsChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('blankAI-settings-change', handleSettingsChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return {
    showThinking,
    sidebarWidth,
    setSidebarWidth,
    groupProcessBlocks,
    collapseProcess,
    collapseTools,
    processDisplayOrder,
    collapsedGroups,
    toggleGroupCollapse
  };
}
