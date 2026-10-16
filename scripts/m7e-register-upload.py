#!/usr/bin/env python3
"""Register a user-supplied Cricsheet-formatted ZIP for offline research.

Checks archive structure, integrity and included notices, not external authenticity.
Does not download or execute archive members. The recorded source URL is declared
by the archive README, not independently attested by this operation.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

URL = 'https://cricsheet.org/downloads/t20s_json.zip'
LICENSE_URL = 'https://cricsheet.org/licensing/'

def register(source: Path, manifest: Path):
    if source.stat().st_size > 400_000_000:
        raise ValueError('archive exceeds accepted 400 MB input cap')
    with source.open('rb') as f:
        digest=hashlib.file_digest(f,'sha256').hexdigest()
    with zipfile.ZipFile(source) as z:
        entries=z.infolist()
        if len(entries)>50000:raise ValueError('member count exceeds cap')
        names=set(); expanded=0
        for entry in entries:
            p=PurePosixPath(entry.filename)
            expanded+=entry.file_size
            if (p.is_absolute() or '..' in p.parts or '\\' in entry.filename
                or entry.filename in names or entry.file_size>3_000_000
                or stat.S_IFMT(entry.external_attr>>16)==stat.S_IFLNK
                or (entry.compress_size and entry.file_size/entry.compress_size>500)
                or expanded>1_500_000_000):
                raise ValueError('unsafe archive member')
            names.add(entry.filename)
        if 'LICENSE.txt' not in names or 'README.txt' not in names:
            raise ValueError('missing license or README provenance text')
        license_notice=z.read('LICENSE.txt')
        readme=z.read('README.txt')
        if b'ODC Attribution License' not in license_notice or b'Cricsheet' not in readme:
            raise ValueError('embedded provenance statements absent')
        if b'https://cricsheet.org/downloads/t20s_json.zip' not in readme:
            raise ValueError('README lacks expected declared source')
        json_count=sum(n.endswith('.json') for n in names)
        if json_count<400:raise ValueError('too few match JSON members')
        bad=z.testzip()
        if bad is not None:raise ValueError(f'ZIP CRC failure for member {bad}')
        notice_sha=hashlib.sha256(license_notice).hexdigest()
        readme_sha=hashlib.sha256(readme).hexdigest()
    result={
       'manifestVersion':'LC_M7E_USER_UPLOADED_REFERENCE_V1',
       'source':'Cricsheet (declared by supplied archive)',
       'sourceURL':URL,
       'licenceURL':LICENSE_URL,
       'licence':'ODC-By-1.0',
       'acquisitionMethod':'USER_UPLOADED_ARCHIVE',
       'networkRetrievalVerified':False,
       'archiveAuthenticityIndependentlyVerified':False,
       'inspectedAtUTC':datetime.now(timezone.utc).isoformat(),
       'retrievedAtUTC':None,
       'archivePath':str(source),
       'archiveBytes':source.stat().st_size,
       'archiveSha256':digest,
       'licenseNoticePresent':True,
       'licenseNoticeSha256':notice_sha,
       'readmeSha256':readme_sha,
       'jsonMemberCount':json_count,
       'zipCrcAllMembersPassed':True,
       'humanDatasetApproval':False,
       'gameplayModelApproved':False
    }
    manifest.parent.mkdir(parents=True,exist_ok=True)
    manifest.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    args=p.parse_args()
    print(json.dumps(register(args.input,args.manifest),indent=2))
