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
  settings:{name:'MediCare Pharmacy',address:'',phone:'',gstin:'',dlno:'',user:'Mohanraj',prefix:'INV-',footer:'Thank you! Get well soon.',defaultGst:5}};
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

/* Website */
$$('[data-open-app]').forEach(b=>b.onclick=()=>{$('#site').classList.add('hidden');$('#app').classList.remove('hidden');scrollTo(0,0)});
$('#back-site').onclick=()=>{$('#app').classList.add('hidden');$('#site').classList.remove('hidden')};
$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.remove('on'));b.classList.add('on');$$('.tp').forEach((p,i)=>p.classList.toggle('hidden',i!=b.dataset.tab))});
$('#demo-form').onsubmit=e=>{e.preventDefault();e.target.reset();$('#form-success').classList.remove('hidden');setTimeout(()=>$('#form-success').classList.add('hidden'),6000)};

/* Navigation */
function go(p){$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===p));render()}
$$('.sidebar nav a').forEach(a=>a.onclick=e=>{e.preventDefault();go(a.dataset.page)});
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

/* Inventory */
$('#show-med').onclick=()=>$('#med-form').classList.toggle('hidden');
$('#cancel-med').onclick=()=>$('#med-form').classList.add('hidden');
$('#med-form').onsubmit=e=>{e.preventDefault();
 const v=i=>$('#med-'+i).value;
 const m={id:nextId(db.meds),name:v('name').trim(),barcode:v('barcode').trim(),category:v('category'),batch:v('batch').trim(),qty:+v('qty'),cost:+v('cost'),price:+v('price'),gst:+v('gst'),expiry:v('expiry'),min:+v('min'),rx:v('rx')==='yes'};
 db.meds.push(m);log('Stock added',`${m.name} (${m.batch}) opening quantity ${m.qty}`);
 save();e.target.reset();$('#med-gst').value=db.settings.defaultGst;e.target.classList.add('hidden');toast('Medicine saved');render()};
function delMed(id){const m=db.meds.find(x=>x.id===id);if(confirm('Delete this medicine?')){db.meds=db.meds.filter(x=>x.id!==id);log('Medicine deleted',`${m.name} (${m.batch})`);save();render()}}
function adjMed(id){const m=db.meds.find(x=>x.id===id),v=prompt(`New quantity for ${m.name} (current ${m.qty}):`,m.qty);if(v===null)return;
 const n=parseInt(v);if(isNaN(n)||n<0)return toast('Invalid quantity');
 const r=prompt('Reason for adjustment:','Stock count correction');if(!r)return toast('Reason is required');
 log('Stock adjusted',`${m.name} (${m.batch}): ${m.qty} to ${n}. ${r}`);m.qty=n;save();render()}
$('#inventory-search').oninput=renderInventory;$('#stock-filter').onchange=renderInventory;
function renderInventory(){
 const q=$('#inventory-search').value.toLowerCase(),f=$('#stock-filter').value,c=$('#cat-filter').value;
 const list=db.meds.filter(m=>(m.name+m.barcode).toLowerCase().includes(q)&&(!c||m.category===c)&&(f==='all'||(f==='low'?m.qty<=m.min:status(m)[0].includes('Exp'))));
 $('#inventory-table').innerHTML=rows(list.map(m=>`<tr><td>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''}<br><small style="color:#9ca3af">${esc(m.category||'')}</small></td><td>${esc(m.barcode)}</td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${fmt(m.price)}</td><td>${m.expiry}</td><td>${pill(m)}</td><td><button class="secondary" onclick="adjMed(${m.id})">Adjust</button> <button class="danger-btn" onclick="delMed(${m.id})">Delete</button></td></tr>`),8,'No medicines found');
}

