import { useState } from 'react';
import { useApp, Icon, fmt, esc, today, addDays, padN, nextId, status, isAlert, pstat, gstOf, form, download, csv, Pill, MedPill, Rows } from './store.jsx';
import { Sp } from './pages2.jsx';

const Head = ({ title, sub, children }) => <div className="heading"><div><h2>{title}</h2><p>{sub}</p></div>{children}</div>;

/* ---------- charts (pure SVG) ---------- */
const BarChart = ({ data, money }) => {
  const W = 420, H = 230, L = 44, B = 28, T = 22, max = Math.max(...data.map(d => d.value), 1), ph = H - B - T, bw = (W - L - 10) / data.length;
  return <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
    {[0, 1, 2, 3, 4].map(i => { const y = T + ph - ph * i / 4, v = max * i / 4; return <g key={i}><line x1={L} x2={W - 10} y1={y} y2={y} stroke="#eef0f3" /><text x={L - 6} y={y + 4} textAnchor="end">{money ? '₹' + Math.round(v) : Math.round(v)}</text></g>; })}
    {data.map((d, i) => { const h = ph * d.value / max, x = L + i * bw + bw * .2, y = T + ph - h; return <g key={i}>
      <rect className="bar" x={x} y={y} width={bw * .6} height={h} rx="4" fill="#2563eb"><title>{d.label}: {money ? fmt(d.value) : d.value}</title></rect>
      {d.value > 0 && <text className="val" x={x + bw * .3} y={y - 5} textAnchor="middle">{money ? '₹' + Math.round(d.value) : d.value}</text>}
      <text x={x + bw * .3} y={H - 10} textAnchor="middle">{d.label}</text></g>; })}
  </svg>;
};
const Donut = ({ segs, label }) => {
  const total = segs.reduce((a, x) => a + x.value, 0), r = 60, C = 2 * Math.PI * r; let off = 0;
  return <div className="donut-wrap"><svg viewBox="0 0 170 170"><circle cx="85" cy="85" r={r} fill="none" stroke="#eef2f7" strokeWidth="26" />
    {total > 0 && segs.filter(x => x.value).map(x => { const len = C * x.value / total, o = off; off += len; return <circle key={x.label} cx="85" cy="85" r={r} fill="none" stroke={x.color} strokeWidth="26" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-o} transform="rotate(-90 85 85)"><title>{x.label}: {x.value}</title></circle>; })}
    <text className="c-num" x="85" y="88">{total}</text><text className="c-lbl" x="85" y="106">{label}</text></svg>
    <div className="legend">{segs.map(x => <div key={x.label}><i style={{ background: x.color }} />{x.label}<b>{x.value}</b></div>)}</div></div>;
};

