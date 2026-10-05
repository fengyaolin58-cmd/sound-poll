/* The results page: for you. Live totals, a summary to paste into a post, and a CSV. */
(function () {
  "use strict";

  var P = window.Poll;
  var poll = P.poll;
  var h = P.h;
  var $ = function (id) { return document.getElementById(id); };

  var backend = P.createBackend();
  var voter = P.voterId();
  var sorted = false;
  var last = null;
  var cards = {};

  document.title = "Results: " + poll.title;
  $("title").textContent = poll.title;
  $("description").textContent = poll.description || "";
  $("description").hidden = !poll.description;

  // Small play buttons, so the sounds can be heard from here too.
  var bank = P.AudioBank(poll.options, {
    onState: function (id, state) {
      if (!cards[id]) return;
      cards[id].classList.toggle("playing", state === "playing");
      cards[id].classList.toggle("broken", state === "error");
    }
  });

  function playButton(option) {
    var b = h("button", { class: "play small", type: "button", "aria-label": "Play " + option.label }, [
      h("span", { class: "play-icon", "aria-hidden": "true" })
    ]);
    b.addEventListener("click", function () { bank.toggle(option.id); });
    if (bank.isPlaying(option.id)) b.classList.add("playing"); // the list is redrawn every few seconds
    cards[option.id] = b;
    return b;
  }

  function draw(snap) {
    last = snap;
    P.renderResults($("results-list"), snap, { sort: sorted, extra: playButton });
    $("total").textContent = String(snap.total);
    $("total-label").textContent = snap.total === 1 ? "vote" : "votes";
    $("updated").textContent = "Updated " + P.clock(new Date()) + ", then every " + (P.config.refreshSeconds || 15) + " seconds";
  }

  function setStatus(text, kind) {
    var s = $("status");
    s.textContent = text || "";
    s.className = "status" + (kind ? " " + kind : "");
  }

  function refresh() {
    return backend.getResults(voter).then(function (snap) {
      setStatus("");
      draw(snap);
    }).catch(function () {
      setStatus("Could not reach the vote counter. Showing the last numbers; will keep trying.", "bad");
    });
  }

  $("refresh").addEventListener("click", function () { setStatus("Refreshing…"); refresh(); });

  $("sort").addEventListener("click", function () {
    sorted = !sorted;
    $("sort").textContent = sorted ? "Keep the original order" : "Sort by votes";
    if (last) draw(last);
  });

  function summary() {
    if (!last) return "";
    var rows = poll.options.map(function (o) { return { o: o, n: last.counts[o.id] || 0 }; });
    rows.sort(function (a, b) { return b.n - a.n; });
    return poll.title + "\n" + rows.map(function (r, i) {
      return (i + 1) + ". " + r.o.label + ": " + P.plural(r.n, "vote", "votes") + " (" + P.percent(r.n, last.total) + "%)";
    }).join("\n") + "\n" + P.plural(last.total, "vote", "votes") + " in total";
  }

  $("copy").addEventListener("click", function () {
    var text = summary();
    if (!text) return;
    var done = function () { setStatus("Summary copied. Paste it into your post.", "good"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { window.prompt("Copy this:", text); });
    } else {
      window.prompt("Copy this:", text);
    }
  });

  $("csv").addEventListener("click", function () {
    if (!last) return;
    var lines = ["option_id,name,votes,percent"];
    poll.options.forEach(function (o) {
      var n = last.counts[o.id] || 0;
      lines.push([o.id, '"' + o.label.replace(/"/g, '""') + '"', n, P.percent(n, last.total)].join(","));
    });
    lines.push(["total", "", last.total, last.total ? 100 : 0].join(","));
    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = poll.id + "-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
  });

  if (backend.mode === "demo") {
    var b = $("banner");
    b.hidden = false;
    b.className = "banner warn";
    b.textContent = "Practice mode: these numbers come from this browser only. Follow SETUP.md to switch on the real poll.";
  }

  refresh();
  setInterval(function () {
    if (document.visibilityState === "visible") refresh();
  }, Math.max(5, Number(P.config.refreshSeconds) || 15) * 1000);
})();
