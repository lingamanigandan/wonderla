const missing=new Set();
const $=s=>document.querySelector(s)||(missing.has(s)||(missing.add(s),console.warn('Missing element in index.html:',s)),document.createElement('div'));
const $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>'₹'+Number(n).toFixed(2);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const addDays=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10);
const KEY='pharmacy-db-v1';
let db;
try{db=JSON.parse(localStorage.getItem(KEY))}catch(e){}
if(!db)db={
 meds:[
  {id:1,name:'Paracetamol 500mg',barcode:'8901001',category:'Tablet',batch:'PCM01',qty:120,cost:12,price:20,gst:5,expiry:addDays(400),min:20},
  {id:2,name:'Amoxicillin 250mg',barcode:'8901002',category:'Capsule',batch:'AMX22',qty:8,cost:40,price:65,gst:12,expiry:addDays(200),min:15,rx:true},
  {id:3,name:'Cetirizine 10mg',barcode:'8901003',category:'Tablet',batch:'CTZ09',qty:60,cost:8,price:15,gst:5,expiry:addDays(40),min:10}],
 sales:[],purchases:[],suppliers:[{name:'MediSupply Co.',contact:'Ravi',phone:'9876543210',email:'ravi@medisupply.in',gstin:'33ABCDE1234F1Z5',address:'Chennai'}]};
function ensureDefaults(){
 const DEF={categories:['Tablet','Capsule','Syrup','Injection','Ointment','Drops','Other'],customers:[],returns:[],prescriptions:[],taxSlabs:[0,5,12,18,28],audit:[],
  settings:{name:'Medishop Pharmacy',address:'123, Main Street, Coimbatore, Tamil Nadu - 641001',phone:'+91 98765 43210',email:'medishoppharmacy@gmail.com',gstin:'',dlno:'',user:'Mohanraj',prefix:'INV-',footer:'Take care and stay healthy.',defaultGst:5}};
 Object.keys(DEF).forEach(k=>{if(db[k]===undefined)db[k]=JSON.parse(JSON.stringify(DEF[k]))});
 db.settings=Object.assign({},DEF.settings,db.settings);
 db.meds.forEach(m=>{if(m.category&&!db.categories.includes(m.category))db.categories.push(m.category)});
}
ensureDefaults();
let cart=[];
const log=(action,detail)=>{db.audit.unshift({time:new Date().toLocaleString('en-IN'),user:db.settings.user,action,detail});if(db.audit.length>500)db.audit.length=500};
const sp=a=>`<span class="pill ${a[1]}">${a[0]}</span>`;
const pays=s=>s.payments||[{date:s.date,amount:s.total,method:s.payment}];
const pstat=s=>(s.balance||0)<=0.005?['Paid','ok']:((s.paid||0)>0?['Partial','low']:['Unpaid','exp']);
const fillSel=(sel,html,def)=>{const p=sel.value;sel.innerHTML=html;sel.value=p||def||'';if(sel.selectedIndex<0)sel.selectedIndex=0};
const padN=(n,l)=>String(n).padStart(l,'0');
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};
const status=m=>m.expiry<today()?['Expired','exp']:m.expiry<=addDays(90)?['Near Expiry','exp']:m.qty<=m.min?['Low Stock','low']:['In Stock','ok'];
const isAlert=m=>status(m)[1]!=='ok';
const pill=m=>{const s=status(m);return `<span class="pill ${s[1]}">${s[0]}</span>`};
const rows=(a,cols,msg='No records yet')=>a.length?a.join(''):`<tr><td class="empty" colspan="${cols}">${msg}</td></tr>`;
const nextId=a=>a.reduce((x,y)=>Math.max(x,y.id||0),0)+1;

/* ===== Barcode generation: first 3 letters of supplier + batch number ===== */
/* Example: supplier "MediSupply Co." + batch "PCM01" => MEDPCM01 (adds -2, -3 ... if it already exists) */
const supCode=n=>(String(n||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3))||'GEN';
function makeBarcode(supplier,batch,ignoreId){
 const b=String(batch||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!b)return '';
 const base=supCode(supplier)+b;let code=base,n=2;
 while(db.meds.some(m=>m.barcode===code&&m.id!==ignoreId))code=base+'-'+n++;
 return code}
function drawBarcode(svg,code){
 svg.innerHTML='';
 if(!code||!window.JsBarcode)return;
 try{JsBarcode(svg,code,{format:'CODE128',height:55,width:2,displayValue:true,fontSize:14,margin:6})}catch(x){}}
/* ===== Two barcode modes, chosen automatically =====
   A) MANUFACTURER barcode (typed/scanned from the pack): one barcode per MEDICINE, shared by all its batches.
      Scanning it in Billing picks the earliest-expiry batch automatically (FEFO).
   B) No manufacturer barcode (left blank): a per-BATCH label code (supplier + batch) is generated.
      Scanning it selects exactly that batch. Print the label with the Label button.
   Batch rule: same medicine name + same batch number = same lot (stock is added to it);
   a new batch number = a new inventory row with its own quantity and expiry. */
function findBatch(){
 const n=$('#med-name').value.trim().toLowerCase(),b=$('#med-batch').value.trim().toLowerCase();
 return n&&b?db.meds.find(x=>x.name.toLowerCase()===n&&String(x.batch).toLowerCase()===b):null}
function resolveBarcode(name,supplier,batch,typed){
 typed=String(typed||'').trim();const nm=String(name||'').toLowerCase();
 if(typed){
  const clash=db.meds.find(x=>x.barcode.toLowerCase()===typed.toLowerCase()&&x.name.toLowerCase()!==nm);
  if(clash)return{error:`Barcode ${typed} already belongs to ${clash.name}`};
  return{barcode:typed,type:'mfr'}}
 const same=nm&&db.meds.find(x=>x.name.toLowerCase()===nm&&x.bcType!=='auto'&&x.barcode);
 if(same)return{barcode:same.barcode,type:'mfr',inherited:true};
 const b=makeBarcode(supplier,batch);
 return b?{barcode:b,type:'auto'}:{error:'Enter a valid batch number'}}
function refreshBarcode(){
 const ex=findBatch(),note=$('#batch-note');
 const r=ex?{barcode:ex.barcode,type:ex.bcType==='auto'?'auto':'mfr'}:resolveBarcode($('#med-name').value.trim(),$('#med-supplier').value,$('#med-batch').value.trim(),$('#med-barcode').value);
 drawBarcode($('#med-barcode-svg'),r.barcode||'');
 const blue='background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af',orange='background:#fff7ed;border:1px solid #fed7aa;color:#9a3412',red='background:#fef2f2;border:1px solid #fecaca;color:#991b1b';
 let css=blue,msg;
 if(ex){css=orange;msg=`Batch ${ex.batch} of ${ex.name} already exists (${ex.qty} in stock, expiry ${ex.expiry}). The quantity you enter will be ADDED to it and barcode ${ex.barcode} is kept.`}
 else if(r.error){css=$('#med-batch').value.trim()||$('#med-barcode').value.trim()?red:blue;msg=$('#med-batch').value.trim()||$('#med-barcode').value.trim()?r.error:'Type the batch number printed on the pack. If the pack has a barcode, scan it into the Manufacturer Barcode box; otherwise leave it blank and a batch label code is generated.'}
 else if(r.type==='auto')msg=`No manufacturer barcode: batch label code ${r.barcode} will be generated. Scanning it selects exactly this batch. Print the label after saving.`;
 else if(r.inherited)msg=`This medicine already uses barcode ${r.barcode}. The new batch shares it, and billing picks the earliest-expiry batch automatically (FEFO).`;
 else msg=`Manufacturer barcode ${r.barcode}: shared by all batches of this medicine. Billing picks the earliest-expiry batch automatically (FEFO).`;
 note.style.cssText=css+';border-radius:8px;padding:10px 12px;font-size:13px';note.textContent=msg}
