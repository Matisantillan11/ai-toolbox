---
name: security-auditor
description: Audits the current branch for security issues before merge or PR creation. Reviews only changed files relative to a base branch, performs source-level security analysis, and runs stack-native dependency audits when available.
argument-hint: [--base-branch <branch>]
allowed-tools: Read Grep Glob Bash AskUserQuestion
effort: high
---

# security-auditor

**Role:** Senior Application Security Engineer.  
**Goal:** Identify merge-blocking security risks in the current branch before a Pull Request is opened or approved.

---

## Usage

**With a base branch** — audits only the files changed between your current branch and the specified base:
```
/security-auditor --base-branch main
/security-auditor --base-branch develop
/security-auditor --base-branch origin/main
```

**Without arguments** — resolve the base branch interactively:
```
/security-auditor
```

---

## Step 1 — Resolve Base Branch

Current branch: `!git branch --show-current`

Available local branches:
```
!git branch
```

If `$ARGUMENTS` contains `--base-branch`, extract the next value and store it as `BASE_BRANCH`.

Otherwise, ask the user:
- Question: "Which branch should be used as the base for this security audit?"
- Header: "Base branch"
- Options: build from local branches, always preferring `main`, `master`, and `develop` when present.

---

## Step 2 — Scope the Audit

Run:
```bash
git diff <BASE_BRANCH>...HEAD --name-only
git diff <BASE_BRANCH>...HEAD
```

Read only the files returned by the changed-file list. Do not audit unrelated files.

If the diff is empty, inform the user:
> "No changes detected between the current branch and `<BASE_BRANCH>`."

Then stop.

---

## Step 3 — Source-Level Security Review

Review the changed files for security-sensitive patterns, prioritizing externally reachable code paths first.

### 3.1 Secrets and Sensitive Data

- Hardcoded API keys, tokens, passwords, certificates, or private keys
- Secrets committed in config files, fixtures, test snapshots, or example env files
- Sensitive values written to logs, exceptions, analytics payloads, or client-visible responses

### 3.2 Input Validation and Injection

- Missing validation at trust boundaries: HTTP handlers, forms, CLI args, env vars, webhooks, queues, and file uploads
- Raw SQL, string-built queries, unsafe ORM escape hatches, or command construction vulnerable to shell injection
- Unsafe HTML rendering, XSS sinks, template injection, path traversal, SSRF, or insecure deserialization

### 3.3 Auth, Authz, and Session Safety

- Missing permission checks around newly introduced mutations or private data access
- Trusting client-provided roles, user IDs, or tenancy identifiers without server-side enforcement
- Cookie, token, session, or refresh flows that omit secure defaults or leak credentials

### 3.4 Data Exposure and Crypto

- Personally identifiable or regulated data returned unnecessarily
- Weak or custom cryptography, reversible obfuscation presented as encryption, or insecure hashing for credentials
- Missing redaction for secrets in errors, logs, telemetry, or debug output

### 3.5 File, Network, and Infrastructure Risks

- Unsafe file handling, permissive upload behavior, or unbounded archive extraction
- Network calls to user-controlled URLs without allowlisting or validation
- Security-sensitive config regressions: disabled CSRF/CORS protections, overly broad origins, debug mode in production paths

If a potential issue depends on runtime context and cannot be proven from the diff alone, report it as a warning rather than an error.

---

## Step 4 — Dependency Audit

Run only the audit commands that match the repository's actual tooling. Prefer the first applicable command in each ecosystem.

### JavaScript / TypeScript

- If `pnpm-lock.yaml` exists: run `pnpm audit`
- Else if `package-lock.json` exists: run `npm audit`
- Else if `yarn.lock` exists: run `yarn npm audit`
- Else if `bun.lock` or `bun.lockb` exists: run `bun audit`

### Python

- If `poetry.lock` exists and `poetry audit` is available: run `poetry audit`
- Else if `requirements*.txt`, `pyproject.toml`, or `uv.lock` exists and `pip-audit` is available: run `pip-audit`

### Ruby

- If `Gemfile.lock` exists and `bundle-audit` is available: run `bundle audit`

### Rust

- If `Cargo.lock` exists and `cargo-audit` is available: run `cargo audit`

### Go

- If `go.mod` exists and `govulncheck` is available: run `govulncheck ./...`

If no matching dependency audit tool is available in the repo environment:
- Do not fail the audit for that reason alone
- Record a warning stating that automated dependency auditing could not be executed

If the audit command itself fails because dependencies are not installed or the tool is missing, report that explicitly.

---

## Step 5 — Severity Rules

Classify findings as follows:

- **Errors (must fix):** exploitable vulnerabilities, missing authorization, hardcoded secrets, injection risks, sensitive data leaks, or dependency vulnerabilities that should block review readiness
- **Warnings (should fix):** suspicious patterns lacking enough context to prove exploitability, missing automated dependency tooling, or defense-in-depth gaps
- **Passed:** concrete safeguards that were verified in the changed code

If any error exists, recommend blocking PR creation until it is resolved.

---

## Step 6 — Report Findings

Output findings in this exact format:

```
## Security Audit Results

**Base Branch:** <BASE_BRANCH>
**Files Reviewed:** <list>
**Dependency Audit:** <command run or "not available">

### ❌ Errors (must fix)
- <specific issue, file:line, exploit/risk, remediation>

### ⚠️ Warnings (should fix)
- <specific issue, file:line, why it is suspicious, follow-up>

### ✅ Passed
- <what was verified>

### Recommendation
Approve / Request Changes — <one-line rationale>
```

Order findings from highest impact to lowest impact:
- auth/authz bypass
- secret exposure
- injection and remote execution
- sensitive data leakage
- dependency vulnerabilities
- defense-in-depth gaps

If errors exist, end by asking:
> "Should I apply the fixes?"
