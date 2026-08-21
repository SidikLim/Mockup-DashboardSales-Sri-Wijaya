/* ==========================================================================
   prospects-list.js — Logic halaman Daftar Transaksi Prospek
   Termasuk wizard Import Excel (multi item per transaksi, dengan validasi Ref Leads).
   ========================================================================== */

const state = {
  search: '', pic: '', dateFrom: '', dateTo: '',
  sortKey: 'createdAt', sortDir: 'desc', page: 1, pageSize: 8,
};
let pendingDeleteDbId = null;
let pendingLookupLeadsId = null;
let importGroupsProspects = [];

const PROSPECTS_IMPORT_COLS = [
  { key: 'noTransaksi', label: 'No Transaksi', required: true, type: 'text', note: 'Isi angka yang sama untuk baris item produk dalam satu transaksi yang sama (multi item).' },
  { key: 'leadsRef', label: 'Ref. Nomor Bukti Leads', required: true, type: 'text', note: 'Harus berupa Nomor Bukti Leads yang sudah tersimpan di sistem dan belum memiliki transaksi Prospek lain.' },
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
  { key: 'prospectsAmount', label: 'Prospects Amount (IDR)', required: true, type: 'number', note: 'Isi nilai yang sama pada setiap baris item dalam satu transaksi (nilai level transaksi).' },
  { key: 'customerName', label: 'Customer Name', required: true, type: 'text' },
  { key: 'customerPIC', label: 'Customer PIC', required: false, type: 'text' },
  { key: 'title', label: 'Title', required: false, type: 'text' },
];

function init() {
  try {
    initSidebar('prospects-list');
    showFlashToast();
    document.getElementById('filterPicProspects').innerHTML = opts(MASTER.picName, true, 'Semua PIC');
    bindEvents();
    bindImportEvents();
    renderTable();
  } catch (err) {
    console.error('Gagal memuat halaman:', err);
    alert('Terjadi kesalahan saat memuat halaman. Buka Console (F12) untuk detail.');
  }
}

