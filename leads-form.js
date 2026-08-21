/* ==========================================================================
   leads-form.js — Logic halaman Form Transaksi Leads (Baru / Ubah)
   Produk kini berupa tabel item multi-baris (bisa ditambah/dihapus).
   ========================================================================== */

let editingDbId = null;
let items = [];

function init() {
  try {
    initSidebar('leads-list');
    fillSelect('formLeadsGeneration', MASTER.leadsGeneration);
    fillSelect('formLeadsType', MASTER.leadsType);
    fillSelect('formLeadsSource', MASTER.leadsSource);
    fillSelect('formLeadsPic', MASTER.pic);
    fillSelect('formLeadsPicName', MASTER.picName);
    fillSelect('formLeadsRating', MASTER.leadsRating);
    fillSelect('formLeadsPQL', MASTER.yesNo);
    fillSelect('formLeadsQQL', MASTER.yesNo);

    editingDbId = qs('id');
    const record = editingDbId ? leadsData.find(l => l.dbId === editingDbId) : null;

    if (record && countProspectsForLeads(record.id) > 0) {
      sessionStorage.setItem('lpm_flash_error', `Data Leads ${record.id} tidak dapat diubah karena sudah memiliki transaksi Prospek terkait.`);
      window.location.href = 'leads-list.html';
      return;
    }

    document.getElementById('pageTitle').textContent = record ? 'Ubah Transaksi Leads' : 'Transaksi Leads Baru';
    document.getElementById('pageSubtitle').textContent = record ? record.id : 'Nomor Bukti akan dibuat otomatis saat disimpan';
    document.getElementById('breadcrumbCurrent').textContent = record ? record.id : 'Baru';

    if (record) {
      document.getElementById('formLeadsId').value = record.id;
      document.getElementById('formLeadsIdDisplay').value = record.id;
      document.getElementById('formLeadsDate').value = record.leadsDate;
      document.getElementById('formLeadsDateLong').value = fmtDateLong(record.leadsDate);
      document.getElementById('formLeadsGeneration').value = record.leadsGeneration;
      document.getElementById('formLeadsType').value = record.leadsType;
      document.getElementById('formLeadsSource').value = record.leadsSource;
      document.getElementById('formLeadsPic').value = record.pic;
      document.getElementById('formLeadsPicName').value = record.picName;
      document.getElementById('formLeadsRating').value = record.leadsRating;
      document.getElementById('formLeadsPQL').value = record.pql;
      document.getElementById('formLeadsQQL').value = record.qql;
      document.getElementById('formLeadsAmount').value = record.leadsAmount;
      document.getElementById('formLeadsCustomerName').value = record.customerName;
      document.getElementById('formLeadsCustomerPIC').value = record.customerPIC || '';
      document.getElementById('formLeadsTitle').value = record.title || '';
      document.getElementById('formLeadsProspectsAmount').value = fmtCurrency(sumProspectsForLeads(record.id));
      document.getElementById('formLeadsQuotationAmount').value = fmtCurrency(0) + ' (Modul Quotation belum tersedia)';
      items = cloneItems(record.items && record.items.length ? record.items : [newItem()]);
    } else {
      document.getElementById('formLeadsIdDisplay').value = 'Akan dibuat otomatis saat disimpan';
      document.getElementById('formLeadsProspectsAmount').value = fmtCurrency(0);
      document.getElementById('formLeadsQuotationAmount').value = fmtCurrency(0) + ' (Modul Quotation belum tersedia)';
      items = [newItem()];
    }

    document.getElementById('btnAddItem').addEventListener('click', addItem);
    document.getElementById('formLeadsDate').addEventListener('change', e => {
      document.getElementById('formLeadsDateLong').value = e.target.value ? fmtDateLong(e.target.value) : '';
    });
    document.getElementById('formLeads').addEventListener('submit', submitForm);

    renderItems();
  } catch (err) {
    console.error('Gagal memuat form:', err);
    alert('Terjadi kesalahan saat memuat form. Buka Console (F12) untuk detail.');
  }
}

