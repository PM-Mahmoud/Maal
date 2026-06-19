import { savePushSubscription, removePushSubscription } from "@/lib/notifications.functions";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push-keys";

const SW_PATH = "/radar-push-sw.js";

export function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function getPushStatus(): Promise<"unsupported" | "denied" | "granted" | "default"> {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as any;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Push not supported in this browser.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied");
  const reg = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }
  const json: any = sub.toJSON();
  await savePushSubscription({ data: {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    user_agent: navigator.userAgent.slice(0, 280),
  } } as any);
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription({ data: { endpoint: sub.endpoint } } as any);
    await sub.unsubscribe();
  }
}