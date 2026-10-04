#!/usr/bin/env python3
"""Recorded fallback evidence when npm packages are unavailable.

This does not mark production build, Zod/AJV, Vitest or Playwright as passing.
"""
import datetime,hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
LOG=ROOT/'docs'/'verification'
LOG.mkdir(exist_ok=True)
GATES=[
 ('independent-random', ['python3','scripts/check-determinism-vectors.py']),
 ('independent-probability', ['python3','scripts/reference_probability.py']),
 ('probability-schema-mirror', ['python3','scripts/probability-schema-reference.py']),
 ('independent-json-schema', ['python3','scripts/check-probability-json-schemas.py']),
 ('transpiled-algorithm-shim', ['node','scripts/offline-probability-check.mjs']),
 ('isolated-semantic-types', ['node','scripts/offline-typecheck-probability.mjs']),
 ('package-boundaries', ['node','scripts/offline-boundary-check.mjs']),
]
results=[]
for name,cmd in GATES:
  result=subprocess.run(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=40)
  (LOG/('offline-'+name+'.log')).write_text(result.stdout)
  results.append(dict(gate=name,command=' '.join(cmd),status='PASS' if result.returncode==0 else 'FAIL',exitCode=result.returncode))
  print(name,results[-1]['status'],result.stdout.strip().splitlines()[-1] if result.stdout.strip() else '')

oldsource=pathlib.Path('/mnt/data/work/pass04/lord-cricket-xxvi')
# This integrity gate is supplied separately in the report; not a condition of portability.
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks={
 'scoringCorpusSha256':sha(ROOT/'tests/fixtures/scoring/corpus.json'),
 'scoringIndexSha256':sha(ROOT/'tests/fixtures/scoring/index.json'),
 'determinismVectorsSha256':sha(ROOT/'tests/fixtures/determinism/vectors.json'),
 'modelPackSha256':json.loads((ROOT/'tests/fixtures/probability/vectors.json').read_text())['modelHash'],
 'lutSha256':json.loads((ROOT/'tests/fixtures/probability/vectors.json').read_text())['lutHash'],
 'schemaCount':len(list((ROOT/'packages/contracts/schemas').glob('*Schema.json'))),
}
if oldsource.exists():
 checks['pass04ScoringCorpusIdentical']=checks['scoringCorpusSha256']==sha(oldsource/'tests/fixtures/scoring/corpus.json')
 checks['pass04ScoringIndexIdentical']=checks['scoringIndexSha256']==sha(oldsource/'tests/fixtures/scoring/index.json')
 checks['pass04DeterminismVectorsIdentical']=checks['determinismVectorsSha256']==sha(oldsource/'tests/fixtures/determinism/vectors.json')
 oldschemas=oldsource/'packages/contracts/schemas'
 checks['pass04SchemasIdentical']=all((ROOT/'packages/contracts/schemas'/p.name).read_bytes()==p.read_bytes() for p in oldschemas.glob('*.json'))
 print('pass04-source-integrity', 'PASS' if all(v for k,v in checks.items() if k.endswith('Identical')) else 'FAIL')
 assert all(v for k,v in checks.items() if k.endswith('Identical'))
manifest=dict(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),nodeRuntime=subprocess.check_output(['node','--version'],text=True).strip(),
 note='Supplementary offline evidence; production npm/TypeScript workspace/Zod/Vitest/Playwright gates BLOCKED',
 gates=results,integrity=checks)
(LOG/'offline-results.json').write_text(json.dumps(manifest,indent=2)+'\n')
if not all(r['status']=='PASS' for r in results):sys.exit(1)
