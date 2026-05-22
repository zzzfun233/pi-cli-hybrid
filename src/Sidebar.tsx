import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, MoreVertical, PanelLeft, Pencil, Pin, Plus, Search, Settings, Share2, Sparkles, Trash2 } from 'lucide-react';
import type { ChatGroup, ChatSession } from './types';
import { getRelativeTime } from './chatUtils';

interface ChatMenuState {
  chatId: string;
  x: number;
  y: number;
}

interface SidebarProps {
  isOpen: boolean;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  searchQuery: string;
  chatGroups: ChatGroup[];
  collapsedGroups: Record<string, boolean>;
  currentSessionId: string | null;
  chatMenu: ChatMenuState | null;
  savedChats: ChatSession[];
  onToggleSidebar: (show: boolean) => void;
  onStartNewChat: () => void;
  onSelectWorkspaceFolder: () => void;
  onSearchChange: (value: string) => void;
  onToggleGroup: (key: string) => void;
  onLoadChat: (id: string) => void;
  onOpenChatMenu: (menu: ChatMenuState) => void;
  onOpenSettings: () => void;
  onRenameChat: (chat: ChatSession) => void;
  onTogglePinChat: (chat: ChatSession) => void;
  onShareChat: (chat: ChatSession) => void;
  onDeleteChat: (id: string) => void;
}

