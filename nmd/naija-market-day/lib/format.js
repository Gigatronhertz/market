export function money(cents) {
  if (cents === null || cents === undefined) return '';
  return '$' + (Number(cents) / 100).toFixed(2);
}
export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return isNaN(dt) ? String(iso) : dt.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
