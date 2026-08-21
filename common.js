/* ==========================================================================
   Leads & Prospek Management — Common Layer (dipakai semua halaman)
   Berisi: master data, storage/localStorage, ID generator, utilitas,
   seed data, toast, model item produk (multi item per transaksi),
   import/export Excel, fungsi report, dan fungsi cetak (print).
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* 1. MASTER DATA (Referensi Drop-Down)                                    */
/* ---------------------------------------------------------------------- */
const MASTER = {
  leadsGeneration: ['Online', 'Offline'],
  leadsType: ['Inbound', 'Outbound'],
  leadsSource: ['Website', 'Social Media Platform', 'Email', 'WA Blasting', 'Call Plan', 'Canvassing', 'Site Visit', 'Customer Call'],
  pic: ['Counter Sales', 'Sales Engineer', 'Admin Sales'],
  picName: ['Khoirul Fatihin Rasyid', 'Ratno Wijaya Kusuma', 'Firano Ghazie Aman', 'Yemima Karengke', 'Muhammad Andre Syahputra', 'Antonius Nugroho Cahyadi'],
  productGroup: ['Dewatering', 'Slurry', 'Mobile Crane', 'Parts & Components', 'Operation & Maintenance', 'Service', 'Direct Sales Unit'],
  productBrand: ['Multiflo', 'Metso', 'Zidong', 'Sany', 'Hitachi', 'Caterpillar'],
  productModel: ['RF420EXHV-C27', 'MF385HP-C13', 'HH200-C27', 'HH200-C18', 'HM200-C27', 'HM150-C13', 'SANY 25 T', 'SANY 55T', 'CAT320', 'CAT329', 'CAT330', 'ZX350', 'HM200-C18', 'NSQ400-60-132'],
  leadsRating: ['Hot', 'Warm', 'Cold'],
  yesNo: ['Yes', 'No'],
  durationRemarks: ['Day', 'Month'],
};

