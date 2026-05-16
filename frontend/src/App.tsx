import { useState, useEffect } from 'react';
import CompetitorApp from './pages/competitor/CompetitorApp';
import AdminApp from './pages/admin/AdminApp';

export default function App() {
  const [route, setRoute] = useState<'competitor' | 'admin'>('competitor');

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) {
      setRoute('admin');
    }
  }, []);

  if (route === 'admin') return <AdminApp />;
  return <CompetitorApp />;
}