/* Billing */
let paidTouched=false;
$('#amount-paid').oninput=()=>{paidTouched=true};
$('#bill-search').oninput=()=>{
 const q=$('#bill-search').value.toLowerCase().trim();
 const list=q?db.meds.filter(m=>m.qty>0&&m.expiry>=today()&&(m.name+m.barcode).toLowerCase().includes(q)).slice(0,6):[];
 $('#bill-results').innerHTML=list.map(m=>`<div class="result-row"><span>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''} <small>(${esc(m.batch)} · ${m.qty} in stock)</small></span><span>${fmt(m.price)} <button class="primary" onclick="addCart(${m.id})">Add</button></span></div>`).join('')};
$('#bill-search').onkeydown=e=>{if(e.key==='Enter'){const m=db.meds.find(x=>x.barcode===e.target.value.trim());if(m){addCart(m.id);e.target.value='';$('#bill-results').innerHTML=''}}};
function addCart(id){const m=db.meds.find(x=>x.id===id),c=cart.find(x=>x.id===id);
 if(c){if(c.qty<m.qty)c.qty++;else toast('Not enough stock')}else cart.push({id,qty:1});renderCart()}
function setQty(id,v){const m=db.meds.find(x=>x.id===id),c=cart.find(x=>x.id===id);c.qty=Math.max(1,Math.min(+v||1,m.qty));renderCart()}
function rmCart(id){cart=cart.filter(x=>x.id!==id);renderCart()}
function totals(){let s=0,t=0;cart.forEach(c=>{const m=db.meds.find(x=>x.id===c.id),l=m.price*c.qty;s+=l;t+=l*m.gst/100});return{s,t}}
function renderCart(){
 $('#cart-table').innerHTML=rows(cart.map(c=>{const m=db.meds.find(x=>x.id===c.id),l=m.price*c.qty;return `<tr><td>${esc(m.name)}${m.rx?' <span class="pill rx">Rx</span>':''}</td><td><input type="number" value="${c.qty}" min="1" style="width:80px" onchange="setQty(${m.id},this.value)"></td><td>${fmt(m.price)}</td><td>${m.gst}%</td><td>${fmt(l*(1+m.gst/100))}</td><td><button class="danger-btn" onclick="rmCart(${m.id})">Remove</button></td></tr>`}),6,'Cart is empty');
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
 const items=cart.map(c=>{const m=db.meds.find(x=>x.id===c.id);m.qty-=c.qty;return{medId:m.id,name:m.name,batch:m.batch,qty:c.qty,price:m.price,gst:m.gst}});
 const invoice=db.settings.prefix+padN(db.sales.length+1,4);
 const sale={invoice,date:today(),items,count:items.reduce((a,i)=>a+i.qty,0),payment:$('#payment').value,subtotal:s,gst:t,total,paid,balance:bal,customerId:cust?cust.id:null,customer:cust?cust.name:'Walk-in',rx:needRx?rxId:null,payments:paid>0?[{date:today(),amount:paid,method:$('#payment').value}]:[]};
 db.sales.unshift(sale);
 items.forEach(i=>log('Stock deducted',`${i.name} (${i.batch}) -${i.qty} via ${invoice}`));
 log('Invoice created',`${invoice} · ${fmt(total)} · ${sale.customer}${bal>0.005?' · balance '+fmt(bal):''}`);
 save();toast('Sale completed: '+invoice);cart=[];paidTouched=false;$('#bill-search').value='';$('#bill-results').innerHTML='';$('#bill-rx').value='';$('#bill-customer').value='';render()};

/* Purchases */
$('#purchase-form').onsubmit=e=>{e.preventDefault();
 const v=i=>$('#pur-'+i).value.trim(),qty=+v('qty'),cost=+v('cost'),mrp=+v('mrp');
 let m=db.meds.find(x=>x.name.toLowerCase()===v('name').toLowerCase()&&x.batch===v('batch'));
 if(m){m.qty+=qty;m.cost=cost;m.price=mrp;m.expiry=v('expiry')}
 else{m={id:nextId(db.meds),name:v('name'),barcode:'AUTO'+Date.now().toString().slice(-6),category:db.categories.includes('Other')?'Other':(db.categories[0]||''),batch:v('batch'),qty,cost,price:mrp,gst:db.settings.defaultGst,expiry:v('expiry'),min:10,rx:false};db.meds.push(m)}
 db.purchases.unshift({invoice:v('invoice'),supplier:v('supplier'),name:v('name'),batch:v('batch'),qty,total:qty*cost,date:today()});
 log('Stock added',`${m.name} (${m.batch}) +${qty} via purchase ${v('invoice')} from ${v('supplier')}`);
 save();e.target.reset();toast('Purchase recorded');render()};

