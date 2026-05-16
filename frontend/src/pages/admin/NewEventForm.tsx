import { useState } from 'react';
import { createEvent, type Event } from '../../api';

interface Props {
  onCreated: (ev: Event) => void;
  onCancel: () => void;
}

export default function NewEventForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name) { setError('Zadejte název eventu'); return; }
    setLoading(true);
    try {
      const ev = await createEvent(name, date);
      if (ev.error) { setError(ev.error); return; }
      onCreated(ev);
    } catch {
      setError('Chyba při vytváření eventu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4" style={{ background: '#1a1a2e' }}>
      <div className="max-w-sm mx-auto">
        <button onClick={onCancel} className="text-gray-400 mb-6 flex items-center gap-1">
          ← Zpět
        </button>
        <h2 className="text-2xl font-bold mb-6" style={{ color: '#4ecca3' }}>Nový event</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Název eventu</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Spring Rally 2026"
              className="w-full px-4 py-4 rounded-xl text-white"
              style={{ background: '#16213e', border: '2px solid #0f3460' }}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Datum</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-4 rounded-xl text-white"
              style={{ background: '#16213e', border: '2px solid #0f3460' }}
            />
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-lg"
            style={{ background: '#4ecca3', color: '#1a1a2e', minHeight: '64px' }}
          >
            {loading ? 'Vytvářím...' : 'Vytvořit event'}
          </button>
        </div>
      </div>
    </div>
  );
}
