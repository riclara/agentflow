# Fix: OpenCode Agent Key Bug

**Date:** 2026-03-23

## Description

The `opencode.json` config file was using the wrong key name "agents" (plural), but opencode expects "agent" (singular). This caused the error:

```
Config file at opencode.json is invalid: Unrecognized key: agents
```

## Root Cause

The merger function in `src/core/merger.ts` was generating "agents" as the key name when merging the agent configuration into `opencode.json`. However, the opencode CLI expects the key to be named "agent" (singular), not "agents" (plural).

## Files Changed

1. **src/core/merger.ts** - Changed key from `agents` to `agent` in `mergeOpencodeJson()` function
2. **/Users/riclara/workspace/invoice-generator/opencode.json** - Renamed key from `agents` to `agent`
3. **README.md** - Updated documentation reference (line 141)
4. **README.es.md** - Updated documentation reference (line 142)
5. **docs/agentflow-spec.md** - Updated all 4 documentation references (lines 88, 1039, 1162, 1220)

## How to Verify

1. Run `npm test` to ensure tests pass
2. Run `npm run build` to verify build succeeds
3. Run `cd /Users/riclara/workspace/invoice-generator && npx opencode-ai debug config` and verify the `agent` key appears with the four agent paths