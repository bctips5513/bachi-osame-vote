/**
 * バチ納め衣装決め投票 — 集計API
 *
 * スプレッドシートのシート構成（初回アクセス時に自動で作られます）
 *   設定   : B1 締切日時 / B2 モード（デモ or 本番）。管理者モードからも変更できます
 *   投票   : 1票ごとに 1位・2位・3位 のアイテム番号（名前は記録しない）
 *   投票者 : 二重投票チェック用。名前は復元できないハッシュ値で保存
 *
 * 管理者パスワードはスクリプトプロパティ ADMIN_PASSWORD に保存（初期値 8222）
 */

const ITEM_COUNT = 14;
const POINTS = [3, 2, 1]; // 1位・2位・3位の点数
const SHEET_CONFIG = '設定';
const SHEET_VOTES = '投票';
const SHEET_VOTERS = '投票者';
const DEFAULT_DEADLINE = '2026/10/15 23:59:00';
const DEFAULT_ADMIN_PASSWORD = '8222';
const MODE_DEMO = 'デモ';
const MODE_LIVE = '本番';
const MAX_ADMIN_FAILS = 10; // 10分間にこれだけ間違えると一時ロック

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Tokyo');

  const config = ss.getSheetByName(SHEET_CONFIG) || ss.insertSheet(SHEET_CONFIG);
  if (!config.getRange('B1').getValue()) {
    config.getRange('A1:B1').setValues([['締切日時', new Date(DEFAULT_DEADLINE)]]);
  }
  if (!config.getRange('B2').getValue()) {
    config.getRange('A2:B2').setValues([['モード', MODE_DEMO]]);
  }
  config.getRange('B1').setNumberFormat('yyyy/mm/dd hh:mm');
  config.getRange('A4').setValue('B1：締切（日本時間）　B2：「デモ」または「本番」。投票ページの管理者モードからも変更できます');
  config.setColumnWidth(1, 120);
  config.setColumnWidth(2, 180);

  const votes = ss.getSheetByName(SHEET_VOTES) || ss.insertSheet(SHEET_VOTES);
  if (votes.getLastRow() === 0) votes.appendRow(['1位', '2位', '3位']);

  const voters = ss.getSheetByName(SHEET_VOTERS) || ss.insertSheet(SHEET_VOTERS);
  if (voters.getLastRow() === 0) voters.appendRow(['名前ハッシュ', '閲覧トークン']);

  const blank = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 3) ss.deleteSheet(blank);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
}

