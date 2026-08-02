# Phase 10 — Smart Playlist AST Compiler & Query Engine

## Objective
Implement an Abstract Syntax Tree (AST) schema, SQL query compiler, and evaluation engine (`SmartPlaylistEngine`) for dynamic rule-based smart playlists.

## Components Created
- `src/main/collections/query/ast.ts`
- `src/main/collections/query/QueryPlanner.ts`
- `src/main/collections/query/SmartPlaylistCompiler.ts`
- `src/main/collections/engine/SmartPlaylistEngine.ts`
- `src/main/collections/operations/smart/UpdateSmartPlaylistOp.ts`

## Key Architecture Contracts
- **`SmartQueryAST`**: Tree structure supporting logical `AND` / `OR` groups and condition nodes (`FIELD_COMPARISON`, `TEXT_CONTAINS`, `DATE_RANGE`, `NUMERIC_RANGE`).
- **`SmartPlaylistCompiler.compile(ast)`**: Translates JSON AST rules into type-safe SQL `WHERE` clauses for Drizzle ORM queries.
- **`SmartPlaylistEngine.evaluate(playlistId)`**: Executes compiled SQL queries against Nora's song library to compute dynamic matching track sets.

## Features & Technical Behavior
1. **Dynamic Rule Processing**: Supports complex multi-condition filters over genre, artist, play count, release year, rating, and file format.
2. **SQL Injection Security**: Compiles rules into parameterized Drizzle SQL expressions rather than concatenating raw strings.
3. **AST Validation**: Validates rule types, field boundaries, and operator compatibility prior to compilation.
