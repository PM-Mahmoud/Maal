import { useEffect, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { listWidgets, removeWidget, type WidgetSpec } from "@/lib/widgets.functions";
import { WidgetRenderer } from "@/components/maal/WidgetRenderer";

/** Widgets the user saved from Ask Maal, re-rendered live from their data. */
export function SavedWidgets() {
  const [widgets, setWidgets] = useState<WidgetSpec[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listWidgets().then((w) => { setWidgets(w); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  async function onRemove(id?: number) {
    if (!id) return;
    // Optimistic remove; restore (at the original position) if the server
    // delete fails so the UI never claims a widget is gone when it isn't.
    const idx = widgets.findIndex((w) => w.id === id);
    const removed = idx >= 0 ? widgets[idx] : undefined;
    setWidgets((ws) => ws.filter((w) => w.id !== id));
    try {
      await removeWidget(id);
    } catch {
      if (removed) setWidgets((ws) => {
        const next = [...ws];
        next.splice(Math.min(idx, next.length), 0, removed);
        return next;
      });
    }
  }

  // Hide the section entirely until we know there's something to show.
  if (!loaded || widgets.length === 0) return null;

  return (
    <section className="mh-page" style={{ paddingTop: 0 }} aria-labelledby="mh-saved-label">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="size-4 mh-muted" aria-hidden />
        <h2 id="mh-saved-label" className="mh-card-label m-0 font-normal">Saved from Ask Maal</h2>
        <Link to="/app/advisor" className="ml-auto mh-small mh-muted hover:underline">Open Ask Maal →</Link>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {widgets.map((w) => (
          <WidgetRenderer
            key={w.id}
            widget={w}
            action={
              <button onClick={() => onRemove(w.id)} aria-label="Remove widget" className="mh-close">
                <X className="size-3.5" />
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}
