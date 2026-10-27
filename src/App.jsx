import { useState } from 'react';
import { Provider, useApp, Icon, notes } from './store.jsx';
import { Dashboard, Inventory, Billing, Purchases, Suppliers, Sales, Barcode, Reports } from './pages1.jsx';
import { Categories, Customers, Returns, Prescriptions, Payments, Tax, Notifications, Settings, Audit } from './pages2.jsx';

const MAIN = [['dashboard', 'dashboard', 'Dashboard', Dashboard], ['inventory', 'inventory_2', 'Inventory', Inventory], ['billing', 'receipt_long', 'Billing', Billing], ['purchases', 'vaccines', 'Purchases', Purchases], ['suppliers', 'local_shipping', 'Suppliers', Suppliers], ['sales', 'bar_chart', 'Sales', Sales], ['barcode', 'barcode_scanner', 'Barcode Search', Barcode], ['reports', 'assessment', 'Reports', Reports]];
const MGMT = [['categories', 'category', 'Categories', Categories], ['customers', 'group', 'Customers', Customers], ['returns', 'assignment_return', 'Returns', Returns], ['prescriptions', 'clinical_notes', 'Prescriptions', Prescriptions], ['payments', 'payments', 'Payments', Payments], ['tax', 'percent', 'Tax', Tax], ['notifications', 'notifications', 'Notifications', Notifications], ['settings', 'settings', 'Settings', Settings], ['audit', 'policy', 'Audit & Compliance', Audit]];

const Logo = ({ src }) => <div className="logo"><img className="logo-img" src={src} alt="Logo" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} /></div>;
const FEATURES = [['pie_chart', 'Advance Reporting', 'Advanced analytics help you choose the best strategies for your pharmacy business management.'], ['credit_card', 'Payment Methods', 'Handle cash, UPI and card payments with ease, speed, and security.'], ['lan', 'Branch Management', 'Manage all branches from one centralized dashboard for smoother multi-store operations.'], ['prescriptions', 'Prescription Reports', 'Track which pharmaceutical products are in high demand with detailed reports.']];
const TABS = [['Expiry Management', 'Intelligent Batch & Expiry Date Tracking', 'Monitor products with expiration timelines automatically. Shift near-expiry items to clearance or arrange supplier returns to protect margins.'], ['Reorder Reminders', 'Automated Prescription Reorder Reminders', 'Send timely SMS alerts for refills, record medication history, and boost retention while preventing missed sales.'], ['Drug Substitutes', 'Drug Equivalents & Substitutes Management', 'Access verified lists of equivalent medicines so counter staff can suggest generic or brand substitutes on demand.']];

function Website({ open }) {
  const [tab, setTab] = useState(0), [ok, setOk] = useState(false);
  const submit = e => { e.preventDefault(); e.target.reset(); setOk(true); setTimeout(() => setOk(false), 6000); };
  return <div id="site">
    <header className="nav"><Logo src="/logo2.png" />
      <nav><a href="#features">Industry</a><a href="#platform">Products</a><a href="#features">Integrations</a><a href="#features">Pricing</a><a href="#platform">Resources</a></nav>
      <div className="nav-r"><span className="phone"><Icon n="call" />+91 44 66706611</span><button className="primary" onClick={open}>Welcome</button></div></header>
    <section className="hero">
      <div><h1>Pharmacy Billing Software: Accelerate Claims, Increase Revenue, and Stay Fully Compliant</h1>
        <p>Optimize your pharmacy's financial health and operational efficiency with specialized billing software. Designed to simplify complex claims, minimize errors, and accelerate reimbursements.</p>
        <div className="badges"><span><Icon n="verified_user" />Fast &amp; Secure</span><span><Icon n="storefront" />Multi-Store POS</span><span><Icon n="cloud" />Cloud &amp; On-Prem</span></div>
        <div className="btns"><button className="primary" onClick={open}>Try the Live Software<Icon n="arrow_forward" /></button></div></div>
      <div className="card-form"><h3>Request a Pharmacy Billing Software Demo!</h3>
        <form onSubmit={submit}>
          <label>Name *<input required /></label><label>Company Name *<input required /></label>
          <div className="row"><label>Email *<input type="email" required /></label><label>Phone Number *<input type="tel" required /></label></div>
          <div className="row"><label>City *<input required /></label><label>Country *<input required /></label></div>
          <button className="primary">Submit Demo Request</button></form>
        {ok && <div className="success"><Icon n="check_circle" /> Thank you! Your demo request has been submitted. We'll contact you shortly.</div>}</div>
    </section>
    <section id="features" className="section"><h2>Complete Pharmacy Care Platform</h2><p className="sub">Integrated billing, management, and workflow automation built for modern pharmacies.</p>
      <div className="grid4">{FEATURES.map(([i, h, p]) => <div className="feat" key={h}><div className="ic"><Icon n={i} /></div><h3>{h}</h3><p>{p}</p></div>)}</div></section>
    <div className="tabs-wrap"><section id="platform" className="section" style={{ paddingBlock: 50 }}><h2>Intelligent Capabilities</h2><p className="sub">Core modules built for advanced pharmacy chains.</p>
      <div className="tab-btns">{TABS.map((t, i) => <button key={t[0]} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t[0]}</button>)}</div>
      <div className="tab-panel"><h3>{TABS[tab][1]}</h3><p>{TABS[tab][2]}</p></div></section></div>
    <footer className="site" />
  </div>;
}

function Shell({ back }) {
  const { db } = useApp();
  const [page, setPage] = useState('dashboard');
  const badge = notes(db).filter(n => n.t !== 'Purchase').length;
  const link = ([id, ic, label]) => <a href="#" key={id} className={page === id ? 'active' : ''} onClick={e => { e.preventDefault(); setPage(id); }}><Icon n={ic} />{label}{id === 'notifications' && badge > 0 && <span className="badge">{badge}</span>}</a>;
  return <div id="app"><div className="layout">
    <aside className="sidebar"><h2>{db.settings.name}</h2><Logo src="/logo.png" />
      <p className="menu-label">MAIN MENU</p>
      <nav>{MAIN.map(link)}<p className="menu-label">MANAGEMENT</p>{MGMT.map(link)}</nav>
      <div className="admin"><strong>Pharmacy Admin</strong><p>Administrator</p></div>
      <button className="back" onClick={back}>← Back to Website</button></aside>
    <main className="main">{[...MAIN, ...MGMT].map(([id, , , C]) => <section key={id} className={'page' + (page === id ? ' active' : '')} id={id}><C go={setPage} /></section>)}</main>
  </div></div>;
}

function Root() {
  const [inApp, setInApp] = useState(false);
  return inApp ? <Shell back={() => setInApp(false)} /> : <Website open={() => { setInApp(true); scrollTo(0, 0); }} />;
}
export default function App() { return <Provider><Root /></Provider>; }
