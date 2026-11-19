/**
 * js/06-page-master.js
 * Halaman Master Data: Data Siswa (tambah manual + tanggal masuk, impor CSV/Excel, ubah/pindah/naik kelas,
 * mutasi keluar), Data Kelas (termasuk rename cascade), dan Pengguna & Akses.
 */

function moveStudentClass_(st, newClass, moveHistory) {
  const oldClass = st.c;
  if (!oldClass || !newClass || oldClass === newClass) return;
  st.c = newClass;
  if (!moveHistory) return;
  Object.keys(S.att).forEach(k => {
    const i = k.lastIndexOf('_');
    const d = k.slice(0, i);
    const c = k.slice(i + 1);
    if (c === oldClass && S.att[k] && S.att[k].recs && S.att[k].recs[st.id]) {
      const val = S.att[k].recs[st.id];
      delete S.att[k].recs[st.id];
      if (!Object.keys(S.att[k].recs).length) delete S.att[k];
      const nk = d + '_' + newClass;
      if (!S.att[nk]) S.att[nk] = { recs: {}, ts: Date.now() };
      S.att[nk].recs[st.id] = val;
      S.att[nk].ts = Date.now();
      if (!S.outbox.includes(nk)) S.outbox.push(nk);
    }
  });
}

function pruneLocalStudentAtt_(st) {
  Object.keys(S.att).forEach(k => {
    const i = k.lastIndexOf('_');
    const d = k.slice(0, i);
    const a = S.att[k];
    if (!a || !a.recs || !a.recs[st.id]) return;
    if (!stuOnDate(st, d)) {
      delete a.recs[st.id];
      a.ts = Date.now();
      if (!Object.keys(a.recs).length) {
        delete S.att[k];
        S.outbox = S.outbox.filter(x => x !== k);
        S.datt = S.datt || [];
        if (!S.datt.includes(k)) S.datt.push(k);
      } else if (!S.outbox.includes(k)) {
        S.outbox.push(k);
      }
    }
  });
}

function normalizeDateStr_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m1) {
    return m1[3] + '-' + m1[2].padStart(2, '0') + '-' + m1[1].padStart(2, '0');
  }
  if (/^\d{5}$/.test(s)) {
    const n = Number(s);
    if (n > 25569 && n < 73050) {
      const dt = new Date(Math.round((n - 25569) * 864e5));
      return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
    }
  }
  return '';
}

function parseCsvRows_(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const first = lines[0];
  const sep = (first.split(';').length > first.split(',').length) ? ';' : ',';
  return lines.map(line => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  });
}

async function parseXlsxRows_(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('File Excel (.xlsx) tidak valid.');
  const totalEntries = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);
  const entries = {};
  const td = new TextDecoder('utf-8');

  for (let i = 0; i < totalEntries; i++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const fnLen = dv.getUint16(ptr + 28, true);
    const exLen = dv.getUint16(ptr + 30, true);
    const cmLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = td.decode(u8.subarray(ptr + 46, ptr + 46 + fnLen));
    entries[name] = { method, compSize, localOff };
    ptr += 46 + fnLen + exLen + cmLen;
  }

  async function readEntry(name) {
    const e = entries[name];
    if (!e) return null;
    const lFnLen = dv.getUint16(e.localOff + 26, true);
    const lExLen = dv.getUint16(e.localOff + 28, true);
    const dataStart = e.localOff + 30 + lFnLen + lExLen;
    const slice = u8.subarray(dataStart, dataStart + e.compSize);
    if (e.method === 0) return td.decode(slice);
    if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Browser ini belum mendukung pembacaan .xlsx langsung. Silakan simpan file sebagai .csv lalu unggah.');
      }
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      w.write(slice);
      w.close();
      const out = await new Response(ds.readable).arrayBuffer();
      return td.decode(out);
    }
    throw new Error('Metode kompresi Excel tidak didukung.');
  }

  const shared = [];
  const ssXml = await readEntry('xl/sharedStrings.xml');
  if (ssXml) {
    const doc = new DOMParser().parseFromString(ssXml, 'application/xml');
    doc.querySelectorAll('si').forEach(si => {
      let txt = '';
      si.querySelectorAll('t').forEach(t => { txt += t.textContent || ''; });
      shared.push(txt);
    });
  }

  const sheetName = Object.keys(entries).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort()[0];
  if (!sheetName) throw new Error('Sheet pertama tidak ditemukan di file Excel.');
  const shXml = await readEntry(sheetName);
  const shDoc = new DOMParser().parseFromString(shXml, 'application/xml');
  const colIdx = ref => {
    const m = /^([A-Z]+)/i.exec(ref || '');
    if (!m) return 0;
    let n = 0;
    for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].toUpperCase().charCodeAt(i) - 64);
    return n - 1;
  };

  const rows = [];
  shDoc.querySelectorAll('sheetData > row').forEach(rEl => {
    const rowArr = [];
    rEl.querySelectorAll('c').forEach(cEl => {
      const idx = colIdx(cEl.getAttribute('r'));
      const t = cEl.getAttribute('t');
      let val = '';
      if (t === 's') {
        const v = cEl.querySelector('v');
        val = v ? (shared[Number(v.textContent)] || '') : '';
      } else if (t === 'inlineStr') {
        cEl.querySelectorAll('t').forEach(te => { val += te.textContent || ''; });
      } else {
        const v = cEl.querySelector('v');
        val = v ? (v.textContent || '') : '';
      }
      rowArr[idx] = String(val).trim();
    });
    if (rowArr.some(x => x && x.length)) rows.push(rowArr);
  });
  return rows;
}

