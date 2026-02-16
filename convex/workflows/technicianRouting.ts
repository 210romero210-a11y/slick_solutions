import { RoutingAssignment, RoutingRequest, TechnicianProfile } from "./types";

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(
  source: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number {
  const dLat = toRadians(destination.lat - source.lat);
  const dLng = toRadians(destination.lng - source.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(source.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function skillMatchRatio(requiredSkills: string[], technicianSkills: string[]): number {
  if (requiredSkills.length === 0) return 1;
  const matched = requiredSkills.filter((skill) => technicianSkills.includes(skill)).length;
  return matched / requiredSkills.length;
}

function scheduleFit(preferredSlots: string[], schedule: string[]): string | null {
  for (const preferred of preferredSlots) {
    if (schedule.includes(preferred)) return preferred;
  }
  return schedule[0] ?? null;
}

export function assignTechnician(
  request: RoutingRequest,
  technicians: TechnicianProfile[],
): RoutingAssignment | null {
  let best: RoutingAssignment | null = null;

  for (const tech of technicians) {
    const slot = scheduleFit(request.preferredSlots, tech.schedule);
    if (!slot) continue;
    if (tech.maxDifficulty < request.difficultyScore) continue;

    const distanceKm = haversineDistanceKm(request.location, tech.location);
    const skillRatio = skillMatchRatio(request.requiredSkills, tech.skills);
    const difficultyHeadroom = Math.max(0, tech.maxDifficulty - request.difficultyScore) / 100;

    const score =
      skillRatio * 0.5 +
      Math.max(0, 1 - distanceKm / 50) * 0.3 +
      difficultyHeadroom * 0.2;

    if (!best || score > best.score) {
      best = {
        jobId: request.jobId,
        technicianId: tech.technicianId,
        slot,
        score,
        explanation: `skill=${skillRatio.toFixed(2)},distanceKm=${distanceKm.toFixed(
          1,
        )},headroom=${difficultyHeadroom.toFixed(2)}`,
      };
    }
  }

  return best;
}
