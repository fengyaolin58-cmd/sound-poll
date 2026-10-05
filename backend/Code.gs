/**
 * The vote counter for the poll. Paste this whole file into a Google Sheet's Apps Script
 * (SETUP.md shows how), then deploy it as a web app. Every vote becomes one row in the "Votes" tab,
 * so you can open the Sheet at any time and see exactly who-voted-what (as anonymous ids and times).
 *
 * The website talks to it in two ways:
 *   GET  <web app url>?action=results&poll=ID&voter=VOTERID   ->  {ok, counts, total, myVote}
 *   POST <web app url>  with {"action":"vote","poll":ID,"option":OPTIONID,"voter":VOTERID}  -> the same
 *
 * One row per voter per poll: voting again from the same browser changes the vote instead of adding one.
 */

var SHEET_NAME = 'Votes';
var HEADERS = ['Time', 'Poll', 'Option', 'Voter'];
var ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
var VOTER_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
var CALLBACK_PATTERN = /^[A-Za-z_$][0-9A-Za-z_$]{0,60}$/;
var TALLY_CACHE_SECONDS = 10;       // totals are reused for this long, which keeps busy moments cheap
var MINE_CACHE_SECONDS = 21600;     // how long a voter's own choice is remembered without reading the Sheet
var NONE_CACHE_SECONDS = 120;       // how long "has not voted" is remembered, so page views stay cheap


function doGet(e) {
  var params = (e && e.parameter) || {};
  return respond_(handle_(params), params.callback);
}


function doPost(e) {
  var params = {};
  try {
    params = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
  } catch (err) {
    params = {};
  }
  return respond_(handle_(params), null);
}


function handle_(p) {
  try {
    var poll = String(p.poll === undefined ? '' : p.poll);
    var voter = String(p.voter === undefined ? '' : p.voter);
    if (!ID_PATTERN.test(poll)) return { ok: false, error: 'bad poll id' };

    if (p.action === 'vote') {
      var option = String(p.option === undefined ? '' : p.option);
      if (!ID_PATTERN.test(option)) return { ok: false, error: 'bad option id' };
      if (!VOTER_PATTERN.test(voter)) return { ok: false, error: 'bad voter id' };
      recordVote_(poll, option, voter);
    } else if (p.action !== 'results') {
      return { ok: false, error: 'unknown action' };
    }

    var tally = tally_(poll);
    return {
      ok: true,
      poll: poll,
      counts: tally.counts,
      total: tally.total,
      myVote: VOTER_PATTERN.test(voter) ? myVote_(poll, voter) : null
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}


function respond_(object, callback) {
  var json = JSON.stringify(object);
  if (callback && CALLBACK_PATTERN.test(String(callback))) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}


function sheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}


/** Adds the vote, or changes this voter's earlier vote in the same poll. */
function recordVote_(poll, option, voter) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_();
    var values = sheet.getDataRange().getValues();
    var row = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][1]) === poll && String(values[i][3]) === voter) {
        row = i + 1;                       // sheet rows count from 1
        break;
      }
    }
    if (row > 0) {
      sheet.getRange(row, 1, 1, 3).setValues([[new Date(), poll, option]]);
    } else {
      sheet.appendRow([new Date(), poll, option, voter]);
    }
    var cache = CacheService.getScriptCache();
    cache.remove('tally:' + poll);
    cache.remove('none:' + poll + ':' + voter);
    cache.put('mine:' + poll + ':' + voter, option, MINE_CACHE_SECONDS);
  } finally {
    lock.releaseLock();
  }
}


/** {counts: {optionId: n}, total: n} for one poll. */
function tally_(poll) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('tally:' + poll);
  if (cached) return JSON.parse(cached);

  var counts = {};
  var total = 0;
  var values = sheet_().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === poll) {
      var option = String(values[i][2]);
      counts[option] = (counts[option] || 0) + 1;
      total++;
    }
  }
  var tally = { counts: counts, total: total };
  cache.put('tally:' + poll, JSON.stringify(tally), TALLY_CACHE_SECONDS);
  return tally;
}


/** What this voter chose in this poll, or null. */
function myVote_(poll, voter) {
  var cache = CacheService.getScriptCache();
  var key = 'mine:' + poll + ':' + voter;
  var remembered = cache.get(key);
  if (remembered) return remembered;
  if (cache.get('none:' + poll + ':' + voter)) return null;

  var values = sheet_().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === poll && String(values[i][3]) === voter) {
      var option = String(values[i][2]);
      cache.put(key, option, MINE_CACHE_SECONDS);
      return option;
    }
  }
  cache.put('none:' + poll + ':' + voter, '1', NONE_CACHE_SECONDS);
  return null;
}
