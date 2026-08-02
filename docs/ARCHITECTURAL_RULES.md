# Nora Music Player — 10 Core Architectural Rules

This document outlines the mandatory architectural principles governing all engineering and subsystem implementations in Nora. Every feature, engine, and phase must strictly adhere to these rules.

---

### RULE 1: Do Not Create Shortcuts
If a feature requires a new subsystem, build the subsystem instead of embedding logic into existing modules.

---

### RULE 2: Respect Architectural Layers
Maintain strict layer hierarchy:
```text
Library → Metadata → Tags → Rules → Collections → Recommendations → Automation → AI
```
- Higher layers may consume lower layers.
- Lower layers must **NEVER** depend on higher layers.

---

### RULE 3: Every Subsystem Owns Its Own Data
- Do not allow Search, Rules, AI, or UI to own metadata.
- Do not allow Recommendations to own tags.
- Do not allow Collections to own metadata.
- Each subsystem is the sole source of truth for its own domain.

---

### RULE 4: Engines Communicate Through Interfaces and Events
- Never access another engine's internal repository directly.
- Always consume its public interface or react to its event bus.

---

### RULE 5: Repositories Only Perform Persistence
- Business logic belongs inside Engines.
- Repositories must never implement domain decisions or business calculations.

---

### RULE 6: Keep Modules Loosely Coupled
- Avoid circular dependencies.
- Prefer dependency injection.
- Prefer explicit interface contracts.
- Prefer registry patterns for dynamic extensions.

---

### RULE 7: Design for Extensibility
Assume future support for:
- Plugins
- External metadata providers (MusicBrainz, Spotify, Discogs)
- AI features
- Online services
- Custom user rules

Avoid hardcoded implementations.

---

### RULE 8: Backward Compatibility is Required
- Do not break existing functionality.
- Prefer adapters over rewrites.
- Search, Collections, Library, Import, and Export must continue working across all refactors.

---

### RULE 9: Every Phase Must Be Production-Ready
- No temporary hacks.
- No TODO implementations.
- No dead code.
- No partial wiring.
- Every phase must leave the codebase clean, tested, and production-ready.

---

### RULE 10: Favor Architecture Over Convenience
- Do not optimize for fewer files.
- Optimize for long-term maintainability, structural clarity, and architectural integrity.