/* ---------------------------------------------------------------------- */
/* 2. STORAGE LAYER (localStorage — placeholder utk API pusat)             */
/*    Versi dinaikkan ke v3 karena struktur data produk berubah menjadi    */
/*    array "items" (multi item per transaksi) — data lama (flat single   */
/*    product field) tidak kompatibel dan akan digantikan oleh seed baru. */
/* ---------------------------------------------------------------------- */
const DB = {
  LEADS_KEY: 'lpm_leads_v3',
  PROSPECTS_KEY: 'lpm_prospects_v3',
  COUNTER_KEY: 'lpm_counters_v2',

  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  save(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

/* counters harus siap SEBELUM seedLeads()/seedProspects() dipanggil */
let counters = DB.load(DB.COUNTER_KEY, {});
if (!counters.LDS) counters.LDS = {};
if (!counters.PRS) counters.PRS = {};

let leadsData = DB.load(DB.LEADS_KEY, null);
let prospectsData = DB.load(DB.PROSPECTS_KEY, null);

if (leadsData === null) { leadsData = seedLeads(); DB.save(DB.LEADS_KEY, leadsData); }
if (prospectsData === null) { prospectsData = seedProspects(leadsData); DB.save(DB.PROSPECTS_KEY, prospectsData); }

function persist() {
  DB.save(DB.LEADS_KEY, leadsData);
  DB.save(DB.PROSPECTS_KEY, prospectsData);
  DB.save(DB.COUNTER_KEY, counters);
}

/* ---------------------------------------------------------------------- */
/* 3. AUTO-NUMBERING — Format LDS/YYYYMM/XXXX & PRS/YYYYMM/XXXX            */
/* ---------------------------------------------------------------------- */
function generateId(prefix, dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const period = `${yyyy}${mm}`;
  const bucket = prefix === 'LDS' ? counters.LDS : counters.PRS;
  bucket[period] = (bucket[period] || 0) + 1;
  const seq = String(bucket[period]).padStart(4, '0');
  return `${prefix}/${period}/${seq}`;
}

/* ---------------------------------------------------------------------- */
/* 4. UTILITIES                                                            */
/* ---------------------------------------------------------------------- */
function fmtCurrency(n) {
  n = Number(n) || 0;
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
function fmtDateDMY(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtDateLong(iso) {
  if (!iso) return '-';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${months[m - 1]} ${d}, ${y}`;
}
function calcTotal(price, qty, duration) {
  return (Number(price) || 0) * (Number(qty) || 0) * (Number(duration) || 0);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function sumProspectsForLeads(leadsId) {
  return prospectsData.filter(p => p.leadsRef === leadsId).reduce((s, p) => s + (Number(p.prospectsAmount) || 0), 0);
}
function countProspectsForLeads(leadsId) {
  return prospectsData.filter(p => p.leadsRef === leadsId).length;
}
function opts(list, includeEmpty, emptyLabel) {
  let html = includeEmpty ? `<option value="">${emptyLabel || 'Semua'}</option>` : '';
  html += list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  return html;
}
function fillSelect(id, list) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = opts(list, false);
}
function ratingBadge(r) {
  const cls = r === 'Hot' ? 'badge-hot' : r === 'Warm' ? 'badge-warm' : 'badge-cold';
  return `<span class="badge ${cls}"><span class="dot"></span>${r}</span>`;
}
function yesNoBadge(v) {
  return `<span class="badge ${v === 'Yes' ? 'badge-yes' : 'badge-no'}">${v}</span>`;
}

/* ---------------------------------------------------------------------- */
/* 4b. MODEL ITEM PRODUK (Multi Item per Transaksi)                        */
/*     Setiap transaksi Leads/Prospek kini dapat memiliki lebih dari satu  */
/*     produk (items[]) — menggantikan field tunggal productGroup/Brand/  */
/*     Model/estimatedPrice/unitQty/duration/durationRemarks sebelumnya.   */
/* ---------------------------------------------------------------------- */
function newItem() {
  return { itemId: uid(), productGroup: '', productBrand: '', productModel: '', unitQty: 1, estimatedPrice: 0, duration: 1, durationRemarks: 'Month' };
}
function cloneItems(items) {
  return (items || []).map(it => ({ ...it, itemId: uid() }));
}
function calcItemTotal(it) {
  return calcTotal(it.estimatedPrice, it.unitQty, it.duration);
}
function calcItemsTotal(items) {
  return (items || []).reduce((s, it) => s + calcItemTotal(it), 0);
}
function itemsSummaryText(items) {
  if (!items || items.length === 0) return '-';
  const first = items[0];
  const label = `${escapeHtml(first.productBrand)} · ${escapeHtml(first.productModel)}`;
  return items.length > 1 ? `${label}<span class="more-pill">+${items.length - 1} item lain</span>` : label;
}
function recordHasProduct(rec, group, brand, model) {
  const items = rec.items || [];
  if (!group && !brand && !model) return true;
  return items.some(it =>
    (!group || it.productGroup === group) &&
    (!brand || it.productBrand === brand) &&
    (!model || it.productModel === model)
  );
}
/**
 * distributeAmountByItems — membagi sebuah nilai level-transaksi (misalnya
 * Leads Amount, yang bukan hasil penjumlahan item) secara proporsional ke
 * setiap item berdasarkan kontribusi Total Amount item tersebut. Dipakai
 * oleh dashboard untuk breakdown per Product Group/Model saat satu
 * transaksi memiliki lebih dari satu item produk.
 */
function distributeAmountByItems(record, amount) {
  const items = record.items || [];
  if (!items.length) return [];
  const recordTotal = calcItemsTotal(items);
  if (recordTotal > 0) {
    return items.map(it => ({ item: it, amount: amount * (calcItemTotal(it) / recordTotal) }));
  }
  const even = amount / items.length;
  return items.map(it => ({ item: it, amount: even }));
}

/* ---------------------------------------------------------------------- */
/* 5. SEED DATA (contoh awal, dapat dihapus melalui tombol Delete)         */
/* ---------------------------------------------------------------------- */
function seedLeads() {
  const rows = [
    { date: '2026-01-04', gen: 'Online', type: 'Inbound', src: 'Website', pic: 'Sales Engineer', picName: 'Khoirul Fatihin Rasyid', rating: 'Hot', pql: 'Yes', qql: 'Yes', leadsAmount: 5100000000, cust: 'PT Borneo Tambang Sejahtera', custPic: 'Bpk. Ronaldo', title: 'Operational Manager',
      items: [
        { pg: 'Dewatering', pb: 'Multiflo', pm: 'RF420EXHV-C27', price: 850000000, qty: 2, dur: 3, durR: 'Month' },
        { pg: 'Parts & Components', pb: 'Caterpillar', pm: 'CAT320', price: 45000000, qty: 4, dur: 1, durR: 'Day' },
      ] },
    { date: '2026-01-08', gen: 'Offline', type: 'Outbound', src: 'Site Visit', pic: 'Counter Sales', picName: 'Ratno Wijaya Kusuma', rating: 'Warm', pql: 'Yes', qql: 'No', leadsAmount: 3200000000, cust: 'CV Sumber Alam Mandiri', custPic: 'Ibu Sartika', title: 'Purchasing Head',
      items: [ { pg: 'Mobile Crane', pb: 'Sany', pm: 'SANY 25 T', price: 3200000000, qty: 1, dur: 1, durR: 'Month' } ] },
    { date: '2026-01-11', gen: 'Online', type: 'Inbound', src: 'WA Blasting', pic: 'Admin Sales', picName: 'Yemima Karengke', rating: 'Cold', pql: 'No', qql: 'No', leadsAmount: 600000000, cust: 'PT Cipta Karya Logistik', custPic: '', title: '',
      items: [ { pg: 'Parts & Components', pb: 'Caterpillar', pm: 'CAT320', price: 120000000, qty: 5, dur: 1, durR: 'Day' } ] },
    { date: '2026-01-15', gen: 'Offline', type: 'Outbound', src: 'Canvassing', pic: 'Sales Engineer', picName: 'Firano Ghazie Aman', rating: 'Hot', pql: 'Yes', qql: 'Yes', leadsAmount: 5940000000, cust: 'PT Mineral Jaya Perkasa', custPic: 'Bpk. Andika', title: 'Project Director',
      items: [ { pg: 'Slurry', pb: 'Metso', pm: 'HH200-C27', price: 990000000, qty: 3, dur: 2, durR: 'Month' } ] },
    { date: '2026-01-19', gen: 'Online', type: 'Inbound', src: 'Email', pic: 'Counter Sales', picName: 'Muhammad Andre Syahputra', rating: 'Warm', pql: 'Yes', qql: 'Yes', leadsAmount: 270000000, cust: 'PT Nusantara Konstruksi', custPic: 'Bpk. Fadli', title: 'Site Manager',
      items: [ { pg: 'Service', pb: 'Hitachi', pm: 'ZX350', price: 45000000, qty: 1, dur: 6, durR: 'Month' } ] },
    { date: '2026-01-22', gen: 'Online', type: 'Inbound', src: 'Call Plan', pic: 'Counter Sales', picName: 'Antonius Nugroho Cahyadi', rating: 'Warm', pql: 'Yes', qql: 'Yes', leadsAmount: 1400000000, cust: 'PT Sinar Abadi Perkasa', custPic: 'Bpk. Yusuf', title: 'Procurement Manager',
      items: [ { pg: 'Dewatering', pb: 'Multiflo', pm: 'RF420EXHV-C27', price: 620000000, qty: 1, dur: 2, durR: 'Month' } ] },
    { date: '2026-01-25', gen: 'Online', type: 'Outbound', src: 'Customer Call', pic: 'Sales Engineer', picName: 'Khoirul Fatihin Rasyid', rating: 'Hot', pql: 'Yes', qql: 'Yes', leadsAmount: 1640000000, cust: 'PT Pamapersada Nusantara', custPic: 'Bpk. Hendra', title: 'Plant Manager',
      items: [ { pg: 'Slurry', pb: 'Metso', pm: 'CAT330', price: 410000000, qty: 2, dur: 2, durR: 'Month' } ] },
    { date: '2026-01-28', gen: 'Offline', type: 'Outbound', src: 'Call Plan', pic: 'Sales Engineer', picName: 'Firano Ghazie Aman', rating: 'Warm', pql: 'Yes', qql: 'No', leadsAmount: 2750000000, cust: 'PT Adaro Indonesia', custPic: 'Ibu Ratna', title: 'Fleet Manager',
      items: [ { pg: 'Mobile Crane', pb: 'Sany', pm: 'SANY 55T', price: 2750000000, qty: 1, dur: 1, durR: 'Month' } ] },
    { date: '2026-02-02', gen: 'Offline', type: 'Inbound', src: 'Customer Call', pic: 'Admin Sales', picName: 'Yemima Karengke', rating: 'Cold', pql: 'No', qql: 'No', leadsAmount: 285000000, cust: 'PT Bukit Baiduri Energi', custPic: '', title: '',
      items: [ { pg: 'Parts & Components', pb: 'Caterpillar', pm: 'CAT329', price: 95000000, qty: 3, dur: 1, durR: 'Day' } ] },
    { date: '2026-02-05', gen: 'Online', type: 'Inbound', src: 'Call Plan', pic: 'Counter Sales', picName: 'Muhammad Andre Syahputra', rating: 'Hot', pql: 'Yes', qql: 'Yes', leadsAmount: 3360000000, cust: 'PT Mineral Jaya Perkasa', custPic: 'Bpk. Andika', title: 'Project Director',
      items: [ { pg: 'Slurry', pb: 'Metso', pm: 'HH200-C18', price: 560000000, qty: 2, dur: 3, durR: 'Month' } ] },
  ];
  return rows.map((r, i) => {
    const id = generateId('LDS', r.date);
    const items = r.items.map(it => ({ itemId: uid(), productGroup: it.pg, productBrand: it.pb, productModel: it.pm, unitQty: it.qty, estimatedPrice: it.price, duration: it.dur, durationRemarks: it.durR }));
    const total = calcItemsTotal(items);
    return {
      id, dbId: uid(), leadsDate: r.date, leadsGeneration: r.gen, leadsType: r.type, leadsSource: r.src,
      pic: r.pic, picName: r.picName, leadsRating: r.rating, pql: r.pql, qql: r.qql,
      items, totalAmount: total, leadsAmount: r.leadsAmount,
      customerName: r.cust, customerPIC: r.custPic, title: r.title, createdAt: Date.now() - (rows.length - i) * 86400000,
    };
  });
}
function seedProspects(leads) {
  const src = leads[0], src2 = leads[3];
  const mk = (l, amt) => {
    const id = generateId('PRS', l.leadsDate);
    return {
      id, dbId: uid(), leadsRef: l.id, leadsDate: l.leadsDate, leadsGeneration: l.leadsGeneration,
      leadsType: l.leadsType, leadsSource: l.leadsSource, pic: l.pic, picName: l.picName,
      leadsRating: l.leadsRating, pql: l.pql, qql: l.qql,
      items: cloneItems(l.items), totalAmount: l.totalAmount, prospectsAmount: amt, customerName: l.customerName,
      customerPIC: l.customerPIC, title: l.title, createdAt: Date.now(),
    };
  };
  return [mk(src, src.totalAmount), mk(src2, src2.totalAmount * 0.95)];
}

/* ---------------------------------------------------------------------- */
/* 6. SIDEBAR — highlight menu aktif & jam                                 */
/* ---------------------------------------------------------------------- */
function initSidebar(activeKey) {
  document.querySelectorAll('.side-link').forEach(a => {
    a.classList.toggle('is-active', a.dataset.key === activeKey);
  });
  const countLeadsEl = document.getElementById('sideCountLeads');
  const countProsEl = document.getElementById('sideCountProspects');
  if (countLeadsEl) countLeadsEl.textContent = leadsData.length;
  if (countProsEl) countProsEl.textContent = prospectsData.length;

  const clockEl = document.getElementById('appClock');
  if (clockEl) {
    const render = () => {
      const now = new Date();
      const opt = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
      clockEl.querySelector('b').textContent = now.toLocaleDateString('id-ID', opt);
    };
    render();
    setInterval(render, 30000);
  }

  initSidebarCollapse();
}

/* ---------------------------------------------------------------------- */
/* 6b. SIDEBAR COLLAPSE — ciutkan sidebar ke mode ikon saja                */
/* ---------------------------------------------------------------------- */
function initSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (!sidebar || !btn) return;
  const KEY = 'lpm_sidebar_collapsed';
  if (localStorage.getItem(KEY) === '1') sidebar.classList.add('is-collapsed');
  btn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('is-collapsed');
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  });
}

function showFlashToast() {
  const msg = sessionStorage.getItem('lpm_flash');
  if (msg) { sessionStorage.removeItem('lpm_flash'); toast(msg); }
  const errMsg = sessionStorage.getItem('lpm_flash_error');
  if (errMsg) { sessionStorage.removeItem('lpm_flash_error'); toast(errMsg, 'error'); }
}

/* ---------------------------------------------------------------------- */
/* 7. TOAST NOTIFICATIONS                                                  */
/* ---------------------------------------------------------------------- */
function toast(msg, type) {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type || ''}`.trim();
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 3400);
}

/* ---------------------------------------------------------------------- */
/* 8. MODAL HELPERS (dipakai utk lookup / confirm delete / pql warn / import) */
/* ---------------------------------------------------------------------- */
function openModal(id) {
  document.getElementById('overlay').classList.add('is-open');
  document.getElementById(id).classList.add('is-open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('is-open');
  const overlay = document.getElementById('overlay');
  const anyOpen = Array.from(document.querySelectorAll('.modal')).some(el => el.id !== id && el.classList.contains('is-open'));
  if (!anyOpen && overlay) overlay.classList.remove('is-open');
}

/* ---------------------------------------------------------------------- */
/* 9. PRINT — Lembar Transaksi (A4 Portrait) dengan Detail Table Produk    */
/* ---------------------------------------------------------------------- */
function buildItemsTableHtml(items) {
  if (!items || !items.length) return '';
  const body = items.map((it, i) => `<tr>
      <td class="ta-c">${i + 1}</td>
      <td>${escapeHtml(it.productGroup)}</td>
      <td>${escapeHtml(it.productBrand)}</td>
      <td>${escapeHtml(it.productModel)}</td>
      <td class="ta-c">${it.unitQty}</td>
      <td class="ta-r">${fmtCurrency(it.estimatedPrice)}</td>
      <td class="ta-c">${it.duration} ${it.durationRemarks}</td>
      <td class="ta-r">${fmtCurrency(calcItemTotal(it))}</td>
    </tr>`).join('');
  const grand = calcItemsTotal(items);
  return `<div class="section-label">Detail Produk</div>
    <table class="item-table-print">
      <thead><tr><th>No</th><th>Product Group</th><th>Product Brand</th><th>Product Model</th><th>Qty</th><th>Estimated Price (IDR)</th><th>Duration</th><th>Total Amount (IDR)</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="7" class="ta-r">Grand Total</td><td class="ta-r">${fmtCurrency(grand)}</td></tr></tfoot>
    </table>`;
}

function printDoc(title, docNumber, rows, refLine, items) {
  const win = window.open('', '_blank', 'width=880,height=1000');
  const bodyRows = rows.map(([label, value]) => `<tr><td class="pk">${label}</td><td class="pv">${value ?? '-'}</td></tr>`).join('');
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${title} — ${docNumber}</title>
  <style>
    @page{ size:A4 portrait; margin:16mm; }
    *{box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1F2937;margin:0;padding:0;}
    .letterhead{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1F2937;padding-bottom:14px;margin-bottom:18px;}
    .letterhead .mark{width:46px;height:46px;border-radius:8px;background:#2563EB;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#fff;flex-shrink:0;}
    .letterhead h1{margin:0;font-size:16px;}
    .letterhead p{margin:2px 0 0;font-size:11px;color:#5B6472;}
    .doc-title{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;}
    .doc-title h2{margin:0;font-size:15px;text-transform:uppercase;letter-spacing:.5px;}
    .doc-title .num{font-family:'Courier New',monospace;font-weight:700;font-size:13px;background:#1F2937;color:#fff;padding:5px 10px;border-radius:4px;border-left:3px solid #2563EB;}
    .refline{background:#F1F2F4;border:1px dashed #C0C4CC;border-radius:6px;padding:8px 12px;font-size:11.5px;margin-bottom:14px;}
    table.field-table{width:100%;border-collapse:collapse;margin-bottom:18px;}
    table.field-table td{padding:6px 8px;border:1px solid #DBDEE3;font-size:11.5px;vertical-align:top;}
    table.field-table td.pk{width:38%;background:#F4F5F7;font-weight:600;color:#5B6472;}
    table.field-table td.pv{width:62%;font-weight:600;}
    .section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#1D4ED8;margin:0 0 8px;}
    table.item-table-print{width:100%;border-collapse:collapse;margin-bottom:6px;}
    table.item-table-print th{background:#1F2937;color:#fff;font-size:10px;text-transform:uppercase;padding:6px 7px;text-align:left;}
    table.item-table-print td{border:1px solid #DBDEE3;padding:6px 7px;font-size:11px;}
    table.item-table-print tfoot td{background:#F1F2F4;font-weight:700;}
    .ta-r{text-align:right;} .ta-c{text-align:center;}
    .sign-row{display:flex;justify-content:space-between;margin-top:40px;gap:14px;}
    .sign-col{flex:1;text-align:center;font-size:11px;}
    .sign-box{height:64px;border-bottom:1px solid #1F2937;margin-bottom:6px;}
    .footnote{margin-top:22px;font-size:10px;color:#8D94A0;text-align:center;}
    @media print{ .no-print{display:none;} }
    .no-print{position:fixed;top:10px;right:10px;}
    .no-print button{padding:8px 14px;background:#1F2937;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;}
  </style></head><body>
    <div class="no-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
    <div class="letterhead">
      <div class="mark">LP</div>
      <div><h1>PT LEADS & PROSPECT MANAGEMENT</h1><p>Sales &amp; Commercial Division — Dokumen Internal Perusahaan</p></div>
    </div>
    <div class="doc-title"><h2>${title}</h2><span class="num">${docNumber}</span></div>
    ${refLine ? `<div class="refline">${refLine}</div>` : ''}
    <table class="field-table">${bodyRows}</table>
    ${buildItemsTableHtml(items)}
    <div class="sign-row">
      <div class="sign-col"><div class="sign-box"></div>Prepared By<br><b>(Sales)</b></div>
      <div class="sign-col"><div class="sign-box"></div>Checked By<br><b>(Sales Manager)</b></div>
      <div class="sign-col"><div class="sign-box"></div>Accepted By<br><b>(Customer)</b></div>
    </div>
    <div class="footnote">Dicetak melalui Sistem Aplikasi Web Leads &amp; Prospek Management — ${new Date().toLocaleString('id-ID')}</div>
  </body></html>`);
  win.document.close();
  win.focus();
}

function printLeads(dbId) {
  const r = leadsData.find(l => l.dbId === dbId);
  if (!r) return;
  printDoc('Lembar Transaksi Leads', r.id, [
    ['Leads Date', `${fmtDateDMY(r.leadsDate)} (${fmtDateLong(r.leadsDate)})`],
    ['Leads Generation / Type', `${r.leadsGeneration} / ${r.leadsType}`],
    ['Leads Source', r.leadsSource],
    ['PIC / PIC Name', `${r.pic} — ${r.picName}`],
    ['Leads Rating', r.leadsRating],
    ['PQL / QQL', `${r.pql} / ${r.qql}`],
    ['Total Amount (IDR)', fmtCurrency(r.totalAmount)],
    ['Leads Amount (IDR)', fmtCurrency(r.leadsAmount)],
    ['Customer Name', r.customerName],
    ['Customer PIC / Title', `${r.customerPIC || '-'} / ${r.title || '-'}`],
    ['Prospects Amount (IDR)', fmtCurrency(sumProspectsForLeads(r.id)) + ` (${countProspectsForLeads(r.id)} Prospek terikat)`],
  ], null, r.items);
}

function printProspect(dbId) {
  const r = prospectsData.find(p => p.dbId === dbId);
  if (!r) return;
  printDoc('Lembar Transaksi Prospek', r.id, [
    ['Ref. Nomor Bukti Leads', r.leadsRef],
    ['Leads Date', `${fmtDateDMY(r.leadsDate)} (${fmtDateLong(r.leadsDate)})`],
    ['Leads Generation / Type', `${r.leadsGeneration} / ${r.leadsType}`],
    ['Leads Source', r.leadsSource],
    ['PIC / PIC Name', `${r.pic} — ${r.picName}`],
    ['Leads Rating', r.leadsRating],
    ['PQL / QQL', `${r.pql} / ${r.qql}`],
    ['Total Amount (IDR)', fmtCurrency(r.totalAmount)],
    ['Prospects Amount (IDR)', fmtCurrency(r.prospectsAmount)],
    ['Customer Name', r.customerName],
    ['Customer PIC / Title', `${r.customerPIC || '-'} / ${r.title || '-'}`],
  ], `Dokumen ini merujuk pada transaksi Leads dengan Nomor Bukti <b>${r.leadsRef}</b>.`, r.items);
}

/* ---------------------------------------------------------------------- */
/* 10. IMPORT EXCEL — helper generik (butuh library SheetJS / global XLSX) */
/* ---------------------------------------------------------------------- */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
function workbookDownload(wb, filename) {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/octet-stream' }), filename);
}
function normalizeExcelDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (window.XLSX && XLSX.SSF) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}
/**
 * cols: [{ key, label, required, type: 'text'|'number'|'date'|'enum', enumKey, note }]
 * rawRows: array-of-arrays hasil XLSX.utils.sheet_to_json(ws, {header:1})
 */
function parseImportSheet(rawRows, cols) {
  const dataRows = (rawRows || []).slice(1).filter(r => (r || []).some(c => String(c ?? '').trim() !== ''));
  return dataRows.map((r, i) => {
    const rec = {}; const errors = [];
    cols.forEach((c, idx) => {
      let v = r[idx];
      v = (v === undefined || v === null) ? '' : v;
      if (typeof v === 'string') v = v.trim();
      if (c.type === 'date' && v !== '') v = normalizeExcelDate(v);
      if (c.required && v === '') errors.push(`${c.label} wajib diisi`);
      if (c.type === 'number' && v !== '' && isNaN(Number(v))) errors.push(`${c.label} harus berupa angka`);
      if (c.type === 'enum' && v !== '' && !MASTER[c.enumKey].map(String).includes(String(v))) errors.push(`${c.label} tidak valid (pilihan: ${MASTER[c.enumKey].join(', ')})`);
      rec[c.key] = c.type === 'number' ? Number(v || 0) : v;
    });
    return { rowNo: i + 2, rec, errors };
  });
}
function groupImportRows(parsedRows, groupKey) {
  const map = new Map();
  parsedRows.forEach(p => {
    const key = String(p.rec[groupKey] ?? '').trim() || `__row${p.rowNo}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.values()];
}
function buildInstructionAOA(cols, label) {
  const rows = [
    [`PETUNJUK PENGISIAN TEMPLATE IMPORT ${label.toUpperCase()}`],
    [''],
    [`1. Jangan mengubah urutan atau nama kolom pada baris header sheet "Template ${label}".`],
    [`2. Kolom "No Transaksi" diisi dengan angka yang SAMA untuk baris-baris item produk yang termasuk dalam satu transaksi ${label} yang sama (multi item / produk lebih dari satu). Gunakan angka berurutan (1, 2, 3, dst) untuk transaksi berikutnya.`],
    ['3. Kolom bertanda (*) pada tabel di bawah wajib diisi.'],
    ['4. Format tanggal: YYYY-MM-DD (contoh: 2026-08-01) atau DD/MM/YYYY.'],
    ['5. Nomor Bukti akan dibuat otomatis oleh sistem saat proses import — tidak perlu diisi manual.'],
    ['6. Nilai kolom pilihan (dropdown) harus SAMA PERSIS (termasuk huruf besar/kecil) dengan salah satu Daftar Nilai yang Diizinkan pada tabel di bawah.'],
    [''],
    ['Nama Kolom', 'Wajib', 'Tipe', 'Daftar Nilai yang Diizinkan / Format'],
  ];
  cols.forEach(c => {
    rows.push([c.label, c.required ? 'Ya' : 'Tidak', c.type, c.type === 'enum' ? MASTER[c.enumKey].join(', ') : (c.type === 'date' ? 'YYYY-MM-DD' : '-')]);
    if (c.note) rows.push(['', '', '', c.note]);
  });
  rows.push(['']);
  rows.push([`Contoh pengisian dapat dilihat pada sheet "Template ${label}" (baris di bawah header).`]);
  return rows;
}

/* ---------------------------------------------------------------------- */
/* 11. REPORT — filter generik & cetak listing (A4 Landscape)              */
/* ---------------------------------------------------------------------- */
function periodLabel(from, to) {
  if (!from && !to) return 'Semua Periode';
  if (from && !to) return `Mulai ${fmtDateDMY(from)}`;
  if (!from && to) return `Sampai ${fmtDateDMY(to)}`;
  return `${fmtDateDMY(from)} – ${fmtDateDMY(to)}`;
}
/**
 * filterTransactions: dipakai untuk Laporan Leads & Laporan Prospek.
 * f: { dateFrom, dateTo, productGroup, productBrand, productModel, picName,
 *      leadsSource, leadsRating, pql, qql, customer, leadsRef }
 */
function filterTransactions(list, f) {
  f = f || {};
  return list.filter(r => {
    if (f.dateFrom && r.leadsDate < f.dateFrom) return false;
    if (f.dateTo && r.leadsDate > f.dateTo) return false;
    if ((f.productGroup || f.productBrand || f.productModel) && !recordHasProduct(r, f.productGroup, f.productBrand, f.productModel)) return false;
    if (f.picName && r.picName !== f.picName) return false;
    if (f.leadsSource && r.leadsSource !== f.leadsSource) return false;
    if (f.leadsRating && r.leadsRating !== f.leadsRating) return false;
    if (f.pql && r.pql !== f.pql) return false;
    if (f.qql && r.qql !== f.qql) return false;
    if (f.leadsRef && r.leadsRef !== f.leadsRef) return false;
    if (f.customer) {
      const q = f.customer.toLowerCase();
      const hay = `${r.customerName || ''} ${r.id || ''} ${r.leadsRef || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function printReport(title, filterLines, columns, rows, grandTotal) {
  const win = window.open('', '_blank', 'width=1100, height=800');
  const theadHtml = `<tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
  const tbodyHtml = rows.map(r => `<tr>${columns.map(c => `<td class="${c.align === 'right' ? 'ta-r' : c.align === 'center' ? 'ta-c' : ''}">${r[c.key] ?? '-'}</td>`).join('')}</tr>`).join('');
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    @page{ size:A4 landscape; margin:12mm; }
    *{box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1F2937;margin:0;}
    .letterhead{display:flex;align-items:center;gap:12px;border-bottom:3px solid #1F2937;padding-bottom:10px;margin-bottom:12px;}
    .letterhead .mark{width:38px;height:38px;border-radius:8px;background:#2563EB;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;}
    .letterhead h1{margin:0;font-size:14px;}
    .letterhead p{margin:1px 0 0;font-size:10px;color:#5B6472;}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.4px;margin:0 0 6px;}
    .filters{font-size:10.5px;color:#5B6472;background:#F1F2F4;border:1px dashed #C0C4CC;border-radius:6px;padding:6px 10px;margin-bottom:10px;}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #DBDEE3;padding:5px 7px;font-size:10px;}
    th{background:#1F2937;color:#fff;text-align:left;}
    td.ta-r{text-align:right;} td.ta-c{text-align:center;}
    tfoot td{font-weight:700;background:#F1F2F4;}
    .footnote{margin-top:16px;font-size:9px;color:#8D94A0;text-align:center;}
    @media print{ .no-print{display:none;} }
    .no-print{position:fixed;top:10px;right:10px;}
    .no-print button{padding:8px 14px;background:#1F2937;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
  <div class="letterhead"><div class="mark">LP</div><div><h1>PT LEADS & PROSPECT MANAGEMENT</h1><p>Sales &amp; Commercial Division — Dokumen Internal Perusahaan</p></div></div>
  <h2>${title}</h2>
  <div class="filters">${filterLines.join(' &nbsp;•&nbsp; ')}</div>
  <table><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody>
  ${grandTotal != null ? `<tfoot><tr><td colspan="${columns.length - 1}" class="ta-r">Grand Total</td><td class="ta-r">${grandTotal}</td></tr></tfoot>` : ''}
  </table>
  <div class="footnote">Dicetak melalui Sistem Aplikasi Web Leads &amp; Prospek Management — ${new Date().toLocaleString('id-ID')} — Total ${rows.length} baris</div>
  </body></html>`);
  win.document.close();
  win.focus();
}
