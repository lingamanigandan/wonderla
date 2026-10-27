import { useState } from 'react';
import { useApp, fmt, today, addDays, padN, nextId, pays, pstat, gstOf, form, download, csv, notes, Pill, Rows } from './store.jsx';

export const Sp = Pill;
const Head = ({ title, sub, children }) => <div className="heading"><div><h2>{title}</h2><p>{sub}</p></div>{children}</div>;

/* ---------- Categories ---------- */
export function Categories() {
  const { db, mutate, toast } = useApp();
  const add = e => { e.preventDefault(); const n = form(e).name.trim();
    if (db.categories.some(c => c.toLowerCase() === n.toLowerCase())) return toast('Category already exists');
    mutate((d, log) => { d.categories.push(n); log('Category added', n); }); e.target.reset(); toast('Category added'); };
  const del = c => { if (db.meds.some(m => m.category === c)) return toast('Category has medicines, cannot delete'); mutate((d, log) => { d.categories = d.categories.filter(x => x !== c); log('Category deleted', c); }); };
  return <>
    <Head title="Medicine Categories" sub="Classify tablets, capsules, syrups, injections and other products." />
    <form className="panel toolbar" onSubmit={add}><input name="name" placeholder="New category name (e.g. Inhaler)" required /><button className="primary">+ Add Category</button></form>
    <div className="stats">{db.categories.map(c => { const ms = db.meds.filter(m => m.category === c); return <div className="stat" key={c}><p>{c}</p><h2>{ms.length}</h2><small>{ms.reduce((a, m) => a + m.qty, 0)} units in stock</small><div style={{ marginTop: 8 }}><button className="danger-btn" onClick={() => del(c)}>Delete</button></div></div>; })}</div>
  </>;
}

/* ---------- Customers ---------- */
export function Customers() {
  const { db, mutate, toast } = useApp();
  const [show, setShow] = useState(false), [q, setQ] = useState(''), [hist, setHist] = useState(null);
  const submit = e => { e.preventDefault(); const v = form(e);
    mutate((d, log) => { d.customers.push({ id: nextId(d.customers), name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), address: v.address.trim(), created: today() }); log('Customer added', v.name.trim()); });
    e.target.reset(); setShow(false); toast('Customer saved'); };
  const h = db.customers.find(c => c.id === hist), hs = h ? db.sales.filter(s => s.customerId === h.id) : [];
  return <>
    <Head title="Customer Management" sub="Customer profiles, purchase history and contact details."><button className="primary" onClick={() => setShow(!show)}>+ Add Customer</button></Head>
    {show && <form className="panel form-grid" onSubmit={submit}><h3 className="full">New Customer</h3><label>Name<input name="name" required /></label><label>Phone<input name="phone" required /></label><label>Email<input name="email" type="email" /></label><label>Address<input name="address" /></label><div className="full"><button className="primary">Save Customer</button></div></form>}
    <div className="panel"><div className="toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or phone..." /></div>
      <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Address</th><th>Invoices</th><th>Total Spent</th><th>Outstanding</th><th>Action</th></tr></thead><tbody>
        <Rows cols={8} msg="No customers yet" list={db.customers.filter(c => (c.name + c.phone).toLowerCase().includes(q.toLowerCase())).map(c => { const ss = db.sales.filter(s => s.customerId === c.id);
          return <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.email || '-'}</td><td>{c.address || '-'}</td><td>{ss.length}</td><td>{fmt(ss.reduce((a, s) => a + s.total, 0))}</td><td>{fmt(ss.reduce((a, s) => a + (s.balance || 0), 0))}</td><td><button className="secondary" onClick={() => setHist(c.id)}>History</button></td></tr>; })} /></tbody></table></div></div>
    {h && <div className="panel"><div className="panel-header"><h3>Purchase History: {h.name}</h3><button className="secondary" onClick={() => setHist(null)}>Close</button></div>
      <p style={{ color: '#6b7280', marginBottom: 10 }}>{h.phone} · {h.email || '-'} · {h.address || '-'}</p>
      <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
        <Rows cols={6} msg="No purchases yet" list={hs.map(s => <tr key={s.invoice}><td>{s.invoice}</td><td>{s.date}</td><td>{s.items.map(i => i.name + ' ×' + i.qty).join(', ')}</td><td>{fmt(s.total)}</td><td>{fmt(s.paid ?? s.total)}</td><td><Pill s={pstat(s)} /></td></tr>)} /></tbody></table></div></div>}
  </>;
}

