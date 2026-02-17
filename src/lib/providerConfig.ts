type ProviderEnvConfig = {
  stripeSecretKey: string;
  stripeCurrency: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromPhone: string;
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

const PROVIDER_ENV_CONFIG: ProviderEnvConfig = {
  stripeSecretKey: requireEnv("STRIPE_SECRET_KEY"),
  stripeCurrency: process.env.STRIPE_CURRENCY?.toLowerCase() ?? "usd",
  twilioAccountSid: requireEnv("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: requireEnv("TWILIO_AUTH_TOKEN"),
  twilioFromPhone: requireEnv("TWILIO_FROM_PHONE"),
};

export function getProviderEnvConfig(): ProviderEnvConfig {
  return PROVIDER_ENV_CONFIG;
}
