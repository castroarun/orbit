import { env } from "@/lib/env";

export const metadata = { title: "Privacy policy", robots: { index: true } };

// DRAFT: to be reviewed by our advocate partner before publishing on the final domain.
export default function PrivacyPage() {
  const name = env.legalName();
  const email = env.contactEmail();
  const address = env.contactAddress();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-7">
      <h1 className="text-3xl font-semibold text-navy">Privacy policy</h1>
      <p className="hint mt-2">Last updated: 14 November 2026</p>

      <section className="mt-8 space-y-4">
        <p>
          {name} (&quot;we&quot;) runs our own software platform, which we use to help local businesses ask their customers for Google
          reviews, send messages their customers have agreed to receive on WhatsApp, and report results to the business owner.
          This policy explains what personal data the platform handles and how.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">Who is responsible</h2>
        <p>
          Each business that uses our platform decides which of its customers to contact and why; for those customers the business is
          the data fiduciary (controller) and we process data on its behalf. For the business owners and staff who log in to
          the platform, we are responsible for their account data.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">What we collect</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Customer name, WhatsApp number, preferred language, and when and how they gave consent.</li>
          <li>Visit or purchase dates recorded by the business, and amounts where the business provides them.</li>
          <li>Messages sent to and received from customers on the business&apos;s WhatsApp number, and delivery status.</li>
          <li>When a customer taps a review link we sent (time and browser type). We do not learn whether they posted a review.</li>
          <li>Public Google review data for the business (rating, review count, review text and reviewer name as shown by Google).</li>
          <li>For business users: name, email address and login activity.</li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold text-navy">How we use it</h2>
        <p>
          Only to provide the service to the business: sending messages the customer agreed to, asking for feedback and
          reviews, alerting the owner to complaints, and producing reports. We do not sell personal data, use it for our own
          marketing, or share it with other businesses.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">WhatsApp and Meta</h2>
        <p>
          Messages are sent through the WhatsApp Business Platform operated by Meta Platforms, from the business&apos;s own
          WhatsApp account. Meta processes message data under its own terms and privacy policy. A customer can reply
          &quot;STOP&quot; or &quot;வேண்டாம்&quot; at any time; all further messages from that business through our platform stop at once.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">Service providers</h2>
        <p>
          We store data with our hosting and database providers (currently Vercel and Supabase, with the database in India
          where available) and use an AI service to sort incoming replies and draft review responses for the owner to approve.
          These providers act only on our instructions.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">How long we keep it</h2>
        <p>
          For as long as the business uses our platform, plus up to 90 days after it stops, unless the law requires longer. Customers
          who opt out are kept only as a &quot;do not message&quot; entry.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">Your choices and data deletion</h2>
        <p>
          Customers can ask the business, or us at <a className="underline" href={`mailto:${email}`}>{email}</a>, to see,
          correct or delete their data. Send the WhatsApp number concerned; we confirm and delete within 30 days and tell you
          when it is done. Business users can ask us to close their account the same way.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">Security</h2>
        <p>
          Access is limited by role: each business sees only its own customers. Data is encrypted in transit, and access
          tokens for WhatsApp are stored only on our servers.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-navy">Contact</h2>
        <p>
          {name}, {address}. Email: <a className="underline" href={`mailto:${email}`}>{email}</a>
        </p>
      </section>
    </main>
  );
}
