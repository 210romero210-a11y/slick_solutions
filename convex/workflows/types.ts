import type { AISignalPayload } from "@slick/contracts";

export type InspectionState =
  | "portal_started"
  | "contact_captured"
  | "vin_captured"
  | "photos_uploaded"
  | "agent_damage_triage"
  | "agent_cost_estimate"
  | "quote_ready"
  | "quote_delivered"
  | "report_generated";

export type InspectionEvent = {
  state: InspectionState;
  at: string;
  actor: "customer" | "system" | "agent" | "technician";
  metadata?: Record<string, string | number | boolean | null>;
};

export type ContactCapture = {
  fullName: string;
  email: string;
  phone: string;
};

export type PhotoAsset = {
  id: string;
  label: "front" | "rear" | "left" | "right" | "detail";
  url: string;
  capturedAt: string;
};

export type InspectionRecord = {
  inspectionId: string;
  tenantSlug: string;
  vin: string;
  contact: ContactCapture;
  photos: PhotoAsset[];
  damageSummary?: string;
  difficultyScore?: number;
  quoteCents?: number;
  aiSignal?: AISignalPayload;
  timeline: InspectionEvent[];
};

export type TechnicianProfile = {
  technicianId: string;
  name: string;
  skills: string[];
  schedule: string[];
  location: {
    lat: number;
    lng: number;
  };
  maxDifficulty: number;
};

export type RoutingRequest = {
  jobId: string;
  requiredSkills: string[];
  difficultyScore: number;
  location: {
    lat: number;
    lng: number;
  };
  preferredSlots: string[];
};

export type RoutingAssignment = {
  jobId: string;
  technicianId: string;
  slot: string;
  score: number;
  explanation: string;
};

export type InsuranceReportInput = {
  inspection: InspectionRecord;
  beforePhotos: PhotoAsset[];
  afterPhotos: PhotoAsset[];
  damageClassifications: Array<{
    area: string;
    severity: "minor" | "moderate" | "major";
    category: string;
    confidence: number;
  }>;
  aiConditionNarrative: string;
};

export type InsuranceReportArtifact = {
  fileName: string;
  mimeType: "application/pdf";
  byteLength: number;
  sections: string[];
  generatedAt: string;
  artifactKey: string;
  hash: string;
  templateVersion: string;
  sourceModels: string[];
};

export type InsuranceReportPdfRenderResult = InsuranceReportArtifact & {
  pdfBytes: Uint8Array;
};
