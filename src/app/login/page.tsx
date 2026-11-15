import { signIn, signInWithGoogle } from "../actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gold">AS Groups · Digital Marketing</div>
          <h1 className="mt-1 text-2xl font-semibold text-navy">Orbit</h1>
        </div>
        {error ? <p className="text-sm text-red-600">{String(error)}</p> : null}
        <form action={signInWithGoogle}>
          <button className="btn w-full">Continue with Google</button>
        </form>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or with a password <span className="h-px flex-1 bg-line" />
        </div>
        <form action={signIn} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button className="btn-gold w-full">Sign in</button>
        </form>
      </div>
    </main>
  );
}
