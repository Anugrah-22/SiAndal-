/**
 * js/06-page-master.js
 * Halaman Master Data: Data Siswa, Data Kelas (termasuk rename cascade), dan Pengguna & Akses.
 */

function siswa() {
  const adm = user.r === 'admin', el = $('#pg');
  function draw() {
    el.innerHTML = `
      ${adm ? `<div class="card" style="margin-bottom:14px"><div class="ctl"><input id="nn" placeholder="Nama siswa baru" style="flex:1;min-width:160px"><select id="nc">${S.classes.map(c => `<option>${c}</option>`).join('')}</select><button class="btn" id="ad">+ Tambah</button></div></div>` : ''}
      <div class="card sc">
        <table>
          <tr><th>Nama</th><th>Kelas</th><th>Kehadiran 30 hari</th>${adm ? '<th></th>' : ''}</tr>
          ${S.students.map(s => {
            let h = 0, t = 0;
            dates().forEach(d => {
              const a = S.att[d + '_' + s.c];
              if (a && a.recs[s.id]) { t++; if (a.recs[s.id] === 'H') h++; }
            });
            const p = t ? h / t * 100 : 0;
            return `<tr><td>${esc(s.n)}</td><td>${s.c}</td><td class="${p < 85 ? 'bad' : ''}">${t ? p.toFixed(0) + '%' : '–'}</td>${adm ? `<td><button class="btn o" data-d="${s.id}">Hapus</button></td>` : ''}</tr>`;
          }).join('')}
        </table>
      </div>`;

    if (adm) {
      $('#ad').onclick = () => {
        const n = $('#nn').value.trim();
        if (!n) return;
        S.students.push({ id: 's' + Date.now(), n, c: $('#nc').value });
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        draw();
      };
      el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
        (S.dst = S.dst || []).push(b.dataset.d);
        S.students = S.students.filter(s => s.id !== b.dataset.d);
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        draw();
      });
    }
  }
  draw();
}

