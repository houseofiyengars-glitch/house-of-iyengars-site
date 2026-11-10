/**
 * House of Iyengars(TM) - Order register and Order ID service  (Version 2)
 * Google Apps Script web app, attached to the "House of Iyengars Orders" Google Sheet.
 *
 * FINAL ORDER NUMBERING SYSTEM - do not change the format or the logic without approval.
 *   Prefix   R = rice only, S = sweets only, M = rice and sweets together
 *   Number   starts at 17 for each prefix every day and keeps counting (17, 18 ... 35, 36, 37 ...)
 *   Reset    every day at 12:00 AM Indian Standard Time (Asia/Kolkata), automatically
 *   Format   PREFIX + NUMBER + "-" + DDMMYY + "-" + HHMMSS      e.g.  R17-071126-140812
 *
 * How it works
 *  - The counter for a prefix lives under a key that contains the IST date (ctr_R_20261107).
 *    A new IST date means a new key, so counting restarts at 17 by itself. No timer is needed.
 *  - Every write takes a script-wide lock, so two customers can never get the same number.
 *  - The number is also checked against the Orders sheet, so a number already used that
 *    day is never issued again even if the stored counter were lost.
 *  - Each website request has a unique request id. Repeating it (double tap, retry) returns
 *    the original order ID and uses no new number.
 *  - Only the Netlify order function can call this script: every request must carry the
 *    secret stored in Script properties as API_SECRET.
 *  - No customer name, phone number or address is ever sent here or stored here.
 *  - Nothing in this script deletes or clears an order row. Existing Order IDs are never changed.
 *
 * One-time setup: see docs/DEPLOY.md. In short, paste this file, set the API_SECRET script
 * property, run setup() once, then Deploy > New deployment > Web app.
 */

var TZ = 'Asia/Kolkata';
var START_NUMBER = 17;
var ORDERS = 'Orders';
var AUDIT = 'Audit';
var HEADERS = ['Order ID', 'Created (IST)', 'Category', 'Number', 'Day (IST)', 'Request ID', 'PR reference',
  'Items', 'Items total (Rs)', 'Delivery fee note', 'Delivery date', 'Order status', 'Payment status',
  'WhatsApp handoff', 'Handoff updated (IST)', 'Notes'];
var COL = { ID: 1, CREATED: 2, CAT: 3, NUM: 4, DAY: 5, RID: 6, PR: 7, ITEMS: 8, TOTAL: 9, DELIVERY: 10, DDATE: 11,
  STATUS: 12, PAYMENT: 13, HANDOFF: 14, HUPD: 15, NOTES: 16 };
var LOCKED_COLUMNS = 11;               // columns A to K are written by the script only
var ORDER_STATUSES = ['New', 'Preparing', 'Out for delivery', 'Delivered', 'Cancelled'];
var PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Refunded'];
var HANDOFF_STATUSES = ['Pending', 'Opened', 'Customer confirmation unavailable', 'Received on WhatsApp'];
var HANDOFF_TIMEOUT_MIN = 30;

