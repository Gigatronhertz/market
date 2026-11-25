'use client';
import { useEffect, useState } from 'react';

// The business the vendor is working on. Shared by every portal page through sessionStorage (VEN-08).
const KEY = 'nmd-vendor-business';

export function useBusiness() {
  const [id, setId] = useState(null);
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(KEY)) || null;
    setId(saved);
  }, []);
  const choose = (value) => {
    sessionStorage.setItem(KEY, value ? String(value) : '');
    setId(value || null);
  };
  return [id, choose];
}

export function BusinessSwitcher({ businesses, value, onChange }) {
  if (!businesses || businesses.length <= 1) return null;
  return (
    <div className="row small muted" style={{ marginBottom: 12 }}>
      Showing:
      <select value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 280 }} aria-label="Switch business">
        <option value="">All my businesses</option>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}
