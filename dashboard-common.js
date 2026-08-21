/* ==========================================================================
   dashboard-common.js — Logic bersama untuk Dashboard SSM Tier 1 & Tier 2
   Kedua halaman (dashboard-tier1.html, dashboard-tier2.html) memiliki
   markup & chart yang identik — hanya berbeda label tier & cakupan data
   default. Semua data dihitung LIVE dari leadsData (common.js).

   Definisi turunan (karena beberapa istilah pada referensi dashboard
   belum punya kolom eksplisit di data model Leads & Prospek):
   - Leads Amount      = total Leads Amount seluruh Leads pada filter aktif
   - Prospects Amount  = total Leads Amount, Leads dengan PQL = Yes
   - Quotation Amount  = total Leads Amount, Leads dengan QQL = Yes
   - LQ (Live Quotation)= Total Amount (Estimated Price x Qty x Duration)
   - Probabilitas LQ   : QQL=Yes -> 100%; PQL=No -> 0%;
                         PQL=Yes & Rating Hot/Warm/Cold -> 75% / 50% / 25%
   ========================================================================== */

const MODEL_GROUP_MAP = {};
const chartRegistry = {};

const GEN_SOURCE_BUCKETS = ['Call Plan', 'Customer Call', 'Kosong', 'Lainnya'];
const GEN_SOURCE_COLORS = ['#2F6FB0', '#E8792F', '#B16FE0', '#C7CCD6'];
const GROUP_COLORS = ['#2F6FB0', '#E8792F', '#7C3AED', '#3E9C6D', '#2AA9A4', '#C2478A', '#8D94A0'];

function buildModelGroupMap() {
  leadsData.forEach(r => (r.items || []).forEach(it => { MODEL_GROUP_MAP[it.productModel] = it.productGroup; }));
}

function sumBy(arr, fn) {
  return arr.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
}

function sourceBucket(src) {
  if (src === 'Call Plan') return 'Call Plan';
  if (src === 'Customer Call') return 'Customer Call';
  if (!src) return 'Kosong';
  return 'Lainnya';
}

function lqBand(r) {
  if (r.qql === 'Yes') return '100%';
  if (r.pql === 'No') return '0%';
  if (r.leadsRating === 'Hot') return '75%';
  if (r.leadsRating === 'Warm') return '50%';
  return '25%';
}

/* ---------------------------------------------------------------------- */
/* FILTER STATE                                                            */
/* ---------------------------------------------------------------------- */
function setupFilters() {
  const selSales = document.getElementById('dashFilterSales');
  const selCustomer = document.getElementById('dashFilterCustomer');
  const dateFrom = document.getElementById('dashDateFrom');
  const dateTo = document.getElementById('dashDateTo');
  const resetBtn = document.getElementById('dashResetFilter');

  if (selSales) selSales.innerHTML = opts(MASTER.picName, true, 'Semua Sales');
  if (selCustomer) {
    const customerNames = [...new Set(leadsData.map(l => l.customerName))].filter(Boolean).sort();
    selCustomer.innerHTML = `<option value="">Semua Customer</option>` +
      customerNames.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  [dateFrom, dateTo, selSales, selCustomer].filter(Boolean).forEach(el => el.addEventListener('change', renderAll));
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (dateFrom) dateFrom.value = '';
      if (dateTo) dateTo.value = '';
      if (selSales) selSales.value = '';
      if (selCustomer) selCustomer.value = '';
      renderAll();
    });
  }
}

function getFilters() {
  const dateFrom = document.getElementById('dashDateFrom');
  const dateTo = document.getElementById('dashDateTo');
  const selSales = document.getElementById('dashFilterSales');
  const selCustomer = document.getElementById('dashFilterCustomer');
  return {
    dateFrom: dateFrom ? dateFrom.value : '',
    dateTo: dateTo ? dateTo.value : '',
    picName: selSales ? selSales.value : '',
    customerName: selCustomer ? selCustomer.value : '',
  };
}

function getFilteredLeads(f) {
  return leadsData.filter(l => {
    if (f.dateFrom && l.leadsDate < f.dateFrom) return false;
    if (f.dateTo && l.leadsDate > f.dateTo) return false;
    if (f.picName && l.picName !== f.picName) return false;
    if (f.customerName && l.customerName !== f.customerName) return false;
    return true;
  });
}

