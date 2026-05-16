import { useEffect, useRef } from 'react';
import { type GPSPosition } from './useGPS';
import { type Checkpoint } from '../api';

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeofence(
  position: GPSPosition | null,
  checkpoints: Checkpoint[],
  triggeredIds: Set<string>,
  onTrigger: (checkpoint: Checkpoint) => void
) {
  const lastTriggeredRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!position) return;

    for (const cp of checkpoints) {
      if (triggeredIds.has(cp.id)) continue;
      const now = Date.now();
      const lastTrigger = lastTriggeredRef.current.get(cp.id) || 0;
      if (now - lastTrigger < 30000) continue; // 30s cooldown

      const dist = haversineDistance(position.lat, position.lng, cp.lat, cp.lng);
      if (dist <= cp.radius) {
        lastTriggeredRef.current.set(cp.id, now);
        onTrigger(cp);
      }
    }
  }, [position, checkpoints, triggeredIds, onTrigger]);
}