/* ---------- Returns ---------- */
export function Returns() {
  const { db, mutate, toast } = useApp();
  const submit = e => { e.preventDefault(); const v = form(e), qty = +v.qty, m = db.meds.find(x => String(x.id) === v.med), ref = v.ref.trim(), reason = v.reason.trim();
    if (!m) return toast('Select a medicine');
    let amount, refRef = ref;
    if (v.type === 'sales') {
      const sale = db.sales.find(s => s.invoice.toLowerCase() === ref.toLowerCase()); if (!sale) return toast('Invoice not found');
      const it = sale.items.find(i => i.medId === m.id || i.name === m.name); if (!it) return toast('Medicine is not on that invoice');
      const done = db.returns.filter(r => r.type === 'sales' && r.ref === sale.invoice && r.medId === m.id).reduce((a, r) => a + r.qty, 0);
      if (qty > it.qty - done) return toast(`Only ${it.qty - done} returnable`);
      amount = qty * it.price * (1 + (it.gst || 0) / 100); refRef = sale.invoice;
    } else { if (qty > m.qty) return toast('Not enough stock to return'); amount = qty * m.cost; }
    mutate((d, log) => {
      const x = d.meds.find(y => y.id === m.id);
      if (v.type === 'sales') { x.qty += qty; log('Billing correction', `Sales return on ${refRef}: ${m.name} ×${qty}, refund ${fmt(amount)} (${reason})`); log('Stock added', `${m.name} (${m.batch}) +${qty} from sales return`); }
      else { x.qty -= qty; log('Stock deducted', `Supplier return to ${ref}: ${m.name} (${m.batch}) -${qty} (${reason})`); }
      d.returns.unshift({ id: 'RET-' + padN(d.returns.length + 1, 3), type: v.type, ref: refRef, medId: m.id, name: m.name, qty, amount, reason, date: today(), status: v.type === 'sales' ? 'Pending Refund' : 'Credit Pending' });
    });
    e.target.reset(); toast('Return recorded'); };
  const mark = id => mutate((d, log) => { const r = d.returns.find(x => x.id === id); r.status = r.type === 'sales' ? 'Refunded' : 'Credit Received'; log('Refund tracking', `${r.id} marked ${r.status} (${fmt(r.amount)})`); });
  return <>
    <Head title="Returns Management" sub="Sales returns, supplier returns and refund tracking." />
    <form className="panel form-grid" onSubmit={submit}><h3 className="full">Record Return</h3>
      <label>Return Type<select name="type"><option value="sales">Sales Return (customer)</option><option value="supplier">Supplier Return</option></select></label>
      <label>Invoice No. / Supplier<input name="ref" required placeholder="INV-0001 or supplier name" /></label>
      <label>Medicine<select name="med" required>{db.meds.map(m => <option key={m.id} value={m.id}>{m.name} ({m.batch})</option>)}</select></label>
      <label>Quantity<input name="qty" type="number" min="1" required /></label><label>Reason<input name="reason" required placeholder="Damaged, expired, wrong item..." /></label>
      <div className="full"><button className="primary">Record Return</button></div></form>
    <div className="panel"><h3>Return History &amp; Refund Tracking</h3><div className="table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Reference</th><th>Medicine</th><th>Qty</th><th>Amount</th><th>Reason</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>
      <Rows cols={10} msg="No returns recorded" list={db.returns.map(r => { const done = r.status === 'Refunded' || r.status === 'Credit Received'; return <tr key={r.id}><td>{r.id}</td><td>{r.type === 'sales' ? 'Sales' : 'Supplier'}</td><td>{r.ref}</td><td>{r.name}</td><td>{r.qty}</td><td>{fmt(r.amount)}</td><td>{r.reason}</td><td>{r.date}</td><td><Pill s={[r.status, done ? 'ok' : 'low']} /></td><td>{done ? '-' : <button className="secondary" onClick={() => mark(r.id)}>{r.type === 'sales' ? 'Mark Refunded' : 'Mark Received'}</button>}</td></tr>; })} /></tbody></table></div></div>
  </>;
}

