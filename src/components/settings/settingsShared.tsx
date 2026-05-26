export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${on ? 'bg-gray-800' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block select-none">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors"
      />
    </div>
  );
}

export function FormActions({ onCancel, onSave, disabled }: { onCancel: () => void; onSave: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-2 justify-end pt-2">
      <button onClick={onCancel} className="px-4 py-2 text-[13px] text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-50 transition-all">Cancel</button>
      <button onClick={onSave} disabled={disabled} className="px-4 py-2 text-[13px] bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-all disabled:opacity-30 disabled:pointer-events-none">Save</button>
    </div>
  );
}
