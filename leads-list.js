/* ==========================================================================
   leads-list.js — Logic halaman Daftar Transaksi Leads
   Termasuk wizard Import Excel (multi item per transaksi).
   ========================================================================== */

const state = {
  search: '', pic: '', rating: '', dateFrom: '', dateTo: '',
  sortKey: 'leadsDate', sortDir: 'desc', page: 1, pageSize: 8,
};
let pendingDeleteDbId = null;
let importGroupsLeads = [];

const LEADS_IMPORT_COLS = [
  { key: 'noTransaksi', label: 'No Transaksi', required: true, type: 'text', note: 'Isi angka yang sama untuk baris item produk dalam satu transaksi yang sama (multi item).' },
  { key: 'leadsDate', label: 'Leads Date', required: true, type: 'date' },
  { key: 'leadsGeneration', label: 'Leads Generation', required: true, type: 'enum', enumKey: 'leadsGeneration' },
  { key: 'leadsType', label: 'Leads Type', required: true, type: 'enum', enumKey: 'leadsType' },
  { key: 'leadsSource', label: 'Leads Source', required: true, type: 'enum', enumKey: 'leadsSource' },
  { key: 'pic', label: 'PIC', required: true, type: 'enum', enumKey: 'pic' },
  { key: 'picName', label: 'PIC Name', required: true, type: 'enum', enumKey: 'picName' },
  { key: 'leadsRating', label: 'Leads Rating', required: true, type: 'enum', enumKey: 'leadsRating' },
  { key: 'pql', label: 'PQL', required: true, type: 'enum', enumKey: 'yesNo' },
  { key: 'qql', label: 'QQL', required: true, type: 'enum', enumKey: 'yesNo' },
  { key: 'productGroup', label: 'Product Group', required: true, type: 'enum', enumKey: 'productGroup' },
  { key: 'productBrand', label: 'Product Brand', required: true, type: 'enum', enumKey: 'productBrand' },
  { key: 'productModel', label: 'Product Model', required: true, type: 'enum', enumKey: 'productModel' },
  { key: 'unitQty', label: 'Unit Qty', required: true, type: 'number' },
  { key: 'estimatedPrice', label: 'Estimated Price (IDR)', required: true, type: 'number' },
  { key: 'duration', label: 'Duration', required: true, type: 'number' },
  { key: 'durationRemarks', label: 'Duration Remarks', required: true, type: 'enum', enumKey: 'durationRemarks' },
  { key: 'leadsAmount', label: 'Leads Amount (IDR)', required: true, type: 'number', note: 'Isi nilai yang sama pada setiap baris item dalam satu transaksi (nilai level transaksi).' },
  { key: 'customerName', label: 'Customer Name', required: true, type: 'text' },
  { key: 'customerPIC', label: 'Customer PIC', required: false, type: 'text' },
  { key: 'title', label: 'Title', required: false, type: 'text' },
];

function init() {
  try {
    initSidebar('leads-list');
    showFlashToast();
    document.getElementById('filterRatingLeads').innerHTML = opts(MASTER.leadsRating, true, 'Semua Rating');
    document.getElementById('filterPicLeads').innerHTML = opts(MASTER.picName, true, 'Semua PIC');
    bindEvents();
    bindImportEvents();
    renderStats();
    renderTable();
  } catch (err) {
    console.error('Gagal memuat halaman:', err);
    alert('Terjadi kesalahan saat memuat halaman. Buka Console (F12) untuk detail.');
  }
}

