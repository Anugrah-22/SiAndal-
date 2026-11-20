/**
 * js/04-page-dashboard.js
 * Halaman Dashboard: Filter periode/bulan, KPI ringkas, animasi Peringkat Kehadiran Kelas,
 * grafik garis tren harian, dan grafik donat komposisi status.
 */

function getDashPeriodOptions_() {
  const curYm = TODAY.slice(0, 7);
  const ymSet = new Set();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    ymSet.add(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'));
  }
  Object.keys(DS().att || {}).forEach(k => {
    if (/^\d{4}-\d{2}-\d{2}_/.test(k)) ymSet.add(k.slice(0, 7));
  });

  const months = [...ymSet].sort((a, b) => b.localeCompare(a)).map(ym => {
    const [y, m] = ym.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return {
      val: ym,
      label: ym === curYm ? `Bulan Ini (${label})` : label
    };
  });

  return [
    { val: '30d', label: '30 Hari Terakhir' },
    ...months,
    { val: 'all', label: 'Semua Data (1 Tahun Terakhir)' }
  ];
}

function getDashDates_(period, cls) {
  if (period === '30d') return dates();

  const recorded = new Set();
  Object.keys(DS().att || {}).forEach(k => {
    const i = k.lastIndexOf('_');
    const d = k.slice(0, i);
    const c = k.slice(i + 1);
    if ((!cls.length || cls.includes(c)) && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      recorded.add(d);
    }
  });

  if (period === 'all') {
    const merged = new Set([...dates(), ...recorded]);
    return [...merged].sort();
  }

  // Specific month YYYY-MM
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const out = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(y, m - 1, day);
    const s = iso(dt);
    if (s > TODAY && out.length > 0) break;
    const isWeekday = dt.getDay() % 6 !== 0;
    if (isWeekday || recorded.has(s)) out.push(s);
  }
  return out.length ? out : [period + '-01'];
}

