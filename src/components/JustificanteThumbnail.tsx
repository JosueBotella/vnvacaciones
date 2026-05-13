import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ImageIcon, Loader2 } from "lucide-react";

// Global cache for signed URLs (valid for 1 hour, we cache for 50 min)
export const urlCache = new Map<string, { url: string; timestamp: number }>();
export const CACHE_TTL = 50 * 60 * 1000; // 50 minutes
const STORAGE_KEY = "justificante_url_cache";

// Load cache from localStorage on init
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as Array<[string, { url: string; timestamp: number }]>;
    const now = Date.now();
    parsed.forEach(([key, value]) => {
      // Only restore if not expired
      if (now - value.timestamp < CACHE_TTL) {
        urlCache.set(key, value);
      }
    });
  }
} catch (e) {
  // Ignore localStorage errors
}

// Save cache to localStorage (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveCache() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const entries = Array.from(urlCache.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      // Ignore localStorage errors
    }
  }, 500);
}

// Helper to get cached URL if available
export function getCachedUrl(filePath: string): string | null {
  const cached = urlCache.get(filePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }
  return null;
}

// Helper to set cached URL
export function setCachedUrl(filePath: string, url: string) {
  urlCache.set(filePath, { url, timestamp: Date.now() });
  saveCache();
}

// Pending requests to avoid duplicate calls
const pendingRequests = new Map<string, Promise<string | null>>();

// Concurrency control
const MAX_CONCURRENT = 4;
let activeRequests = 0;
const requestQueue: (() => void)[] = [];

function processQueue() {
  while (activeRequests < MAX_CONCURRENT && requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) next();
  }
}

async function getSignedUrl(filePath: string): Promise<string | null> {
  // Check cache first
  const cached = urlCache.get(filePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }

  // Check if request is already pending
  const pending = pendingRequests.get(filePath);
  if (pending) {
    return pending;
  }

  // Create new request with concurrency control
  const request = new Promise<string | null>((resolve) => {
    const execute = async () => {
      activeRequests++;
      try {
        const { data } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "getFileUrl",
            data: { filePath }
          }
        });

        if (data?.success && data.url) {
          setCachedUrl(filePath, data.url);
          resolve(data.url);
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error("Error getting signed URL:", err);
        resolve(null);
      } finally {
        activeRequests--;
        pendingRequests.delete(filePath);
        processQueue();
      }
    };

    if (activeRequests < MAX_CONCURRENT) {
      execute();
    } else {
      requestQueue.push(execute);
    }
  });

  pendingRequests.set(filePath, request);
  return request;
}

type JustificanteThumbnailProps = {
  archivoUrl: string;
  archivoTipo: string;
  archivoNombre: string;
  onClick?: () => void;
  loadPriority?: number; // Lower = higher priority (loads first)
};

export const JustificanteThumbnail = ({
  archivoUrl,
  archivoTipo,
  archivoNombre,
  onClick,
  loadPriority = 0,
}: JustificanteThumbnailProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const mountedRef = useRef(true);

  const isImage = archivoTipo.startsWith("image/");
  const isPdf = archivoTipo === "application/pdf";

  useEffect(() => {
    mountedRef.current = true;
    
    if (!isImage) {
      setLoading(false);
      return;
    }

    // Check cache immediately for instant display
    const cached = urlCache.get(archivoUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setImageUrl(cached.url);
      setLoading(false);
      return;
    }

    // Stagger loading based on priority (30ms per position)
    const delay = loadPriority * 30;
    
    const timeoutId = setTimeout(async () => {
      const url = await getSignedUrl(archivoUrl);
      if (!mountedRef.current) return;
      
      if (url) {
        setImageUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
    }, delay);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [archivoUrl, isImage, loadPriority]);

  const showSpinner = isImage && (loading || (imageUrl && !imageLoaded && !error));

  return (
    <div
      className="w-10 h-10 rounded overflow-hidden bg-muted/50 flex items-center justify-center cursor-pointer hover:ring-2 ring-primary/50 transition-all shrink-0"
      onClick={onClick}
      title={archivoNombre}
    >
      {isImage ? (
        <>
          {showSpinner && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute" />
          )}
          {imageUrl && !error ? (
            <img
              src={imageUrl}
              alt={archivoNombre}
              className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setError(true);
                setImageLoaded(false);
              }}
              loading="lazy"
            />
          ) : error ? (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          ) : null}
        </>
      ) : isPdf ? (
        <FileText className="h-5 w-5 text-red-500" />
      ) : (
        <FileText className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
};
