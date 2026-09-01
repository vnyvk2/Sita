---
name: topic-analysis
description: Deeply analyze an existing or potential product capability across its current implementation, architecture, completeness, user-facing features, external service capabilities, gaps, design opportunities, and future roadmap. Use when asked to investigate how well a feature/domain is implemented, what exists, what is missing, what the system currently supports, or what the capability could become.
---

# Capability / Feature Domain Audit (Topic Analysis)

## Purpose

Perform a deep, multidisciplinary audit of a specific capability or domain within the application.

This is NOT merely a code review.

The objective is to determine:

1. What currently exists.
2. What is actually implemented versus merely scaffolded.
3. What currently works.
4. What is incomplete or broken.
5. How the capability is architecturally implemented.
6. What the application currently exposes to users.
7. What the external service/platform can provide.
8. What capabilities are missing.
9. What capabilities would meaningfully benefit the product.
10. What the best future design could look like.
11. What should be implemented first.
12. What should NOT be implemented.
13. What technical or product constraints exist.

The final result should give the user a complete understanding of the capability and allow an informed decision about its future direction.

---

# 1. Understand the Domain Before Judging the Code

First understand the domain itself.

If the capability depends on an external service, research the current official capabilities, APIs, limitations, authentication model, quotas, available endpoints, supported data, and relevant policies.

Do not assume that the existing implementation represents the full capability of the external service.

Distinguish:

- What the service supports.
- What Nora supports.
- What Nora partially supports.
- What Nora's architecture could support.
- What is desirable for Nora.
- What is unnecessary.

Do not automatically try to expose every external capability.

---

# 2. Repository Archaeology

Inspect the repository comprehensively for the target capability.

Search for:

- service names
- API clients
- endpoints
- types
- interfaces
- adapters
- repositories
- database tables
- migrations
- settings
- environment variables
- IPC handlers
- preload APIs
- React hooks
- components
- routes
- query keys
- stores
- caching
- background jobs
- workers
- event handlers
- tests
- mocks
- fixtures
- documentation
- TODOs
- feature flags
- dead/unused code

Search by both:

- the obvious feature/service name
- concepts associated with the feature

For example, a Last.fm audit should not only search for `lastfm`.
Also investigate concepts such as:

- scrobble
- now playing
- artist
- album
- track
- tag
- similar
- recommendation
- love
- library
- user
- authentication
- session
- artwork
- playcount
- top tracks
- top artists
- recent tracks

The implementation may use abstractions that do not contain the service name.

---

# 3. Determine Implementation Status

Classify every discovered component.

Use statuses such as:

- Fully implemented
- Partially implemented
- Implemented but unused
- Implemented but incomplete
- Implemented but broken
- Scaffolded only
- Deprecated
- Dead code
- Planned but absent
- Unknown / requires verification

Do not call something "implemented" merely because a function exists.

A capability is implemented only when the relevant end-to-end behavior actually exists.

For example:

```text
API client
→ service
→ persistence
→ state/query
→ IPC
→ UI
→ user action
```

If only the API client exists, classify the feature accordingly.

---

# 4. Trace End-to-End Capability

For every important feature, trace:

```text
User intent
→ UI
→ renderer state/query
→ IPC
→ main service
→ external API
→ response
→ persistence/cache
→ state update
→ UI
```

(Where applicable.)

Determine exactly where the chain stops.

Example:

```text
Last.fm authentication
       ↓
API client              ✓
       ↓
Session persistence     ✓
       ↓
Scrobbling service      ✓
       ↓
Playback integration    ?
       ↓
Automatic scrobbling    ✗
```

---

# 5. Build a Capability Matrix

Create a matrix like:

| Capability      | External Service | Nora Code | User Accessible | Status     | Notes |
| :-------------- | :--------------- | :-------- | :-------------- | :--------- | :---- |
| Authentication  | Yes              | Yes       | Yes             | Complete   | ...   |
| Scrobbling      | Yes              | Partial   | Partial         | Incomplete | ...   |
| Now Playing     | Yes              | Yes       | No              | Partial    | ...   |
| Similar Artists | Yes              | No        | No              | Missing    | ...   |
| Tags            | Yes              | Partial   | No              | Partial    | ...   |