function now_() { return new Date(); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function stamp_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm:ss'); }
function safe_(s) { s = String(s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

// Open the web app address in a browser to check that it is running. Shows nothing private.
function doGet(e) {
  return json_({ ok: true, service: 'House of Iyengars order register', status: 'running' });
}

function doPost(e) {
  var req = parse_(e);
  if (!req.ok) return json_(req);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { return json_({ ok: false, error: 'busy' }); }
  try {
    if (req.action === 'create') return json_(createOrder_(req, now_()));
    if (req.action === 'handoff') return json_(handoff_(req, now_()));
    return json_({ ok: true, pong: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

function parse_(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (!raw || raw.length > 20000) return { ok: false, error: 'bad request' };
  var b;
  try { b = JSON.parse(raw); } catch (x) { return { ok: false, error: 'bad request' }; }
  var secret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!secret) return { ok: false, error: 'not configured' };
  if (String(b.secret || '') !== secret) return { ok: false, error: 'unauthorized' };
  var action = String(b.action || '');
  if (action === 'ping') return { ok: true, action: 'ping' };
  var rid = String(b.requestId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(rid)) return { ok: false, error: 'bad request id' };
  if (action === 'handoff') {
    var oid = String(b.orderId || '');
    if (!/^[RSM]\d+-\d{6}-\d{6}$/.test(oid) || b.status !== 'Opened') return { ok: false, error: 'bad handoff' };
    return { ok: true, action: 'handoff', rid: rid, orderId: oid };
  }
  if (action !== 'create') return { ok: false, error: 'bad action' };
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 40) return { ok: false, error: 'bad items' };
  var rice = false, sweets = false, parts = [], total = 0, bad = false;
  b.items.forEach(function (it) {
    var q = Math.floor(Number(it && it.q)), p = Math.floor(Number(it && it.p));
    if (!(q >= 1 && q <= 100) || !(p >= 1 && p <= 100000)) { bad = true; return; }
    if (Number(it.g) === 1) sweets = true; else rice = true;
    parts.push(String(it.n || '').slice(0, 60) + ' x' + q);
    total += q * p;
  });
  if (bad) return { ok: false, error: 'bad items' };
  var dd = String(b.deliveryDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) return { ok: false, error: 'bad date' };
  var pr = b.prRef ? String(b.prRef) : '';
  if (pr && !/^PR-[A-Z2-9]{6}$/.test(pr)) return { ok: false, error: 'bad reference' };
  return { ok: true, action: 'create', rid: rid, cat: (rice && sweets) ? 'M' : (sweets ? 'S' : 'R'),
    items: parts.join('; '), total: total, delivery: String(b.delivery || '').slice(0, 80), deliveryDate: dd, pr: pr };
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ORDERS);
  if (!sh) {
    sh = ss.insertSheet(ORDERS);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}
function audit_(who, cell, oldV, newV, note) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(AUDIT);
  if (!a) { a = ss.insertSheet(AUDIT); a.appendRow(['Time (IST)', 'Who', 'Sheet', 'Cell', 'Old value', 'New value', 'Note']); a.setFrozenRows(1); }
  a.appendRow([stamp_(now_()), who, ORDERS, cell, String(oldV == null ? '' : oldV), String(newV == null ? '' : newV), note || '']);
}
function findRow_(sh, col, text) {
  var hit = sh.createTextFinder(text).matchEntireCell(true).findNext();
  return (hit && hit.getColumn() === col) ? hit.getRow() : 0;
}

// Highest number already stored today for this prefix (looks at the most recent 500 orders).
function maxToday_(sh, cat, day) {
  var last = sh.getLastRow();
  var m = START_NUMBER - 1;
  if (last < 2) return m;
  var from = Math.max(2, last - 499);
  var v = sh.getRange(from, COL.CAT, last - from + 1, 3).getValues();
  v.forEach(function (r) {
    if (r[0] === cat && String(r[2]) === day) { var n = Number(r[1]); if (n > m) m = n; }
  });
  return m;
}

function createOrder_(r, now) {
  var sh = sheet_();

  // The same request again (double tap or retry): return the original order, use no new number.
  var row = findRow_(sh, COL.RID, r.rid);
  if (!row && r.pr) row = findRow_(sh, COL.PR, r.pr);
  if (row) {
    if (r.pr && !sh.getRange(row, COL.PR).getValue()) {
      sh.getRange(row, COL.PR).setValue(r.pr);
      audit_('system', 'G' + row, '', r.pr, 'PR reference linked to registered order');
    }
    return { ok: true, id: String(sh.getRange(row, COL.ID).getValue()), createdIst: String(sh.getRange(row, COL.CREATED).getValue()), repeat: true };
  }

  // Date and time always come from Indian Standard Time, never from the server's own timezone.
  var day = Utilities.formatDate(now, TZ, 'yyyyMMdd');
  var ddmmyy = Utilities.formatDate(now, TZ, 'ddMMyy');
  var hms = Utilities.formatDate(now, TZ, 'HHmmss');
  var created = stamp_(now);

  var props = PropertiesService.getScriptProperties();
  var key = 'ctr_' + r.cat + '_' + day;
  var next = parseInt(props.getProperty(key), 10);
  if (!(next >= START_NUMBER)) next = START_NUMBER;
  next = Math.max(next, maxToday_(sh, r.cat, day) + 1);

  var id = r.cat + next + '-' + ddmmyy + '-' + hms;
  while (findRow_(sh, COL.ID, id)) { next++; id = r.cat + next + '-' + ddmmyy + '-' + hms; }

  sh.appendRow([id, created, r.cat, next, day, r.rid, r.pr, safe_(r.items), r.total, safe_(r.delivery), r.deliveryDate,
    ORDER_STATUSES[0], PAYMENT_STATUSES[0], HANDOFF_STATUSES[0], created, '']);
  SpreadsheetApp.flush();
  props.setProperty(key, String(next + 1));
  return { ok: true, id: id, createdIst: created };
}

// Pending -> Opened, only for the customer's own request, and never backwards.
function handoff_(r, now) {
  var sh = sheet_();
  var row = findRow_(sh, COL.ID, r.orderId);
  if (!row) return { ok: false, error: 'not found' };
  if (String(sh.getRange(row, COL.RID).getValue()) !== r.rid) return { ok: false, error: 'mismatch' };
  var cur = String(sh.getRange(row, COL.HANDOFF).getValue());
  if (cur !== HANDOFF_STATUSES[0]) return { ok: true, status: cur };
  sh.getRange(row, COL.HANDOFF).setValue('Opened');
  sh.getRange(row, COL.HUPD).setValue(stamp_(now));
  audit_('system', 'N' + row, cur, 'Opened', 'Customer tapped Continue to WhatsApp');
  return { ok: true, status: 'Opened' };
}

// Runs every 30 minutes. We can never see whether the customer pressed Send, so an order that
// stays "Opened" is marked "Customer confirmation unavailable" until you set "Received on WhatsApp".
function sweepHandoff() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(), last = sh.getLastRow();
    if (last < 2) return 0;
    var from = Math.max(2, last - 499), n = 0, t = now_().getTime();
    var v = sh.getRange(from, COL.HANDOFF, last - from + 1, 2).getValues();
    v.forEach(function (r, i) {
      if (r[0] !== 'Opened') return;
      var when = Date.parse(String(r[1]).replace(' ', 'T') + '+05:30');
      if (isNaN(when) || t - when < HANDOFF_TIMEOUT_MIN * 60000) return;
      var row = from + i;
      sh.getRange(row, COL.HANDOFF).setValue(HANDOFF_STATUSES[2]);
      sh.getRange(row, COL.HUPD).setValue(stamp_(now_()));
      audit_('system', 'N' + row, 'Opened', HANDOFF_STATUSES[2], 'No confirmation after ' + HANDOFF_TIMEOUT_MIN + ' minutes');
      n++;
    });
    return n;
  } finally { lock.releaseLock(); }
}

// Logs every manual change to the status and notes columns (installable trigger).
function onEditAudit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== ORDERS || e.range.getRow() < 2) return;
  var who = '';
  try { who = e.user && e.user.getEmail ? e.user.getEmail() : ''; } catch (x) { who = ''; }
  audit_(who || 'unknown', e.range.getA1Notation(), e.oldValue, e.value, 'Manual edit');
}

