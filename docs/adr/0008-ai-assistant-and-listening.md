# 0008 — An opt-in online assistant, and offline listening

**Status:** accepted · 2026-11-27

**Context.** Churches want the software to do more of the operator's work: plan a service from a
written order of service, put up the verse the preacher just announced, and move to the next
slide when asked. Lampstand promises to work offline, with no accounts and no telemetry (§1,
§17.4).

**Decision.**

1. **Listening stays on this computer.** Speech is transcribed by Whisper (ONNX, through
   transformers.js) in a worker in the control window: WebGPU where the GPU allows, else
   WebAssembly (already allowed by ADR 0007's `'wasm-unsafe-eval'`, nothing else added). The
   model is downloaded once on request by main, pinned to a commit and checked against SHA-256
   (§10.4), and served to the page through `lampstand-media://speech/…`. Audio and transcript
   are never written or sent. Detection and voice commands are pure code in
   `packages/detection`, behind a `Transcriber` interface so a native or cloud engine can
   replace Whisper later (§0.8).
2. **The assistant is online, opt-in, and the church's own.** Planning and lyrics structuring
   need a large language model, which can't run offline on church laptops. They use Claude
   through Anthropic's API with a key the church enters (Settings › Assistant), stored with
   `safeStorage` like stream keys and never sent to a renderer or logged. Without a key no
   request is made. A request carries only what the operator typed or pasted, plus the
   library's song titles when they tick that option. Only `main/ai/` may import the SDK
   (`securityCheck.mjs`).

**Why not the Web Speech API?** In Electron it needs Google keys and sends audio to Google
(§2). **Why not whisper.cpp now?** A native module per platform and architecture, rebuilt in
CI and unpacked from the asar, is more to ship and sign than a worker; the interface leaves room
for it. **Why not a local LLM for planning?** Several GB to download and slow on the laptops
churches have; planning is occasional and the operator can wait a few seconds online.
