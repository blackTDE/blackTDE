# TDE — Terminal Development Environment

## Product Requirements Document (PRD)

Version: v1.0
Author: Product Design Draft
Target Platforms: macOS, Windows, Linux

---

# 1. Product Vision

TDE (Terminal Development Environment) is a desktop operating environment for AI coding agents.

It provides a persistent, visual, multi-agent workspace for terminal-native coding agents such as:

* Claude Code
* Codex CLI
* OpenCode
* Aider
* Gemini CLI
* Qwen Code
* OpenHands CLI
* PI Agent CLI
* Custom internal agents

TDE transforms fragmented terminal workflows into a unified development cockpit with:

* persistent sessions
* project workspaces
* provider management
* visual file operations
* git integration
* remote control
* agent orchestration
* MCP & skills management

Core philosophy:

> “AI coding agents should feel like first-class operating system processes, not disposable terminal commands.”

---

# 2. Product Goals

## Primary Goals

### G1 — Persistent Agent Workspace

Users never lose agent sessions again.

### G2 — Unified Multi-Agent Environment

Manage all coding agents from one application.

### G3 — Provider Abstraction

Instantly switch models/providers without manual configuration edits.

### G4 — Visual Agent Operations

Bring IDE-grade visibility to terminal-native agents.

### G5 — Remote Agent Control

Control local or remote coding agents from desktop/mobile/web.

---

# 3. User Problems

## P1 — Session Loss

Terminal closes → session lost → user manually recovers session IDs.

## P2 — Context Fragmentation

Users constantly switch between:

* terminal
* IDE
* git UI
* file explorer
* provider config
* tmux

## P3 — Provider Configuration Complexity

Changing providers requires:

* environment variables
* config file edits
* restarts
* credential management

## P4 — Poor Multi-Agent Visibility

Users cannot:

* see all active agents
* monitor progress
* recover blocked agents
* coordinate agents

## P5 — Remote Inaccessibility

Users cannot easily manage coding agents from:

* mobile devices
* secondary machines
* browsers

---

# 4. Core Product Concept

TDE is a hybrid between:

* terminal emulator
* lightweight IDE
* AI agent runtime manager
* orchestration dashboard
* persistent session manager

---

# 5. Core Features

# 5.1 Workspace System

Each workspace contains:

* project directory
* sessions
* terminal layouts
* provider settings
* git metadata
* MCP configuration
* skills
* agent preferences

---

# 5.2 Session Manager

## Features

* automatic session ID detection
* automatic session recovery
* searchable session history
* session snapshots
* transcript persistence
* session tagging
* pinned sessions
* crash recovery
* auto-resume

## Session Metadata

Each session stores:

* agent type
* provider
* model
* cwd
* environment
* git branch
* transcript
* tool calls
* token usage
* timestamps

---

# 5.3 Multi-Panel Workspace

## Layout

### Left Panel

* project explorer
* session list
* workspace navigation
* recent sessions
* task queue

### Center Panel

* terminal panes
* split layouts
* terminal tabs
* agent interactions

Supports:

* 1x1
* 1x2
* 2x2
* dynamic resize

### Right Panel

Tabbed utilities:

* file tree
* git status
* diagnostics
* MCP tools
* logs
* agent activity

---

# 5.4 Embedded File Operations

## Features

* file preview
* inline editing
* diff viewer
* markdown preview
* image preview
* syntax highlighting
* terminal-linked navigation

## Advanced Features

* agent edit timeline
* AI-generated diff summaries
* rollback checkpoints

---

# 5.5 Git Integration

## Features

* visual git status
* commit history
* branch switching
* staged/unstaged diff
* blame viewer
* worktree management

## Agent Awareness

Show:

* which agent modified which file
* generated commit summaries
* agent task lineage

---

# 5.6 Provider Management Layer

## Supported Providers

* OpenAI
* Anthropic
* Gemini
* OpenRouter
* Ollama
* LM Studio
* DeepSeek
* Groq
* Together
* custom OpenAI-compatible APIs

## Features

* one-click switching
* provider presets
* encrypted credential vault
* provider health monitoring
* latency metrics
* token cost tracking
* failover routing

---

# 5.7 Agent Runtime Adapter System

Abstract all agent CLIs behind a unified runtime layer.

## Adapter Responsibilities

* process lifecycle
* stdout parsing
* session extraction
* command injection
* prompt streaming
* interruption handling
* permission interception

## Supported Agents

* Claude Code
* Codex CLI
* OpenCode
* Gemini CLI
* Aider
* OpenHands
* Custom adapters

---

# 5.8 MCP & Skills Management

## Features

* install/remove MCP servers
* visual MCP configuration
* skills marketplace
* shared skills library
* provider-scoped skills
* workspace-scoped skills

---

# 5.9 Agent Safety Layer

## Features

* shell command approval
* dangerous operation detection
* sandbox execution
* network access controls
* filesystem scope controls
* permission replay log

---

# 5.10 Remote Control System (Future)

## Features

* web dashboard
* mobile companion
* push notifications
* remote approvals
* remote prompt injection
* remote monitoring
* browser terminal streaming

---

# 6. Technical Architecture

# 6.1 Desktop Stack

## Recommended

### Shell

Rust

### Desktop Framework

Tauri

### Frontend

Next.js + React

### Terminal

xterm.js

### State

Zustand / Redux

### Local Database

SQLite

### Process Runtime

Rust async runtime

---

# 6.2 Why Tauri Instead of Electron

Benefits:

* lower memory usage
* native performance
* Rust process control
* better terminal orchestration
* smaller package size

---

# 6.3 Runtime Architecture

## Core Components

### Agent Runtime Manager

Controls all CLI processes.

### Session Persistence Engine

Stores:

* transcripts
* layouts
* metadata
* checkpoints

### Provider Router

Injects:

* env vars
* config patches
* proxy routing

### Event Bus

Streams:

* terminal events
* agent state
* tool calls
* git updates

---

# 7. MVP Scope

## Include

* multi-pane terminal
* session persistence
* provider switching
* project workspaces
* git status
* file tree
* embedded editor
* Claude/Codex/OpenCode support

## Exclude

* mobile app
* cloud sync
* team collaboration
* distributed execution
* agent swarms

---

# 8. Future Roadmap

# Phase 1 — Local TDE

Goal:
Best local AI agent desktop environment.

# Phase 2 — Persistent Runtime

Goal:
Background daemon with auto-recovery.

# Phase 3 — Remote Control

Goal:
Web/mobile control plane.

# Phase 4 — Multi-Agent Orchestration

Goal:
Agent teams and delegation.

# Phase 5 — Distributed Cloud Runtime

Goal:
Run agents across local + cloud infrastructure.

---

# 9. Differentiation

TDE is NOT:

* just another terminal
* just another chat app
* just another IDE plugin

TDE is:

> “An operating system for AI coding agents.”

---

# 10. Biggest Product Risks

## R1 — Vendors Building Native GUIs

Anthropic/OpenAI may ship official desktop apps.

Mitigation:
Remain provider-agnostic.

## R2 — Terminal Parsing Fragility

Different CLIs change formats.

Mitigation:
Adapter/plugin architecture.

## R3 — Security Concerns

Agents execute dangerous commands.

Mitigation:
Permission system + sandboxing.

## R4 — Becoming a Heavy IDE

Avoid competing directly with VSCode.

Mitigation:
Stay workflow-centric, not editor-centric.
