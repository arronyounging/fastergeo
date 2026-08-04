# Matching spec rules (M-series)

The golden encodes these decisions; changing any of them requires updating both this file and
`golden.jsonl`, and re-running the bench.

- **M1 · Latin = word boundary, case-insensitive.** `(?<![\w-])name(?![\w-])` — "Custyle" never hits
  "Custylex", "SuperCustyle", "custyle_pro".
- **M2 · Hyphen compounds do not match.** "Custyle-style", "anti-Custyle" are excluded. Precision rule:
  hyphenated identifiers (model slugs, compounds) are a distinct-token minefield; the recall cost is
  accepted and documented.
- **M3 · CJK = exact substring.** No word boundaries exist; an alias that is a substring of another
  entity's name will match it (云杉 hits 云杉出行 and 云杉 the tree). Guidance: pick CJK aliases that are
  not substrings of other names. Space- or hyphen-broken CJK ("云杉 出行") does not match.
- **M4 · Names shorter than 2 chars (trimmed) are ignored** — in `mentions`, `firstMentionIndex` AND
  `matchRanges` identically. Metrics and display share one spec.
- **M5 · No unicode normalization.** Fullwidth Latin (Ｃｕｓｔｙｌｅ) and zero-width-space-broken names
  do not match: normalization would desynchronize match offsets from the original text, breaking
  verbatim replay highlighting. Documented limitation, revisit only with offset-preserving mapping.