/* ---------------------------------------------------------------------- */
/* DATA COMPUTATION                                                         */
/* ---------------------------------------------------------------------- */
function computeFunnel(rows) {
  return {
    leadsAmount: sumBy(rows, r => r.leadsAmount),
    prospectsAmount: sumBy(rows.filter(r => r.pql === 'Yes'), r => r.leadsAmount),
    quotationAmount: sumBy(rows.filter(r => r.qql === 'Yes'), r => r.leadsAmount),
  };
}

function computeGenerationSourceData(rows) {
  const gens = ['Online', 'Offline'];
  const data = {};
  gens.forEach(g => {
    const subset = rows.filter(r => r.leadsGeneration === g);
    const total = sumBy(subset, r => r.leadsAmount);
    const rowData = {};
    GEN_SOURCE_BUCKETS.forEach(b => {
      const val = sumBy(subset.filter(r => sourceBucket(r.leadsSource) === b), r => r.leadsAmount);
      rowData[b] = total > 0 ? (val / total * 100) : 0;
    });
    data[g] = rowData;
  });
  return data;
}

function computeProductGroupTable(rows) {
  const groups = {};
  rows.forEach(r => {
    const key = `${r.leadsGeneration}|${r.leadsType}|${r.leadsSource}`;
    if (!groups[key]) groups[key] = { gen: r.leadsGeneration, type: r.leadsType, src: r.leadsSource, values: {}, total: 0 };
    /* Leads Amount adalah nilai level-transaksi (bukan hasil penjumlahan
       item), jadi saat satu transaksi memiliki >1 item produk, nilainya
       dibagi secara proporsional ke tiap item berdasarkan kontribusi
       Total Amount item tersebut — lihat distributeAmountByItems (common.js). */
    distributeAmountByItems(r, Number(r.leadsAmount) || 0).forEach(({ item, amount }) => {
      groups[key].values[item.productGroup] = (groups[key].values[item.productGroup] || 0) + amount;
      groups[key].total += amount;
    });
  });
  /* Urutkan berdasarkan Leads Generation lalu Leads Type supaya baris dengan
     nilai sama pada kedua kolom tersebut berurutan (contiguous) — dibutuhkan
     agar sel dapat digabung (rowspan) pada tampilan tabel. */
  const list = Object.values(groups).sort((a, b) => {
    if (a.gen !== b.gen) return a.gen.localeCompare(b.gen);
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return b.total - a.total;
  });
  const colTotals = {};
  MASTER.productGroup.forEach(pg => colTotals[pg] = 0);
  let grandTotal = 0;
  list.forEach(g => {
    MASTER.productGroup.forEach(pg => { colTotals[pg] += g.values[pg] || 0; });
    grandTotal += g.total;
  });
  return { list, colTotals, grandTotal };
}

function computeProductGroupDonut(rows) {
  const totals = {};
  MASTER.productGroup.forEach(pg => totals[pg] = 0);
  rows.forEach(r => {
    distributeAmountByItems(r, Number(r.leadsAmount) || 0).forEach(({ item, amount }) => {
      totals[item.productGroup] = (totals[item.productGroup] || 0) + amount;
    });
  });
  return totals;
}

function computeCustomerModelPivot(rows) {
  /* Total Amount = penjumlahan Total Amount seluruh item, sehingga
     kontribusi tiap item terhadap Total Amount transaksi bersifat EXACT
     (bukan estimasi) — tidak perlu distribusi proporsional seperti pada
     Leads Amount. */
  const qualRows = rows.filter(r => r.qql === 'Yes');
  const customers = {};
  const modelTotals = {};
  qualRows.forEach(r => {
    if (!customers[r.customerName]) customers[r.customerName] = {};
    (r.items || []).forEach(it => {
      const v = calcItemTotal(it);
      customers[r.customerName][it.productModel] = (customers[r.customerName][it.productModel] || 0) + v;
      modelTotals[it.productModel] = (modelTotals[it.productModel] || 0) + v;
    });
  });
  const topModels = Object.entries(modelTotals).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  return { customers, topModels, modelTotals };
}

function computeLQSegregation(rows) {
  const order = ['0%', '25%', '50%', '75%', '100%'];
  const values = order.map(band => sumBy(rows.filter(r => lqBand(r) === band), r => r.totalAmount));
  const total = sumBy(rows, r => r.totalAmount);
  return { labels: order.concat('Total'), values: values.concat(total) };
}

