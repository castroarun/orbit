import { signOut } from "../actions";

/** Logged in, but not given access to Orbit (e.g. a user of another app sharing the Supabase project). */
export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold text-navy">No access yet</h1>
        <p className="text-sm text-muted">This account isn&apos;t set up for Orbit. Ask AS Groups to add you.</p>
        <form action={signOut}>
          <button className="btn">Sign out</button>
        </form>
      </div>
    </main>
  );
}
