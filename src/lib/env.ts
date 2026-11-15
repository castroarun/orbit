/** Server-side settings. See .env.example for what each one is. */

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name} (see .env.example)`);
  return v;
}

export const env = {
  supabaseUrl: () => need("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => need("SUPABASE_SECRET_KEY"),

  // Meta app (one for Orbit) and the test sandbox
  metaAppSecret: () => need("META_APP_SECRET"),
  metaAppId: () => need("META_APP_ID"),
  metaVerifyToken: () => need("META_WEBHOOK_VERIFY_TOKEN"),
  sandbox: () => ({
    accessToken: process.env.META_SANDBOX_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.META_SANDBOX_PHONE_NUMBER_ID ?? "",
    wabaId: process.env.META_SANDBOX_WABA_ID ?? "",
  }),

  legalName: () => process.env.NEXT_PUBLIC_LEGAL_NAME || "[Legal business name]",
  contactEmail: () => process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[contact email]",
  contactAddress: () => process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "[registered address]",
};
