'use strict';
// QR codes (GEN-03). Each guest and each approved vendor booking has its own code.
// Codes are prefixed so the scanner can tell them apart: NMD-G-<token> for guests, NMD-V-<token> for vendors.
// Rendered synchronously as an SVG data URL, so the same call works in every code path.

const QRCode = require('qrcode');

const PATTERN = /^NMD-([GV])-([A-Za-z0-9_-]{8,64})$/;

function guestCode(token) {
  return `NMD-G-${token}`;
}
function vendorCode(token) {
  return `NMD-V-${token}`;
}
function parse(code) {
  const m = PATTERN.exec(String(code || '').trim());
  if (!m) return null;
  return { kind: m[1] === 'G' ? 'guest' : 'vendor', token: m[2] };
}

function dataUrl(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const margin = 2;
  const total = size + margin * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.data[y * size + x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#0E1210"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

module.exports = { guestCode, vendorCode, parse, dataUrl };