/* ---------- Prescriptions ---------- */
export function Prescriptions() {
  const { db, mutate, toast } = useApp();
  const [show, setShow] = useState(false);
  const submit = e => { e.preventDefault(); const v = form(e); if (v.valid < v.date) return toast('Valid-until cannot be before the prescription date');
    mutate((d, log) => { const p = { id: 'RX-' + padN(d.prescriptions.length + 1, 3), patient: v.patient.trim(), doctor: v.doctor.trim(), reg: v.reg.trim(), date: v.date, valid: v.valid, meds: v.meds.trim() }; d.prescriptions.unshift(p); log('Prescription recorded', `${p.id} for ${p.patient} (Dr. ${p.doctor})`); });
    e.target.reset(); setShow(false); toast('Prescription saved'); };
  const tog = id => mutate((d, log) => { const m = d.meds.find(x => x.id === id); m.rx = !m.rx; log('Rx requirement changed', `${m.name}: ${m.rx ? 'now requires' : 'no longer requires'} prescription`); });
  return <>
    <Head title="Prescription Management" sub="Record prescriptions and validate prescription requirements."><button className="primary" onClick={() => setShow(!show)}>+ Record Prescription</button></Head>
    {show && <form className="panel form-grid" onSubmit={submit}><h3 className="full">New Prescription</h3>
      <label>Patient Name<input name="patient" list="cust-list" required /></label><datalist id="cust-list">{db.customers.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <label>Doctor Name<input name="doctor" required /></label><label>Doctor Reg. No.<input name="reg" /></label>
      <label>Prescription Date<input name="date" type="date" defaultValue={today()} required /></label><label>Valid Until<input name="valid" type="date" defaultValue={addDays(30)} required /></label>
      <label>Medicines Prescribed<input name="meds" required /></label><div className="full"><button className="primary">Save Prescription</button></div></form>}
    <div className="panel"><h3>Prescription Records</h3><div className="table-wrap"><table><thead><tr><th>ID</th><th>Patient</th><th>Doctor</th><th>Reg. No.</th><th>Date</th><th>Valid Until</th><th>Medicines</th><th>Status</th><th>Used In</th></tr></thead><tbody>
      <Rows cols={9} msg="No prescriptions recorded" list={db.prescriptions.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.patient}</td><td>{p.doctor}</td><td>{p.reg || '-'}</td><td>{p.date}</td><td>{p.valid}</td><td>{p.meds}</td><td><Pill s={p.valid < today() ? ['Expired', 'exp'] : ['Valid', 'ok']} /></td><td>{db.sales.filter(s => s.rx === p.id).length} invoice(s)</td></tr>)} /></tbody></table></div></div>
    <div className="panel"><h3>Prescription Requirements</h3><p style={{ color: '#6b7280', marginBottom: 10 }}>Medicines marked Rx cannot be billed without a valid prescription.</p><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Category</th><th>Rx Required</th><th>Action</th></tr></thead><tbody>
      <Rows cols={4} list={db.meds.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.category || '-'}</td><td>{m.rx ? <span className="pill rx">Rx Required</span> : 'No'}</td><td><button className="secondary" onClick={() => tog(m.id)}>{m.rx ? 'Remove Rx' : 'Require Rx'}</button></td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Payments ---------- */
