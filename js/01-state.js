/**
 * js/01-state.js
 * Konstanta aplikasi, utilitas DOM, hashing SHA-256, penyimpanan lokal, dan state global.
 */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CL = ['X-A', 'X-B', 'XI-A', 'XI-B', 'XII-A', 'XII-B'];
const COL = ['#4f46e5', '#0ea5e9', '#16a34a', '#f59e0b', '#ec4899', '#8b5cf6'];
const ST = {
  H: ['Hadir', 'var(--g)'],
  S: ['Sakit', 'var(--b)'],
  I: ['Izin', 'var(--y)'],
  A: ['Alpa', 'var(--r)']
};

const VER = '1.7.4-gas';
const CHANGELOG = [
  ['1.7.4-gas', '19 Nov 2026', 'Sinkronisasi penuh metadata penginput absensi (60 hari terakhir selalu diperbarui tanpa tertahan kursor lokal) serta pembersihan kursor saat login/logout.'],
  ['1.7.3-gas', '19 Nov 2026', 'Perbaikan pembaruan nama guru penginput/pengubah absensi dan jam simpan agar selalu tampil real-time meski tidak ada perubahan status siswa.'],
  ['1.7.2-gas', '19 Nov 2026', 'Tambah tombol Batal Edit pada halaman Input Absensi untuk mengembalikan pilihan ke data tersimpan tanpa menghapus absensi, serta perjelas label tombol Hapus Data Absensi.'],
  ['1.7.1-gas', '19 Nov 2026', 'Perbaikan sinkronisasi real-time antar perangkat: otomatis memperbarui halaman Input Absensi, pembatalan absensi, dan daftar kelas guru tanpa perlu login ulang.'],
  ['1.7.0-gas', '19 Nov 2026', 'Proteksi anti-tabrakan absensi antar guru (info guru penginput, jam absen, dan kunci edit aman), perbaikan grafik tren harian agar tidak terpotong saat libur, serta pembaruan PWA otomatis dengan notifikasi versi.'],
  ['1.6.0-gas', '19 Nov 2026', 'Peningkatan antarmuka Dashboard dan Laporan: peringatan siswa perlu perhatian (<85% atau Alpa >= 3), kotak detail interaktif, dan progress bar persentase.'],
  ['1.5.0-gas', '19 Nov 2026', 'Dukungan tanggal masuk & mutasi keluar siswa pindahan: siswa baru tidak muncul pada absensi bulan/tanggal sebelum masuk, dan siswa keluar otomatis nonaktif mulai tanggal keluar.'],
  ['1.4.0-gas', '19 Nov 2026', 'Perbaikan sinkronisasi agar input baru tidak tertimpa, fitur batal/hapus absensi per tanggal, filter bulan pada Dashboard, dan pembaruan judul Peringkat Kehadiran Kelas.'],
  ['1.3.0-gas', '19 Nov 2026', 'Tambah fitur impor siswa massal (CSV/Excel + template) dan fitur ubah/naik kelas siswa (satuan maupun massal) tanpa menghapus riwayat.'],
  ['1.2.0-gas', '19 Nov 2026', 'Migrasi backend ke Google Apps Script + Google Sheets dengan arsitektur file terpecah (modular).'],
  ['1.2.0', '18 Nov 2026', 'Peringkat kehadiran lebih mudah dibaca, tampilan desktop dioptimalkan, mode pemeliharaan, notifikasi pembaruan.'],
  ['1.1.0', '', 'Dashboard publik, login staf, manajemen pengguna dan kelas, backup Excel.'],
  ['1.0.0', '', 'Rilis awal SiAndal: absensi offline dan online, dashboard animasi.']
];

const GUEST = { r: 'tamu', n: 'Pengunjung', id: null, k: [] };
const NAV = {
  tamu: [['dash', '📊', 'Dashboard']],
  admin: [
    ['dash', '📊', 'Dashboard'],
    ['absen', '✅', 'Input Absensi'],
    ['siswa', '🎓', 'Data Siswa'],
    ['lap', '📄', 'Laporan'],
    ['kelas', '🏫', 'Data Kelas'],
    ['mt', '🛠', 'Pemeliharaan'],
    ['user', '👥', 'Pengguna & Akses'],
    ['sync', '🔄', 'Sinkronisasi & Backup']
  ],
  kepsek: [
    ['dash', '📊', 'Dashboard'],
    ['siswa', '🎓', 'Data Siswa'],
    ['lap', '📄', 'Laporan']
  ],
  guru: [
    ['dash', '📊', 'Dashboard'],
    ['absen', '✅', 'Input Absensi'],
    ['lap', '📄', 'Laporan']
  ]
};

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = iso(new Date());

// Konfigurasi koneksi Google Apps Script
const CFG = window.SIANDAL || {};
const IS_GAS_HOST = !!(window.google && google.script && google.script.run);
const REM = !!(CFG.url || IS_GAS_HOST);
const API = String(CFG.url || '').replace(/\/$/, '');

let S, user, page, mem = {}, raf = 0, toastT;
let SESS = null, G = null, busyR = 0, _le = 0;

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
};
const save = () => ls.set('absenku', JSON.stringify(S));

try { SESS = JSON.parse(ls.get('siandal_sess') || 'null'); } catch (e) {}
try { G = JSON.parse(ls.get('siandal_pub') || 'null'); } catch (e) {}

