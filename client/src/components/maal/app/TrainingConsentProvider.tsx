import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getTrainingConsent, setTrainingConsent, type TrainingConsent } from "@/lib/privacy.functions";

type ConsentState = {
  consent: TrainingConsent | null;
  loading: boolean;
  saving: boolean;
  save: (granted: boolean, source: "notice" | "settings") => Promise<boolean>;
};
const TrainingConsentContext = createContext<ConsentState | null>(null);

export function TrainingConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<TrainingConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    getTrainingConsent().catch(() => null).then((current) => {
      if (active) {
        setConsent(current);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  async function save(granted: boolean, source: "notice" | "settings") {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    try {
      const next = await setTrainingConsent(granted, source);
      if (!next) return false;
      setConsent(next);
      return true;
    } catch {
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <TrainingConsentContext.Provider value={{ consent, loading, saving, save }}>{children}</TrainingConsentContext.Provider>;
}

export function useTrainingConsent() {
  const context = useContext(TrainingConsentContext);
  if (!context) throw new Error("Training consent settings require the app shell.");
  return context;
}