/* ---------------------------------------------------------------------- */
/* ITEM TABLE (Multi Produk)                                              */
/* ---------------------------------------------------------------------- */
function renderItems() {
  const tbody = document.getElementById('itemTableBody');
  tbody.innerHTML = items.map((it, idx) => `
    <tr data-item-id="${it.itemId}">
      <td>${idx + 1}</td>
      <td><select data-field="productGroup">${opts(MASTER.productGroup, false)}</select></td>
      <td><select data-field="productBrand">${opts(MASTER.productBrand, false)}</select></td>
      <td><select data-field="productModel">${opts(MASTER.productModel, false)}</select></td>
      <td><input type="number" min="1" step="1" data-field="unitQty" value="${it.unitQty}"></td>
      <td><input type="number" min="0" step="1" data-field="estimatedPrice" value="${it.estimatedPrice}"></td>
      <td class="item-dur">
        <input type="number" min="1" step="1" data-field="duration" value="${it.duration}">
        <select data-field="durationRemarks">${opts(MASTER.durationRemarks, false)}</select>
      </td>
      <td><input type="text" class="item-total" data-field="totalDisplay" value="${fmtCurrency(calcItemTotal(it))}" readonly></td>
      <td><button type="button" class="item-remove-btn" title="Hapus item" ${items.length <= 1 ? 'disabled' : ''}>✕</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    const id = tr.dataset.itemId;
    const it = items.find(x => x.itemId === id);
    tr.querySelector('[data-field="productGroup"]').value = it.productGroup;
    tr.querySelector('[data-field="productBrand"]').value = it.productBrand;
    tr.querySelector('[data-field="productModel"]').value = it.productModel;
    tr.querySelector('[data-field="durationRemarks"]').value = it.durationRemarks;
    tr.querySelectorAll('select,input[type="number"]').forEach(el => {
      el.addEventListener('input', () => onItemFieldChange(id, el.dataset.field, el.value));
      el.addEventListener('change', () => onItemFieldChange(id, el.dataset.field, el.value));
    });
    tr.querySelector('.item-remove-btn').addEventListener('click', () => removeItem(id));
  });
  recalcGrandTotal();
}

function onItemFieldChange(itemId, field, value) {
  const it = items.find(x => x.itemId === itemId);
  if (!it) return;
  it[field] = ['unitQty', 'estimatedPrice', 'duration'].includes(field) ? (Number(value) || 0) : value;
  const tr = document.querySelector(`tr[data-item-id="${itemId}"]`);
  if (tr) tr.querySelector('[data-field="totalDisplay"]').value = fmtCurrency(calcItemTotal(it));
  recalcGrandTotal();
}

function addItem() {
  items.push(newItem());
  renderItems();
}
function removeItem(itemId) {
  if (items.length <= 1) { toast('Minimal 1 item produk harus tetap ada.', 'error'); return; }
  items = items.filter(x => x.itemId !== itemId);
  renderItems();
}
function recalcGrandTotal() {
  const grand = calcItemsTotal(items);
  document.getElementById('itemGrandTotal').textContent = fmtCurrency(grand);
  document.getElementById('formLeadsTotal').value = fmtCurrency(grand);
}

/* ---------------------------------------------------------------------- */
/* SUBMIT                                                                  */
/* ---------------------------------------------------------------------- */
function submitForm(e) {
  e.preventDefault();
  const date = document.getElementById('formLeadsDate').value;

  if (!document.getElementById('formLeadsCustomerName').value.trim()) { toast('Customer Name wajib diisi.', 'error'); return; }
  if (!items.length) { toast('Minimal 1 item produk wajib diisi.', 'error'); return; }
  for (const it of items) {
    if (!it.productGroup || !it.productBrand || !it.productModel) { toast('Product Group / Brand / Model pada setiap item wajib diisi.', 'error'); return; }
    if (Number(it.unitQty) < 1) { toast('Unit Qty setiap item minimal 1.', 'error'); return; }
    if (Number(it.duration) < 1) { toast('Duration setiap item minimal 1.', 'error'); return; }
  }

  const payload = {
    leadsDate: date,
    leadsGeneration: document.getElementById('formLeadsGeneration').value,
    leadsType: document.getElementById('formLeadsType').value,
    leadsSource: document.getElementById('formLeadsSource').value,
    pic: document.getElementById('formLeadsPic').value,
    picName: document.getElementById('formLeadsPicName').value,
    leadsRating: document.getElementById('formLeadsRating').value,
    pql: document.getElementById('formLeadsPQL').value,
    qql: document.getElementById('formLeadsQQL').value,
    items: items,
    totalAmount: calcItemsTotal(items),
    leadsAmount: Number(document.getElementById('formLeadsAmount').value),
    customerName: document.getElementById('formLeadsCustomerName').value.trim(),
    customerPIC: document.getElementById('formLeadsCustomerPIC').value.trim(),
    title: document.getElementById('formLeadsTitle').value.trim(),
  };

  if (editingDbId) {
    const idx = leadsData.findIndex(l => l.dbId === editingDbId);
    leadsData[idx] = { ...leadsData[idx], ...payload };
    persist();
    sessionStorage.setItem('lpm_flash', 'Transaksi Leads berhasil diperbarui.');
  } else {
    const newId = generateId('LDS', date);
    leadsData.unshift({ id: newId, dbId: uid(), ...payload, createdAt: Date.now() });
    persist();
    sessionStorage.setItem('lpm_flash', `Leads baru tersimpan dengan Nomor Bukti ${newId}.`);
  }
  window.location.href = 'leads-list.html';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
