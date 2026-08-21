/* ==========================================================================
   report-prospects.js — Laporan Daftar Prospek: filter, cetak PDF, download Excel
   ========================================================================== */

let currentRowsProspects = [];

function init() {
  try {
    initSidebar('report-prospects');
    document.getElementById('rpGroup').innerHTML = opts(MASTER.productGroup, true, 'Semua Group');
    document.getElementById('rpBrand').innerHTML = opts(MASTER.productBrand, true, 'Semua Brand');
    document.getElementById('rpModel').innerHTML = opts(MASTER.productModel, true, 'Semua Model');
    document.getElementById('rpPic').innerHTML = opts(MASTER.picName, true, 'Semua PIC');
    document.getElementById('rpSource').innerHTML = opts(MASTER.leadsSource, true, 'Semua Source');
    document.getElementById('rpRating').innerHTML = opts(MASTER.leadsRating, true, 'Semua Rating');
    bindEvents();
    renderReport();
  } catch (err) {
    console.error('Gagal memuat halaman:', err);
    alert('Terjadi kesalahan saat memuat halaman. Buka Console (F12) untuk detail.');
  }
}

const FILTER_IDS = ['rpFrom', 'rpTo', 'rpGroup', 'rpBrand', 'rpModel', 'rpPic', 'rpSource', 'rpRating', 'rpRef', 'rpSearch'];

function currentFilters() {
  return {
    dateFrom: document.getElementById('rpFrom').value,
    dateTo: document.getElementById('rpTo').value,
    productGroup: document.getElementById('rpGroup').value,
    productBrand: document.getElementById('rpBrand').value,
    productModel: document.getElementById('rpModel').value,
    picName: document.getElementById('rpPic').value,
    leadsSource: document.getElementById('rpSource').value,
    leadsRating: document.getElementById('rpRating').value,
    leadsRef: document.getElementById('rpRef').value.trim(),
    customer: document.getElementById('rpSearch').value,
  };
}

function bindEvents() {
  FILTER_IDS.forEach(id => {
    document.getElementById(id).addEventListener('input', renderReport);
    document.getElementById(id).addEventListener('change', renderReport);
  });
  document.getElementById('rpReset').addEventListener('click', () => {
    FILTER_IDS.forEach(id => document.getElementById(id).value = '');
    renderReport();
  });
  document.getElementById('rpExportExcel').addEventListener('click', exportExcel);
  document.getElementById('rpPrintPdf').addEventListener('click', printPdf);
}

function renderReport() {
  currentRowsProspects = filterTransactions(prospectsData, currentFilters());
  currentRowsProspects.sort((a, b) => (a.leadsDate < b.leadsDate ? 1 : -1));
  const grand = currentRowsProspects.reduce((s, r) => s + (Number(r.prospectsAmount) || 0), 0);
  const hasData = currentRowsProspects.length > 0;
  document.getElementById('rpSummary').innerHTML = `
    <span class="chip">${currentRowsProspects.length} dari ${prospectsData.length} transaksi cocok dengan filter</span>
    <span class="chip ${hasData ? 'ok' : 'err'}">${fmtCurrency(grand)} total Prospects Amount</span>`;
  document.getElementById('rpExportExcel').disabled = !hasData;
  document.getElementById('rpPrintPdf').disabled = !hasData;
}

function filterSummaryLines(f) {
  const lines = [`Periode: ${periodLabel(f.dateFrom, f.dateTo)}`];
  if (f.productGroup) lines.push(`Product Group: ${f.productGroup}`);
  if (f.productBrand) lines.push(`Product Brand: ${f.productBrand}`);
  if (f.productModel) lines.push(`Product Model: ${f.productModel}`);
  if (f.picName) lines.push(`PIC: ${f.picName}`);
  if (f.leadsSource) lines.push(`Source: ${f.leadsSource}`);
  if (f.leadsRating) lines.push(`Rating: ${f.leadsRating}`);
  if (f.leadsRef) lines.push(`Ref. Leads: "${escapeHtml(f.leadsRef)}"`);
  if (f.customer) lines.push(`Cari: "${escapeHtml(f.customer)}"`);
  return lines;
}

function printPdf() {
  const f = currentFilters();
  const columns = [
    { key: 'id', label: 'Nomor Bukti' }, { key: 'leadsRef', label: 'Ref. Leads' }, { key: 'leadsDate', label: 'Tanggal' },
    { key: 'customerName', label: 'Customer' }, { key: 'produk', label: 'Produk' }, { key: 'picName', label: 'PIC' },
    { key: 'jmlItem', label: 'Jml Item', align: 'center' }, { key: 'prospectsAmount', label: 'Prospects Amount', align: 'right' },
  ];
  const rows = currentRowsProspects.map(r => ({
    id: r.id, leadsRef: r.leadsRef, leadsDate: fmtDateDMY(r.leadsDate), customerName: escapeHtml(r.customerName),
    produk: r.items.map(it => `${escapeHtml(it.productBrand)} ${escapeHtml(it.productModel)} (${it.unitQty}x)`).join('<br>'),
    picName: escapeHtml(r.picName), jmlItem: r.items.length, prospectsAmount: fmtCurrency(r.prospectsAmount),
  }));
  const grand = fmtCurrency(currentRowsProspects.reduce((s, r) => s + (Number(r.prospectsAmount) || 0), 0));
  printReport('Laporan Daftar Prospek', filterSummaryLines(f), columns, rows, grand);
}

function exportExcel() {
  const rows = [];
  currentRowsProspects.forEach(r => {
    r.items.forEach(it => {
      rows.push({
        'Nomor Bukti': r.id, 'Ref. Nomor Bukti Leads': r.leadsRef, 'Leads Date': r.leadsDate, 'Leads Generation': r.leadsGeneration,
        'Leads Type': r.leadsType, 'Leads Source': r.leadsSource, 'PIC': r.pic, 'PIC Name': r.picName, 'Leads Rating': r.leadsRating,
        'PQL': r.pql, 'QQL': r.qql, 'Product Group': it.productGroup, 'Product Brand': it.productBrand,
        'Product Model': it.productModel, 'Unit Qty': it.unitQty, 'Estimated Price (IDR)': it.estimatedPrice,
        'Duration': it.duration, 'Duration Remarks': it.durationRemarks, 'Item Total Amount (IDR)': calcItemTotal(it),
        'Total Amount Transaksi (IDR)': r.totalAmount, 'Prospects Amount (IDR)': r.prospectsAmount,
        'Customer Name': r.customerName, 'Customer PIC': r.customerPIC, 'Title': r.title,
      });
    });
  });
  if (!rows.length) { toast('Tidak ada data untuk diunduh.', 'error'); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Laporan Prospek');
  workbookDownload(wb, `Laporan_Prospek_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
