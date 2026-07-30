# Phase 15 — Observability, Diagnostics & Operational Intelligence

## Objective
Introduce a dedicated **Observability & Operational Intelligence Subsystem** (`src/main/playlistObservability/`) that passively consumes domain events, aggregates execution metrics, builds execution timelines, evaluates diagnostic issues, calculates health scores, and generates actionable recommendations without modifying any core execution pipeline code.

This phase does not modify any Phase 1–14 code.

## Architecture
```text
Domain Events (from PlaylistEventBus across Phases 1-14)
        │
        ▼
PlaylistObservabilityService (Passive Observer Subscriber)
        │
        ├── 1. TimelineBuilder (Assembles ExecutionTimeline per correlationId)
        ├── 2. DiagnosticEngine (Evaluates DiagnosticIssue items & computes PlaylistHealth score)
        ├── 3. RecommendationEngine (Generates OperationalRecommendation actionable advice)
        └── 4. Metrics Aggregator (Tracks operation counts, average confidence, failure rates)
        │
        ▼
ObservabilitySnapshot (Dashboard DTO: Health + Metrics + Diagnostics + Recommendations)
```

## Features & Components
1. **Domain Models**:
   - `ExecutionTimelineEntry` & `ExecutionTimeline`: Phase-by-phase timeline entry model.
   - `DiagnosticIssue`: `id`, `code`, `severity` (`INFO` | `WARNING` | `CRITICAL`), `message`, `correlationId`, `timestamp`.
   - `PlaylistHealth`: `status` (`HEALTHY` | `WARNING` | `CRITICAL`), `score` (0 to 100), `activeIssueCount`.
   - `OperationalRecommendation`: `id`, `title`, `description`, `actionable`, `priority` (`LOW` | `MEDIUM` | `HIGH`).
   - `ObservabilityMetrics`: System-wide runtime metrics aggregator.
   - `ObservabilitySnapshot`: Read-only operational dashboard DTO.

2. **Engine Services**:
   - `TimelineBuilder`: Group events by correlation ID into chronological execution timelines.
   - `DiagnosticEngine`: Analyzes event patterns to derive diagnostic issues and compute health scores.
   - `RecommendationEngine`: Generates actionable system recommendations.
   - `PlaylistObservabilityService`: Subscribes to `PlaylistEventBus` and manages snapshot state.

3. **IPC Setup**:
   - Registers `playlistObservability:metrics`, `playlistObservability:timeline`, `playlistObservability:diagnostics`, `playlistObservability:health`, and `playlistObservability:snapshot`.
