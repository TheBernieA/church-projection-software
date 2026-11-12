# 0005 — Scripture slide splitting and multi-part references

**Status:** accepted · 2026-11-12

- "Fit as many as possible" uses a **character budget** (default 320, configurable) per slide, divided between
  versions in multi-version display. The renderer then auto-fits the font size to the safe area (binary search), so a
  slide never overflows. Pure-measurement splitting would need DOM access in the slide builder; the budget keeps it
  pure, testable and fast.
- Verses longer than the budget are split at sentence → clause → word boundaries, never mid-word.
- A service item holds **one passage range**. The quick bar collapses a multi-part reference such as
  "Romans 8:28, 31–39" into its overall span (8:28–39). Supporting lists of ranges per item is a schema change for later.
