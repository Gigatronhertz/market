'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

const EMPTY = { name: '', category: '', contact_person: '', phone: '', email: '', city: '', website: '', description: '', instagram: '' };
const CATEGORIES = [['', 'Choose'], ['sponsors', 'Sponsors'], ['corporate', 'Corporate vendors'], ['premium', 'Premium vendors'], ['general', 'General vendors']];

// My businesses (VEN-36, VEN-40): saved details that fill new applications and show in the directory.
export default function Businesses() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [cert, setCert] = useState(null);
  const load = () => api('/vendor/businesses').then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    const { id, instagram, ...rest } = form;
    const body = { ...rest, socials: { instagram } };
    try {
      if (id) await api('/vendor/businesses/' + id, { method: 'PUT', body });
      else await api('/vendor/businesses', { method: 'POST', body });
      setForm(null); toast('Saved'); load();
    } catch (err) { toast(err.message, true); }
  }

  async function uploadCert(e) {
    e.preventDefault();
    const f = e.currentTarget.file.files[0];
    if (!f) return toast('Choose a file first.', true);
    const data_url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    try {
      await api('/vendor/businesses/' + cert.id + '/documents', { method: 'POST', body: { kind: 'food_certificate', filename: f.name, data_url, expires_on: e.currentTarget.expires.value || null } });
      setCert(null); toast('Certificate saved');
    } catch (err) { toast(err.message, true); }
  }

  if (!rows) return <p className="muted">Loading...</p>;
  return (
    <>
      <div className="pagehead">
        <div><h1>My businesses</h1><p>Saved details fill in new applications and appear in each market directory.</p></div>
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>Add a business</button>
      </div>
      {rows.length === 0 ? <div className="card empty-state">No businesses saved yet.</div> : (
        <div className="grid grid-cards">
          {rows.map((b) => (
            <div key={b.id} className="card stack">
              <h3>{b.name}</h3>
              <div className="small muted">{CATEGORIES.find((c) => c[0] === b.category)?.[1] || 'No category'}</div>
              <div className="small">{b.subscription?.active ? 'Marketplace: ' + (b.subscription.status === 'trial' ? 'free period' : 'active') : 'Marketplace: not subscribed'}</div>
              <div className="row">
                <button className="btn ghost small-btn" onClick={() => setForm({ ...EMPTY, ...b, instagram: b.socials?.instagram || '' })}>Edit</button>
                <button className="btn ghost small-btn" onClick={() => setCert(b)}>Add certificate</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form className="modal" onSubmit={save}>
            <button type="button" className="x" aria-label="Close" onClick={() => setForm(null)}>×</button>
            <h2>{form.id ? 'Edit business' : 'New business'}</h2>
            <div className="grid grid-2">
              <div className="field"><label>Business name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="field"><label>Contact person</label><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Public email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="field"><label>Website</label><input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div className="field"><label>Instagram</label><input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@yourshop" /></div>
            </div>
            <div className="field"><label>Description (shown in the directory)</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save business</button></div>
          </form>
        </div>
      )}

      {cert && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setCert(null); }}>
          <form className="modal" onSubmit={uploadCert}>
            <button type="button" className="x" aria-label="Close" onClick={() => setCert(null)}>×</button>
            <h2>Certificate for {cert.name}</h2>
            <p className="small muted">Food vendors need a city food certificate. It is attached to new applications until it expires.</p>
            <div className="field"><label>File</label><input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></div>
            <div className="field"><label>Expiry date</label><input name="expires" type="date" /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save certificate</button></div>
          </form>
        </div>
      )}
    </>
  );
}
