import React, { useState } from 'react';
import { api } from './api.js';
import * as Trust from './sellerTrust.js';

const LABEL = { pending: 'Pending review', approved: 'Approved', info: 'More info asked', rejected: 'Rejected' };
const CHIP = { pending: 'escrow', approved: 'released', info: 'sent', rejected: 'disputed' };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '');

function csv(rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['time,actor,action,target,detail', ...rows.map((r) => [r.t, r.actor, r.action, r.target, r.detail].map(q).join(','))].join('\n');
}

// Verified Seller admin: review queue with automatic checks, the trust board, and the audit trail.
export default function SellerAdmin({ state, run, busy }) {
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState('');

  const withV = Object.values(state.sellers || {}).filter((p) => p.v);
  const queue = withV.filter((p) => p.v.status === 'pending').sort((a, b) => a.v.submittedAt.localeCompare(b.v.submittedAt));
  const decided = withV.filter((p) => p.v.status !== 'pending').sort((a, b) => String(b.v.decidedAt).localeCompare(String(a.v.decidedAt)));
  const sel = withV.find((p) => p.name === pick) || queue[0] || decided[0] || null;
  const screen = sel && sel.v.status === 'pending' ? Trust.screenApplication(state, sel.name) : null;
  const board = Trust.sellerDirectory(state);
  const audit = state.audit || [];

  const decide = async (decision, ok) => {
    const r = await run(() => api.reviewVerification(sel.name, decision, note), ok);
    if (r) setNote('');
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([csv(audit)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `safepay-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="grid2">
        <div className="card">
          <h2>Seller verification queue ({queue.length})</h2>
          {queue.length === 0 && <p className="mut" style={{ margin: 0 }}>No applications waiting. New ones appear here the moment a seller pays and applies.</p>}
          {queue.map((p) => (
            <div key={p.name} className={`case ${sel && sel.name === p.name ? 'on' : ''}`} onClick={() => { setPick(p.name); setNote(''); }}>
              <b>{p.name}</b> <span className="chip escrow">Pending review</span>
              <div className="mut">{p.v.app.business} · {p.v.app.category} · applied {fmt(p.v.submittedAt)}</div>
            </div>
          ))}
          {decided.length > 0 && <h2 style={{ marginTop: 14 }}>Decided</h2>}
          {decided.map((p) => (
            <div key={p.name} className={`case ${sel && sel.name === p.name ? 'on' : ''}`} onClick={() => { setPick(p.name); setNote(''); }}>
              <b>{p.name}</b> <span className={`chip ${CHIP[p.v.status]}`}>{LABEL[p.v.status]}</span>
              <div className="mut">by {p.v.decidedBy} · {fmt(p.v.decidedAt)}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Application review</h2>
          {!sel && <p className="mut" style={{ margin: 0 }}>Select an application to review.</p>}
          {sel && (
            <>
              <table>
                <tbody>
                  <tr><td className="mut">Seller</td><td><b>{sel.name}</b> <span className={`chip ${CHIP[sel.v.status]}`}>{LABEL[sel.v.status]}</span></td></tr>
                  <tr><td className="mut">Name on Ghana Card</td><td>{sel.v.app.fullName}</td></tr>
                  <tr><td className="mut">Ghana Card</td><td>{sel.v.app.ghanaCard}</td></tr>
                  <tr><td className="mut">Business</td><td>{sel.v.app.business} · {sel.v.app.category}</td></tr>
                  <tr><td className="mut">Sells on</td><td>{sel.v.app.channels.join(', ')} · {sel.v.app.handle}</td></tr>
                  <tr><td className="mut">Fee</td><td>GH₵ {sel.v.fee} {sel.v.feeEarned ? '(earned by GCB)' : sel.v.feePaid ? '(held until you decide)' : '(refunded)'}</td></tr>
                </tbody>
              </table>

              {screen && (
                <>
                  <h2 style={{ marginTop: 12 }}>Automatic checks</h2>
                  {screen.checks.map((c) => (
                    <div key={c.key} className={`check ${c.ok ? 'ok' : 'fail'}`}>
                      <span className="tick">{c.ok ? '✓' : '✗'}</span>
                      <div><b>{c.label}</b><div className="mut">{c.detail}</div></div>
                    </div>
                  ))}
                  <div className={`note ${screen.recommended === 'approve' ? 'ok' : 'bad'}`}>
                    <b>Recommended: {{ approve: 'approve', info: 'ask for more information', reject: 'reject' }[screen.recommended]}.</b>{' '}
                    {screen.failed === 0 ? 'All checks passed. The decision is still yours.' : `${screen.failed} check${screen.failed > 1 ? 's' : ''} failed. Approving needs a written reason.`}
                  </div>
                  <input className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the seller (needed to reject, ask for more, or override failed checks)" />
                  <div className="actions">
                    <button className="btn o" disabled={busy} onClick={() => decide('approve', `${sel.name} is now a Verified Seller`)}>Approve and grant badge</button>
                    <button className="btn ghost" disabled={busy} onClick={() => decide('info', 'Asked the seller for more information')}>Ask for more info</button>
                    <button className="btn r" disabled={busy} onClick={() => decide('reject', 'Rejected. Fee refunded to the seller')}>Reject and refund</button>
                  </div>
                </>
              )}
              {!screen && sel.v.note && <div className="note"><b>Decision note:</b> {sel.v.note}</div>}
              <h2 style={{ marginTop: 12 }}>History</h2>
              {sel.v.history.map((h, i) => <div key={i} className="mut">{fmt(h.t)} · <b>{h.status}</b> · {h.by}{h.note ? ` · ${h.note}` : ''}</div>)}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Seller trust board</h2>
        <table>
          <thead><tr><th>Seller</th><th>Trust score</th><th>Tier</th><th>GCB check</th><th>Rating</th><th>Safe sales</th><th>Disputes lost</th><th>Order limit</th></tr></thead>
          <tbody>
            {board.map((p) => (
              <tr key={p.name}>
                <td><b>{p.name}</b></td>
                <td><div className="bar"><i style={{ width: `${p.score}%` }} /></div> <b>{p.score}</b></td>
                <td><span className={`chip tier-${p.tier}`}>{p.tierLabel}</span></td>
                <td>{p.verified ? <span className="chip gold">✓ Verified</span> : <span className="mut">{{ none: 'Not applied', pending: 'Pending', info: 'More info', rejected: 'Rejected' }[p.verification]}</span>}</td>
                <td>{p.stats.ratings ? `${p.stats.avg.toFixed(1)} ★ (${p.stats.ratings})` : <span className="mut">none yet</span>}</td>
                <td>{p.stats.completed}</td>
                <td>{p.stats.lost}</td>
                <td>GH₵ {p.limit.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ flex: 1, margin: 0 }}>Audit trail ({audit.length} entries)</h2>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>
            {audit.slice(0, 12).map((a) => (
              <tr key={a.id}><td>{fmt(a.t)}</td><td>{a.actor}</td><td><code>{a.action}</code></td><td>{a.target}</td><td className="mut">{a.detail}</td></tr>
            ))}
            {audit.length === 0 && <tr><td colSpan={5} className="mut">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}