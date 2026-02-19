import assert from "node:assert/strict";
import test from "node:test";

import { deliverQuoteEmail, deliverQuoteSms, type QuoteDeliveryResult } from "./quoteDelivery.ts";
import type { InspectionRecord } from "./types.ts";

const baseInspection: InspectionRecord = {
  inspectionId: "insp_123",
  tenantSlug: "default",
  vin: "1HGCM82633A004352",
  contact: {
    fullName: "Alex Detail",
    email: "alex@example.com",
    phone: "+15555550123",
  },
  quoteCents: 4599,
  photos: [],
  timeline: [],
};

function applyProviderEnv(): void {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.TWILIO_ACCOUNT_SID = "ACXXXXX";
  process.env.TWILIO_AUTH_TOKEN = "twilio-token";
  process.env.TWILIO_FROM_PHONE = "+15550001111";
  process.env.RESEND_API_KEY = "re_test_x";
  process.env.RESEND_SENDER_IDENTITY = "Quotes <quotes@example.com>";
}

test("deliverQuoteSms returns delivered on provider success", async () => {
  applyProviderEnv();
  process.env.TWILIO_MAX_RETRIES = "3";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sid: "SM123", status: "queued", error_code: null, error_message: null }),
    text: async () => "",
  })) as typeof fetch;

  try {
    const result = await deliverQuoteSms(baseInspection);
    assert.equal(result.status, "delivered");
    assert.equal(result.channel, "sms");
    assert.equal(result.providerAttemptCount, 1);
    assert.equal(result.providerMessageId, "SM123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deliverQuoteSms retries transient failures and eventually succeeds", async () => {
  applyProviderEnv();
  process.env.TWILIO_MAX_RETRIES = "3";

  const originalFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = (async () => {
    attempt += 1;
    if (attempt < 3) {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => "temporarily unavailable",
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ sid: "SM999", status: "queued", error_code: null, error_message: null }),
      text: async () => "",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await deliverQuoteSms(baseInspection);
    assert.equal(result.status, "delivered");
    assert.equal(result.providerAttemptCount, 3);
    assert.equal(result.providerMessageId, "SM999");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deliverQuoteEmail classifies permanent failures", async () => {
  applyProviderEnv();
  process.env.RESEND_MAX_RETRIES = "2";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 400,
    json: async () => ({}),
    text: async () => "invalid recipient",
  })) as typeof fetch;

  try {
    const result: QuoteDeliveryResult = await deliverQuoteEmail(baseInspection);
    assert.equal(result.channel, "email");
    assert.equal(result.status, "failed_permanent");
    assert.equal(result.providerAttemptCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deliverQuoteEmail retries transient request errors then fails transiently", async () => {
  applyProviderEnv();
  process.env.RESEND_MAX_RETRIES = "2";

  const originalFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = (async () => {
    attempt += 1;
    throw new Error(`network issue ${attempt}`);
  }) as typeof fetch;

  try {
    const result = await deliverQuoteEmail(baseInspection);
    assert.equal(result.channel, "email");
    assert.equal(result.status, "failed_transient");
    assert.equal(result.providerAttemptCount, 2);
    assert.match(result.message, /Resend request error/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
