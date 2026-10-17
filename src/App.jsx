import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Engine from './escrowEngine.js';
import { socket, api, identify, API_BASE_URL, usingFallback } from './api.js';
import './App.css';

const RULE = {
  wait: 'Funds locked. The seller has 48 hours to send proof. Use "Fast-forward 72h" to simulate silence.',
  fast: 'Strong evidence: verified rider confirmation. Recommended: release to seller.',
  review: 'Photo evidence only (weakest). Review both sides before deciding.',
  esc: 'The seller did not respond in time. Recommended: refund the buyer.',
  done: 'Case closed.',
};

export default function App() {
  const [state, setState] = useState({ orders: [], ledger: [] });
  const [presence, setPresence] = useState([]);
  const [connected, setConnected] = useState(socket.connected);
  const [slow, setSlow] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const prevRevenue = useRef(null);

  const notify = useCallback((text, tone = 'info') => {
    const id = Date.now();
    setToast({ id, text, tone });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 3500);
  }, []);

  useEffect(() => {
    // Announce on EVERY connect, including reconnects after the server wakes up.
    const onConnect = () => { setConnected(true); setSlow(false); identify('bank', 'Bank Operator'); };
    const onDisconnect = () => setConnected(false);
    const onState = (next) => {
      const stats = Engine.computeStats(next);
      if (prevRevenue.current !== null && stats.revenue !== prevRevenue.current) {
        notify('Ledger updated: a payment just settled', 'ok');
      }
      prevRevenue.current = stats.revenue;
      setState(next);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('presence', setPresence);
    if (socket.connected) onConnect();   // the connect event may already have fired
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('presence', setPresence);
    };
  }, [notify]);

  useEffect(() => {
    if (connected) return undefined;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [connected]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) notify(okMsg, 'ok');
      return r;
    } catch (e) {
      notify(e.message, 'bad');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const stats = Engine.computeStats(state);
  const disputes = state.orders.filter((o) => o.dispute);
  const selected =
    disputes.find((o) => o.id === selectedId) ||
    disputes.find((o) => o.dispute.st !== 'done') ||
    disputes[0];
  const canDecide = selected && ['fast', 'review', 'esc'].includes(selected.dispute.st);
  const devices = presence.filter((p) => p.role !== 'bank');

  const seedDisputeDemo = () => run(async () => {
    const r = await api.createOrder({ item: 'Samsung monitor', amt: 950, method: 'photo', buyer: 'Kwame Boateng', seller: "Ama's Thrift" });
    const id = r.order.id;
    await api.markSent(id, "Ama's Thrift");
    await api.reportIssue(id, 'Buyer says the box arrived empty');
    setSelectedId(id);
  }, 'Demo dispute created');

  return (
    <div>
      <div className="top">
        <span className="logo">GCB</span>
        <b>SafePay Operations Console</b>
        <span style={{ flex: 1 }} />
        <span className="conn">
          <i style={{ background: connected ? '#3CC08F' : 'var(--gold)' }} />
          {connected ? 'Live' : 'Connecting…'}
        </span>
        <button className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} disabled={busy}
          onClick={() => { if (window.confirm('Reset all demo data?')) run(() => api.reset(), 'Demo data reset'); }}>
          Reset demo
        </button>
        <button className="btn gold" disabled={busy} onClick={seedDisputeDemo}>+ Simulate a dispute</button>
      </div>

      {usingFallback && (
        <div className="banner warn">
          No VITE_API_URL set, so this console is looking for a server on {API_BASE_URL}. Add it to dashboard/.env and restart.
        </div>
      )}
      {!connected && slow && !usingFallback && (
        <div className="banner info">Still connecting to {API_BASE_URL}. A free Render server can take up to a minute to wake up.</div>
      )}
      {toast && <div className={`banner ${toast.tone === 'bad' ? 'bad' : 'info'}`}>{toast.text}</div>}

      <div className="wrap">
        <div className="card">
          <h2>Connected devices ({devices.length})</h2>
          {devices.length === 0 && (
            <p className="mut" style={{ margin: 0 }}>
              No phones connected yet. Open the mobile app, pick Buyer or Seller, and enter a name. The device appears here within a second.
            </p>
          )}
          {devices.map((p) => (
            <span key={p.id} className={`chip ${p.role}`} style={{ marginRight: 8, marginBottom: 6 }}>
              {p.role}: {p.name}
            </span>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi hero"><span>Revenue (fees)</span><b>GH₵ {stats.revenue.toFixed(2)}</b></div>
          <div className="kpi"><span>Held in SafePay</span><b>GH₵ {stats.escrowed.toFixed(2)}</b></div>
          <div className="kpi"><span>Payment volume</span><b>GH₵ {stats.gmv.toFixed(2)}</b></div>
          <div className="kpi"><span>Transactions</span><b>{stats.transactions}</b></div>
          <div className="kpi"><span>Open disputes</span><b>{stats.openDisputes}</b></div>
        </div>

        <div className="grid2">
          <div className="card">
            <h2>Dispute queue</h2>
            {disputes.length === 0 && <p className="mut" style={{ margin: 0 }}>No disputes yet.</p>}
            {disputes.map((o) => (
              <div key={o.id} className={`case ${selected && selected.id === o.id ? 'on' : ''}`} onClick={() => setSelectedId(o.id)}>
                <b>{o.id}</b>{' '}
                <span className={`chip ${o.dispute.st === 'done' ? 'released' : 'disputed'}`}>{Engine.DISPUTE_LABEL[o.dispute.st]}</span>
                <div className="mut">{o.item} · GH₵ {o.amt}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Case detail</h2>
            {!selected && <p className="mut" style={{ margin: 0 }}>Select a case to see evidence and decide.</p>}
            {selected && (
              <>
                <table>
                  <tbody>
                    <tr><td className="mut">Buyer claim</td><td>{selected.dispute.reason}</td></tr>
                    <tr><td className="mut">Delivery method</td><td>{Engine.METHODS[selected.method]}</td></tr>
                    <tr><td className="mut">Seller evidence</td><td>{selected.dispute.proof === 'rider' ? 'Rider confirmation' : selected.dispute.proof === 'photo' ? 'Photo' : 'None yet'}</td></tr>
                    <tr><td className="mut">Amount in escrow</td><td>GH₵ {selected.amt}</td></tr>
                  </tbody>
                </table>
                <div className={`note ${selected.dispute.st === 'done' ? 'ok' : ''}`}>
                  <b>{Engine.DISPUTE_LABEL[selected.dispute.st]}.</b> {RULE[selected.dispute.st]}
                </div>
                <div className="actions">
                  <button className="btn o" disabled={busy || !canDecide} onClick={() => run(() => api.resolveDispute(selected.id, 'release'), 'Released to seller')}>
                    Release to seller
                  </button>
                  <button className="btn r" disabled={busy || !canDecide} onClick={() => run(() => api.resolveDispute(selected.id, 'refund'), 'Refunded to buyer')}>
                    Refund buyer
                  </button>
                  {selected.dispute.st === 'wait' && (
                    <button className="btn ghost" disabled={busy} onClick={() => run(() => api.fastForward(selected.id), 'Fast-forwarded 72 hours')}>
                      Fast-forward 72h
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Live transactions</h2>
          <table>
            <thead><tr><th>ID</th><th>Item</th><th>Buyer → Seller</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {state.orders.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td><td>{o.item}</td><td>{o.buyer} → {o.seller || 'unassigned'}</td><td>GH₵ {o.amt}</td>
                  <td><span className={`chip ${o.status}`}>{Engine.STATUS_LABEL[o.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Core banking postings (sandbox)</h2>
          <table>
            <thead><tr><th>Time</th><th>Entry</th><th>Amount</th></tr></thead>
            <tbody>
              {state.ledger.slice(0, 10).map((e, i) => (
                <tr key={i}><td>{e.t}</td><td>DR {e.dr} / CR {e.cr}</td><td>GH₵ {e.amt}</td></tr>
              ))}
              {state.ledger.length === 0 && <tr><td colSpan={3} className="mut">No postings yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
