"use client";
import { useState, useEffect, useCallback } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetch<T>(url: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json.data ?? json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);

  return { data, loading, error, refetch };
}

export function useList<T>(
  baseUrl: string,
  params: Record<string, string | number | undefined> = {}
): FetchState<{ items: T[]; meta: { total: number; page: number; totalPages: number; hasNext: boolean; hasPrev: boolean; limit: number } }> & { setPage: (p: number) => void; page: number } {
  const [page, setPage] = useState(1);

  const sp = new URLSearchParams();
  sp.set("page", String(page));
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  });

  const url = `${baseUrl}?${sp.toString()}`;
  const state = useFetch<{ items: T[]; meta: { total: number; page: number; totalPages: number; hasNext: boolean; hasPrev: boolean; limit: number } }>(url, [page, ...Object.values(params)]);

  return { ...state, setPage, page };
}
