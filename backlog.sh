#!/bin/bash
# AgentX.Market Product Backlog CLI
# Used by Marco's coding agent to self-manage feature development.

DB="${AGENTX_BACKLOG_DB:-/Users/marco/marco_web/backlog.db}"

init_db() {
  sqlite3 "$DB" <<'SQL'
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'feature',  -- feature, bugfix, infra, content, experiment
  priority TEXT NOT NULL DEFAULT 'medium',    -- critical, high, medium, low
  effort TEXT NOT NULL DEFAULT 'medium',      -- tiny(<1h), small(1-3h), medium(3-8h), large(8h+)
  status TEXT NOT NULL DEFAULT 'backlog',     -- backlog, ready, in_progress, review, done, shipped, wontdo
  assigned_to TEXT DEFAULT 'coding',
  requires_approval INTEGER DEFAULT 0,        -- 1 = needs Paul's OK before starting
  approval_status TEXT,                        -- pending, approved, rejected
  branch TEXT,
  commit_hash TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  shipped_at TEXT
);

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_ids TEXT,           -- comma-separated feature IDs included in this deploy
  commit_hash TEXT,
  deployed_at TEXT DEFAULT (datetime('now')),
  success INTEGER DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  rationale TEXT,             -- why this might be valuable
  source TEXT,                -- where the idea came from (research, competitor, user, self)
  status TEXT DEFAULT 'new',  -- new, evaluated, promoted, rejected
  feature_id INTEGER,         -- set when promoted to a feature
  created_at TEXT DEFAULT (datetime('now'))
);
SQL
}

usage() {
  cat <<'HELP'
AgentX.Market Backlog CLI

Usage: backlog.sh <command> [args]

Commands:
  init                          Initialize database (safe to re-run)
  add <title> <desc> <cat> <pri> <effort> [approval]
                                Add a feature (approval: 0 or 1)
  idea <title> <rationale> <source>
                                Log a product idea for later evaluation
  promote <idea_id> <cat> <pri> <effort>
                                Promote an idea to a feature
  list [status] [category]      List features (default: backlog,ready,in_progress)
  pick                          Pick the next ready feature (highest priority, smallest effort)
  start <id>                    Mark feature as in_progress
  complete <id> [commit_hash] [model]
                                Mark feature as done (model: qwen or claude)
  ship <id>                     Mark feature as shipped (deployed to production)
  deploy <feature_ids> <hash> [notes]
                                Record a deployment (feature_ids: comma-separated)
  wontdo <id> [reason]          Close a feature as won't do
  status                        Show current sprint status
  stats                         Show backlog statistics
  ideas [status]                List ideas (default: new)
  next                          Pick + start the next feature (combined)
  review                        List features in review status
  history [n]                   Show last n deployments (default: 10)
  velocity                      Show development velocity + Qwen vs Claude breakdown
  gh-sync                       Sync new backlog items to GitHub Issues
  gh-close <id> [model]         Close GitHub issue when feature ships (adds built-by label)

Categories: feature, bugfix, infra, content, experiment
Priorities: critical, high, medium, low
Effort: tiny, small, medium, large
HELP
}

cmd_add() {
  local title="$1" desc="$2" cat="${3:-feature}" pri="${4:-medium}" effort="${5:-medium}" approval="${6:-0}"
  local id=$(sqlite3 "$DB" "INSERT INTO features (title, description, category, priority, effort, requires_approval) VALUES ('$(echo "$title" | sed "s/'/''/g")', '$(echo "$desc" | sed "s/'/''/g")', '$cat', '$pri', '$effort', $approval); SELECT last_insert_rowid();")
  echo "Created feature #$id: $title [$cat/$pri/$effort]"
}

cmd_idea() {
  local title="$1" rationale="$2" source="${3:-self}"
  local id=$(sqlite3 "$DB" "INSERT INTO ideas (title, rationale, source) VALUES ('$(echo "$title" | sed "s/'/''/g")', '$(echo "$rationale" | sed "s/'/''/g")', '$source'); SELECT last_insert_rowid();")
  echo "Logged idea #$id: $title [source: $source]"
}

