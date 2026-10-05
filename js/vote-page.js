/* The voting page: listen to the sounds, pick one, vote, see the results. */
(function () {
  "use strict";

  var P = window.Poll;
  var h = P.h;
  var poll = P.poll;
  var $ = function (id) { return document.getElementById(id); };

  var backend = P.createBackend();
  var voter = P.voterId();
  var votedKey = "pollVoted:" + poll.id;
  var chosen = null;      // the option picked in the list
  var votedFor = null;    // the option the counter has for this browser
  var editing = false;    // the voter pressed "Change my vote"
  var refreshTimer = 0;

  var cards = {};         // option id -> {li, play, bar, radio}
  var bank;

  document.title = poll.title;
  $("title").textContent = poll.title;
  $("description").textContent = poll.description || "";

  // ------------------------------------------------------------ the list of sounds

  function buildOption(o, index) {
    var play = h("button", { class: "play", type: "button", "aria-label": "Play " + o.label, title: "Play (key " + (index + 1) + ")" }, [
      h("span", { class: "play-icon", "aria-hidden": "true" })
    ]);
    var bar = h("i");
    var radio = h("input", { type: "radio", name: "choice", value: o.id, "aria-label": "Vote for " + o.label });
    var length = h("span", { class: "length muted" });
    var li = h("li", { class: "option", "data-id": o.id }, [
      play,
      h("div", { class: "body" }, [
        h("div", { class: "name-row" }, [
          h("span", { class: "key", "aria-hidden": "true", text: String(index + 1) }),
          h("span", { class: "name", text: o.label }),
          length
        ]),
        o.note ? h("div", { class: "note", text: o.note }) : null,
        h("div", { class: "bar" }, [bar]),
        h("div", { class: "problem", hidden: true, text: "This sound could not be loaded." })
      ]),
      h("label", { class: "pick" }, [radio, h("span", { text: "Pick" })])
    ]);
    play.addEventListener("click", function () { bank.toggle(o.id); });
    radio.addEventListener("change", function () { choose(o.id); });
    li.addEventListener("click", function (e) {
      if (e.target.closest("button") || e.target.closest("label")) return;
      if (!radio.disabled) { radio.checked = true; choose(o.id); }
    });
    cards[o.id] = { li: li, play: play, bar: bar, radio: radio, length: length };
    return li;
  }

  var list = $("options");
  poll.options.forEach(function (o, i) { list.appendChild(buildOption(o, i)); });

  bank = P.AudioBank(poll.options, {
    onState: function (id, state) {
      var c = cards[id];
      if (!c) return;
      c.li.classList.toggle("playing", state === "playing");
      c.li.classList.toggle("broken", state === "error");
      c.li.querySelector(".problem").hidden = state !== "error";
      c.play.setAttribute("aria-label", (state === "playing" ? "Stop " : "Play ") + poll.options.filter(function (o) { return o.id === id; })[0].label);
    },
    onProgress: function (id, fraction) { if (cards[id]) cards[id].bar.style.width = Math.round(fraction * 100) + "%"; },
    onDuration: function (id, seconds) {
      if (cards[id] && isFinite(seconds)) cards[id].length.textContent = seconds.toFixed(1) + " s";
    },
    onSequence: function (index) {
      $("play-all").textContent = index < 0 ? "▶ Play all in order" : "■ Stop (" + (index + 1) + " of " + poll.options.length + ")";
    }
  });

  $("play-all").addEventListener("click", function () {
    if ($("play-all").textContent.indexOf("Stop") >= 0) bank.stop(); else bank.playAll();
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" && e.target.type === "text") return;
    if (e.key === "Escape") { bank.stop(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= poll.options.length) { bank.toggle(poll.options[n - 1].id); }
  });

  // ------------------------------------------------------------ choosing and voting

  function choose(id) {
    chosen = id;
    Object.keys(cards).forEach(function (k) { cards[k].li.classList.toggle("chosen", k === id); });
    updateSubmit();
  }

  function locked() { return poll.closed || (votedFor && !editing); }

  function updateSubmit() {
    var submit = $("submit");
    Object.keys(cards).forEach(function (k) { cards[k].radio.disabled = !!locked(); });
    if (poll.closed) { submit.disabled = true; submit.textContent = "Voting is closed"; return; }
    if (votedFor && !editing) { submit.disabled = true; submit.textContent = "Vote counted"; return; }
    submit.disabled = !chosen;
    var label = poll.options.filter(function (o) { return o.id === chosen; })[0];
    var verb = votedFor ? "Update my vote" : "Submit my vote";
    submit.textContent = chosen ? verb + " for " + label.label : "Pick a sound to vote";
  }

  function setStatus(text, kind) {
    var s = $("status");
    s.textContent = text || "";
    s.className = "status" + (kind ? " " + kind : "");
  }

  $("submit").addEventListener("click", function () {
    if (!chosen || locked()) return;
    var submit = $("submit");
    submit.disabled = true;
    setStatus("Sending your vote…");
    backend.vote(chosen, voter).then(function (snap) {
      votedFor = chosen;
      editing = false;
      P.lsSet(votedKey, chosen);
      setStatus("Thanks! Your vote is in.", "good");
      showResults(snap);
      updateSubmit();
      startRefresh();
    }).catch(function () {
      setStatus("Could not reach the vote counter. Check your connection and try again.", "bad");
      updateSubmit();
    });
  });

  $("change-vote").addEventListener("click", function () {
    editing = true;
    setStatus("Pick another sound and press the button to update your vote.");
    if (votedFor && cards[votedFor]) { cards[votedFor].radio.checked = true; choose(votedFor); }
    updateSubmit();
  });

  // ------------------------------------------------------------ results

  function mayShowResults() {
    var mode = poll.showResults || "after-vote";
    if (mode === "never") return false;
    if (mode === "always") return true;
    return !!votedFor || poll.closed;
  }

  function showResults(snap) {
    if (!mayShowResults()) { $("results").hidden = true; return; }
    $("results").hidden = false;
    P.renderResults($("results-list"), snap, { sort: false });
    $("results-total").textContent = P.plural(snap.total, "vote", "votes") + " so far";
    $("results-updated").textContent = "Updated " + P.clock(new Date());
    $("change-vote").hidden = !(votedFor && !poll.closed && !editing);
  }

  function refresh() {
    return backend.getResults(voter).then(function (snap) {
      if (snap.myVote) {
        votedFor = snap.myVote;
        P.lsSet(votedKey, snap.myVote);
      } else if (votedFor && !editing) {
        // The counter has no vote for this browser (for example a practice vote from before the real poll
        // was switched on), so the note saved in this browser is out of date.
        votedFor = null;
        P.lsDel(votedKey);
        chosen = null;
        Object.keys(cards).forEach(function (k) { cards[k].radio.checked = false; cards[k].li.classList.remove("chosen"); });
      }
      showResults(snap);
      updateSubmit();
      return snap;
    });
  }

  function startRefresh() {
    clearInterval(refreshTimer);
    if (!mayShowResults()) return;
    refreshTimer = setInterval(function () {
      if (document.visibilityState === "visible" && !editing) refresh().catch(function () {});
    }, 30000);
  }

  // ------------------------------------------------------------ the banner and the first load

  function banner(text, kind) {
    var b = $("banner");
    b.hidden = !text;
    b.textContent = text || "";
    b.className = "banner" + (kind ? " " + kind : "");
  }

  if (backend.mode === "demo") {
    banner("Practice mode: votes are saved in this browser only, so nobody else's votes are counted yet. " +
           "Follow SETUP.md to switch on the real poll.", "warn");
  }
  if (poll.closed) banner("Voting is closed. Thanks for listening!", "info");

  // Remember a vote from earlier visits straight away; the counter confirms it below.
  var earlier = P.lsGet(votedKey);
  if (earlier && cards[earlier]) { votedFor = earlier; cards[earlier].radio.checked = true; choose(earlier); }
  updateSubmit();

  refresh().then(function () { startRefresh(); }).catch(function () {
    if (backend.mode === "remote") {
      setStatus("The vote counter did not answer. You can still listen and try voting in a minute.", "bad");
    }
  });
})();