function computeTreemap(rows) {
  const groups = {};
  rows.forEach(r => {
    (r.items || []).forEach(it => {
      const v = calcItemTotal(it);
      if (!groups[it.productGroup]) groups[it.productGroup] = { total: 0, models: {} };
      groups[it.productGroup].total += v;
      groups[it.productGroup].models[it.productModel] = (groups[it.productGroup].models[it.productModel] || 0) + v;
    });
  });
  const grand = sumBy(rows, r => r.totalAmount);
  return { groups, grand };
}

/* ---------------------------------------------------------------------- */
/* RENDER: SALES FUNNEL                                                     */
/* ---------------------------------------------------------------------- */
function renderFunnel(container, data) {
  if (!container) return;
  container.innerHTML = `
    <div class="funnel">
      <div class="funnel__stage" data-stage="1">
        <span class="funnel__stage-label">Leads Amount (IDR)</span>
        <span class="funnel__stage-value">${fmtCurrency(data.leadsAmount)}</span>
      </div>
      <div class="funnel__stage" data-stage="2">
        <span class="funnel__stage-label">Prospects Amount (IDR)</span>
        <span class="funnel__stage-value">${fmtCurrency(data.prospectsAmount)}</span>
      </div>
      <div class="funnel__stage" data-stage="3">
        <span class="funnel__stage-label">Quotation Amount (IDR)</span>
        <span class="funnel__stage-value">${fmtCurrency(data.quotationAmount)}</span>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------- */
/* RENDER: LEADS BY GENERATION TYPE & SOURCE (stacked horizontal bar)       */
/* ---------------------------------------------------------------------- */
/* Plugin ringan (tanpa CDN tambahan) utk menampilkan label persentase
   langsung di atas tiap segmen bar — meniru gaya "by Persentase" yang
   dipakai pada donut Leads by Product Group & treemap LQ. */
const genSourceValueLabelPlugin = {
  id: 'genSourceValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (meta.hidden) return;
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (!value || value < 6) return;
        const props = bar.getProps(['x', 'y', 'base'], true);
        const width = Math.abs(props.x - props.base);
        if (width < 22) return;
        const cx = (props.x + props.base) / 2;
        const cy = props.y;
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = "600 10.5px 'Inter', Arial, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(value)}%`, cx, cy);
        ctx.restore();
      });
    });
  },
};

