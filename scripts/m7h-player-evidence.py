#!/usr/bin/env python3
"""Evidence audit for M7H player effects; exposure is NOT a calibrated skill rating.

Source: Cricsheet https://cricsheet.org/ ODC-By 1.0. Match-level chronological
split inherited from M7C. Counts per-ball identities for batter and bowler,
without storing individual names in emitted report. Individual talent and
captain intent are not jointly identifiable from raw counts alone.
"""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import zipfile

def require(ok,message):
    if not ok:raise ValueError(message)

def extract(archive,reference):
    require(sha256(archive.read_bytes()).hexdigest()==reference['sourceZipSha256'],'SOURCE_MISMATCH')
    cohorts={s:{r['matchId'] for r in reference[s]['rows']} for s in ('training','heldOut')}
    require(not cohorts['training']&cohorts['heldOut'],'SPLIT_LEAK')
    c={s:{'bat':Counter(),'bowl':Counter(),'byMatch':Counter(),'tacticalFields':Counter()}
       for s in ('training','heldOut')}
    seen=set()
    with zipfile.ZipFile(archive) as z:
        require(len(z.infolist())<=50000,'ZIP_SIZE')
        for info in z.infolist():
            name=PurePosixPath(info.filename).stem
            if name not in cohorts['training'] and name not in cohorts['heldOut']:continue
            require(name not in seen,'DUPLICATE_MATCH');seen.add(name)
            s='training' if name in cohorts['training'] else 'heldOut'
            m=json.loads(z.read(info))
            registry=m['info'].get('registry',{}).get('people',{})
            require(isinstance(registry,dict),'BAD_REGISTRY')
            for inn in m['innings']:
                for over in inn['overs']:
                    for d in over['deliveries']:
                        ex=d.get('extras',{})
                        # Use Cricsheet's stable person registry identifiers, never
                        # only display names as statistical entity identity.
                        bowler=registry.get(d['bowler'])
                        batter=registry.get(d['batter'])
                        require(isinstance(bowler,str) and isinstance(batter,str),'MISSING_PERSON_REGISTRY')
                        c[s]['bowl'][bowler]+=1
                        if 'wides' not in ex:c[s]['bat'][batter]+=1
                        for key in ('aggression','line','length','field','field_positions','bowling_intent'):
                            if key in d:c[s]['tacticalFields'][key]+=1
    require(seen==cohorts['training']|cohorts['heldOut'],'MISSING_MATCHES')
    train=c['training'];held=c['heldOut']
    output={'version':'LC_M7H_PLAYER_EXPOSURE_AUDIT_V1',
            'sourceZipSha256':reference['sourceZipSha256'],
            'trainingMatchCount':len(cohorts['training']),
            'heldOutMatchCount':len(cohorts['heldOut']),
            'summary':{},'candidatePlayerRatingFitted':False,
            'captainTacticEffectFitted':False,'gameplayIntegrationPermitted':False,
            'limitations':['Player names resolved through Cricsheet per-match registry.people IDs; no global game-rating identity asserted.',
                           'Exposures alone do not identify ability independently of opponents and conditions.',
                           'Delivery JSON contains no observed Lord Cricket captain tactical command.',
                           'A controlled synthetic tactic response test is not empirical causal calibration.']}
    for what in ('bat','bowl'):
        trainCounts=train[what];heldCounts=held[what]
        eligible={k for k,v in trainCounts.items() if v>=300}
        denominator=sum(heldCounts.values())
        output['summary'][what]={'trainingPlayers':len(trainCounts),
                                 'trainAttempts':sum(trainCounts.values()),
                                 'playersWithAtLeast300TrainingAttempts':len(eligible),
                                 'heldOutPlayers':len(heldCounts),
                                 'heldOutAttemptCoverageBy300PlusTrainingPlayers':
                                     sum(v for k,v in heldCounts.items() if k in eligible)/denominator if denominator else None,
                                 'heldOutAttemptCoverageByAnyTrainedPlayer':
                                     sum(v for k,v in heldCounts.items() if k in trainCounts)/denominator if denominator else None}
    output['observedTacticalFieldCounts']={s:dict(c[s]['tacticalFields']) for s in c}
    return output

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--archive',type=Path,required=True)
    p.add_argument('--reference',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    report=extract(a.archive,json.loads(a.reference.read_text()))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