/* Suppliers */
$('#show-supplier').onclick=()=>$('#supplier-form').classList.toggle('hidden');
$('#supplier-form').onsubmit=e=>{e.preventDefault();const v=i=>$('#sup-'+i).value.trim();
 db.suppliers.push({name:v('name'),contact:v('contact'),phone:v('phone'),email:v('email'),gstin:v('gstin'),address:v('address')});
 save();e.target.reset();e.target.classList.add('hidden');toast('Supplier saved');render()};
$('#supplier-search').oninput=renderSuppliers;
function renderSuppliers(){const q=$('#supplier-search').value.toLowerCase();
 $('#supplier-table').innerHTML=rows(db.suppliers.filter(s=>s.name.toLowerCase().includes(q)).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.contact||'-')}</td><td>${esc(s.phone)}</td><td>${esc(s.email||'-')}</td><td>${esc(s.gstin||'-')}</td></tr>`),5)}

/* Sales */
$('#sales-search').oninput=renderSales;$('#sales-date').onchange=renderSales;
function renderSales(){const q=$('#sales-search').value.toLowerCase(),d=$('#sales-date').value;
 $('#sales-table').innerHTML=rows(db.sales.filter(s=>s.invoice.toLowerCase().includes(q)&&(!d||s.date===d)).map(s=>`<tr><td>${s.invoice}</td><td>${s.date}</td><td>${esc(s.customer||'Walk-in')}</td><td>${s.count}</td><td>${s.payment}</td><td>${fmt(s.subtotal)}</td><td>${fmt(s.gst)}</td><td>${fmt(s.total)}</td><td>${sp(pstat(s))}</td><td><button class="secondary" onclick="printInv('${s.invoice}')">Print</button></td></tr>`),10)}
function printInv(no){const s=db.sales.find(x=>x.invoice===no),st=db.settings,w=window.open('','_blank');
 if(!w)return toast('Allow pop-ups to print');
 const ig=i=>i.gst??((db.meds.find(m=>m.id===i.medId||m.name===i.name)||{}).gst??0);
 w.document.write(`<html><head><title>${no}</title><style>body{font-family:Arial;max-width:600px;margin:20px auto}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}</style></head><body><h2>${esc(st.name)}</h2><p>${esc(st.address)}<br>${esc(st.phone)} ${st.gstin?'· GSTIN '+esc(st.gstin):''} ${st.dlno?'· DL '+esc(st.dlno):''}</p><hr><p><b>${no}</b> · ${s.date}<br>Customer: ${esc(s.customer||'Walk-in')}</p><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>GST</th><th class="r">Amount</th></tr>${s.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${fmt(i.price)}</td><td>${ig(i)}%</td><td class="r">${fmt(i.price*i.qty)}</td></tr>`).join('')}</table><p class="r">Subtotal: ${fmt(s.subtotal)}<br>GST: ${fmt(s.gst)}<br><b>Total: ${fmt(s.total)}</b><br>Paid: ${fmt(s.paid??s.total)} · Balance: ${fmt(s.balance||0)}</p><p>${esc(st.footer)}</p><script>window.print()<\/script></body></html>`);w.document.close()}

/* Barcode */
$('#barcode-form').onsubmit=e=>{e.preventDefault();
 const m=db.meds.find(x=>x.barcode===$('#barcode-input').value.trim());
 $('#barcode-result').innerHTML=m?`<div class="result-row" style="text-align:left"><span><strong>${esc(m.name)}</strong><br><small>${esc(m.category)} · Batch ${esc(m.batch)} · Exp ${m.expiry}</small></span><span>${fmt(m.price)}<br>${m.qty} units ${pill(m)}</span></div>`:'<p class="empty">No medicine found for this barcode.</p>'};