function sha(m) {
  const b = new TextEncoder().encode(m), l = b.length, n = ((l + 9 + 63) >> 6) << 6, d = new Uint8Array(n);
  d.set(b); d[l] = 128; new DataView(d.buffer).setUint32(n - 4, l * 8);
  const pr = c => {
    const o = [];
    for (let i = 2; o.length < c; i++) {
      let p = 1;
      for (let j = 2; j * j <= i; j++) if (i % j == 0) { p = 0; break; }
      if (p) o.push(i);
    }
    return o;
  };
  const K = pr(64).map(x => Math.cbrt(x) % 1 * 4294967296 | 0);
  let H = pr(8).map(x => Math.sqrt(x) % 1 * 4294967296 | 0);
  const rr = (x, k) => x >>> k | x << 32 - k, w = new Int32Array(64);
  for (let o = 0; o < n; o += 64) {
    const v = new DataView(d.buffer, o, 64);
    for (let i = 0; i < 16; i++) w[i] = v.getInt32(i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], c = w[i - 2];
      w[i] = w[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ a >>> 3) + w[i - 7] + (rr(c, 17) ^ rr(c, 19) ^ c >>> 10) | 0;
    }
    let [A, B, C, D, E, F, G2, J] = H;
    for (let i = 0; i < 64; i++) {
      const t = J + (rr(E, 6) ^ rr(E, 11) ^ rr(E, 25)) + (E & F ^ ~E & G2) + K[i] + w[i] | 0;
      const u = (rr(A, 2) ^ rr(A, 13) ^ rr(A, 22)) + (A & B ^ A & C ^ B & C) | 0;
      J = G2; G2 = F; F = E; E = D + t | 0; D = C; C = B; B = A; A = t + u | 0;
    }
    H = [A, B, C, D, E, F, G2, J].map((x, i) => H[i] + x | 0);
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const mk = (u, n, r, k, p) => {
  const s = Math.random().toString(36).slice(2, 10);
  return { u, n, r, k, s, h: sha(s + p), on: 1, ts: 1 };
};

const defUsers = () => REM ? [] : [
  mk('admin', 'Administrator', 'admin', [], 'admin123'),
  mk('kepsek', 'Kepala Sekolah', 'kepsek', [], 'kepsek123'),
  mk('guru', 'Bu Rina (Guru)', 'guru', ['X-A', 'XI-A'], 'guru123')
];

function rng(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function past(n) {
  const o = [], d = new Date();
  while (o.length < n) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() % 6) o.unshift(iso(d));
  }
  return o;
}

function seed() {
  if (REM) {
    S = { students: [], att: {}, outbox: [], datt: [], users: [], uout: [], classes: [], cts: 0, mq: 0, mt: S && S.mt || undefined };
    save();
    return;
  }
  const R = rng(7);
  const F = 'Ahmad Budi Citra Dewi Eka Fajar Gita Hana Indra Joko Kartika Lina Maya Naufal Putri Rizky Sari Tegar Umar Vina Wulan Yusuf Zahra Andi'.split(' ');
  const L = 'Saputra Lestari Pratama Hidayat Wijaya Nugroho Rahma Santoso Kurniawan Permata'.split(' ');
  S = { students: [], att: {}, outbox: [], datt: [], users: (S && S.users) || defUsers(), uout: [], classes: [...CL], cts: 0, mq: 0, mt: S && S.mt || undefined };
  let id = 1;
  const base = [.97, .94, .92, .95, .9, .93];
  CL.forEach((c, ci) => {
    for (let i = 0; i < 8; i++) {
      S.students.push({ id: 's' + id++, n: F[(ci * 5 + i * 3) % F.length] + ' ' + L[(ci + i * 7) % L.length], c, o: (R() - .5) * .08 });
    }
  });
  past(30).forEach(d => CL.forEach((c, ci) => {
    const recs = {};
    S.students.filter(s => s.c === c).forEach(s => {
      const r = R();
      recs[s.id] = r < base[ci] + s.o ? 'H' : ['S', 'S', 'I', 'I', 'A'][Math.floor(R() * 5)];
    });
    S.att[d + '_' + c] = { recs, ts: 1 };
  }));
  S.students.forEach(s => delete s.o);
  save();
}

const MT = () => S.mt || (S.mt = { on: 0, mode: 'lock', msg: '', eta: '', ts: 0, q: 0 });
const DS = () => (REM && user && user.r === 'tamu' && G) ? G : S;
const vis = () => user.r === 'guru' ? user.k.filter(c => S.classes.includes(c)) : DS().classes;
const dates = () => {
  const p = past(30);
  return DS().classes.some(c => DS().att[TODAY + '_' + c]) ? [...p.slice(1), TODAY] : p;
};

const stuOnDate = (s, d) => {
  if (!s) return false;
  if (s.j && d < s.j) return false;
  if (s.l && d > s.l) return false;
  return true;
};
const isActiveStu = (s, refDate = TODAY) => stuOnDate(s, refDate);

function stat(cls, ds) {
  const o = { H: 0, S: 0, I: 0, A: 0 };
  const stuMap = {};
  DS().students.filter(s => cls.includes(s.c)).forEach(s => stuMap[s.id] = s);
  ds.forEach(d => cls.forEach(c => {
    const a = DS().att[d + '_' + c];
    if (a) for (const k in a.recs) {
      const st = stuMap[k];
      if (st && stuOnDate(st, d)) o[a.recs[k]]++;
    }
  }));
  o.T = o.H + o.S + o.I + o.A;
  o.p = o.T ? o.H / o.T * 100 : 0;
  return o;
}

const same = (a, b) => {
  const f = x => JSON.stringify(x.slice().sort((p, q) => String(p.id || p).localeCompare(String(q.id || q))));
  return f(a) === f(b);
};
