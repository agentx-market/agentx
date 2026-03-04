#!/usr/bin/env python3
"""triage-session.py — Parse OpenClaw coding session JSONL and produce structured failure triage.

Usage:
    python3 scripts/triage-session.py [session-file-or-uuid]
    python3 scripts/triage-session.py --latest

Output: writes ~/marco_web/.last-result.json with diagnosis and stats.
Also prints a one-line summary to stdout.
"""

import json
import os
import sys
import glob
from pathlib import Path
from collections import Counter
from datetime import datetime

SESSIONS_DIR = os.path.expanduser("~/.openclaw/agents/coding/sessions")
OUTPUT_FILE = os.path.expanduser("~/marco_web/.last-result.json")


def find_session_file(arg):
    """Resolve session file from argument: path, UUID, or --latest."""
    if arg == "--latest":
        files = glob.glob(os.path.join(SESSIONS_DIR, "*.jsonl"))
        if not files:
            return None
        return max(files, key=os.path.getmtime)

    # Direct path
    if os.path.isfile(arg):
        return arg

    # UUID — try adding .jsonl
    candidate = os.path.join(SESSIONS_DIR, arg if arg.endswith(".jsonl") else arg + ".jsonl")
    if os.path.isfile(candidate):
        return candidate

    return None


def parse_session(filepath):
    """Parse JSONL session and extract structured data."""
    entries = []
    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    # Session metadata
    session_id = ""
    timestamp = ""
    for entry in entries:
        if entry.get("type") == "session":
            session_id = entry.get("id", "")
            timestamp = entry.get("timestamp", "")
            break

    # Parse tool calls and results
    tool_calls = []
    tool_results = []
    text_chunks = []
    files_touched = set()
    backlog_completed = False
    server_restarted = False

    for entry in entries:
        if entry.get("type") != "message":
            continue

        msg = entry.get("message", {})
        role = msg.get("role", "")
        content = msg.get("content", [])

        if not isinstance(content, list):
            continue

        # Assistant messages contain toolCall items
        if role == "assistant":
            for item in content:
                item_type = item.get("type", "")

                if item_type == "toolCall":
                    tc = {
                        "name": item.get("name", ""),
                        "id": item.get("id", ""),
                        "arguments": item.get("arguments", {}),
                    }
                    tool_calls.append(tc)

                    # Track files touched
                    args = tc["arguments"] if isinstance(tc["arguments"], dict) else {}
                    name = tc["name"]
                    if name in ("write", "Write", "edit", "Edit"):
                        fp = args.get("file_path", args.get("path", ""))
                        if fp:
                            files_touched.add(os.path.basename(fp))
                    elif name in ("bash", "Bash", "exec"):
                        cmd = args.get("command", "")
                        if "backlog.sh complete" in cmd:
                            backlog_completed = True
                        if "kickstart" in cmd and "webserver" in cmd:
                            server_restarted = True

                elif item_type == "text":
                    text_chunks.append(item.get("text", ""))

        # Tool results
        if role == "toolResult":
            tr = {
                "toolCallId": msg.get("toolCallId", ""),
                "toolName": msg.get("toolName", ""),
                "isError": msg.get("isError", False),
                "content": "",
            }
            # Extract content text
            result_content = msg.get("content", "")
            if isinstance(result_content, list):
                texts = [c.get("text", "") for c in result_content if isinstance(c, dict)]
                tr["content"] = "\n".join(texts)
            elif isinstance(result_content, str):
                tr["content"] = result_content
            tool_results.append(tr)

    return {
        "session_id": session_id,
        "timestamp": timestamp,
        "entries": entries,
        "tool_calls": tool_calls,
        "tool_results": tool_results,
        "text_chunks": text_chunks,
        "files_touched": files_touched,
        "backlog_completed": backlog_completed,
        "server_restarted": server_restarted,
    }


def detect_stuck_loop(tool_calls):
    """Check if the same tool was called 3+ times with identical args."""
    if len(tool_calls) < 3:
        return False
    # Check consecutive calls
    for i in range(len(tool_calls) - 2):
        a, b, c = tool_calls[i], tool_calls[i + 1], tool_calls[i + 2]
        if (a["name"] == b["name"] == c["name"] and
                a["arguments"] == b["arguments"] == c["arguments"]):
            return True
    return False


def detect_edit_failures(tool_results):
    """Count edit tool errors (text not found)."""
    errors = []
    for tr in tool_results:
        if tr["isError"] and tr["toolName"] in ("edit", "Edit"):
            errors.append(tr)
    return errors


def extract_error_details(tool_results):
    """Extract specific error messages for failure context."""
    details = []
    for tr in tool_results:
        if tr["isError"]:
            content = tr.get("content", "")
            name = tr.get("toolName", "unknown")
            # Truncate long error messages
            snippet = content[:200] if content else "no details"
            details.append(f"{name}: {snippet}")
    return details