export function Payments() {
  const { db, mutate, toast } = useApp();
  const all = db.sales.flatMap(s => pays(s).map(p => ({ ...p, inv: s.invoice, cust: s.customer || 'Walk-in' }))).sort((a, b) => b.date.localeCompare(a.date));
  const by = m => all.filter(p => p.method === m).reduce((a, p) => a + p.amount, 0);
  const receive = s => { const a = parseFloat(prompt(`Amount received (balance ${fmt(s.balance)}):`, s.balance.toFixed(2))); if (!(a > 0)) return;
    if (a > s.balance + 0.005) return toast('Amount exceeds balance');
    const mth = prompt('Payment method (Cash / UPI / Card):', 'Cash'); if (!['Cash', 'UPI', 'Card'].includes(mth)) return toast('Invalid method');
    mutate((d, log) => { const x = d.sales.find(y => y.invoice === s.invoice); x.payments = x.payments || []; x.payments.push({ date: today(), amount: a, method: mth }); x.paid = (x.paid || 0) + a; x.balance = Math.max(0, x.balance - a); log('Payment received', `${x.invoice}: ${fmt(a)} via ${mth}, balance ${fmt(x.balance)}`); });
    toast('Payment recorded'); };
  return <>
    <Head title="Payment Management" sub="Cash, UPI, card, payment status and outstanding balances." />
    <div className="stats"><div className="stat"><p>Total Received</p><h2>{fmt(all.reduce((a, p) => a + p.amount, 0))}</h2></div><div className="stat danger"><p>Outstanding</p><h2>{fmt(db.sales.reduce((a, s) => a + (s.balance || 0), 0))}</h2></div><div className="stat"><p>Cash</p><h2>{fmt(by('Cash'))}</h2></div><div className="stat"><p>UPI</p><h2>{fmt(by('UPI'))}</h2></div><div className="stat"><p>Card</p><h2>{fmt(by('Card'))}</h2></div></div>
    <div className="panel"><h3>Outstanding Balances</h3><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>
      <Rows cols={8} msg="No outstanding balances" list={db.sales.filter(s => (s.balance || 0) > 0.005).map(s => <tr key={s.invoice}><td>{s.invoice}</td><td>{s.date}</td><td>{s.customer}</td><td>{fmt(s.total)}</td><td>{fmt(s.paid || 0)}</td><td>{fmt(s.balance)}</td><td><Pill s={pstat(s)} /></td><td><button className="primary" onClick={() => receive(s)}>Receive</button></td></tr>)} /></tbody></table></div></div>
    <div className="panel"><h3>Payment History</h3><div className="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Amount</th></tr></thead><tbody>
      <Rows cols={5} msg="No payments yet" list={all.slice(0, 30).map((p, i) => <tr key={i}><td>{p.date}</td><td>{p.inv}</td><td>{p.cust}</td><td>{p.method}</td><td>{fmt(p.amount)}</td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Tax ---------- */
export function Tax() {
  const { db, mutate, toast } = useApp();
  const add = e => { e.preventDefault(); const r = +form(e).rate; if (db.taxSlabs.includes(r)) return toast('Slab already exists');
    mutate((d, log) => { d.taxSlabs.push(r); d.taxSlabs.sort((a, b) => a - b); log('Tax slab added', r + '%'); }); e.target.reset(); };
  const del = r => { if (db.meds.some(m => m.gst === r) || db.settings.defaultGst === r) return toast('Slab is in use'); mutate((d, log) => { d.taxSlabs = d.taxSlabs.filter(x => x !== r); log('Tax slab removed', r + '%'); }); };
  const agg = {}; db.sales.forEach(s => s.items.forEach(i => { const g = gstOf(db, i); agg[g] = (agg[g] || 0) + i.price * i.qty; }));
  return <>
    <Head title="Tax Management" sub="Configure applicable GST rates and invoice tax calculations." />
    <div className="panel"><h3>GST Slabs</h3><div>{db.taxSlabs.map(r => <span className="chip" key={r}>{r}%<button title="Remove" onClick={() => del(r)}>×</button></span>)}</div>
      <form className="toolbar" style={{ marginTop: 8 }} onSubmit={add}><input name="rate" type="number" min="0" max="100" step="0.01" placeholder="New GST rate (%)" required style={{ maxWidth: 240 }} /><button className="primary">+ Add Slab</button></form></div>
    <div className="panel"><h3>GST Collected on Sales (by rate)</h3><div className="table-wrap"><table><thead><tr><th>GST Rate</th><th>Taxable Value</th><th>CGST</th><th>SGST</th><th>Total GST</th></tr></thead><tbody>
      <Rows cols={5} msg="No sales yet" list={Object.keys(agg).map(Number).sort((a, b) => a - b).map(g => { const t = agg[g] * g / 100; return <tr key={g}><td>{g}%</td><td>{fmt(agg[g])}</td><td>{fmt(t / 2)}</td><td>{fmt(t / 2)}</td><td>{fmt(t)}</td></tr>; })} /></tbody></table></div></div>
  </>;
}

/* ---------- Notifications ---------- */
export function Notifications() {
  const { db } = useApp();
  const [f, setF] = useState('');
  const list = notes(db).filter(n => !f || n.t === f);
  return <>
    <Head title="Notifications" sub="Low-stock, expiry, purchase and payment alerts."><select value={f} onChange={e => setF(e.target.value)} style={{ maxWidth: 200 }}><option value="">All Alerts</option><option>Low Stock</option><option>Expiry</option><option>Purchase</option><option>Payment</option></select></Head>
    <div className="panel">{list.length ? list.map((n, i) => <div className="note" key={i}><Pill s={[n.t, n.c]} /><span>{n.x}</span></div>) : <p className="empty">No notifications</p>}</div>
  </>;
}

/* ---------- Settings ---------- */
export function Settings() {
  const { db, mutate, replace, toast } = useApp();
  const KEYS = ['name', 'address', 'phone', 'gstin', 'dlno', 'user', 'prefix', 'footer'];
  const L = { name: 'Pharmacy Name', phone: 'Phone', address: 'Address', gstin: 'GSTIN', dlno: 'Drug Licence No.', user: 'Logged-in User', prefix: 'Invoice Prefix', footer: 'Invoice Footer Note' };
  const save = e => { e.preventDefault(); const v = form(e);
    mutate((d, log) => { const old = JSON.stringify(d.settings); KEYS.forEach(k => d.settings[k] = v[k].trim()); d.settings.defaultGst = +v.defaultGst; if (JSON.stringify(d.settings) !== old) log('Settings changed', 'Pharmacy, invoice or tax settings updated'); });
    toast('Settings saved'); };
  const exp = () => { mutate((d, log) => log('Backup exported', 'Full data backup downloaded')); download('pharmacy-backup-' + today() + '.json', JSON.stringify(db, null, 2), 'application/json'); };
  const imp = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!Array.isArray(d.meds) || !Array.isArray(d.sales)) throw 0; replace(d); mutate((x, log) => log('Backup restored', f.name)); toast('Backup restored'); } catch { toast('Invalid backup file'); } };
    r.readAsText(f); e.target.value = ''; };
  const reset = () => { if (confirm('Erase ALL data? This cannot be undone.')) { try { localStorage.removeItem('pharmacy-db-v1'); } catch { } location.reload(); } };
  const inp = k => <label key={k}>{L[k]}<input name={k} defaultValue={db.settings[k] || ''} required={['name', 'user', 'prefix'].includes(k)} /></label>;
  return <>
    <Head title="Settings" sub="Pharmacy details, invoice format, tax configuration and backup." />
    <form className="panel form-grid" key={JSON.stringify(db.settings)} onSubmit={save}>
      <h3 className="full">Pharmacy Details</h3>{['name', 'phone', 'address', 'gstin', 'dlno', 'user'].map(inp)}
      <h3 className="full">Invoice Format</h3>{['prefix', 'footer'].map(inp)}
      <h3 className="full">Tax Configuration</h3><label>Default GST Rate<select name="defaultGst" defaultValue={db.settings.defaultGst}>{db.taxSlabs.map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
      <div className="full"><button className="primary">Save Settings</button></div></form>
    <div className="panel"><h3>Backup &amp; Data</h3><div className="actions"><button className="secondary" onClick={exp}>Download Backup (JSON)</button><label className="secondary" style={{ cursor: 'pointer' }}>Restore Backup<input type="file" accept=".json" hidden onChange={imp} /></label><button className="danger-btn" onClick={reset}>Reset All Data</button></div></div>
  </>;
}