Do not invent capabilities.
Verify them through official documentation when external services are involved.

---

# 6. Analyze Current Architecture

Determine how the existing capability fits into the application's architecture.

Identify:

- ownership
- data flow
- state ownership
- persistence
- caching
- API boundaries
- IPC boundaries
- lifecycle
- error handling
- retries
- authentication
- rate limiting
- background execution

Ask:

> Is the current architecture appropriate?

Look for:

- duplicated logic
- wrong ownership
- bypassed abstractions
- tight coupling
- missing abstraction boundaries
- inappropriate persistence
- state duplication
- poor lifecycle handling

---

# 7. Analyze Current Implementation Quality

Perform a focused code review of the capability.

Look for:

### Correctness

- incorrect behavior
- missing edge cases
- stale state
- incorrect API assumptions

### Reliability

- failed requests
- retry behavior
- authentication expiry
- partial failure
- offline behavior

### Concurrency

- overlapping requests
- duplicate scrobbles
- race conditions
- event storms
- queue behavior

### Performance

- excessive API requests
- unnecessary polling
- duplicate requests
- poor caching
- excessive DB writes

### Lifecycle

- startup
- shutdown
- reconnect
- logout
- account switching

### Data integrity

- duplicate records
- incorrect mappings
- stale metadata
- lost state

### Security

- credentials
- tokens
- secrets
- external API trust boundaries

---

# 8. Distinguish Code Completeness From Product Completeness

This is critical.

A capability can be:

- **Technically implemented**: 80%
- **Product capability**: 30%

For example, an API client may implement 15 endpoints while Nora exposes only one user-facing workflow.

Analyze both separately.

---

# 9. Analyze the User Experience

Determine:

- What can the user actually do?
- Where is the feature exposed?
- Is it discoverable?
- Is setup understandable?
- Is feedback provided?
- Are failures understandable?
- Is the feature useful in its current state?
- Does it integrate naturally with Nora?

Don't evaluate only backend functionality.

---

# 10. Discover the Full Potential

After understanding the current implementation, research what the external service can offer.

For an external platform, investigate:

- official APIs
- supported endpoints
- authentication
- user data
- metadata
- recommendations
- social features
- statistics
- personalization
- tagging
- discovery
- historical data
- integrations
- rate limits
- API limitations
- deprecated functionality

Use authoritative sources wherever possible.
Do not treat third-party speculation as confirmed platform capability.

---

# 11. Map External Capability to Nora

Do not simply produce:

> "Last.fm supports X, Y, Z."

Instead classify:

- **High-value for Nora**: Capabilities that strongly complement the existing product.
- **Potentially useful**: Capabilities that could be valuable depending on UX/design.
- **Low-value**: Capabilities that technically work but add little to Nora.
- **Not recommended**: Capabilities that introduce complexity without sufficient benefit.

This is a product + engineering judgment, not merely an API inventory.

---

# 12. Identify Missing Capabilities

For each important missing feature, explain:

- what it does
- why it matters
- dependencies
- implementation complexity
- architectural impact
- UX implications
- external API limitations
- testing requirements

Do not turn every missing API endpoint into a feature request.

---

# 13. Look for Synergies With Existing Nora Features

This is especially important.

Ask how the capability could interact with:

- library
- player
- queue
- playlists
- metadata
- artist pages
- album pages
- recommendations
- search
- downloads
- lyrics
- statistics
- settings
- history
- favorites
- discovery

Look for opportunities where one capability enables another.

Example:

```text
Last.fm scrobbling
      ↓
Listening history
      ↓
Artist statistics
      ↓
Similar artists
      ↓
Discovery
      ↓
Queue generation
```

But do not assume the entire chain should be implemented. Evaluate each step.

---

# 14. Generate Design Options

For meaningful future capabilities, consider multiple designs.

For example:

- **Option A**: Minimal integration.
- **Option B**: Deep integration into existing architecture.
- **Option C**: Unified abstraction that supports multiple music services.

For each:

- advantages
- disadvantages
- complexity
- performance
- maintainability
- migration cost
- future extensibility

Then recommend one.

---

# 15. Do Not Over-Generalize

