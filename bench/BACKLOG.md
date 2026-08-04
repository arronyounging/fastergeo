# bench backlog — noticed while polishing, not acted on (per plan discipline)

- sentiment.ts SENTENCE_RE splits on raw [.!?] — decimals in prices could split
  sentences mid-number (commerce got a decimal-safe splitter; sentiment should share it).
  Candidate for Pass 3/consolidation: one shared sentence splitter.
- matching M5: fullwidth/zero-width normalization needs an offset-preserving
  mapping before it can be honest; revisit if field cases surface.
- recognition golden: keep appending real field probes each cycle run.
