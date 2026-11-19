/**
 * js/08-app.js
 * Inisialisasi aplikasi, PWA install prompt, Service Worker registration, dan boot().
 */

function boot() {
  S = JSON.parse(ls.get('absenku') || 'null');
  if (!S) seed();
  if (!S.classes) { S.classes = [...CL]; S.cts = 0; S.mq = 0; save(); }
  if (!S.users) { S.users = defUsers(); S.uout = []; save(); }
  const a = S.users.find(x => x.u === ls.get('absenku_user') && x.on);
  user = a ? { ...a, id: a.u } : GUEST;
  start();
}

$('#ver').textContent = 'SiAndal v' + VER;
$('#mti').src = document.querySelector('.hero img').src;
$('#mtr').onclick = () => location.reload();
$('#mtl').onclick = () => showLogin();

if (REM) document.querySelector('.demo').style.display = 'none';

let dp = null;
const inst = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (inst) {
  $('#ins').style.display = 'none';
  $('#insn').style.display = 'none';
}

addEventListener('beforeinstallprompt', e => { e.preventDefault(); dp = e; });
addEventListener('appinstalled', () => { $('#ins').style.display = 'none'; toast('SiAndal berhasil terpasang'); });
$('#insn').onclick = () => $('#inb').click();
$('#inb').onclick = async () => {
  if (dp) { dp.prompt(); await dp.userChoice; dp = null; }
  else $('#mod').style.display = 'grid';
};
$('#mc').onclick = () => $('#mod').style.display = 'none';

try {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !IS_GAS_HOST) {
    const had = !!navigator.serviceWorker.controller;
    // updateViaCache: 'none' memaksa browser selalu mengecek sw.js terbaru ke server
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const ub = () => {
        $('#ub').style.display = 'flex';
        $('#ubb').onclick = () => reg.waiting ? reg.waiting.postMessage('SKIP') : location.reload();
      };
      if (reg.waiting && had) ub();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) ub();
        });
      });

      // Cek pembaruan setiap 15 menit & setiap kali user membuka kembali aplikasi di HP
      setInterval(() => reg.update().catch(() => {}), 900000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (had && !window._rl) { window._rl = 1; location.reload(); }
      });
    }).catch(() => {});
  }
} catch (e) {}

boot();
