import re

with open("d:/PyriteLab/src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target_start = '                      title="上传文件"'
target_end = "                          <button type=\"button\" onClick={() => runInputMenuAction('selectAll')} className=\"w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left\">"

replacement = """                      title="上传文件"
                  >
                      <Plus size={20} strokeWidth={2} />
                  </button>
                  <input 
                      ref={inputRef}
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onPaste={handlePaste}
                      onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY });
                          inputRef.current?.focus();
                      }}
                      onKeyDown={(e) => {
                          const sendShortcut = (() => {
                              try {
                                  const saved = localStorage.getItem('blankAI_sendShortcut');
                                  return saved ? JSON.parse(saved) : 'enter';
                              } catch {
                                  return 'enter';
                              }
                          })();
                          if (e.key === 'Enter') {
                              if (sendShortcut === 'ctrl-enter') {
                                  if (!e.ctrlKey && !e.metaKey) {
                                      e.preventDefault(); // Stop standard enter submission
                                  }
                              } else {
                                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                      // Allow modifier operations
                                  }
                              }
                          }
                      }}
                      autoComplete="off" 
                      placeholder="Ask anything" 
                      className="w-full bg-transparent py-3.5 pl-12 pr-48 text-gray-800 text-[15px] placeholder:text-gray-400 placeholder:font-light outline-none rounded-3xl"
                  />
                  <button type="submit" className="hidden" />

                  {contextMenu && (
                      <div
                          className="fixed z-[100000] w-40 rounded-xl border border-gray-200 bg-white/95 shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-1.5 text-[13px] text-gray-700 backdrop-blur-md animate-popover-in"
                          style={{ left: contextMenu.x, bottom: window.innerHeight - contextMenu.y, WebkitAppRegion: 'no-drag' } as any}
                          onClick={(e) => e.stopPropagation()}
                      >
                          <button type="button" onClick={() => runInputMenuAction('cut')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Scissors size={14} className="text-gray-400" />
                              <span>剪切</span>
                          </button>
                          <button type="button" onClick={() => runInputMenuAction('copy')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Copy size={14} className="text-gray-400" />
                              <span>复制</span>
                          </button>
                          <button type="button" onClick={() => runInputMenuAction('paste')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Clipboard size={14} className="text-gray-400" />
                              <span>粘贴</span>
                          </button>
                          <div className="my-1 h-px bg-gray-100" />
                          <button type="button" onClick={() => runInputMenuAction('selectAll')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">"""

start_idx = content.find(target_start)
end_idx = content.find(target_end, start_idx)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + replacement + content[end_idx + len(target_end):]
    with open("d:/PyriteLab/src/App.tsx", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Fixed!")
else:
    print("Could not find targets!")
