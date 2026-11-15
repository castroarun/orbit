import Link from "next/link";

/** Success / error banner driven by ?ok= / ?error= / ?link= in the URL. */
export function Notice({ ok, error, link }: { ok?: string; error?: string; link?: string }) {
  if (error) return <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (ok === "sent")
    return (
      <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        ✓ Message sent.{" "}
        <Link href="/messages" className="font-medium underline">
          See it in Messages
        </Link>
      </div>
    );
  if (ok) return <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</div>;
  if (link)
    return (
      <div className="mb-6 rounded-xl border border-gold bg-gold-soft px-4 py-3 text-sm text-navy">
        One-tap mode: <a href={link} target="_blank" rel="noreferrer" className="font-semibold underline">open WhatsApp and press send</a>
      </div>
    );
  return null;
}

export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
