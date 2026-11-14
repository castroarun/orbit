import { env } from "@/lib/env";

export const metadata = { title: "Terms of service", robots: { index: true } };

// DRAFT: to be reviewed by our advocate partner before publishing on the final domain.
export default function TermsPage() {
  const name = env.legalName();
  const email = env.contactEmail();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-7">
      <h1 className="text-3xl font-semibold text-navy">Terms of service</h1>
      <p className="hint mt-2">Last updated: 14 November 2026</p>

      <section className="mt-8 space-y-4">
        <p>
          These terms cover use of the software platform operated by {name} for the local businesses we work with. The commercial
          terms of each engagement (plan, price, duration) are in the business&apos;s signed agreement with us.
        </p>
        <h2 className="pt-4 text-xl font-semibold text-navy">The business&apos;s responsibilities</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Only add customers who have agreed to receive messages, and record how they agreed.</li>
          <li>Keep its WhatsApp, Google and social accounts in its own name, and follow WhatsApp&apos;s and Google&apos;s policies.</li>
          <li>Approve anything published in its name (posts, offers, review replies) before it goes out.</li>
          <li>Pay Meta&apos;s WhatsApp message fees, which are charged at cost.</li>
        </ul>
        <h2 className="pt-4 text-xl font-semibold text-navy">How the platform works</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Every customer who is asked for a review gets the same review link, whatever they said. We never filter who is asked.</li>
          <li>No messages are sent between 8 pm and 9 am, and a customer who replies STOP is never messaged again.</li>
        </ul>
        <h2 className="pt-4 text-xl font-semibold text-navy">What we don&apos;t do</h2>
        <p>
          We do not guarantee sales, rankings or review numbers, and we do not give legal or tax advice. We do not own the
          business&apos;s accounts or its customer list.
        </p>
        <h2 className="pt-4 text-xl font-semibold text-navy">Contact</h2>
        <p>
          <a className="underline" href={`mailto:${email}`}>{email}</a>
        </p>
      </section>
    </main>
  );
}
