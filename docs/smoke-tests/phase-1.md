# Phase 1 — Projection MVP: smoke test (run a full Sunday service)

Setup: a laptop plus a projector or second display. Outputs → assign the projector as **Main output** and optionally
another screen as **Stage display**.

- [ ] The test pattern shows colour bars, the resolution and the display name on the projector; turn it off.
- [ ] Unplug the projector and plug it back in: the output returns on its own and the control window is never covered.
- [ ] Backgrounds → *Aurora*: the motion background plays on the projector.
- [ ] Open the sample service. The walk-in countdown and Welcome announcements auto-advance while live.
- [ ] Install a hymnal package (Settings → Bibles & hymnals). Hymns → `#1` in the quick bar finds it. Add 4 songs to
      the service.
- [ ] Click a lyric slide: the **green** Preview updates and the projector does not change. Press Space: it goes
      live, and the slide and LIVE pill turn **red**.
- [ ] → and ← step through slides. The motion background does **not** restart between slides.
- [ ] ⌘/Ctrl+K → `jn 3 16` → Enter shows a preview in under 3 s from opening the bar. Shift+Enter shows it now.
- [ ] Bible tab: Psalm 23, shift-click verses 1–6, then Add to service. Long passages split across slides, never
      mid-word.
- [ ] Romans 8:28–39 in the sample service: verse numbers and reference are shown, and the text fits the screen.
- [ ] F1 clears text and keeps the background. B → black, B again → back. L → logo. Esc → panic (background stays).
- [ ] Stage display shows the current and next slide, a clock, the elapsed time, notes and a booth message with flash.
- [ ] Ticker "Parent of child #42…" scrolls on the projector; Hide removes it.
- [ ] New song: type sections in the editor; the slide preview updates as you type; arrangement "V1 C V2 C" is followed.
- [ ] Edit, delete, then ⌘/Ctrl+Z restores the song; ⌘/Ctrl+Shift+Z redoes.
- [ ] Media → Add media (image + MP4). Thumbnails appear. The video plays on the projector with sound from the main
      output only.
- [ ] Settings → Export library, then Import library on a fresh profile: songs, services, themes and media come back.
- [ ] **Crash test:** with a verse live, end the control window's renderer process in Activity Monitor / Task
      Manager. The projector keeps showing the verse and the control window reloads.
- [ ] Ctrl/⌘+Alt+P shows the performance overlay; control FPS is about 60 and IPC round-trip is under 5 ms.