function downloadStudentTemplateXlsx_() {
  const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const c1 = S.classes[0] || 'X-A';
  const c2 = S.classes[1] || c1;
  const sample = [
    ['Nama Siswa', 'Kelas', 'Tanggal Masuk'],
    ['Ahmad Fauzan', c1, TODAY],
    ['Siti Aisyah', c2, TODAY]
  ];
  const rowsXml = sample.map((r, ri) => {
    const rNum = ri + 1;
    const cells = r.map((val, ci) => {
      const col = String.fromCharCode(65 + ci);
      const st = ri === 0 ? ' s="1"' : '';
      return `<c r="${col}${rNum}"${st} t="inlineStr"><is><t>${X(val)}</t></is></c>`;
    }).join('');
    return `<row r="${rNum}">${cells}</row>`;
  }).join('');

  const HD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const F = {
    '[Content_Types].xml': `${HD}<Types xmlns="http://schemas.openxmlformats.org/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.styles+xml"/></Types>`,
    '_rels/.rels': `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${HD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RT}"><sheets><sheet name="Template Siswa" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RT}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RT}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${HD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC0141C"/></fill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${HD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`
  };
  const bin = zipStore(F);
  dl('Template-Impor-Siswa-SiAndal.xlsx', bin, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function siswa() {
  const adm = user.r === 'admin', el = $('#pg');
  const classOk = n => /^[A-Za-z0-9.\-]{1,12}$/.test(n);
  let tool = 'add'; // 'add' | 'import' | 'promo'
  let q = '', fc = '', fstat = 'active'; // 'active' | 'left' | 'all'
  let editId = null;
  let sel = new Set();
  let impRaw = null, impFile = '', impDefaultDate = TODAY, autoClass = true, skipDup = true;

  function analyzeImport() {
    if (!impRaw) return { valid: [], dups: [], errs: [], newClasses: [] };
    const rows = impRaw;
    let startRow = 0, nameCol = 0, classCol = 1, joinCol = 2;
    const h0 = (rows[0] || []).map(x => String(x || '').trim());
    const idxN = h0.findIndex(x => /^(nama|name|siswa|full_?name|peserta)/i.test(x));
    const idxC = h0.findIndex(x => /^(kelas|class|rombel|tingkat)/i.test(x));
    const idxJ = h0.findIndex(x => /^(tanggal|tgl|masuk|joined|join|mulai)/i.test(x));
    if (idxN !== -1 || idxC !== -1 || idxJ !== -1) {
      startRow = 1;
      nameCol = idxN !== -1 ? idxN : 0;
      classCol = idxC !== -1 ? idxC : (nameCol === 0 ? 1 : 0);
      joinCol = idxJ !== -1 ? idxJ : 2;
    } else if (h0.length >= 3 && /^\d+$/.test(h0[0])) {
      nameCol = 1;
      classCol = 2;
      joinCol = 3;
    }

    const existingSet = new Set(S.students.filter(s => isActiveStu(s)).map(s => s.n.trim().toLowerCase() + '|' + s.c.toLowerCase()));
    const seenInFile = new Set();
    const classLookup = {};
    S.classes.forEach(c => classLookup[c.toLowerCase()] = c);

    const valid = [], dups = [], errs = [], newClassSet = new Set();
    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i] || [];
      const rawName = String(r[nameCol] || '').trim();
      const rawClass = String(r[classCol] || '').trim();
      const rawJoin = String(r[joinCol] || '').trim();
      if (!rawName && !rawClass) continue;
      if (!rawName) { errs.push({ row: i + 1, name: '(kosong)', cls: rawClass || '-', reason: 'Nama siswa kosong' }); continue; }
      if (!rawClass) { errs.push({ row: i + 1, name: rawName, cls: '(kosong)', reason: 'Kolom kelas kosong' }); continue; }

      let joinDate = impDefaultDate || TODAY;
      if (rawJoin) {
        const parsed = normalizeDateStr_(rawJoin);
        if (!parsed) {
          errs.push({ row: i + 1, name: rawName, cls: rawClass, reason: 'Format tanggal masuk tidak valid (gunakan YYYY-MM-DD)' });
          continue;
        }
        joinDate = parsed;
      }

      let targetClass = classLookup[rawClass.toLowerCase()];
      let isNewClass = false;
      if (!targetClass) {
        if (!classOk(rawClass)) {
          errs.push({ row: i + 1, name: rawName, cls: rawClass, reason: 'Format kelas tidak valid (tanpa spasi, maks 12 karakter)' });
          continue;
        }
        if (!autoClass) {
          errs.push({ row: i + 1, name: rawName, cls: rawClass, reason: 'Kelas belum terdaftar di Data Kelas' });
          continue;
        }
        targetClass = rawClass;
        isNewClass = true;
        newClassSet.add(targetClass);
      }

      const key = rawName.toLowerCase() + '|' + targetClass.toLowerCase();
      if (skipDup && (existingSet.has(key) || seenInFile.has(key))) {
        dups.push({ row: i + 1, name: rawName, cls: targetClass });
        continue;
      }
      seenInFile.add(key);
      valid.push({ name: rawName, cls: targetClass, joinDate, isNewClass });
    }
    return { valid, dups, errs, newClasses: [...newClassSet] };
  }

  function draw() {
    const validIds = new Set(S.students.map(s => s.id));
    sel.forEach(id => { if (!validIds.has(id)) sel.delete(id); });

    const activeCount = S.students.filter(s => isActiveStu(s)).length;
    const leftCount = S.students.filter(s => !isActiveStu(s)).length;

    const filtered = S.students.filter(s => {
      const act = isActiveStu(s);
      if (fstat === 'active' && !act) return false;
      if (fstat === 'left' && act) return false;
      if (fc && s.c !== fc) return false;
      if (q && !s.n.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    const impRes = (adm && tool === 'import' && impRaw) ? analyzeImport() : null;

    let adminPanel = '';
    if (adm) {
      let body = '';
      if (tool === 'add') {
        body = S.classes.length
          ? `<div class="ctl" style="margin-bottom:6px">
              <input id="nn" placeholder="Nama siswa baru / pindahan" style="flex:1;min-width:170px">
              <select id="nc">${S.classes.map(c => `<option ${fc === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="mu" style="font-size:12px;white-space:nowrap">Tgl Masuk:</span>
                <input type="date" id="nj" value="${TODAY}" max="${TODAY}" style="width:auto" title="Tanggal masuk siswa">
              </div>
              <button class="btn" id="ad">+ Tambah</button>
            </div>
            <div class="cap" style="margin-top:0">Siswa pindahan hanya muncul pada form absensi mulai dari <b>Tanggal Masuk</b> yang dipilih (tidak dapat diisi absensi pada bulan/tanggal sebelumnya).</div>`
          : `<div class="bad">Belum ada kelas. Buat kelas terlebih dahulu di menu Data Kelas.</div>`;
      } else if (tool === 'import') {
        body = `
          <div class="ctl">
            <button class="btn o" id="tplXl">⬇ Template Excel (.xlsx)</button>
            <button class="btn o" id="tplCsv">⬇ Template CSV (.csv)</button>
            <button class="btn" id="pickImp">📂 Pilih File CSV / Excel</button>
            <input type="file" id="impInp" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mu" style="font-size:12px;white-space:nowrap">Tgl Masuk Default:</span>
              <input type="date" id="impDt" value="${impDefaultDate}" max="${TODAY}" style="width:auto">
            </div>
            ${impFile ? `<span class="mu" style="font-size:12px">File: <b>${esc(impFile)}</b></span>` : ''}
          </div>
          <div class="chk" style="margin-bottom:8px">
            <label><input type="checkbox" id="optAutoC" ${autoClass ? 'checked' : ''}> Buat kelas baru otomatis jika belum ada</label>
            <label><input type="checkbox" id="optSkipD" ${skipDup ? 'checked' : ''}> Lewati duplikat (nama &amp; kelas sama)</label>
          </div>
          <div class="cap" style="margin-top:0">Format kolom file: <b>Nama Siswa</b>, <b>Kelas</b>, dan opsional <b>Tanggal Masuk</b> (<code>YYYY-MM-DD</code>). Jika kolom tanggal kosong, digunakan <i>Tgl Masuk Default</i>.</div>
          ${impRes ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--ln)">
              <div class="ctl">
                <span class="pill">✅ ${impRes.valid.length} siap diimpor</span>
                ${impRes.dups.length ? `<span class="pill">⏭ ${impRes.dups.length} duplikat dilewati</span>` : ''}
                ${impRes.errs.length ? `<span class="pill" style="color:var(--r)">⚠ ${impRes.errs.length} baris bermasalah</span>` : ''}
                <span style="flex:1"></span>
                ${impRes.valid.length ? `<button class="btn" id="doImp">📥 Impor ${impRes.valid.length} Siswa</button>` : ''}
                <button class="btn o" id="clrImp">Batal</button>
              </div>
              ${impRes.errs.length ? `<div style="font-size:12px;color:var(--r);margin-bottom:8px">${impRes.errs.slice(0, 5).map(e => `Baris ${e.row} (${esc(e.name)} / ${esc(e.cls)}): ${esc(e.reason)}`).join('<br>')}${impRes.errs.length > 5 ? `<br>...dan ${impRes.errs.length - 5} baris bermasalah lainnya.` : ''}</div>` : ''}
              ${impRes.valid.length ? `
                <div class="sc" style="max-height:220px">
                  <table>
                    <tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>Tgl Masuk</th></tr>
                    ${impRes.valid.slice(0, 15).map((v, idx) => `<tr><td>${idx + 1}</td><td>${esc(v.name)}</td><td><b>${esc(v.cls)}</b> ${v.isNewClass ? '<span class="pill" style="font-size:11px">kelas baru</span>' : ''}</td><td>${v.joinDate}</td></tr>`).join('')}
                    ${impRes.valid.length > 15 ? `<tr><td colspan="4" class="mu">...dan ${impRes.valid.length - 15} siswa lainnya siap diimpor.</td></tr>` : ''}
                  </table>
                </div>` : ''}
            </div>` : ''}`;
      } else if (tool === 'promo') {
        const targetOpts = S.classes.map(c => `<option value="${c}">${c}</option>`).join('');
        body = `
          <div class="fg" style="margin-bottom:10px">
            <div>
              <label style="margin-top:0">1. Pilih cepat satu kelas (opsional)</label>
              <select id="pmFrom">
                <option value="">-- Pilih kelas untuk mencentang otomatis (${sel.size} terpilih) --</option>
                ${S.classes.map(c => `<option value="${c}">Pilih semua siswa aktif kelas ${c} (${S.students.filter(s => s.c === c && isActiveStu(s)).length} siswa)</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="margin-top:0">2. Pindahkan ke kelas tujuan</label>
              <select id="pmTo">${targetOpts}</select>
            </div>
          </div>
          <div class="chk" style="margin-bottom:10px">
            <label><input type="checkbox" id="pmHist"> Pindahkan juga riwayat absensi lama ke kelas baru (kosongkan jika kenaikan kelas semester baru)</label>
          </div>
          <div class="ctl" style="margin-bottom:0">
            <button class="btn" id="doPromo">🔄 Pindahkan ${sel.size} Siswa Terpilih</button>
            ${sel.size ? `<button class="btn o" id="clrSel">Kosongkan Pilihan (${sel.size})</button>` : ''}
            <span class="mu" style="font-size:12px">Centang siswa pada tabel di bawah atau pilih kelas asal di atas.</span>
          </div>`;
      }

      adminPanel = `
        <div class="card" style="margin-bottom:14px">
          <div class="ctl">
            <div class="seg pr" id="stTool">
              <button data-t="add" class="${tool === 'add' ? 'on' : ''}">+ Tambah Manual</button>
              <button data-t="import" class="${tool === 'import' ? 'on' : ''}">📥 Impor File (CSV/Excel)</button>
              <button data-t="promo" class="${tool === 'promo' ? 'on' : ''}">🎓 Pindah / Naik Kelas</button>
            </div>
          </div>
          ${body}
        </div>`;
    }

    const allFilteredSelected = filtered.length > 0 && filtered.every(s => sel.has(s.id));

    el.innerHTML = `
      ${adminPanel}
      <div class="card sc">
        <div class="ctl">
          <input id="sq" value="${esc(q)}" placeholder="🔍 Cari nama siswa..." style="flex:1;min-width:150px">
          <select id="fc">
            <option value="">Semua Kelas</option>
            ${S.classes.map(c => `<option value="${c}" ${fc === c ? 'selected' : ''}>${c} (${S.students.filter(s => s.c === c && isActiveStu(s)).length})</option>`).join('')}
          </select>
          <select id="fstat">
            <option value="active" ${fstat === 'active' ? 'selected' : ''}>Siswa Aktif (${activeCount})</option>
            <option value="left" ${fstat === 'left' ? 'selected' : ''}>Mutasi Keluar (${leftCount})</option>
            <option value="all" ${fstat === 'all' ? 'selected' : ''}>Semua (${S.students.length})</option>
          </select>
        </div>
        <table>
          <tr>
            ${adm ? `<th style="width:32px"><input type="checkbox" id="chkAll" ${allFilteredSelected ? 'checked' : ''} title="Pilih semua yang tampil"></th>` : ''}
            <th>Nama</th>
            <th>Kelas</th>
            <th>Tgl Masuk</th>
            <th>Status</th>
            <th>Kehadiran 30 hari</th>
            ${adm ? '<th>Aksi</th>' : ''}
          </tr>
          ${filtered.map(s => {
            let h = 0, t = 0;
            dates().forEach(d => {
              if (!stuOnDate(s, d)) return;
              const a = S.att[d + '_' + s.c];
              if (a && a.recs[s.id]) { t++; if (a.recs[s.id] === 'H') h++; }
            });
            const p = t ? h / t * 100 : 0;
            const act = isActiveStu(s);
            if (adm && editId === s.id) {
              return `
                <tr style="background:color-mix(in srgb,var(--pr) 6%,transparent)">
                  <td><input type="checkbox" class="schk" data-id="${s.id}" ${sel.has(s.id) ? 'checked' : ''}></td>
                  <td><input id="edN" value="${esc(s.n)}" style="min-width:140px"></td>
                  <td><select id="edC" style="width:auto">${S.classes.map(c => `<option value="${c}" ${s.c === c ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
                  <td><input type="date" id="edJ" value="${esc(s.j || '')}" max="${TODAY}" style="width:auto" title="Tanggal masuk (kosongkan jika sejak awal)"></td>
                  <td><input type="date" id="edL" value="${esc(s.l || '')}" max="${TODAY}" style="width:auto" title="Tanggal mutasi keluar (kosongkan jika masih aktif)"></td>
                  <td><label style="margin:0;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx)"><input type="checkbox" id="edH" checked style="width:auto"> Pindahkan riwayat jika ganti kelas</label></td>
                  <td style="white-space:nowrap"><button class="btn" id="edSave">Simpan</button> <button class="btn o" id="edCancel">Batal</button></td>
                </tr>`;
            }
            return `
              <tr style="${!act ? 'opacity:.75' : ''}">
                ${adm ? `<td><input type="checkbox" class="schk" data-id="${s.id}" ${sel.has(s.id) ? 'checked' : ''}></td>` : ''}
                <td>${esc(s.n)}</td>
                <td><b>${esc(s.c)}</b></td>
                <td class="mu" style="font-size:12px">${s.j ? esc(s.j) : 'Awal'}</td>
                <td>${act ? '<span class="pill" style="color:var(--g);font-size:11px">Aktif</span>' : `<span class="pill" style="color:var(--y);font-size:11px">Keluar ${esc(s.l)}</span>`}</td>
                <td class="${p < 85 && t ? 'bad' : ''}">${t ? p.toFixed(0) + '%' : '–'}</td>
                ${adm ? `<td style="white-space:nowrap">
                  <button class="btn o" data-e="${s.id}">✏ Ubah</button>
                  ${act
                    ? `<button class="btn o" data-lv="${s.id}" title="Tandai siswa pindah/keluar mulai hari ini tanpa menghapus riwayat absensi lama">📤 Keluar</button>`
                    : `<button class="btn o" data-re="${s.id}" title="Aktifkan kembali siswa ini">↩ Aktifkan</button>`}
                  <button class="btn o" data-d="${s.id}" style="color:var(--r)" title="Hapus permanen data siswa">Hapus</button>
                </td>` : ''}
              </tr>`;
          }).join('') || `<tr><td colspan="${adm ? 7 : 5}" class="mu">Tidak ada data siswa yang sesuai.</td></tr>`}
        </table>
      </div>`;

    $('#sq').oninput = e => {
      q = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const inp = $('#sq');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    };
    $('#fc').onchange = e => { fc = e.target.value; draw(); };
    $('#fstat').onchange = e => { fstat = e.target.value; draw(); };

    if (adm) {
      document.querySelectorAll('#stTool button').forEach(b => b.onclick = () => {
        tool = b.dataset.t;
        draw();
      });

      if (tool === 'add' && $('#ad')) {
        const addOne = () => {
          const n = $('#nn').value.trim();
          const j = $('#nj').value || TODAY;
          if (!n) return toast('Nama siswa wajib diisi');
          S.students.push({ id: 's' + Date.now(), n, c: $('#nc').value, j, l: '' });
          S.cts = Date.now();
          S.mq = 1;
          save();
          push();
          toast('✅ Siswa ditambahkan (masuk ' + j + ')');
          draw();
        };
        $('#ad').onclick = addOne;
        $('#nn').onkeydown = e => { if (e.key === 'Enter') addOne(); };
      }

      if (tool === 'import') {
        $('#tplXl').onclick = downloadStudentTemplateXlsx_;
        $('#tplCsv').onclick = () => {
          const c1 = S.classes[0] || 'X-A', c2 = S.classes[1] || c1;
          const csv = 'Nama Siswa,Kelas,Tanggal Masuk\nAhmad Fauzan,' + c1 + ',' + TODAY + '\nSiti Aisyah,' + c2 + ',' + TODAY + '\n';
          dl('Template-Impor-Siswa-SiAndal.csv', csv, 'text/csv;charset=utf-8');
        };
        $('#impDt').onchange = e => { impDefaultDate = e.target.value || TODAY; draw(); };
        $('#pickImp').onclick = () => $('#impInp').click();
        $('#optAutoC').onchange = e => { autoClass = e.target.checked; draw(); };
        $('#optSkipD').onchange = e => { skipDup = e.target.checked; draw(); };
        $('#impInp').onchange = async e => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          try {
            impFile = f.name;
            if (/\.xlsx$/i.test(f.name)) {
              const buf = await f.arrayBuffer();
              impRaw = await parseXlsxRows_(buf);
            } else {
              const txt = await f.text();
              impRaw = parseCsvRows_(txt);
            }
            if (!impRaw || !impRaw.length) {
              impRaw = null;
              toast('File kosong atau tidak terbaca');
            }
            draw();
          } catch (err) {
            impRaw = null;
            toast(err.message || 'Gagal membaca file');
            draw();
          }
        };
        if ($('#clrImp')) $('#clrImp').onclick = () => { impRaw = null; impFile = ''; draw(); };
        if ($('#doImp')) $('#doImp').onclick = () => {
          const res = analyzeImport();
          if (!res.valid.length) return toast('Tidak ada data valid untuk diimpor');
          res.newClasses.forEach(nc => {
            if (!S.classes.some(x => x.toLowerCase() === nc.toLowerCase())) S.classes.push(nc);
          });
          const baseTs = Date.now();
          res.valid.forEach((v, idx) => {
            S.students.push({ id: 's' + baseTs + '_' + idx, n: v.name, c: v.cls, j: v.joinDate, l: '' });
          });
          S.cts = Date.now();
          S.mq = 1;
          save();
          push();
          toast('✅ ' + res.valid.length + ' siswa berhasil diimpor');
          impRaw = null;
          impFile = '';
          draw();
        };
      }

      if (tool === 'promo') {
        $('#pmFrom').onchange = e => {
          const c = e.target.value;
          if (!c) return;
          sel = new Set(S.students.filter(s => s.c === c && isActiveStu(s)).map(s => s.id));
          fc = c;
          draw();
        };
        if ($('#clrSel')) $('#clrSel').onclick = () => { sel.clear(); draw(); };
        $('#doPromo').onclick = async () => {
          if (!sel.size) return toast('Pilih minimal 1 siswa terlebih dahulu');
          const toC = $('#pmTo').value;
          const mvH = $('#pmHist').checked;
          const targets = S.students.filter(s => sel.has(s.id) && s.c !== toC);
          if (!targets.length) return toast('Semua siswa terpilih sudah berada di kelas ' + toC);
          if (!await ask('Pindahkan ' + targets.length + ' siswa ke kelas ' + toC + '?')) return;
          targets.forEach(st => moveStudentClass_(st, toC, mvH));
          S.cts = Date.now();
          S.mq = 1;
          save();
          push();
          sel.clear();
          fc = toC;
          toast('✅ ' + targets.length + ' siswa dipindahkan ke ' + toC);
          draw();
        };
      }

      if ($('#chkAll')) {
        $('#chkAll').onchange = e => {
          if (e.target.checked) filtered.forEach(s => sel.add(s.id));
          else filtered.forEach(s => sel.delete(s.id));
          draw();
        };
      }
      el.querySelectorAll('.schk').forEach(cb => cb.onchange = e => {
        if (e.target.checked) sel.add(cb.dataset.id);
        else sel.delete(cb.dataset.id);
        draw();
      });

      el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
        editId = b.dataset.e;
        draw();
      });
      if ($('#edCancel')) $('#edCancel').onclick = () => { editId = null; draw(); };
      if ($('#edSave')) $('#edSave').onclick = () => {
        const st = S.students.find(x => x.id === editId);
        if (!st) { editId = null; return draw(); }
        const newName = $('#edN').value.trim();
        const newClass = $('#edC').value;
        const newJoined = $('#edJ').value || '';
        const newLeft = $('#edL').value || '';
        const mvHist = $('#edH').checked;
        if (!newName) return toast('Nama siswa tidak boleh kosong');
        if (newJoined && newLeft && newLeft < newJoined) {
          return toast('Tanggal keluar tidak boleh lebih awal dari tanggal masuk');
        }
        st.n = newName;
        st.j = newJoined;
        st.l = newLeft;
        if (st.c !== newClass) {
          moveStudentClass_(st, newClass, mvHist);
        }
        pruneLocalStudentAtt_(st);
        editId = null;
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        toast('✅ Data siswa diperbarui');
        draw();
      };

      el.querySelectorAll('[data-lv]').forEach(b => b.onclick = async () => {
        const st = S.students.find(s => s.id === b.dataset.lv);
        if (!st) return;
        if (!await ask('Tandai ' + st.n + ' (' + st.c + ') mutasi keluar per tanggal ' + TODAY + '? Riwayat absensi sebelumnya tetap tersimpan, dan nama siswa tidak lagi muncul di absensi setelah tanggal ini.')) return;
        st.l = TODAY;
        pruneLocalStudentAtt_(st);
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        toast('📤 Siswa ditandai mutasi keluar (' + TODAY + ')');
        draw();
      });

      el.querySelectorAll('[data-re]').forEach(b => b.onclick = async () => {
        const st = S.students.find(s => s.id === b.dataset.re);
        if (!st) return;
        if (!await ask('Aktifkan kembali ' + st.n + ' (' + st.c + ')?')) return;
        st.l = '';
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        toast('✅ Siswa diaktifkan kembali');
        draw();
      });

      el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
        const st = S.students.find(s => s.id === b.dataset.d);
        if (!st) return;
        if (!await ask('Hapus permanen siswa ' + st.n + ' (' + st.c + ')? Gunakan tombol "Keluar" jika hanya ingin menghentikan absensi mulai hari ini tanpa menghapus riwayat.')) return;
        (S.dst = S.dst || []).push(st.id);
        S.students = S.students.filter(s => s.id !== st.id);
        sel.delete(st.id);
        S.cts = Date.now();
        S.mq = 1;
        save();
        push();
        toast('Siswa dihapus permanen');
        draw();
      });
    }
  }
  draw();
}

function kelas() {
  const el = $('#pg');
  const cnt = c => S.students.filter(s => s.c === c && isActiveStu(s)).length;
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
          <tr><th>Kelas</th><th>Siswa Aktif</th><th>Guru dengan akses</th><th></th></tr>
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
      const allInCls = S.students.filter(s => s.c === a).length;
      if (allInCls) return toast('Masih ada ' + allInCls + ' data siswa di kelas ini. Hapus atau pindahkan dulu.');
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