/* ---------- Audit ---------- */
export function Audit() {
  const { db } = useApp();
  const [q, setQ] = useState(''), [f, setF] = useState('');
  const list = db.audit.filter(a => (!f || a.action === f) && (a.action + a.detail + a.user).toLowerCase().includes(q.toLowerCase()));
  const exp = () => download('audit-log.csv', csv([['Time', 'User', 'Action', 'Details'], ...db.audit.map(a => [a.time, a.user, a.action, a.detail])]), 'text/csv');
  return <>
    <Head title="Audit & Compliance" sub="Track stock changes, billing corrections and user activity."><button className="secondary" onClick={exp}>Export Audit CSV</button></Head>
    <div className="stats"><div className="stat"><p>Total Events</p><h2>{db.audit.length}</h2></div><div className="stat warning"><p>Stock Changes</p><h2>{db.audit.filter(a => a.action.startsWith('Stock')).length}</h2></div><div className="stat danger"><p>Billing Corrections</p><h2>{db.audit.filter(a => a.action === 'Billing correction').length}</h2></div></div>
    <div className="panel"><div className="toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search activity..." /><select value={f} onChange={e => setF(e.target.value)} style={{ maxWidth: 220 }}><option value="">All Actions</option>{[...new Set(db.audit.map(a => a.action))].sort().map(a => <option key={a}>{a}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>
        <Rows cols={4} msg="No activity logged yet" list={list.slice(0, 200).map((a, i) => <tr key={i}><td>{a.time}</td><td>{a.user}</td><td>{a.action}</td><td style={{ whiteSpace: 'normal' }}>{a.detail}</td></tr>)} /></tbody></table></div></div>
  </>;
}
