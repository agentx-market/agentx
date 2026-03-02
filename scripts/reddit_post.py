#!/usr/bin/env python3
"""Post to Reddit using PRAW. Used by Marco's coding agent.

Usage:
  python3 ~/marco_web/scripts/reddit_post.py --subreddit SideProject --title "..." --body "..."
  python3 ~/marco_web/scripts/reddit_post.py --subreddit LocalLLaMA --title "..." --body-file ~/marco_web/outreach/post.txt

Credentials: ~/.config/reddit/credentials.json
  {
    "client_id": "...",
    "client_secret": "...",
    "username": "marcoagent42",
    "password": "..."
  }
"""

import argparse
import json
import os
import sys

def load_credentials():
    cred_path = os.path.expanduser("~/.config/reddit/credentials.json")
    if not os.path.exists(cred_path):
        print(f"ERROR: No credentials at {cred_path}", file=sys.stderr)
        print("Create the file with: client_id, client_secret, username, password", file=sys.stderr)
        sys.exit(1)
    with open(cred_path) as f:
        return json.load(f)

def post_to_reddit(subreddit_name, title, body):
    import praw

    creds = load_credentials()
    reddit = praw.Reddit(
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
        username=creds["username"],
        password=creds["password"],
        user_agent=f"AgentX:marco:v1.0 (by /u/{creds['username']})"
    )

    subreddit = reddit.subreddit(subreddit_name)
    submission = subreddit.submit(title, selftext=body)
    print(f"OK: Posted to r/{subreddit_name}")
    print(f"URL: https://reddit.com{submission.permalink}")
    return submission.permalink

def main():
    parser = argparse.ArgumentParser(description="Post to Reddit")
    parser.add_argument("--subreddit", required=True, help="Subreddit name (without r/)")
    parser.add_argument("--title", required=True, help="Post title")
    parser.add_argument("--body", help="Post body text")
    parser.add_argument("--body-file", help="File containing post body")
    args = parser.parse_args()

    if args.body_file:
        with open(os.path.expanduser(args.body_file)) as f:
            body = f.read()
    elif args.body:
        body = args.body
    else:
        print("ERROR: Provide --body or --body-file", file=sys.stderr)
        sys.exit(1)

    post_to_reddit(args.subreddit, args.title, body)

if __name__ == "__main__":
    main()
