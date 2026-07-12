import { useEffect, useState } from "react";
import { X, Brain } from "lucide-react";
import { getAdvisorMemory, saveAdvisorMemory, clearAdvisorMemory } from "@/lib/advisor-memory.functions";

/** Modal to view/edit custom instructions and inspect/clear synthesized memory. */
export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [instructions, setInstructions] = useState("");
  const [memory, setMemory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdvisorMemory().then((m) => {
      setInstructions(m.customInstructions);
      setMemory(m.memory);
      setLoading(false);
    });
  }, []);

  async function save() {
    await saveAdvisorMemory({ customInstructions: instructions.slice(0, 500), memory });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function forget() {
    await clearAdvisorMemory();
    setMemory("");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[16px] border border-border bg-[var(--surface)] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="size-4" />
            <h3 className="text-[15px] font-bold tracking-display">Memory &amp; instructions</h3>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="size-4 text-muted-foreground hover:text-foreground" /></button>
        </div>

        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : (
          <>
            <label className="block text-[12px] font-semibold mb-1.5">Custom instructions</label>
            <p className="text-[11px] text-muted-foreground mb-2">How Maal should respond — tone, focus, format. Applied to every answer.</p>
            <textarea
              value={instructions}
              maxLength={500}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Keep answers short and always show the working behind any number."
              className="w-full h-24 rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right mb-4">{instructions.length}/500</p>

            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-semibold">What Maal remembers about you</label>
              {memory && <button onClick={forget} className="text-[11px] text-muted-foreground hover:text-red-500">Forget everything</button>}
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">Learned from your chats. You can edit or clear it. Never stores account numbers or balances.</p>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="Nothing yet — Maal builds this as you chat."
              className="w-full h-32 rounded-[10px] border border-border bg-background px-3 py-2 text-[12px] font-mono outline-none focus:border-foreground/40 resize-none"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              {saved && <span className="text-[12px] text-mint">Saved</span>}
              <button onClick={onClose} className="px-3 py-2 rounded-[10px] border border-border text-[13px] font-medium hover:border-foreground/40">Close</button>
              <button onClick={save} className="px-4 py-2 rounded-[10px] bg-foreground text-background text-[13px] font-semibold hover:opacity-90">Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
