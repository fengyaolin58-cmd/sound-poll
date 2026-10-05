/*
 * Shared code for the poll pages: the voter's id, where votes are stored, the audio players
 * and the results bars. Plain scripts, no libraries, so it works on GitHub Pages as it is.
 */
(function () {
  "use strict";

  var cfg = window.POLL_CONFIG || {};
  var poll = cfg.poll || { id: "poll", title: "Poll", options: [] };

  // ---------------------------------------------------------------- small helpers

  // h("div", {class: "x", text: "hi"}, [children]) builds an element.
  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v === null || v === undefined) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (kid) {
      if (kid) node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return node;
  }

  function percent(n, total) { return total ? Math.round((100 * n) / total) : 0; }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // Local storage can be blocked (private windows); fall back to memory so the page still works.
  var memory = {};
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return memory[k] || null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { memory[k] = v; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { delete memory[k]; } }

  // ---------------------------------------------------------------- who is voting

  function randomId() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  // One random id per browser. It is not a login: it only lets the counter keep one vote per browser.
  function voterId() {
    var id = lsGet("pollVoterId");
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      lsSet("pollVoterId", id);
    }
    return id;
  }

  // ---------------------------------------------------------------- where the votes live

  // Turns whatever the counter sent back into {counts per option, total, myVote}.
  function snapshotFrom(raw) {
    var counts = {};
    var total = 0;
    poll.options.forEach(function (o) {
      var n = Number(raw && raw.counts && raw.counts[o.id]) || 0;
      counts[o.id] = n;
      total += n;
    });
    var mine = raw && raw.myVote ? String(raw.myVote) : null;
    if (mine && counts[mine] === undefined) mine = null;
    return { counts: counts, total: total, myVote: mine };
  }

  // Practice mode: votes stay in this browser only. (?demo=seed adds sample votes to see how results look.)
  function demoBackend() {
    var key = "pollDemo:" + poll.id;
    function read() { try { return JSON.parse(lsGet(key)) || {}; } catch (e) { return {}; } }
    function write(d) { lsSet(key, JSON.stringify(d)); }
    function seedIfAsked() {
      if (!/[?&]demo=seed(&|$)/.test(window.location.search)) return;
      var d = read();
      if (d.seeded) return;
      d.counts = d.counts || {};
      var sample = [14, 9, 21, 6, 11];
      poll.options.forEach(function (o, i) { d.counts[o.id] = (d.counts[o.id] || 0) + sample[i % sample.length]; });
      d.seeded = true;
      write(d);
    }
    function snap() { var d = read(); return snapshotFrom({ counts: d.counts, myVote: d.myVote }); }
    return {
      mode: "demo",
      getResults: function () { seedIfAsked(); return Promise.resolve(snap()); },
      vote: function (option) {
        seedIfAsked();
        var d = read();
        d.counts = d.counts || {};
        if (d.myVote && d.counts[d.myVote] > 0) d.counts[d.myVote] -= 1; // changing a vote moves it
        d.counts[option] = (d.counts[option] || 0) + 1;
        d.myVote = option;
        write(d);
        return Promise.resolve(snap());
      }
    };
  }

  var jsonpCount = 0;
  // A fallback for reading results when the browser will not let fetch() read the answer.
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var name = "pollJsonp" + (++jsonpCount) + "_" + Date.now();
      var script = document.createElement("script");
      var timer = setTimeout(function () { cleanup(); reject(new Error("timeout")); }, 12000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[name] = function (data) { cleanup(); resolve(data); };
      script.onerror = function () { cleanup(); reject(new Error("network")); };
      script.src = url + "&callback=" + name;
      document.head.appendChild(script);
    });
  }

  // The real thing: a Google Apps Script web app that writes the votes into a Google Sheet.
  function remoteBackend(base) {
    function url(params) {
      params.poll = poll.id;
      var query = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      return base + (base.indexOf("?") < 0 ? "?" : "&") + query;
    }
    function readJson(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }
    function getRaw(voter) {
      var u = url({ action: "results", voter: voter, t: Date.now() });
      return fetch(u, { cache: "no-store" }).then(readJson).catch(function () { return jsonp(u); });
    }
    function checked(raw) {
      if (!raw || raw.ok === false) throw new Error((raw && raw.error) || "unexpected answer");
      return snapshotFrom(raw);
    }
    return {
      mode: "remote",
      getResults: function (voter) { return getRaw(voter).then(checked); },
      vote: function (option, voter) {
        var body = JSON.stringify({ action: "vote", poll: poll.id, option: option, voter: voter });
        return fetch(base, { method: "POST", body: body, headers: { "Content-Type": "text/plain;charset=utf-8" } })
          .then(readJson)
          .then(checked)
          .catch(function () {
            // Some browsers will not let the page read the answer even though the vote arrived.
            // Send it once more without waiting for an answer (the counter ignores repeats), then ask
            // for the results and check that our vote is in them.
            return fetch(base, { method: "POST", mode: "no-cors", body: body })
              .catch(function () {})
              .then(function () { return delay(1500); })
              .then(function () { return getRaw(voter); })
              .then(checked)
              .then(function (snap) {
                if (snap.myVote !== option) throw new Error("not recorded");
                return snap;
              });
          });
      }
    };
  }

  function createBackend() {
    return cfg.backendUrl ? remoteBackend(cfg.backendUrl) : demoBackend();
  }

  // ---------------------------------------------------------------- the sounds

  // One audio element per sound, all loaded up front, so any of them plays the moment it is tapped.
  // Playing one stops the others, which makes comparing quick. hooks: onState(id, "playing"|"idle"|"error"),
  // onProgress(id, 0..1), onDuration(id, seconds), onSequence(index or -1).
  function AudioBank(options, hooks) {
    hooks = hooks || {};
    var items = {};
    var token = 0;      // changes whenever something else takes over, which ends "play all"
    var frame = 0;

    function setState(item, state) {
      item.state = state;
      if (hooks.onState) hooks.onState(item.id, state);
    }
    function progress(id, fraction) { if (hooks.onProgress) hooks.onProgress(id, fraction); }

    options.forEach(function (o) {
      var audio = new Audio();
      audio.preload = "auto";
      audio.src = o.file;
      var item = { id: o.id, audio: audio, state: "idle" };
      audio.addEventListener("error", function () { setState(item, "error"); });
      audio.addEventListener("playing", function () { setState(item, "playing"); tick(); });
      audio.addEventListener("pause", function () { if (item.state !== "error") setState(item, "idle"); });
      audio.addEventListener("ended", function () { if (item.state !== "error") setState(item, "idle"); progress(item.id, 0); });
      audio.addEventListener("loadedmetadata", function () { if (hooks.onDuration) hooks.onDuration(item.id, audio.duration); });
      items[o.id] = item;
    });

    function tick() {
      cancelAnimationFrame(frame);
      var any = false;
      Object.keys(items).forEach(function (id) {
        var a = items[id].audio;
        if (!a.paused && a.duration) { any = true; progress(id, a.currentTime / a.duration); }
      });
      if (any) frame = requestAnimationFrame(tick);
    }

    function silence(except) {
      Object.keys(items).forEach(function (id) {
        if (id === except) return;
        var a = items[id].audio;
        if (!a.paused) a.pause();
        try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
        progress(id, 0);
      });
    }

    // Starts one sound; the promise resolves when it ends, is stopped, or fails.
    function startOne(id) {
      var item = items[id];
      if (!item) return Promise.resolve();
      silence(id);
      return new Promise(function (resolve) {
        var a = item.audio;
        function done() {
          a.removeEventListener("ended", done);
          a.removeEventListener("pause", done);
          a.removeEventListener("error", done);
          resolve();
        }
        a.addEventListener("ended", done);
        a.addEventListener("pause", done);
        a.addEventListener("error", done);
        if (item.state === "error") setState(item, "idle"); // give a failed file another try
        try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
        var p;
        try { p = a.play(); } catch (e) { setState(item, "error"); done(); return; }
        if (p && p.catch) p.catch(function () { setState(item, "error"); done(); });
      });
    }

    // Anything the listener does themselves ends a running "play all" at once.
    function takeOver() {
      token++;
      if (hooks.onSequence) hooks.onSequence(-1);
    }

    return {
      items: items,
      play: function (id) { takeOver(); return startOne(id); },
      stop: function () { takeOver(); silence(null); },
      toggle: function (id) {
        var item = items[id];
        takeOver();
        if (item && !item.audio.paused) { silence(null); } else { startOne(id); }
      },
      isPlaying: function (id) { return !!items[id] && !items[id].audio.paused; },
      // Plays every sound in order with a short gap; anything else the listener does ends it.
      playAll: function () {
        var mine = ++token;
        var i = 0;
        function next() {
          if (mine !== token || i >= options.length) {
            if (hooks.onSequence) hooks.onSequence(-1);
            return Promise.resolve();
          }
          var index = i++;
          if (hooks.onSequence) hooks.onSequence(index);
          return startOne(options[index].id).then(function () { return delay(450); }).then(next);
        }
        return next();
      }
    };
  }

  // ---------------------------------------------------------------- results bars

  // Fills `list` (a <ul>) with one row per option. opts.sort puts the leader first;
  // opts.extra(option) can return an element (a play button) to put in front of each name.
  function renderResults(list, snap, opts) {
    opts = opts || {};
    list.textContent = "";
    var rows = poll.options.map(function (o, i) { return { o: o, n: snap.counts[o.id] || 0, i: i }; });
    var top = rows.reduce(function (m, r) { return Math.max(m, r.n); }, 0);
    if (opts.sort) rows.sort(function (a, b) { return b.n - a.n || a.i - b.i; });
    rows.forEach(function (r) {
      var share = percent(r.n, snap.total);
      var classes = "result" + (top > 0 && r.n === top ? " leader" : "") + (snap.myVote === r.o.id ? " mine" : "");
      var tags = [];
      if (top > 0 && r.n === top) tags.push(h("span", { class: "chip lead-chip", text: "Leading" }));
      if (snap.myVote === r.o.id) tags.push(h("span", { class: "chip mine-chip", text: "Your pick" }));
      var extra = opts.extra ? opts.extra(r.o) : null;
      list.appendChild(h("li", { class: classes }, [
        h("div", { class: "result-top" }, [
          h("span", { class: "result-name" }, [extra, h("span", { text: r.o.label })].concat(tags)),
          h("span", { class: "result-count", text: plural(r.n, "vote", "votes") + " · " + share + "%" })
        ]),
        h("div", { class: "track", role: "img", "aria-label": r.o.label + ": " + share + " percent" }, [
          h("i", { style: "width:" + (snap.total ? (100 * r.n) / snap.total : 0) + "%" })
        ])
      ]));
    });
  }

  function clock(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  window.Poll = {
    config: cfg,
    poll: poll,
    h: h,
    percent: percent,
    plural: plural,
    clock: clock,
    lsGet: lsGet,
    lsSet: lsSet,
    lsDel: lsDel,
    voterId: voterId,
    snapshotFrom: snapshotFrom,
    createBackend: createBackend,
    demoBackend: demoBackend,
    remoteBackend: remoteBackend,
    AudioBank: AudioBank,
    renderResults: renderResults
  };
})();
