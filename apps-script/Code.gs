/**
 * WKN Data Hub — penerima cermin cadangan Google Sheets.
 *
 * Satu arah: Worker (cron) mengirim data ke sini; Sheet ini BUKAN sumber kebenaran. Cara memasang: docs/TAHAP-9-PENERAPAN.md.
 *
 * Properti Skrip (Project Settings → Script properties), diisi sendiri oleh pemilik:
 *   SECRET    rahasia bersama dengan Worker (BACKUP_SECRET). Bila kosong, SEMUA permintaan ditolak.
 *   SHEET_ID  ID Google Sheet tujuan.
 *
 * Keamanan: tidak ada doGet yang mengembalikan data (Sheet memuat nomor HP dan email). Apps Script tidak dapat membaca
 * header permintaan, jadi rahasia dikirim di badan dan dibandingkan dengan waktu konstan. Penulisan diserialisasi dengan LockService.
 */

var MAX_TABLES = 20;
var MAX_ROWS_PER_TABLE = 20000;

/** Perbandingan string dengan waktu konstan; mengembalikan false bila rahasia belum diatur. */
function checkSecret(given, expected) {
  if (typeof expected !== 'string' || expected.length < 16) return false;
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Sel teks berawalan = + - @ diberi awalan apostrof agar tidak dievaluasi sebagai rumus. */
function safeValue(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v === null || v === undefined ? '' : v;
}

function normRows(rows, width) {
  return rows.map(function (r) {
    var out = [];
    for (var i = 0; i < width; i++) out.push(safeValue(r[i]));
    return out;
  });
}

/** Upsert menurut kolom pertama. `values` = isi lembar saat ini (baris pertama judul). Mengembalikan seluruh isi baru. */
function planUpsert(values, header, rows) {
  var width = header.length;
  var out = [header.slice()];
  var index = {};
  for (var i = 1; i < values.length; i++) {
    var row = normRows([values[i]], width)[0];
    index[String(row[0])] = out.length;
    out.push(row);
  }
  var updated = 0, added = 0;
  normRows(rows, width).forEach(function (r) {
    var k = String(r[0]);
    if (Object.prototype.hasOwnProperty.call(index, k)) {
      out[index[k]] = r;
      updated++;
    } else {
      index[k] = out.length;
      out.push(r);
      added++;
    }
  });
  return { values: out, updated: updated, added: added };
}

/** Tambah-bila-belum-ada menurut kolom pertama (untuk transaksi dan audit yang tidak pernah berubah). */
function planAppend(existingKeys, header, rows) {
  var seen = {};
  existingKeys.forEach(function (k) { seen[String(k)] = true; });
  var fresh = [];
  normRows(rows, header.length).forEach(function (r) {
    var k = String(r[0]);
    if (!seen[k]) {
      seen[k] = true;
      fresh.push(r);
    }
  });
  return { fresh: fresh, skipped: rows.length - fresh.length };
}

function validateTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0 || tables.length > MAX_TABLES) throw new Error('tables tidak valid');
  tables.forEach(function (t) {
    if (!t || typeof t.sheet !== 'string' || !t.sheet || t.sheet.length > 50) throw new Error('nama lembar tidak valid');
    if (['replace', 'upsert', 'append'].indexOf(t.mode) < 0) throw new Error('mode tidak valid');
    if (!Array.isArray(t.header) || t.header.length === 0 || t.header.length > 60) throw new Error('judul tidak valid');
    if (!Array.isArray(t.rows) || t.rows.length > MAX_ROWS_PER_TABLE) throw new Error('baris tidak valid');
  });
}

function writeAll(sheet, values) {
  sheet.clearContents();
  if (values.length > 0) sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}

/** Menerapkan tabel ke spreadsheet `ss`; mengembalikan jumlah baris data per lembar. */
function applyTables(ss, tables) {
  validateTables(tables);
  var counts = {};
  tables.forEach(function (t) {
    var sheet = ss.getSheetByName(t.sheet) || ss.insertSheet(t.sheet);
    if (t.mode === 'replace') {
      writeAll(sheet, [t.header.slice()].concat(normRows(t.rows, t.header.length)));
    } else if (t.mode === 'upsert') {
      var cur = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
      writeAll(sheet, planUpsert(cur, t.header, t.rows).values);
    } else {
      var last = sheet.getLastRow();
      if (last === 0) {
        sheet.getRange(1, 1, 1, t.header.length).setValues([t.header.slice()]);
        last = 1;
      }
      var keys = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
      var plan = planAppend(keys, t.header, t.rows);
      if (plan.fresh.length > 0) sheet.getRange(last + 1, 1, plan.fresh.length, t.header.length).setValues(plan.fresh);
    }
    counts[t.sheet] = Math.max(0, sheet.getLastRow() - 1);
  });
  return counts;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var props = PropertiesService.getScriptProperties();
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkSecret(body && body.secret, props.getProperty('SECRET'))) return jsonOut({ ok: false, error: 'unauthorized' });
    lock.waitLock(30000);
    locked = true;
    var sheetId = props.getProperty('SHEET_ID');
    if (!sheetId) return jsonOut({ ok: false, error: 'SHEET_ID belum diatur' });
    var counts = applyTables(SpreadsheetApp.openById(sheetId), body.tables);
    return jsonOut({ ok: true, counts: counts });
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err).slice(0, 200) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** Tidak mengembalikan data apa pun. */
function doGet() {
  return jsonOut({ ok: false, error: 'POST saja' });
}