// Copies the whole spreadsheet to a private Drive folder once a week. Old copies are kept.
function backupWeekly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folders = DriveApp.getFoldersByName('House of Iyengars Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('House of Iyengars Backups');
  DriveApp.getFileById(ss.getId()).makeCopy('Orders backup ' + Utilities.formatDate(now_(), TZ, 'yyyy-MM-dd'), folder);
}

// Run this ONCE after pasting the script (menu: Run > setup). It prepares the sheets,
// the status dropdowns, the column protection and the automatic jobs.
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  var sh = sheet_();
  audit_('system', '', '', '', 'Setup run');
  var audit = ss.getSheetByName(AUDIT);

  function dropdown(col, list) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    sh.getRange(2, col, 2000, 1).setDataValidation(rule);
  }
  dropdown(COL.STATUS, ORDER_STATUSES);
  dropdown(COL.PAYMENT, PAYMENT_STATUSES);
  dropdown(COL.HANDOFF, HANDOFF_STATUSES);

  // Only the sheet owner (and this script, which runs as the owner) can edit order data columns.
  var me = Session.getEffectiveUser();
  function lock(range, text) {
    var p = range.protect().setDescription(text);
    p.addEditor(me);
    var others = p.getEditors().filter(function (u) { return u.getEmail() !== me.getEmail(); });
    if (others.length) p.removeEditors(others);
    if (p.canDomainEdit()) p.setDomainEdit(false);
  }
  lock(sh.getRange(1, 1, sh.getMaxRows(), LOCKED_COLUMNS), 'Order data - written by the order service only');
  lock(audit.getRange(1, 1, audit.getMaxRows(), audit.getMaxColumns()), 'Audit log - append only');

  // Automatic jobs.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'onEditAudit' || f === 'sweepHandoff' || f === 'backupWeekly') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditAudit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('sweepHandoff').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('backupWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).create();
  return 'Setup complete';
}
