import os

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = "    return () => cleanups.forEach(fn => fn());\n  }, []);"
replacement = """    return () => cleanups.forEach(fn => fn());
  }, []);

  useEffect(() => {
    const fetchThinking = async () => {
      const chat = savedChats.find(c => c.id === currentSessionId);
      if (chat?.sessionPath) {
        const api = (window as any).api;
        if (api?.getSessionThinkingLevel) {
          const level = await api.getSessionThinkingLevel(chat.sessionPath);
          if (level) setThinkingLevel(level);
        }
      }
    };
    fetchThinking();
  }, [currentSessionId, savedChats]);"""

content = content.replace(target, replacement)
content = content.replace(target.replace('\n', '\r\n'), replacement.replace('\n', '\r\n'))

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed!")