function kelas() {
  const el = $('#pg');
  const cnt = c => S.students.filter(s => s.c === c).length;
  const gur = c => S.users.filter(u => u.r === 'guru' && u.k.includes(c)).length;
  const mm = () => { S.cts = Date.now(); S.mq = 1; save(); push(); };
  const ok = n => /^[A-Za-z0-9.\-]{1,12}$/.test(n);
  const dup = n => S.classes.some(x => x.toLowerCase() === n.toLowerCase());
  const uq = u => { if (!S.uout.includes(u.u)) S.uout.push(u.u); u.ts = Date.now(); };
  let ed = null;

  function draw() {
    el.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3>Tambah kelas</h3>
        <div class="ctl"><input id="kn" placeholder="Contoh: X-IPA-1" style="flex:1;min-width:160px"><button class="btn" id="ka">+ Tambah kelas</button></div>
        <div style="color:var(--mu);font-size:12px">Nama 1–12 karakter: huruf, angka, titik, atau tanda hubung, tanpa spasi. Contoh: X-IPA-1, XI-IPS-2, 7A.</div>
      </div>
      <div class="card sc">
        <h3>Daftar kelas (${S.classes.length})</h3>
        <table>
          <tr><th>Kelas</th><th>Siswa</th><th>Guru dengan akses</th><th></th></tr>
          ${S.classes.map(c => `
            <tr>
              <td>${ed === c ? `<input id="kr" value="${c}" style="width:150px">` : `<b>${c}</b>`}</td>
              <td>${cnt(c)}</td>
              <td>${gur(c)}</td>
              <td style="white-space:nowrap">${ed === c ? `<button class="btn" data-s="${c}">Simpan</button> <button class="btn o" id="kc">Batal</button>` : `<button class="btn o" data-e="${c}">Ubah nama</button> <button class="btn o" data-x="${c}">Hapus</button>`}</td>
            </tr>`).join('') || '<tr><td colspan="4">Belum ada kelas.</td></tr>'}
        </table>
        <p style="color:var(--mu);font-size:12px">Setelah menambah kelas, tambahkan siswanya di menu Data Siswa dan atur guru pengampu di menu Pengguna &amp; Akses. Mengubah nama kelas ikut memperbarui siswa, riwayat absensi, dan akses guru. Kelas hanya bisa dihapus jika sudah tidak ada siswanya.</p>
      </div>`;

    $('#ka').onclick = () => {
      const n = $('#kn').value.trim();
      if (!ok(n)) return toast('Nama kelas tidak valid (tanpa spasi, maks. 12 karakter)');
      if (dup(n)) return toast('Nama kelas sudah ada');
      S.classes.push(n);
      mm();
      toast('Kelas ditambahkan');
      draw();
    };
    if (ed) $('#kc').onclick = () => { ed = null; draw(); };
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { ed = b.dataset.e; draw(); });
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const a = b.dataset.s, n = $('#kr').value.trim();
      if (n === a) { ed = null; return draw(); }
      if (!ok(n)) return toast('Nama kelas tidak valid');
      if (dup(n)) return toast('Nama kelas sudah ada');
      (S.ren = S.ren || []).push([a, n]);
      S.students.forEach(s => { if (s.c === a) s.c = n; });
      S.classes = S.classes.map(c => c === a ? n : c);
      Object.keys(S.att).forEach(k => {
        const i = k.lastIndexOf('_');
        if (k.slice(i + 1) === a) {
          const nk = k.slice(0, i + 1) + n;
          S.att[nk] = S.att[k];
          delete S.att[k];
          S.outbox = S.outbox.filter(x => x !== k);
          if (!S.outbox.includes(nk)) S.outbox.push(nk);
        }
      });
      S.users.forEach(u => { if (u.k.includes(a)) { u.k = u.k.map(c => c === a ? n : c); uq(u); } });
      ed = null;
      mm();
      toast('Nama kelas diperbarui');
      draw();
    });
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
      const a = b.dataset.x;
      if (cnt(a)) return toast('Masih ada ' + cnt(a) + ' siswa di kelas ini. Hapus atau pindahkan dulu.');
      if (!await ask('Hapus kelas ' + a + '?')) return;
      (S.dcl = S.dcl || []).push(a);
      S.classes = S.classes.filter(c => c !== a);
      Object.keys(S.att).forEach(k => {
        if (k.slice(k.lastIndexOf('_') + 1) === a) {
          delete S.att[k];
          S.outbox = S.outbox.filter(x => x !== k);
        }
      });
      S.users.forEach(u => { if (u.k.includes(a)) { u.k = u.k.filter(c => c !== a); uq(u); } });
      mm();
      draw();
    });
  }
  draw();
}

function users() {
  const el = $('#pg');
  const RL = { admin: 'Admin', kepsek: 'Kepala Sekolah', guru: 'Guru' };
  const adm = () => S.users.filter(x => x.r === 'admin' && x.on).length;
  const uq = u => { if (!S.uout.includes(u)) S.uout.push(u); save(); push(); };
  let ed = null;

  function draw() {
    const e = ed && S.users.find(x => x.u === ed) || {};
    el.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3>${ed ? 'Ubah akun: ' + esc(ed) : 'Tambah akun baru'}</h3>
        <div class="fg">
          <div><label>Nama lengkap</label><input id="fn" value="${esc(e.n || '')}"></div>
          <div><label>Username</label><input id="fu" value="${esc(e.u || '')}" ${ed ? 'disabled' : ''} placeholder="huruf kecil/angka"></div>
          <div><label>Peran</label><select id="fr">${Object.keys(RL).map(r => `<option value="${r}" ${e.r === r ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select></div>
          <div><label>${ed ? 'Password baru (kosongkan bila tidak diubah)' : 'Password (min. 6 karakter)'}</label><input id="fp" autocomplete="off"></div>
        </div>
        <label>Kelas yang boleh diakses (khusus peran Guru)</label>
        <div class="chk" id="fk">${S.classes.map(c => `<label><input type="checkbox" value="${c}" ${(e.k || []).includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</div>
        <div class="ctl" style="margin-top:12px"><button class="btn" id="fs">${ed ? 'Simpan perubahan' : '+ Tambah akun'}</button>${ed ? '<button class="btn o" id="fc">Batal</button>' : ''}</div>
      </div>
      <div class="card sc">
        <h3>Daftar akun (${S.users.length})</h3>
        <table>
          <tr><th>Nama</th><th>Username</th><th>Peran</th><th>Kelas</th><th>Status</th><th></th></tr>
          ${S.users.map(x => `
            <tr>
              <td>${esc(x.n)}</td>
              <td>${esc(x.u)}</td>
              <td>${RL[x.r]}</td>
              <td>${x.r === 'guru' ? (x.k.join(', ') || '<span class="bad">belum ada</span>') : 'Semua'}</td>
              <td>${x.on ? 'Aktif' : '<span class="bad">Nonaktif</span>'}</td>
              <td style="white-space:nowrap"><button class="btn o" data-e="${esc(x.u)}">Ubah</button> <button class="btn o" data-t="${esc(x.u)}">${x.on ? 'Nonaktifkan' : 'Aktifkan'}</button> <button class="btn o" data-x="${esc(x.u)}">Hapus</button></td>
            </tr>`).join('')}
        </table>
        <p style="color:var(--mu);font-size:12px">Admin dapat menambah guru, mengatur kelas yang boleh diakses, mereset password, menonaktifkan atau menghapus akun. Akun baru ikut tersinkron ke perangkat lain saat online.</p>
      </div>`;

    $('#fs').onclick = () => {
      const n = $('#fn').value.trim();
      const u = ed || $('#fu').value.trim().toLowerCase();
      const r = $('#fr').value;
      const p = $('#fp').value;
      const k = [...document.querySelectorAll('#fk input:checked')].map(i => i.value);

      if (!n || !/^[a-z0-9._-]{3,20}$/.test(u)) return toast('Nama wajib diisi; username 3–20 karakter (huruf kecil/angka)');
      if (!ed && S.users.some(x => x.u === u)) return toast('Username sudah dipakai');
      if ((!ed || p) && p.length < 6) return toast('Password minimal 6 karakter');

      let a = ed ? S.users.find(x => x.u === u) : null;
      if (a && a.r === 'admin' && r !== 'admin' && (adm() < 2 || u === user.id)) return toast('Peran admin ini tidak bisa diturunkan');
      if (!a) { a = { u, on: 1 }; S.users.push(a); }

      Object.assign(a, { n, r, k: r === 'guru' ? k : [], ts: Date.now() });
      if (p) {
        a.s = Math.random().toString(36).slice(2, 10);
        a.h = sha(a.s + p);
        (window._pw = window._pw || {})[u] = p;
      }
      uq(u);
      ed = null;
      toast(r === 'guru' && !k.length ? 'Tersimpan — guru ini belum diberi kelas' : '✅ Akun disimpan');
      draw();
    };
    if (ed) $('#fc').onclick = () => { ed = null; draw(); };
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { ed = b.dataset.e; draw(); scrollTo(0, 0); });
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      const a = S.users.find(x => x.u === b.dataset.t);
      if (a.on && (a.u === user.id || a.r === 'admin' && adm() < 2)) return toast('Akun ini tidak bisa dinonaktifkan');
      a.on = a.on ? 0 : 1;
      a.ts = Date.now();
      uq(a.u);
      draw();
    });
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
      const a = S.users.find(x => x.u === b.dataset.x);
      if (a.u === user.id || a.r === 'admin' && a.on && adm() < 2) return toast('Akun ini tidak bisa dihapus');
      if (!await ask('Hapus akun ' + a.u + '?')) return;
      S.users = S.users.filter(x => x !== a);
      uq(a.u);
      draw();
    });
  }
  (REM ? loadUsersR().then(draw) : draw());
}