function renderGenSourceChart(canvas, data) {
  if (!canvas || typeof Chart === 'undefined') return;
  if (chartRegistry.genSource) chartRegistry.genSource.destroy();
  chartRegistry.genSource = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Online', 'Offline'],
      datasets: GEN_SOURCE_BUCKETS.map((b, i) => ({
        label: b,
        data: [data.Online[b], data.Offline[b]],
        backgroundColor: GEN_SOURCE_COLORS[i],
        stack: 'src',
      })),
    },
    plugins: [genSourceValueLabelPlugin],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)}%` } },
      },
      scales: {
        x: { stacked: true, min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#E3E5E9' } },
        y: { stacked: true, grid: { display: false } },
      },
    },
  });
}

/* ---------------------------------------------------------------------- */
/* RENDER: PRODUCT GROUP / LEADS AMOUNT TABLE                               */
/* ---------------------------------------------------------------------- */
function renderProductGroupTable(container, tableData) {
  if (!container) return;
  const { list, colTotals, grandTotal } = tableData;
  /* Sembunyikan kolom Product Group yang nilainya kosong (0) pada filter aktif */
  const pgList = MASTER.productGroup.filter(pg => (colTotals[pg] || 0) > 0);
  const theadCols = pgList.map(pg => `<th>${escapeHtml(pg)}</th>`).join('');

  /* Hitung rowspan utk kolom Leads Generation & Leads Type — baris list sudah
     terurut per gen lalu type (lihat computeProductGroupTable), sehingga
     baris dgn nilai sama pada kedua kolom tsb akan berurutan (contiguous)
     dan bisa digabung menjadi satu sel. */
  const spans = list.map((g, i) => {
    const prev = list[i - 1];
    const isNewGen = !prev || prev.gen !== g.gen;
    const isNewType = isNewGen || prev.type !== g.type;
    let genSpan = 0, typeSpan = 0;
    if (isNewGen) {
      genSpan = 1;
      for (let j = i + 1; j < list.length && list[j].gen === g.gen; j++) genSpan++;
    }
    if (isNewType) {
      typeSpan = 1;
      for (let j = i + 1; j < list.length && list[j].gen === g.gen && list[j].type === g.type; j++) typeSpan++;
    }
    return { isNewGen, isNewType, genSpan, typeSpan };
  });

  const bodyRows = list.map((g, i) => {
    const sp = spans[i];
    const genCell = sp.isNewGen ? `<td class="rowhead" rowspan="${sp.genSpan}">${escapeHtml(g.gen)}</td>` : '';
    const typeCell = sp.isNewType ? `<td class="rowhead" rowspan="${sp.typeSpan}">${escapeHtml(g.type)}</td>` : '';
    const cells = pgList.map(pg => {
      const v = g.values[pg] || 0;
      return v > 0 ? `<td class="val">${fmtCurrency(v)}</td>` : `<td class="val zero">-</td>`;
    }).join('');
    return `<tr>${genCell}${typeCell}<td class="rowhead">${escapeHtml(g.src)}</td>${cells}<td class="val cell-hl">${fmtCurrency(g.total)}</td></tr>`;
  }).join('');
  const totalCells = pgList.map(pg => `<td class="val">${fmtCurrency(colTotals[pg])}</td>`).join('');
  const colspanEmpty = 3 + pgList.length + 1;

  container.innerHTML = `
    <div class="dash-pivot-head">Product Group / Leads Amount (IDR)</div>
    <div class="dash-pivot-scroll">
      <table class="dash-pivot">
        <thead><tr><th>Leads Generation</th><th>Leads Type</th><th>Leads Source</th>${theadCols}<th>Total</th></tr></thead>
        <tbody>
          ${bodyRows || `<tr><td colspan="${colspanEmpty}" style="text-align:center;color:var(--text-muted);padding:24px;">Tidak ada data pada filter ini.</td></tr>`}
          <tr class="total-row"><td colspan="3">Total Keseluruhan</td>${totalCells}<td class="val">${fmtCurrency(grandTotal)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

/* ---------------------------------------------------------------------- */
/* RENDER: LEADS BY PRODUCT GROUP (%) — DONUT                              */
/* ---------------------------------------------------------------------- */
function renderProductGroupDonut(canvas, centerEl, totals) {
  if (!canvas || typeof Chart === 'undefined') return;
  const entries = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const grand = entries.reduce((s, [, v]) => s + v, 0);

  /* Perbarui label persentase di tengah donut sesuai segmen yang sedang
     disorot/diklik (hover atau klik pada slice ATAU legend). Tanpa index
     (default) menampilkan segmen terbesar, seperti semula. */
  const setCenter = (index) => {
    if (!centerEl) return;
    if (!entries.length) { centerEl.textContent = '0%'; return; }
    const i = (index === undefined || index === null || !entries[index]) ? 0 : index;
    centerEl.textContent = `${(entries[i][1] / grand * 100).toFixed(1)}%`;
  };

  if (chartRegistry.pgDonut) chartRegistry.pgDonut.destroy();
  chartRegistry.pgDonut = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: GROUP_COLORS.slice(0, entries.length), borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      cutout: '68%',
      responsive: true,
      maintainAspectRatio: false,
      onHover: (evt, elements) => setCenter(elements && elements.length ? elements[0].index : null),
      onClick: (evt, elements) => { if (elements && elements.length) setCenter(elements[0].index); },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, font: { size: 10.5 } },
          onHover: (evt, legendItem) => setCenter(legendItem.index),
          onLeave: () => setCenter(null),
          onClick: (evt, legendItem, legend) => {
            Chart.defaults.plugins.legend.onClick.call(legend, evt, legendItem, legend);
            setCenter(legendItem.index);
          },
        },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtCurrency(ctx.parsed)} (${(ctx.parsed / grand * 100).toFixed(1)}%)` } },
      },
    },
  });

  setCenter(null);
}

/* ---------------------------------------------------------------------- */
/* RENDER: PRODUCT GROUP / PRODUCT MODEL / QUOTATION AMOUNT (customer pivot)*/
/* ---------------------------------------------------------------------- */
function renderCustomerModelPivot(container, pivotData) {
  if (!container) return;
  const { customers, topModels } = pivotData;
  const limitedModels = topModels.slice(0, 6);

  const groupSpans = [];
  limitedModels.forEach(m => {
    const g = MODEL_GROUP_MAP[m] || 'Lainnya';
    if (groupSpans.length && groupSpans[groupSpans.length - 1].group === g) groupSpans[groupSpans.length - 1].count++;
    else groupSpans.push({ group: g, count: 1 });
  });
  const groupHeaderHtml = groupSpans.map(gs => `<th class="group-head" colspan="${gs.count}">${escapeHtml(gs.group)}</th>`).join('');
  const modelHeaderHtml = limitedModels.map(m => `<th>${escapeHtml(m)}</th>`).join('');

  const custEntries = Object.entries(customers).map(([name, vals]) => {
    const total = Object.values(vals).reduce((s, v) => s + v, 0);
    return { name, vals, total };
  }).sort((a, b) => b.total - a.total);
  const topCustomers = custEntries.slice(0, 8);
  const restTotal = custEntries.slice(8).reduce((s, c) => s + c.total, 0);

  const colTotals = {};
  limitedModels.forEach(m => colTotals[m] = 0);
  let grandTotal = 0;
  const rowsHtml = topCustomers.map((c, i) => {
    const cells = limitedModels.map(m => {
      const v = c.vals[m] || 0;
      colTotals[m] += v;
      return v > 0 ? `<td class="val">${fmtCurrency(v)}</td>` : `<td class="val zero">-</td>`;
    }).join('');
    grandTotal += c.total;
    return `<tr class="${i === 1 ? 'highlight' : ''}"><td class="rowhead">${escapeHtml(c.name)}</td>${cells}<td class="val cell-hl">${fmtCurrency(c.total)}</td></tr>`;
  }).join('');
  grandTotal += restTotal;

  const lainnyaRow = restTotal > 0
    ? `<tr><td class="rowhead">Customer Lainnya</td>${limitedModels.map(() => `<td class="val zero">…</td>`).join('')}<td class="val cell-hl">${fmtCurrency(restTotal)}</td></tr>`
    : '';
  const totalRow = `<tr class="total-row"><td>Total Keseluruhan</td>${limitedModels.map(m => `<td class="val">${fmtCurrency(colTotals[m])}</td>`).join('')}<td class="val">${fmtCurrency(grandTotal)}</td></tr>`;
  const colspanEmpty = limitedModels.length + 2;

  container.innerHTML = `
    <div class="dash-pivot-head">Product Group / Product Model / Quotation Amount (IDR)</div>
    <div class="dash-pivot-scroll">
      <table class="dash-pivot">
        <thead>
          <tr><th rowspan="2">Customer Name</th>${groupHeaderHtml || '<th></th>'}<th rowspan="2">Total Keseluruhan</th></tr>
          <tr>${modelHeaderHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="${colspanEmpty}" style="text-align:center;color:var(--text-muted);padding:24px;">Belum ada Leads dengan QQL = Yes pada filter ini.</td></tr>`}
          ${lainnyaRow}
          ${topCustomers.length ? totalRow : ''}
        </tbody>
      </table>
    </div>`;
}

