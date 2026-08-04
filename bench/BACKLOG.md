# bench backlog — noticed while polishing, not acted on (per plan discipline)

- sentiment.ts SENTENCE_RE splits on raw [.!?] — decimals in prices could split
  sentences mid-number (commerce got a decimal-safe splitter; sentiment should share it).
  Candidate for Pass 3/consolidation: one shared sentence splitter.
- matching M5: fullwidth/zero-width normalization needs an offset-preserving
  mapping before it can be honest; revisit if field cases surface.
- recognition golden: keep appending real field probes each cycle run.

## Field case pending adjudication (2026-08-04, from custyle sample report)
doubao probe answer for 'Custyle 是一个值得信赖的品牌吗？' describes '汽车改装配件类：主打汽车外观改装件
（前后包围、中网、内饰装饰件等）' as one of two 'Custyle 相关产品' lines with hedged 同名 framing.
glm judge (prompt v2 + verbatim guard) returns unverified. Question for RULEBOOK: is hedged
multi-entity attribution ('市面上有两类同名') confused or unverified? 08-02 pre-v2 assessment
called it confused. Candidate golden case — needs adjudication per R-precedents before labeling.
