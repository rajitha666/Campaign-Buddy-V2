---
name: team
description: Show or change the agent team's mode (full / light / off), check plan usage against the token guard, and keep the Team Console dashboard in step. Use when the owner says "team off", "team light", "team full", "team status", or asks about token usage of the agent team.
disable-model-invocation: true
argument-hint: "status | full | light | off"
---

# /team — mode, usage guard, dashboard

The owner's stop/start gate. Definitions live in `AGENTS.md` ("Team mode") and `docs/agent-team/roles.md`. Be brief: this skill should cost a few hundred tokens.

**State file:** `~/.campaign-buddy/team-mode.json` → `{ "mode": "full|light|off", "since": ISO, "setBy": "...", "reason": "...", "note": "..." }`. Missing or unreadable means `full`.
**Dashboard:** the Team Console artifact (URL in memory file `campaign-buddy-team-mode.md`); documents `team/mode` and `team/usage`.

## `status` (default when no argument)
1. Read the state file. 2. Call `mcp__ccd_session_mgmt__get_usage` (self). 3. Reply in ≤5 lines: mode (+since, reason), 5-hour % and when it resets, weekly %, this chat's context %, and the guard verdict (healthy < 70%, high ≥ 70%, critical ≥ 90%). If high/critical, ask the owner whether to go `light` or `off` — ask, never decide.

## `full` | `light` | `off`
1. Only do this because the owner said so in this conversation. Never change the mode on your own.
2. Write the state file: new `mode`, `since` = now (UTC ISO, from `date -u`), `setBy` "owner (in chat)", `reason` = what the owner said (a few words; "not given" if none), keep `note`.
3. Update the dashboard: `ArtifactData get` `team/mode` (to read its `version`), then `update` with `{mode, since, setBy, reason}` and `if_version`. If the dashboard is unreachable, say so in one line; the file is still the source of truth.
4. Confirm in one line, e.g. "Team mode is now **light**: Product Owner at intake and before merge + automatic checks; specialists only for major/risky changes or on request."
5. If a GitHub reviews layer exists later and the repo variable `AGENT_TEAM_MODE` is in use, set it too (`gh variable set AGENT_TEAM_MODE --body <mode>`); until then there is nothing to set.

## Token guard (called from other skills at stage boundaries)
Read `get_usage`; at ≥70% of the 5-hour limit tell the owner once ("5-hour limit is N% used, resets in X; stay in <mode> or switch to light/off?"); at ≥90% say so again. Don't repeat at the same level in the same session. After asking, wait for the owner's answer.

## Recording to the dashboard (when agents run)
After each agent run, batch-write (one `ArtifactData batch`): `runs/<id>` {role, subject, model, tokens (from the run's reported total), tools, durationMs, verdict, at, trigger:"chat", modeAtRun}; `agents/<role>` {state}; `gates/<id>` when a gate changes; and `team/usage` at stage boundaries {fiveHourPct, fiveHourResetsAt, weeklyPct, weeklyResetsAt, extraEnabled/Spent/Limit, contextTokens, contextWindow, contextPct, capturedAt}. Only these event types. If mode is `off`, record nothing.
