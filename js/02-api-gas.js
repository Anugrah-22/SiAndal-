/**
 * js/02-api-gas.js
 * Lapisan komunikasi Google Apps Script (mendukung mode PWA fetch maupun HtmlService google.script.run)
 * serta mesin sinkronisasi otomatis offline-first dengan proteksi anti-timpa (race-condition safe).
 */

let _needPush = 0;

const sessSave = s => {
  SESS = s;
  ls.set('siandal_sess', s ? JSON.stringify(s) : '');
};

const lastErr = e => {
  if (!navigator.onLine || e instanceof TypeError || Date.now() - _le < 60000) return;
  _le = Date.now();
  const m = (e && e.message) || '';
  if (m.includes('UNAUTH')) {
    sessSave(null);
    toast('Sesi berakhir, silakan login ulang.');
    return;
  }
  toast('Sinkron gagal' + (m ? ': ' + m : ''));
};

async function rqGas(action, payload = {}) {
  const token = (SESS && SESS.at) || '';
  if (IS_GAS_HOST) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(res => (res && res.error) ? reject(new Error(res.error)) : resolve(res))
        .withFailureHandler(err => reject(err))
        .handleApi(action, payload, token);
    });
  }
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, token })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j;
}

async function loginR(u, p) {
  const j = await rqGas('login', { username: u, password: p });
  if (j.err) return { err: j.err };
  sessSave({ at: j.token, exp: j.exp, uid: u });
  const s = Math.random().toString(36).slice(2, 10);
  const rec = { ...j.rec, s, h: sha(s + p) };
  S.users = S.users.filter(x => x.u !== rec.u);
  S.users.push(rec);
  save();
  return { rec };
}

async function pubR() {
  const res = await rqGas('public_data', { days: 365 });
  const o = res.overview || [], d = res.dashboard || [];
  const mx = {};
  d.forEach(r => { mx[r.class] = Math.max(mx[r.class] || 0, r.h + r.s + r.i + r.a); });
  const g = { classes: o.map(x => x.class), students: [], att: {}, low: o.reduce((s, x) => s + x.low_students, 0) };
  o.forEach(x => {
    for (let i = 0; i < Math.max(x.students, mx[x.class] || 0); i++) {
      g.students.push({ id: x.class + '#' + i, n: '', c: x.class });
    }
  });
  d.forEach(r => {
    const recs = {};
    let i = 0;
    [['H', r.h], ['S', r.s], ['I', r.i], ['A', r.a]].forEach(([st, n]) => {
      for (let k = 0; k < n; k++) recs[r.class + '#' + (i++)] = st;
    });
    g.att[r.att_date + '_' + r.class] = { recs, ts: 1 };
  });
  const ch = JSON.stringify(g) !== JSON.stringify(G);
  G = g;
  ls.set('siandal_pub', JSON.stringify(g));
  if (res.maint && !MT().q) {
    const v = res.maint;
    S.mt = { on: v.on ? 1 : 0, mode: v.mode || 'lock', msg: v.msg || '', eta: v.eta || '', ts: Date.parse(v.updated_at) || Date.now(), q: 0 };
    save();
    applyMt();
  }
  if (ch && page === 'dash' && (!user || user.r === 'tamu')) render();
}

async function maintR() {
  const m = MT();
  try {
    if (m.q && SESS && user && user.r === 'admin') {
      await rqGas('maint_set', { on: !!m.on, mode: m.mode, msg: m.msg, eta: m.eta });
      m.q = 0;
      save();
    }
    const v = await rqGas('maint_get');
    if (v && !MT().q) {
      S.mt = { on: v.on ? 1 : 0, mode: v.mode || 'lock', msg: v.msg || '', eta: v.eta || '', ts: Date.parse(v.updated_at) || Date.now(), q: 0 };
      save();
      applyMt();
    }
  } catch (e) {}
}

