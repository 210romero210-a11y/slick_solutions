import { v } from "convex/values";

import { action, mutation } from "../_generated/server";
import { requireTenantAccess } from "../model/tenantGuards";
import { enforceActionRateLimit } from "../model/actionRateLimit";
import {
  vinDecodedProfileValidator,
  vinQuoteResponseValidator,
  vinSignalOverridesValidator,
  vinSignalValidator,
} from "./api";
import { decodeVinProfile } from "./decodeClient";
import { buildEmbeddingText, normalizeVin } from "./normalize";
import { computeVinSignals } from "./rules";

type EmbeddingResponse = {
  embedding?: number[];
};

export const persistDecodedVinProfile = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    vehicleId: v.id("vehicles"),
    vin: v.string(),
    profile: vinDecodedProfileValidator,
    signals: vinSignalValidator,
    embedding: v.array(v.number()),
  },
  returns: v.id("vinProfiles"),
  handler: async (ctx: any, args: any) => {
    const effectiveTenantId = await requireTenantAccess(ctx, args.tenantId);

    const now = Date.now();
    const id = await ctx.db.insert("vinProfiles", {
      tenantId: effectiveTenantId,
      vehicleId: args.vehicleId,
      vin: args.vin,
      profile: args.profile,
      signals: args.signals,
      embedding: args.embedding,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    return id;
  },
});

export const decodeAndPersistVinProfile = action({
  args: {
    tenantId: v.optional(v.id("tenants")),
    vehicleId: v.id("vehicles"),
    vin: v.string(),
    overrides: v.optional(vinSignalOverridesValidator),
    ollamaModel: v.optional(v.string()),
    ollamaEndpoint: v.optional(v.string()),
  },
  returns: vinQuoteResponseValidator,
  handler: async (ctx: any, args: any) => {
    const effectiveTenantId = await requireTenantAccess(ctx, args.tenantId);

    await enforceActionRateLimit(ctx, {
      tenantKey: `${effectiveTenantId}`,
      operation: "vin.decode_and_embed",
      maxRequestsPerWindow: 20,
      windowMs: 60_000,
    });

    const normalizedVin = normalizeVin(args.vin);
    const profile = await decodeVinProfile(normalizedVin);
    const signals = computeVinSignals(profile, args.overrides);

    const ollamaEndpoint = args.ollamaEndpoint ?? "http://127.0.0.1:11434";
    const embeddingModel = args.ollamaModel ?? "nomic-embed-text";

    const embeddingResponse = await fetch(`${ollamaEndpoint}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: embeddingModel,
        prompt: buildEmbeddingText(profile),
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error(
        `Ollama embeddings request failed: ${embeddingResponse.status} ${embeddingResponse.statusText}`,
      );
    }

    const embeddingPayload = (await embeddingResponse.json()) as EmbeddingResponse;
    if (!embeddingPayload.embedding || embeddingPayload.embedding.length === 0) {
      throw new Error("Ollama embeddings response did not include a vector.");
    }

    const profileId = await ctx.runMutation("vin/persistVinProfile:persistDecodedVinProfile", {
      tenantId: effectiveTenantId,
      vehicleId: args.vehicleId,
      vin: normalizedVin,
      profile,
      signals,
      embedding: embeddingPayload.embedding,
    });

    return {
      vin: normalizedVin,
      profile,
      signals,
      profileId,
      embeddingVectorLength: embeddingPayload.embedding.length,
    };
  },
});