export default function Sidebar({
  isOpen,
  sidebarWidth,
  onSidebarWidthChange,
  searchQuery,
  chatGroups,
  collapsedGroups,
  currentSessionId,
  chatMenu,
  savedChats,
  onToggleSidebar,
  onStartNewChat,
  onSelectWorkspaceFolder,
  onSearchChange,
  onToggleGroup,
  onLoadChat,
  onOpenChatMenu,
  onOpenSettings,
  onRenameChat,
  onTogglePinChat,
  onShareChat,
  onDeleteChat,
}: SidebarProps) {
  const menuChat = chatMenu ? savedChats.find(chat => chat.id === chatMenu.chatId) : null;

  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(() => setIsResizing(true), []);

  useEffect(() => {
    if (!isResizing) return;
    
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = e.clientX;
      if (newWidth > 600) newWidth = 600;
      onSidebarWidthChange(newWidth);
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      setIsResizing(false);
      if (e.clientX < 150) {
        onToggleSidebar(false);
        onSidebarWidthChange(300); // Reset to default when collapsed
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizing, onSidebarWidthChange, onToggleSidebar]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/5 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => onToggleSidebar(false)}
      />

      <div
        className={`fixed md:relative top-0 left-0 h-full bg-[#fcfcfd] z-[10000] shadow-2xl md:shadow-none border-r border-gray-200/60 flex flex-col ${
          isResizing ? 'transition-none' : 'transform transition-all duration-300'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ 
          width: sidebarWidth,
          ...(isOpen ? {} : { marginLeft: `calc(${sidebarWidth}px * -1)` })
        } as React.CSSProperties}
      >
        {/* Resize Handle */}
        <div 
          className="absolute right-0 top-0 w-[5px] h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-[10010] transition-colors"
          onMouseDown={startResizing}
        />

        <div className="px-5 pt-5 pb-3 flex flex-col gap-5">
          <div className="flex justify-between items-center px-0.5">
            <div className="flex items-center gap-2.5 select-none pl-0.5">
              <div className="flex items-center justify-center w-[34px] h-[34px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden">
                <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg" alt="Chrome" className="w-[24px] h-[24px]" draggable="false" />
              </div>
              <span className="text-[22px] leading-none font-bold text-gray-800 tracking-tight">Chrome</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWorkspaceFolder();
                }}
                className="text-gray-400 hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
                title="打开文件夹/工作区"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <FolderOpen size={18} strokeWidth={1.8} />
              </button>
              <button
                onClick={() => onToggleSidebar(false)}
                className="text-gray-400 hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
                title="收起侧边栏"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <PanelLeft size={19} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <button onClick={onStartNewChat} className="flex items-center justify-center gap-2.5 h-10 rounded-xl bg-white border border-gray-200/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[14.5px] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all group cursor-pointer">
            <Plus size={18} strokeWidth={2.2} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            <span>开启新对话</span>
          </button>

          <div className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-xl bg-gray-100/80 border border-transparent focus-within:border-blue-500/30 focus-within:bg-white focus-within:shadow-[0_2px_8px_rgba(59,130,246,0.08)] focus-within:ring-2 focus-within:ring-blue-500/10 transition-all group mt-1">
            <Search size={16} strokeWidth={2} className="text-gray-400 group-focus-within:text-blue-500 shrink-0" />
            <input
              type="text"
              placeholder="搜索历史"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-[13.5px] text-gray-800 placeholder:text-gray-400 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-5">
          {chatGroups.length === 0 ? (
            <span className="px-2 text-[13px] text-gray-400">
              {searchQuery ? '无匹配记录' : '暂无记录'}
            </span>
          ) : (
            chatGroups.map((group) => {
              const isCollapsed = !!collapsedGroups[group.key];
              return (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div
                    onClick={() => onToggleGroup(group.key)}
                    className="flex items-center justify-between text-[11.5px] font-semibold text-gray-400/80 select-none cursor-pointer pt-4 pb-1.5 px-3 tracking-wider group"
                  >
                    <div className="flex items-center gap-1.5 truncate flex-1">
                      <span className="truncate">{group.name}</span>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {isCollapsed ? (
                        <ChevronRight size={14} className="text-gray-400" strokeWidth={2} />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" strokeWidth={2} />
                      )}
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-0.5">
                      {group.chats.length === 0 ? (
                        <span className="text-[13px] text-gray-400/70 pl-2 py-1 select-none">暂无对话</span>
                      ) : (
                        group.chats.map((chat) => (
                          <div
                            key={chat.id}
                            onClick={() => onLoadChat(chat.id)}
                            className={`relative flex items-center justify-between group rounded-lg pl-3 pr-2 py-2.5 transition-all cursor-pointer ${
                              currentSessionId === chat.id
                                ? 'bg-black/[0.04] text-gray-950'
                                : 'text-gray-800 hover:bg-black/[0.03] hover:text-gray-950'
                            }`}
                          >
                            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                              <div className="min-w-0 flex items-center gap-2 flex-1">
                                {chat.pinned && <Pin size={14} className="text-blue-500 shrink-0" strokeWidth={2.2} />}
                                <div className={`text-[15px] truncate ${currentSessionId === chat.id ? 'font-medium text-black' : 'font-normal text-gray-800'}`}>
                                  {chat.preview}
                                </div>
                              </div>
                              {chat.workspaceName && (
                                <div className="shrink-0 max-w-[85px] truncate text-[11.5px] text-gray-400 transition-opacity duration-200 md:group-hover:opacity-0" title={chat.workspaceName}>
                                  {chat.workspaceName}
                                </div>
                              )}
                            </div>
                            
                            {/* 更多按钮 - 绝对定位悬浮在右侧 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (chatMenu && chatMenu.chatId === chat.id) {
                                  onOpenChatMenu(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  onOpenChatMenu({ chatId: chat.id, x: rect.right - 190, y: rect.bottom + 6 });
                                }
                              }}
                              className="absolute right-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center bg-gray-100/90 hover:bg-gray-200/90 text-gray-500 hover:text-gray-900 shadow-sm backdrop-blur-sm"
                              title="更多"
                            >
                              <MoreVertical size={15} strokeWidth={2} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {menuChat && chatMenu && (
          <div
            className="fixed z-[100000] w-[190px] rounded-2xl border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] p-2 text-[15px] text-gray-800 animate-popover-in"
            style={{ left: Math.max(12, chatMenu.x), top: chatMenu.y, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => onRenameChat(menuChat)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors text-left">
              <Pencil size={18} strokeWidth={2} className="text-gray-700" />
              <span>重命名</span>
            </button>
            <button type="button" onClick={() => onTogglePinChat(menuChat)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors text-left">
              <Pin size={18} strokeWidth={2} className="text-gray-700" />
              <span>{menuChat.pinned ? '取消置顶' : '置顶'}</span>
            </button>
            <button type="button" onClick={() => onShareChat(menuChat)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors text-left">
              <Share2 size={18} strokeWidth={2} className="text-gray-700" />
              <span>分享</span>
            </button>
            <div className="my-1 h-px bg-gray-100" />
            <button type="button" onClick={() => onDeleteChat(menuChat.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors text-left">
              <Trash2 size={18} strokeWidth={2} />
              <span>删除</span>
            </button>
          </div>
        )}

        <div className="px-3 pb-3 pt-1">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] transition-all group cursor-pointer w-full"
          >
            <Settings size={16} strokeWidth={2} className="text-gray-400 group-hover:text-gray-800 transition-colors" />
            <span>设置</span>
          </button>
        </div>
      </div>
    </>
  );
}