function printLabel(id){
 const m=db.meds.find(x=>x.id===id);if(!m)return;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');drawBarcode(svg,m.barcode);
 const w=window.open('','_blank');if(!w)return toast('Allow pop-ups to print');
 w.document.write(`<html><head><title>${esc(m.barcode)}</title></head><body style="font-family:Arial;text-align:center;margin:20px"><div style="display:inline-block;border:1px dashed #999;padding:10px 16px"><b>${esc(db.settings.name)}</b><br>${esc(m.name)}<br><small>Batch ${esc(m.batch)} · Exp ${m.expiry} · MRP ${fmt(m.price)}</small><br>${svg.outerHTML}</div><script>window.print()<\/script></body></html>`);
 w.document.close()}

/* ===== Hardware barcode scanner (USB / Bluetooth) =====
   A scanner types the number like a keyboard and presses Enter. We keep the cursor in the right box
   on the Billing and Barcode Search pages, so every scan lands there. */
const scanBoxes={billing:'#bill-search',barcode:'#barcode-input'};
const curPage=()=>($('.page.active')||{}).id;
function focusScanBox(p){const sel=scanBoxes[p||curPage()];if(sel)setTimeout(()=>$(sel).focus(),60)}
document.addEventListener('keydown',e=>{
 const sel=scanBoxes[curPage()];if(!sel)return;
 const tag=((e.target&&e.target.tagName)||'').toLowerCase();
 if(tag==='input'||tag==='select'||tag==='textarea'||e.ctrlKey||e.altKey||e.metaKey||e.key.length!==1)return;
 $(sel).focus()});

/* Navigation */
function go(p){$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===p));render();focusScanBox(p)}
$$('.sidebar nav a').forEach(a=>a.onclick=e=>{e.preventDefault();go(a.dataset.page)});
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

/* Inventory */
$('#show-med').onclick=()=>{$('#med-form').classList.toggle('hidden');refreshBarcode()};
$('#cancel-med').onclick=()=>$('#med-form').classList.add('hidden');
$('#med-batch').oninput=refreshBarcode;
$('#med-name').oninput=refreshBarcode;
$('#med-barcode').oninput=refreshBarcode;
$('#med-barcode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#med-category').focus()}};
$('#med-supplier').onchange=refreshBarcode;
$('#med-form').onsubmit=e=>{e.preventDefault();
 const v=i=>$('#med-'+i).value;
 const name=v('name').trim(),batch=v('batch').trim(),qty=+v('qty');
 if(!batch)return toast('Enter a valid batch number');
 /* Same medicine + same batch = same lot: add to the existing row. A new batch number = new row. */
 let m=db.meds.find(x=>x.name.toLowerCase()===name.toLowerCase()&&String(x.batch).toLowerCase()===batch.toLowerCase());
 if(m){
  m.qty+=qty;m.cost=+v('cost');m.price=+v('price');m.expiry=v('expiry');
  log('Stock added',`${m.name} (${m.batch}) +${qty} added to existing batch, barcode ${m.barcode}`);
 }else{
  const r=resolveBarcode(name,v('supplier'),batch,v('barcode'));
  if(r.error)return toast(r.error);
  const barcode=r.barcode;
  m={id:nextId(db.meds),name,barcode,bcType:r.type,supplier:v('supplier'),category:v('category'),batch,qty,cost:+v('cost'),price:+v('price'),gst:+v('gst'),expiry:v('expiry'),min:+v('min'),rx:v('rx')==='yes'};
  db.meds.push(m);log('Stock added',`${m.name} (${m.batch}) opening quantity ${m.qty}, barcode ${m.barcode}`);
 }
 save();e.target.reset();$('#med-gst').value=db.settings.defaultGst;
 refreshBarcode();e.target.classList.add('hidden');toast('Medicine saved. Barcode: '+m.barcode);render()};
function delMed(id){const m=db.meds.find(x=>x.id===id);if(confirm('Delete this medicine?')){db.meds=db.meds.filter(x=>x.id!==id);log('Medicine deleted',`${m.name} (${m.batch})`);save();render()}}
function adjMed(id){const m=db.meds.find(x=>x.id===id),v=prompt(`New quantity for ${m.name} (current ${m.qty}):`,m.qty);if(v===null)return;
 const n=parseInt(v);if(isNaN(n)||n<0)return toast('Invalid quantity');
 const r=prompt('Reason for adjustment:','Stock count correction');if(!r)return toast('Reason is required');
 log('Stock adjusted',`${m.name} (${m.batch}): ${m.qty} to ${n}. ${r}`);m.qty=n;save();render()}
$('#inventory-search').oninput=renderInventory;$('#stock-filter').onchange=renderInventory;
function renderInventory(){
 const q=$('#inventory-search').value.toLowerCase(),f=$('#stock-filter').value,c=$('#cat-filter').value;
 const list=db.meds.filter(m=>(m.name+m.barcode).toLowerCase().includes(q)&&(!c||m.category===c)&&(f==='all'||(f==='low'?m.qty<=m.min:status(m)[0].includes('Exp'))));
 $('#inventory-table').innerHTML=rows(list.map(m=>`<tr><td>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''}<br><small style="color:#9ca3af">${esc(m.category||'')}${m.supplier?' · '+esc(m.supplier):''}</small></td><td>${esc(m.barcode)}<br><small style="color:#9ca3af">${m.bcType==='auto'?'Batch label':'Shared (all batches)'}</small></td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${fmt(m.price)}</td><td>${m.expiry}</td><td>${pill(m)}</td><td><button class="secondary" onclick="printLabel(${m.id})">Label</button> <button class="secondary" onclick="adjMed(${m.id})">Adjust</button> <button class="danger-btn" onclick="delMed(${m.id})">Delete</button></td></tr>`),8,'No medicines found');
}

/* Billing */
let paidTouched=false;
$('#amount-paid').oninput=()=>{paidTouched=true};
$('#bill-search').oninput=()=>{
 const q=$('#bill-search').value.toLowerCase().trim();
 /* Only unexpired batches with stock; earliest expiry first (FEFO) */
 const list=q?db.meds.filter(m=>m.qty>0&&m.expiry>=today()&&(m.name+m.barcode+m.batch).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)||a.expiry.localeCompare(b.expiry)).slice(0,8):[];
 const seen=new Set();
 $('#bill-results').innerHTML=list.map(m=>{const k=m.name.toLowerCase(),first=!seen.has(k);seen.add(k);
  return `<div class="result-row"><span>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''} <small>(Batch ${esc(m.batch)} · ${m.qty} in stock · Exp ${m.expiry})</small>${first?' <span class="pill ok">Sell first</span>':''}</span><span>${fmt(m.price)} <button class="primary" onclick="addCart(${m.id})">Add</button></span></div>`}).join('')};
