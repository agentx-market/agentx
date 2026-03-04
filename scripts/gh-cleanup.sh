#!/bin/bash
# One-time GitHub issue cleanup: close completed issues, sync missing features
# Run after GitHub API rate limit resets

set -uo pipefail
DB="$HOME/marco_web/backlog.db"
REPO="agentx-market/agentx"

echo "=== Closing completed issues ==="
# Close issues for features that are done but have open GitHub issues
sqlite3 "$DB" "SELECT id, notes FROM features WHERE status='done' AND notes LIKE '%gh:#%';" | while IFS='|' read -r fid notes; do
  gh_num=$(echo "$notes" | grep -o 'gh:#[0-9]*' | head -1 | tr -d 'gh:#')
  if [ -n "$gh_num" ]; then
    state=$(gh issue view "$gh_num" --repo "$REPO" --json state -q '.state' 2>/dev/null)
    if [ "$state" = "OPEN" ]; then
      echo "  Closing #$gh_num (feature #$fid)..."
      gh issue close "$gh_num" --repo "$REPO" --comment "Shipped! Built by Marco's coding agent." 2>&1
    fi
  fi
done

echo ""
echo "=== Syncing untracked features ==="
# Create GitHub issues for features without gh:# marker
sqlite3 "$DB" "SELECT id, title, category, priority, effort, status FROM features WHERE notes NOT LIKE '%gh:#%' AND notes IS NOT NULL ORDER BY id;" | while IFS='|' read -r fid ftitle fcat fpri feffort fstatus; do
  [ -z "$ftitle" ] && continue
  body="**Category:** $fcat | **Priority:** $fpri | **Effort:** $feffort | **Status:** $fstatus
**Backlog ID:** #$fid"
  url=$(gh issue create --repo "$REPO" --title "$ftitle" --body "$body" --label "$fcat,$fpri" 2>&1)
  if echo "$url" | grep -q "github.com"; then
    issue_num=$(echo "$url" | grep -o '[0-9]*$')
    sqlite3 "$DB" "UPDATE features SET notes=COALESCE(notes,'') || ' gh:#$issue_num' WHERE id=$fid;"
    echo "  #$fid → GitHub Issue #$issue_num: $ftitle"
    # Close immediately if feature is already done
    if [ "$fstatus" = "done" ] || [ "$fstatus" = "shipped" ]; then
      gh issue close "$issue_num" --repo "$REPO" --comment "Shipped! Built by Marco's coding agent." 2>&1 | tail -1
    fi
  else
    echo "  #$fid FAILED: $url"
    # If rate limited, stop
    echo "$url" | grep -q "rate limit" && { echo "Rate limited, stopping."; exit 1; }
  fi
done

# Also check for features with empty notes
sqlite3 "$DB" "SELECT id, title, category, priority, effort, status FROM features WHERE (notes IS NULL OR notes='') ORDER BY id;" | while IFS='|' read -r fid ftitle fcat fpri feffort fstatus; do
  [ -z "$ftitle" ] && continue
  body="**Category:** $fcat | **Priority:** $fpri | **Effort:** $feffort | **Status:** $fstatus
**Backlog ID:** #$fid"
  url=$(gh issue create --repo "$REPO" --title "$ftitle" --body "$body" --label "$fcat,$fpri" 2>&1)
  if echo "$url" | grep -q "github.com"; then
    issue_num=$(echo "$url" | grep -o '[0-9]*$')
    sqlite3 "$DB" "UPDATE features SET notes=' gh:#$issue_num' WHERE id=$fid;"
    echo "  #$fid → GitHub Issue #$issue_num: $ftitle"
    if [ "$fstatus" = "done" ] || [ "$fstatus" = "shipped" ]; then
      gh issue close "$issue_num" --repo "$REPO" --comment "Shipped! Built by Marco's coding agent." 2>&1 | tail -1
    fi
  else
    echo "  #$fid FAILED: $url"
    echo "$url" | grep -q "rate limit" && { echo "Rate limited, stopping."; exit 1; }
  fi
done

echo ""
echo "=== Summary ==="
echo "Open issues:"
gh issue list --repo "$REPO" --state open --limit 50 --json number,title -q '.[] | "#\(.number): \(.title)"' 2>/dev/null
echo ""
echo "Done."
