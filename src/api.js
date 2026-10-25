import { io } from 'socket.io-client';

// Set VITE_API_URL in dashboard/.env (see .env.example). Falls back to a
// local server for development. On Render's static hosting, add it as an
// environment variable BEFORE building, because Vite bakes it in at build time.
const FROM_ENV = import.meta.env.VITE_API_URL;
export const API_BASE_URL = (FROM_ENV || 'http://localhost:3000').replace(/\/+$/, '');
export const usingFallback = !FROM_ENV;

export const socket = io(API_BASE_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});
socket.on('connect', () => console.log('[SafePay console] connected', socket.id));
socket.on('disconnect', (r) => console.log('[SafePay console] disconnected:', r));
socket.on('connect_error', (e) => console.log('[SafePay console] connect_error:', e.message, '→', API_BASE_URL));

async function call(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user': 'Bank Operator (bank)' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the server. It may be waking up, so try again in a moment.');
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
  if (!res.ok) throw new Error((data && data.error) || `Server error (${res.status})`);
  return data;
}

export const api = {
  health: () => call('/api/health'),
  createOrder: (data) => call('/api/orders', 'POST', data),
  markSent: (id, by) => call(`/api/orders/${id}/send`, 'POST', { by }),
  reportIssue: (id, reason) => call(`/api/orders/${id}/report`, 'POST', { reason }),
  fastForward: (id) => call(`/api/orders/${id}/fastforward`, 'POST'),
  resolveDispute: (id, outcome) => call(`/api/orders/${id}/resolve`, 'POST', { outcome }),
  reviewVerification: (name, decision, note) => call(`/api/sellers/${encodeURIComponent(name)}/review`, 'POST', { decision, note }),
  reset: () => call('/api/reset', 'POST'),
};

export function identify(role, name) {
  socket.emit('identify', { role, name });
}