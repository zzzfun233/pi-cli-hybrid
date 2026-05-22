interface PromptSettingsTabProps {
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
}

export default function PromptSettingsTab({
  systemPrompt,
  setSystemPrompt,
}: PromptSettingsTabProps) {
  return (
    <div className="flex flex-col gap-6 select-none animate-fadeIn pb-4">
      <div>
        <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-2.5 font-semibold">系统提示词设置</h3>
        <div className="flex flex-col gap-3.5 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h4 className="text-[14px] text-gray-700 font-medium">全局系统提示词 (System Prompt)</h4>
              <p className="text-[12px] text-gray-400">自定义大模型的全局身份与行为指令（留空则使用默认配置）</p>
            </div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="例如：你是一个擅长 React 的资深前端开发工程师..."
              rows={16}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13px] text-gray-700 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors resize-none font-mono leading-relaxed bg-white shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
