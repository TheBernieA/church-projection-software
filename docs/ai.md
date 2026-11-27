# AI in Lampstand

What the assistant does, how it is built, and what comes next. The decisions behind it are in
[ADR 0008](adr/0008-ai-assistant-and-listening.md).

## Two parts with different rules

| | **Listening** (offline) | **Assistant** (online, opt-in) |
|---|---|---|
| What | Scripture spoken from the pulpit, voice commands ("next", "go back", "show John 3:16"), a live transcript | Plan a service from a written order of service; structure pasted lyrics into verses and choruses |
| Where it runs | This computer: Whisper (ONNX) in a worker in the control window | Claude (Anthropic API), called from main with the church's own key |
| What leaves the computer | Nothing. Audio and transcript stay in memory and are thrown away | Only what the operator typed or pasted, and (if ticked) the titles of the library's songs |
| Needs | A one-time speech model download (~80 MB, SHA-256 checked) | An Anthropic API key (Settings › Assistant), kept in the keychain like stream keys |
| When it's off | The microphone is never opened | No request is ever made |

Every action listening takes goes through the same commands as a click, with `source: 'voice'`
or `'auto-detect'`, so the audit log says why a verse appeared.

## Listening pipeline

```
mic (getUserMedia, chosen input) ── AudioWorklet: downmix + resample to 16 kHz
   └─► Segmenter (packages/detection)        energy VAD, adaptive noise floor, cuts at pauses,
         │                                    long speech cut at its quietest moment (≤ 6 s)
         ▼
   Transcriber (worker: transformers.js Whisper base.en, WebGPU, else WASM)
         │  text per utterance
         ├─► parseVoiceCommand (packages/detection)  a whole short utterance that is a command
         │        → actions.ts (step, stepAcross, goLive, clear, masks, show passage, version)
         └─► VerseDetector (packages/detection)      findReferencesInText + context + carry-over
                  → DetectionQueue: dedupe, cooldown, contiguous verses merge, expiry,
                    "not today"
                  → mode router: Off · Suggest · Approve · Auto (threshold), chapter-only
                    never auto
```

- **Voice commands are deliberately strict.** A command is acted on only when the whole
  utterance is the command ("next", "go back", "next slide please"), optionally after the
  wake word. "The next thing Paul says…" is preaching, not a command. With the wake word
  required ("Lampstand, next"), the preacher's microphone can't trigger anything by accident.
- **Context**: "John chapter 3 … verse 16 … and verse 17" resolves across pauses; the context
  lapses after 5 minutes without a reference.
- **Model files** are downloaded by main (`main/modules/speechModels.ts`), pinned to a commit,
  checked against SHA-256, stored in `userData/models/`, and served to the page through
  `lampstand-media://speech/<id>` (no network access for the page, no paths).
- **Interfaces** keep the engine swappable (`Transcriber`, BUILD_SPEC §0.8): a native
  whisper.cpp / sherpa-onnx `utilityProcess`, or a cloud engine, can replace the worker without
  touching the detector, the commands or the UI.

## Assistant (Claude)

- `main/ai/assistant.ts` is the only module that talks to Anthropic (`@anthropic-ai/sdk`;
  `securityCheck.mjs` enforces it). Model `claude-opus-5-5`, structured outputs
  (`betaZodOutputFormat`) so the reply is always a valid draft, refusal fallback on.
- **Planner**: the operator writes the order of service in their own words (or pastes the
  bulletin). Claude returns a `PlanDraft` (sections, songs, readings, announcements,
  countdowns, notes). `packages/planner` resolves it locally: songs matched against the library
  by title, references parsed by `@lampstand/scripture`, announcement and sermon-point slides
  made, anything unmatched kept as a labelled step with a note. The operator reviews it, then
  creates a new plan or adds to the open one: nothing changes before that.
- **Lyrics**: paste raw lyrics → sections labelled Verse 1, Chorus, Bridge… for the song editor.
- Errors (no key, bad key, no internet, rate limit, refusal) come back as plain sentences; the
  key never reaches a renderer or a log.

## Ideas, by when

**Built now:** service planner, lyrics structuring, scripture listening (explicit references,
context, Off/Suggest/Approve/Auto, approval queue), voice commands, live transcript.

**Next** (each fits an interface already in place):
1. Quoted-text detection: a verse read without its reference, matched against the installed
   versions' text (n-gram index, then word-level similarity; BUILD_SPEC §10.2 B).
2. Live captions: the transcript as subtitles on the stream or a screen of its own (§16).
3. Sermon points: key points from the transcript as slides the operator can show (opt-in: the
   transcript would go to Claude).
4. Sermon notes after the service: verses cited, points and a summary, to share.
5. Lyric follow: advance lyrics by the line being sung.
6. Song suggestions for a sermon's theme or readings, from the library.
7. Operator chat: "put the offering countdown on screen two" through the command bus (tool use).
8. Translation of captions and announcements for bilingual services.
9. A native transcriber (`utilityProcess`) for weaker computers; Windows and Intel benchmarks.
