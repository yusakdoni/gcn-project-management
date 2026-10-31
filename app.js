const seedP = [
  {
    id: 1,
    code: "GCN-026",
    name: "Instalasi Sistem Kontrol Gedung",
    client: "PT Aruna Properti",
    manager: "Dimas Pratama",
    status: "Berjalan",
    progress: 72,
    start: "2026-09-01",
    due: "2026-11-15",
    contract: 850000000,
    budget: 620000000,
  },
  {
    id: 2,
    code: "GCN-025",
    name: "Upgrade Panel Distribusi",
    client: "PT Nusa Energi",
    manager: "Rina Putri",
    status: "Berjalan",
    progress: 48,
    start: "2026-08-15",
    due: "2026-11-05",
    contract: 540000000,
    budget: 390000000,
  },
  {
    id: 3,
    code: "GCN-024",
    name: "Pemeliharaan Kelistrikan Pabrik",
    client: "PT Sinar Industri",
    manager: "Yoga Saputra",
    status: "Perencanaan",
    progress: 15,
    start: "2026-10-01",
    due: "2026-12-20",
    contract: 325000000,
    budget: 240000000,
  },
  {
    id: 4,
    code: "GCN-023",
    name: "Pemasangan CCTV & Access Control",
    client: "PT Prima Logistik",
    manager: "Dimas Pratama",
    status: "Selesai",
    progress: 100,
    start: "2026-06-01",
    due: "2026-09-20",
    contract: 275000000,
    budget: 190000000,
  },
];
const seedC = [
  {
    id: 1,
    projectId: 1,
    category: "Material",
    description: "Kabel dan panel kontrol",
    amount: 185000000,
    date: "2026-10-10",
  },
  {
    id: 2,
    projectId: 1,
    category: "Tenaga kerja",
    description: "Pekerjaan instalasi tahap 1",
    amount: 92000000,
    date: "2026-10-15",
  },
  {
    id: 3,
    projectId: 2,
    category: "Material",
    description: "Komponen panel distribusi",
    amount: 125000000,
    date: "2026-10-12",
  },
  {
    id: 4,
    projectId: 3,
    category: "Jasa",
    description: "Survei awal lokasi",
    amount: 18000000,
    date: "2026-10-20",
  },
];
const seedI = [
  {
    id: 1,
    projectId: 1,
    number: "INV-GCN-001",
    client: "PT Aruna Properti",
    amount: 250000000,
    due: "2026-11-10",
    payments: [
      { amount: 100000000, date: "2026-10-18", note: "Pembayaran termin 1" },
    ],
  },
  {
    id: 2,
    projectId: 2,
    number: "INV-GCN-002",
    client: "PT Nusa Energi",
    amount: 160000000,
    due: "2026-10-25",
    payments: [],
  },
  {
    id: 3,
    projectId: 4,
    number: "INV-GCN-003",
    client: "PT Prima Logistik",
    amount: 80000000,
    due: "2026-09-25",
    payments: [{ amount: 80000000, date: "2026-09-25", note: "Lunas" }],
  },
];
// Demo-only persistence: localStorage is browser-local, not a shared company database.
const load = (k, v) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return v;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : v;
  } catch (error) {
    console.error(`Gagal membaca data ${k} dari localStorage.`, error);
    return v;
  }
};
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch],
  );
const validMoney = (value) =>
  Number.isFinite(Number(value)) && Number(value) >= 0;

let projects = load("gcnP", seedP),
  costs = load("gcnC", seedC),
  invoices = load("gcnI", seedI),
  page = "dashboard",
  search = "";
const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const save = () => {
  try {
    localStorage.setItem("gcnP", JSON.stringify(projects));
    localStorage.setItem("gcnC", JSON.stringify(costs));
    localStorage.setItem("gcnI", JSON.stringify(invoices));
    return true;
  } catch (error) {
    console.error("Gagal menyimpan data demo.", error);
    alert(
      "Data tidak berhasil disimpan di browser. Periksa ruang penyimpanan atau izin browser. Jangan lanjutkan input sebelum data tersimpan.",
    );
    return false;
  }
};
const costSum = (id) =>
  costs.filter((c) => c.projectId === id).reduce((s, c) => s + c.amount, 0);
