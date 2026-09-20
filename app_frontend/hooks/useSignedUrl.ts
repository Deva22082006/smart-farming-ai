import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface SignedUrlResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generates a short-lived signed URL for an object in the "leaf-images" bucket.
 * Returns null url + no error if imagePath is null (→ show placeholder).
 */
export function useSignedUrl(
  imagePath: string | null,
  expirySeconds = 300,
): SignedUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!imagePath);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const cleanPath = imagePath.startsWith('leaf-images/')
      ? imagePath.replace('leaf-images/', '')
      : imagePath;

    supabase.storage
      .from('leaf-images')
      .createSignedUrl(cleanPath, expirySeconds)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setUrl(null);
        } else {
          setUrl(data?.signedUrl ?? null);
          setError(null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [imagePath, expirySeconds]);

  return { url, loading, error };
}