/* Reports */
$('#export').onclick=()=>{
 const csv=['Name,Barcode,Category,Batch,Qty,Cost,MRP,GST,Expiry'].concat(db.meds.map(m=>[m.name,m.barcode,m.category,m.batch,m.qty,m.cost,m.price,m.gst,m.expiry].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','))).join('\n');
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

const API_BASE = "http://localhost:5000/api";

$('#show-cust').onclick = () => {
    $('#customer-form').classList.toggle('hidden');
};

async function loadCustomersFromMySQL() {
    try {
        const response = await fetch(`${API_BASE}/customers`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load customers");
        }

        // Replace the browser customer list with MySQL records.
        db.customers = data.customers.map(c => ({
            ...c,
            created: c.created_at || today()
        }));

        save();
        renderCustomers();
        fillBillSelects();
    } catch (error) {
        console.error("Customer loading error:", error);
        toast("Could not load customers from MySQL");
    }
}

$('#customer-form').onsubmit = async e => {
    e.preventDefault();

    const v = i => $(`#cust-${i}`).value.trim();

    const customer = {
        name: v('name'),
        phone: v('phone'),
        email: v('email'),
        address: v('address')
    };

    if (!customer.name || !customer.phone) {
        return toast("Customer name and phone are required");
    }

    try {
        const response = await fetch(`${API_BASE}/customers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(customer)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to save customer");
        }

        const savedCustomer = {
            ...data.customer,
            created: today()
        };

        // Use the ID generated by MySQL.
        db.customers.unshift(savedCustomer);

        log("Customer added", savedCustomer.name);
        save();

        e.target.reset();
        e.target.classList.add('hidden');

        renderCustomers();
        fillBillSelects();

        toast("Customer saved to MySQL successfully");
    } catch (error) {
        console.error("Customer saving error:", error);
        toast(error.message || "Could not save customer");
    }
};

$('#customer-search').oninput = renderCustomers;

function renderCustomers() {
    const q = $('#customer-search').value.toLowerCase();

    const customers = db.customers.filter(c =>
        `${c.name || ''} ${c.phone || ''}`.toLowerCase().includes(q)
    );

    $('#customer-table').innerHTML = rows(
        customers.map(c => {
            const ss = db.sales.filter(
                s => String(s.customerId) === String(c.id)
            );

            return `<tr>
                <td>${esc(c.name)}</td>
                <td>${esc(c.phone)}</td>
                <td>${esc(c.email || '-')}</td>
                <td>${esc(c.address || '-')}</td>
                <td>${ss.length}</td>
                <td>${fmt(ss.reduce((a, s) => a + s.total, 0))}</td>
                <td>${fmt(ss.reduce((a, s) => a + (s.balance || 0), 0))}</td>
                <td>
                    <button class="secondary"
                        onclick="viewCust(${Number(c.id)})">
                        History
                    </button>
                </td>
            </tr>`;
        }),
        8,
        'No customers yet'
    );

    $('#cust-list').innerHTML = db.customers
        .map(c => `<option value="${esc(c.name)}"></option>`)
        .join('');
}

function viewCust(id) {
    const c = db.customers.find(x => String(x.id) === String(id));

    if (!c) {
        return toast("Customer not found");
    }

    const ss = db.sales.filter(
        s => String(s.customerId) === String(id)
    );

    const b = $('#cust-history');
    b.classList.remove('hidden');

    b.innerHTML = `<div class="panel-header">
        <h3>Purchase History: ${esc(c.name)}</h3>
        <button class="secondary"
            onclick="this.closest('.panel').classList.add('hidden')">
            Close
        </button>
    </div>

    <p style="color:#6b7280;margin-bottom:10px">
        ${esc(c.phone)} · ${esc(c.email || '-')} · ${esc(c.address || '-')}
    </p>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows(ss.map(s => `<tr>
                    <td>${esc(s.invoice)}</td>
                    <td>${esc(s.date)}</td>
                    <td>${esc(s.items.map(i =>
                        i.name + ' ×' + i.qty
                    ).join(', '))}</td>
                    <td>${fmt(s.total)}</td>
                    <td>${fmt(s.paid ?? s.total)}</td>
                    <td>${sp(pstat(s))}</td>
                </tr>`), 6, 'No purchases yet')}
            </tbody>
        </table>
    </div>`;

    b.scrollIntoView({ behavior: 'smooth' });
}

/* Returns */
$('#return-form').onsubmit=e=>{e.preventDefault();
 const type=$('#ret-type').value,ref=$('#ret-ref').value.trim(),m=db.meds.find(x=>String(x.id)===$('#ret-med').value),qty=+$('#ret-qty').value,reason=$('#ret-reason').value.trim();
 if(!m)return toast('Select a medicine');let amount;
 if(type==='sales'){
  const sale=db.sales.find(s=>s.invoice.toLowerCase()===ref.toLowerCase());if(!sale)return toast('Invoice not found');
  const it=sale.items.find(i=>i.medId===m.id||i.name===m.name);if(!it)return toast('Medicine is not on that invoice');
  const done=db.returns.filter(r=>r.type==='sales'&&r.ref===sale.invoice&&r.medId===m.id).reduce((a,r)=>a+r.qty,0);
  if(qty>it.qty-done)return toast(`Only ${it.qty-done} returnable`);
  amount=qty*it.price*(1+(it.gst||0)/100);m.qty+=qty;
  log('Billing correction',`Sales return on ${sale.invoice}: ${m.name} ×${qty}, refund ${fmt(amount)} (${reason})`);
  log('Stock added',`${m.name} (${m.batch}) +${qty} from sales return`);
  var refRef=sale.invoice;
 }else{
  if(qty>m.qty)return toast('Not enough stock to return');
  amount=qty*m.cost;m.qty-=qty;var refRef=ref;
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

/* Tax */
$('#tax-form').onsubmit=e=>{e.preventDefault();const r=+$('#tax-rate').value;
 if(db.taxSlabs.includes(r))return toast('Slab already exists');db.taxSlabs.push(r);db.taxSlabs.sort((a,b)=>a-b);log('Tax slab added',r+'%');save();e.target.reset();render()};
function delSlab(r){if(db.meds.some(m=>m.gst===r)||db.settings.defaultGst===r)return toast('Slab is in use');db.taxSlabs=db.taxSlabs.filter(x=>x!==r);log('Tax slab removed',r+'%');save();render()}
function renderTax(){
 const o=db.taxSlabs.map(r=>`<option value="${r}">${r}%</option>`).join('');
 fillSel($('#med-gst'),o,String(db.settings.defaultGst));fillSel($('#set-gst'),o,String(db.settings.defaultGst));
 $('#slab-chips').innerHTML=db.taxSlabs.map(r=>`<span class="chip">${r}%<button title="Remove" onclick="delSlab(${r})">×</button></span>`).join('');
 const agg={};db.sales.forEach(s=>s.items.forEach(i=>{const g=i.gst??((db.meds.find(m=>m.id===i.medId||m.name===i.name)||{}).gst??0);agg[g]=(agg[g]||0)+i.price*i.qty}));
 $('#tax-table').innerHTML=rows(Object.keys(agg).map(Number).sort((a,b)=>a-b).map(g=>{const t=agg[g]*g/100;return `<tr><td>${g}%</td><td>${fmt(agg[g])}</td><td>${fmt(t/2)}</td><td>${fmt(t/2)}</td><td>${fmt(t)}</td></tr>`}),5,'No sales yet')}

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
const SKEYS=['name','address','phone','gstin','dlno','user','prefix','footer'];
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
 renderTax();renderCats();fillBillSelects();renderInventory();renderSuppliers();renderSales();renderCart();renderCharts();
 renderCustomers();renderReturns();renderRx();renderPayments();renderNotes();renderSettings();renderAudit();
}
render();
loadCustomersFromMySQL();
