import { useState, useEffect } from 'react';
import type { ModelInfo } from '../types/types';

export function useModels(currentSessionPath: string | null | undefined) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<string>('high');
  const [popoverView, setPopoverView] = useState<'main' | 'models'>('main');

  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    const fetchModels = () => {
      if (api.getAvailableModels) {
        api.getAvailableModels().then((models: ModelInfo[]) => {
          if (models.length > 0) setModels(models);
        }).catch((e: unknown) => {
          console.error('Failed to fetch models:', e);
        });
      }
    };
    fetchModels();

    const handleProvidersUpdated = () => fetchModels();
    window.addEventListener('providers-updated', handleProvidersUpdated);
    cleanups.push(() => window.removeEventListener('providers-updated', handleProvidersUpdated));

    if (api.onSessionModelChange) {
      const unsub = api.onSessionModelChange((data: { id: string; provider: string }) => {
        const newModel: ModelInfo = { id: data.id, name: data.id, provider: data.provider };
        setCurrentModel(newModel);
      });
      cleanups.push(unsub);
    }

    if (api.onSessionThinkingLevelChange) {
      const unsub = api.onSessionThinkingLevelChange((data: { thinkingLevel: string }) => {
        if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      });
      cleanups.push(unsub);
    }

    return () => cleanups.forEach(fn => fn());
  }, []);

  useEffect(() => {
    const fetchThinking = async () => {
      if (currentSessionPath) {
        const api = (window as any).api;
        if (api?.getSessionThinkingLevel) {
          const level = await api.getSessionThinkingLevel(currentSessionPath);
          if (level) setThinkingLevel(level);
        }
      }
    };
    fetchThinking();
  }, [currentSessionPath]);

  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-selector-container')) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModelDropdownOpen]);

  return {
    models,
    currentModel,
    setCurrentModel,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    thinkingLevel,
    setThinkingLevel,
    popoverView,
    setPopoverView
  };
}
