import type { VinDecodedProfile, VinSignalOverrides, VinSignals } from "./types";

export type VinQuoteRequest = {
  tenantId: string;
  vehicleId: string;
  vin: string;
  overrides?: VinSignalOverrides;
  ollamaModel?: string;
  ollamaEndpoint?: string;
};

export type VinQuoteResponse = {
  vin: string;
  profile: VinDecodedProfile;
  signals: VinSignals;
  profileId: string;
  embeddingVectorLength: number;
};

export type DecodeVinRequest = { vin: string };
export type DecodeVinResponse = VinDecodedProfile;