def diagnose(parsed):
    """Determine session diagnosis."""
    tc = parsed["tool_calls"]
    tr = parsed["tool_results"]
    errors = [r for r in tr if r["isError"]]
    edit_errors = detect_edit_failures(tr)

    # Check for timeout — last entry has no stop reason or incomplete
    last_msg = None
    for entry in reversed(parsed["entries"]):
        if entry.get("type") == "message":
            msg = entry.get("message", {})
            if msg.get("role") == "assistant":
                last_msg = msg
                break
    timeout = False
    if last_msg and not last_msg.get("stopReason"):
        timeout = True

    if len(tc) == 0:
        return "NO_TOOL_CALLS"
    if timeout:
        return "TIMEOUT"
    if parsed["backlog_completed"]:
        return "SUCCESS"
    if detect_stuck_loop(tc):
        return "STUCK_LOOP"
    if len(edit_errors) >= 2:
        return "EDIT_FAILURES"
    if len(tc) > 0 and not parsed["backlog_completed"]:
        return "PARTIAL"

    return "PARTIAL"


def summarize(parsed, diagnosis):
    """Generate a human-readable one-line summary."""
    tc = parsed["tool_calls"]
    tr = parsed["tool_results"]
    errors = [r for r in tr if r["isError"]]
    edit_errors = detect_edit_failures(tr)
    files = sorted(parsed["files_touched"])

    if diagnosis == "SUCCESS":
        return f"Feature completed. {len(tc)} tool calls, files: {', '.join(files) or 'none'}"
    elif diagnosis == "NO_TOOL_CALLS":
        word_count = sum(len(t.split()) for t in parsed["text_chunks"])
        return f"Zero tool calls. Model produced {word_count} words of text instead of acting"
    elif diagnosis == "EDIT_FAILURES":
        err_files = set()
        for e in edit_errors:
            # Try to extract filename from error content
            content = e.get("content", "")
            err_files.add(e.get("toolName", "edit"))
        return f"{len(edit_errors)} edit failures (text not found), {len(tc)} total tool calls"
    elif diagnosis == "STUCK_LOOP":
        # Find the repeated call
        names = Counter(t["name"] for t in tc)
        most_common = names.most_common(1)[0]
        return f"Stuck in loop: {most_common[0]} called {most_common[1]} times"
    elif diagnosis == "TIMEOUT":
        return f"Session timed out after {len(tc)} tool calls"
    elif diagnosis == "PARTIAL":
        return f"Partial: {len(tc)} tool calls, {len(errors)} errors, files: {', '.join(files) or 'none'}, did not complete"

    return f"{len(tc)} tool calls, {len(errors)} errors"


def extract_feature_id(parsed):
    """Try to extract feature ID from the session's user prompt."""
    for entry in parsed["entries"]:
        if entry.get("type") == "message":
            msg = entry.get("message", {})
            if msg.get("role") == "user":
                content = msg.get("content", [])
                if isinstance(content, list):
                    for item in content:
                        text = item.get("text", "") if isinstance(item, dict) else ""
                        if "feature #" in text.lower():
                            import re
                            m = re.search(r"feature\s*#(\d+)", text, re.IGNORECASE)
                            if m:
                                return int(m.group(1))
                elif isinstance(content, str):
                    import re
                    m = re.search(r"feature\s*#(\d+)", content, re.IGNORECASE)
                    if m:
                        return int(m.group(1))
    return None


def main():
    if len(sys.argv) < 2:
        arg = "--latest"
    else:
        arg = sys.argv[1]

    filepath = find_session_file(arg)
    if not filepath:
        result = {"success": False, "error": f"Session not found: {arg}"}
        with open(OUTPUT_FILE, "w") as f:
            json.dump(result, f, indent=2)
        print(f"ERROR: {result['error']}")
        sys.exit(1)

    parsed = parse_session(filepath)
    diagnosis = diagnose(parsed)
    summary_text = summarize(parsed, diagnosis)
    feature_id = extract_feature_id(parsed)

    # Calculate text vs tool ratio
    total_text_words = sum(len(t.split()) for t in parsed["text_chunks"])
    total_tool_calls = len(parsed["tool_calls"])
    ratio = total_text_words / max(total_tool_calls * 100, 1)  # rough: 100 "words" per tool call

    errors = [r for r in parsed["tool_results"] if r["isError"]]
    error_details = extract_error_details(parsed["tool_results"])

    # Calculate session age in seconds
    session_age = None
    try:
        session_age = int(os.path.getmtime(filepath))
        session_age = int(datetime.now().timestamp()) - session_age
    except Exception:
        pass

    result = {
        "session_id": parsed["session_id"],
        "session_file": filepath,
        "timestamp": parsed["timestamp"],
        "feature_id": feature_id,
        "diagnosis": diagnosis,
        "tool_calls": total_tool_calls,
        "tool_errors": len(errors),
        "error_details": error_details[:5],  # cap at 5 most relevant
        "files_touched": sorted(parsed["files_touched"]),
        "backlog_completed": parsed["backlog_completed"],
        "server_restarted": parsed["server_restarted"],
        "text_vs_tool_ratio": round(ratio, 2),
        "session_age_seconds": session_age,
        "summary": summary_text,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"{diagnosis}: {summary_text}")


if __name__ == "__main__":
    main()
