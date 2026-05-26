import React, { useRef } from 'react';
import { Pencil, Plug2, Plus, Sparkles, Trash2, FileUp, FolderUp } from 'lucide-react';
import { Field, FormActions, Toggle } from './settingsShared';
import { type McpServer, type Skill, genId } from '../../types/settingsTypes';

export function SkillList({ skills, setSkills, onEdit, onAdd, onDelete }: {
  skills: Skill[]; setSkills: React.Dispatch<React.SetStateAction<Skill[]>>;
  onEdit: (s: Skill) => void; onAdd: () => void; onDelete: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, isFolder: boolean) => {
    const files = e.target.files;
    if (!files) return;
    const newSkills: Skill[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isFolder && !file.name.endsWith('.txt') && !file.name.endsWith('.md') && !file.type.startsWith('text/')) {
        continue;
      }
      try {
        const text = await file.text();
        newSkills.push({
          id: genId(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          description: isFolder ? (file.webkitRelativePath || '') : '',
          content: text,
          enabled: true,
        });
      } catch (err) {
        console.error("Failed to read file", err);
      }
    }
    if (newSkills.length > 0) {
      setSkills(prev => [...prev, ...newSkills]);
    }
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] text-gray-400 uppercase tracking-wider select-none">Skills</h3>
        <div className="flex items-center gap-2">
          <input type="file" multiple accept=".txt,.md,text/*" className="hidden" ref={fileInputRef} onChange={e => handleImport(e, false)} />
          <input type="file" className="hidden" ref={folderInputRef} onChange={e => handleImport(e, true)} {...{webkitdirectory: 'true', directory: 'true'} as any} />
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all" title="Import Files">
            <FileUp size={16} />
          </button>
          <button onClick={() => folderInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all" title="Import Folder">
            <FolderUp size={16} />
          </button>
          <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all ml-1">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      {skills.length === 0 ? (
        <div className="text-center py-16 text-gray-300 text-[14px] select-none">No skills configured yet</div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map(skill => (
            <div key={skill.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[14px] font-medium text-gray-700 truncate">{skill.name}</span>
                </div>
                {skill.description && <p className="text-[12px] text-gray-400 mt-0.5 ml-[22px] truncate">{skill.description}</p>}
              </div>
              <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                <button onClick={() => onEdit(skill)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-all"><Pencil size={14} /></button>
                <button onClick={() => onDelete(skill.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                <Toggle on={skill.enabled} onToggle={() => setSkills(p => p.map(s => s.id === skill.id ? {...s, enabled: !s.enabled} : s))} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SkillForm({ skill, onChange, onSave, onCancel, isNew }: {
  skill: Skill; onChange: (s: Skill) => void; onSave: (s: Skill) => void; onCancel: () => void; isNew: boolean;
}) {
  return (
    <div>
      <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-4 select-none">{isNew ? 'New Skill' : 'Edit Skill'}</h3>
      <div className="flex flex-col gap-4">
        <Field label="Name" placeholder="e.g. Code Review Assistant" value={skill.name} onChange={v => onChange({...skill, name: v})} />
        <Field label="Description" placeholder="Brief description" value={skill.description} onChange={v => onChange({...skill, description: v})} />
        <div>
          <label className="text-[12px] text-gray-500 mb-1.5 block select-none">Skill Instructions</label>
          <textarea
            value={skill.content}
            onChange={e => onChange({...skill, content: e.target.value})}
            placeholder="Enter the skill instructions or system prompt..."
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors resize-none font-mono leading-relaxed"
          />
        </div>
        <FormActions onCancel={onCancel} onSave={() => { if (skill.name.trim()) onSave(skill); }} disabled={!skill.name.trim()} />
      </div>
    </div>
  );
}

export function McpList({ servers, setServers, onEdit, onAdd, onDelete }: {
  servers: McpServer[]; setServers: React.Dispatch<React.SetStateAction<McpServer[]>>;
  onEdit: (s: McpServer) => void; onAdd: () => void; onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] text-gray-400 uppercase tracking-wider select-none">自定义工具 (MCP Servers)</h3>
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all">
          <Plus size={14} /> Add
        </button>
      </div>
      {servers.length === 0 ? (
        <div className="text-center py-16 text-gray-300 text-[14px] select-none">No MCP servers configured yet</div>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map(server => (
            <div key={server.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Plug2 size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[14px] font-medium text-gray-700 truncate">{server.name}</span>
                </div>
                <p className="text-[12px] text-gray-400 mt-0.5 ml-[22px] truncate font-mono">{server.command} {server.args.join(' ')}</p>
              </div>
              <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                <button onClick={() => onEdit(server)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-all"><Pencil size={14} /></button>
                <button onClick={() => onDelete(server.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                <Toggle on={server.enabled} onToggle={() => setServers(p => p.map(s => s.id === server.id ? {...s, enabled: !s.enabled} : s))} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function McpForm({ server, onChange, onSave, onCancel, isNew }: {
  server: McpServer; onChange: (s: McpServer) => void; onSave: (s: McpServer) => void; onCancel: () => void; isNew: boolean;
}) {
  const argsText = server.args.join('\n');
  const envText = Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n');

  return (
    <div>
      <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-4 select-none">{isNew ? 'New Custom Tool (MCP Server)' : 'Edit Custom Tool (MCP Server)'}</h3>
      <div className="flex flex-col gap-4">
        <Field label="Name" placeholder="e.g. filesystem" value={server.name} onChange={v => onChange({...server, name: v})} />
        <Field label="Command" placeholder="e.g. npx, node, python" value={server.command} onChange={v => onChange({...server, command: v})} />
        <div>
          <label className="text-[12px] text-gray-500 mb-1.5 block select-none">Arguments <span className="text-gray-300">(one per line)</span></label>
          <textarea
            value={argsText}
            onChange={e => onChange({...server, args: e.target.value.split('\n').filter(Boolean)})}
            placeholder={"-y\n@anthropic/mcp-server-filesystem\n/path/to/dir"}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors resize-none font-mono leading-relaxed"
          />
        </div>
        <div>
          <label className="text-[12px] text-gray-500 mb-1.5 block select-none">Environment Variables <span className="text-gray-300">(KEY=VALUE per line)</span></label>
          <textarea
            value={envText}
            onChange={e => {
              const env: Record<string, string> = {};
              e.target.value.split('\n').forEach(line => {
                const idx = line.indexOf('=');
                if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
              });
              onChange({...server, env});
            }}
            placeholder={"API_KEY=xxx\nDEBUG=true"}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors resize-none font-mono leading-relaxed"
          />
        </div>
        <FormActions onCancel={onCancel} onSave={() => { if (server.name.trim() && server.command.trim()) onSave(server); }} disabled={!server.name.trim() || !server.command.trim()} />
      </div>
    </div>
  );
}
