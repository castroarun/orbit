/** Shown instantly while a screen loads, so every click gets a response right away. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading…</span>
      <div className="mb-2 h-3 w-40 rounded bg-line" />
      <div className="mb-7 h-6 w-56 rounded bg-line" />
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[104px] p-4">
            <div className="h-3 w-24 rounded bg-line-soft" />
            <div className="mt-3 h-6 w-12 rounded bg-line-soft" />
          </div>
        ))}
      </div>
      <div className="card h-64 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-4 h-4 rounded bg-line-soft" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
