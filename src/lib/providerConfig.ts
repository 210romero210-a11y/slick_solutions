type ProviderEnvConfig = {
  stripeSecretKey: string;
  stripeCurrency: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromPhone: string;
  resendApiKey: string;
  resendSenderIdentity: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[config] Missing required environment variable ${name}. ` +
        "Set it in your deployment environment before starting the app.",
    );
  }

  return value;
}

function validateSenderIdentity(value: string): string {
  const senderIdentity = value.trim();
  const senderEmailMatch = senderIdentity.match(/<([^>]+)>$/);
  const candidateEmail = (senderEmailMatch?.[1] ?? senderIdentity).trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail);

  if (!validEmail) {
    throw new Error(
      `[config] Invalid RESEND_SENDER_IDENTITY value "${senderIdentity}". ` +
        "Use an email or display-name format (e.g. \"Quotes <quotes@yourdomain.com>\").",
    );
  }

  return senderIdentity;
}

export function getProviderEnvConfig(): ProviderEnvConfig {
  return {
    stripeSecretKey: requireEnv("STRIPE_SECRET_KEY"),
    stripeCurrency: process.env.STRIPE_CURRENCY?.toLowerCase() ?? "usd",
    twilioAccountSid: requireEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: requireEnv("TWILIO_AUTH_TOKEN"),
    twilioFromPhone: requireEnv("TWILIO_FROM_PHONE"),
    resendApiKey: requireEnv("RESEND_API_KEY"),
    resendSenderIdentity: validateSenderIdentity(requireEnv("RESEND_SENDER_IDENTITY")),
  };
}