// 足りないシートや設定があれば作る
function ensureSetup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName(SHEET_CONFIG);
  const props = PropertiesService.getScriptProperties();
  if (!config || !config.getRange('B2').getValue() || !ss.getSheetByName(SHEET_VOTES) ||
      !ss.getSheetByName(SHEET_VOTERS) || !props.getProperty('SALT') || !props.getProperty('ADMIN_PASSWORD')) {
    setup();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    ensureSetup_();
    if (p.action === 'results') return json_(results_({ token: p.token }));
    return json_(config_());
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  try {
    ensureSetup_();
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'vote') return json_(vote_(body));
    if (body.action === 'admin') return json_(admin_(body));
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function config_() {
  const deadline = deadline_();
  return {
    ok: true,
    deadline: deadline.toISOString(),
    closed: Date.now() > deadline.getTime(),
    mode: mode_() === MODE_LIVE ? 'live' : 'demo',
  };
}

function vote_(body) {
  const name = String(body.name || '').trim();
  const ranks = Array.isArray(body.ranks) ? body.ranks.map(Number) : [];

  if (mode_() !== MODE_LIVE) return { ok: false, error: 'demo_mode' };
  if (Date.now() > deadline_().getTime()) return { ok: false, error: 'closed' };
  if (!name || name.length > 30) return { ok: false, error: 'bad_name' };
  const valid = ranks.length === 3 &&
    ranks.every(n => Number.isInteger(n) && n >= 1 && n <= ITEM_COUNT) &&
    new Set(ranks).size === 3;
  if (!valid) return { ok: false, error: 'bad_ranks' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const voters = ss.getSheetByName(SHEET_VOTERS);
    const hash = nameHash_(name);
    const known = voters.getLastRow() > 1
      ? voters.getRange(2, 1, voters.getLastRow() - 1, 1).getValues().flat()
      : [];
    if (known.indexOf(hash) !== -1) return { ok: false, error: 'already_voted' };

    const token = Utilities.getUuid();
    voters.appendRow([hash, token]);
    insertAtRandomRow_(ss.getSheetByName(SHEET_VOTES), ranks);
    return { ok: true, token: token };
  } finally {
    lock.releaseLock();
  }
}

// 管理者の操作。パスワードはここ（サーバー側）でだけ照合する
function admin_(body) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('admin_fails') || 0);
  if (fails >= MAX_ADMIN_FAILS) return { ok: false, error: 'locked' };

  const password = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (String(body.password || '') !== password) {
    cache.put('admin_fails', String(fails + 1), 600);
    return { ok: false, error: 'bad_password' };
  }

  const config = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  switch (body.op) {
    case 'login':
      return config_();
    case 'results':
      return results_({ admin: true });
    case 'setDeadline': {
      const d = new Date(body.value);
      if (isNaN(d.getTime())) return { ok: false, error: 'bad_value' };
      config.getRange('B1').setValue(d);
      return config_();
    }
    case 'setMode': {
      if (body.value !== 'live' && body.value !== 'demo') return { ok: false, error: 'bad_value' };
      config.getRange('B2').setValue(body.value === 'live' ? MODE_LIVE : MODE_DEMO);
      return config_();
    }
  }
  return { ok: false, error: 'bad_request' };
}

function results_(opts) {
  const closed = Date.now() > deadline_().getTime();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!closed && !opts.admin) {
    const voters = ss.getSheetByName(SHEET_VOTERS);
    const tokens = voters.getLastRow() > 1
      ? voters.getRange(2, 2, voters.getLastRow() - 1, 1).getValues().flat()
      : [];
    if (!opts.token || tokens.indexOf(opts.token) === -1) return { ok: false, error: 'not_yet' };
  }

  const sheet = ss.getSheetByName(SHEET_VOTES);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  const items = [];
  for (let i = 1; i <= ITEM_COUNT; i++) items.push({ id: i, points: 0, counts: [0, 0, 0] });
  rows.forEach(r => r.forEach((id, place) => {
    const it = items[Number(id) - 1];
    if (!it) return;
    it.points += POINTS[place];
    it.counts[place]++;
  }));

  // 点数 → 1位票 → 2位票 → 3位票 の順で比較し、すべて同じなら同順位
  const cmp = (a, b) => b.points - a.points || b.counts[0] - a.counts[0] ||
    b.counts[1] - a.counts[1] || b.counts[2] - a.counts[2];
  items.sort((a, b) => cmp(a, b) || a.id - b.id);
  items.forEach((it, i) => { it.rank = i > 0 && cmp(items[i - 1], it) === 0 ? items[i - 1].rank : i + 1; });

  return { ok: true, closed: closed, deadline: deadline_().toISOString(), voters: rows.length, items: items };
}

// 投票順から投票者を推測できないよう、行の位置をランダムにする
function insertAtRandomRow_(sheet, values) {
  sheet.appendRow(values);
  const last = sheet.getLastRow();
  if (last <= 2) return;
  const target = 2 + Math.floor(Math.random() * (last - 1));
  if (target === last) return;
  const a = sheet.getRange(target, 1, 1, 3);
  const b = sheet.getRange(last, 1, 1, 3);
  const tmp = a.getValues();
  a.setValues(b.getValues());
  b.setValues(tmp);
}

function deadline_() {
  const v = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG).getRange('B1').getValue();
  return v instanceof Date ? v : new Date(v);
}

function mode_() {
  const v = String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG).getRange('B2').getValue()).trim();
  return v === MODE_LIVE ? MODE_LIVE : MODE_DEMO;
}

// 全角/半角・空白・大文字小文字の違いを無視して同一人物とみなす
function nameHash_(name) {
  const normalized = name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + normalized, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
