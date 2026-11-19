/**
 * js/02-api-gas.js
 * Lapisan komunikasi Google Apps Script (mendukung mode PWA fetch maupun HtmlService google.script.run)
 * serta mesin sinkronisasi otomatis offline-first.
 */

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
  const res = await rqGas('public_data', { days: 60 });
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
  if (ch && page === 'dash' && user && user.r === 'tamu') render();
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
        S.uout = S.uout.filter(x => x !== u);
        if (window._pw) delete window._pw[u];
      } catch (e) {
        S.uout = S.uout.filter(x => x !== u);
        toast('Akun ' + u + ': ' + e.message);
      }
    }
    save();
  }

  const attRows = [];
  const pushedKeys = [];
  for (const k of [...S.outbox]) {
    const i = k.lastIndexOf('_'), d = k.slice(0, i), c = k.slice(i + 1), a = S.att[k];
    if (!a) { S.outbox = S.outbox.filter(x => x !== k); continue; }
    Object.keys(a.recs).forEach(id => attRows.push({ student_id: id, att_date: d, class: c, status: a.recs[id] }));
    pushedKeys.push(k);
  }

  const res = await rqGas('sync_staff', {
    ren: adm ? (S.ren || []) : [],
    masterSync: adm && !!S.mq,
    deletedStudents: adm ? (S.dst || []) : [],
    deletedClasses: adm ? (S.dcl || []) : [],
    classes: adm ? S.classes : [],
    students: adm ? S.students : [],
    attRows: attRows,
    cursor: S.cur || ''
  });

  if (adm) { S.ren = []; S.dst = []; S.dcl = []; S.mq = 0; }
  S.outbox = S.outbox.filter(x => !pushedKeys.includes(x));

  if (res.classes && JSON.stringify(res.classes) !== JSON.stringify(S.classes)) {
    S.classes = res.classes;
    ch = 1;
  }
  if (res.students && !same(res.students, S.students)) {
    S.students = res.students;
    ch = 1;
  }
  let cur = S.cur || '';
  (res.attendance || []).forEach(r => {
    const k = r.att_date + '_' + r.class;
    if (S.outbox.includes(k)) return;
    const x = S.att[k] || (S.att[k] = { recs: {}, ts: 1 });
    if (x.recs[r.student_id] !== r.status) { x.recs[r.student_id] = r.status; ch = 1; }
    x.ts = Math.max(x.ts, Date.parse(r.updated_at) || 1);
    if (r.updated_at > cur) cur = r.updated_at;
  });
  S.cur = cur;
  save();

  if (ch && ['dash', 'lap', 'siswa', 'kelas'].includes(page)) render();
}

async function pushR() {
  if (busyR || !navigator.onLine) return;
  busyR = 1;
  try {
    if (SESS && user && user.r !== 'tamu') await syncStaff();
    else await pubR();
    await maintR();
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
      setInterval(() => push(), 45000);
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
