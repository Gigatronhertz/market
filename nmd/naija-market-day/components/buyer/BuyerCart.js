'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useToast } from '@/components/Toast';

// Cart grouped by store. Proceed with one store at a time (BUY-04, BUY-05, BUY-06).
export default function BuyerCart() {
  const toast = useToast();
  const router = useRouter();
  const [cart, setCart] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/buyer/cart').then(setCart).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);

  async function setQty(itemId, qty) {
    try { setCart(await api('/buyer/cart/' + itemId, { method: 'PATCH', body: { qty: Number(qty) } })); }
    catch (e) { toast(e.message, true); }
  }
  async function remove(itemId) {
    try { setCart(await api('/buyer/cart/' + itemId, { method: 'DELETE' })); }
    catch (e) { toast(e.message, true); }
  }
  async function proceed(group) {
    const ok = window.confirm(`Before you chat with ${group.vendor_name}:\n\n${cart.disclaimer}\n\nYour items from this vendor are sent to them. Payment is arranged directly with the vendor.\n\nAccept and start the chat?`);
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api('/buyer/cart/proceed', { method: 'POST', body: { business_id: group.business_id, acknowledged: true } });
      toast(`Sent. The vendor usually replies within ${r.expected_reply_hours} hours.`);
      router.push('/buyer/messages/' + r.chat_id);
    } catch (e) { toast(e.message, true); setBusy(false); }
  }

  return (
    <>
      <div className="pagehead"><div><h1>Cart</h1><p>Items are grouped by vendor. Proceed with one vendor at a time.</p></div></div>
      {!cart ? <p className="muted">Loading...</p> : cart.groups.length === 0 ? (
        <div className="card empty-state">Your cart is empty. <Link href="/buyer">Browse the marketplace</Link></div>
      ) : (
        <div className="stack">
          {cart.groups.map((g) => (
            <section key={g.business_id} className="card stack">
              <div className="spread"><h2>{g.vendor_name}</h2><strong>{money(g.subtotal_cents)}</strong></div>
              <div className="table-wrap"><table>
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th></th></tr></thead>
                <tbody>{g.items.map((i) => (
                  <tr key={i.item_id}>
                    <td>{i.name}</td>
                    <td><input type="number" min="0" max="99" defaultValue={i.qty} aria-label={'Quantity for ' + i.name} style={{ width: 90 }} onBlur={(e) => { if (Number(e.target.value) !== i.qty) setQty(i.item_id, e.target.value); }} /></td>
                    <td>{money(i.line_cents)}</td>
                    <td><button className="btn ghost small-btn" onClick={() => remove(i.item_id)}>Remove</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn primary" disabled={busy} onClick={() => proceed(g)}>Proceed with {g.vendor_name}</button>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
