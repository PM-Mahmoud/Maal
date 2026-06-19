// VAPID public key is safe to expose to the browser — it's the public half of the keypair.
export const VAPID_PUBLIC_KEY =
  "BNn0vZAgKedwI4nRKUEWHNFuVz4pjmJ_7fi_BlOq-_ygw2pKJIb9W4mEE5QCowLO6B3ncXCz4m6-BVIChcFaPg0";
export const VAPID_SUBJECT = "mailto:hello@maal.app";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}