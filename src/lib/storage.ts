import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

const BUCKET = "orbit-media";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
export const IMAGE_TYPES = ["image/jpeg", "image/png"];

export function checkImage(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose a picture";
  if (!IMAGE_TYPES.includes(file.type)) return "Pictures must be JPG or PNG";
  if (file.size > MAX_IMAGE_BYTES) return "Pictures must be under 4 MB";
  return null;
}

/** Stores a picture publicly (WhatsApp fetches it by link when sending). Returns its public URL. */
export async function storePublicImage(businessId: string, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${businessId}/${randomUUID()}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (error) throw new Error(`Couldn't store the picture: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