/* ---------- Dashboard ---------- */
export function Dashboard({ go }) {
  const { db } = useApp();
  const inv = db.meds.reduce((a, m) => a + m.qty * m.cost, 0);
  const stats = [['Total Medicines', db.meds.length, 'Registered products'], ['Available Stock', db.meds.reduce((a, m) => a + m.qty, 0), 'Total units'], ["Today's Sales", fmt(db.sales.filter(s => s.date === today()).reduce((a, s) => a + s.total, 0)), 'Completed invoices'],
    ['Low Stock', db.meds.filter(m => m.qty <= m.min).length, 'Replenishment alerts', 'warning'], ['Expiry Alerts', db.meds.filter(m => status(m)[0].includes('Exp')).length, 'Expired or near expiry', 'danger'], ['Inventory Value', fmt(inv), 'Purchase value of stock'],
    ['Pending Purchases', 0, 'Orders awaiting receipt', 'warning'], ['Active Suppliers', db.suppliers.length, 'Registered suppliers']];
  const days = [...Array(7)].map((_, k) => { const d = new Date(Date.now() - (6 - k) * 864e5), key = d.toISOString().slice(0, 10); return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: db.sales.filter(s => s.date === key).reduce((a, s) => a + s.total, 0) }; });
  const cnt = n => db.meds.filter(m => status(m)[0] === n).length;
  const top = [...db.meds].sort((a, b) => b.qty - a.qty).slice(0, 6), mx = Math.max(...top.map(m => m.qty), 1);
  return <>
    <Head title={<>Welcome back, {db.settings.user}!</>} sub="Here is your pharmacy overview for today."><button className="primary" onClick={() => go('billing')}>+ New Sale</button></Head>
    <div className="stats">{stats.map(([p, v, s, c]) => <div key={p} className={'stat ' + (c || '')}><p>{p}</p><h2>{v}</h2><small>{s}</small></div>)}</div>
    <div className="actions"><button className="primary" onClick={() => go('inventory')}><Icon n="add" />Add Medicine</button><button className="secondary" onClick={() => go('purchases')}><Icon n="vaccines" />Record Purchase</button><button className="secondary" onClick={() => go('barcode')}><Icon n="barcode_scanner" />Barcode Search</button></div>
    <div className="charts">
      <div className="panel"><h3>Sales: Last 7 Days</h3><BarChart data={days} money /></div>
      <div className="panel"><h3>Stock Status</h3><Donut label="medicines" segs={[{ label: 'In Stock', value: cnt('In Stock'), color: '#22c55e' }, { label: 'Low Stock', value: cnt('Low Stock'), color: '#f59e0b' }, { label: 'Near Expiry', value: cnt('Near Expiry'), color: '#fb923c' }, { label: 'Expired', value: cnt('Expired'), color: '#ef4444' }]} /></div>
      <div className="panel"><h3>Stock by Medicine</h3>{top.length ? top.map(m => <div className="hbar" key={m.id}><span title={m.name}>{m.name}</span><span className="track"><span className="fill" style={{ display: 'block', width: m.qty / mx * 100 + '%', background: m.qty <= m.min ? '#f59e0b' : '#2563eb' }} /></span><span className="n">{m.qty}</span></div>) : <p className="empty">No medicines yet</p>}</div>
      <div className="panel"><h3>Payment Methods</h3><Donut label="sales" segs={['Cash', 'UPI', 'Card'].map((p, i) => ({ label: p, value: db.sales.filter(s => s.payment === p).length, color: ['#2563eb', '#8b5cf6', '#06b6d4'][i] }))} /></div>
    </div>
    <div className="panel"><div className="panel-header"><h3>Recent Sales</h3><button className="secondary" onClick={() => go('sales')}>View All</button></div>
      <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody><Rows cols={5} msg="No sales yet" list={db.sales.slice(0, 5).map(s => <tr key={s.invoice}><td>{s.invoice}</td><td>{s.date}</td><td>{s.count}</td><td>{s.payment}</td><td>{fmt(s.total)}</td></tr>)} /></tbody></table></div></div>
    <div className="panel"><h3>Stock Alerts</h3><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Quantity</th><th>Expiry</th><th>Status</th></tr></thead><tbody><Rows cols={5} msg="No alerts" list={db.meds.filter(isAlert).map(m => <tr key={m.id}><td>{m.name}</td><td>{m.batch}</td><td>{m.qty}</td><td>{m.expiry}</td><td><MedPill m={m} /></td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Inventory ---------- */
export function Inventory() {
  const { db, mutate, toast } = useApp();
  const [show, setShow] = useState(false), [q, setQ] = useState(''), [f, setF] = useState('all'), [c, setC] = useState('');
  const add = e => { e.preventDefault(); const v = form(e);
    const m = { name: v.name.trim(), barcode: v.barcode.trim(), category: v.category, batch: v.batch.trim(), qty: +v.qty, cost: +v.cost, price: +v.price, gst: +v.gst, expiry: v.expiry, min: +v.min, rx: v.rx === 'yes' };
    mutate((d, log) => { d.meds.push({ ...m, id: nextId(d.meds) }); log('Stock added', `${m.name} (${m.batch}) opening quantity ${m.qty}`); });
    e.target.reset(); setShow(false); toast('Medicine saved'); };
  const del = m => { if (!confirm('Delete this medicine?')) return; mutate((d, log) => { d.meds = d.meds.filter(x => x.id !== m.id); log('Medicine deleted', `${m.name} (${m.batch})`); }); };
  const adj = m => { const v = prompt(`New quantity for ${m.name} (current ${m.qty}):`, m.qty); if (v === null) return;
    const n = parseInt(v); if (isNaN(n) || n < 0) return toast('Invalid quantity');
    const r = prompt('Reason for adjustment:', 'Stock count correction'); if (!r) return toast('Reason is required');
    mutate((d, log) => { const x = d.meds.find(y => y.id === m.id); log('Stock adjusted', `${m.name} (${m.batch}): ${x.qty} to ${n}. ${r}`); x.qty = n; }); };
  const list = db.meds.filter(m => (m.name + m.barcode).toLowerCase().includes(q.toLowerCase()) && (!c || m.category === c) && (f === 'all' || (f === 'low' ? m.qty <= m.min : status(m)[0].includes('Exp'))));
  return <>
    <Head title="Medicine Inventory" sub="Manage medicines, batches and expiry dates."><button className="primary" onClick={() => setShow(!show)}>+ Add Medicine</button></Head>
    {show && <form className="panel form-grid" onSubmit={add}><h3 className="full">Add New Medicine</h3>
      <label>Medicine Name<input name="name" required /></label><label>Barcode<input name="barcode" required /></label>
      <label>Category<select name="category" required>{db.categories.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Batch Number<input name="batch" required /></label><label>Quantity<input name="qty" type="number" min="0" required /></label>
      <label>Purchase Price (₹)<input name="cost" type="number" min="0" step=".01" required /></label><label>MRP (₹)<input name="price" type="number" min=".01" step=".01" required /></label>
      <label>GST Rate<select name="gst" defaultValue={db.settings.defaultGst}>{db.taxSlabs.map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
      <label>Prescription Required<select name="rx"><option value="no">No</option><option value="yes">Yes (Rx only)</option></select></label>
      <label>Expiry Date<input name="expiry" type="date" required /></label><label>Minimum Stock<input name="min" type="number" min="0" defaultValue="10" required /></label>
      <div className="full form-buttons"><button className="primary">Save Medicine</button><button type="button" className="secondary" onClick={() => setShow(false)}>Cancel</button></div></form>}
    <div className="panel"><div className="toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search medicine or barcode..." />
      <select value={c} onChange={e => setC(e.target.value)}><option value="">All Categories</option>{db.categories.map(x => <option key={x}>{x}</option>)}</select>
      <select value={f} onChange={e => setF(e.target.value)}><option value="all">All Stock</option><option value="low">Low Stock</option><option value="expiry">Expiry Alerts</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Barcode</th><th>Batch</th><th>Quantity</th><th>MRP</th><th>Expiry</th><th>Status</th><th>Action</th></tr></thead><tbody>
        <Rows cols={8} msg="No medicines found" list={list.map(m => <tr key={m.id}><td>{m.name}{m.rx && <> <span className="pill rx">Rx</span></>}<br /><small style={{ color: '#9ca3af' }}>{m.category || ''}</small></td><td>{m.barcode}</td><td>{m.batch}</td><td>{m.qty}</td><td>{fmt(m.price)}</td><td>{m.expiry}</td><td><MedPill m={m} /></td>
          <td><button className="secondary" onClick={() => adj(m)}>Adjust</button> <button className="danger-btn" onClick={() => del(m)}>Delete</button></td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Billing ---------- */
export function Billing() {
  const { db, mutate, toast } = useApp();
  const [q, setQ] = useState(''), [cart, setCart] = useState([]), [cust, setCust] = useState(''), [rx, setRx] = useState(''), [pay, setPay] = useState('Cash'), [paid, setPaid] = useState(null);
  const med = id => db.meds.find(x => x.id === id);
  const key = q.toLowerCase().trim();
  const list = key ? db.meds.filter(m => m.qty > 0 && m.expiry >= today() && (m.name + m.barcode).toLowerCase().includes(key)).slice(0, 6) : [];
  const add = id => { const m = med(id), c = cart.find(x => x.id === id); if (c && c.qty >= m.qty) return toast('Not enough stock'); setCart(c ? cart.map(x => x.id === id ? { ...x, qty: x.qty + 1 } : x) : [...cart, { id, qty: 1 }]); };
  const setQty = (id, v) => setCart(cart.map(x => x.id === id ? { ...x, qty: Math.max(1, Math.min(+v || 1, med(id).qty)) } : x));
  let s = 0, t = 0; cart.forEach(c => { const m = med(c.id), l = m.price * c.qty; s += l; t += l * m.gst / 100; });
  const total = s + t, needRx = cart.some(c => med(c.id).rx);
  const checkout = () => {
    if (!cart.length) return toast('Cart is empty');
    if (needRx) { if (!rx) return toast('Select a prescription for Rx medicines'); const p = db.prescriptions.find(x => x.id === rx); if (!p || p.valid < today()) return toast('Prescription is expired or invalid'); }
    const amt = Math.min(Math.max(+(paid ?? total) || 0, 0), total), bal = total - amt, cu = db.customers.find(c => String(c.id) === cust);
    if (bal > 0.005 && !cu) return toast('Select a customer to bill on credit');
    const invoice = db.settings.prefix + padN(db.sales.length + 1, 4);
    mutate((d, log) => {
      const items = cart.map(c => { const m = d.meds.find(x => x.id === c.id); m.qty -= c.qty; return { medId: m.id, name: m.name, batch: m.batch, qty: c.qty, price: m.price, gst: m.gst }; });
      d.sales.unshift({ invoice, date: today(), items, count: items.reduce((a, i) => a + i.qty, 0), payment: pay, subtotal: s, gst: t, total, paid: amt, balance: bal, customerId: cu ? cu.id : null, customer: cu ? cu.name : 'Walk-in', rx: needRx ? rx : null, payments: amt > 0 ? [{ date: today(), amount: amt, method: pay }] : [] });
      items.forEach(i => log('Stock deducted', `${i.name} (${i.batch}) -${i.qty} via ${invoice}`));
      log('Invoice created', `${invoice} · ${fmt(total)} · ${cu ? cu.name : 'Walk-in'}${bal > 0.005 ? ' · balance ' + fmt(bal) : ''}`);
    });
    toast('Sale completed: ' + invoice); setCart([]); setPaid(null); setQ(''); setRx(''); setCust('');
  };
  return <>
    <Head title="Billing / POS" sub="Create sales invoices and deduct inventory." />
    <div className="panel"><label className="field-label">Search medicine or scan barcode
      <input value={q} placeholder="Enter medicine name or barcode..." onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const m = db.meds.find(x => x.barcode === q.trim()); if (m) { add(m.id); setQ(''); } } }} /></label>
      <div>{list.map(m => <div className="result-row" key={m.id}><span>{m.name}{m.rx && <> <span className="pill rx">Rx</span></>} <small>({m.batch} · {m.qty} in stock)</small></span><span>{fmt(m.price)} <button className="primary" onClick={() => add(m.id)}>Add</button></span></div>)}</div></div>
    <div className="panel"><h3>Current Cart</h3><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Quantity</th><th>Price</th><th>GST</th><th>Total</th><th>Action</th></tr></thead><tbody>
      <Rows cols={6} msg="Cart is empty" list={cart.map(c => { const m = med(c.id); return <tr key={c.id}><td>{m.name}{m.rx && <> <span className="pill rx">Rx</span></>}</td><td><input type="number" min="1" style={{ width: 80 }} value={c.qty} onChange={e => setQty(c.id, e.target.value)} /></td><td>{fmt(m.price)}</td><td>{m.gst}%</td><td>{fmt(m.price * c.qty * (1 + m.gst / 100))}</td><td><button className="danger-btn" onClick={() => setCart(cart.filter(x => x.id !== c.id))}>Remove</button></td></tr>; })} /></tbody></table></div>
      <div className="summary"><p>Subtotal <strong>{fmt(s)}</strong></p><p>GST <strong>{fmt(t)}</strong></p><p className="total">Grand Total <strong>{fmt(total)}</strong></p>
        <label className="field-label">Customer<select value={cust} onChange={e => setCust(e.target.value)}><option value="">Walk-in Customer</option>{db.customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}</select></label>
        {needRx && <label className="field-label">Prescription (required for Rx items)<select value={rx} onChange={e => setRx(e.target.value)}><option value="">Select prescription...</option>{db.prescriptions.filter(p => p.valid >= today()).map(p => <option key={p.id} value={p.id}>{p.id} · {p.patient} · Dr. {p.doctor}</option>)}</select></label>}
        <label className="field-label">Payment Method<select value={pay} onChange={e => setPay(e.target.value)}><option>Cash</option><option>UPI</option><option>Card</option></select></label>
        <label className="field-label">Amount Received (₹)<input type="number" min="0" step=".01" value={paid ?? total.toFixed(2)} onChange={e => setPaid(e.target.value)} /></label>
        <button className="primary" style={{ justifyContent: 'center' }} onClick={checkout}>Complete Sale</button></div></div>
  </>;
}

/* ---------- Purchases ---------- */
export function Purchases() {
  const { db, mutate, toast } = useApp();
  const submit = e => { e.preventDefault(); const v = form(e), qty = +v.qty, cost = +v.cost, mrp = +v.mrp, name = v.name.trim(), batch = v.batch.trim(), sup = v.supplier.trim(), inv = v.invoice.trim();
    mutate((d, log) => {
      let m = d.meds.find(x => x.name.toLowerCase() === name.toLowerCase() && x.batch === batch);
      if (m) { m.qty += qty; m.cost = cost; m.price = mrp; m.expiry = v.expiry; }
      else { m = { id: nextId(d.meds), name, barcode: 'AUTO' + Date.now().toString().slice(-6), category: d.categories.includes('Other') ? 'Other' : (d.categories[0] || ''), batch, qty, cost, price: mrp, gst: d.settings.defaultGst, expiry: v.expiry, min: 10, rx: false }; d.meds.push(m); }
      d.purchases.unshift({ invoice: inv, supplier: sup, name, batch, qty, total: qty * cost, date: today() });
      log('Stock added', `${m.name} (${m.batch}) +${qty} via purchase ${inv} from ${sup}`);
    });
    e.target.reset(); toast('Purchase recorded'); };
  return <>
    <Head title="Purchase Management" sub="Receive medicine stock from suppliers." />
    <form className="panel form-grid" onSubmit={submit}><h3 className="full">Record Purchase</h3>
      <label>Supplier Name<input name="supplier" required /></label><label>Supplier Invoice Number<input name="invoice" required /></label>
      <label>Medicine Name<input name="name" required /></label><label>Batch Number<input name="batch" required /></label>
      <label>Quantity<input name="qty" type="number" min="1" required /></label><label>Purchase Price (₹)<input name="cost" type="number" min=".01" step=".01" required /></label>
      <label>MRP (₹)<input name="mrp" type="number" min=".01" step=".01" required /></label><label>Expiry Date<input name="expiry" type="date" required /></label>
      <div className="full"><button className="primary">Record Purchase</button></div></form>
    <div className="panel"><h3>Purchase History</h3><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Supplier</th><th>Medicine</th><th>Batch</th><th>Qty</th><th>Total</th><th>Date</th></tr></thead><tbody>
      <Rows cols={7} list={db.purchases.map((p, i) => <tr key={i}><td>{p.invoice}</td><td>{p.supplier}</td><td>{p.name}</td><td>{p.batch}</td><td>{p.qty}</td><td>{fmt(p.total)}</td><td>{p.date}</td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Suppliers ---------- */
export function Suppliers() {
  const { db, mutate, toast } = useApp();
  const [show, setShow] = useState(false), [q, setQ] = useState('');
  const submit = e => { e.preventDefault(); const v = form(e); mutate(d => { d.suppliers.push(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()]))); }); e.target.reset(); setShow(false); toast('Supplier saved'); };
  return <>
    <Head title="Supplier Management" sub="Manage supplier information."><button className="primary" onClick={() => setShow(!show)}>+ Add Supplier</button></Head>
    {show && <form className="panel form-grid" onSubmit={submit}><h3 className="full">New Supplier</h3>
      <label>Supplier Name<input name="name" required /></label><label>Contact Person<input name="contact" /></label><label>Phone<input name="phone" required /></label><label>Email<input name="email" type="email" /></label><label>GSTIN<input name="gstin" /></label><label>Address<input name="address" /></label>
      <div className="full"><button className="primary">Save Supplier</button></div></form>}
    <div className="panel"><div className="toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search suppliers..." /></div><div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th>GSTIN</th></tr></thead><tbody>
      <Rows cols={5} list={db.suppliers.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.contact || '-'}</td><td>{s.phone}</td><td>{s.email || '-'}</td><td>{s.gstin || '-'}</td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Sales ---------- */
export function Sales() {
  const { db, toast } = useApp();
  const [q, setQ] = useState(''), [d, setD] = useState('');
  const print = s => { const st = db.settings, w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print');
    w.document.write(`<html><head><title>${esc(s.invoice)}</title><style>body{font-family:Arial;max-width:600px;margin:20px auto}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}</style></head><body><h2>${esc(st.name)}</h2><p>${esc(st.address)}<br>${esc(st.phone)} ${st.gstin ? '· GSTIN ' + esc(st.gstin) : ''} ${st.dlno ? '· DL ' + esc(st.dlno) : ''}</p><hr><p><b>${esc(s.invoice)}</b> · ${s.date}<br>Customer: ${esc(s.customer || 'Walk-in')}</p><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>GST</th><th class="r">Amount</th></tr>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${fmt(i.price)}</td><td>${gstOf(db, i)}%</td><td class="r">${fmt(i.price * i.qty)}</td></tr>`).join('')}</table><p class="r">Subtotal: ${fmt(s.subtotal)}<br>GST: ${fmt(s.gst)}<br><b>Total: ${fmt(s.total)}</b><br>Paid: ${fmt(s.paid ?? s.total)} · Balance: ${fmt(s.balance || 0)}</p><p>${esc(st.footer)}</p><script>window.print()<\/script></body></html>`);
    w.document.close(); };
  return <>
    <Head title="Sales History" sub="Review completed invoices." />
    <div className="panel"><div className="toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoice..." /><input type="date" value={d} onChange={e => setD(e.target.value)} style={{ maxWidth: 200 }} /></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>
      <Rows cols={10} list={db.sales.filter(s => s.invoice.toLowerCase().includes(q.toLowerCase()) && (!d || s.date === d)).map(s => <tr key={s.invoice}><td>{s.invoice}</td><td>{s.date}</td><td>{s.customer || 'Walk-in'}</td><td>{s.count}</td><td>{s.payment}</td><td>{fmt(s.subtotal)}</td><td>{fmt(s.gst)}</td><td>{fmt(s.total)}</td><td><Sp s={pstat(s)} /></td><td><button className="secondary" onClick={() => print(s)}>Print</button></td></tr>)} /></tbody></table></div></div>
  </>;
}

/* ---------- Barcode ---------- */
export function Barcode() {
  const { db } = useApp();
  const [r, setR] = useState(null);
  const submit = e => { e.preventDefault(); const code = form(e).code.trim(); setR(db.meds.find(x => x.barcode === code) || false); };
  return <>
    <Head title="Barcode Search" sub="Scan or enter a medicine barcode." />
    <div className="panel barcode-box"><div className="barcode-symbol"><Icon n="barcode_scanner" size={64} /></div><h3>Find a Medicine</h3><p>Use a USB barcode scanner or type a barcode.</p>
      <form className="barcode-form" onSubmit={submit}><input name="code" placeholder="Enter barcode..." required /><button className="primary">Search</button></form>
      {r && <div className="result-row" style={{ textAlign: 'left' }}><span><strong>{r.name}</strong><br /><small>{r.category} · Batch {r.batch} · Exp {r.expiry}</small></span><span>{fmt(r.price)}<br />{r.qty} units <MedPill m={r} /></span></div>}
      {r === false && <p className="empty">No medicine found for this barcode.</p>}</div>
  </>;
}

/* ---------- Reports ---------- */
export function Reports() {
  const { db } = useApp();
  const inv = db.meds.reduce((a, m) => a + m.qty * m.cost, 0);
  const exp = () => download('inventory.csv', csv([['Name', 'Barcode', 'Category', 'Batch', 'Qty', 'Cost', 'MRP', 'GST', 'Expiry'], ...db.meds.map(m => [m.name, m.barcode, m.category, m.batch, m.qty, m.cost, m.price, m.gst, m.expiry])]), 'text/csv');
  return <>
    <Head title="Reports & Analytics" sub="Sales and inventory summary."><button className="secondary" onClick={exp}>Export Inventory CSV</button></Head>
    <div className="stats"><div className="stat"><p>Total Sales</p><h2>{fmt(db.sales.reduce((a, s) => a + s.total, 0))}</h2></div><div className="stat"><p>Total Purchases</p><h2>{fmt(db.purchases.reduce((a, p) => a + p.total, 0))}</h2></div><div className="stat"><p>Inventory Value</p><h2>{fmt(inv)}</h2></div></div>
    <div className="panel"><h3>Stock and Expiry Report</h3><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Quantity</th><th>Stock Value</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
      <Rows cols={6} list={db.meds.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.batch}</td><td>{m.qty}</td><td>{fmt(m.qty * m.cost)}</td><td>{m.expiry}</td><td><MedPill m={m} /></td></tr>)} /></tbody></table></div></div>
  </>;
}
