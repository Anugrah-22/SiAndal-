/**
 * js/03-ui-core.js
 * Komponen UI inti: toast, indikator jaringan, dialog konfirmasi, mode pemeliharaan,
 * autentikasi login/logout, dan router navigasi halaman.
 */

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.style.opacity = 0, 2200);
}

function cnt(el, to, suf = '', dec = 0) {
  const t0 = performance.now();
  (function f(t) {
    const k = Math.min(1, (t - t0) / 1000), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to * e).toFixed(dec) + suf;
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}

function netUI() {
  const n = $('#net'), on = navigator.onLine;
  n.className = 'pill' + (on ? '' : ' off');
  const qLen = S ? (S.outbox.length + (S.datt || []).length + (S.uout || []).length) : 0;
  n.lastChild.textContent =
    (on ? 'Online' : 'Offline') +
    ((REM && SESS) && on ? ' • terhubung GAS' : '') +
    (qLen ? ' • ' + qLen + ' antrean' : ' • tersinkron');
}

const ask = m => new Promise(r => {
  $('#cfm').textContent = m;
  $('#cf').style.display = 'grid';
  $('#cfy').onclick = () => { $('#cf').style.display = 'none'; r(true); };
  $('#cfn').onclick = () => { $('#cf').style.display = 'none'; r(false); };
});

function applyMt() {
  const m = MT();
  const adm = user && user.r === 'admin';
  const lock = m.on && m.mode === 'lock' && !adm;
  const eta = m.eta ? new Date(m.eta).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  $('#mt').style.display = lock ? 'grid' : 'none';
  $('#mtm').textContent = m.msg || 'Sistem sedang dalam pemeliharaan. Silakan coba beberapa saat lagi.';
  $('#mte').textContent = eta ? 'Perkiraan selesai: ' + eta : '';

  const b = $('#mb');
  b.style.display = m.on && !lock ? 'block' : 'none';
  b.textContent = m.on
    ? (m.mode === 'lock' ? '🛠 Mode pemeliharaan aktif: hanya admin yang dapat mengakses. ' : '📢 ') +
      (m.msg || '') +
      (eta ? ' (estimasi selesai ' + eta + ')' : '')
    : '';
}

const showLogin = () => {
  $('#err').textContent = '';
  $('#login').style.display = 'grid';
  $('#u').focus();
};

$('#tl').onclick = showLogin;
$('#lx').onclick = () => $('#login').style.display = 'none';

$('#go').onclick = async () => {
  const u = $('#u').value.trim().toLowerCase(), p0 = $('#p').value;
  let a = S.users.find(x => x.u === u);
  if (REM && navigator.onLine) {
    try {
      $('#err').textContent = 'Memeriksa…';
      const r = await loginR(u, p0);
      if (r.err) { $('#err').textContent = r.err; return; }
      $('#err').textContent = '';
      user = { ...r.rec, id: u };
      ls.set('absenku_user', u);
      if (S) { S.cur = ''; save(); }
      start();
      push();
      return;
    } catch (e) {
      $('#err').textContent = '';
    }
  }
  if (a && a.on && a.h === sha(a.s + p0)) {
    user = { ...a, id: u };
    ls.set('absenku_user', u);
    start();
  } else {
    $('#err').textContent = a && !a.on
      ? 'Akun dinonaktifkan. Hubungi admin.'
      : 'Username atau password salah.';
  }
};

$('#p').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
document.querySelectorAll('.demo button').forEach(b => b.onclick = () => {
  const [u, p] = b.dataset.u.split('|');
  $('#u').value = u;
  $('#p').value = p;
});

$('#out').onclick = () => {
  if (user.r === 'tamu') return showLogin();
  ls.set('absenku_user', '');
  if (S) { S.cur = ''; save(); }
  if (REM) sessSave(null);
  location.reload();
};

$('#th').onclick = () => {
  const r = document.documentElement;
  const d = getComputedStyle(r).getPropertyValue('--bg').trim() === '#0e1320';
  r.dataset.theme = d ? 'light' : 'dark';
  render();
};

function start() {
  $('#login').style.display = 'none';
  $('#app').style.display = 'grid';
  $('#who').textContent = 'SMA-IT Andalan • ' + user.n + ' • ' + ({ admin: 'Admin', kepsek: 'Kepala Sekolah', guru: 'Guru', tamu: 'Tampilan Umum' })[user.r];
  $('#out').textContent = user.r === 'tamu' ? '🔐 Masuk Staf' : '⏻ Keluar';
  $('#tl').style.display = user.r === 'tamu' ? '' : 'none';
  $('#nav').innerHTML = NAV[user.r].map(n => `<button class="nav" data-p="${n[0]}">${n[1]} ${n[2]}</button>`).join('');
  document.querySelectorAll('#nav .nav').forEach(b => b.onclick = () => {
    page = b.dataset.p;
    render();
    if (REM && navigator.onLine) push();
  });
  page = 'dash';
  render();
  netUI();
  if (!window._di) { window._di = 1; initDb(); }
  applyMt();
}

function render() {
  cancelAnimationFrame(raf);
  document.querySelectorAll('#nav .nav').forEach(b => b.classList.toggle('on', b.dataset.p === page));
  $('#ttl').textContent = NAV[user.r].find(n => n[0] === page)[2];
  $('#pg').innerHTML = '';
  ({ dash, absen, siswa, lap, sync, user: users, kelas, mt: maint })[page]();
  netUI();
}