/* ---------------------------------------------------------------------- */
/* RENDER: LQ SEGREGATION BY PROBABILITY (%)                                */
/* ---------------------------------------------------------------------- */
function renderLQChart(canvas, lqData) {
  if (!canvas || typeof Chart === 'undefined') return;
  if (chartRegistry.lq) chartRegistry.lq.destroy();
  const lastIdx = lqData.labels.length - 1;
  const barColors = lqData.labels.map((l, i) => i === lastIdx ? '#3B1361' : 'rgba(91,33,182,0.12)');
  const borderColors = lqData.labels.map(() => '#5B21B6');
  chartRegistry.lq = new Chart(canvas.getContext('2d'), {
    data: {
      labels: lqData.labels,
      datasets: [
        { type: 'line', label: 'Tren', data: lqData.values, borderColor: '#5B21B6', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, tension: 0 },
        { type: 'bar', label: 'LQ (IDR)', data: lqData.values, backgroundColor: barColors, borderColor: borderColors, borderWidth: 2, borderRadius: 4, maxBarThickness: 46 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.parsed.y) } },
      },
      scales: {
        y: { ticks: { callback: v => fmtCurrency(v) }, grid: { color: '#E3E5E9' } },
        x: { title: { display: true, text: 'LQ Probability (%)', font: { size: 10.5 } }, grid: { display: false } },
      },
    },
  });
}