const paid = (i) => i.payments.reduce((s, p) => s + p.amount, 0);
const due = (i) => Math.max(0, i.amount - paid(i));
const total = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);
function flash(s) {
  document.getElementById("toast").innerHTML =
    '<div class="toast">✓ ' + escapeHTML(s) + "</div>";
  setTimeout(() => (document.getElementById("toast").innerHTML = ""), 2600);
}
function nav() {
  const items = [
    ["dashboard", "Dashboard"],
    ["projects", "Proyek"],
    ["finance", "Anggaran & Biaya"],
    ["invoices", "Invoice & Pembayaran"],
    ["reports", "Laporan"],
  ];

  const navElement = document.getElementById("nav");

  navElement.innerHTML = items
    .map(
      ([id, label]) =>
        `<button type="button" class="${page === id ? "active" : ""}" data-page="${id}">${label}</button>`,
    )
    .join("");

  navElement.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      go(button.dataset.page);
      const sidebar = document.getElementById("appSidebar");
      const toggle = document.getElementById("mobileNavToggle");
      if (sidebar) sidebar.classList.remove("is-open");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Buka menu navigasi");
      }
    });
  });
}
function go(p) {
  page = p;
  render();
}
function kpi(label, value, note) {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
}
function table(rows, withDelete = true) {
  return `<div class="tablewrap"><table><thead><tr><th>Nama Proyek</th><th>Klien</th><th>Status</th><th>Progres</th><th>Deadline</th><th>Nilai Kontrak</th><th>Aksi</th></tr></thead><tbody>${rows.map((p) => `<tr><td><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.code)}</small></td><td>${escapeHTML(p.client)}</td><td><span class="status ${p.status === "Selesai" ? "green" : p.status === "Perencanaan" ? "amber" : ""}">${escapeHTML(p.status)}</span></td><td>${p.progress}%<div class="progress"><i style="width:${p.progress}%"></i></div></td><td>${escapeHTML(p.due)}</td><td>${money(p.contract)}</td><td><div class="actions"><button class="btn mini" data-action="detail" data-id="${p.id}">Detail</button>${withDelete ? `<button class="btn mini" data-action="delete-project" data-id="${p.id}">Hapus</button>` : ""}</div></td></tr>`).join("")}</tbody></table>${rows.length ? "" : '<div class="empty">Tidak ada data.</div>'}</div>`;
}
function render() {
  nav();
  document.getElementById("crumb").textContent = {
    dashboard: "Dashboard",
    projects: "Manajemen Proyek",
    finance: "Anggaran & Biaya",
    invoices: "Invoice & Pembayaran",
    reports: "Laporan",
    detail: "Detail Proyek",
  }[page];
  let el = document.getElementById("view");
  let head = (title, sub, btn = "") =>
    `<div class="title"><div><h1>${title}</h1><p>${sub}</p></div>${btn}</div>`;
  let addP =
    '<button class="btn primary" data-action="project-modal">+ Tambah Proyek</button>';
  if (page === "dashboard") {
    el.innerHTML =
      head(
        "Dashboard Monitoring",
        "Ringkasan kondisi proyek dan keuangan Anda.",
        addP,
      ) +
      `<div class="kpis">${kpi("Total Proyek", projects.length, projects.filter((p) => p.status === "Berjalan").length + " proyek berjalan")}${kpi("Total Nilai Kontrak", money(total(projects, "contract")), "Akumulasi seluruh proyek")}${kpi("Biaya Aktual", money(total(costs, "amount")), "Catatan biaya simulasi")}${kpi("Outstanding Invoice", money(invoices.reduce((s, i) => s + due(i), 0)), invoices.filter((i) => due(i) > 0).length + " invoice belum lunas")}</div><div class="grid"><section class="panel"><h3>Daftar Proyek</h3><p>Ringkasan proyek demo</p>${table(projects.slice(0, 4), false)}</section><section class="panel"><h3>Status Invoice</h3><p>Tagihan yang perlu dipantau</p>${invoices.map((i) => `<p style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee;padding:10px 0"><span><b>${escapeHTML(i.number)}</b><br>${escapeHTML(i.client)}</span><b>${money(due(i))}<br><span class="status ${due(i) === 0 ? "green" : "amber"}">${due(i) === 0 ? "Lunas" : "Belum Lunas"}</span></b></p>`).join("")}</section></div>`;
  } else if (page === "projects") {
    let rows = projects.filter((p) =>
      (p.name + p.client + p.code).toLowerCase().includes(search.toLowerCase()),
    );
    el.innerHTML =
      head("Manajemen Proyek", "Kelola data proyek dan pantau progres.", addP) +
      `<section class="panel"><div class="sectionhead"><input class="search" placeholder="Cari nama, kode, atau klien..." value="${search}" data-action="search-projects"><span>${rows.length} proyek</span></div>${table(rows)}</section>`;
  } else if (page === "detail") {
    let p = projects.find((p) => p.id === window.activeProject);
    if (!p) {
      go("projects");
      return;
    }
    el.innerHTML =
      head(
        p.name,
        escapeHTML(p.code + " · " + p.client),
        '<button class="btn" data-action="go-projects">Kembali</button>',
      ) +
      `<div class="kpis">${kpi("Progres Proyek", p.progress + "%", p.status)}${kpi("Nilai Kontrak", money(p.contract), "Nilai kontrak demo")}${kpi("Anggaran", money(p.budget), "Sisa: " + money(p.budget - costSum(p.id)))}${kpi("Deadline", p.due, "Target selesai")}</div><section class="panel"><h3>Informasi Proyek</h3><p>Ubah progres untuk simulasi monitoring.</p><div class="row"><div><p>Manajer: <b>${escapeHTML(p.manager)}</b></p><p>Mulai: <b>${p.start}</b></p><p>Biaya aktual: <b>${money(costSum(p.id))}</b></p></div><div class="field">Progres (%) <input type="range" min="0" max="100" value="${p.progress}" data-action="update-progress" data-id="${p.id}"><b>${p.progress}%</b></div></div></section>`;
  } else if (page === "finance") {
    el.innerHTML =
      head(
        "Anggaran & Biaya Aktual",
        "Catat biaya proyek dan pantau sisa anggaran.",
        '<button class="btn primary" data-action="cost-modal">+ Catat Biaya</button>',
      ) +
      `<div class="kpis">${kpi("Total Anggaran", money(total(projects, "budget")), "Semua proyek")}${kpi("Biaya Aktual", money(total(costs, "amount")), "Akumulasi catatan biaya")}${kpi("Sisa Anggaran", money(total(projects, "budget") - total(costs, "amount")), "Anggaran dikurangi biaya aktual")}${kpi("Jumlah Catatan", costs.length, "Baris biaya simulasi")}</div><section class="panel"><h3>Catatan Biaya Aktual</h3><p>Nominal dalam Rupiah</p><div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Proyek</th><th>Kategori</th><th>Deskripsi</th><th>Jumlah</th><th>Aksi</th></tr></thead><tbody>${costs.map((c) => `<tr><td>${escapeHTML(c.date)}</td><td>${escapeHTML(projects.find((p) => p.id === c.projectId)?.name || "—")}</td><td>${escapeHTML(c.category)}</td><td>${escapeHTML(c.description)}</td><td><b>${money(c.amount)}</b></td><td><button class="btn mini" data-action="delete-cost" data-id="${c.id}">Hapus</button></td></tr>`).join("")}</tbody></table></div></section>`;
  } else if (page === "invoices") {
    el.innerHTML =
      head(
        "Invoice & Pembayaran",
        "Kelola tagihan dan catat pembayaran masuk.",
        '<button class="btn primary" data-action="invoice-modal">+ Buat Invoice</button>',
      ) +
      `<div class="kpis">${kpi("Total Invoice", money(total(invoices, "amount")), invoices.length + " invoice")}${kpi("Pembayaran Masuk", money(invoices.reduce((s, i) => s + paid(i), 0)), "Akumulasi pembayaran")}${kpi("Outstanding", money(invoices.reduce((s, i) => s + due(i), 0)), "Tagihan belum lunas")}</div><section class="panel"><div class="tablewrap"><table><thead><tr><th>No Invoice</th><th>Klien / Proyek</th><th>Jatuh Tempo</th><th>Nilai</th><th>Dibayar</th><th>Outstanding</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${invoices.map((i) => `<tr><td><b>${escapeHTML(i.number)}</b></td><td>${escapeHTML(i.client)}<small>${escapeHTML(projects.find((p) => p.id === i.projectId)?.code || "")}</small></td><td>${escapeHTML(i.due)}</td><td>${money(i.amount)}</td><td>${money(paid(i))}</td><td><b>${money(due(i))}</b></td><td><span class="status ${due(i) === 0 ? "green" : "amber"}">${due(i) === 0 ? "Lunas" : "Belum Lunas"}</span></td><td>${due(i) > 0 ? `<button class="btn mini" data-action="payment-modal" data-id="${i.id}">Catat Bayar</button>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
  } else if (page === "reports") {
    el.innerHTML =
      head(
        "Laporan Monitoring",
        "Ringkasan proyek dan ekspor data CSV.",
        '<button class="btn primary" data-action="export-csv">↓ Ekspor CSV</button>',
      ) +
      `<div class="kpis">${kpi("Jumlah Proyek", projects.length, "Seluruh status")}${kpi("Total Anggaran", money(total(projects, "budget")), "Nilai rencana")}${kpi("Biaya Aktual", money(total(costs, "amount")), "Akumulasi biaya")}${kpi("Outstanding", money(invoices.reduce((s, i) => s + due(i), 0)), "Sisa tagihan")}</div><section class="panel"><h3>Ringkasan per Proyek</h3><p>Ekspor CSV untuk mengunduh laporan.</p>${table(projects, false)}</section>`;
  }
}
function modal(title, body, submit) {
  document.getElementById("modal").innerHTML =
    `<div class="modalbg" data-modal-backdrop><form class="modal" data-modal-submit="${submit}"><div class="modalhead"><h2>${title}</h2><button type="button" class="btn" data-action="close-modal">×</button></div>${body}<div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" data-action="close-modal">Batal</button><button class="btn primary">Simpan</button></div></form></div>`;
}
function closeModal() {
  document.getElementById("modal").innerHTML = "";
}
function projectModal() {
  modal(
    "Tambah Proyek Demo",
    `<label class="field">Nama Proyek<input id="pn" required></label><label class="field">Klien<input id="pc" required></label><div class="row"><label class="field">Manajer<input id="pm" required></label><label class="field">Status<select id="ps"><option>Perencanaan</option><option>Berjalan</option><option>Selesai</option></select></label></div><div class="row"><label class="field">Tanggal Mulai<input id="pstart" type="date" value="2026-10-28" required></label><label class="field">Deadline<input id="pdue" type="date" value="2026-12-31" required></label></div><div class="row"><label class="field">Nilai Kontrak (Rp)<input id="pcontract" type="number" min="0" required></label><label class="field">Anggaran (Rp)<input id="pbudget" type="number" min="0" required></label></div>`,
    "addProject()",
  );
}
function addProject() {
  const name = pn.value.trim(),
    client = pc.value.trim(),
    manager = pm.value.trim();
  const contract = Number(pcontract.value),
    budget = Number(pbudget.value);
  if (
    !name ||
    !client ||
    !manager ||
    !pstart.value ||
    !pdue.value ||
    pdue.value < pstart.value ||
    !validMoney(contract) ||
    !validMoney(budget)
  ) {
    alert(
      "Periksa kembali nama, klien, manajer, tanggal, nilai kontrak, dan anggaran. Deadline tidak boleh sebelum tanggal mulai.",
    );
    return;
  }
  const maxCode = projects.reduce(
    (max, p) =>
      Math.max(max, Number(String(p.code).match(/(\d+)$/)?.[1] || 0), 0),
    0,
  );
  let p = {
    id: Date.now(),
    code: "GCN-" + String(maxCode + 1).padStart(3, "0"),
    name,
    client,
    manager,
    status: ps.value,
    progress: 0,
    start: pstart.value,
    due: pdue.value,
    contract,
    budget,
  };
  projects.unshift(p);
  if (!save()) {
    projects.shift();
    return;
  }
  closeModal();
  render();
  flash("Proyek ditambahkan.");
}
function detail(id) {
  window.activeProject = id;
  go("detail");
}
function updateProgress(id, v) {
  const previous = projects;
  const progress = Number(v);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    alert("Progres harus berada di antara 0 dan 100.");
    render();
    return;
  }
  projects = projects.map((p) =>
    p.id === id
      ? {
          ...p,
          progress,
          status:
            progress === 100
              ? "Selesai"
              : progress > 0
                ? "Berjalan"
                : "Perencanaan",
        }
      : p,
  );
  if (!save()) {
    projects = previous;
    render();
    return;
  }
  render();
  flash("Progres diperbarui.");
}
function delProject(id) {
  const linkedCosts = costs.some((c) => c.projectId === id);
  const linkedInvoices = invoices.some((i) => i.projectId === id);
  if (linkedCosts || linkedInvoices) {
    alert(
      "Proyek ini masih memiliki catatan biaya atau invoice. Untuk menjaga integritas data, penghapusan diblokir. Selesaikan/arsipkan relasi sesuai kebijakan bisnis terlebih dahulu.",
    );
    return;
  }
  if (confirm("Hapus proyek demo ini? Tindakan ini tidak dapat dibatalkan.")) {
    const previous = projects;
    projects = projects.filter((p) => p.id !== id);
    if (!save()) {
      projects = previous;
      return;
    }
    render();
    flash("Proyek dihapus.");
  }
}
function costModal() {
  modal(
    "Catat Biaya Aktual",
    `<label class="field">Proyek<select id="cp">${projects.map((p) => `<option value="${p.id}">${escapeHTML(p.code)} — ${escapeHTML(p.name)}</option>`).join("")}</select></label><div class="row"><label class="field">Kategori<select id="ccat"><option>Material</option><option>Tenaga kerja</option><option>Jasa</option><option>Transportasi</option><option>Lainnya</option></select></label><label class="field">Tanggal<input id="cdate" type="date" value="2026-10-28" required></label></div><label class="field">Deskripsi<input id="cd" required></label><label class="field">Jumlah Biaya (Rp)<input id="ca" type="number" min="1" required></label>`,
    "addCost()",
  );
}
function addCost() {
  const amount = Number(ca.value),
    description = cd.value.trim();
  if (
    !projects.some((p) => p.id === Number(cp.value)) ||
    !description ||
    !cdate.value ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    alert(
      "Pilih proyek dan isi tanggal, deskripsi, serta biaya lebih besar dari nol.",
    );
    return;
  }
  const record = {
    id: Date.now(),
    projectId: Number(cp.value),
    category: ccat.value,
    description,
    amount,
    date: cdate.value,
  };
  costs.unshift(record);
  if (!save()) {
    costs.shift();
    return;
  }
  closeModal();
  render();
  flash("Biaya aktual dicatat.");
}
function delCost(id) {
  if (confirm("Hapus catatan biaya?")) {
    const previous = costs;
    costs = costs.filter((c) => c.id !== id);
    if (!save()) {
      costs = previous;
      return;
    }
    render();
    flash("Biaya dihapus.");
  }
}
function invoiceModal() {
  modal(
    "Buat Invoice Demo",
    `<label class="field">Proyek<select id="ip">${projects.map((p) => `<option value="${p.id}">${escapeHTML(p.code)} — ${escapeHTML(p.name)}</option>`).join("")}</select></label><label class="field">Nomor Invoice<input id="inum" placeholder="INV-GCN-004" required></label><div class="row"><label class="field">Nilai Invoice (Rp)<input id="ia" type="number" min="1" required></label><label class="field">Jatuh Tempo<input id="idate" type="date" value="2026-11-30" required></label></div>`,
    "addInvoice()",
  );
}
function addInvoice() {
  const p = projects.find((p) => p.id === Number(ip.value));
  const number = inum.value.trim(),
    amount = Number(ia.value);
  if (
    !p ||
    !number ||
    !idate.value ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    alert("Lengkapi proyek, nomor invoice, nilai, dan tanggal jatuh tempo.");
    return;
  }
  if (
    invoices.some(
      (i) => String(i.number).trim().toLowerCase() === number.toLowerCase(),
    )
  ) {
    alert("Nomor invoice sudah digunakan. Gunakan nomor yang unik.");
    return;
  }
  const record = {
    id: Date.now(),
    projectId: p.id,
    number,
    client: p.client,
    amount,
    due: idate.value,
    payments: [],
  };
  invoices.unshift(record);
  if (!save()) {
    invoices.shift();
    return;
  }
  closeModal();
  render();
  flash("Invoice ditambahkan.");
}
function paymentModal(id) {
  let i = invoices.find((i) => i.id === id);
  modal(
    "Catat Pembayaran Masuk",
    `<p>Outstanding saat ini: <b>${money(due(i))}</b></p><label class="field">Jumlah Pembayaran (Rp)<input id="payamount" type="number" min="1" max="${due(i)}" required></label><label class="field">Tanggal<input id="paydate" type="date" value="2026-10-28" required></label><label class="field">Catatan<input id="paynote" placeholder="Keterangan pembayaran"></label>`,
    `addPayment(${id})`,
  );
}
function addPayment(id) {
  let i = invoices.find((i) => i.id === id),
    a = +payamount.value;
  if (!i || !Number.isFinite(a) || a <= 0 || a > due(i)) {
    alert("Pembayaran tidak boleh melebihi outstanding invoice.");
    return;
  }
  invoices = invoices.map((x) =>
    x.id === id
      ? {
          ...x,
          payments: [
            ...x.payments,
            { amount: a, date: paydate.value, note: paynote.value },
          ],
        }
      : x,
  );
  if (!save()) {
    invoices = invoices.map((x) =>
      x.id === id ? { ...x, payments: x.payments.slice(0, -1) } : x,
    );
    return;
  }
  closeModal();
  render();
  flash("Pembayaran dicatat.");
}
function exportCSV() {
  let rows = [
    [
      "Kode",
      "Proyek",
      "Klien",
      "Status",
      "Progres",
      "Nilai Kontrak",
      "Anggaran",
      "Biaya Aktual",
      "Sisa Anggaran",
    ],
    ...projects.map((p) => [
      p.code,
      p.name,
      p.client,
      p.status,
      p.progress,
      p.contract,
      p.budget,
      costSum(p.id),
      p.budget - costSum(p.id),
    ]),
  ];
  // CSV kompatibel dengan Excel Windows pada regional yang memakai koma desimal.
  // Semua field diapit tanda kutip; kutip internal digandakan sesuai standar CSV.
  const delimiter = ";";
  const escapeCSV = (value) => {
    let text = String(value ?? "");
    // Prevent spreadsheet formula execution for untrusted text cells.
    // Numeric values are exported as their original string representation.
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) {
      text = "'" + text;
    }
    return '"' + text.replace(/"/g, '""') + '"';
  };

  // Jaga agar setiap baris mempunyai jumlah kolom yang sama dengan header.
  const columnCount = rows[0].length;
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  const csv = normalizedRows
    .map((row) => row.map(escapeCSV).join(delimiter))
    .join("\r\n");

  // BOM UTF-8 membantu Excel mengenali encoding; nilai angka tidak diformat ulang.
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8;header=present",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "laporan-monitoring-gcn-demo.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Tunda revoke agar browser sempat memulai download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flash("CSV diunduh.");
}
// Delegated handlers keep interactive controls compatible with the app's CSP.
document.addEventListener("click", (event) => {
  const backdrop = event.target.closest("[data-modal-backdrop]");
  if (backdrop && event.target === backdrop) {
    closeModal();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  switch (button.dataset.action) {
    case "detail": detail(id); break;
    case "delete-project": delProject(id); break;
    case "project-modal": projectModal(); break;
    case "go-projects": go("projects"); break;
    case "cost-modal": costModal(); break;
    case "delete-cost": delCost(id); break;
    case "invoice-modal": invoiceModal(); break;
    case "payment-modal": paymentModal(id); break;
    case "export-csv": exportCSV(); break;
    case "close-modal": closeModal(); break;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.matches('[data-action="search-projects"]')) {
    search = event.target.value;
    const start = event.target.selectionStart;
    render();
    const replacement = document.querySelector('[data-action="search-projects"]');
    if (replacement) {
      replacement.focus();
      replacement.setSelectionRange(start, start);
    }
  }
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches('[data-action="update-progress"]')) {
    updateProgress(Number(target.dataset.id), target.value);
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-modal-submit]");
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.modalSubmit;
  const actions = {
    "addProject()": addProject,
    "addCost()": addCost,
    "addInvoice()": addInvoice,
    "addPayment(1)": () => addPayment(1),
  };
  const paymentMatch = action.match(/^addPayment\((\d+)\)$/);
  if (paymentMatch) {
    addPayment(Number(paymentMatch[1]));
    return;
  }
  if (actions[action]) actions[action]();
});

const mobileNavToggle = document.getElementById("mobileNavToggle");
if (mobileNavToggle) {
  mobileNavToggle.addEventListener("click", () => {
    const sidebar = document.getElementById("appSidebar");
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle("is-open");
    mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
    mobileNavToggle.setAttribute(
      "aria-label",
      isOpen ? "Tutup menu navigasi" : "Buka menu navigasi",
    );
  });
}

render();