cmd_promote() {
  local idea_id="$1" cat="${2:-feature}" pri="${3:-medium}" effort="${4:-medium}"
  local title=$(sqlite3 "$DB" "SELECT title FROM ideas WHERE id=$idea_id;")
  local rationale=$(sqlite3 "$DB" "SELECT rationale FROM ideas WHERE id=$idea_id;")
  if [ -z "$title" ]; then echo "Idea #$idea_id not found"; exit 1; fi
  sqlite3 "$DB" "INSERT INTO features (title, description, category, priority, effort) VALUES ('$(echo "$title" | sed "s/'/''/g")', '$(echo "$rationale" | sed "s/'/''/g")', '$cat', '$pri', '$effort');"
  local fid=$(sqlite3 "$DB" "SELECT last_insert_rowid();")
  sqlite3 "$DB" "UPDATE ideas SET status='promoted', feature_id=$fid WHERE id=$idea_id;"
  echo "Promoted idea #$idea_id → feature #$fid: $title"
}

cmd_list() {
  local status="${1:-backlog,ready,in_progress}"
  local cat="$2"
  local where="status IN ($(echo "$status" | sed "s/[^,a-z_]//g" | sed "s/\([a-z_]*\)/'\1'/g"))"
  [ -n "$cat" ] && where="$where AND category='$cat'"
  sqlite3 -header -column "$DB" "SELECT id, title, category, priority, effort, status, requires_approval as approval FROM features WHERE $where ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, CASE effort WHEN 'tiny' THEN 0 WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 END;"
}

cmd_pick() {
  sqlite3 -header -column "$DB" "SELECT id, title, category, priority, effort FROM features WHERE status='ready' AND (requires_approval=0 OR approval_status='approved') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, CASE effort WHEN 'tiny' THEN 0 WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 END LIMIT 1;"
}

cmd_next() {
  # Auto-reset stale in_progress items (>2h old, no commit/branch = never completed)
  local stale=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status='in_progress' AND branch IS NULL AND commit_hash IS NULL AND started_at < datetime('now', '-2 hours');")
  if [ "$stale" -gt 0 ] 2>/dev/null; then
    sqlite3 "$DB" "UPDATE features SET status='ready', started_at=NULL WHERE status='in_progress' AND branch IS NULL AND commit_hash IS NULL AND started_at < datetime('now', '-2 hours');"
    echo "Auto-reset $stale stale in_progress items back to ready."
  fi

  local id=$(sqlite3 "$DB" "SELECT id FROM features WHERE status='ready' AND (requires_approval=0 OR approval_status='approved') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, CASE effort WHEN 'tiny' THEN 0 WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 END LIMIT 1;")
  if [ -z "$id" ]; then echo "No ready features to pick."; exit 0; fi
  cmd_start "$id"
}

cmd_start() {
  local id="$1"
  local approval=$(sqlite3 "$DB" "SELECT requires_approval FROM features WHERE id=$id;")
  local astatus=$(sqlite3 "$DB" "SELECT approval_status FROM features WHERE id=$id;")
  if [ "$approval" = "1" ] && [ "$astatus" != "approved" ]; then
    echo "Feature #$id requires Paul's approval first. Current status: ${astatus:-not requested}"
    echo "Ask Paul via Telegram before starting."
    exit 1
  fi
  sqlite3 "$DB" "UPDATE features SET status='in_progress', started_at=datetime('now') WHERE id=$id;"
  sqlite3 -header -column "$DB" "SELECT id, title, description, category, effort FROM features WHERE id=$id;"
  echo ""
  echo "Feature #$id is now in_progress. Get to work!"
}

