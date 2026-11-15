import { GRAPH_API_VERSION, MetaApiError, type FetchLike } from "./graph";

/**
 * Meta's Resumable Upload API: gives a handle for a sample picture, which
 * Meta needs when reviewing a template that has a picture heading.
 * 1) start a session on our app  2) send the bytes  3) get back { h: handle }.
 */
export async function uploadSampleToMeta(
  opts: { appId: string; token: string; bytes: ArrayBuffer; fileType: string; fileName: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const base = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
  const start = new URL(`${base}/${opts.appId}/uploads`);
  start.searchParams.set("file_name", opts.fileName);
  start.searchParams.set("file_length", String(opts.bytes.byteLength));
  start.searchParams.set("file_type", opts.fileType);

  const s = await fetchImpl(start, { method: "POST", headers: { Authorization: `OAuth ${opts.token}` } });
  const sj = (await s.json().catch(() => ({}))) as { id?: string; error?: { message: string; code?: number } };
  if (!s.ok || !sj.id) throw new MetaApiError(sj.error?.message ?? "Couldn't start the picture upload to Meta", sj.error?.code, s.status);

  const u = await fetchImpl(`${base}/${sj.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${opts.token}`, file_offset: "0" },
    body: opts.bytes,
  });
  const uj = (await u.json().catch(() => ({}))) as { h?: string; error?: { message: string; code?: number } };
  if (!u.ok || !uj.h) throw new MetaApiError(uj.error?.message ?? "Couldn't upload the picture to Meta", uj.error?.code, u.status);
  return uj.h;
}
