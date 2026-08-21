/* ==========================================================================
   prospects-form.js — Logic halaman Form Transaksi Prospek (Baru / Ubah)
   Produk kini berupa tabel item multi-baris, disalin dari Leads terpilih
   dan tetap dapat disesuaikan.
   ========================================================================== */

let editingDbId = null;
let items = [];

function init() {
  try {
    initSidebar('prospects-list');

    editingDbId = qs('id');
    const refParam = qs('ref');
    const record = editingDbId ? prospectsData.find(p => p.dbId === editingDbId) : null;
    const sourceLeads = (!record && refParam) ? leadsData.find(l => l.id === refParam) : null;

    if (!record && sourceLeads && countProspectsForLeads(sourceLeads.id) > 0) {
      sessionStorage.setItem('lpm_flash_error', `Data Leads ${sourceLeads.id} sudah memiliki transaksi Prospek dan tidak dapat dibuatkan Prospek baru.`);
      window.location.href = 'prospects-list.html';
      return;
    }

    if (!record && !sourceLeads) {
      document.getElementById('noRefState').classList.remove('hidden');
      document.getElementById('formProspects').classList.add('hidden');
      return;
    }
    document.getElementById('formProspects').classList.remove('hidden');

    fillSelect('formProsGeneration', MASTER.leadsGeneration);
    fillSelect('formProsType', MASTER.leadsType);
    fillSelect('formProsSource', MASTER.leadsSource);
    fillSelect('formProsPic', MASTER.pic);
    fillSelect('formProsPicName', MASTER.picName);
    fillSelect('formProsRating', MASTER.leadsRating);
    fillSelect('formProsPQL', MASTER.yesNo);
    fillSelect('formProsQQL', MASTER.yesNo);

    document.getElementById('pageTitle').textContent = record ? 'Ubah Transaksi Prospek' : 'Transaksi Prospek Baru';
    document.getElementById('pageSubtitle').textContent = record ? record.id : 'Data disalin otomatis dari Leads terpilih';
    document.getElementById('breadcrumbCurrent').textContent = record ? record.id : 'Baru';

    const src = record || sourceLeads;
    const refId = record ? record.leadsRef : sourceLeads.id;
    document.getElementById('lookupRefLabel').textContent = refId;
    document.getElementById('formProsLeadsRef').value = refId;

    document.getElementById('formProsId').value = record ? record.id : '';
    document.getElementById('formProsIdDisplay').value = record ? record.id : 'Akan dibuat otomatis saat disimpan';
    document.getElementById('formProsDate').value = src.leadsDate;
    document.getElementById('formProsDateLong').value = fmtDateLong(src.leadsDate);
    document.getElementById('formProsGeneration').value = src.leadsGeneration;
    document.getElementById('formProsType').value = src.leadsType;
    document.getElementById('formProsSource').value = src.leadsSource;
    document.getElementById('formProsPic').value = src.pic;
    document.getElementById('formProsPicName').value = src.picName;
    document.getElementById('formProsRating').value = src.leadsRating;
    document.getElementById('formProsPQL').value = record ? record.pql : 'Yes';
    document.getElementById('formProsQQL').value = src.qql;
    document.getElementById('formProsAmount').value = record ? record.prospectsAmount : (src.totalAmount || calcItemsTotal(src.items));
    document.getElementById('formProsCustomerName').value = src.customerName;
    document.getElementById('formProsCustomerPIC').value = src.customerPIC || '';
    document.getElementById('formProsTitle').value = src.title || '';

    items = cloneItems(src.items && src.items.length ? src.items : [newItem()]);

    document.getElementById('btnAddItem').addEventListener('click', addItem);
    document.getElementById('formProsDate').addEventListener('change', e => {
      document.getElementById('formProsDateLong').value = e.target.value ? fmtDateLong(e.target.value) : '';
    });
    document.getElementById('formProspects').addEventListener('submit', submitForm);

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
  document.getElementById('formProsTotal').value = fmtCurrency(grand);
}

/* ---------------------------------------------------------------------- */
/* SUBMIT                                                                  */
/* ---------------------------------------------------------------------- */
function submitForm(e) {
  e.preventDefault();
  const custName = document.getElementById('formProsCustomerName').value.trim();

  if (!custName) { toast('Customer Name wajib diisi.', 'error'); return; }
  if (!items.length) { toast('Minimal 1 item produk wajib diisi.', 'error'); return; }
  for (const it of items) {
    if (!it.productGroup || !it.productBrand || !it.productModel) { toast('Product Group / Brand / Model pada setiap item wajib diisi.', 'error'); return; }
    if (Number(it.unitQty) < 1) { toast('Unit Qty setiap item minimal 1.', 'error'); return; }
    if (Number(it.duration) < 1) { toast('Duration setiap item minimal 1.', 'error'); return; }
  }

  const payload = {
    leadsRef: document.getElementById('formProsLeadsRef').value,
    leadsDate: document.getElementById('formProsDate').value,
    leadsGeneration: document.getElementById('formProsGeneration').value,
    leadsType: document.getElementById('formProsType').value,
    leadsSource: document.getElementById('formProsSource').value,
    pic: document.getElementById('formProsPic').value,
    picName: document.getElementById('formProsPicName').value,
    leadsRating: document.getElementById('formProsRating').value,
    pql: document.getElementById('formProsPQL').value,
    qql: document.getElementById('formProsQQL').value,
    items: items,
    totalAmount: calcItemsTotal(items),
    prospectsAmount: Number(document.getElementById('formProsAmount').value),
    customerName: custName,
    customerPIC: document.getElementById('formProsCustomerPIC').value.trim(),
    title: document.getElementById('formProsTitle').value.trim(),
  };

  if (editingDbId) {
    const idx = prospectsData.findIndex(p => p.dbId === editingDbId);
    prospectsData[idx] = { ...prospectsData[idx], ...payload };
    persist();
    sessionStorage.setItem('lpm_flash', 'Transaksi Prospek berhasil diperbarui.');
  } else {
    const newId = generateId('PRS', payload.leadsDate);
    prospectsData.unshift({ id: newId, dbId: uid(), ...payload, createdAt: Date.now() });
    persist();
    sessionStorage.setItem('lpm_flash', `Prospek baru tersimpan dengan Nomor Bukti ${newId}.`);
  }
  window.location.href = 'prospects-list.html';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