cmd_complete() {
  local id="$1" hash="$2" model="${3:-qwen}"
  local verified=0
  local diff_stat=""

  # Check for actual code changes (git diff or uncommitted changes)
  cd "$HOME/marco_web" 2>/dev/null
  if [ -n "$hash" ] && [ "$hash" != "none" ]; then
    diff_stat=$(git diff --stat HEAD~1 2>/dev/null || echo "")
  fi
  if [ -z "$diff_stat" ]; then
    diff_stat=$(git status --porcelain 2>/dev/null || echo "")
  fi

  if [ -n "$diff_stat" ]; then
    verified=1
  fi

  # If no code changes detected, set to 'review' instead of 'done' (guardrail)
  local target_status="done"
  if [ "$verified" -eq 0 ]; then
    target_status="review"
  fi

  local set="status='$target_status', completed_at=datetime('now'), built_by='$model', verified=$verified"
  [ -n "$hash" ] && [ "$hash" != "none" ] && set="$set, commit_hash='$hash'"
  sqlite3 "$DB" "UPDATE features SET $set WHERE id=$id;"

  # Get feature title for log
  local title=$(sqlite3 "$DB" "SELECT title FROM features WHERE id=$id;" 2>/dev/null)

  # Append to WORK_LOG.md for cross-agent visibility
  local log_file="$HOME/marco_web/WORK_LOG.md"
  local timestamp=$(date '+%Y-%m-%d %H:%M')
  local verify_label="no"
  [ "$verified" -eq 1 ] && verify_label="yes"
  local files_info="no git changes detected"
  [ -n "$diff_stat" ] && files_info=$(echo "$diff_stat" | head -10)

  {
    echo ""
    echo "## $timestamp — Feature #$id: $title"
    echo "Status: done | Built by: $model | Verified: $verify_label"
    echo "Files changed:"
    echo '```'
    echo "$files_info"
    echo '```'
  } >> "$log_file"

  if [ "$target_status" = "review" ]; then
    echo "Feature #$id set to REVIEW (no code changes detected). [built by: $model]"
  else
    echo "Feature #$id marked as done. [built by: $model, verified: yes]"
  fi
}

cmd_ship() {
  local id="$1"
  sqlite3 "$DB" "UPDATE features SET status='shipped', shipped_at=datetime('now') WHERE id=$id;"
  echo "Feature #$id shipped!"
}

cmd_deploy() {
  local fids="$1" hash="$2" notes="$3"
  sqlite3 "$DB" "INSERT INTO deployments (feature_ids, commit_hash, notes) VALUES ('$fids', '$hash', '$(echo "$notes" | sed "s/'/''/g")');"
  # Mark all features as shipped
  IFS=',' read -ra ids <<< "$fids"
  for fid in "${ids[@]}"; do
    sqlite3 "$DB" "UPDATE features SET status='shipped', shipped_at=datetime('now'), commit_hash='$hash' WHERE id=$fid;"
  done
  echo "Deployed features $fids (commit: ${hash:-n/a})"
}

cmd_wontdo() {
  local id="$1" reason="$2"
  local notes=""
  [ -n "$reason" ] && notes=", notes='$(echo "$reason" | sed "s/'/''/g")'"
  sqlite3 "$DB" "UPDATE features SET status='wontdo'$notes WHERE id=$id;"
  echo "Feature #$id closed as won't do."
}

cmd_status() {
  echo "=== AgentX.Market Sprint Status ==="
  echo ""
  echo "In Progress:"
  sqlite3 -column "$DB" "SELECT '  #' || id || ' ' || title || ' [' || effort || ']' FROM features WHERE status='in_progress';" 2>/dev/null || echo "  (none)"
  echo ""
  echo "Ready (next up):"
  sqlite3 -column "$DB" "SELECT '  #' || id || ' ' || title || ' [' || priority || '/' || effort || ']' FROM features WHERE status='ready' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END LIMIT 5;" 2>/dev/null || echo "  (none)"
  echo ""
  echo "Awaiting Approval:"
  sqlite3 -column "$DB" "SELECT '  #' || id || ' ' || title FROM features WHERE requires_approval=1 AND (approval_status IS NULL OR approval_status='pending');" 2>/dev/null || echo "  (none)"
  echo ""
  echo "Recently Shipped (last 7 days):"
  sqlite3 -column "$DB" "SELECT '  #' || id || ' ' || title || ' (shipped ' || shipped_at || ')' FROM features WHERE status='shipped' AND shipped_at > datetime('now', '-7 days') ORDER BY shipped_at DESC;" 2>/dev/null || echo "  (none)"
}

