import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as L from 'lucide-react';

export const KEY = 'pharmacy-db-v1';
export const fmt = n => '₹' + Number(n).toFixed(2);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
export const padN = (n, l) => String(n).padStart(l, '0');
export const nextId = a => a.reduce((x, y) => Math.max(x, y.id || 0), 0) + 1;
export const status = m => m.expiry < today() ? ['Expired', 'exp'] : m.expiry <= addDays(90) ? ['Near Expiry', 'exp'] : m.qty <= m.min ? ['Low Stock', 'low'] : ['In Stock', 'ok'];
export const isAlert = m => status(m)[1] !== 'ok';
export const pays = s => s.payments || [{ date: s.date, amount: s.total, method: s.payment }];
export const pstat = s => (s.balance || 0) <= 0.005 ? ['Paid', 'ok'] : ((s.paid || 0) > 0 ? ['Partial', 'low'] : ['Unpaid', 'exp']);
export const gstOf = (db, i) => i.gst ?? ((db.meds.find(m => m.id === i.medId || m.name === i.name) || {}).gst ?? 0);
export const form = e => Object.fromEntries(new FormData(e.target));
export const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
export const csv = rows => rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');

export const Pill = ({ s }) => <span className={'pill ' + s[1]}>{s[0]}</span>;
export const MedPill = ({ m }) => <Pill s={status(m)} />;
export const Rows = ({ list, cols, msg = 'No records yet' }) => list.length ? list : <tr><td className="empty" colSpan={cols}>{msg}</td></tr>;

const ICONS = { call: L.Phone, verified_user: L.ShieldCheck, storefront: L.Store, cloud: L.Cloud, arrow_forward: L.ArrowRight, check_circle: L.CheckCircle2, pie_chart: L.PieChart, credit_card: L.CreditCard, lan: L.Network, prescriptions: L.ClipboardPlus, dashboard: L.LayoutDashboard, inventory_2: L.Package, receipt_long: L.Receipt, vaccines: L.Pill, local_shipping: L.Truck, bar_chart: L.BarChart3, barcode_scanner: L.ScanBarcode, assessment: L.FileBarChart, category: L.LayoutGrid, group: L.Users, assignment_return: L.Undo2, clinical_notes: L.ClipboardList, payments: L.Wallet, percent: L.Percent, notifications: L.Bell, settings: L.Settings, policy: L.ShieldAlert, add: L.Plus };
export const Icon = ({ n, size = 20 }) => { const I = ICONS[n]; return <span className="material-symbols-outlined"><I size={size} aria-hidden="true" /></span>; };

const seed = () => ({
  meds: [
    { id: 1, name: 'Paracetamol 500mg', barcode: '8901001', category: 'Tablet', batch: 'PCM01', qty: 120, cost: 12, price: 20, gst: 5, expiry: addDays(400), min: 20 },
    { id: 2, name: 'Amoxicillin 250mg', barcode: '8901002', category: 'Capsule', batch: 'AMX22', qty: 8, cost: 40, price: 65, gst: 12, expiry: addDays(200), min: 15, rx: true },
    { id: 3, name: 'Cetirizine 10mg', barcode: '8901003', category: 'Tablet', batch: 'CTZ09', qty: 60, cost: 8, price: 15, gst: 5, expiry: addDays(40), min: 10 }],
  sales: [], purchases: [],
  suppliers: [{ name: 'MediSupply Co.', contact: 'Ravi', phone: '9876543210', email: 'ravi@medisupply.in', gstin: '33ABCDE1234F1Z5', address: 'Chennai' }]
});
function ensureDefaults(db) {
  const DEF = { categories: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'], customers: [], returns: [], prescriptions: [], taxSlabs: [0, 5, 12, 18, 28], audit: [],
    settings: { name: 'MediCare Pharmacy', address: '', phone: '', gstin: '', dlno: '', user: 'Mohanraj', prefix: 'INV-', footer: 'Thank you! Get well soon.', defaultGst: 5 } };
  Object.keys(DEF).forEach(k => { if (db[k] === undefined) db[k] = structuredClone(DEF[k]); });
  db.settings = { ...DEF.settings, ...db.settings };
  db.meds.forEach(m => { if (m.category && !db.categories.includes(m.category)) db.categories.push(m.category); });
  return db;
}
function load() { let d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch { } return ensureDefaults(d || seed()); }

export function notes(db) {
  const n = [];
  db.meds.forEach(m => {
    const st = status(m)[0];
    if (st === 'Expired') n.push({ t: 'Expiry', c: 'exp', x: `${m.name} (${m.batch}) expired on ${m.expiry}. ${m.qty} units should be removed.` });
    else if (st === 'Near Expiry') n.push({ t: 'Expiry', c: 'exp', x: `${m.name} (${m.batch}) expires on ${m.expiry}` });
    if (m.qty <= m.min && st !== 'Expired') n.push({ t: 'Low Stock', c: 'low', x: `${m.name} has ${m.qty} units left (minimum ${m.min})` });
  });
  db.purchases.filter(p => p.date >= addDays(-7)).forEach(p => n.push({ t: 'Purchase', c: 'ok', x: `Purchase ${p.invoice} from ${p.supplier}: ${p.name} ×${p.qty}` }));
  db.sales.filter(s => (s.balance || 0) > 0.005).forEach(s => n.push({ t: 'Payment', c: 'exp', x: `${s.invoice}: ${fmt(s.balance)} outstanding from ${s.customer || 'Walk-in'}` }));
  return n;
}

const Ctx = createContext();
export const useApp = () => useContext(Ctx);
export function Provider({ children }) {
  const [db, setDb] = useState(load);
  const [msg, setMsg] = useState('');
  const timer = useRef();
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { } }, [db]);
  const toast = useCallback(m => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 2200); }, []);
  // fn(draft, log) must be pure: validate and toast BEFORE calling mutate
  const mutate = fn => setDb(prev => {
    const d = structuredClone(prev);
    const log = (action, detail) => { d.audit.unshift({ time: new Date().toLocaleString('en-IN'), user: d.settings.user, action, detail }); if (d.audit.length > 500) d.audit.length = 500; };
    fn(d, log); return d;
  });
  const replace = d => setDb(ensureDefaults(d));
  return <Ctx.Provider value={{ db, mutate, replace, toast }}>{children}<div id="toast" className={msg ? 'show' : ''} role="status">{msg}</div></Ctx.Provider>;
}
