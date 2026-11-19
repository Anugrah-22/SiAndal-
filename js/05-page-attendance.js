/**
 * js/05-page-attendance.js
 * Halaman Input Absensi Harian (H/S/I/A) per kelas dengan dukungan penyimpanan offline.
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
    const k = d + '_' + c, ex = S.att[k], ss = S.students.filter(s => s.c === c);
    draft = draft || Object.assign({}, ex ? ex.recs : {});
    el.innerHTML = `
      <div class="card">
        <div class="ctl">
          <input type="date" id="dd" max="${TODAY}" value="${d}" style="width:auto">
          <select id="cc">${cls.map(x => `<option ${x === c ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <span class="pill">${ex ? 'Tersimpan' : 'Belum diisi'}</span>
          <span style="flex:1"></span>
          <button class="btn o" id="all">Semua Hadir</button>
          <button class="btn" id="sv">💾 Simpan</button>
        </div>
        <div class="sc">
          <table>
            <tr><th>No</th><th>Nama</th><th>Status</th></tr>
            ${ss.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(s.n)}</td>
                <td>
                  <div class="seg" data-s="${s.id}">
                    ${Object.keys(ST).map(k => `<button class="${k} ${draft[s.id] === k ? 'on' : ''}" data-k="${k}" title="${ST[k][0]}">${k}</button>`).join('')}
                  </div>
                </td>
              </tr>`).join('')}
          </table>
        </div>
      </div>`;

    $('#dd').onchange = e => { d = e.target.value || TODAY; draft = 0; draw(); };
    $('#cc').onchange = e => { c = e.target.value; draft = 0; draw(); };
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      draft[b.parentNode.dataset.s] = b.dataset.k;
      draw();
    });
    $('#all').onclick = () => { ss.forEach(s => draft[s.id] = 'H'); draw(); };
    $('#sv').onclick = () => {
      if (ss.some(s => !draft[s.id])) return toast('Masih ada siswa yang belum diisi');
      const k2 = d + '_' + c;
      S.att[k2] = { recs: { ...draft }, ts: Date.now() };
      if (!S.outbox.includes(k2)) S.outbox.push(k2);
      save();
      toast(navigator.onLine && REM ? 'Menyimpan & sinkron…' : '💾 Disimpan lokal — akan sinkron saat online');
      push();
      draw();
    };
  }
  draw();
}
