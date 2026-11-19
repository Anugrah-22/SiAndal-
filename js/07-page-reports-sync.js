/**
 * js/07-page-reports-sync.js
 * Halaman Laporan, Generator Excel (.xlsx) dengan grafik native, Backup/Restore JSON,
 * Sinkronisasi Manual, dan Pengaturan Mode Pemeliharaan.
 */

function lap() {
  const cls = vis(), ds = dates();
  const rows = cls.map(c => ({ c, ...stat([c], ds), n: S.students.filter(s => s.c === c).length }));
  $('#pg').innerHTML = `
    <div class="card">
      <div class="ctl"><h3 style="margin:0">Rekap ${ds.length} hari terakhir</h3><span style="flex:1"></span><button class="btn" id="xl">📊 Unduh Excel (.xlsx)</button><button class="btn o" id="cv">⬇ CSV</button></div>
      <div class="sc">
        <table>
          <tr><th>Kelas</th><th>Siswa</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>% Hadir</th></tr>
          ${rows.map(r => `<tr><td><b>${r.c}</b></td><td>${r.n}</td><td>${r.H}</td><td>${r.S}</td><td>${r.I}</td><td>${r.A}</td><td class="${r.p < 90 ? 'bad' : ''}">${r.p.toFixed(1)}%</td></tr>`).join('')}
        </table>
      </div>
    </div>`;
  $('#xl').onclick = exportXl;
  $('#cv').onclick = async () => {
    const csv = 'Kelas,Siswa,Hadir,Sakit,Izin,Alpa,Persen\n' + rows.map(r => [r.c, r.n, r.H, r.S, r.I, r.A, r.p.toFixed(1)].join(',')).join('\n');
    const ok = await dl('rekap-absensi-' + TODAY + '.csv', csv, 'text/csv;charset=utf-8');
    if (!ok) toast('Unduhan tidak tersedia di tampilan ini');
  };
}

