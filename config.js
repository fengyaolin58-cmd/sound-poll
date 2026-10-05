/*
 * Everything you normally need to change is in this file.
 *
 *  - backendUrl: where the votes are stored. Leave it "" to try the site out: the votes then stay in
 *    your own browser only. For a real poll, follow SETUP.md (a Google Sheet plus a small script, free)
 *    and paste the web app address between the quotes.
 *  - poll: the question and the sounds. Put the sound files in the audio folder and list them here.
 */
window.POLL_CONFIG = {
  backendUrl: "https://script.google.com/macros/s/AKfycbwZJ8Xf9uosYUALnrqPgeiXtS0dw0UFA_yNpssBaYfAmkITGVv2xBTy2teVERC0rOdeqA/exec",

  poll: {
    // Letters, numbers, - and _ only. Use a new id for each new poll so the votes do not mix.
    id: "blink-sfx-2",

    title: "Which teleport sound sounds the coolest?",
    description: "",

    // true = voting is switched off (the results still show).
    closed: false,

    // When the results appear on the voting page: "after-vote", "always" or "never".
    // (results.html always shows them. It is not linked from the voting page, but anyone who knows
    // its address can open it, so keep that address to yourself if the results must stay hidden.)
    showResults: "after-vote",

    // Each option needs an id (letters, numbers, - and _), a name people see, and the sound file.
    // "note" is an optional line under the name. mp3 and wav play everywhere.
    options: [
      { id: "a", label: "Sound A", file: "audio/sfx-a.wav" },
      { id: "b", label: "Sound B", file: "audio/sfx-b.wav" },
      { id: "c", label: "Sound C", file: "audio/sfx-c.wav" },
      { id: "d", label: "Sound D", file: "audio/sfx-d.wav" },
      { id: "e", label: "Sound E", file: "audio/sfx-e.wav" }
    ]
  },

  // How often results.html refreshes by itself, in seconds.
  refreshSeconds: 15
};