function bindEvents() {
  document.getElementById('searchLeads').addEventListener('input', e => { state.search = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('filterRatingLeads').addEventListener('change', e => { state.rating = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('filterPicLeads').addEventListener('change', e => { state.pic = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('dateFromLeads').addEventListener('change', e => { state.dateFrom = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('dateToLeads').addEventListener('change', e => { state.dateTo = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('btnResetLeads').addEventListener('click', resetFilters);
  document.querySelectorAll('#tableLeads thead th[data-sort]').forEach(th => th.addEventListener('click', () => toggleSort(th.dataset.sort)));
  document.getElementById('overlay').addEventListener('click', () => { closeModal('modalConfirm'); closeModal('modalImportLeads'); });
  document.getElementById('confirmCancel').addEventListener('click', () => closeModal('modalConfirm'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal('modalConfirm'); closeModal('modalImportLeads'); } });
}

function resetFilters() {
  Object.assign(state, { search: '', pic: '', rating: '', dateFrom: '', dateTo: '', page: 1 });
  document.getElementById('searchLeads').value = '';
  document.getElementById('filterRatingLeads').value = '';
  document.getElementById('filterPicLeads').value = '';
  document.getElementById('dateFromLeads').value = '';
  document.getElementById('dateToLeads').value = '';
  renderTable();
}

function toggleSort(key) {
  if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sortKey = key; state.sortDir = 'asc'; }
  renderTable();
}

function renderStats() {
  document.getElementById('statTotalLeads').textContent = leadsData.length;
  document.getElementById('statHotLeads').textContent = leadsData.filter(l => l.leadsRating === 'Hot').length;
  document.getElementById('statTotalProspects').textContent = prospectsData.length;
  const val = prospectsData.reduce((s, p) => s + (Number(p.prospectsAmount) || 0), 0);
  document.getElementById('statProspectsValue').textContent = fmtCurrency(val);
}

function renderTable() {
  let rows = [...leadsData];
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(r => r.id.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q));
  }
  if (state.rating) rows = rows.filter(r => r.leadsRating === state.rating);
  if (state.pic) rows = rows.filter(r => r.picName === state.pic);
  if (state.dateFrom) rows = rows.filter(r => r.leadsDate >= state.dateFrom);
  if (state.dateTo) rows = rows.filter(r => r.leadsDate <= state.dateTo);

  rows.sort((a, b) => {
    let av = a[state.sortKey], bv = b[state.sortKey];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
    if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('#tableLeads thead th[data-sort]').forEach(th => {
    const active = th.dataset.sort === state.sortKey;
    th.classList.toggle('sorted', active);
    const ico = th.querySelector('.sort-ico');
    if (ico) ico.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  const tbody = document.querySelector('#tableLeads tbody');
  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state__icon">📋</div><h3>Belum ada data Leads</h3><p>Tidak ada transaksi yang cocok dengan filter saat ini.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(r => {
      const linkedProspects = prospectsData.filter(p => p.leadsRef === r.id);
      const hasProspect = linkedProspects.length > 0;
      const prospectAmount = linkedProspects.reduce((s, p) => s + (Number(p.prospectsAmount) || 0), 0);
      const statusCell = hasProspect
        ? `<div style="display:flex;flex-direction:column;gap:3px;">
             <span class="cell-muted">${linkedProspects.map(p => `<span class="id-plate ref" style="font-size:10.5px;padding:3px 7px 3px 6px;">${p.id}</span>`).join(' ')}</span>
             <span class="cell-strong" style="font-size:12px;">${fmtCurrency(prospectAmount)}</span>
           </div>`
        : `<span class="cell-muted">Belum jadi Prospek</span>`;
      const editBtn = hasProspect
        ? `<button class="btn btn-outline btn-icon" title="Tidak dapat diubah — sudah menjadi Prospek" disabled>🔒</button>`
        : `<a class="btn btn-outline btn-icon" title="Ubah" href="leads-form.html?id=${encodeURIComponent(r.dbId)}">✏️</a>`;
      const deleteBtn = hasProspect
        ? `<button class="btn btn-outline btn-icon" title="Tidak dapat dihapus — sudah menjadi Prospek" disabled>🔒</button>`
        : `<button class="btn btn-danger btn-icon" title="Hapus" onclick="confirmDelete('${r.dbId}')">🗑️</button>`;
      return `
      <tr>
        <td><span class="id-plate">${r.id}</span></td>
        <td class="cell-muted">${fmtDateDMY(r.leadsDate)}</td>
        <td class="cell-strong">${escapeHtml(r.customerName)}</td>
        <td class="cell-muted">${itemsSummaryText(r.items)}</td>
        <td class="cell-muted">${escapeHtml(r.picName)}</td>
        <td>${ratingBadge(r.leadsRating)}</td>
        <td class="cell-strong">${fmtCurrency(r.totalAmount)}</td>
        <td>${statusCell}</td>
        <td>
          <div class="cell-actions">
            <button class="btn btn-outline btn-icon" title="Cetak" onclick="printLeads('${r.dbId}')">🖨️</button>
            ${editBtn}
            ${deleteBtn}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderPagination(state.page, totalPages);
  document.getElementById('countLeads').textContent = `Menampilkan ${pageRows.length} dari ${total} transaksi`;
}

function renderPagination(page, totalPages) {
  const el = document.getElementById('paginationLeads');
  let html = `<button class="page-btn" ${page === 1 ? 'disabled' : ''} data-go="prev">‹</button>`;
  const maxButtons = 5;
  let start = Math.max(1, page - 2), end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === page ? 'is-active' : ''}" data-go="${i}">${i}</button>`;
  html += `<button class="page-btn" ${page === totalPages ? 'disabled' : ''} data-go="next">›</button>`;
  el.innerHTML = html;
  el.querySelectorAll('.page-btn').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.go;
    if (g === 'prev') { state.page = Math.max(1, page - 1); renderTable(); }
    else if (g === 'next') { state.page = Math.min(totalPages, page + 1); renderTable(); }
    else { state.page = Number(g); renderTable(); }
  }));
}

function confirmDelete(dbId) {
  const rec = leadsData.find(l => l.dbId === dbId);
  const linked = countProspectsForLeads(rec.id);
  if (linked > 0) {
    toast(`Data Leads ${rec.id} tidak dapat dihapus karena memiliki ${linked} transaksi Prospek rujukan.`, 'error');
    return;
  }
  document.getElementById('confirmText').textContent = `Apakah Anda yakin ingin menghapus data Leads ${rec.id} (${rec.customerName})? Tindakan ini tidak dapat dibatalkan.`;
  pendingDeleteDbId = dbId;
  openModal('modalConfirm');
}

function executeDelete() {
  if (!pendingDeleteDbId) return;
  leadsData = leadsData.filter(l => l.dbId !== pendingDeleteDbId);
  persist();
  pendingDeleteDbId = null;
  closeModal('modalConfirm');
  toast('Data Leads berhasil dihapus.');
  renderStats();
  renderTable();
}

/* ---------------------------------------------------------------------- */
/* IMPORT WIZARD                                                           */
/* ---------------------------------------------------------------------- */
function bindImportEvents() {
  document.getElementById('btnImportLeads').addEventListener('click', () => { resetImportState(); openModal('modalImportLeads'); });
  document.getElementById('importCloseLeads').addEventListener('click', () => closeModal('modalImportLeads'));
  document.getElementById('importCancelLeads').addEventListener('click', () => closeModal('modalImportLeads'));
  document.getElementById('btnDownloadTemplateLeads').addEventListener('click', downloadLeadsTemplate);
  document.getElementById('importFileLeads').addEventListener('change', handleImportFile);
  document.getElementById('btnCommitImportLeads').addEventListener('click', commitImportLeads);
}

function resetImportState() {
  importGroupsLeads = [];
  document.getElementById('importFileLeads').value = '';
  document.getElementById('importPreviewLeads').innerHTML = '';
  document.getElementById('importSummaryLeads').innerHTML = '';
  document.getElementById('btnCommitImportLeads').disabled = true;
}

function downloadLeadsTemplate() {
  const wb = XLSX.utils.book_new();
  const instr = buildInstructionAOA(LEADS_IMPORT_COLS, 'Leads');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Petunjuk Pengisian');
  const header = LEADS_IMPORT_COLS.map(c => c.label + (c.required ? ' *' : ''));
  const example = [
    ['1', '2026-08-01', 'Online', 'Inbound', 'Website', 'Sales Engineer', 'Khoirul Fatihin Rasyid', 'Hot', 'Yes', 'Yes', 'Dewatering', 'Multiflo', 'RF420EXHV-C27', 2, 850000000, 3, 'Month', 5100000000, 'PT Contoh Sukses Abadi', 'Bpk. Contoh', 'Manager'],
    ['1', '2026-08-01', 'Online', 'Inbound', 'Website', 'Sales Engineer', 'Khoirul Fatihin Rasyid', 'Hot', 'Yes', 'Yes', 'Parts & Components', 'Caterpillar', 'CAT320', 1, 120000000, 1, 'Day', 5100000000, 'PT Contoh Sukses Abadi', 'Bpk. Contoh', 'Manager'],
    ['2', '2026-08-02', 'Offline', 'Outbound', 'Site Visit', 'Counter Sales', 'Ratno Wijaya Kusuma', 'Warm', 'Yes', 'No', 'Mobile Crane', 'Sany', 'SANY 25 T', 1, 3200000000, 1, 'Month', 3200000000, 'CV Contoh Makmur', '', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...example]), 'Template Leads');
  workbookDownload(wb, `Template_Import_Leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  file.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('template')) || wb.SheetNames[wb.SheetNames.length - 1];
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const parsed = parseImportSheet(raw, LEADS_IMPORT_COLS);
    const groups = groupImportRows(parsed, 'noTransaksi');
    importGroupsLeads = groups.map(buildLeadsGroup);
    renderImportPreviewLeads();
  }).catch(err => { console.error(err); toast('Gagal membaca file Excel. Pastikan format sesuai template.', 'error'); });
}

function buildLeadsGroup(rowsInGroup) {
  const errors = [];
  rowsInGroup.forEach(r => r.errors.forEach(er => errors.push(`Baris ${r.rowNo}: ${er}`)));
  const head = rowsInGroup[0].rec;
  const items = rowsInGroup.map(r => ({
    itemId: uid(), productGroup: r.rec.productGroup, productBrand: r.rec.productBrand, productModel: r.rec.productModel,
    unitQty: r.rec.unitQty, estimatedPrice: r.rec.estimatedPrice, duration: r.rec.duration, durationRemarks: r.rec.durationRemarks,
  }));
  const totalAmount = calcItemsTotal(items);
  return { noTransaksi: head.noTransaksi, rows: rowsInGroup, errors, head, items, totalAmount };
}

function renderImportPreviewLeads() {
  const wrap = document.getElementById('importPreviewLeads');
  const summary = document.getElementById('importSummaryLeads');
  const validCount = importGroupsLeads.filter(g => g.errors.length === 0).length;
  const errorCount = importGroupsLeads.length - validCount;
  summary.innerHTML = `
    <span class="chip">${importGroupsLeads.length} transaksi terbaca</span>
    <span class="chip ok">${validCount} siap diimpor</span>
    ${errorCount ? `<span class="chip err">${errorCount} bermasalah</span>` : ''}`;
  wrap.innerHTML = importGroupsLeads.length ? `<table class="import-preview-table">
    <thead><tr><th>No Transaksi</th><th>Leads Date</th><th>Customer</th><th>Jml Item</th><th>Total Amount</th><th>Status</th></tr></thead>
    <tbody>${importGroupsLeads.map(g => `
      <tr class="${g.errors.length ? 'row-error' : ''}">
        <td>${escapeHtml(String(g.noTransaksi))}</td>
        <td>${escapeHtml(g.head.leadsDate)}</td>
        <td>${escapeHtml(g.head.customerName)}</td>
        <td>${g.items.length}</td>
        <td>${fmtCurrency(g.totalAmount)}</td>
        <td>${g.errors.length ? `<ul class="import-error-list">${g.errors.map(er => `<li>${escapeHtml(er)}</li>`).join('')}</ul>` : '<span class="badge badge-yes">Valid</span>'}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="lookup-empty">File tidak berisi baris data yang dapat dibaca.</div>`;
  document.getElementById('btnCommitImportLeads').disabled = validCount === 0;
}

function commitImportLeads() {
  const validGroups = importGroupsLeads.filter(g => g.errors.length === 0);
  if (!validGroups.length) return;
  validGroups.forEach(g => {
    const h = g.head;
    const newId = generateId('LDS', h.leadsDate);
    leadsData.unshift({
      id: newId, dbId: uid(), leadsDate: h.leadsDate, leadsGeneration: h.leadsGeneration, leadsType: h.leadsType,
      leadsSource: h.leadsSource, pic: h.pic, picName: h.picName, leadsRating: h.leadsRating, pql: h.pql, qql: h.qql,
      items: g.items, totalAmount: g.totalAmount, leadsAmount: h.leadsAmount, customerName: h.customerName,
      customerPIC: h.customerPIC, title: h.title, createdAt: Date.now(),
    });
  });
  persist();
  toast(`${validGroups.length} transaksi Leads berhasil diimpor.`);
  closeModal('modalImportLeads');
  renderStats();
  renderTable();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