async function syncStaff() {
  const adm = user.r === 'admin';
  let ch = 0;

  if (adm) {
    for (const u of [...(S.uout || [])]) {
      const r = S.users.find(x => x.u === u);
      const snapTs = r ? (r.ts || 0) : 0;
      try {
        if (r) {
          await rqGas('admin_users_upsert', {
            username: u,
            full_name: r.n,
            role: r.r,
            active: !!r.on,
            classes: r.k || [],
            password: (window._pw || {})[u] || ''
          });
        } else {
          await rqGas('admin_users_delete', { username: u });
        }
        const curUser = S.users.find(x => x.u === u);
        if (!curUser || (curUser.ts || 0) <= snapTs) {
          S.uout = S.uout.filter(x => x !== u);
          if (window._pw) delete window._pw[u];
        }
      } catch (e) {
        S.uout = S.uout.filter(x => x !== u);
        toast('Akun ' + u + ': ' + e.message);
      }
    }
    save();
  }

  // Ambil snapshot state sebelum request jaringan dimulai (mencegah race condition menimpa input baru)
  const snapCts = S.cts || 0;
  const snapMq = adm && !!S.mq;
  const snapRen = adm ? JSON.parse(JSON.stringify(S.ren || [])) : [];
  const snapDst = adm ? [...(S.dst || [])] : [];
  const snapDcl = adm ? [...(S.dcl || [])] : [];
  const snapClasses = adm ? [...S.classes] : [];
  const snapStudents = adm ? JSON.parse(JSON.stringify(S.students)) : [];

  const attRows = [];
  const pushedKeys = [];
  const snapAttTs = {};
  for (const k of [...S.outbox]) {
    const i = k.lastIndexOf('_'), d = k.slice(0, i), c = k.slice(i + 1), a = S.att[k];
    if (!a) { S.outbox = S.outbox.filter(x => x !== k); continue; }
    Object.keys(a.recs).forEach(id => attRows.push({ student_id: id, att_date: d, class: c, status: a.recs[id] }));
    pushedKeys.push(k);
    snapAttTs[k] = a.ts || 0;
  }

  const snapDatt = [...(S.datt || [])];
  const deletedAttendance = snapDatt.map(k => {
    const i = k.lastIndexOf('_');
    return { att_date: k.slice(0, i), class: k.slice(i + 1) };
  });

  const res = await rqGas('sync_staff', {
    ren: snapRen,
    masterSync: snapMq,
    deletedStudents: snapDst,
    deletedClasses: snapDcl,
    classes: snapClasses,
    students: snapStudents,
    deletedAttendance: deletedAttendance,
    attRows: attRows,
    cursor: Object.values(S.att || {}).some(a => a && a.recs && Object.keys(a.recs).length && !a.by) ? '' : (S.cur || '')
  });

  // Bersihkan flag master hanya jika tidak ada perubahan baru yang terjadi selama request berjalan
  if (adm && snapMq) {
    if ((S.cts || 0) === snapCts) {
      S.ren = [];
      S.dst = [];
      S.dcl = [];
      S.mq = 0;
    } else {
      if (snapDst.length) {
        const sentDst = new Set(snapDst);
        S.dst = (S.dst || []).filter(id => !sentDst.has(id));
      }
      if (snapDcl.length) {
        const sentDcl = new Set(snapDcl);
        S.dcl = (S.dcl || []).filter(c => !sentDcl.has(c));
      }
      if (snapRen.length) {
        S.ren = (S.ren || []).slice(snapRen.length);
      }
      S.mq = 1;
    }
  }

  S.outbox = S.outbox.filter(k => {
    if (!pushedKeys.includes(k)) return true;
    return S.att[k] && (S.att[k].ts || 0) > (snapAttTs[k] || 0);
  });

  if (snapDatt.length) {
    const sentDatt = new Set(snapDatt);
    S.datt = (S.datt || []).filter(k => !sentDatt.has(k));
  }

  // Perbarui hak akses kelas terbaru untuk guru yang sedang login tanpa perlu relogin
  if (user && user.r === 'guru' && Array.isArray(res.myClasses)) {
    if (JSON.stringify(user.k || []) !== JSON.stringify(res.myClasses)) {
      user.k = res.myClasses;
      const uRec = (S.users || []).find(x => x.u === user.u);
      if (uRec) uRec.k = res.myClasses;
      ch = 1;
    }
  }

  // Perbarui daftar nama staf/guru agar tampilan "diisi oleh [Nama Guru]" selalu akurat
  if (Array.isArray(res.users) && res.users.length) {
    const oldMap = {};
    (S.users || []).forEach(x => { oldMap[x.u] = x; });
    const pendingU = new Set(S.uout || []);
    res.users.forEach(ru => {
      if (pendingU.has(ru.u)) return;
      const exU = oldMap[ru.u];
      if (exU) {
        exU.n = ru.n;
        exU.r = ru.r;
        exU.on = ru.on;
      } else {
        S.users.push({ u: ru.u, n: ru.n, r: ru.r, k: [], s: '', h: 'x', on: ru.on, ts: 1 });
      }
    });
  }

  // Terapkan data master dari server HANYA jika tidak ada perubahan lokal yang belum tersinkron
  if (!S.mq) {
    if (res.classes && JSON.stringify(res.classes) !== JSON.stringify(S.classes)) {
      S.classes = res.classes;
      ch = 1;
    }
    if (res.students && !same(res.students, S.students)) {
      S.students = res.students;
      ch = 1;
    }
  }

  // Bersihkan absensi lokal yang sudah dihapus/dibatalkan di perangkat lain
  const pendingDelAtt = new Set(S.datt || []);
  if (Array.isArray(res.activeAttKeys)) {
    const activeSet = new Set(res.activeAttKeys);
    Object.keys(S.att || {}).forEach(k => {
      if (!S.outbox.includes(k) && !pendingDelAtt.has(k) && !activeSet.has(k)) {
        delete S.att[k];
        ch = 1;
      }
    });
  }

  let cur = S.cur || '';
  const serverLatest = {};
  (res.attendance || []).forEach(r => {
    const k = r.att_date + '_' + r.class;
    if (S.outbox.includes(k) || pendingDelAtt.has(k)) return;
    const x = S.att[k] || (S.att[k] = { recs: {}, ts: 1, by: '' });
    if (x.recs[r.student_id] !== r.status) { x.recs[r.student_id] = r.status; ch = 1; }
    const rTs = Date.parse(r.updated_at) || 1;
    if (!serverLatest[k] || rTs >= serverLatest[k].ts) {
      serverLatest[k] = { ts: rTs, by: r.updated_by || '' };
    }
    if (r.updated_at > cur) cur = r.updated_at;
  });
  Object.keys(serverLatest).forEach(k => {
    const x = S.att[k];
    const sv = serverLatest[k];
    if (!x) return;
    if (sv.by && x.by !== sv.by) { x.by = sv.by; ch = 1; }
    if (sv.ts > 1 && Math.abs(x.ts - sv.ts) > 1000) { x.ts = sv.ts; ch = 1; }
  });
  S.cur = cur;
  save();

  if (ch && ['dash', 'absen', 'lap', 'siswa', 'kelas'].includes(page)) render();
}