$('#bill-search').onkeydown=e=>{if(e.key!=='Enter')return;
 const code=e.target.value.trim().toLowerCase();if(!code)return;
 const hits=db.meds.filter(x=>x.barcode.toLowerCase()===code);
 if(!hits.length){if(!db.meds.some(x=>(x.name+x.batch).toLowerCase().includes(code)))toast('No medicine found for this barcode');return}
 /* Shared manufacturer barcode: earliest-expiry sellable batch (FEFO). Batch label: exactly that batch. */
 const m=hits.filter(x=>x.qty>0&&x.expiry>=today()).sort((a,b)=>a.expiry.localeCompare(b.expiry))[0];
 if(!m)return toast('All batches for this barcode are out of stock or expired');
 addCart(m.id);e.target.value='';$('#bill-results').innerHTML='';
 if(hits.length>1)toast(`FEFO: batch ${m.batch} (expiry ${m.expiry})`)};
function addCart(id){const m=db.meds.find(x=>x.id===id),c=cart.find(x=>x.id===id);
 if(!c){cart.push({id,qty:1});return renderCart()}
 if(c.qty<m.qty){c.qty++;return renderCart()}
 /* This batch is fully in the cart: continue with the next batch of the same medicine (earliest expiry first) */
 const inCart=x=>(cart.find(y=>y.id===x.id)||{qty:0}).qty;
 const next=db.meds.filter(x=>x.name===m.name&&x.id!==id&&x.expiry>=today()&&x.qty>inCart(x)).sort((a,b)=>a.expiry.localeCompare(b.expiry))[0];
 if(next){addCart(next.id);toast(`Batch ${m.batch} used up. Added batch ${next.batch}`)}else toast('Not enough stock')}
function setQty(id,v){const m=db.meds.find(x=>x.id===id),c=cart.find(x=>x.id===id);c.qty=Math.max(1,Math.min(+v||1,m.qty));renderCart()}
function rmCart(id){cart=cart.filter(x=>x.id!==id);renderCart()}
/* GST rate for a cart item: the Tax option on the Billing page, or the medicine's own rate by default */
const billRate=m=>{const v=$('#bill-tax').value;return v===''?m.gst:+v};
$('#bill-tax').onchange=()=>renderCart();
function totals(){let s=0,t=0;cart.forEach(c=>{const m=db.meds.find(x=>x.id===c.id),l=m.price*c.qty;s+=l;t+=l*billRate(m)/100});return{s,t}}
function renderCart(){
 $('#cart-table').innerHTML=rows(cart.map(c=>{const m=db.meds.find(x=>x.id===c.id),l=m.price*c.qty;return `<tr><td>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''}</td><td><input type="number" value="${c.qty}" min="1" style="width:80px" onchange="setQty(${m.id},this.value)"></td><td>${fmt(m.price)}</td><td>${billRate(m)}%</td><td>${fmt(l*(1+billRate(m)/100))}</td><td><button class="danger-btn" onclick="rmCart(${m.id})">Remove</button></td></tr>`}),6,'Cart is empty');
 const {s,t}=totals();$('#subtotal').textContent=fmt(s);$('#tax').textContent=fmt(t);$('#grand-total').textContent=fmt(s+t);
 if(!paidTouched)$('#amount-paid').value=(s+t).toFixed(2);
 $('#rx-box').classList.toggle('hidden',!cart.some(c=>db.meds.find(x=>x.id===c.id).rx))}
function fillBillSelects(){
 fillSel($('#bill-customer'),'<option value="">Walk-in Customer</option>'+db.customers.map(c=>`<option value="${c.id}">${esc(c.name)} (${esc(c.phone)})</option>`).join(''));
 fillSel($('#bill-rx'),'<option value="">Select prescription...</option>'+db.prescriptions.filter(p=>p.valid>=today()).map(p=>`<option value="${p.id}">${p.id} · ${esc(p.patient)} · Dr. ${esc(p.doctor)}</option>`).join(''))}
$('#checkout').onclick=()=>{
 if(!cart.length)return toast('Cart is empty');
 const needRx=cart.some(c=>db.meds.find(x=>x.id===c.id).rx),rxId=$('#bill-rx').value;
 if(needRx){if(!rxId)return toast('Select a prescription for Rx medicines');
  const p=db.prescriptions.find(x=>x.id===rxId);if(!p||p.valid<today())return toast('Prescription is expired or invalid')}
 const {s,t}=totals(),total=s+t,paid=Math.min(Math.max(+$('#amount-paid').value||0,0),total),bal=total-paid;
 const custId=$('#bill-customer').value,cust=db.customers.find(c=>String(c.id)===custId);
 if(bal>0.005&&!cust)return toast('Select a customer to bill on credit');
 const items=cart.map(c=>{const m=db.meds.find(x=>x.id===c.id);m.qty-=c.qty;return{medId:m.id,name:m.name,batch:m.batch,qty:c.qty,price:m.price,gst:billRate(m),expiry:m.expiry}});
 const invoice=db.settings.prefix+padN(db.sales.length+1,4);
 const sale={invoice,date:today(),time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),items,count:items.reduce((a,i)=>a+i.qty,0),payment:$('#payment').value,subtotal:s,gst:t,total,paid,balance:bal,customerId:cust?cust.id:null,customer:cust?cust.name:'Walk-in',rx:needRx?rxId:null,payments:paid>0?[{date:today(),amount:paid,method:$('#payment').value}]:[]};
 db.sales.unshift(sale);
 items.forEach(i=>log('Stock deducted',`${i.name} (${i.batch}) -${i.qty} via ${invoice}`));
 log('Invoice created',`${invoice} · ${fmt(total)} · ${sale.customer}${bal>0.005?' · balance '+fmt(bal):''}`);
 save();toast('Sale completed: '+invoice);cart=[];paidTouched=false;$('#bill-search').value='';$('#bill-results').innerHTML='';$('#bill-rx').value='';$('#bill-customer').value='';$('#bill-tax').value='';render();$('#bill-search').focus();if($('#print-after').checked)printInv(invoice)};

/* Purchases */
$('#purchase-form').onsubmit=e=>{e.preventDefault();
 const v=i=>$('#pur-'+i).value.trim(),qty=+v('qty'),cost=+v('cost'),mrp=+v('mrp');
 let m=db.meds.find(x=>x.name.toLowerCase()===v('name').toLowerCase()&&x.batch===v('batch'));
 if(m){m.qty+=qty;m.cost=cost;m.price=mrp;m.expiry=v('expiry');if(!m.supplier)m.supplier=v('supplier')}
 else{
  const r=resolveBarcode(v('name'),v('supplier'),v('batch'),'');
  if(r.error)return toast(r.error);
  const barcode=r.barcode;
  m={id:nextId(db.meds),name:v('name'),barcode,bcType:r.type,supplier:v('supplier'),category:db.categories.includes('Other')?'Other':(db.categories[0]||''),batch:v('batch'),qty,cost,price:mrp,gst:db.settings.defaultGst,expiry:v('expiry'),min:10,rx:false};db.meds.push(m)}
 db.purchases.unshift({invoice:v('invoice'),supplier:v('supplier'),name:v('name'),batch:v('batch'),qty,total:qty*cost,date:today()});
 log('Stock added',`${m.name} (${m.batch}) +${qty} via purchase ${v('invoice')} from ${v('supplier')}, barcode ${m.barcode}`);
 save();e.target.reset();toast('Purchase recorded. Barcode: '+m.barcode);render()};

