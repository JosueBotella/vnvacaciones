import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — safe to be in frontend code
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushStatus = "idle" | "requesting" | "subscribed" | "denied" | "unsupported" | "no_key";

export function usePushNotifications(sessionToken: string) {
  const [status, setStatus] = useState<PushStatus>("idle");
  const isSupported = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;

  useEffect(() => {
    if (!isSupported) {
      setStatus("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setStatus("no_key");
      return;
    }
    // Check current permission state
    if (Notification.permission === "denied") {
      setStatus("denied");
    } else if (Notification.permission === "granted") {
      // Check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (reg as any).pushManager.getSubscription().then((sub: any) => {
          if (sub) setStatus("subscribed");
        });
      }).catch(() => {});
    }
  }, [isSupported]);

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported || !VAPID_PUBLIC_KEY) return false;
    setStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pushManager = (registration as any).pushManager;
      const subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subJson = (subscription as any).toJSON ? (subscription as any).toJSON() : subscription;
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "savePushToken",
          sessionToken,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
      });

      if (data?.success) {
        setStatus("subscribed");
        return true;
      } else {
        setStatus("idle");
        return false;
      }
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
      setStatus("idle");
      return false;
    }
  };

  return { status, subscribe, isSupported };
}
