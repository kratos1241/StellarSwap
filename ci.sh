#!/usr/bin/env bash
# Local CI — 4 tests that mirror what a GitHub Actions pipeline would run.
# Run from the project root: bash ci.sh
# Exit code 0 = all tests green.

set -euo pipefail

PASS="\033[0;32m✓\033[0m"
FAIL="\033[0;31m✗\033[0m"
BOLD="\033[1m"
RESET="\033[0m"

passed=0
failed=0

run_test() {
  local name="$1"
  local cmd="$2"
  printf "\n${BOLD}[TEST %d] %s${RESET}\n" "$((passed + failed + 1))" "$name"
  printf "  CMD: %s\n" "$cmd"
  if eval "$cmd" 2>&1 | sed 's/^/  /'; then
    printf "  ${PASS} PASSED\n"
    ((passed++))
  else
    printf "  ${FAIL} FAILED\n"
    ((failed++))
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        StellarSwap — Local CI/CD         ║"
echo "╚══════════════════════════════════════════╝"

# ── Test 1: Contract unit tests ────────────────────────────────────────────────
# Runs all 8 Rust unit tests across token, lp_share, and pool crates.
run_test \
  "Contract Unit Tests (cargo test --workspace)" \
  "cargo test --workspace --features testutils 2>&1"

# ── Test 2: WASM compilation ───────────────────────────────────────────────────
# Verifies all three contracts compile to valid WASM for Soroban.
run_test \
  "WASM Build (cargo build --target wasm32-unknown-unknown)" \
  "cargo build --target wasm32-unknown-unknown --release --workspace 2>&1"

# ── Test 3: Frontend TypeScript type check ─────────────────────────────────────
# Catches any type errors without emitting JS output.
run_test \
  "Frontend TypeScript Check (tsc --noEmit)" \
  "cd frontend && npm run type-check 2>&1 && cd .."

# ── Test 4: Frontend production build ─────────────────────────────────────────
# Full Next.js static export — catches import/bundling issues and lint errors.
run_test \
  "Frontend Production Build (next build)" \
  "cd frontend && npm run build 2>&1 && cd .."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────"
printf "  ${PASS} Passed: %d   ${FAIL} Failed: %d\n" "$passed" "$failed"
echo "────────────────────────────────────────────"

if [ "$failed" -gt 0 ]; then
  echo "  CI FAILED"
  exit 1
else
  echo "  CI PASSED"
  exit 0
fi
