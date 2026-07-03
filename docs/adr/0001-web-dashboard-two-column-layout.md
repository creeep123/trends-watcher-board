# ADR-0001: Use a two-column module layout for the web dashboard

**Date:** 2026-07-03  
**Status:** Proposed

## Context

The home dashboard currently renders all source modules in a four-column desktop grid. This makes each module too narrow for long trend keywords, repository names, Reddit/HackerNews titles, and action badges. The product is a trend research board, so readable keywords are the primary interface.

Mobile already uses source tabs and shows one module at a time. That mobile seam works and should not be disturbed.

## Decision

Use a conservative two-column module layout on desktop and keep the mobile tabbed layout unchanged.

The implementation should also remove desktop one-line title clamps and avoid horizontal card scrolling as a readability fallback.

## Consequences

Positive:

- Wider cards make keywords and titles readable.
- First row naturally becomes `Trending Now` + `Related Queries`.
- Mobile remains stable because existing tabs still gate sections.
- The change is localized to layout and card display classes.

Negative / tradeoffs:

- Fewer source modules are visible above the fold compared with four columns.
- Some modules become taller, so list scroll height must be revisited.
- The dashboard remains source-oriented rather than becoming a unified decision cockpit.

## Rejected alternatives

### Bento / giant opportunity dashboard

Rejected for this iteration. It may look stronger in a static prototype, but it would require rethinking source grouping, mobile behavior, and expanded card states. The user explicitly wants to avoid a large information panel that does not translate to mobile.

### Focus lane + signal rail

Rejected for this iteration. It improves the primary stream but demotes secondary sources into a rail and introduces a new information architecture. That is too large for the requested incremental adjustment.

### Only change `lg:grid-cols-4` to `lg:grid-cols-2`

Rejected as incomplete. The code also contains desktop one-line clamps, card-level horizontal scrolling, and list viewport constraints that must be reviewed for the readability fix to actually hold.

## Follow-up

See `docs/superpowers/specs/2026-07-03-web-two-column-layout-design.md` for the detailed implementation checklist and validation matrix.
