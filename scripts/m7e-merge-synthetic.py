#!/usr/bin/env python3
"""Combine fixed-seed M7C diagnostic shards; reject duplicates or provenance drift."""
import argparse
import importlib.util
import json
from pathlib import Path

def _load_calibration():
    spec=importlib.util.spec_from_file_location('m7c',Path(__file__).resolve().parent/'m7c-calibration.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def merge(parts,expected_count):
    if not parts:raise ValueError('no shards')
    datasets=[json.loads(Path(path).read_text()) for path in parts]
    keys=('version','source','modelId','modelHash','worldSha256')
    identity=tuple(datasets[0][k] for k in keys)
    if identity[0]!='LC_M7C_SYNTHETIC_FIRST_INNINGS_V1' or identity[1]!='SYNTHETIC_ALPHA':
        raise ValueError('unexpected synthetic source')
    rows=[];seen=set()
    for d in datasets:
        if tuple(d[k] for k in keys)!=identity:raise ValueError('different synthetic source or model')
        if d['matches']!=len(d['rows']):raise ValueError('incorrect shard row count')
        for row in d['rows']:
            if row['seed'] in seen:raise ValueError('duplicate simulated seed')
            seen.add(row['seed']);rows.append(row)
    if len(rows)!=expected_count:raise ValueError('unexpected merged match count')
    rows.sort(key=lambda r:r['seed'])
    stat=_load_calibration().summarise(rows)
    for field in ('meanRuns','meanWickets','p10','p50','p90','meanLegalBalls','dotAttemptProportion','boundaryAttemptProportion'):
        if stat[field] is None:raise ValueError('empty synthetic stats')
    return {**{k:datasets[0][k] for k in keys},'status':'DESCRIPTIVE_SYNTHETIC_ONLY',
            'matches':len(rows),'firstInnings':stat,
            'runtime':{'measuredInBrowser':False,'batchedShards':len(parts),
                       'p95Ms':'SEE_RAW_SHARDS_NOT_GLOBAL_TIMING'},
            'rows':rows}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--expected-count',type=int,required=True)
    p.add_argument('parts',type=Path,nargs='+')
    args=p.parse_args()
    result=merge(args.parts,args.expected_count)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'matches':result['matches'],'meanFirstRuns':result['firstInnings']['meanRuns']}))