/* Suppliers */
$('#show-supplier').onclick=()=>$('#supplier-form').classList.toggle('hidden');
$('#supplier-form').onsubmit=e=>{e.preventDefault();const v=i=>$('#sup-'+i).value.trim();
 db.suppliers.push({name:v('name'),contact:v('contact'),phone:v('phone'),email:v('email'),gstin:v('gstin'),address:v('address')});
 save();e.target.reset();e.target.classList.add('hidden');toast('Supplier saved');render()};
$('#supplier-search').oninput=renderSuppliers;
function renderSuppliers(){const q=$('#supplier-search').value.toLowerCase();
 fillSel($('#med-supplier'),db.suppliers.length?db.suppliers.map(s=>`<option>${esc(s.name)}</option>`).join(''):'<option>General</option>');
 $('#sup-list').innerHTML=db.suppliers.map(s=>`<option value="${esc(s.name)}"></option>`).join('');
 $('#supplier-table').innerHTML=rows(db.suppliers.filter(s=>s.name.toLowerCase().includes(q)).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.contact||'-')}</td><td>${esc(s.phone)}</td><td>${esc(s.email||'-')}</td><td>${esc(s.gstin||'-')}</td></tr>`),5)}

/* Sales */
$('#sales-search').oninput=renderSales;$('#sales-date').onchange=renderSales;
function renderSales(){const q=$('#sales-search').value.toLowerCase(),d=$('#sales-date').value;
 $('#sales-table').innerHTML=rows(db.sales.filter(s=>s.invoice.toLowerCase().includes(q)&&(!d||s.date===d)).map(s=>`<tr><td>${s.invoice}</td><td>${s.date}</td><td>${esc(s.customer||'Walk-in')}</td><td>${s.count}</td><td>${s.payment}</td><td>${fmt(s.subtotal)}</td><td>${fmt(s.gst)}</td><td>${fmt(s.total)}</td><td>${sp(pstat(s))}</td><td><button class="secondary" onclick="printInv('${s.invoice}')">Print</button></td></tr>`),10)}
/* Sales invoice print: Medishop template design (A4) */
function printInv(no){
 const s=db.sales.find(x=>x.invoice===no);if(!s)return;
 const st=db.settings,w=window.open('','_blank');
 if(!w)return toast('Allow pop-ups to print');
 const T='#0b5d5b',G='#22a45d';
 const ig=i=>i.gst??((db.meds.find(m=>m.id===i.medId||m.name===i.name)||{}).gst??0);
 const exp=i=>{const e=i.expiry||(db.meds.find(m=>m.id===i.medId)||{}).expiry||'';return e?e.slice(5,7)+'/'+e.slice(0,4):'-'};
 const dmy=d=>d?String(d).split('-').reverse().join('-'):'-';
 const cust=db.customers.find(c=>String(c.id)===String(s.customerId));
 const logo=new URL('mmm.png',location.href).href,logo2=new URL('logo.svg',location.href).href;
 const discount=s.discount||0,taxable=s.subtotal-discount;
 const rates=[...new Set(s.items.map(ig))];
 const gstLabel=rates.length===1?`GST (${rates[0]}%)`:'GST';
 const P={loc:'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  tel:'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z',
  mail:'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  user:'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  doc:'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  cal:'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z',
  clock:'M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-5V7h2v4h3v2z',
  card:'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  shield:'M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm-2 16l-4-4 1.4-1.4L10 14.2l6.6-6.6L18 9l-8 8z',
  group:'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  bottle:'M10 2h4v2h-4V2zm-2 3h8v2l1 2v11c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2V9l1-2V5zm3 6v2H9v2h2v2h2v-2h2v-2h-2v-2h-2z',
  heart:'M12 21.4l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.6L12 21.4z'};
 const I=(k,sz,c)=>`<svg viewBox="0 0 24 24" width="${sz||20}" height="${sz||20}" fill="${c||T}"><path d="${P[k]}"/></svg>`;
 const body=s.items.map((i,n)=>`<tr><td class="c">${n+1}</td><td>${esc(i.name)}</td><td class="c">${esc(i.batch||'-')}</td><td class="c">${exp(i)}</td><td class="c">${i.qty}</td><td class="r">${fmt(i.price)}</td><td class="r">${fmt(i.price)}</td><td class="r">${fmt(i.price*i.qty)}</td></tr>`);
 while(body.length<5)body.push('<tr>'+'<td>&nbsp;</td>'.repeat(8)+'</tr>');
 const contact=[['loc',st.address],['tel',st.phone],['mail',st.email]].filter(x=>x[1]).map(x=>`<div>${I(x[0],18)}<span>${esc(x[1])}</span></div>`).join('');
 const css=`@page{size:A4;margin:0}*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{position:relative;width:200mm;min-height:287mm;margin:5mm auto;border:2px solid ${T};border-radius:14px;padding:8mm 9mm;overflow:hidden}
