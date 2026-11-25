'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

const CATEGORIES = ['Clothing', 'Food', 'Jewellery', 'Crafts', 'Beauty'];

// Submit makes a live product; Save draft keeps it hidden until you submit it.
export default function ProductForm() {
  const toast = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  useEffect(() => { api('/vendor/businesses').then(setBusinesses).catch(() => {}); }, []);

  function readPhotos(files) {
    return Promise.all(Array.from(files).slice(0, 4).map((f) => new Promise((res, rej) => {
      if (f.size > 3 * 1024 * 1024) return rej(new Error(f.name + ' is over 3 MB'));
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
    })));
  }

  async function save(f, hidden) {
    setBusy(true);
    try {
      if (!businesses.length) throw new Error('Add your business first, under My businesses.');
      // Use the first business with a Marketplace subscription.
      const biz = businesses.find((b) => b.subscription?.active);
      if (!biz) throw new Error('Subscribe a business under Marketplace before adding products.');
      await api('/vendor/listings', { method: 'POST', body: {
        business_id: biz.id, name: f.elements.name.value, category: f.category.value, price: f.price.value,
        sale_price: f.sale.value || null, description: f.description.value, photos, hidden } });
      setSent(hidden ? 'Draft saved. Only you can see it until you submit it.' : 'Submitted. Your product is live in the Market Square.');
      toast(hidden ? 'Draft saved.' : 'Product submitted.');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  }

  return (
    <>
      <div className="pagehead"><div><h1>Add a product</h1><p>Choose a category, set a price and add up to four photos.</p></div></div>
      <form className="card stack" style={{ maxWidth: 760 }} onSubmit={(e) => { e.preventDefault(); save(e.currentTarget, false); }}>
        <div className="field"><label>Product name</label><input name="name" required placeholder="What are you selling?" /></div>
        <div className="grid grid-3">
          <div className="field"><label>Category</label><select name="category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>Price (CAD)</label><input name="price" type="number" min="0" step="0.01" required /></div>
          <div className="field"><label>Sale price (optional)</label><input name="sale" type="number" min="0" step="0.01" /></div>
        </div>
        <div className="field"><label>Description</label><textarea name="description" rows={4} placeholder="Materials, size, colours and how long an order takes." /></div>
        <div className="field">
          <label>Photos (up to 4)</label>
          <input type="file" accept="image/*" multiple onChange={async (e) => { try { setPhotos(await readPhotos(e.target.files)); } catch (err) { toast(err.message, true); } }} />
          <div className="row" style={{ marginTop: 10 }}>{photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 80, height: 64, objectFit: 'cover', borderRadius: 8 }} />)}</div>
        </div>
        {sent && <div className="alert ok">{sent}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link className="btn ghost" href="/vendor/products">Cancel</Link>
          <button className="btn ghost" type="button" disabled={busy} onClick={(e) => save(e.currentTarget.form, true)}>Save draft</button>
          <button className="btn primary" type="submit" disabled={busy}>Submit</button>
        </div>
      </form>
    </>
  );
}
