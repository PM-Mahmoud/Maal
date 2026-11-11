// Model-training consent (Tier 3 PR 1, spec D4). Server: /api/v1/privacy/training-consent.
export type TrainingConsent = {
  policyVersion: string;
  general: { granted: boolean; updatedAt: string | null; needsNotice: boolean };
  cdr: { granted: boolean };
};

export async function getTrainingConsent(): Promise<TrainingConsent | null> {
  const r = await fetch('/api/v1/privacy/training-consent', { credentials: 'include' });
  return r.ok ? r.json() : null;
}

export async function setTrainingConsent(
  granted: boolean,
  source: 'settings' | 'notice' = 'settings',
): Promise<TrainingConsent | null> {
  const r = await fetch('/api/v1/privacy/training-consent', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ granted, source }),
  });
  return r.ok ? r.json() : null;
}