.wm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:120mm;opacity:.07;z-index:0}
.in{position:relative;z-index:1}
.head{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1.5px solid ${T}}
.head img{height:64px;max-width:105mm;object-fit:contain}.head h1{margin:0;color:${T};font-size:24px}
.contact div{display:flex;gap:8px;align-items:center;margin:5px 0;font-size:11.5px}
.title{text-align:center;margin:10px 0}
.title span{display:inline-block;background:${T};color:#fff;font-weight:700;font-size:20px;letter-spacing:1px;padding:5px 46px;border-radius:30px}
.meta{display:flex;background:#e6f4f1;border-radius:10px;padding:8px 10px;gap:10px}
.meta>div{flex:1;display:flex;gap:7px;align-items:center}
.meta b{display:block;font-size:10.5px;color:#374151;font-weight:600}
.v{display:block;background:#fff;border:1px solid #cfe3de;border-radius:5px;padding:4px 6px;min-height:22px;font-size:12px;font-weight:600}
.cust{display:flex;border:1.5px solid ${G};border-radius:10px;margin:10px 0;padding:8px 10px}
.cust .l{flex:1.2;border-right:1px solid #cfd8d6;padding-right:12px}.cust .rt{flex:1;padding-left:14px}
.fld{display:flex;gap:9px;align-items:flex-start;margin:4px 0}.fld>div{flex:1}.fld b{font-size:12px;display:block;margin-bottom:2px}
table.items{width:100%;border-collapse:collapse;border:1px solid #cfd8d6}
.items th{background:${T};color:#fff;padding:8px 4px;font-size:11.5px}
.items td{border:1px solid #d5dedc;padding:6px 5px;height:26px;font-size:12px}
.c{text-align:center}.r{text-align:right}
.bottom{display:flex;gap:14px;align-items:flex-end;margin-top:10px}
.thanks{flex:1.2;display:flex;gap:10px;align-items:center;background:#e1f3e4;border-radius:8px;padding:12px}
.thanks b{color:${T};font-size:13.5px;display:block;margin-bottom:2px}
.tot{flex:.9;border:1px solid #cfd8d6;border-radius:8px;overflow:hidden}
.tot div{display:flex;border-bottom:1px solid #d5dedc}.tot div span{padding:7px 9px}
.tot div span:first-child{flex:1;font-weight:700;background:#eef6f4}.tot div span:last-child{width:46%;text-align:right}
.tot .g{background:${T};color:#fff;font-size:15px;font-weight:700;border:0}.tot .g span:first-child{background:${T}}
.feat{display:flex;border-top:1px solid #cfd8d6;margin-top:14px;padding-top:10px}
.feat div{flex:1;display:flex;gap:8px;align-items:center;justify-content:center;font-size:11.5px}
.foot{display:flex;border-top:1px solid #cfd8d6;margin-top:10px;padding-top:8px;gap:12px}
.foot .n{flex:1.5;font-size:11px;line-height:1.5}
.foot .sg{flex:1;text-align:center;border-left:1px solid #cfd8d6;padding-top:38px;font-size:12px}`;
 const html=`<html><head><title>${esc(no)}</title><style>${css}</style><script>var LOGO2=${JSON.stringify(logo2)},NAME=${JSON.stringify(String(st.name)).replace(/</g,'\\u003c')};function logoFail(i){if(i.getAttribute('data-t')){var h=document.createElement('h1');h.textContent=NAME;i.replaceWith(h)}else{i.setAttribute('data-t','1');i.src=LOGO2}}<\/script></head><body><div class="sheet">
<img class="wm" src="${logo}" onerror="this.style.display='none'">
<div class="in">
<div class="head"><img src="${logo}" alt="${esc(st.name)}" onerror="logoFail(this)"><div class="contact">${contact}</div></div>
<div class="title"><span>SALES INVOICE</span></div>
<div class="meta">
<div>${I('doc',26)}<div><b>Invoice No.</b><span class="v">${esc(s.invoice)}</span></div></div>
<div>${I('cal',26)}<div><b>Date</b><span class="v">${dmy(s.date)}</span></div></div>
<div>${I('clock',26)}<div><b>Time</b><span class="v">${esc(s.time||'-')}</span></div></div>
<div>${I('card',26)}<div><b>Payment Mode</b><span class="v">${esc(s.payment||'-')}</span></div></div>
</div>
<div class="cust"><div class="l">
<div class="fld">${I('user',24)}<div><b>Customer Name:</b><span class="v">${esc(s.customer||'Walk-in')}</span></div></div>
<div class="fld">${I('tel',24)}<div><b>Mobile Number:</b><span class="v">${esc(cust?cust.phone:'-')}</span></div></div>
</div><div class="rt"><div class="fld">${I('doc',24)}<div><b>Prescription Number:</b><span class="v">${esc(s.rx||'-')}</span></div></div></div></div>
<table class="items"><thead><tr><th style="width:7%">S.No</th><th>Medicine Name</th><th style="width:12%">Batch No.</th><th style="width:10%">Expiry</th><th style="width:7%">Qty</th><th style="width:10%">MRP (₹)</th><th style="width:10%">Rate (₹)</th><th style="width:12%">Amount (₹)</th></tr></thead><tbody>${body.join('')}</tbody></table>
<div class="bottom">
<div class="thanks">${I('heart',38,G)}<div><b>Thank you for choosing ${esc(st.name)}!</b>${esc(st.footer||'')}</div></div>
<div class="tot">
<div><span>Total Amount</span><span>${fmt(s.subtotal)}</span></div>
<div><span>Discount</span><span>${fmt(discount)}</span></div>
<div><span>Taxable Amount</span><span>${fmt(taxable)}</span></div>
<div><span>${gstLabel}</span><span>${fmt(s.gst)}</span></div>
<div class="g"><span>Grand Total</span><span>${fmt(s.total)}</span></div>
${(s.balance||0)>0.005?`<div><span>Paid</span><span>${fmt(s.paid||0)}</span></div><div><span>Balance Due</span><span>${fmt(s.balance)}</span></div>`:''}
</div></div>
<div class="feat"><div>${I('bottle',30)}<span>Genuine Medicines<br>Assured Quality</span></div><div>${I('shield',30)}<span>Your Health<br>Our Priority</span></div><div>${I('group',30)}<span>Trusted by Families<br>Everyday</span></div></div>
<div class="foot"><div class="n"><b>Note:</b><br>1. Goods once sold will not be taken back or exchanged.<br>2. Please consult your doctor for dosage and usage.<br>3. Keep medicines out of reach of children.<br>4. For any queries, contact us at the above number.</div>
<div class="sg">Authorized Signature<br><b>${esc(st.name)}</b></div></div>
</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`;
 w.document.write(html);w.document.close()}

/* Barcode search (case-insensitive exact match) */
$('#barcode-form').onsubmit=e=>{e.preventDefault();
 const code=$('#barcode-input').value.trim().toLowerCase();
 const hits=db.meds.filter(x=>x.barcode.toLowerCase()===code).sort((a,b)=>a.expiry.localeCompare(b.expiry));
 const first=hits.find(x=>x.qty>0&&x.expiry>=today());
 $('#barcode-result').innerHTML=hits.length?hits.map(m=>`<div class="result-row" style="text-align:left"><span><strong>${esc(m.name)}</strong>${m===first?' <span class="pill ok">Sell first</span>':''}<br><small>${esc(m.category)} · Batch ${esc(m.batch)}${m.supplier?' · '+esc(m.supplier):''} · Exp ${m.expiry}</small></span><span>${fmt(m.price)}<br>${m.qty} units ${pill(m)}</span></div>`).join(''):'<p class="empty">No medicine found for this barcode.</p>'};

/* Reports */
$('#export').onclick=()=>{
 const csv=['Name,Barcode,Supplier,Category,Batch,Qty,Cost,MRP,GST,Expiry'].concat(db.meds.map(m=>[m.name,m.barcode,m.supplier||'',m.category,m.batch,m.qty,m.cost,m.price,m.gst,m.expiry].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='inventory.csv';a.click()};

/* Charts (pure SVG, no libraries) */
function barChart(data,money){
 const W=420,H=230,L=44,B=28,T=22,max=Math.max(...data.map(d=>d.value),1),ph=H-B-T,bw=(W-L-10)/data.length;
 let s=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}">`;
 for(let i=0;i<=4;i++){const y=T+ph-ph*i/4,v=max*i/4;
  s+=`<line x1="${L}" x2="${W-10}" y1="${y}" y2="${y}" stroke="#eef0f3"/><text x="${L-6}" y="${y+4}" text-anchor="end">${money?'₹'+Math.round(v):Math.round(v)}</text>`}
 data.forEach((d,i)=>{const h=ph*d.value/max,x=L+i*bw+bw*.2,y=T+ph-h;
  s+=`<rect class="bar" x="${x}" y="${y}" width="${bw*.6}" height="${h}" rx="4" fill="#2563eb"><title>${esc(d.label)}: ${money?fmt(d.value):d.value}</title></rect>`;
  if(d.value>0)s+=`<text class="val" x="${x+bw*.3}" y="${y-5}" text-anchor="middle">${money?'₹'+Math.round(d.value):d.value}</text>`;
  s+=`<text x="${x+bw*.3}" y="${H-10}" text-anchor="middle">${esc(d.label)}</text>`});
 return s+'</svg>'}
function donut(segs,centerLabel){
 const total=segs.reduce((a,x)=>a+x.value,0),r=60,C=2*Math.PI*r;let off=0;
 let s=`<svg viewBox="0 0 170 170"><circle cx="85" cy="85" r="${r}" fill="none" stroke="#eef2f7" stroke-width="26"/>`;
 if(total)segs.forEach(x=>{if(!x.value)return;const len=C*x.value/total;
  s+=`<circle cx="85" cy="85" r="${r}" fill="none" stroke="${x.color}" stroke-width="26" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)"><title>${esc(x.label)}: ${x.value}</title></circle>`;off+=len});
 s+=`<text class="c-num" x="85" y="88">${total}</text><text class="c-lbl" x="85" y="106">${centerLabel}</text></svg>`;
 return `<div class="donut-wrap">${s}<div class="legend">${segs.map(x=>`<div><i style="background:${x.color}"></i>${esc(x.label)}<b>${x.value}</b></div>`).join('')}</div></div>`}
function renderCharts(){
 const days=[];
 for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*864e5),k=d.toISOString().slice(0,10);
  days.push({label:d.toLocaleDateString('en-IN',{weekday:'short'}),value:db.sales.filter(s=>s.date===k).reduce((a,s)=>a+s.total,0)})}
 $('#chart-sales').innerHTML=barChart(days,true);
 const cnt=n=>db.meds.filter(m=>status(m)[0]===n).length;
 $('#chart-status').innerHTML=donut([
  {label:'In Stock',value:cnt('In Stock'),color:'#22c55e'},
  {label:'Low Stock',value:cnt('Low Stock'),color:'#f59e0b'},
  {label:'Near Expiry',value:cnt('Near Expiry'),color:'#fb923c'},
  {label:'Expired',value:cnt('Expired'),color:'#ef4444'}],'medicines');
 const top=[...db.meds].sort((a,b)=>b.qty-a.qty).slice(0,6),mx=Math.max(...top.map(m=>m.qty),1);
 $('#chart-stock').innerHTML=top.length?top.map(m=>`<div class="hbar"><span title="${esc(m.name)}">${esc(m.name)}</span><span class="track"><span class="fill" style="display:block;width:${m.qty/mx*100}%;background:${m.qty<=m.min?'#f59e0b':'#2563eb'}"></span></span><span class="n">${m.qty}</span></div>`).join(''):'<p class="empty">No medicines yet</p>';
 const pay=['Cash','UPI','Card'];
 $('#chart-pay').innerHTML=donut(pay.map((p,i)=>({label:p,value:db.sales.filter(s=>s.payment===p).length,color:['#2563eb','#8b5cf6','#06b6d4'][i]})),'sales');
}

/* ===== Management modules ===== */
/* Categories */
$('#cat-form').onsubmit=e=>{e.preventDefault();const n=$('#cat-name').value.trim();
 if(db.categories.some(c=>c.toLowerCase()===n.toLowerCase()))return toast('Category already exists');
 db.categories.push(n);log('Category added',n);save();e.target.reset();toast('Category added');render()};
function delCat(i){const c=db.categories[i];if(db.meds.some(m=>m.category===c))return toast('Category has medicines, cannot delete');
 db.categories.splice(i,1);log('Category deleted',c);save();render()}
$('#cat-filter').onchange=renderInventory;
function renderCats(){
 const o=db.categories.map(c=>`<option>${esc(c)}</option>`).join('');
 fillSel($('#med-category'),o);fillSel($('#cat-filter'),'<option value="">All Categories</option>'+o);
 $('#cat-grid').innerHTML=db.categories.map((c,i)=>{const ms=db.meds.filter(m=>m.category===c);return `<div class="stat"><p>${esc(c)}</p><h2>${ms.length}</h2><small>${ms.reduce((a,m)=>a+m.qty,0)} units in stock</small><div style="margin-top:8px"><button class="danger-btn" onclick="delCat(${i})">Delete</button></div></div>`}).join('')}

/* Customers - MySQL API integration */
const API_BASE="http://localhost:5000/api";

$('#show-cust').onclick=()=>{$('#customer-form').classList.toggle('hidden')};

async function loadCustomersFromMySQL(){
 try{
  const response=await fetch(`${API_BASE}/customers`);
  const data=await response.json();
  if(!response.ok||!data.success)throw new Error(data.message||"Unable to load customers");
  // Replace the browser customer list with MySQL records.
  db.customers=data.customers.map(c=>({...c,created:c.created_at||today()}));
  save();renderCustomers();fillBillSelects();
 }catch(error){
  console.warn("Customer server not reachable at "+API_BASE+":",error.message);
  toast("Customer server is offline. Showing saved customers only");
 }
}

$('#customer-form').onsubmit=async e=>{
 e.preventDefault();
 const v=i=>$(`#cust-${i}`).value.trim();
 const customer={name:v('name'),phone:v('phone'),email:v('email'),address:v('address')};
 if(!customer.name||!customer.phone)return toast("Customer name and phone are required");
 try{
  const response=await fetch(`${API_BASE}/customers`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(customer)});
  const data=await response.json();
  if(!response.ok||!data.success)throw new Error(data.message||"Unable to save customer");
  const savedCustomer={...data.customer,created:today()};
  // Use the ID generated by MySQL.
  db.customers.unshift(savedCustomer);
  log("Customer added",savedCustomer.name);
  save();e.target.reset();e.target.classList.add('hidden');
  renderCustomers();fillBillSelects();
  toast("Customer saved to MySQL successfully");
 }catch(error){
  console.error("Customer saving error:",error);
  toast(error.message||"Could not save customer");
 }
};

$('#customer-search').oninput=renderCustomers;

function renderCustomers(){
 const q=$('#customer-search').value.toLowerCase();
 const customers=db.customers.filter(c=>`${c.name||''} ${c.phone||''}`.toLowerCase().includes(q));
 $('#customer-table').innerHTML=rows(customers.map(c=>{
  const ss=db.sales.filter(s=>String(s.customerId)===String(c.id));
  return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.email||'-')}</td><td>${esc(c.address||'-')}</td><td>${ss.length}</td><td>${fmt(ss.reduce((a,s)=>a+s.total,0))}</td><td>${fmt(ss.reduce((a,s)=>a+(s.balance||0),0))}</td><td><button class="secondary" onclick="viewCust(${Number(c.id)})">History</button></td></tr>`;
 }),8,'No customers yet');
 $('#cust-list').innerHTML=db.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
}

function viewCust(id){
 const c=db.customers.find(x=>String(x.id)===String(id));
 if(!c)return toast("Customer not found");
 const ss=db.sales.filter(s=>String(s.customerId)===String(id));
 const b=$('#cust-history');
 b.classList.remove('hidden');
 b.innerHTML=`<div class="panel-header"><h3>Purchase History: ${esc(c.name)}</h3><button class="secondary" onclick="this.closest('.panel').classList.add('hidden')">Close</button></div>
 <p style="color:#6b7280;margin-bottom:10px">${esc(c.phone)} · ${esc(c.email||'-')} · ${esc(c.address||'-')}</p>
 <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
 ${rows(ss.map(s=>`<tr><td>${esc(s.invoice)}</td><td>${esc(s.date)}</td><td>${esc(s.items.map(i=>i.name+' ×'+i.qty).join(', '))}</td><td>${fmt(s.total)}</td><td>${fmt(s.paid??s.total)}</td><td>${sp(pstat(s))}</td></tr>`),6,'No purchases yet')}
 </tbody></table></div>`;
 b.scrollIntoView({behavior:'smooth'});
}

/* Returns */
$('#return-form').onsubmit=e=>{e.preventDefault();
 const type=$('#ret-type').value,ref=$('#ret-ref').value.trim(),m=db.meds.find(x=>String(x.id)===$('#ret-med').value),qty=+$('#ret-qty').value,reason=$('#ret-reason').value.trim();
 if(!m)return toast('Select a medicine');let amount,refRef;
 if(type==='sales'){
  const sale=db.sales.find(s=>s.invoice.toLowerCase()===ref.toLowerCase());if(!sale)return toast('Invoice not found');
  const it=sale.items.find(i=>i.medId===m.id||i.name===m.name);if(!it)return toast('Medicine is not on that invoice');
  const done=db.returns.filter(r=>r.type==='sales'&&r.ref===sale.invoice&&r.medId===m.id).reduce((a,r)=>a+r.qty,0);
  if(qty>it.qty-done)return toast(`Only ${it.qty-done} returnable`);
  amount=qty*it.price*(1+(it.gst||0)/100);m.qty+=qty;
  log('Billing correction',`Sales return on ${sale.invoice}: ${m.name} ×${qty}, refund ${fmt(amount)} (${reason})`);
  log('Stock added',`${m.name} (${m.batch}) +${qty} from sales return`);
  refRef=sale.invoice;
 }else{
  if(qty>m.qty)return toast('Not enough stock to return');
  amount=qty*m.cost;m.qty-=qty;refRef=ref;
  log('Stock deducted',`Supplier return to ${ref}: ${m.name} (${m.batch}) -${qty} (${reason})`);
 }
 db.returns.unshift({id:'RET-'+padN(db.returns.length+1,3),type,ref:refRef,medId:m.id,name:m.name,qty,amount,reason,date:today(),status:type==='sales'?'Pending Refund':'Credit Pending'});
 save();e.target.reset();toast('Return recorded');render()};
function markRet(id){const r=db.returns.find(x=>x.id===id);r.status=r.type==='sales'?'Refunded':'Credit Received';log('Refund tracking',`${r.id} marked ${r.status} (${fmt(r.amount)})`);save();render()}
function renderReturns(){
 fillSel($('#ret-med'),db.meds.map(m=>`<option value="${m.id}">${esc(m.name)} (${esc(m.batch)})</option>`).join(''));
 $('#return-table').innerHTML=rows(db.returns.map(r=>{const done=r.status==='Refunded'||r.status==='Credit Received';return `<tr><td>${r.id}</td><td>${r.type==='sales'?'Sales':'Supplier'}</td><td>${esc(r.ref)}</td><td>${esc(r.name)}</td><td>${r.qty}</td><td>${fmt(r.amount)}</td><td>${esc(r.reason)}</td><td>${r.date}</td><td>${sp([r.status,done?'ok':'low'])}</td><td>${done?'-':`<button class="secondary" onclick="markRet('${r.id}')">${r.type==='sales'?'Mark Refunded':'Mark Received'}</button>`}</td></tr>`}),10,'No returns recorded')}

/* Prescriptions */
function openRx(){$('#rx-date').value=today();$('#rx-valid').value=addDays(30)}
$('#show-rx').onclick=()=>{$('#rx-form').classList.toggle('hidden');openRx()};
$('#rx-form').onsubmit=e=>{e.preventDefault();const v=i=>$('#rx-'+i).value.trim();
 if(v('valid')<v('date'))return toast('Valid-until cannot be before the prescription date');
 const p={id:'RX-'+padN(db.prescriptions.length+1,3),patient:v('patient'),doctor:v('doctor'),reg:v('reg'),date:v('date'),valid:v('valid'),meds:v('meds')};
 db.prescriptions.unshift(p);log('Prescription recorded',`${p.id} for ${p.patient} (Dr. ${p.doctor})`);save();e.target.reset();e.target.classList.add('hidden');toast('Prescription saved');render()};
function togRx(id){const m=db.meds.find(x=>x.id===id);m.rx=!m.rx;log('Rx requirement changed',`${m.name}: ${m.rx?'now requires':'no longer requires'} prescription`);save();render()}
function renderRx(){
 $('#rx-table').innerHTML=rows(db.prescriptions.map(p=>`<tr><td>${p.id}</td><td>${esc(p.patient)}</td><td>${esc(p.doctor)}</td><td>${esc(p.reg||'-')}</td><td>${p.date}</td><td>${p.valid}</td><td>${esc(p.meds)}</td><td>${sp(p.valid<today()?['Expired','exp']:['Valid','ok'])}</td><td>${db.sales.filter(s=>s.rx===p.id).length} invoice(s)</td></tr>`),9,'No prescriptions recorded');
 $('#rx-req-table').innerHTML=rows(db.meds.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category||'-')}</td><td>${m.rx?'<span class="pill rx">Rx Required</span>':'No'}</td><td><button class="secondary" onclick="togRx(${m.id})">${m.rx?'Remove Rx':'Require Rx'}</button></td></tr>`),4)}

/* Payments */
function receivePay(no){const s=db.sales.find(x=>x.invoice===no);
 const a=parseFloat(prompt(`Amount received (balance ${fmt(s.balance)}):`,s.balance.toFixed(2)));if(!(a>0))return;
 if(a>s.balance+0.005)return toast('Amount exceeds balance');
 const mth=prompt('Payment method (Cash / UPI / Card):','Cash');if(!['Cash','UPI','Card'].includes(mth))return toast('Invalid method');
 s.payments=s.payments||[];s.payments.push({date:today(),amount:a,method:mth});s.paid=(s.paid||0)+a;s.balance=Math.max(0,s.balance-a);
 log('Payment received',`${no}: ${fmt(a)} via ${mth}, balance ${fmt(s.balance)}`);save();toast('Payment recorded');render()}
function renderPayments(){
 const all=db.sales.flatMap(s=>pays(s).map(p=>({...p,inv:s.invoice,cust:s.customer||'Walk-in'}))).sort((a,b)=>b.date.localeCompare(a.date));
 const by=m=>all.filter(p=>p.method===m).reduce((a,p)=>a+p.amount,0);
 $('#pay-received').textContent=fmt(all.reduce((a,p)=>a+p.amount,0));
 $('#pay-out').textContent=fmt(db.sales.reduce((a,s)=>a+(s.balance||0),0));
 $('#pay-cash').textContent=fmt(by('Cash'));$('#pay-upi').textContent=fmt(by('UPI'));$('#pay-card').textContent=fmt(by('Card'));
 $('#out-table').innerHTML=rows(db.sales.filter(s=>(s.balance||0)>0.005).map(s=>`<tr><td>${s.invoice}</td><td>${s.date}</td><td>${esc(s.customer)}</td><td>${fmt(s.total)}</td><td>${fmt(s.paid||0)}</td><td>${fmt(s.balance)}</td><td>${sp(pstat(s))}</td><td><button class="primary" onclick="receivePay('${s.invoice}')">Receive</button></td></tr>`),8,'No outstanding balances');
 $('#pay-table').innerHTML=rows(all.slice(0,30).map(p=>`<tr><td>${p.date}</td><td>${p.inv}</td><td>${esc(p.cust)}</td><td>${p.method}</td><td>${fmt(p.amount)}</td></tr>`),5,'No payments yet')}

/* Tax: GST slabs are fixed (0, 5, 12, 18, 28). The rate is set per medicine in Add Medicine,
   a default in Settings, and can be overridden for a whole bill with the Tax option in Billing. */
function renderTax(){
 const o=db.taxSlabs.map(r=>`<option value="${r}">${r}%</option>`).join('');
 fillSel($('#med-gst'),o,String(db.settings.defaultGst));fillSel($('#set-gst'),o,String(db.settings.defaultGst));
 fillSel($('#bill-tax'),'<option value="">As per medicine</option>'+db.taxSlabs.map(r=>`<option value="${r}">${r}% on all items</option>`).join(''))}

/* Notifications */
function notes(){const n=[];
 db.meds.forEach(m=>{const st=status(m)[0];
  if(st==='Expired')n.push({t:'Expiry',c:'exp',x:`${m.name} (${m.batch}) expired on ${m.expiry}. ${m.qty} units should be removed.`});
  else if(st==='Near Expiry')n.push({t:'Expiry',c:'exp',x:`${m.name} (${m.batch}) expires on ${m.expiry}`});
  if(m.qty<=m.min&&st!=='Expired')n.push({t:'Low Stock',c:'low',x:`${m.name} has ${m.qty} units left (minimum ${m.min})`})});
 db.purchases.filter(p=>p.date>=addDays(-7)).forEach(p=>n.push({t:'Purchase',c:'ok',x:`Purchase ${p.invoice} from ${p.supplier}: ${p.name} ×${p.qty}`}));
 db.sales.filter(s=>(s.balance||0)>0.005).forEach(s=>n.push({t:'Payment',c:'exp',x:`${s.invoice}: ${fmt(s.balance)} outstanding from ${s.customer||'Walk-in'}`}));
 return n}
$('#note-filter').onchange=renderNotes;
function renderNotes(){const all=notes(),f=$('#note-filter').value,list=all.filter(n=>!f||n.t===f);
 $('#note-list').innerHTML=list.length?list.map(n=>`<div class="note">${sp([n.t,n.c])}<span>${esc(n.x)}</span></div>`).join(''):'<p class="empty">No notifications</p>';
 const k=all.filter(n=>n.t!=='Purchase').length,b=$('#notif-badge');b.textContent=k;b.classList.toggle('hidden',!k)}

/* Settings */
const SKEYS=['name','address','phone','email','gstin','dlno','user','prefix','footer'];
$('#settings-form').onsubmit=e=>{e.preventDefault();const s=db.settings,old=JSON.stringify(s);
 SKEYS.forEach(k=>s[k]=$('#set-'+k).value.trim());s.defaultGst=+$('#set-gst').value;
 if(JSON.stringify(s)!==old)log('Settings changed','Pharmacy, invoice or tax settings updated');save();toast('Settings saved');render()};
function renderSettings(){SKEYS.forEach(k=>{const el=$('#set-'+k);if(document.activeElement!==el)el.value=db.settings[k]||''})}
$('#backup-export').onclick=()=>{log('Backup exported','Full data backup downloaded');save();
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));a.download='pharmacy-backup-'+today()+'.json';a.click();render()};
$('#backup-import').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
 r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d.meds)||!Array.isArray(d.sales))throw 0;
  Object.keys(db).forEach(k=>delete db[k]);Object.assign(db,d);ensureDefaults();log('Backup restored',f.name);save();render();toast('Backup restored')}catch(x){toast('Invalid backup file')}e.target.value=''};r.readAsText(f)};
$('#reset-data').onclick=()=>{if(confirm('Erase ALL data? This cannot be undone.')){try{localStorage.removeItem(KEY)}catch(e){}location.reload()}};

/* Audit */
$('#audit-search').oninput=renderAudit;$('#audit-filter').onchange=renderAudit;
function renderAudit(){
 fillSel($('#audit-filter'),'<option value="">All Actions</option>'+[...new Set(db.audit.map(a=>a.action))].sort().map(a=>`<option>${esc(a)}</option>`).join(''));
 const q=$('#audit-search').value.toLowerCase(),f=$('#audit-filter').value;
 const list=db.audit.filter(a=>(!f||a.action===f)&&(a.action+a.detail+a.user).toLowerCase().includes(q));
 $('#audit-table').innerHTML=rows(list.slice(0,200).map(a=>`<tr><td>${esc(a.time)}</td><td>${esc(a.user)}</td><td>${esc(a.action)}</td><td style="white-space:normal">${esc(a.detail)}</td></tr>`),4,'No activity logged yet');
 $('#audit-total').textContent=db.audit.length;
 $('#audit-stock').textContent=db.audit.filter(a=>a.action.startsWith('Stock')).length;
 $('#audit-bill').textContent=db.audit.filter(a=>a.action==='Billing correction').length}
$('#audit-export').onclick=()=>{const csv=['Time,User,Action,Details'].concat(db.audit.map(a=>[a.time,a.user,a.action,a.detail].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='audit-log.csv';a.click()};

/* Master render */
function render(){
 const inv=db.meds.reduce((a,m)=>a+m.qty*m.cost,0),sold=db.sales.reduce((a,s)=>a+s.total,0);
 $('#total-medicines').textContent=db.meds.length;
 $('#total-stock').textContent=db.meds.reduce((a,m)=>a+m.qty,0);
 $('#today-sales').textContent=fmt(db.sales.filter(s=>s.date===today()).reduce((a,s)=>a+s.total,0));
 $('#low-count').textContent=db.meds.filter(m=>m.qty<=m.min).length;
 $('#expiry-count').textContent=db.meds.filter(m=>status(m)[0].includes('Exp')).length;
 $('#dashboard-inventory-value').textContent=fmt(inv);
 $('#pending-purchases').textContent=0;
 $('#active-suppliers').textContent=db.suppliers.length;
 $('#recent-sales').innerHTML=rows(db.sales.slice(0,5).map(s=>`<tr><td>${s.invoice}</td><td>${s.date}</td><td>${s.count}</td><td>${s.payment}</td><td>${fmt(s.total)}</td></tr>`),5,'No sales yet');
 $('#dashboard-alerts').innerHTML=rows(db.meds.filter(isAlert).map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${m.expiry}</td><td>${pill(m)}</td></tr>`),5,'No alerts');
 $('#purchase-table').innerHTML=rows(db.purchases.map(p=>`<tr><td>${esc(p.invoice)}</td><td>${esc(p.supplier)}</td><td>${esc(p.name)}</td><td>${esc(p.batch)}</td><td>${p.qty}</td><td>${fmt(p.total)}</td><td>${p.date}</td></tr>`),7);
 $('#report-sales').textContent=fmt(sold);
 $('#report-purchases').textContent=fmt(db.purchases.reduce((a,p)=>a+p.total,0));
 $('#report-value').textContent=fmt(inv);
 $('#report-table').innerHTML=rows(db.meds.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${fmt(m.qty*m.cost)}</td><td>${m.expiry}</td><td>${pill(m)}</td></tr>`),6);
 $('#user-name').textContent=db.settings.user;
 renderTax();renderCats();renderSuppliers();fillBillSelects();renderInventory();renderSales();renderCart();renderCharts();
 renderCustomers();renderReturns();renderRx();renderPayments();renderNotes();renderSettings();renderAudit();
 document.documentElement.style.setProperty('--sbw',($('.sidebar').offsetWidth||278)+'px');
}
addEventListener('resize',()=>document.documentElement.style.setProperty('--sbw',($('.sidebar').offsetWidth||278)+'px'));
render();
loadCustomersFromMySQL();