function maint() {
  const m = MT(), el = $('#pg');
  el.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>🛠 Mode Pemeliharaan</h3>
      <p style="margin:0 0 10px">Status: <b class="${m.on ? 'bad' : ''}">${m.on ? 'AKTIF (' + (m.mode === 'lock' ? 'akses dikunci' : 'banner pengumuman') + ')' : 'Nonaktif'}</b></p>
      <div class="fg">
        <div><label>Mode</label><select id="mm"><option value="lock" ${m.mode === 'lock' ? 'selected' : ''}>Kunci akses (hanya admin)</option><option value="banner" ${m.mode === 'banner' ? 'selected' : ''}>Banner pengumuman saja</option></select></div>
        <div><label>Perkiraan selesai (opsional)</label><input type="datetime-local" id="me" value="${esc(m.eta || '')}"></div>
      </div>
      <label>Pesan untuk pengguna</label><input id="mg" value="${esc(m.msg || '')}" placeholder="Contoh: Pembaruan sistem, selesai sekitar pukul 15.00">
      <div class="ctl" style="margin-top:12px"><button class="btn" id="mo">${m.on ? '✅ Matikan pemeliharaan' : '🔒 Aktifkan pemeliharaan'}</button><button class="btn o" id="ms">Simpan pesan</button><button class="btn o" id="mk">💾 Backup dulu</button></div>
      <div class="cap">Saat mode kunci aktif, pengunjung, guru, dan kepala sekolah melihat layar pemeliharaan, sedangkan admin tetap bisa masuk. Absensi yang sudah tersimpan di perangkat tetap aman dan akan tersinkron setelah pemeliharaan selesai. Perubahan diteruskan ke perangkat yang online.</div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1fr">
      <div class="card"><h3>📦 Versi &amp; Pembaruan</h3><p style="margin:0 0 10px">Versi aplikasi: <b>v${VER}</b></p><div class="ctl"><button class="btn" id="uc">🔄 Cek pembaruan</button><button class="btn o" id="ux">🧹 Bersihkan cache</button></div><div class="cap">Cek pembaruan bekerja pada versi terpasang (PWA). Bersihkan cache dipakai bila tampilan terasa lama setelah pembaruan. Data absensi tidak terhapus.</div></div>
      <div class="card"><h3>📝 Catatan Perubahan</h3>${CHANGELOG.map(c => `<p style="margin:0 0 8px"><b>v${c[0]}</b> <span class="mu">${c[1]}</span><br>${c[2]}</p>`).join('')}</div>
    </div>`;

  const sv = on => {
    const x = MT();
    x.on = on;
    x.mode = $('#mm').value;
    x.msg = $('#mg').value.trim();
    x.eta = $('#me').value;
    x.ts = Date.now();
    x.q = 1;
    save();
    push();
    applyMt();
    render();
  };
  $('#mo').onclick = async () => {
    const on = !MT().on;
    if (on && $('#mm').value === 'lock' && !await ask('Aktifkan mode kunci? Pengguna selain admin akan melihat layar pemeliharaan.')) return;
    sv(on);
    toast(on ? '🛠 Pemeliharaan diaktifkan' : '✅ Pemeliharaan dimatikan');
  };
  $('#ms').onclick = () => { sv(MT().on); toast('Pesan disimpan'); };
  $('#mk').onclick = backup;
  $('#uc').onclick = async () => {
    try {
      const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (!r) return toast('Pembaruan otomatis hanya aktif pada versi terpasang (PWA)');
      await r.update();
      toast(r.waiting || r.installing ? 'Versi baru ditemukan' : 'Anda sudah memakai versi terbaru');
    } catch (e) { toast('Tidak dapat memeriksa pembaruan'); }
  };
  $('#ux').onclick = async () => {
    try {
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      const g = navigator.serviceWorker && await navigator.serviceWorker.getRegistrations();
      if (g) for (const r of g) await r.unregister();
    } catch (e) {}
    toast('Cache dibersihkan, memuat ulang…');
    setTimeout(() => location.reload(), 700);
  };
}

function sync() {
  $('#pg').innerHTML = `
    <div class="grid2" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <h3>Status Sinkronisasi</h3>
        <p>Koneksi: <b>${navigator.onLine ? 'Online' : 'Offline'}</b><br>Database: <b>${(REM && SESS) ? 'Terhubung (Google Apps Script)' : 'Mode lokal'}</b><br>Antrean belum terkirim: <b>${S.outbox.length}</b></p>
        <button class="btn" id="sn">🔄 Sinkron sekarang</button>
        <p style="color:var(--mu);font-size:12px">Saat offline, absensi disimpan di perangkat dan masuk antrean. Begitu internet terdeteksi, data otomatis dikirim ke Google Sheets.</p>
      </div>
      <div class="card">
        <h3>Akun &amp; Hak Akses</h3>
        <p>Terdapat <b>${S.users.length}</b> akun (${S.users.filter(x => x.r === 'guru').length} guru). Kelola akun, peran, dan kelas yang boleh diakses di menu <b>Pengguna &amp; Akses</b>.</p>
        <button class="btn o" id="rs" style="margin-top:10px">Reset data demo</button>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>💾 Backup &amp; Pemulihan Data</h3>
      <p style="color:var(--mu);margin:0 0 10px">Backup terakhir: <b>${ls.get('siandal_lb') || 'belum pernah'}</b></p>
      <div class="ctl"><button class="btn" id="bx">📊 Unduh Excel Lengkap</button><button class="btn o" id="bj">💾 Backup Data (.json)</button><button class="btn o" id="br">♻ Pulihkan dari Backup</button><input type="file" id="bf" accept=".json,application/json" style="display:none"></div>
      <div style="color:var(--mu);font-size:12px">Excel berisi 4 sheet: <b>Ringkasan</b> (indikator, rekap kelas, grafik batang dan donat), <b>Tren Harian</b> (grafik garis dan kolom), <b>Rekap Siswa</b> (rumus otomatis, penanda siswa perlu perhatian, filter), dan <b>Data Absensi</b> (log lengkap siap difilter). File .json dipakai untuk memulihkan data ke SiAndal.</div>
    </div>`;

  $('#bx').onclick = exportXl;
  $('#bj').onclick = backup;
  $('#br').onclick = () => $('#bf').click();
  $('#bf').onchange = e => e.target.files[0] && restore(e.target.files[0]);
  $('#sn').onclick = async () => {
    if (REM) {
      await pushR();
      toast('Sinkronisasi selesai');
      return sync();
    }
    toast('Database tidak tersedia (mode lokal)');
  };
  $('#rs').onclick = async () => {
    if (REM) return toast('Reset demo dinonaktifkan pada mode database');
    if (await ask('Reset ke data demo? Data siswa, kelas, dan absensi diganti.')) {
      seed();
      S.cts = Date.now();
      S.mq = 1;
      save();
      toast('Data direset');
      render();
    }
  };
}

function buildXlsx(o) {
  const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ser = d => { const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5) + 25569; };
  const NM = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' }, KS = ['H', 'S', 'I', 'A'];
  const S = { HDR: 1, TX: 2, INT: 3, PCT: 4, LB: 5, TTL: 6, SUB: 7, DT: 8, TT: 9, TI: 10, TP: 11 };
  const cls = o.classes, ds = o.dates, stu = o.students.filter(s => cls.includes(s.c)), sm = {};
  stu.forEach(s => sm[s.id] = s);
  const z = () => ({ H: 0, S: 0, I: 0, A: 0 }), bc = {}, bd = {}, bs = {}, log = [];
  cls.forEach(c => bc[c] = z());
  ds.forEach(d => bd[d] = z());
  stu.forEach(s => bs[s.id] = z());
  ds.forEach(d => cls.forEach(c => {
    const a = o.att[d + '_' + c];
    if (!a) return;
    for (const id in a.recs) {
      const s = sm[id];
      if (!s || s.c !== c) continue;
      const k = a.recs[id];
      bc[c][k]++; bd[d][k]++; bs[id][k]++;
      log.push([d, c, s.n, NM[k]]);
    }
  }));
  const tot = x => x.H + x.S + x.I + x.A, pc = x => tot(x) ? x.H / tot(x) : 0;
  const W = (name, opt = {}) => ({ name, opt, rows: {}, merges: [], set(r, c, v, s, f) { (this.rows[r] = this.rows[r] || []).push({ c, v, s, f }); } });
  const cx = (r, c) => L(c) + r;

  function sheetXml(w, drawing) {
    const o2 = w.opt;
    let rows = '';
    Object.keys(w.rows).map(Number).sort((a, b) => a - b).forEach(r => {
      rows += `<row r="${r}"${o2.h && o2.h[r] ? ` ht="${o2.h[r]}" customHeight="1"` : ''}>` +
        w.rows[r].sort((a, b) => a.c - b.c).map(k => {
          const ref = ` r="${cx(r, k.c)}" s="${k.s || 0}"`;
          if (k.f !== undefined) return `<c${ref}${typeof k.v === 'string' ? ' t="str"' : ''}><f>${X(k.f)}</f><v>${X(k.v)}</v></c>`;
          if (typeof k.v === 'number') return `<c${ref}><v>${k.v}</v></c>`;
          if (k.v == null) return `<c${ref}/>`;
          return `<c${ref} t="inlineStr"><is><t xml:space="preserve">${X(k.v)}</t></is></c>`;
        }).join('') + '</row>';
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><tabColor rgb="${o2.tab}"/></sheetPr><sheetViews><sheetView workbookViewId="0"${o2.grid ? '' : ' showGridLines="0"'}>${o2.fz ? `<pane ySplit="${o2.fz}" topLeftCell="A${o2.fz + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${o2.w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${o2.af ? `<autoFilter ref="${o2.af}"/>` : ''}${(o2.cf || []).map((c, i) => `<conditionalFormatting sqref="${c[0]}"><cfRule type="cellIs" dxfId="0" priority="${i + 1}" operator="lessThan"><formula>${c[1]}</formula></cfRule></conditionalFormatting>`).join('')}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape"/>${drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  }

  const pts = (v, fmt) => `<c:numCache><c:formatCode>${fmt || 'General'}</c:formatCode><c:ptCount val="${v.length}"/>${v.map((x, i) => `<c:pt idx="${i}"><c:v>${x}</c:v></c:pt>`).join('')}</c:numCache>`;
  const fill = c => `<c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr>`;

  function chartXml(c) {
    const cat = c.catNum
      ? `<c:cat><c:numRef><c:f>${X(c.catRef)}</c:f>${pts(c.catVals, 'dd/mm/yyyy')}</c:numRef></c:cat>`
      : `<c:cat><c:strRef><c:f>${X(c.catRef)}</c:f><c:strCache><c:ptCount val="${c.catVals.length}"/>${c.catVals.map((x, i) => `<c:pt idx="${i}"><c:v>${X(x)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
    const dl = (f, pct) => `<c:dLbls>${f ? `<c:numFmt formatCode="${f}" sourceLinked="0"/>` : ''}<c:spPr><a:noFill/></c:spPr><c:showLegendKey val="0"/><c:showVal val="${pct ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
    let plot, axes = '';
    const sers = c.series.map((s, i) => {
      const t = `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${X(s.name)}</c:v></c:tx>`, val = `<c:val><c:numRef><c:f>${X(s.ref)}</c:f>${pts(s.vals, c.fmt)}</c:numRef></c:val>`;
      if (c.type === 'bar') return `<c:ser>${t}${fill(s.color)}<c:invertIfNegative val="0"/>${c.labels ? dl(c.fmt) : ''}${cat}${val}</c:ser>`;
      if (c.type === 'line') return `<c:ser>${t}<c:spPr><a:ln w="31750" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/>${fill(s.color)}</c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`;
      return `<c:ser>${t}${c.cols.map((k, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/>${fill(k)}</c:dPt>`).join('')}${dl('0.0%', 1)}${cat}${val}</c:ser>`;
    }).join('');
    if (c.type === 'bar') plot = `<c:barChart><c:barDir val="col"/><c:grouping val="${c.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="70"/>${c.stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="111"/><c:axId val="222"/></c:barChart>`;
    else if (c.type === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>`;
    else plot = `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>`;
    if (c.type !== 'pie') axes = `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${c.catNum ? '<c:numFmt formatCode="dd/mm" sourceLinked="0"/>' : ''}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/>${c.max != null ? `<c:max val="${c.max}"/>` : ''}${c.min != null ? `<c:min val="${c.min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E4E7EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${c.fmt || 'General'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="id-ID" sz="1300" b="1"/><a:t>${X(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D0D5DD"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  }

  const anchor = (a, i) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${a[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a[2]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a[3]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Grafik ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  const heads = (w, r, arr) => arr.forEach((h, i) => w.set(r, i, h, S.HDR));
  const banner = (w, t) => { w.set(1, 0, 'SiAndal – ' + t, S.TTL); w.set(2, 0, o.school + '  •  Periode ' + ds[0] + ' s/d ' + ds[ds.length - 1] + '  •  Dibuat ' + o.now + ' oleh ' + o.who, S.SUB); };

  const k = cls.length, t0 = 13, t1 = 12 + k, tr = 13 + k;
  const w1 = W('Ringkasan', { tab: 'FFC0141C', w: [32, 11, 11, 11, 11, 11, 11, 13, 3, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12], h: { 1: 30, 12: 24 } });
  banner(w1, 'Laporan Absensi Siswa');
  const sum = KS.reduce((a, x) => (a[x] = cls.reduce((s, c) => s + bc[c][x], 0), a), {}), tt = tot(sum);
  const np = stu.filter(s => tot(bs[s.id]) && pc(bs[s.id]) < .85).length, n3 = stu.length;
  w1.set(4, 0, 'INDIKATOR UTAMA', S.SUB);
  [['Total siswa', n3, S.INT], ['Hari data absensi', ds.length, S.INT], ['Total catatan absensi', tt, S.INT, 'G' + tr], ['Rata-rata kehadiran', tt ? sum.H / tt : 0, S.PCT, 'H' + tr], ['Siswa perlu perhatian (<85%)', np, S.INT, `COUNTIF('Rekap Siswa'!I4:I${3 + n3},"<0.85")`]].forEach((r, i) => {
    w1.set(5 + i, 0, r[0], S.LB);
    w1.set(5 + i, 1, r[1], r[2], r[3]);
  });
  w1.set(11, 0, 'REKAP PER KELAS', S.SUB);
  heads(w1, 12, ['Kelas', 'Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total', '% Hadir']);
  cls.forEach((c, i) => {
    const r = 13 + i, x = bc[c];
    w1.set(r, 0, c, S.TX);
    w1.set(r, 1, stu.filter(s => s.c === c).length, S.INT);
    KS.forEach((q, j) => w1.set(r, 2 + j, x[q], S.INT));
    w1.set(r, 6, tot(x), S.INT, `SUM(C${r}:F${r})`);
    w1.set(r, 7, pc(x), S.PCT, `IF(G${r}=0,0,C${r}/G${r})`);
  });
  w1.set(tr, 0, 'TOTAL', S.TT);
  w1.set(tr, 1, n3, S.TI, `SUM(B${t0}:B${t1})`);
  KS.forEach((q, j) => w1.set(tr, 2 + j, sum[q], S.TI, `SUM(${L(2 + j)}${t0}:${L(2 + j)}${t1})`));
  w1.set(tr, 6, tt, S.TI, `SUM(C${tr}:F${tr})`);
  w1.set(tr, 7, tt ? sum.H / tt : 0, S.TP, `IF(G${tr}=0,0,C${tr}/G${tr})`);
  w1.opt.cf = [[`H${t0}:H${t1}`, 0.9]];
  const ch1 = [
    { type: 'bar', title: 'Persentase Kehadiran per Kelas', fmt: '0.0%', labels: 1, min: 0, max: 1, catRef: `Ringkasan!$A$${t0}:$A$${t1}`, catVals: cls, series: [{ name: '% Hadir', ref: `Ringkasan!$H$${t0}:$H$${t1}`, vals: cls.map(c => pc(bc[c])), color: '1F9D4C' }], a: [9, 1, 18, 18] },
    { type: 'pie', title: 'Komposisi Status Kehadiran', fmt: 'General', catRef: 'Ringkasan!$C$12:$F$12', catVals: KS.map(x => NM[x]), cols: ['1F9D4C', '0EA5E9', 'F59E0B', 'EF4444'], series: [{ name: 'Jumlah', ref: `Ringkasan!$C$${tr}:$F$${tr}`, vals: KS.map(x => sum[x]) }], a: [9, 19, 18, 36] }
  ];

  const nd = ds.length;
  const w2 = W('Tren Harian', { tab: 'FF1F9D4C', w: [14, 10, 10, 10, 10, 10, 12, 3, 12, 12, 12, 12, 12, 12, 12, 12, 12], fz: 3, h: { 1: 30 } });
  banner(w2, 'Tren Kehadiran Harian');
  heads(w2, 3, ['Tanggal', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total', '% Hadir']);
  ds.forEach((d, i) => {
    const r = 4 + i, x = bd[d];
    w2.set(r, 0, ser(d), S.DT);
    KS.forEach((q, j) => w2.set(r, 1 + j, x[q], S.INT));
    w2.set(r, 5, tot(x), S.INT, `SUM(B${r}:E${r})`);
    w2.set(r, 6, pc(x), S.PCT, `IF(F${r}=0,0,B${r}/F${r})`);
  });
  w2.opt.cf = [[`G4:G${3 + nd}`, 0.9]];
  const dv = ds.map(ser), R2 = `'Tren Harian'!`;
  const ch2 = [
    { type: 'line', title: 'Tren Persentase Kehadiran', fmt: '0%', min: 0.5, max: 1, catNum: 1, catRef: `${R2}$A$4:$A$${3 + nd}`, catVals: dv, series: [{ name: '% Hadir', ref: `${R2}$G$4:$G$${3 + nd}`, vals: ds.map(d => pc(bd[d])), color: 'C0141C' }], a: [8, 2, 17, 19] },
    { type: 'bar', stacked: 1, title: 'Ketidakhadiran Harian (Sakit, Izin, Alpa)', catNum: 1, catRef: `${R2}$A$4:$A$${3 + nd}`, catVals: dv, series: [['C', 'Sakit', 'S', '0EA5E9'], ['D', 'Izin', 'I', 'F59E0B'], ['E', 'Alpa', 'A', 'EF4444']].map(q => ({ name: q[1], ref: `${R2}$${q[0]}$4:$${q[0]}$${3 + nd}`, vals: ds.map(d => bd[d][q[2]]), color: q[3] })), a: [8, 20, 17, 37] }
  ];

  const w3 = W('Rekap Siswa', { tab: 'FF0EA5E9', grid: 1, w: [6, 30, 10, 9, 9, 9, 9, 9, 11, 18], fz: 3, h: { 1: 30 }, af: `A3:J${3 + n3}` });
  banner(w3, 'Rekap Kehadiran per Siswa');
  heads(w3, 3, ['No', 'Nama Siswa', 'Kelas', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total', '% Hadir', 'Keterangan']);
  stu.forEach((s, i) => {
    const r = 4 + i, x = bs[s.id], p = pc(x);
    w3.set(r, 0, i + 1, S.INT);
    w3.set(r, 1, s.n, S.TX);
    w3.set(r, 2, s.c, S.INT);
    KS.forEach((q, j) => w3.set(r, 3 + j, x[q], S.INT));
    w3.set(r, 7, tot(x), S.INT, `SUM(D${r}:G${r})`);
    w3.set(r, 8, p, S.PCT, `IF(H${r}=0,0,D${r}/H${r})`);
    w3.set(r, 9, p < .85 ? 'Perlu Perhatian' : p < .92 ? 'Waspada' : 'Baik', S.INT, `IF(I${r}<0.85,"Perlu Perhatian",IF(I${r}<0.92,"Waspada","Baik"))`);
  });
  w3.opt.cf = [[`I4:I${3 + n3}`, 0.85]];

  const w4 = W('Data Absensi', { tab: 'FF98A2B3', grid: 1, w: [14, 10, 32, 12], fz: 1, af: `A1:D${1 + log.length}` });
  heads(w4, 1, ['Tanggal', 'Kelas', 'Nama Siswa', 'Status']);
  log.forEach((l, i) => {
    const r = 2 + i;
    w4.set(r, 0, ser(l[0]), S.DT);
    w4.set(r, 1, l[1], S.INT);
    w4.set(r, 2, l[2], S.TX);
    w4.set(r, 3, l[3], S.INT);
  });

  const bd1 = '<border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border>';
  const xf = (f, fi, b, n, al) => `<xf numFmtId="${n || 0}" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${n ? ' applyNumberFormat="1"' : ''}${al ? ` applyAlignment="1"><alignment ${al}/></xf>` : '/>'}`;
  const C = 'horizontal="center" vertical="center"';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FFC0141C"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF667085"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC0141C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF6EE"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${bd1}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${[xf(0, 0, 0), xf(1, 2, 1, 0, C + ' wrapText="1"'), xf(0, 0, 1, 0, 'vertical="center"'), xf(0, 0, 1, 0, C), xf(0, 0, 1, 164, C), xf(3, 3, 1, 0, 'vertical="center"'), xf(2, 0, 0, 0, 'vertical="center"'), xf(4, 0, 0), xf(0, 0, 1, 165, C), xf(3, 4, 1, 0, 'vertical="center"'), xf(3, 4, 1, 0, C), xf(3, 4, 1, 164, C)].join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><b/><color rgb="FFB42318"/></font><fill><patternFill><bgColor rgb="FFFEE4E2"/></patternFill></fill></dxf></dxfs></styleSheet>`;

  const sheets = [[w1, ch1], [w2, ch2], [w3, []], [w4, []]], F = {}, ct = [];
  let cn = 0;
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', HD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  sheets.forEach(([w, cs], i) => {
    const n = i + 1;
    ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    F[`xl/worksheets/sheet${n}.xml`] = sheetXml(w, cs.length);
    if (cs.length) {
      F[`xl/worksheets/_rels/sheet${n}.xml.rels`] = `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RT}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`;
      ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      F[`xl/drawings/drawing${n}.xml`] = `${HD}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${RT}">${cs.map((c, j) => anchor(c.a, j)).join('')}</xdr:wsDr>`;
      F[`xl/drawings/_rels/drawing${n}.xml.rels`] = `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${cs.map((c, j) => {
        cn++;
        F[`xl/charts/chart${cn}.xml`] = chartXml(c);
        ct.push(`<Override PartName="/xl/charts/chart${cn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        return `<Relationship Id="rId${j + 1}" Type="${RT}/chart" Target="../charts/chart${cn}.xml"/>`;
      }).join('')}</Relationships>`;
    }
  });
  F['[Content_Types].xml'] = `${HD}<Types xmlns="http://schemas.openxmlformats.org/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct.join('')}</Types>`;
  F['_rels/.rels'] = `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  F['xl/workbook.xml'] = `${HD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RT}"><bookViews><workbookView/></bookViews><sheets>${sheets.map(([w], i) => `<sheet name="${w.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  F['xl/_rels/workbook.xml.rels'] = `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${RT}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId9" Type="${RT}/styles" Target="styles.xml"/></Relationships>`;
  F['xl/styles.xml'] = styles;
  return zipStore(F);
}

function zipStore(F) {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ c >>> 8; return (c ^ -1) >>> 0; };
  const en = new TextEncoder(), parts = [], cen = [];
  let off = 0;
  const u16 = (v, x) => v.push(x & 255, x >> 8 & 255), u32 = (v, x) => v.push(x & 255, x >> 8 & 255, x >> 16 & 255, x >>> 24);
  Object.keys(F).forEach(n => {
    const nm = en.encode(n), d = en.encode(F[n]), cr = crc(d), h = [];
    u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, 0); u16(h, 0x21); u32(h, cr); u32(h, d.length); u32(h, d.length); u16(h, nm.length); u16(h, 0);
    parts.push(Uint8Array.from(h), nm, d);
    const c = [];
    u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, 0); u16(c, 0x21); u32(c, cr); u32(c, d.length); u32(c, d.length); u16(c, nm.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, off);
    cen.push(Uint8Array.from(c), nm);
    off += h.length + nm.length + d.length;
  });
  let cs = 0;
  cen.forEach(x => cs += x.length);
  const e = [];
  u32(e, 0x06054b50); u16(e, 0); u16(e, 0); u16(e, Object.keys(F).length); u16(e, Object.keys(F).length); u32(e, cs); u32(e, off); u16(e, 0);
  const all = [...parts, ...cen, Uint8Array.from(e)];
  let len = 0;
  all.forEach(x => len += x.length);
  const out = new Uint8Array(len);
  let p = 0;
  all.forEach(x => { out.set(x, p); p += x.length; });
  return out;
}

async function dl(name, data, mime) {
  try {
    const u = URL.createObjectURL(new Blob([data], { type: mime || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
    return true;
  } catch (e) { return false; }
}

async function exportXl() {
  try {
    const b = buildXlsx({
      school: 'SMA-IT ANDALAN International Boarding School',
      classes: vis(),
      dates: dates(),
      students: S.students,
      att: S.att,
      who: user.n,
      now: new Date().toLocaleDateString('id-ID')
    });
    const ok = await dl('SiAndal-Laporan-' + TODAY + '.xlsx', b, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(ok ? '📊 File Excel dibuat' : 'Unduhan dibatalkan atau tidak tersedia');
  } catch (e) { toast('Gagal membuat file Excel'); }
}

async function backup() {
  const ok = await dl('SiAndal-backup-' + TODAY + '.json', JSON.stringify({ app: 'siandal', v: 1, at: new Date().toISOString(), data: S }), 'application/json');
  if (ok) {
    ls.set('siandal_lb', new Date().toLocaleString('id-ID'));
    toast('💾 Backup tersimpan');
    sync();
  }
}

function restore(f) {
  const r = new FileReader();
  r.onload = async () => {
    try {
      const j = JSON.parse(r.result), d = j.data || j;
      if (!d.students || !d.att) throw 0;
      if (!await ask('Pulihkan data dari backup? Data saat ini akan diganti.')) return;
      S = { students: d.students, att: d.att, outbox: Object.keys(d.att), users: S.users, uout: S.uout || [], classes: d.classes || [...CL], cts: Date.now(), mq: 1, mt: S.mt };
      save();
      push();
      toast('✅ Data dipulihkan');
      render();
    } catch (e) { toast('File backup tidak valid'); }
  };
  r.readAsText(f);
}
