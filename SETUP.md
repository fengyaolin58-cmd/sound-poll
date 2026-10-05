# Sound poll: setting it up

People open one web page, listen to your five sounds, pick one and vote. You watch the totals on a
second page (and in a Google Sheet that lists every vote). It costs nothing and needs no programming.

- **Voting page:** `index.html`  (this is the link you share)
- **Your results page:** `results.html`  (live totals, sorted view, a summary to paste into a post, CSV)
- **Where the votes are kept:** a Google Sheet, written to by a small Google script (`backend/Code.gs`)
- **Where the website lives:** GitHub Pages

You do three things: put in your real sounds, set up the Google Sheet, and put the site on GitHub.
Each one takes about ten minutes. Do them in this order so you only upload the site once.

You can try the site right now without doing any of it: open `serve.ps1` with PowerShell (right-click,
Run with PowerShell) and go to <http://localhost:8765/>. It starts in **practice mode**, where votes are
stored in your own browser only and a yellow banner says so. Add `?demo=seed` to the address
(`http://localhost:8765/results.html?demo=seed`) to see what results look like with sample votes.

---

## 1. Use your own sounds

The five sounds in `audio/` are **placeholders** I generated so the page works. Replace them:

1. Put your five files in the `audio` folder. `.mp3` and `.wav` play in every browser; `.ogg` may not
   play on older iPhones. Keep each file short and small (under 1 MB is plenty).
2. Open `config.js` in Notepad and edit the `poll` part:
   - `title` and `description` are what people read.
   - For each option: `label` is the name people see, `file` is the path (for example
     `audio/slash-1.mp3`), and `note` is an optional line under the name. **Delete or change the
     "Placeholder: ..." notes.** Leave the `id` letters alone.
   - You can have more or fewer than five options; the page adapts. Number keys 1 to 9 play the first nine.
3. Set the loudness of all your sounds to about the same level before you export them. People vote
   for whatever sounds louder, and that is not what you want to measure. (Audacity: Effect >
   Loudness Normalization, the same target for every file.)
4. Order matters a little: the sound listed first tends to collect extra votes. If that bothers you,
   shuffle the order of the options in `config.js`. Plain labels like "Sound A / B / C" keep the vote
   about the sound and not the name.

Starting a different poll later? Change `id` (for example to `jump-sound-1`) so the new votes do not
mix with the old ones.

## 2. The Google Sheet that counts the votes

You need a Google account. This is the one step I could not do for you.

1. Go to <https://sheets.new>. Name the sheet something like "Sound poll votes".
2. Menu **Extensions > Apps Script**. A code editor opens.
3. Delete the sample code, open `backend/Code.gs` from this folder in Notepad, copy everything and
   paste it in. Press the save (disk) icon.
4. Click **Deploy > New deployment**. Click the small gear next to "Select type" and choose **Web app**.
   - Description: anything ("poll")
   - Execute as: **Me**
   - Who has access: **Anyone**   (it must be "Anyone", or voters would be asked to sign in)
5. Click **Deploy**. Google asks you to authorize it: choose your account. You will probably see a
   warning "Google hasn't verified this app". That is normal for your own script: click
   **Advanced > Go to (project name) (unsafe) > Allow**. The script can only touch this one sheet.
6. Copy the **Web app URL**. It ends in `/exec`.
7. Open `config.js` and paste it between the quotes: `backendUrl: "https://script.google.com/macros/s/.../exec",`
8. Check it works: paste that same URL into a browser tab and add
   `?action=results&poll=sword-slash-1` at the end (use your poll's `id`). You should see something like
   `{"ok":true,"poll":"sword-slash-1","counts":{},"total":0,"myVote":null}`. If you see a Google sign-in
   page or an error page instead, step 4 was not set to "Anyone".

A **Votes** tab appears in your sheet when the first vote comes in. It has one row per voter:
time, poll id, option id and a random voter id. There are no names, emails or IP addresses. You can
open it any time to see every vote, and sort or chart it however you like.

If you ever change `Code.gs`, it only takes effect after **Deploy > Manage deployments > the pencil >
Version: New version > Deploy**. The address stays the same.

## 3. Put the site on GitHub

You need a free GitHub account.

1. On GitHub: **+ (top right) > New repository**. Name it (for example `sound-poll`), choose **Public**
   (free GitHub Pages needs a public repository), then **Create repository**.
2. On the new empty repository, click **uploading an existing file**.
3. Open this `poll-site` folder in Explorer and select **everything inside it** (the files and the
   `audio`, `css`, `js`, `backend` folders), then drag it all onto the GitHub page. Drag the contents,
   not the `poll-site` folder itself, or the site will end up one folder too deep. You can leave out
   `serve.ps1` and `.gdignore`; they are harmless if you upload them. Wait for the uploads to finish,
   then press **Commit changes**.
4. Go to **Settings > Pages**. Under "Build and deployment" set **Source: Deploy from a branch**,
   **Branch: main**, **Folder: / (root)**, and **Save**.
5. Wait a minute or two and refresh that page. It shows "Your site is live at
   `https://YOURNAME.github.io/sound-poll/`".

Your links:

- Share this: `https://YOURNAME.github.io/sound-poll/`
- Keep this one for yourself: `https://YOURNAME.github.io/sound-poll/results.html`

Changing something later (a new sound, the title): open the file on GitHub, click the pencil to edit
text files, or **Add file > Upload files** to replace sounds, then commit. The site updates within a
minute or two.

## Before you share it: a two-minute test

1. Open your voting link on your phone. There should be **no yellow "Practice mode" banner**. If there
   is, `backendUrl` in `config.js` is empty or the upload did not include your edited `config.js`.
2. Press each play button. Each sound should play, and pressing another one should stop the first.
   (On an iPhone, check the silent-mode switch if you hear nothing.)
3. Vote. Open `results.html` and the Votes tab in the sheet: your vote should be in both.
4. Change your vote with "Change my vote". The sheet should still show **one** row for you.
5. Then delete your test row(s) in the sheet, or start the real poll under a new poll `id`.

## Good to know

- **One vote per browser, not per person.** The site remembers each browser with a random id. Someone
  who clears their data, switches browser or uses a private window can vote again. That is fine for a
  friendly poll; it is not safe for anything with a prize. The sheet makes it easy to spot odd bursts of
  votes (many rows in the same second).
- **Closing the poll:** set `closed: true` in `config.js`. The page then says voting is closed, and the
  results show. This only changes the page: the Google script would still accept a vote sent by
  someone who knew how. To shut it completely, use **Deploy > Manage deployments** in Apps Script and
  archive the deployment.
- **Results page is unlisted, not private.** Nothing links to `results.html`, but anyone who has the
  address can open it. Use `showResults: "never"` in `config.js` if people should not see the standings
  on the voting page itself.
- **Limits.** Google's free script quotas are generous and a poll with some hundreds of voters is no
  problem. If a post goes very big, votes may fail for a while; people see "Could not reach the vote
  counter" and can try again. Your already-saved votes are safe in the sheet.
- **The sounds load when the page opens** (about 0.25 MB for the five placeholders), so every sound
  plays the moment it is tapped. Large files will make the page slower to ready on mobile data.
- If nobody can vote and the page says "The vote counter did not answer", open the `/exec` address
  from step 2.8 in a browser: if that does not show the `{"ok":true...` text, the deployment settings
  (Execute as Me, access Anyone) or the pasted address is wrong.
