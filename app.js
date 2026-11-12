/* GCN MONITOR: business data is loaded via authenticated backend APIs.
   Browser storage access is confined to the explicit non-destructive legacy export. */
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

let projects = [],
  costs = [],
  invoices = [],
  page = "dashboard",
  search = "";
let currentUser = null;
let managerUsers = [];
let allUsers = [];
let notices = [];
let activeDraftId = null;
let expenseSaving = false;
let localPreviewUrl = null;
const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const activeCosts = () => costs.filter((c) => ["APPROVED", "CANCEL_PENDING"].includes(c.status));
const accessibleInvoices = () => invoices.filter(i => projects.some(p => p.id === i.projectId));
const costSum = (id) => activeCosts().filter((c) => c.projectId === id).reduce((s, c) => s + c.amount, 0);
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
    ...(currentUser?.role === "project_manager" ? [["approvals", "Persetujuan"]] : []),
    ["notifications", "Notifikasi" + (notices.filter(n => !n.readAt).length ? " (" + notices.filter(n => !n.readAt).length + ")" : "")],
    ["invoices", "Invoice & Pembayaran"],
    ["reports", "Laporan"],
    ...(currentUser?.role==="admin" ? [["legacy", "Backup Data Lama"]] : []),
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
  return `<div class="tablewrap"><table><thead><tr><th>Nama Proyek</th><th>Klien</th><th>Status</th><th>Progres</th><th>Deadline</th><th>Nilai Kontrak</th><th>Aksi</th></tr></thead><tbody>${rows.map((p) => `<tr><td><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.code)}</small></td><td>${escapeHTML(p.client)}</td><td><span class="status ${p.status === "Selesai" ? "green" : p.status === "Perencanaan" ? "amber" : ""}">${escapeHTML(p.status)}</span></td><td>${p.progress}%<div class="progress"><i style="width:${p.progress}%"></i></div></td><td>${escapeHTML(p.due)}</td><td>${money(p.contract)}</td><td><div class="actions"><button class="btn mini" data-action="detail" data-id="${p.id}">Detail</button>${withDelete && currentUser?.role === "admin" ? `<button class="btn mini" data-action="delete-project" data-id="${p.id}">Hapus</button>` : ""}</div></td></tr>`).join("")}</tbody></table>${rows.length ? "" : '<div class="empty">Tidak ada data.</div>'}</div>`;
}
function render() {
  nav();
  document.getElementById("crumb").textContent = {
    dashboard: "Dashboard",
    projects: "Manajemen Proyek",
    finance: "Anggaran & Biaya",
    approvals: "Persetujuan Biaya",
    notifications: "Notifikasi",
    invoices: "Invoice & Pembayaran",
    reports: "Laporan",
    legacy: "Backup Data Lama",
    detail: "Detail Proyek",
  }[page];
  let el = document.getElementById("view");
  let head = (title, sub, btn = "") =>
    `<div class="title"><div><h1>${title}</h1><p>${sub}</p></div>${btn}</div>`;
  let addP = currentUser?.role === 'admin' ?
    '<button class="btn primary" data-action="project-modal">+ Tambah Proyek</button>' : '';
  if (page === "dashboard") {
    el.innerHTML =
      head(
        "Dashboard Monitoring",
        "Ringkasan kondisi proyek dan keuangan Anda.",
        addP,
      ) +
      `<div class="kpis">${kpi("Total Proyek", projects.length, projects.filter((p) => p.status === "Berjalan").length + " proyek berjalan")}${kpi("Total Nilai Kontrak", money(total(projects, "contract")), "Akumulasi seluruh proyek")}${kpi("Biaya Aktual", money(total(activeCosts(), "amount")), "Hanya biaya disetujui (data simulasi)")}${kpi("Outstanding Invoice", money(accessibleInvoices().reduce((s, i) => s + due(i), 0)), accessibleInvoices().filter((i) => due(i) > 0).length + " invoice belum lunas")}</div><div class="grid"><section class="panel"><h3>Daftar Proyek</h3><p>Ringkasan proyek demo</p>${table(projects.slice(0, 4), false)}</section><section class="panel"><h3>Status Invoice</h3><p>Tagihan yang perlu dipantau</p>${accessibleInvoices().map((i) => `<p style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee;padding:10px 0"><span><b>${escapeHTML(i.number)}</b><br>${escapeHTML(i.client)}</span><b>${money(due(i))}<br><span class="status ${due(i) === 0 ? "green" : "amber"}">${due(i) === 0 ? "Lunas" : "Belum Lunas"}</span></b></p>`).join("")}</section></div>`;
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
        '<button class="btn" data-action="go-projects">Kembali</button>' + (currentUser?.role === "admin" ? '<button class="btn" data-action="assign-manager-modal" data-id="'+p.id+'">Tugaskan PM</button><button class="btn" data-action="assign-member-modal" data-id="'+p.id+'">Tugaskan Staf</button>' : ""),
      ) +
      `<div class="kpis">${kpi("Progres Proyek", p.progress + "%", p.status)}${kpi("Nilai Kontrak", money(p.contract), "Nilai kontrak demo")}${kpi("Anggaran", money(p.budget), "Sisa: " + money(p.budget - costSum(p.id)))}${kpi("Deadline", p.due, "Target selesai")}</div><section class="panel"><h3>Informasi Proyek</h3><p>Ubah progres untuk simulasi monitoring.</p><div class="row"><div><p>Manajer: <b>${escapeHTML(p.manager)}</b></p><p>Mulai: <b>${p.start}</b></p><p>Biaya aktual: <b>${money(costSum(p.id))}</b></p></div><div class="field">Progres (%) <input type="range" min="0" max="100" value="${p.progress}" data-action="update-progress" data-id="${p.id}"><b>${p.progress}%</b></div></div></section>`;
  } else if (page === "finance") {
    const canCreate = ["admin","finance_staff"].includes(currentUser?.role);
    const expenseAction = (c) => {
      const actions = ['<button class="btn mini" data-action="expense-history" data-id="'+c.id+'">Riwayat</button>'];
      if (c.receipt) actions.push('<button class="btn mini" data-action="view-receipt" data-id="'+c.id+'">Lihat Bukti</button><button class="btn mini" data-action="download-receipt" data-id="'+c.id+'">Unduh</button>');
      if (c.createdBy === currentUser?.id && ["DRAFT","REJECTED"].includes(c.status)) {
        actions.push('<button class="btn mini" data-action="edit-expense" data-id="'+c.id+'">Edit</button>');
        if (c.status === "DRAFT") actions.push('<button class="btn mini" data-action="delete-cost" data-id="'+c.id+'">Hapus Draft</button>');
      }
      if (c.createdBy === currentUser?.id && c.status === "APPROVED") actions.push('<button class="btn mini" data-action="cancel-expense" data-id="'+c.id+'">Ajukan Pembatalan</button>');
      if (c.status === "PENDING_APPROVAL" && currentUser?.role === "project_manager") actions.push('<button class="btn mini" data-action="go-approvals">Review</button>');
      return actions.join(" ") || "—";
    };
    el.innerHTML =
      head("Anggaran & Biaya Aktual", "Biaya dihitung dalam anggaran setelah approval PM/PIC.", canCreate ? '<button class="btn primary" data-action="cost-modal">+ Catat Biaya</button>' : '') +
      '<div class="kpis">'+kpi("Total Anggaran",money(total(projects,"budget")),"Semua proyek yang dapat diakses")+kpi("Biaya Disetujui",money(total(activeCosts(),"amount")),"Termasuk pembatalan tertunda")+kpi("Sisa Anggaran",money(total(projects,"budget")-total(activeCosts(),"amount")),"Anggaran dikurangi biaya disetujui")+kpi("Menunggu Approval",costs.filter(c=>["PENDING_APPROVAL","CANCEL_PENDING"].includes(c.status)).length,"Perlu keputusan PM/PIC")+'</div>'+
      '<section class="panel"><h3>Catatan Pengeluaran</h3><p>Bukti transaksi dan keputusan tersimpan di server.</p><div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Proyek</th><th>Kategori</th><th>Deskripsi</th><th>Jumlah</th><th>Status</th><th>Bukti & Aksi</th></tr></thead><tbody>'+
      costs.map(c=>'<tr><td>'+escapeHTML(c.date)+'</td><td>'+escapeHTML(projects.find(p=>p.id===c.projectId)?.name||"—")+'</td><td>'+escapeHTML(c.category)+'</td><td>'+escapeHTML(c.description)+'</td><td><b>'+money(c.amount)+'</b></td><td><span class="status '+(c.status==="APPROVED"?"green":c.status==="PENDING_APPROVAL"?"amber":"")+'">'+escapeHTML(c.status)+'</span></td><td><div class="actions">'+expenseAction(c)+'</div></td></tr>').join("")+
      '</tbody></table></div></section>';
  } else if (page === "approvals") {
    const pending=costs.filter(c=>["PENDING_APPROVAL","CANCEL_PENDING"].includes(c.status));
    el.innerHTML=head("Approval Inbox","Permintaan biaya untuk proyek yang ditugaskan kepada Anda.")+
      '<section class="panel"><div class="tablewrap"><table><thead><tr><th>Proyek</th><th>Pengeluaran</th><th>Nominal</th><th>Status</th><th>Bukti & Keputusan</th></tr></thead><tbody>'+
      pending.map(c=>'<tr><td>'+escapeHTML(projects.find(p=>p.id===c.projectId)?.name||"—")+'</td><td>'+escapeHTML(c.description)+'</td><td>'+money(c.amount)+'</td><td>'+escapeHTML(c.status)+'</td><td><div class="actions"><button class="btn mini" data-action="view-receipt" data-id="'+c.id+'">Lihat Bukti</button><button class="btn mini" data-action="approve-expense" data-id="'+c.id+'">Approve</button><button class="btn mini" data-action="reject-expense" data-id="'+c.id+'">Reject</button></div></td></tr>').join("")+
      '</tbody></table></div></section>';
  } else if (page === "notifications") {
    el.innerHTML=head("Notifikasi","Riwayat pengajuan dan keputusan.")+
     '<section class="panel">'+(notices.map(n=>'<div class="notification-item"><div><b>'+escapeHTML(n.message)+'</b><small>'+escapeHTML(n.createdAt)+'</small></div><button class="btn mini" data-action="read-notification" data-id="'+n.id+'">'+(n.readAt?'Dibaca':'Tandai Dibaca')+'</button></div>').join("")||'<p>Belum ada notifikasi.</p>')+'</section>';
  } else if (page === "invoices") {
    el.innerHTML =
      head(
        "Invoice & Pembayaran",
        "Invoice dan pembayaran demonstrasi tersimpan pada database server.",
        ["admin","finance_staff"].includes(currentUser?.role) ? '<button class="btn primary" data-action="invoice-modal">+ Buat Invoice</button>' : "",
      ) +
      `<div class="kpis">${kpi("Total Invoice", money(total(accessibleInvoices(), "amount")), accessibleInvoices().length + " invoice")}${kpi("Pembayaran Masuk", money(accessibleInvoices().reduce((s, i) => s + paid(i), 0)), "Akumulasi pembayaran")}${kpi("Outstanding", money(accessibleInvoices().reduce((s, i) => s + due(i), 0)), "Tagihan belum lunas")}</div><section class="panel"><div class="tablewrap"><table><thead><tr><th>No Invoice</th><th>Klien / Proyek</th><th>Jatuh Tempo</th><th>Nilai</th><th>Dibayar</th><th>Outstanding</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${accessibleInvoices().map((i) => `<tr><td><b>${escapeHTML(i.number)}</b>${i.isSample ? '<small>SIMULASI</small>' : ""}</td><td>${escapeHTML(i.client)}<small>${escapeHTML(projects.find((p) => p.id === i.projectId)?.code || "")}</small></td><td>${escapeHTML(i.due)}</td><td>${money(i.amount)}</td><td>${money(paid(i))}</td><td><b>${money(due(i))}</b></td><td><span class="status ${due(i) === 0 ? "green" : "amber"}">${due(i) === 0 ? "Lunas" : "Belum Lunas"}</span></td><td>${due(i) > 0 && ["admin","finance_staff"].includes(currentUser?.role) ? `<button class="btn mini" data-action="payment-modal" data-id="${i.id}">Catat Bayar</button>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
  } else if (page === "legacy") {
    el.innerHTML = head("Backup Data Browser Lama","Ekspor arsip localStorage historis tanpa menghapusnya.")+
      '<section class="panel"><h3>Arsip Data Legacy</h3><p>Proyek, biaya, dan invoice yang pernah tersimpan di browser sebelum server-side migration dapat diunduh untuk peninjauan. Impor tidak dilakukan otomatis agar tidak menduplikasi data dan tidak menandai biaya tanpa bukti sebagai disetujui.</p><button class="btn primary" data-action="export-legacy">Unduh JSON Data Lama</button></section>';
  } else if (page === "reports") {
    el.innerHTML =
      head(
        "Laporan Monitoring",
        "Ringkasan proyek dan ekspor data CSV.",
        '<button class="btn primary" data-action="export-csv">↓ Ekspor CSV</button>',
      ) +
      `<div class="kpis">${kpi("Jumlah Proyek", projects.length, "Seluruh status")}${kpi("Total Anggaran", money(total(projects, "budget")), "Nilai rencana")}${kpi("Biaya Aktual", money(total(activeCosts(), "amount")), "Akumulasi biaya")}${kpi("Outstanding", money(accessibleInvoices().reduce((s, i) => s + due(i), 0)), "Sisa tagihan")}</div><section class="panel"><h3>Ringkasan per Proyek</h3><p>Ekspor CSV untuk mengunduh laporan.</p>${table(projects, false)}</section>`;
  }
}
function modal(title, body, submit, footer) {
  document.getElementById("modal").innerHTML =
    `<div class="modalbg" data-modal-backdrop><form class="modal" data-modal-submit="${submit}"><div class="modalhead"><h2>${title}</h2><button type="button" class="btn" data-action="close-modal">×</button></div>${body}${footer || '<div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" data-action="close-modal">Batal</button><button class="btn primary">Simpan</button></div>'}</form></div>`;
}
function closeModal() {
  if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  localPreviewUrl = null;
  activeDraftId = null;
  document.getElementById("modal").innerHTML = "";
}
async function api(path,method="GET",body) {
 const response=await fetch(path,{method,credentials:"same-origin",headers:body!==undefined?{"Content-Type":"application/json","X-GCN-Request":"1"}:{"X-GCN-Request":"1"},body:body===undefined?undefined:JSON.stringify(body)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error||"Permintaan gagal ("+response.status+").");
 return payload;
}
async function reloadData() {
 const [p,e,n,i]=await Promise.all([api("/api/projects"),api("/api/expenses"),api("/api/notifications"),api("/api/invoices")]);
 projects=p.projects; costs=e.expenses;notices=n.notifications;invoices=i.invoices;render();
}
async function boot() {
 try {
   const profile=await api("/api/auth/me");currentUser=profile.user;
   if(currentUser.role==="admin") {
     const [pm,users]=await Promise.all([api("/api/project-managers"),api("/api/admin/users")]);
     managerUsers=pm.users;allUsers=users.users;
   }
   await reloadData();
 } catch(e) {
   document.getElementById("view").innerHTML='<section class="panel"><h3>Gagal memuat data</h3><p>'+escapeHTML(e.message)+'</p><button class="btn" data-action="reload-app">Coba lagi</button></section>';
 }
}
function projectModal() {
 const managers='<option value="">Belum ditugaskan</option>'+managerUsers.map(u=>'<option value="'+u.id+'">'+escapeHTML(u.fullName)+'</option>').join("");
 modal("Tambah Proyek",'<label class="field">Nama Proyek<input id="pn" required></label><label class="field">Klien<input id="pc" required></label><label class="field">Project Manager<select id="pmuser">'+managers+'</select></label><div class="row"><label class="field">Tanggal Mulai<input id="pstart" type="date" required></label><label class="field">Deadline<input id="pdue" type="date" required></label></div><div class="row"><label class="field">Nilai Kontrak (Rp)<input id="pcontract" type="number" min="0" required></label><label class="field">Anggaran (Rp)<input id="pbudget" type="number" min="0" required></label>',"addProject()");
}
async function addProject() {
 const fields={name:pn.value.trim(),client:pc.value.trim(),managerUserId:document.getElementById("pmuser").value?Number(document.getElementById("pmuser").value):null,start:pstart.value,due:pdue.value,contract:Number(pcontract.value),budget:Number(pbudget.value)};
 if(!fields.name||!fields.client||!fields.start||!fields.due||fields.due<fields.start||!validMoney(fields.contract)||!validMoney(fields.budget)){alert("Lengkapi data proyek yang valid.");return;}
 try{await api("/api/projects","POST",fields);closeModal();await reloadData();flash("Proyek ditambahkan ke server.");}catch(e){alert(e.message);}
}
function detail(id) {window.activeProject=id;go("detail");}
async function updateProgress(id,v) {
 try{await api("/api/projects/"+id+"/progress","PATCH",{progress:Number(v)});await reloadData();flash("Progres diperbarui.");}catch(e){alert(e.message);render();}
}
async function delProject(id) {
 if(invoices.some(i=>i.projectId===id)){alert("Masih ada invoice lokal terkait. Proyek tidak dapat dihapus.");return;}
 if(!confirm("Hapus proyek yang tidak memiliki catatan biaya?"))return;
 try{await api("/api/projects/"+id,"DELETE");await reloadData();flash("Proyek dihapus.");}catch(e){alert(e.message);}
}
function assignManagerModal(id) {
 const p=projects.find(x=>x.id===id);if(!p)return;
 modal("Tugaskan Project Manager",'<p>'+escapeHTML(p.name)+'</p><label class="field">Project Manager<select id="managerSelect">'+managerUsers.map(u=>'<option value="'+u.id+'" '+(p.managerUserId===u.id?'selected':'')+'>'+escapeHTML(u.fullName)+'</option>').join("")+'</select></label>',"assignManager("+id+")");
}
async function assignManager(id) {
 const selectedManager=document.getElementById("managerSelect");
 if(!selectedManager?.value){alert("Buat akun Project Manager terlebih dahulu.");return;}
 try{await api("/api/projects/"+id+"/assign-manager","POST",{userId:Number(selectedManager.value)});closeModal();await reloadData();flash("Project Manager ditugaskan.");}catch(e){alert(e.message);}
}
function assignMemberModal(id) {
 const candidates=allUsers.filter(u=>u.role==="finance_staff"||u.role==="project_staff");
 modal("Tugaskan Anggota Proyek",'<label class="field">Pengguna<select id="memberSelect">'+candidates.map(u=>'<option value="'+u.id+'">'+escapeHTML(u.fullName)+' ('+escapeHTML(u.role)+')</option>').join("")+'</select></label>',"assignMember("+id+")");
}
async function assignMember(id) {
 const selectedMember=document.getElementById("memberSelect");
 if(!selectedMember?.value){alert("Buat akun staf terlebih dahulu.");return;}
 try{await api("/api/projects/"+id+"/assign-member","POST",{userId:Number(selectedMember.value)});closeModal();flash("Anggota proyek ditugaskan.");}catch(e){alert(e.message);}
}
function costModal(existing=null) {
 activeDraftId=existing?.id||null;
 const options=projects.map(p=>'<option value="'+p.id+'" '+(p.id===existing?.projectId?'selected':'')+'>'+escapeHTML(p.code)+' — '+escapeHTML(p.name)+'</option>').join("");
 const c=existing||{};
 const statusNote=existing?.receipt?'<p id="storedReceiptNote">Bukti tersimpan: '+escapeHTML(existing.receipt.filename)+' <button type="button" class="btn mini" data-action="view-receipt" data-id="'+existing.id+'">Lihat</button> <button type="button" class="btn mini" data-action="download-receipt" data-id="'+existing.id+'">Unduh</button> <button type="button" class="btn mini" data-action="delete-receipt" data-id="'+existing.id+'">Hapus Bukti</button></p>':'';
 const footer='<div class="modal-footer"><button type="button" class="btn" data-action="close-modal">Batal</button><button class="btn" type="submit">Simpan Draft</button><button class="btn primary" type="button" data-action="submit-cost-modal">Ajukan Approval</button></div>';
 modal(existing?"Edit Pengeluaran":"Catat Biaya Aktual",'<label class="field">Proyek<select id="cp" '+(existing?'disabled':'')+'>'+options+'</select></label><div class="row"><label class="field">Kategori<select id="ccat">'+["Material","Tenaga kerja","Jasa","Transportasi","Lainnya"].map(x=>'<option '+(c.category===x?'selected':'')+'>'+x+'</option>').join("")+'</select></label><label class="field">Tanggal<input id="cdate" type="date" value="'+escapeHTML(c.date||new Date().toISOString().slice(0,10))+'" required></label></div><label class="field">Deskripsi<input id="cd" value="'+escapeHTML(c.description||"")+'" required></label><label class="field">Jumlah Biaya (Rp)<input id="ca" type="number" min="1" step="1" value="'+(c.amount||"")+'" required></label><label class="field">Bukti Pengeluaran (JPG, PNG, PDF, maks. 5 MB)<input id="receiptFile" data-action="receipt-file" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"></label><div id="receiptInfo" class="receipt-info">Pilih foto nota, kuitansi, invoice, atau bukti transfer.</div>'+statusNote,"addCost()",footer);
}
function selectedReceipt() {return document.getElementById("receiptFile")?.files?.[0]||null;}
function showReceiptSelection() {
 const file=selectedReceipt(),target=document.getElementById("receiptInfo");if(!target)return;
 if(localPreviewUrl)URL.revokeObjectURL(localPreviewUrl);localPreviewUrl=null;
 if(!file){target.textContent="Belum ada file baru dipilih.";return;}
 if(file.size>5*1024*1024){target.textContent="File melebihi 5 MB.";return;}
 localPreviewUrl=URL.createObjectURL(file);
 const preview=file.type.startsWith("image/")?'<img class="receipt-preview" src="'+localPreviewUrl+'" alt="Preview bukti">':file.type==="application/pdf"?'<iframe class="receipt-preview" src="'+localPreviewUrl+'" title="Preview PDF"></iframe>':'';
 target.innerHTML='<p><b>'+escapeHTML(file.name)+'</b> ('+Math.ceil(file.size/1024)+' KB)</p>'+preview+'<button type="button" class="btn mini" data-action="clear-receipt-input">Hapus Pilihan</button>';
}
async function fileBase64(file) {
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("Gagal membaca file."));reader.readAsDataURL(file);});
}
async function addCost(submit=false) {
 if(expenseSaving)return;
 const file=selectedReceipt(),amount=Number(ca.value);
 if(!cd.value.trim()||!cdate.value||!Number.isSafeInteger(amount)||amount<=0){alert("Lengkapi data biaya dengan nominal yang valid.");return;}
 if(file&&(file.size>5*1024*1024||file.size<4||!["image/jpeg","image/png","application/pdf"].includes(file.type))){alert("File harus JPG/PNG/PDF dengan ukuran maksimum 5 MB.");return;}
 let current=costs.find(c=>c.id===activeDraftId);
 if(submit&&!file&&!current?.receipt){alert("Lampirkan bukti pengeluaran sebelum approval.");return;}
 const fields={projectId:Number(cp.value),category:ccat.value,date:cdate.value,description:cd.value.trim(),amount};
 expenseSaving=true;
 document.querySelectorAll("#modal button").forEach(button=>{button.disabled=true;});
 try {
   const response=activeDraftId?await api("/api/expenses/"+activeDraftId,"PATCH",fields):await api("/api/expenses","POST",fields);
   activeDraftId=response.expense.id;
   if(file)await api("/api/expenses/"+activeDraftId+"/receipt","PUT",{filename:file.name,mime:file.type,base64:await fileBase64(file)});
   if(submit)await api("/api/expenses/"+activeDraftId+"/submit","POST",{});
   closeModal();await reloadData();flash(submit?"Biaya diajukan kepada Project Manager.":"Draft biaya tersimpan di server.");
 } catch(e){alert(e.message+"\nJika draft sudah dibuat, buka kembali dari daftar untuk melanjutkan.");await reloadData();}
 finally {expenseSaving=false;document.querySelectorAll("#modal button").forEach(button=>{button.disabled=false;});}
}
async function delCost(id) {
 if(!confirm("Hapus draft pengeluaran?"))return;
 try{await api("/api/expenses/"+id,"DELETE");await reloadData();flash("Draft dihapus.");}catch(e){alert(e.message);}
}
async function cancelExpense(id) {
 const reason=prompt("Alasan permintaan pembatalan biaya:");if(!reason?.trim())return;
 try{await api("/api/expenses/"+id+"/request-cancellation","POST",{reason:reason.trim()});await reloadData();flash("Pembatalan diajukan kepada PM.");}catch(e){alert(e.message);}
}
async function decideExpense(id,decision) {
 const item=costs.find(c=>c.id===id);if(!item)return;
 const approve=decision==="approve";
 const reason=approve?"":prompt("Alasan penolakan wajib diisi:");if(!approve&&!reason?.trim())return;
 if(approve&&!confirm("Setujui transaksi ini setelah memeriksa bukti?"))return;
 const endpoint=item.status==="CANCEL_PENDING"?"cancellation-decision":"decision";
 try{await api("/api/expenses/"+id+"/"+endpoint,"POST",{decision,reason});await reloadData();flash("Keputusan dicatat.");}catch(e){alert(e.message);}
}
async function openReceipt(id,download=false) {
 const win=download?null:window.open("","_blank");
 try{
   const response=await fetch("/api/expenses/"+id+"/receipt",{credentials:"same-origin"});
   if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error||"Gagal membuka bukti.");}
   const blob=await response.blob(),url=URL.createObjectURL(blob);
   if(download){const a=document.createElement("a");a.href=url;a.download="bukti-pengeluaran-"+id+(blob.type==="application/pdf"?".pdf":blob.type==="image/png"?".png":".jpg");a.click();}
   else if(win)win.location.href=url;
   else {const a=document.createElement("a");a.href=url;a.target="_blank";a.click();}
   setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){if(win)win.close();alert(e.message);}
}
async function removeReceipt(id) {
 if(!confirm("Hapus lampiran dari draft ini?"))return;
 try{await api("/api/expenses/"+id+"/receipt","DELETE");document.getElementById("storedReceiptNote")?.remove();await reloadData();flash("Bukti dihapus.");}catch(e){alert(e.message);}
}
async function showExpenseHistory(id) {
 try {
   const response=await api("/api/expenses/"+id+"/history");
   const rows=response.history.map(h=>'<tr><td>'+escapeHTML(h.createdAt)+'</td><td>'+escapeHTML(h.action)+'</td><td>'+escapeHTML(h.fromStatus||"—")+' → '+escapeHTML(h.toStatus)+'</td><td>'+escapeHTML(h.reason||"—")+'</td><td>UID '+escapeHTML(h.actorId)+'</td></tr>').join("");
   modal("Riwayat Persetujuan",'<div class="tablewrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Status</th><th>Alasan</th><th>Pengguna</th></tr></thead><tbody>'+rows+'</tbody></table></div>',"readonly",'<div class="modal-footer"><button class="btn" type="button" data-action="close-modal">Tutup</button></div>');
 }catch(e){alert(e.message);}
}
async function markNotice(id) {
 try{await api("/api/notifications/"+id+"/read","POST",{});await reloadData();}catch(e){alert(e.message);}
}
function invoiceModal() {
  modal(
    "Buat Invoice Demo",
    `<label class="field">Proyek<select id="ip">${projects.map((p) => `<option value="${p.id}">${escapeHTML(p.code)} — ${escapeHTML(p.name)}</option>`).join("")}</select></label><label class="field">Nomor Invoice<input id="inum" placeholder="INV-GCN-004" required></label><div class="row"><label class="field">Nilai Invoice (Rp)<input id="ia" type="number" min="1" required></label><label class="field">Jatuh Tempo<input id="idate" type="date" value="2026-11-30" required></label></div>`,
    "addInvoice()",
  );
}
async function addInvoice() {
  if (!["admin","finance_staff"].includes(currentUser?.role)) { alert("Tidak berwenang."); return; }
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
  try {
    await api("/api/invoices","POST",{projectId:p.id,number,amount,due:idate.value});
    closeModal();await reloadData();flash("Invoice tersimpan di server.");
  } catch(error) { alert(error.message); }
}
function paymentModal(id) {
  let i = invoices.find((i) => i.id === id);
  modal(
    "Catat Pembayaran Masuk",
    `<p>Outstanding saat ini: <b>${money(due(i))}</b></p><label class="field">Jumlah Pembayaran (Rp)<input id="payamount" type="number" min="1" max="${due(i)}" required></label><label class="field">Tanggal<input id="paydate" type="date" value="2026-10-28" required></label><label class="field">Catatan<input id="paynote" placeholder="Keterangan pembayaran"></label>`,
    `addPayment(${id})`,
  );
}
async function addPayment(id) {
  if (!["admin","finance_staff"].includes(currentUser?.role)) { alert("Tidak berwenang."); return; }
  const invoice = invoices.find(i => i.id === id);
  const amount = Number(payamount.value);
  if (!invoice || !Number.isSafeInteger(amount) || amount <= 0 || amount > due(invoice) || !paydate.value) {
    alert("Nilai pembayaran atau tanggal tidak valid."); return;
  }
  try {
    await api("/api/invoices/"+id+"/payments","POST",{amount,date:paydate.value,note:paynote.value});
    closeModal();await reloadData();flash("Pembayaran tersimpan di server.");
  } catch(error) {alert(error.message);}
}
function exportLegacyData() {
  const payload = {
    format: "GCN_MONITOR_LEGACY_EXPORT_v1",
    exportedAt: new Date().toISOString(),
    source: "current-browser-localStorage",
    legacy: {}
  };
  for (const key of ["gcnP","gcnC","gcnI"]) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try { payload.legacy[key] = JSON.parse(value); }
      catch (_) { payload.legacy[key] = value; }
    }
  }
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="gcn-monitor-legacy-browser-backup.json";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash("Backup data browser lama diunduh. Data asli tidak dihapus.");
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
    case "edit-expense": costModal(costs.find(c=>c.id===id)); break;
    case "submit-cost-modal": addCost(true); break;
    case "clear-receipt-input": document.getElementById("receiptFile").value="";showReceiptSelection(); break;
    case "delete-receipt": removeReceipt(id); break;
    case "expense-history": showExpenseHistory(id); break;
    case "view-receipt": openReceipt(id,false); break;
    case "download-receipt": openReceipt(id,true); break;
    case "approve-expense": decideExpense(id,"approve"); break;
    case "reject-expense": decideExpense(id,"reject"); break;
    case "cancel-expense": cancelExpense(id); break;
    case "go-approvals": go("approvals"); break;
    case "reload-app": location.reload(); break;
    case "read-notification": markNotice(id); break;
    case "assign-manager-modal": assignManagerModal(id); break;
    case "assign-member-modal": assignMemberModal(id); break;

    case "delete-cost": delCost(id); break;
    case "invoice-modal": invoiceModal(); break;
    case "payment-modal": paymentModal(id); break;
    case "export-csv": exportCSV(); break;
    case "export-legacy": exportLegacyData(); break;
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
  if (target.matches('[data-action="receipt-file"]')) showReceiptSelection();
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
    ...Object.fromEntries(projects.map(p => ["assignManager("+p.id+")", () => assignManager(p.id)])),
    ...Object.fromEntries(projects.map(p => ["assignMember("+p.id+")", () => assignMember(p.id)])),

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

boot();
