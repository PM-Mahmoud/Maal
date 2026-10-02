// Share one pending request between callers that ask for the same data at the
// same moment (e.g. Dashboard + SetupChecklist both loading the profile on
// mount). Nothing is cached once the request settles, so a later call always
// hits the server and sees fresh data after an edit.
export function shareInFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) pending = fn().finally(() => { pending = null; });
    return pending;
  };
}
