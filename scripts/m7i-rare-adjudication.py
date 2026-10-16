#!/usr/bin/env python3
"""M7I source-faithful exceptional-delivery register. Research audit, not correction.

Every unsupported Cricsheet attempt is retained as a SHA-addressed exception.
It is NEVER coerced to a compatible regular delivery or fitted as a made-up class.
Cricsheet data used by attribution: https://cricsheet.org/ ODC-By 1.0.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import importlib.util
import json
from pathlib import Path, PurePosixPath
import zipfile

DIR=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('m7h_rare_base',DIR/'m7h-two-innings.py')
h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
g=h.g
VERSION='LC_M7I_RARE_DELIVERY_REGISTER_V1'

def classify_attempt(delivery,freehit):
    try:
        key=g.classify(delivery)
        if freehit and g.unpack(key)['wicketKind'] not in ('NONE','RUN_OUT'):
            raise ValueError('FREE_HIT_MASK')
        return 'SUPPORTED',key
    except (ValueError, KeyError, TypeError) as exc:
        return str(exc),None

def disposition(reason,delivery):
    """Explicit disposition, never a fabricated scorer resolution."""
    if reason=='SUPPORTED':return 'SCORER_COMPATIBLE'
    if reason in ('MULTI_WICKET_UNSUPPORTED','UNSUPPORTED_WICKET_TYPE','UNSUPPORTED_EXTRA_TYPE',
                  'INVALID_LEGALITY_CHANNEL','UNSUPPORTED_RUNNING_WICKET','BOUNDARY_DISMISSAL_OR_ALLOWANCE'):
        return 'REQUIRES_RULES_AND_SCORER_ADJUDICATION'
    if reason in ('FREE_HIT_MASK','FREE_HIT_INELIGIBLE_WICKET'):
        return 'REQUIRES_SOURCE_AND_FREE_HIT_ADJUDICATION'
    if reason in ('RUN_RECONCILIATION','INVALID_EXTRAS','INVALID_EXTRA_VALUE','INVALID_DISMISSED_PARTY'):
        return 'REQUIRES_DATA_VALIDATION'
    return 'UNRESOLVED_MUST_NOT_CONVERT'

def audit(archive,reference):
    h.require(sha256(archive.read_bytes()).hexdigest()==reference['sourceZipSha256'],'SOURCE_ZIP_HASH_MISMATCH')
    pools={s:{r['matchId'] for r in reference[s]['rows']} for s in ('training','heldOut')}
    h.require(not pools['training']&pools['heldOut'],'SPLIT_LEAK')
    exceptions=[];counts=Counter();seen=set();supported=Counter()
    with zipfile.ZipFile(archive) as z:
        h.require(len(z.infolist())<=50000,'UNSAFE_ZIP_SIZE')
        for member in z.infolist():
            mid=PurePosixPath(member.filename).stem
            cohort='training' if mid in pools['training'] else 'heldOut' if mid in pools['heldOut'] else None
            if cohort is None:continue
            h.require(mid not in seen,'DUPLICATE_ID');seen.add(mid)
            obj=json.loads(z.read(member))
            for innings_index,inn in enumerate(obj['innings'][:2]):
                legal=0;wickets=0;freehit=False
                for over in inn['overs']:
                    for attempt,delivery in enumerate(over['deliveries']):
                        reason,key=classify_attempt(delivery,freehit)
                        # Record only exceptional events; ordinary Cricsheet player names and IDs
                        # are never copied into the emitted research audit.
                        if reason=='SUPPORTED':supported[(cohort,innings_index)]+=1
                        else:
                            normalized={'runs':delivery.get('runs'),
                                        'extras':delivery.get('extras',{}),
                                        'wickets':[{'kind':w.get('kind'),
                                                    'dismissedRole':('STRIKER' if w.get('player_out')==delivery.get('batter')
                                                                     else 'NON_STRIKER' if w.get('player_out')==delivery.get('non_striker')
                                                                     else 'OTHER')} for w in delivery.get('wickets',[])],
                                        'nonBoundary':delivery.get('non_boundary',False)}
                            fingerprint=sha256(g.canonical({'matchId':mid,'inning':innings_index,
                                                             'over':over['over'],'attempt':attempt,
                                                             'delivery':delivery}).encode()).hexdigest()
                            exceptions.append({'matchId':mid,'cohort':cohort,'innings':innings_index+1,
                                               'over':over['over'],'attempt':attempt,'preLegalBalls':legal,
                                               'preWickets':wickets,'preFreeHit':freehit,'reason':reason,
                                               'disposition':disposition(reason,delivery),
                                               'sourceEventSha256':fingerprint,
                                               'observedComponents':normalized})
                            counts[(cohort,innings_index,reason)]+=1
                        extras=delivery.get('extras',{})
                        is_legal='wides' not in extras and 'noballs' not in extras
                        legal+=int(is_legal)
                        wickets+=sum(w.get('kind') not in ('retired hurt','obstructing the field')
                                     for w in delivery.get('wickets',[]))
                        freehit=('noballs' in extras) or (freehit and not is_legal)
    h.require(seen==pools['training']|pools['heldOut'],'MISSING_MATCHES')
    exceptions.sort(key=lambda e:(e['cohort'],e['matchId'],e['innings'],e['over'],e['attempt']))
    return {'version':VERSION,'status':'SOURCE_EXCEPTION_REGISTER_NOT_RESOLVED_DELIVERIES',
            'sourceZipSha256':reference['sourceZipSha256'],
            'auditedMatchCount':len(seen),'supportedAttemptCounts':[
                {'cohort':c,'innings':i+1,'count':n} for (c,i),n in sorted(supported.items())],
            'unsupportedCounts':[
                {'cohort':c,'innings':i+1,'reason':r,'count':n} for (c,i,r),n in sorted(counts.items())],
            'exceptionCount':len(exceptions),'exceptions':exceptions,
            'fullySupportedCoverage':len(exceptions)==0,
            'unobservedPhysicalFields':['wicket end','fielder identity','trajectory','shot sector'],
            'gameplayIntegrationPermitted':False,
            'limitations':['Original records may contain multiple adjudications, overthrows, unusual penalties and retirements.',
                           'Source examples are diagnostic only, never automatically rewritten.',
                           'A complete match scorer needs separately adjudicated rules and attribution.']}

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--archive',required=True,type=Path)
    a.add_argument('--reference',required=True,type=Path)
    a.add_argument('--output',required=True,type=Path)
    opt=a.parse_args()
    obj=audit(opt.archive,json.loads(opt.reference.read_text()))
    opt.output.parent.mkdir(parents=True,exist_ok=True)
    opt.output.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n')
    print(json.dumps({'exceptions':obj['exceptionCount'],'counts':obj['unsupportedCounts']},indent=2))
if __name__=='__main__':main()
