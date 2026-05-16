import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type Checkpoint, recordPassage } from '../../api';
import { playBeep, vibrate } from '../../utils/audio';
import { useGPS } from '../../hooks/useGPS';
import { useGeofence } from '../../hooks/useGeofence';
import { savePendingPassage, loadPendingPassages, clearPendingPassages } from '../../utils/storage';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const playerIcon = new L.DivIcon({
  html: '<div style="width:18px;height:18px;background:#4ecca3;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(78,204,163,0.8)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
});

const checkpointDoneIcon = new L.DivIcon({
  html: '<div style="width:24px;height:24px;background:#22c55e;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px">✓</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
});

const checkpointIcon = new L.DivIcon({
  html: '<div style="width:24px;height:24px;background:#f59e0b;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px">!</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
});

function MapFollow({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  session: {
    eventId: string;
    competitorId: string;
    competitorCode: string;
    competitorName: string;
    competitorNumber: string;
  };
  checkpoints: Checkpoint[];
  onFinish?: () => void;
}

interface CheckpointDialogState {
  checkpoint: Checkpoint;
  countdown: number;
}

export default function RacingScreen({ session, checkpoints }: Props) {
  const { position, error: gpsError } = useGPS();
  const [triggeredIds, setTriggeredIds] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<CheckpointDialogState | null>(null);
  const [passages, setPassages] = useState<{ checkpointId: string; action: string; timestamp: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync pending passages on mount
  useEffect(() => {
    const pending = loadPendingPassages();
    if (pending.length > 0) {
      setSyncing(true);
      Promise.all(
        pending.map(p => recordPassage(p.competitorId, p.checkpointId, p.action, p.competitorCode, p.timestamp))
      ).then(() => {
        clearPendingPassages();
        setSyncing(false);
      }).catch(() => setSyncing(false));
    }
  }, []);

  const openDialog = useCallback((cp: Checkpoint) => {
    playBeep(880, 300);
    vibrate([200, 100, 200]);
    setDialog({ checkpoint: cp, countdown: 15 });
  }, []);

  useGeofence(position, checkpoints, triggeredIds, openDialog);

  // Countdown
  useEffect(() => {
    if (!dialog) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setDialog(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(countdownRef.current!);
          handleAction(prev.checkpoint, 'ignored');
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [dialog?.checkpoint.id]);

  const handleAction = useCallback(async (cp: Checkpoint, action: 'recorded' | 'ignored') => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setDialog(null);
    setTriggeredIds(prev => new Set([...prev, cp.id]));
    const timestamp = new Date().toISOString();
    setPassages(prev => [...prev, { checkpointId: cp.id, action, timestamp }]);

    try {
      await recordPassage(session.competitorId, cp.id, action, session.competitorCode, timestamp);
    } catch {
      savePendingPassage({
        competitorId: session.competitorId,
        checkpointId: cp.id,
        action,
        competitorCode: session.competitorCode,
        timestamp,
      });
    }
  }, [session]);

  const defaultCenter: [number, number] = position
    ? [position.lat, position.lng]
    : [49.2, 17.7];

  const recordedCount = passages.filter(p => p.action === 'recorded').length;

  return (
    <div className="relative" style={{ height: '100dvh', background: '#1a1a2e' }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(22,33,62,0.95)', backdropFilter: 'blur(8px)' }}>
        <div>
          <div className="font-bold" style={{ color: '#4ecca3' }}>
            {session.competitorName} <span className="text-white">#{session.competitorNumber}</span>
          </div>
          <div className="text-xs text-gray-400">
            {gpsError ? `⚠ ${gpsError}` : position ? `GPS ±${Math.round(position.accuracy)}m` : '📡 Hledám GPS...'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: '#4ecca3' }}>
            {recordedCount} / {checkpoints.length}
          </div>
          <div className="text-xs text-gray-400">checkpointů</div>
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={defaultCenter}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />

        {/* Checkpoints */}
        {checkpoints.map(cp => (
          <div key={cp.id}>
            <Circle
              center={[cp.lat, cp.lng]}
              radius={cp.radius}
              pathOptions={{
                color: triggeredIds.has(cp.id) ? '#22c55e' : '#f59e0b',
                fillColor: triggeredIds.has(cp.id) ? '#22c55e' : '#f59e0b',
                fillOpacity: 0.2,
              }}
            />
            <Marker
              position={[cp.lat, cp.lng]}
              icon={triggeredIds.has(cp.id) ? checkpointDoneIcon : checkpointIcon}
            >
              <Popup>
                <div style={{ color: '#1a1a2e' }}>
                  <strong>{cp.name}</strong>
                  <br />
                  Radius: {cp.radius}m
                  {triggeredIds.has(cp.id) && <><br /><span style={{ color: '#22c55e' }}>✓ Splněno</span></>}
                </div>
              </Popup>
            </Marker>
          </div>
        ))}

        {/* Player position */}
        {position && (
          <>
            <Marker position={[position.lat, position.lng]} icon={playerIcon} />
            <Circle
              center={[position.lat, position.lng]}
              radius={position.accuracy}
              pathOptions={{ color: '#4ecca3', fillColor: '#4ecca3', fillOpacity: 0.1, weight: 1 }}
            />
            <MapFollow lat={position.lat} lng={position.lng} />
          </>
        )}
      </MapContainer>

      {/* Syncing indicator */}
      {syncing && (
        <div className="absolute bottom-4 left-4 right-4 z-50 px-4 py-2 rounded-lg text-sm text-center"
          style={{ background: 'rgba(15,52,96,0.9)' }}>
          🔄 Synchronizuji offline záznamy...
        </div>
      )}

      {/* Checkpoint Dialog */}
      {dialog && (
        <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.92)' }}>
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="text-6xl">📍</div>
            <div>
              <div className="text-sm text-gray-400 uppercase tracking-wider">KONTROLNÍ BOD</div>
              <div className="text-4xl font-bold text-white mt-1">{dialog.checkpoint.name}</div>
            </div>
            <div className="text-gray-400">
              Auto-ignorovat za <span style={{ color: '#f59e0b' }} className="text-2xl font-bold">{dialog.countdown}s</span>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => handleAction(dialog.checkpoint, 'recorded')}
                className="w-full rounded-2xl font-bold text-xl"
                style={{ background: '#4ecca3', color: '#1a1a2e', minHeight: '72px' }}
              >
                ✅ ZAZNAMENAT
              </button>
              <button
                onClick={() => handleAction(dialog.checkpoint, 'ignored')}
                className="w-full rounded-2xl font-bold text-xl"
                style={{ background: '#374151', color: '#fff', minHeight: '72px' }}
              >
                ❌ IGNOROVAT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
