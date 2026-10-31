'use strict';
const form = document.getElementById('loginForm');
const email = document.getElementById('email');
const password = document.getElementById('password');
const message = document.getElementById('message');
const submitButton = document.getElementById('submitButton');
const buttonLabel = submitButton.querySelector('.button-label');
function showMessage(text) { message.textContent = text; message.hidden = false; }
document.getElementById('togglePassword').addEventListener('click', () => {
 const visible = password.type === 'password'; password.type = visible ? 'text' : 'password';
 document.getElementById('togglePassword').textContent = visible ? 'Sembunyikan' : 'Lihat';
 document.getElementById('togglePassword').setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
});
form.addEventListener('submit', async event => {
 event.preventDefault(); message.hidden = true;
 const emailValue = email.value.trim();
 if (!emailValue || !email.checkValidity() || !password.value) { showMessage('Masukkan email yang valid dan password Anda.'); (!emailValue || !email.checkValidity() ? email : password).focus(); return; }
 submitButton.disabled = true; buttonLabel.textContent = 'Memverifikasi akun…';
 try {
  const response = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({email:emailValue,password:password.value}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Login gagal. Silakan coba kembali.');
  window.location.replace('/');
 } catch (error) { showMessage(error.message || 'Server tidak dapat dihubungi. Pastikan aplikasi sudah dijalankan.'); }
 finally { submitButton.disabled = false; buttonLabel.textContent = 'Masuk ke workspace'; }
});