cmd_stats() {
  echo "=== AgentX.Market Backlog Stats ==="
  sqlite3 "$DB" "SELECT status, COUNT(*) as count FROM features GROUP BY status ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'ready' THEN 1 WHEN 'backlog' THEN 2 WHEN 'review' THEN 3 WHEN 'done' THEN 4 WHEN 'shipped' THEN 5 WHEN 'wontdo' THEN 6 END;" | while IFS='|' read -r status count; do
    printf "  %-15s %s\n" "$status" "$count"
  done
  echo ""
  echo "By Category:"
  sqlite3 "$DB" "SELECT category, COUNT(*) FROM features WHERE status NOT IN ('shipped','wontdo') GROUP BY category;" | while IFS='|' read -r cat count; do
    printf "  %-15s %s\n" "$cat" "$count"
  done
  echo ""
  echo "Total deployments: $(sqlite3 "$DB" "SELECT COUNT(*) FROM deployments;")"
  echo "Features shipped: $(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status='shipped';")"
  echo "Ideas logged: $(sqlite3 "$DB" "SELECT COUNT(*) FROM ideas;")"
}

cmd_velocity() {
  echo "=== AgentX.Market Development Velocity ==="
  echo ""

  echo "Model Breakdown (completed + shipped features):"
  sqlite3 "$DB" "SELECT COALESCE(built_by,'untracked') as model, COUNT(*) as features FROM features WHERE status IN ('done','shipped') GROUP BY built_by;" | while IFS='|' read -r model count; do
    printf "  %-20s %s features\n" "$model" "$count"
  done
  local total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status IN ('done','shipped');")
  local qwen=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status IN ('done','shipped') AND built_by='qwen';")
  local claude=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status IN ('done','shipped') AND built_by='claude';")
  if [ "$total" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "  Qwen:   $qwen/$total ($(( qwen * 100 / total ))%)"
    echo "  Claude: $claude/$total ($(( claude * 100 / total ))%)"
  fi

  echo ""
  echo "This Week:"
  sqlite3 "$DB" "SELECT COALESCE(built_by,'untracked') as model, COUNT(*) FROM features WHERE status IN ('done','shipped') AND completed_at > datetime('now','-7 days') GROUP BY built_by;" | while IFS='|' read -r model count; do
    printf "  %-20s %s features\n" "$model" "$count"
  done
  local week_total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status IN ('done','shipped') AND completed_at > datetime('now','-7 days');")
  echo "  Total this week: ${week_total:-0}"

  echo ""
  echo "Avg Time to Complete (hours):"
  sqlite3 "$DB" "SELECT COALESCE(built_by,'untracked'), ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 24), 1) as avg_hours FROM features WHERE status IN ('done','shipped') AND started_at IS NOT NULL AND completed_at IS NOT NULL GROUP BY built_by;" | while IFS='|' read -r model hours; do
    printf "  %-20s %s hrs\n" "$model" "$hours"
  done

  echo ""
  echo "Remaining Backlog:"
  sqlite3 "$DB" "SELECT effort, COUNT(*) FROM features WHERE status IN ('backlog','ready') GROUP BY effort ORDER BY CASE effort WHEN 'tiny' THEN 0 WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 END;" | while IFS='|' read -r effort count; do
    printf "  %-15s %s\n" "$effort" "$count"
  done
  local remaining=$(sqlite3 "$DB" "SELECT COUNT(*) FROM features WHERE status IN ('backlog','ready');")
  echo "  Total remaining: $remaining"
}

cmd_ideas() {
  local status="${1:-new}"
  sqlite3 -header -column "$DB" "SELECT id, title, source, status, created_at FROM ideas WHERE status='$status' ORDER BY created_at DESC;"
}

cmd_review() {
  sqlite3 -header -column "$DB" "SELECT id, title, category, effort, completed_at FROM features WHERE status='done' ORDER BY completed_at DESC;"
}

GITHUB_REPO="agentx-market/agentx"

cmd_gh_sync() {
  echo "Syncing untracked backlog items to GitHub Issues..."
  # Find features without a github_issue_number
  sqlite3 "$DB" "SELECT id, title, description, category, priority, effort, requires_approval, status FROM features WHERE id NOT IN (SELECT id FROM features WHERE notes LIKE '%gh:#%') ORDER BY id;" | while IFS='|' read -r fid ftitle fdesc fcat fpri feffort fapproval fstatus; do
    labels="$fcat,$fpri"
    [ "$feffort" = "medium" ] && labels="$labels,medium-effort" || labels="$labels,$feffort"
    [ "$fapproval" = "1" ] && labels="$labels,needs-approval"

    body="**Category:** $fcat | **Priority:** $fpri | **Effort:** $feffort | **Status:** $fstatus
**Backlog ID:** #$fid

---

$fdesc"

    url=$(gh issue create --repo "$GITHUB_REPO" \
      --title "$ftitle" \
      --body "$body" \
      --label "$labels" 2>&1)

    if echo "$url" | grep -q "github.com"; then
      issue_num=$(echo "$url" | grep -o '[0-9]*$')
      sqlite3 "$DB" "UPDATE features SET notes=COALESCE(notes,'') || ' gh:#$issue_num' WHERE id=$fid;"
      echo "  #$fid → GitHub Issue #$issue_num: $ftitle"
    else
      echo "  #$fid FAILED: $url"
    fi
  done
  echo "Done."
}

cmd_gh_close() {
  local fid="$1" model="${2:-qwen}"
  local title=$(sqlite3 "$DB" "SELECT title FROM features WHERE id=$fid;")
  if [ -z "$title" ]; then echo "Feature #$fid not found"; exit 1; fi

  # Close the matching GitHub issue
  gh issue close "$fid" --repo "$GITHUB_REPO" --comment "Shipped! Built by: $model" 2>&1

  # Add built-by label
  gh issue edit "$fid" --repo "$GITHUB_REPO" --add-label "built-by-$model" 2>&1

  echo "GitHub Issue #$fid closed [built-by-$model]"
}

cmd_history() {
  local n="${1:-10}"
  sqlite3 -header -column "$DB" "SELECT id, feature_ids, commit_hash, deployed_at, notes FROM deployments ORDER BY deployed_at DESC LIMIT $n;"
}

# --- Main ---
[ ! -f "$DB" ] && init_db

case "${1:-}" in
  init)     init_db; echo "Database initialized at $DB" ;;
  add)      shift; cmd_add "$@" ;;
  idea)     shift; cmd_idea "$@" ;;
  promote)  shift; cmd_promote "$@" ;;
  list)     shift; cmd_list "$@" ;;
  pick)     cmd_pick ;;
  next)     cmd_next ;;
  start)    cmd_start "$2" ;;
  complete) cmd_complete "$2" "$3" ;;
  ship)     cmd_ship "$2" ;;
  deploy)   shift; cmd_deploy "$@" ;;
  wontdo)   cmd_wontdo "$2" "$3" ;;
  status)   cmd_status ;;
  stats)    cmd_stats ;;
  velocity) cmd_velocity ;;
  gh-sync)  cmd_gh_sync ;;
  gh-close) cmd_gh_close "$2" "$3" ;;
  ideas)    cmd_ideas "${2:-new}" ;;
  review)   cmd_review ;;
  history)  cmd_history "${2:-10}" ;;
  *)        usage ;;
esac
