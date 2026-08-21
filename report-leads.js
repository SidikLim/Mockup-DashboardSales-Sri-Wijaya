/* ==========================================================================
   report-leads.js — Laporan Daftar Leads: filter, cetak PDF, download Excel
   ========================================================================== */

let currentRowsLeads = [];

function init() {
  try {
    initSidebar('report-leads');
    document.getElementById('rlGroup').innerHTML = opts(MASTER.productGroup, true, 'Semua Group');
    document.getElementById('rlBrand').innerHTML = opts(MASTER.productBrand, true, 'Semua Brand');
    document.getElementById('rlModel').innerHTML = opts(MASTER.productModel, true, 'Semua Model');
    document.getElementById('rlPic').innerHTML = opts(MASTER.picName, true, 'Semua PIC');
    document.getElementById('rlSource').innerHTML = opts(MASTER.leadsSource, true, 'Semua Source');
    document.getElementById('rlRating').innerHTML = opts(MASTER.leadsRating, true, 'Semua Rating');
    document.getElementById('rlPql').innerHTML = opts(MASTER.yesNo, true, 'Semua PQL');
    document.getElementById('rlQql').innerHTML = opts(MASTER.yesNo, true, 'Semua QQL');
    bindEvents();
    renderReport();
  } catch (err) {
    console.error('Gagal memuat halaman:', err);
    alert('Terjadi kesalahan saat memuat halaman. Buka Console (F12) untuk detail.');
  }
}

const FILTER_IDS = ['rlFrom', 'rlTo', 'rlGroup', 'rlBrand', 'rlModel', 'rlPic', 'rlSource', 'rlRating', 'rlPql', 'rlQql', 'rlSearch'];

function currentFilters() {
  return {
    dateFrom: document.getElementById('rlFrom').value,
    dateTo: document.getElementById('rlTo').value,
    productGroup: document.getElementById('rlGroup').value,
    productBrand: document.getElementById('rlBrand').value,
    productModel: document.getElementById('rlModel').value,
    picName: document.getElementById('rlPic').value,
    leadsSource: document.getElementById('rlSource').value,
    leadsRating: document.getElementById('rlRating').value,
    pql: document.getElementById('rlPql').value,
    qql: document.getElementById('rlQql').value,
    customer: document.getElementById('rlSearch').value,
  };
}

function bindEvents() {
  FILTER_IDS.forEach(id => {
    document.getElementById(id).addEventListener('input', renderReport);
    document.getElementById(id).addEventListener('change', renderReport);
  });
  document.getElementById('rlReset').addEventListener('click', () => {
    FILTER_IDS.forEach(id => document.getElementById(id).value = '');
    renderReport();
  });
  document.getElementById('rlExportExcel').addEventListener('click', exportExcel);
  document.getElementById('rlPrintPdf').addEventListener('click', printPdf);
}

function renderReport() {
  currentRowsLeads = filterTransactions(leadsData, currentFilters());
  currentRowsLeads.sort((a, b) => (a.leadsDate < b.leadsDate ? 1 : -1));
  const grand = currentRowsLeads.reduce((s, r) => s + r.totalAmount, 0);
  const hasData = currentRowsLeads.length > 0;
  document.getElementById('rlSummary').innerHTML = `
    <span class="chip">${currentRowsLeads.length} dari ${leadsData.length} transaksi cocok dengan filter</span>
    <span class="chip ${hasData ? 'ok' : 'err'}">${fmtCurrency(grand)} total nilai</span>`;
  document.getElementById('rlExportExcel').disabled = !hasData;
  document.getElementById('rlPrintPdf').disabled = !hasData;
}

function filterSummaryLines(f) {
  const lines = [`Periode: ${periodLabel(f.dateFrom, f.dateTo)}`];
  if (f.productGroup) lines.push(`Product Group: ${f.productGroup}`);
  if (f.productBrand) lines.push(`Product Brand: ${f.productBrand}`);
  if (f.productModel) lines.push(`Product Model: ${f.productModel}`);
  if (f.picName) lines.push(`PIC: ${f.picName}`);
  if (f.leadsSource) lines.push(`Source: ${f.leadsSource}`);
  if (f.leadsRating) lines.push(`Rating: ${f.leadsRating}`);
  if (f.pql) lines.push(`PQL: ${f.pql}`);
  if (f.qql) lines.push(`QQL: ${f.qql}`);
  if (f.customer) lines.push(`Cari: "${escapeHtml(f.customer)}"`);
  return lines;
}

function printPdf() {
  const f = currentFilters();
  const columns = [
    { key: 'id', label: 'Nomor Bukti' }, { key: 'leadsDate', label: 'Leads Date' }, { key: 'customerName', label: 'Customer' },
    { key: 'produk', label: 'Produk' }, { key: 'picName', label: 'PIC' }, { key: 'leadsRating', label: 'Rating' },
    { key: 'jmlItem', label: 'Jml Item', align: 'center' }, { key: 'totalAmount', label: 'Total Amount', align: 'right' },
  ];
  const rows = currentRowsLeads.map(r => ({
    id: r.id, leadsDate: fmtDateDMY(r.leadsDate), customerName: escapeHtml(r.customerName),
    produk: r.items.map(it => `${escapeHtml(it.productBrand)} ${escapeHtml(it.productModel)} (${it.unitQty}x)`).join('<br>'),
    picName: escapeHtml(r.picName), leadsRating: r.leadsRating, jmlItem: r.items.length, totalAmount: fmtCurrency(r.totalAmount),
  }));
  const grand = fmtCurrency(currentRowsLeads.reduce((s, r) => s + r.totalAmount, 0));
  printReport('Laporan Daftar Leads', filterSummaryLines(f), columns, rows, grand);
}

function exportExcel() {
  const rows = [];
  currentRowsLeads.forEach(r => {
    r.items.forEach(it => {
      rows.push({
        'Nomor Bukti': r.id, 'Leads Date': r.leadsDate, 'Leads Generation': r.leadsGeneration, 'Leads Type': r.leadsType,
        'Leads Source': r.leadsSource, 'PIC': r.pic, 'PIC Name': r.picName, 'Leads Rating': r.leadsRating,
        'PQL': r.pql, 'QQL': r.qql, 'Product Group': it.productGroup, 'Product Brand': it.productBrand,
        'Product Model': it.productModel, 'Unit Qty': it.unitQty, 'Estimated Price (IDR)': it.estimatedPrice,
        'Duration': it.duration, 'Duration Remarks': it.durationRemarks, 'Item Total Amount (IDR)': calcItemTotal(it),
        'Total Amount Transaksi (IDR)': r.totalAmount, 'Leads Amount (IDR)': r.leadsAmount,
        'Customer Name': r.customerName, 'Customer PIC': r.customerPIC, 'Title': r.title,
      });
    });
  });
  if (!rows.length) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Laporan Leads');
  workbookDownload(wb, `Laporan_Leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
