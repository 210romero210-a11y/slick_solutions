import { getProviderEnvConfig } from "../../src/lib/providerConfig.ts";
import type { InspectionRecord } from "./types.ts";

export type QuoteDeliveryStatus = "delivered" | "retrying" | "failed_transient" | "failed_permanent";

export type QuoteDeliveryResult = {
  channel: "web" | "sms" | "email";
  attemptedAt: string;
  deliveredAt: string | null;
  status: QuoteDeliveryStatus;
  message: string;
  providerMessageId: string | null;
  providerAttemptCount: number;
};

const nowIso = () => new Date().toISOString();

export function deliverQuoteWeb(record: InspectionRecord): QuoteDeliveryResult {
  const quoteDollars = ((record.quoteCents ?? 0) / 100).toFixed(2);
  const deliveredAt = nowIso();

  return {
    channel: "web",
    attemptedAt: deliveredAt,
    deliveredAt,
    status: "delivered",
    message: `Quote available in portal for ${record.contact.fullName}: $${quoteDollars}`,
    providerMessageId: null,
    providerAttemptCount: 1,
  };
}

type TwilioMessageResponse = {
  sid: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
};

type ResendEmailResponse = {
  id: string;
};

function parseTransientStatus(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

export async function deliverQuoteSms(record: InspectionRecord): Promise<QuoteDeliveryResult> {
  const config = getProviderEnvConfig();
  const maxAttempts = Number(process.env.TWILIO_MAX_RETRIES ?? "3");
  const attempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 3;
  const quoteDollars = ((record.quoteCents ?? 0) / 100).toFixed(2);
  const attemptedAt = nowIso();
  let lastMessage = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const body = new URLSearchParams({
        To: record.contact.phone,
        From: config.twilioFromPhone,
        Body: `Your quote for inspection ${record.inspectionId} is ready: $${quoteDollars}.`,
      });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );

      if (response.ok) {
        const payload = (await response.json()) as TwilioMessageResponse;
        const deliveredAt = nowIso();

        return {
          channel: "sms",
          attemptedAt,
          deliveredAt,
          status: "delivered",
          message: `SMS delivered via Twilio with status ${payload.status}.`,
          providerMessageId: payload.sid,
          providerAttemptCount: attempt,
        };
      }

      const errorText = await response.text();
      const transientFailure = parseTransientStatus(response.status);
      lastMessage = `Twilio API failure (${response.status}): ${errorText}`;

      if (!transientFailure || attempt === attempts) {
        return {
          channel: "sms",
          attemptedAt,
          deliveredAt: null,
          status: transientFailure ? "failed_transient" : "failed_permanent",
          message: lastMessage,
          providerMessageId: null,
          providerAttemptCount: attempt,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Twilio request error";
      lastMessage = `Twilio request error: ${message}`;

      if (attempt === attempts) {
        return {
          channel: "sms",
          attemptedAt,
          deliveredAt: null,
          status: "failed_transient",
          message: lastMessage,
          providerMessageId: null,
          providerAttemptCount: attempt,
        };
      }
    }
  }

  return {
    channel: "sms",
    attemptedAt,
    deliveredAt: null,
    status: "retrying",
    message: lastMessage || "Retrying SMS delivery.",
    providerMessageId: null,
    providerAttemptCount: attempts,
  };
}

export async function deliverQuoteEmail(record: InspectionRecord): Promise<QuoteDeliveryResult> {
  const config = getProviderEnvConfig();
  const maxAttempts = Number(process.env.RESEND_MAX_RETRIES ?? "3");
  const attempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 3;
  const quoteDollars = ((record.quoteCents ?? 0) / 100).toFixed(2);
  const attemptedAt = nowIso();
  let lastMessage = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.resendSenderIdentity,
          to: [record.contact.email],
          subject: `Your quote for inspection ${record.inspectionId}`,
          text: `Hi ${record.contact.fullName}, your quote is ready: $${quoteDollars}.`,
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as ResendEmailResponse;
        const deliveredAt = nowIso();

        return {
          channel: "email",
          attemptedAt,
          deliveredAt,
          status: "delivered",
          message: "Email delivered via Resend API.",
          providerMessageId: payload.id,
          providerAttemptCount: attempt,
        };
      }

      const errorText = await response.text();
      const transientFailure = parseTransientStatus(response.status);
      lastMessage = `Resend API failure (${response.status}): ${errorText}`;

      if (!transientFailure || attempt === attempts) {
        return {
          channel: "email",
          attemptedAt,
          deliveredAt: null,
          status: transientFailure ? "failed_transient" : "failed_permanent",
          message: lastMessage,
          providerMessageId: null,
          providerAttemptCount: attempt,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Resend request error";
      lastMessage = `Resend request error: ${message}`;

      if (attempt === attempts) {
        return {
          channel: "email",
          attemptedAt,
          deliveredAt: null,
          status: "failed_transient",
          message: lastMessage,
          providerMessageId: null,
          providerAttemptCount: attempt,
        };
      }
    }
  }

  return {
    channel: "email",
    attemptedAt,
    deliveredAt: null,
    status: "retrying",
    message: lastMessage || "Retrying email delivery.",
    providerMessageId: null,
    providerAttemptCount: attempts,
  };
}
