/**
 * Minimal Meta Graph API client for the WhatsApp Cloud API.
 * Version is pinned (Meta silently falls back on expired versions);
 * change GRAPH_API_VERSION deliberately after reading Meta's changelog.
 */

export const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v26.0";
const BASE = "https://graph.facebook.com";

export type GraphError = { message: string; code?: number; type?: string; error_subcode?: number };

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public status?: number,
    public subcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export type FetchLike = typeof fetch;

export async function graphRequest<T>(
  path: string,
  token: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; query?: Record<string, string> } = {},
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const url = new URL(`${BASE}/${GRAPH_API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetchImpl(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error body
  }

  if (!res.ok) {
    const err = (json as { error?: GraphError } | null)?.error;
    // Meta puts the useful detail in error_user_msg when present.
    const detail = (err as { error_user_msg?: string } | undefined)?.error_user_msg;
    throw new MetaApiError(detail || err?.message || `Meta API error (HTTP ${res.status})`, err?.code, res.status, err?.error_subcode);
  }
  return json as T;
}
