import { InspectionRecord } from "./types";

export type QuoteDeliveryResult = {
  channel: "web" | "sms";
  deliveredAt: string;
  status: "delivered" | "stubbed";
  message: string;
};

const nowIso = () => new Date().toISOString();

export function deliverQuoteWeb(record: InspectionRecord): QuoteDeliveryResult {
  const quoteDollars = ((record.quoteCents ?? 0) / 100).toFixed(2);
  return {
    channel: "web",
    deliveredAt: nowIso(),
    status: "delivered",
    message: `Quote available in portal for ${record.contact.fullName}: $${quoteDollars}`,
  };
}

export function deliverQuoteSmsStub(record: InspectionRecord): QuoteDeliveryResult {
  return {
    channel: "sms",
    deliveredAt: nowIso(),
    status: "stubbed",
    message: `SMS queued for ${record.contact.phone} but Twilio integration is intentionally deferred.`,
  };
}
