'use strict';
(async () => {
 try {
  const response = await fetch('/api/auth/me', { credentials:'same-origin', cache:'no-store' });
  if (!response.ok) { window.location.replace('/login'); return; }
  const data = await response.json();
  const user = data.user || {};
  const roles = {admin:'Admin Sistem',project_manager:'Manajer Proyek',project_staff:'Staf Proyek',finance_staff:'Staf Keuangan'};
  const label = document.getElementById('sessionUser');
  if (label) label.textContent = `${user.fullName || user.email} · ${roles[user.role] || user.role || ''}`;
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', async () => {
   btn.disabled = true; btn.textContent = 'Keluar…';
   try { await fetch('/api/auth/logout', {method:'POST',credentials:'same-origin'}); } finally { window.location.replace('/login'); }
  });
 } catch (_) { window.location.replace('/login'); }
})();