function dash() {
  const cls = vis();
  const opts = getDashPeriodOptions_();
  const period = (window._dashPeriod && opts.some(o => o.val === window._dashPeriod)) ? window._dashPeriod : '30d';
  window._dashPeriod = period;
  const periodLabel = (opts.find(o => o.val === period) || opts[0]).label;

  const ds = getDashDates_(period, cls);
  const all = stat(cls, ds);

  // Cari tanggal terakhir pada periode terpilih yang memiliki catatan absensi
  const activeDates = ds.filter(d => cls.some(c => {
    const a = DS().att[d + '_' + c];
    return a && Object.keys(a.recs || {}).length > 0;
  }));
  const lastDate = activeDates.length ? activeDates[activeDates.length - 1] : ds[ds.length - 1];
  const last = stat(cls, [lastDate]);

  const isPublicGuest = (DS() === G && G) || (user && user.r === 'tamu');
  const refEnd = ds[ds.length - 1] || TODAY;
  const ns = DS().students.filter(s => cls.includes(s.c) && isActiveStu(s, refEnd));

  // Mengambil data spesifik siswa perlu perhatian (untuk staf terautentikasi)
  const lowStudents = [];
  if (!isPublicGuest) {
    ns.forEach(s => {
      let h = 0, t = 0, a = 0;
      ds.forEach(d => {
        if (!stuOnDate(s, d)) return;
        const att = DS().att[d + '_' + s.c];
        if (att && att.recs[s.id]) {
          t++;
          if (att.recs[s.id] === 'H') h++;
          if (att.recs[s.id] === 'A') a++;
        }
      });
      if (t > 0) {
        const p = h / t;
        if (p < 0.85 || a >= 3) lowStudents.push({ ...s, p: p * 100, t, h, a });
      }
    });
    lowStudents.sort((a, b) => a.p - b.p || b.a - a.a);
  }

  const low = isPublicGuest
    ? (period === '30d' && G ? G.low : ns.filter(s => {
        let h = 0, t = 0;
        ds.forEach(d => {
          const att = DS().att[d + '_' + s.c];
          if (att && att.recs[s.id]) { t++; if (att.recs[s.id] === 'H') h++; }
        });
        return t && h / t < 0.85;
      }).length)
    : lowStudents.length;

  $('#pg').innerHTML = `
    <div class="card" style="margin-bottom:14px;padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
      <span style="font-weight:700;color:var(--pr)">📅 Periode Laporan:</span>
      <select id="dpSel" style="flex:1;min-width:210px;font-weight:bold;border-color:var(--pr)">
        ${opts.map(o => `<option value="${o.val}" ${o.val === period ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
      <span class="pill" style="font-size:12px;background:var(--ln);border:none;color:var(--tx)">${ds[0]} s/d ${ds[ds.length - 1]} (${ds.length} hari aktif)</span>
    </div>

    <div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:14px">
      <div class="card kpi" style="border-top:4px solid var(--pr)"><b id="k1" style="color:var(--pr);font-size:2em">0</b><span style="font-weight:600">Total Siswa Aktif</span></div>
      <div class="card kpi" style="border-top:4px solid var(--g)"><b id="k2" style="color:var(--g);font-size:2em">0</b><span style="font-weight:600">Kehadiran Terakhir</span><span style="font-size:11px;color:var(--mu)">(${lastDate})</span></div>
      <div class="card kpi" style="border-top:4px solid var(--b)"><b id="k3" style="color:var(--b);font-size:2em">0</b><span style="font-weight:600">Rata-rata Hadir</span><span style="font-size:11px;color:var(--mu)">(${esc(periodLabel)})</span></div>
      <div class="card kpi" style="border-top:4px solid var(--r);${!isPublicGuest && lowStudents.length ? 'cursor:pointer;transition:transform 0.2s' : ''}" id="k4card" title="${isPublicGuest ? 'Masuk sebagai staf untuk melihat detail siswa' : 'Klik untuk lihat daftar siswa'}">
        <b id="k4" style="color:var(--r);font-size:2em">0</b>
        <span style="font-weight:600">Perlu Perhatian Khusus</span>
        <span style="font-size:11px;color:var(--mu);${!isPublicGuest && lowStudents.length ? 'text-decoration:underline' : ''}">${isPublicGuest ? 'Kehadiran < 85% (Masuk staf untuk detail)' : (lowStudents.length ? 'Klik untuk lihat daftar ▾' : 'Kehadiran < 85% atau Alpa ≥ 3')}</span>
      </div>
    </div>

    ${!isPublicGuest && lowStudents.length > 0 ? `
    <div class="card sc" id="alertBox" style="margin-bottom:14px;border:1px solid var(--r);background:color-mix(in srgb, var(--r) 4%, transparent);display:none">
      <h3 style="margin:0 0 10px 0;color:var(--r);display:flex;align-items:center;gap:8px">
        <span>⚠️</span> Daftar Siswa Perlu Perhatian Segera
      </h3>
      <table style="background:transparent;border:none">
        <tr style="background:color-mix(in srgb, var(--r) 10%, transparent)"><th style="border:none">Nama Siswa</th><th style="border:none">Kelas</th><th style="border:none">% Hadir</th><th style="border:none">Alpa</th></tr>
        ${lowStudents.slice(0, 10).map(s => `
          <tr style="border-bottom:1px dashed color-mix(in srgb, var(--r) 20%, transparent)">
            <td style="border:none"><b>${esc(s.n)}</b></td>
            <td style="border:none">${esc(s.c)}</td>
            <td style="border:none"><b class="bad">${s.p.toFixed(1)}%</b></td>
            <td style="border:none"><b style="color:var(--r)">${s.a}x</b></td>
          </tr>
        `).join('')}
        ${lowStudents.length > 10 ? `<tr><td colspan="4" style="border:none;text-align:center;font-size:12px;color:var(--mu)">...dan ${lowStudents.length - 10} siswa lainnya. Buka menu Laporan untuk detail lengkap.</td></tr>` : ''}
      </table>
    </div>
    ` : ''}

    <div class="card">
      <div class="ctl">
        <h3 style="margin:0">🏆 Peringkat Kehadiran Kelas</h3>
        <span style="flex:1"></span>
        <div class="seg pr" id="md">
          <button data-m="p" class="on">% Kehadiran</button>
          <button data-m="c">Jumlah Hadir</button>
        </div>
      </div>
      ${all.T === 0 ? `<div style="background:color-mix(in srgb,var(--y) 16%,transparent);border:1px solid var(--y);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px">Belum ada catatan absensi pada periode <b>${esc(periodLabel)}</b>. Pilih bulan lain pada filter di atas untuk melihat riwayat sebelumnya.</div>` : ''}
      <div class="lead"><span id="ld"></span><span style="flex:1"></span><b id="dl" style="color:var(--pr)"></b></div>
      <div class="race" id="race"></div>
      <div class="ctl" style="margin-top:12px">
        <button class="btn" id="pp">⏸ Jeda</button>
        <button class="btn o" id="pl">⟳ Ulang</button>
        <div class="seg pr" id="spd">
          <button data-s="1">1×</button>
          <button data-s="2" class="on">2×</button>
          <button data-s="4">4×</button>
        </div>
        <input type="range" id="sc" min="0" max="${Math.max(0, ds.length - 1)}" step="0.01" value="0">
      </div>
      <div class="cap">Persentase kehadiran = jumlah hadir ÷ seluruh catatan absensi pada periode terpilih. Kelas dengan persentase tertinggi berada di peringkat teratas. Geser slider untuk meninjau perkembangan harian.</div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Tren kehadiran harian (%)</h3><svg id="ln" viewBox="0 0 600 200" width="100%"></svg></div>
      <div class="card"><h3>Komposisi status</h3><svg viewBox="0 0 100 100" width="100%" style="max-height:190px"><g transform="rotate(-90 50 50)" id="dn"></g><text x="50" y="54" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor" id="dt">0%</text></svg><div class="leg">${Object.entries(ST).map(([k, v]) => `<span><i style="background:${v[1]}"></i>${v[0]} ${all[k]}</span>`).join('')}</div></div>
    </div>`;

  if ($('#k4card') && $('#alertBox')) {
    $('#k4card').onclick = () => {
      const box = $('#alertBox');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
      if (box.style.display === 'block') box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  $('#dpSel').onchange = e => {
    window._dashPeriod = e.target.value;
    render();
  };

  cnt($('#k1'), ns.length);
  cnt($('#k2'), last.p, '%', 1);
  cnt($('#k3'), all.p, '%', 1);
  cnt($('#k4'), low);

  // Ranking Chart
  const R = $('#race'), N = ds.length;
  let rows = [], mode = 'p', p = 0, play = N > 1, sp = 2, tl = 0;

  const stuById = {};
  DS().students.forEach(s => stuById[s.id] = s);

  const cumH = cls.map(c => {
    let s = 0;
    return ds.map(d => {
      const a = DS().att[d + '_' + c];
      if (a) for (const k in a.recs) {
        if (stuOnDate(stuById[k], d) && a.recs[k] === 'H') s++;
      }
      return s;
    });
  });

  const cumT = cls.map(c => {
    let s = 0;
    return ds.map(d => {
      const a = DS().att[d + '_' + c];
      if (a) for (const k in a.recs) {
        if (stuOnDate(stuById[k], d)) s++;
      }
      return s;
    });
  });

  const pf = cls.map((c, i) => cumT[i][N - 1] ? cumH[i][N - 1] / cumT[i][N - 1] * 100 : 0);
  const lo = Math.max(0, Math.floor((Math.min(...pf, 100) - 8) / 5) * 5);
  const mxc = Math.max(...cumH.map(a => a[N - 1]), 1);

  const dom = () => {
    if (mode === 'p') {
      const st = 100 - lo > 30 ? 10 : 5, t = [];
      for (let x = lo; x <= 100; x += st) t.push(x);
      return { a: lo, b: 100, t };
    }
    const st = mxc > 400 ? 100 : mxc > 150 ? 50 : mxc > 60 ? 20 : 10;
    const b = Math.ceil(mxc / st) * st, t = [];
    for (let x = 0; x <= b; x += st) t.push(x);
    return { a: 0, b, t };
  };

  let RH = 52;
  const meas = () => { RH = parseFloat(getComputedStyle(R).getPropertyValue('--rh')) || 52; };
  window._rz = () => {
    if (!$('#race')) return;
    meas();
    R.style.height = (26 + cls.length * RH) + 'px';
    frame(p);
  };
  if (!window._rzs) {
    window._rzs = 1;
    addEventListener('resize', () => window._rz && window._rz());
  }

  function build() {
    const dm = dom();
    R.style.setProperty('--rh', cls.length > 10 ? '40px' : '');
    meas();
    R.style.height = (26 + cls.length * RH) + 'px';
    R.innerHTML =
      '<div class="ga">' +
      dm.t.map(v => `<div class="gl" style="--f:${(v - dm.a) / (dm.b - dm.a)}"><span>${v}${mode === 'p' ? '%' : ''}</span></div>`).join('') +
      '</div>' +
      cls.map(c => `<div class="row"><div class="lb"><span class="rk"></span><b>${esc(c)}</b></div><div class="trk"><div class="bar" style="background:linear-gradient(90deg,color-mix(in srgb,${COL[DS().classes.indexOf(c) % COL.length]} 60%,#fff),${COL[DS().classes.indexOf(c) % COL.length]})"></div></div><div class="val"></div></div>`).join('');
    rows = [...R.querySelectorAll('.row')];
  }

  function frame(p) {
    const i = Math.min(Math.floor(p), N - 1), f = p - i, j = Math.min(i + 1, N - 1);
    const I = (a, k) => a[k][i] + (a[k][j] - a[k][i]) * f;
    const dm = dom();
    const v = cls.map((c, k) => {
      const h = I(cumH, k), t = I(cumT, k);
      return { h, pc: t ? h / t * 100 : 0 };
    });
    const val = v.map(x => mode === 'p' ? x.pc : x.h);
    const ord = val.map((x, k) => k).sort((a, b) => val[b] - val[a]);

    ord.forEach((k, r) => {
      const row = rows[k];
      row.classList.toggle('first', r === 0);
      row.style.transform = `translateY(${r * RH}px)`;
      row.querySelector('.rk').textContent = r < 3 ? ['🥇', '🥈', '🥉'][r] : '#' + (r + 1);
      row.querySelector('.bar').style.width = Math.max(.01, Math.min(1, (val[k] - dm.a) / (dm.b - dm.a))) * 100 + '%';
      row.querySelector('.val').innerHTML = mode === 'p'
        ? `${v[k].pc.toFixed(1)}%<small>${Math.round(v[k].h)} hadir</small>`
        : `${Math.round(v[k].h)} hadir<small>${v[k].pc.toFixed(1)}%</small>`;
    });

    const t = ord[0];
    $('#ld').innerHTML = cls.length
      ? `🏆 Peringkat 1: <b>${esc(cls[t])}</b> — ${mode === 'p' ? v[t].pc.toFixed(1) + '%' : Math.round(v[t].h) + ' hadir'} <span class="mu">• Terendah: ${esc(cls[ord[ord.length - 1]])} (${mode === 'p' ? v[ord[ord.length - 1]].pc.toFixed(1) + '%' : Math.round(v[ord[ord.length - 1]].h) + ' hadir'})</span>`
      : 'Belum ada kelas';
    $('#dl').textContent = 'Hari ' + (i + 1) + '/' + N + ' • ' + new Date(ds[i] + 'T00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    $('#sc').value = p;
  }

  const pb = () => $('#pp').textContent = play ? '⏸ Jeda' : '▶ Putar';
  pb();
  build();
  frame(0);

  function loop(t) {
    if (!$('#race') || page !== 'dash') return;
    const dt = Math.min(.05, (t - tl) / 1000 || 0);
    tl = t;
    if (play) {
      p += dt * sp;
      if (p >= N - 1) { p = N - 1; play = false; pb(); }
      frame(p);
    }
    raf = requestAnimationFrame(loop);
  }

  $('#pp').onclick = () => { if (p >= N - 1) p = 0; play = !play; pb(); };
  $('#pl').onclick = () => { p = 0; play = N > 1; pb(); frame(0); };
  document.querySelectorAll('#spd button').forEach(b => b.onclick = () => {
    sp = +b.dataset.s;
    document.querySelectorAll('#spd button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#md button').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    document.querySelectorAll('#md button').forEach(x => x.classList.toggle('on', x === b));
    build();
    frame(p);
  });
  $('#sc').oninput = e => { play = false; pb(); p = +e.target.value; frame(p); };
  raf = requestAnimationFrame(loop);

  // Line Chart (Hanya hari yang ada catatan absensi agar tidak anjlok ke 0% saat libur)
  const validDays = ds.map(d => ({ d, s: stat(cls, [d]) })).filter(x => x.s.T > 0);
  const minVal = validDays.length ? Math.max(0, Math.floor((Math.min(...validDays.map(x => x.s.p), 90) - 5) / 10) * 10) : 60;
  const spanY = Math.max(10, 100 - minVal);
  const ticks = [];
  const stepY = spanY > 40 ? 20 : 10;
  for (let v = minVal; v <= 100; v += stepY) ticks.push(v);

  const pts = validDays.map((x, i) => {
    const px = validDays.length > 1 ? 45 + i * (530 / (validDays.length - 1)) : 310;
    const py = 175 - ((x.s.p - minVal) / spanY) * 155;
    return [px, Math.min(175, Math.max(15, py)), x.s.p, x.d];
  });

  $('#ln').innerHTML =
    ticks.map(v => {
      const y = 175 - ((v - minVal) / spanY) * 155;
      return `<line x1="45" x2="580" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--ln)"/><text x="4" y="${(y + 4).toFixed(1)}" font-size="11" fill="var(--mu)">${v}%</text>`;
    }).join('') +
    (pts.length > 1
      ? `<path class="line" pathLength="1" d="M${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')}"/>`
      : '') +
    pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--pr)"><title>${p[3]}: ${p[2].toFixed(1)}%</title></circle>`).join('') +
    (pts.length ? `<text x="45" y="195" font-size="10" fill="var(--mu)">${pts[0][3].slice(5)}</text><text x="580" y="195" text-anchor="end" font-size="10" fill="var(--mu)">${pts[pts.length - 1][3].slice(5)}</text>` : `<text x="300" y="105" text-anchor="middle" font-size="12" fill="var(--mu)">Belum ada data harian</text>`);

  // Donut Chart
  let off = 0;
  const g = $('#dn'), C = 2 * Math.PI * 38;
  g.innerHTML = Object.entries(ST).map(([k, v]) => {
    const l = all.T ? all[k] / all.T * C : 0;
    const e = `<circle class="seg2" cx="50" cy="50" r="38" fill="none" stroke="${v[1]}" stroke-width="14" stroke-dasharray="0 ${C}" stroke-dashoffset="${-off}" data-l="${l}"/>`;
    off += l;
    return e;
  }).join('');
  setTimeout(() => g.querySelectorAll('circle').forEach(c => c.setAttribute('stroke-dasharray', c.dataset.l + ' ' + C)), 60);
  $('#dt').textContent = all.p.toFixed(0) + '%';
}