async function pushR() {
  if (!navigator.onLine) return;
  if (busyR) {
    _needPush = 1;
    return;
  }
  busyR = 1;
  try {
    do {
      _needPush = 0;
      if (SESS && user && user.r !== 'tamu') await syncStaff();
      else await pubR();
      await maintR();
    } while (_needPush && navigator.onLine);
  } catch (e) {
    lastErr(e);
  } finally {
    busyR = 0;
    netUI();
  }
}

async function push() {
  netUI();
  if (REM) return pushR();
  return false;
}

async function initDb() {
  if (REM) {
    if (!window._ri) {
      window._ri = 1;
      setInterval(() => push(), 20000);
      addEventListener('focus', () => push());
      addEventListener('online', () => push());
    }
    return push();
  }
}

async function loadUsersR() {
  if (!REM || !SESS || !navigator.onLine) return;
  try {
    const res = await rqGas('admin_users_list');
    const old = {};
    S.users.forEach(x => old[x.u] = x);
    S.users = (res.users || []).map(x => ({
      ...x,
      s: (old[x.u] || {}).s || '',
      h: (old[x.u] || {}).h || 'x'
    }));
    save();
  } catch (e) {}
}

addEventListener('online', () => { toast('🌐 Online — menyinkronkan…'); initDb().then(push); netUI(); });
addEventListener('offline', () => { toast('📴 Offline — data disimpan lokal'); netUI(); });
