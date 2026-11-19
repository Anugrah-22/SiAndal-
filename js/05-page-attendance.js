/**
 * js/05-page-attendance.js
 * Halaman Input Absensi Harian (H/S/I/A) per kelas dengan dukungan penyimpanan offline,
 * filter otomatis tanggal masuk / mutasi keluar siswa pindahan, serta pembatalan absensi.
 */

function absen() {
  const cls = vis();
  let d = TODAY, c = cls[0], draft;
  const el = $('#pg');
  if (!cls.length) {
    el.innerHTML = '<div class="card">Belum ada kelas yang diatur untuk akun ini. Hubungi admin.</div>';
    return;
  }

  function draw() {
    const k = d + '_' + c, ex = S.att[k];
    const allInClass = S.students.filter(s => s.c === c);
    const ss = allInClass.filter(s => stuOnDate(s, d));
    const notJoinedYet = allInClass.filter(s => s.j && d < s.j);
    const alreadyLeft = allInClass.filter(s => s.l && d > s.l);

    if (!draft) {
      draft = {};
      if (ex && ex.recs) {
        ss.forEach(s => {
          if (ex.recs[s.id]) draft[s.id] = ex.recs[s.id];
        });
      }
    }
    const hasDraft = Object.keys(draft).length > 0;
    const isPendingSync = S.outbox.includes(k);

    el.innerHTML = `
      <div class="card">
        <div class="ctl">
          <input type="date" id="dd" max="${TODAY}" value="${d}" style="width:auto">
          <select id="cc">${cls.map(x => `<option ${x === c ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <span class="pill">${ex ? (isPendingSync ? 'Tersimpan (antrean sinkron)' : 'Tersimpan') : 'Belum diisi'}</span>
          <span style="flex:1"></span>
          ${hasDraft ? `<button class="btn o" id="rst" title="Kosongkan pilihan sementara di layar">Reset Pilihan</button>` : ''}
          ${ex ? `<button class="btn o" id="delAtt" style="color:var(--r);border-color:var(--r)" title="Hapus data absensi yang sudah tersimpan pada tanggal dan kelas ini">🗑 Batalkan Absensi</button>` : ''}
          <button class="btn o" id="all">Semua Hadir</button>
          <button class="btn" id="sv">💾 Simpan</button>
        </div>
        ${d !== TODAY ? `<div style="font-size:12px;color:var(--y);font-weight:600;margin-bottom:8px">📅 Perhatian: Anda sedang membuka tanggal <b>${d}</b> (bukan hari ini ${TODAY}).</div>` : ''}
        ${notJoinedYet.length ? `<div style="font-size:12px;color:var(--mu);margin-bottom:8px">ℹ️ <b>${notJoinedYet.length}</b> siswa pindahan baru masuk setelah tanggal ${d} tidak ditampilkan (${notJoinedYet.map(s => esc(s.n) + ' • masuk ' + s.j).join(', ')}).</div>` : ''}
        ${alreadyLeft.length ? `<div style="font-size:12px;color:var(--mu);margin-bottom:8px">ℹ️ <b>${alreadyLeft.length}</b> siswa mutasi keluar sebelum tanggal ${d} tidak ditampilkan (${alreadyLeft.map(s => esc(s.n) + ' • keluar ' + s.l).join(', ')}).</div>` : ''}
        <div class="sc">
          <table>
            <tr><th>No</th><th>Nama</th><th>Status</th></tr>
            ${ss.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(s.n)}${s.j && s.j === d ? ' <span class="pill" style="font-size:11px">Baru masuk</span>' : ''}</td>
                <td>
                  <div class="seg" data-s="${s.id}">
                    ${Object.keys(ST).map(k => `<button class="${k} ${draft[s.id] === k ? 'on' : ''}" data-k="${k}" title="${ST[k][0]}">${k}</button>`).join('')}
                  </div>
                </td>
              </tr>`).join('') || `<tr><td colspan="3" class="mu">Tidak ada siswa yang terdaftar aktif di kelas ${esc(c)} pada tanggal ${d}.</td></tr>`}
          </table>
        </div>
      </div>`;

    $('#dd').onchange = e => { d = e.target.value || TODAY; draft = 0; draw(); };
    $('#cc').onchange = e => { c = e.target.value; draft = 0; draw(); };
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      draft[b.parentNode.dataset.s] = b.dataset.k;
      draw();
    });
    if ($('#rst')) $('#rst').onclick = () => {
      draft = {};
      toast('Pilihan di layar direset');
      draw();
    };
    if ($('#delAtt')) $('#delAtt').onclick = async () => {
      if (!await ask('Batalkan dan hapus data absensi kelas ' + c + ' pada tanggal ' + d + '?')) return;
      delete S.att[k];
      S.outbox = S.outbox.filter(x => x !== k);
      S.datt = S.datt || [];
      if (!S.datt.includes(k)) S.datt.push(k);
      draft = {};
      save();
      toast(navigator.onLine && REM ? '🗑 Absensi dibatalkan & menyinkronkan…' : '🗑 Absensi dibatalkan (lokal)');
      push();
      draw();
    };
    $('#all').onclick = () => { ss.forEach(s => draft[s.id] = 'H'); draw(); };
    $('#sv').onclick = () => {
      if (!ss.length) return toast('Tidak ada siswa aktif pada tanggal ini');
      if (ss.some(s => !draft[s.id])) return toast('Masih ada siswa yang belum diisi');
      const k2 = d + '_' + c;
      const cleanRecs = {};
      ss.forEach(s => { cleanRecs[s.id] = draft[s.id]; });
      S.att[k2] = { recs: cleanRecs, ts: Date.now() };
      if (S.datt) S.datt = S.datt.filter(x => x !== k2);
      if (!S.outbox.includes(k2)) S.outbox.push(k2);
      save();
      toast(navigator.onLine && REM ? 'Menyimpan & sinkron…' : '💾 Disimpan lokal — akan sinkron saat online');
      push();
      draw();
    };
  }
  draw();
}
