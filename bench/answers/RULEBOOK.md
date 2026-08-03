# Recognition Adjudication Rulebook（认知判定裁决书）

> Golden labels follow these rules. When a new edge case forces a decision, the decision and its
> reasoning are appended here as precedent — labels must be reproducible by a second annotator.

## The four labels

- **knows** — the answer asserts a materially correct identity: right industry/offering for this brand.
- **unknown** — the answer states it lacks information about the brand (denial, in any phrasing).
- **confused** — the answer confidently asserts a wrong identity: wrong industry, a different company
  (same-name elsewhere), or fabricated specifics belonging to another entity.
- **unverified** — none of the above can be established from the text alone.

## Rules & precedents

**R1 · Recognition ≠ accuracy.** Correct identity with minor factual errors (wrong founding year,
wrong HQ city) is still **knows**. Identity is the industry/offering, not every detail.

**R2 · Confidence gates confusion.** Speculation ("可能是…/perhaps a…") about a wrong identity is
**unverified**, not confused. Confusion requires assertion.

**R3 · Any confident wrong-identity assertion → confused, even alongside correct parts.**
An answer that half-describes the real brand and confidently adds a wrong-industry product line
is **confused** (precedent: real doubao case listing both car-parts and apparel — the car-parts
assertion is a misattribution a reader would believe).

**R4 · Generic template advice** ("whether X is trustworthy depends on reviews, quality…") that never
asserts identity and never admits ignorance is **unverified** (precedent: real openai cases).

**R5 · "Not a well-known brand" + "insufficient public data"** counts as an admission → **unknown**,
even when followed by generic speculation (precedent: real glm case).

**R6 · Name echo is nothing.** Restating the brand name from the question adds zero signal →
**unverified**.

**R7 · Safety/policy refusals** ("I can't evaluate brands") are **unverified** — refusing is not
the same as not knowing.

**R8 · Descriptions inferred purely from the name's morphology** ("Custyle sounds like custom+style,
so it is probably a customization brand") are **unverified** — morphology guessing is not knowledge
(it fails on same-name-different-company cases by construction).

**R9 · Right industry, wrong company details** (correct sector, but the specifics — founders,
flagship product names — belong to another firm) is **confused**: the reader walks away believing
facts about a different entity.

**R10 · Evidence.** For confused labels the golden record stores the minimal verbatim span that
proves misattribution. Judges are expected to quote a verbatim span; paraphrased evidence counts
against evidence-fidelity but does not flip the golden label.