/* ---------------------------------------------------------------------- */
/* RENDER: TREEMAP — LQ BY PRODUCT GROUP & PRODUCT MODEL                    */
/* ---------------------------------------------------------------------- */
function renderTreemap(container, legendContainer, treemapData) {
  if (!container) return;
  const { groups, grand } = treemapData;
  const sortedGroups = Object.entries(groups).filter(([, g]) => g.total > 0).sort((a, b) => b[1].total - a[1].total);

  if (sortedGroups.length === 0) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Tidak ada data pada filter ini.</div>`;
    if (legendContainer) legendContainer.innerHTML = '';
    return;
  }

  if (legendContainer) {
    legendContainer.innerHTML = sortedGroups.map(([name], i) =>
      `<span class="dash-legend__item"><span class="dash-legend__swatch" style="background:${GROUP_COLORS[i % GROUP_COLORS.length]}"></span>${escapeHtml(name)}</span>`
    ).join('');
  }

  container.innerHTML = sortedGroups.map(([name, g], i) => {
    const pct = grand > 0 ? (g.total / grand * 100) : 0;
    const color = GROUP_COLORS[i % GROUP_COLORS.length];
    const models = Object.entries(g.models).sort((a, b) => b[1] - a[1]);
    const groupTitle = `${name}: ${fmtCurrency(g.total)} (${pct.toFixed(1)}% dari total LQ)`;
    const tilesHtml = models.map(([m, v], j) => {
      const mpct = grand > 0 ? (v / grand * 100) : 0;
      const opacity = Math.max(1 - j * 0.11, 0.42);
      const tileTitle = `${name} → ${m}: ${fmtCurrency(v)} (${mpct.toFixed(2)}% dari total LQ)`;
      return `<div class="treemap__tile" style="flex-grow:${Math.max(v, 1)};background:${color};opacity:${opacity};" title="${escapeHtml(tileTitle)}">${escapeHtml(m)} : ${mpct.toFixed(2)}%</div>`;
    }).join('');
    return `<div class="treemap__group" style="flex-grow:${Math.max(g.total, 1)};" title="${escapeHtml(groupTitle)}">
      <div class="treemap__group-header" style="background:${color};">${escapeHtml(name)} : ${pct.toFixed(1)}%</div>
      <div class="treemap__tiles">${tilesHtml}</div>
    </div>`;
  }).join('');
}

/* ---------------------------------------------------------------------- */
/* MAIN RENDER LOOP                                                         */
/* ---------------------------------------------------------------------- */
function renderAll() {
  const filters = getFilters();
  const rows = getFilteredLeads(filters);

  /* --- Dashboard SSM Tier 1: Sales Funnel ---
     Fungsi render di bawah memeriksa keberadaan elemen (container/canvas)
     sebelum menggambar, sehingga aman dipanggil meski halaman saat ini
     tidak memiliki elemen tersebut (mis. halaman Tier 2 tidak punya #dashFunnel). */
  renderFunnel(document.getElementById('dashFunnel'), computeFunnel(rows));
  renderGenSourceChart(document.getElementById('chartGenSource'), computeGenerationSourceData(rows));
  renderProductGroupTable(document.getElementById('tableProductGroup'), computeProductGroupTable(rows));
  renderProductGroupDonut(document.getElementById('chartProductGroupDonut'), document.getElementById('donutCenterLabel'), computeProductGroupDonut(rows));

  /* --- Dashboard SSM Tier 2: Analisa Produk & Customer --- */
  renderCustomerModelPivot(document.getElementById('tableCustomerModel'), computeCustomerModelPivot(rows));
  renderLQChart(document.getElementById('chartLQ'), computeLQSegregation(rows));
  renderTreemap(document.getElementById('treemapContainer'), document.getElementById('treemapLegend'), computeTreemap(rows));
}

/* ---------------------------------------------------------------------- */
/* ENTRY POINT                                                              */
/* ---------------------------------------------------------------------- */
function initDashboard(tier) {
  try {
    initSidebar('dashboard-' + tier);
    buildModelGroupMap();
    setupFilters();
    renderAll();
  } catch (err) {
    console.error('Gagal memuat dashboard:', err);
    alert('Terjadi kesalahan saat memuat dashboard. Buka Console (F12) untuk detail.');
  }
}