Do not introduce a generic abstraction merely because another service might someday be supported.

Ask:

> Does abstraction solve a current architectural problem?

If Spotify, Last.fm, MusicBrainz, ListenBrainz, etc. genuinely share a domain concept, investigate whether a common abstraction is appropriate.

But don't create:
`UniversalMusicPlatformService`
just because multiple services exist.

---

# 16. Determine the Best Future Architecture

Based on:

- current code
- current product
- external capabilities
- user value
- complexity
- constraints

Propose the best architecture for the capability.

Describe:

- components
- responsibilities
- data flow
- ownership
- persistence
- caching
- API boundaries
- state management
- error handling
- concurrency
- lifecycle

The recommendation should fit Nora's existing architecture where possible.

---

# 17. Prioritize the Roadmap

Create a prioritized roadmap.

Example:

- **Phase 1 — Complete existing foundation**: Fix incomplete/current functionality.
- **Phase 2 — High-value user features**: Add the capabilities with the highest user value.
- **Phase 3 — Deeper integration**: Connect the capability to existing Nora systems.
- **Phase 4 — Advanced features**: Only after the foundation is stable.

For each item estimate relative complexity:

- Low
- Medium
- High
- Very High

Do not pretend to know exact development time unless there is sufficient evidence.

---

# 18. Identify What NOT to Build

This is required.

A good domain audit should identify:

- low-value features
- redundant features
- expensive features with little benefit
- features that conflict with Nora's architecture
- features limited by external APIs
- features that create disproportionate maintenance cost

The goal is not to maximize feature count.
The goal is to maximize useful capability.

---

# 19. Identify Technical Debt

Separate:

- **Feature gaps**: Something doesn't exist.
- **Implementation debt**: Something exists but is poorly implemented.
- **Architectural debt**: The current structure makes future work unnecessarily difficult.
- **Product debt**: The capability technically exists but is incomplete from the user's perspective.

These should not be conflated.

---

# 20. Identify Unknowns

Explicitly document things that cannot be established.

Examples:

- undocumented API behavior
- unclear external service limitations
- runtime behavior not reproducible
- unused code whose intended purpose is unclear

Never fill unknowns with assumptions.

---

# 21. Final Deliverable

Produce:

1. **Capability Overview**: What the capability is and why it matters.
2. **Current Implementation Status**: What exists today.
3. **Architecture**: How it currently works.
4. **End-to-End Flows**: Important user/data flows.
5. **Capability Matrix**: External capabilities vs Nora implementation.
6. **Current Problems**: Confirmed bugs, incomplete areas, architectural weaknesses.
7. **Product Gaps**: What users cannot currently do.
8. **External Service Capabilities**: What the platform can actually provide.
9. **Opportunity Analysis**: What would be valuable for Nora.
10. **Design Options**: Alternative future approaches and trade-offs.
11. **Recommended Architecture**: The best approach and why.
12. **Prioritized Roadmap**: What to build first, second, and later.
13. **What Not To Build**: Explicit exclusions.
14. **Risks / Constraints**: Technical and product limitations.
15. **Testing Strategy**: How future implementation should be validated.
16. **Final Assessment**: Summarize implementation maturity, architectural maturity, product maturity, biggest opportunities, biggest risks, and recommended next step.

---

# 22. Separate Four Different Questions

Never collapse these into one conclusion.

Evaluate independently:

1. **What does the external service support?**
2. **What has Nora implemented?**
3. **What does Nora currently expose to users?**
4. **What should Nora actually implement?**

These are different questions:

- A feature being supported by the external service does not mean Nora should implement it.
- A feature existing in the code does not mean it is complete.
- A feature being technically complete does not mean its UX is good.
- A missing feature does not automatically represent a product gap.

---

## Invocation & Scope Guidance

You can invoke this skill with prompts such as:

> _"Run a capability audit for Last.fm. I want to understand its current implementation, maturity, what is actually usable, everything we could potentially do with it, and what you recommend we build."_

This skill moves sequentially through:
`Code Archaeology` → `Current Status` → `Product Capability` → `External Research` → `Design` → `Roadmap`
without confusion between code review, diff inspection, or implementation.
