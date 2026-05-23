#!/usr/bin/env python3
"""
Generates config.js from environment variables.
Run via GitHub Actions — all values come from repository secrets.
"""
import os
import json
import sys


def require(name):
    val = os.environ.get(name, '').strip()
    if not val:
        print(f'::error::Secret {name!r} is empty or not set. Add it in repo Settings → Secrets → Actions.')
        sys.exit(1)
    return val


def main():
    # --- Parse complex secrets first so we fail early on bad JSON ---
    sa_raw = require('SERVICE_ACCOUNT_JSON')
    try:
        service_account = json.loads(sa_raw)
    except json.JSONDecodeError as e:
        print(f'::error::SERVICE_ACCOUNT_JSON is not valid JSON: {e}')
        sys.exit(1)

    games_raw = require('GAMES_JSON')
    try:
        games = json.loads(games_raw)
    except json.JSONDecodeError as e:
        print(f'::error::GAMES_JSON is not valid JSON: {e}')
        sys.exit(1)

    config = {
        'ADMIN_PASSWORD':       require('ADMIN_PASSWORD'),
        'GITHUB_PAT':           require('TCC_PAT'),
        'GIST_CREDENTIALS_ID':  require('GIST_CREDENTIALS_ID'),
        'GIST_INDEX_ID':        require('GIST_INDEX_ID'),
        'GIST_LEAVE_ID':        os.environ.get('GIST_LEAVE_ID', ''),
        'DRIVE_ROOT_FOLDER_ID': require('DRIVE_ROOT_FOLDER_ID'),
        'SERVICE_ACCOUNT':      service_account,
        'GAMES':                games,
    }

    output = 'const CONFIG = ' + json.dumps(config, indent=2, ensure_ascii=False) + ';\n'

    out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(output)

    size = os.path.getsize(out_path)
    print(f'config.js written to {out_path} ({size} bytes)')


if __name__ == '__main__':
    main()