function bindEvents() {
  document.getElementById('searchProspects').addEventListener('input', e => { state.search = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('filterPicProspects').addEventListener('change', e => { state.pic = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('dateFromProspects').addEventListener('change', e => { state.dateFrom = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('dateToProspects').addEventListener('change', e => { state.dateTo = e.target.value; state.page = 1; renderTable(); });
  document.getElementById('btnResetProspects').addEventListener('click', resetFilters);
  document.querySelectorAll('#tableProspects thead th[data-sort]').forEach(th => th.addEventListener('click', () => toggleSort(th.dataset.sort)));

  document.getElementById('btnNewProspects').addEventListener('click', openLookupModal);
  document.getElementById('lookupClose').addEventListener('click', () => closeModal('modalLookup'));
  document.getElementById('lookupSearch').addEventListener('input', renderLookupList);

  document.getElementById('pqlWarnCancel').addEventListener('click', () => closeModal('modalPqlWarn'));
  document.getElementById('pqlWarnContinue').addEventListener('click', () => {
    closeModal('modalPqlWarn');
    if (pendingLookupLeadsId) window.location.href = `prospects-form.html?ref=${encodeURIComponent(pendingLookupLeadsId)}`;
  });

  document.getElementById('confirmCancel').addEventListener('click', () => closeModal('modalConfirm'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);

  document.getElementById('overlay').addEventListener('click', () => {
    closeModal('modalLookup'); closeModal('modalConfirm'); closeModal('modalPqlWarn'); closeModal('modalImportProspects');
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['modalPqlWarn', 'modalConfirm', 'modalLookup', 'modalImportProspects'].forEach(id => {
      if (document.getElementById(id).classList.contains('is-open')) closeModal(id);
    });
  });
}

function resetFilters() {
  Object.assign(state, { search: '', pic: '', dateFrom: '', dateTo: '', page: 1 });
  document.getElementById('searchProspects').value = '';
  document.getElementById('filterPicProspects').value = '';
  document.getElementById('dateFromProspects').value = '';
  document.getElementById('dateToProspects').value = '';
  renderTable();
}

function toggleSort(key) {
  if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sortKey = key; state.sortDir = 'asc'; }
  renderTable();
}

function renderTable() {
  let rows = [...prospectsData];
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(r => r.id.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.leadsRef.toLowerCase().includes(q));
  }
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

  document.querySelectorAll('#tableProspects thead th[data-sort]').forEach(th => {
    const active = th.dataset.sort === state.sortKey;
    th.classList.toggle('sorted', active);
    const ico = th.querySelector('.sort-ico');
    if (ico) ico.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  const tbody = document.querySelector('#tableProspects tbody');
  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state__icon">🎯</div><h3>Belum ada data Prospek</h3><p>Buat Prospek baru dengan merujuk Nomor Bukti Leads tersimpan.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(r => `
      <tr>
        <td><span class="id-plate">${r.id}</span></td>
        <td><span class="id-plate ref">${r.leadsRef}</span></td>
        <td class="cell-strong">${escapeHtml(r.customerName)}</td>
        <td class="cell-muted">${itemsSummaryText(r.items)}</td>
        <td class="cell-strong">${fmtCurrency(r.prospectsAmount)}</td>
        <td class="cell-muted">${escapeHtml(r.picName)}</td>
        <td class="cell-muted">${fmtDateDMY(r.leadsDate)}</td>
        <td>
          <div class="cell-actions">
            <button class="btn btn-outline btn-icon" title="Cetak" onclick="printProspect('${r.dbId}')">🖨️</button>
            <a class="btn btn-outline btn-icon" title="Ubah" href="prospects-form.html?id=${encodeURIComponent(r.dbId)}">✏️</a>
            <button class="btn btn-danger btn-icon" title="Hapus" onclick="confirmDelete('${r.dbId}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination(state.page, totalPages);
  document.getElementById('countProspects').textContent = `Menampilkan ${pageRows.length} dari ${total} transaksi`;
}

function renderPagination(page, totalPages) {
  const el = document.getElementById('paginationProspects');
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

/* ---- Lookup modal: pilih Nomor Bukti Leads utk New Prospek ---- */
function openLookupModal() {
  document.getElementById('lookupSearch').value = '';
  renderLookupList();
  openModal('modalLookup');
}

function renderLookupList() {
  const q = document.getElementById('lookupSearch').value.toLowerCase();
  let rows = leadsData.filter(r => countProspectsForLeads(r.id) === 0);
  if (q) rows = rows.filter(r => r.id.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q));
  rows.sort((a, b) => b.createdAt - a.createdAt);

  const el = document.getElementById('lookupResults');
  if (rows.length === 0) {
    el.innerHTML = `<div class="lookup-empty">Semua data Leads sudah memiliki Prospek, atau tidak ada yang cocok dengan pencarian.</div>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="lookup-row" data-id="${r.id}">
      <span class="id-plate">${r.id}</span>
      <span class="cell-muted">${fmtDateDMY(r.leadsDate)}</span>
      <span class="cell-strong">${escapeHtml(r.customerName)}</span>
      <span class="cell-muted">${itemsSummaryText(r.items)}</span>
      <span class="cell-strong">${fmtCurrency(r.totalAmount)}</span>
      <span>${ratingBadge(r.leadsRating)}</span>
    </div>`).join('');
  el.querySelectorAll('.lookup-row').forEach(row => row.addEventListener('click', () => {
    const rec = leadsData.find(l => l.id === row.dataset.id);
    closeModal('modalLookup');
    if (rec.pql === 'No') {
      pendingLookupLeadsId = rec.id;
      openModal('modalPqlWarn');
    } else {
      window.location.href = `prospects-form.html?ref=${encodeURIComponent(rec.id)}`;
    }
  }));
}

/* ---- Delete ---- */
function confirmDelete(dbId) {
  const rec = prospectsData.find(p => p.dbId === dbId);
  document.getElementById('confirmText').textContent = `Apakah Anda yakin ingin menghapus data Prospek ${rec.id} (${rec.customerName})? Tindakan ini tidak dapat dibatalkan.`;
  pendingDeleteDbId = dbId;
  openModal('modalConfirm');
}

function executeDelete() {
  if (!pendingDeleteDbId) return;
  prospectsData = prospectsData.filter(p => p.dbId !== pendingDeleteDbId);
  persist();
  pendingDeleteDbId = null;
  closeModal('modalConfirm');
  toast('Data Prospek berhasil dihapus.');
  renderTable();
}

/* ---------------------------------------------------------------------- */
/* IMPORT WIZARD                                                           */
/* ---------------------------------------------------------------------- */
function bindImportEvents() {
  document.getElementById('btnImportProspects').addEventListener('click', () => { resetImportState(); openModal('modalImportProspects'); });
  document.getElementById('importCloseProspects').addEventListener('click', () => closeModal('modalImportProspects'));
  document.getElementById('importCancelProspects').addEventListener('click', () => closeModal('modalImportProspects'));
  document.getElementById('btnDownloadTemplateProspects').addEventListener('click', downloadProspectsTemplate);
  document.getElementById('importFileProspects').addEventListener('change', handleImportFile);
  document.getElementById('btnCommitImportProspects').addEventListener('click', commitImportProspects);
}

function resetImportState() {
  importGroupsProspects = [];
  document.getElementById('importFileProspects').value = '';
  document.getElementById('importPreviewProspects').innerHTML = '';
  document.getElementById('importSummaryProspects').innerHTML = '';
  document.getElementById('btnCommitImportProspects').disabled = true;
}

function downloadProspectsTemplate() {
  const wb = XLSX.utils.book_new();
  const instr = buildInstructionAOA(PROSPECTS_IMPORT_COLS, 'Prospek');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Petunjuk Pengisian');
  const header = PROSPECTS_IMPORT_COLS.map(c => c.label + (c.required ? ' *' : ''));
  const sampleRef = leadsData.filter(l => countProspectsForLeads(l.id) === 0)[0];
  const refId = sampleRef ? sampleRef.id : 'LDS/202608/0001';
  const example = [
    ['1', refId, '2026-08-01', 'Online', 'Inbound', 'Website', 'Sales Engineer', 'Khoirul Fatihin Rasyid', 'Hot', 'Yes', 'Yes', 'Dewatering', 'Multiflo', 'RF420EXHV-C27', 2, 850000000, 3, 'Month', 5100000000, 'PT Contoh Sukses Abadi', 'Bpk. Contoh', 'Manager'],
    ['1', refId, '2026-08-01', 'Online', 'Inbound', 'Website', 'Sales Engineer', 'Khoirul Fatihin Rasyid', 'Hot', 'Yes', 'Yes', 'Parts & Components', 'Caterpillar', 'CAT320', 1, 120000000, 1, 'Day', 5100000000, 'PT Contoh Sukses Abadi', 'Bpk. Contoh', 'Manager'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...example]), 'Template Prospek');
  workbookDownload(wb, `Template_Import_Prospek_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  file.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('template')) || wb.SheetNames[wb.SheetNames.length - 1];
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const parsed = parseImportSheet(raw, PROSPECTS_IMPORT_COLS);
    const groups = groupImportRows(parsed, 'noTransaksi');
    const usedRefs = new Set();
    importGroupsProspects = groups.map(g => buildProspectsGroup(g, usedRefs));
    renderImportPreviewProspects();
  }).catch(err => { console.error(err); toast('Gagal membaca file Excel. Pastikan format sesuai template.', 'error'); });
}

function buildProspectsGroup(rowsInGroup, usedRefs) {
  const errors = [];
  rowsInGroup.forEach(r => r.errors.forEach(er => errors.push(`Baris ${r.rowNo}: ${er}`)));
  const head = rowsInGroup[0].rec;
  const leadsRec = leadsData.find(l => l.id === head.leadsRef);
  if (!leadsRec) errors.push(`Ref. Nomor Bukti Leads "${head.leadsRef}" tidak ditemukan di sistem.`);
  else if (countProspectsForLeads(leadsRec.id) > 0) errors.push(`Leads ${leadsRec.id} sudah memiliki transaksi Prospek.`);
  if (head.leadsRef) {
    if (usedRefs.has(head.leadsRef)) errors.push(`Ref. Nomor Bukti Leads "${head.leadsRef}" dipakai lebih dari satu transaksi Prospek dalam file ini.`);
    usedRefs.add(head.leadsRef);
  }
  const items = rowsInGroup.map(r => ({
    itemId: uid(), productGroup: r.rec.productGroup, productBrand: r.rec.productBrand, productModel: r.rec.productModel,
    unitQty: r.rec.unitQty, estimatedPrice: r.rec.estimatedPrice, duration: r.rec.duration, durationRemarks: r.rec.durationRemarks,
  }));
  const totalAmount = calcItemsTotal(items);
  return { noTransaksi: head.noTransaksi, rows: rowsInGroup, errors, head, items, totalAmount };
}

function renderImportPreviewProspects() {
  const wrap = document.getElementById('importPreviewProspects');
  const summary = document.getElementById('importSummaryProspects');
  const validCount = importGroupsProspects.filter(g => g.errors.length === 0).length;
  const errorCount = importGroupsProspects.length - validCount;
  summary.innerHTML = `
    <span class="chip">${importGroupsProspects.length} transaksi terbaca</span>
    <span class="chip ok">${validCount} siap diimpor</span>
    ${errorCount ? `<span class="chip err">${errorCount} bermasalah</span>` : ''}`;
  wrap.innerHTML = importGroupsProspects.length ? `<table class="import-preview-table">
    <thead><tr><th>No Transaksi</th><th>Ref. Leads</th><th>Customer</th><th>Jml Item</th><th>Prospects Amount</th><th>Status</th></tr></thead>
    <tbody>${importGroupsProspects.map(g => `
      <tr class="${g.errors.length ? 'row-error' : ''}">
        <td>${escapeHtml(String(g.noTransaksi))}</td>
        <td>${escapeHtml(g.head.leadsRef)}</td>
        <td>${escapeHtml(g.head.customerName)}</td>
        <td>${g.items.length}</td>
        <td>${fmtCurrency(g.head.prospectsAmount)}</td>
        <td>${g.errors.length ? `<ul class="import-error-list">${g.errors.map(er => `<li>${escapeHtml(er)}</li>`).join('')}</ul>` : '<span class="badge badge-yes">Valid</span>'}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="lookup-empty">File tidak berisi baris data yang dapat dibaca.</div>`;
  document.getElementById('btnCommitImportProspects').disabled = validCount === 0;
}

function commitImportProspects() {
  const validGroups = importGroupsProspects.filter(g => g.errors.length === 0);
  if (!validGroups.length) return;
  validGroups.forEach(g => {
    const h = g.head;
    const newId = generateId('PRS', h.leadsDate);
    prospectsData.unshift({
      id: newId, dbId: uid(), leadsRef: h.leadsRef, leadsDate: h.leadsDate, leadsGeneration: h.leadsGeneration, leadsType: h.leadsType,
      leadsSource: h.leadsSource, pic: h.pic, picName: h.picName, leadsRating: h.leadsRating, pql: h.pql, qql: h.qql,
      items: g.items, totalAmount: g.totalAmount, prospectsAmount: h.prospectsAmount, customerName: h.customerName,
      customerPIC: h.customerPIC, title: h.title, createdAt: Date.now(),
    });
  });
  persist();
  toast(`${validGroups.length} transaksi Prospek berhasil diimpor.`);
  closeModal('modalImportProspects');
  renderTable();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
