const LABELS = { checked_in: ['Checked in', 'ok'], not_arrived: ['Not arrived', ''], approved: ['Approved', 'ok'], under_review: ['Under review', 'warn'], more_info: ['More info requested', 'warn'], declined: ['Declined', 'bad'], paid: ['Paid', 'ok'], unpaid: ['Unpaid', ''], published: ['Published', 'ok'] };

export function badge(status, label) {
  const [text, kind] = LABELS[status] || [String(status || '').replace(/_/g, ' '), ''];
  return <span className={'badge ' + kind}>{label || text}</span>;
}
