#!/usr/bin/env python3
"""Acquire Cricsheet JSON T20 archive on an AUTHORISED networked workstation.

Does not fetch other domains, weaken TLS or infer dataset approval. Cricsheet
ODC-By 1.0 attribution and licence notices must be retained in any public reuse.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import ssl
import urllib.request
import zipfile

SOURCE = 'https://cricsheet.org/downloads/t20s_json.zip'
LICENCE = 'https://cricsheet.org/licensing/'
MAX_DOWNLOAD = 400_000_000


def acquire(dest: Path, manifest: Path, opener=urllib.request.urlopen):
    dest.parent.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        raise FileExistsError(f'Refusing to overwrite existing archive: {dest}')
    partial = dest.with_name(dest.name + '.partial')
    hasher = hashlib.sha256()
    size = 0
    try:
        req = urllib.request.Request(SOURCE, headers={'User-Agent': 'LordCricketXXVI-Research/0.1 (ODC-By attribution)'})
        with opener(req, timeout=45, context=ssl.create_default_context()) as response, partial.open('xb') as out:
            if response.status != 200:
                raise RuntimeError(f'Unexpected HTTP status {response.status}')
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                size += len(block)
                if size > MAX_DOWNLOAD:
                    raise ValueError('Cricsheet download exceeds 400MB cap')
                out.write(block)
                hasher.update(block)
        with zipfile.ZipFile(partial) as z:
            names = {n.filename for n in z.infolist()}
            if not {'LICENSE.txt'} & names:
                raise ValueError('Cricsheet ZIP has no LICENSE.txt; provenance review required')
            count = len([n for n in z.infolist() if n.filename.endswith('.json')])
            if count < 400:
                raise ValueError('Download has fewer than 400 JSON match files')
            licence_sha = hashlib.sha256(z.read('LICENSE.txt')).hexdigest()
        partial.replace(dest)
        record = {'source': 'Cricsheet', 'sourceURL': SOURCE, 'licenceURL': LICENCE,
                  'licence': 'ODC-By-1.0', 'retrievedAtUTC': datetime.now(timezone.utc).isoformat(),
                  'archivePath': str(dest), 'archiveBytes': size, 'archiveSha256': hasher.hexdigest(),
                  'licenseNoticePresent': True, 'licenseNoticeSha256': licence_sha,
                  'jsonMemberCount': count, 'humanDatasetApproval': False,
                  'gameplayModelApproved': False}
        manifest.write_text(json.dumps(record, indent=2) + '\n')
        return record
    finally:
        partial.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(acquire(args.out, args.manifest), indent=2))
    except Exception as e:
        parser.exit(2, f'DOWNLOAD_BLOCKED_OR_INVALID: {type(e).__name__}: {e}\n')
