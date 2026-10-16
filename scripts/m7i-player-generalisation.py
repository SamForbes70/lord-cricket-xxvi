#!/usr/bin/env python3
"""M7I out-of-sample *predictive* player-history stratification (NOT skill ratings).

Frozen M7H smoothing and coefficients, no tuning on development holdout.
All estimates remain associations, not causal tactics or new playable attributes.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from hashlib import sha256
import importlib.util
import json
from pathlib import Path,PurePosixPath
import statistics
import zipfile

s=importlib.util.spec_from_file_location('m7h_player',Path(__file__).with_name('m7h-player-predictive.py'))
p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
VERSION='LC_M7I_PLAYER_GENERALISATION_AUDIT_V1'

def group(b_exposure,q_exposure):
    b=b_exposure>=300;q=q_exposure>=300
    return 'BOTH_300_PLUS' if b and q else 'BATTER_ONLY_300_PLUS' if b else 'BOWLER_ONLY_300_PLUS' if q else 'NEITHER_300_PLUS'

def evaluate(grouped,pooled,bat,bowl,minimum_matches=20):
    output={}
    for label,matches in sorted(grouped.items()):
        if len(matches)<minimum_matches:continue
        outcomes={}
        for outcome,field in zip(p.OUTCOMES,(1,2,3)):
            comps=[]
            for mid,observations in matches:
                baseNLL=candNLL=0.;count=0
                for ctx,b,q,val in observations:
                    t=pooled[ctx]
                    if t[0]==0:raise ValueError('EMPTY_TRAIN_CONTEXT')
                    p0=t[field]/t[0]
                    bc=bat[(ctx,b)];qc=bowl[(ctx,q)]
                    pb=p.smoothed(bc[field],bc[0],p0)
                    pq=p.smoothed(qc[field],qc[0],p0)
                    pc=(pb+pq)/2
                    baseNLL+=p.binary_nll(val[field-1],p0)
                    candNLL+=p.binary_nll(val[field-1],pc)
                    count+=1
                if count:comps.append({'matchId':mid,'n':count,'candidateNLL':candNLL,'pooledNLL':baseNLL})
            n=sum(c['n'] for c in comps)
            if not n:continue
            delta=sum(c['candidateNLL']-c['pooledNLL'] for c in comps)/n
            ci=p.g.base.bootstrap_delta(comps,replicates=200,seed=20261016)
            outcomes[outcome]={'attempts':n,'matches':len(comps),
                               'candidateMinusBaselineNLL':delta,'matchBootstrap95':ci,
                               'upper95BelowZero':ci[1]<0}
        output[label]=outcomes
    return output

def run(archive,reference):
    if sha256(archive.read_bytes()).hexdigest()!=reference['sourceZipSha256']:
        raise ValueError('SOURCE_MISMATCH')
    pools={key:{r['matchId']:r['date'] for r in reference[key]['rows']} for key in ('training','heldOut')}
    if not pools['training'] or not pools['heldOut'] or set(pools['training'])&set(pools['heldOut']):
        raise ValueError('INVALID_SPLIT')
    midhold=sorted(pools['heldOut'].values())[len(pools['heldOut'])//2]
    train=defaultdict(lambda:[0,0,0,0]);bat=defaultdict(lambda:[0,0,0,0]);bowl=defaultdict(lambda:[0,0,0,0]);
    hold=[];seen=set()
    with zipfile.ZipFile(archive) as z:
        if len(z.infolist())>50000:raise ValueError('UNSAFE_ZIP')
        for info in z.infolist():
            mid=PurePosixPath(info.filename).stem
            if mid not in pools['training'] and mid not in pools['heldOut']:continue
            if mid in seen:raise ValueError('DUPLICATE_MATCH')
            seen.add(mid)
            m=json.loads(z.read(info));reg=m['info']['registry']['people']
            held=mid in pools['heldOut']
            competition=m['info'].get('event',{}).get('name','UNKNOWN')
            teams=tuple(sorted(m['info']['teams']))
            plays=[]
            for i,innings in enumerate(m['innings'][:2]):
                legal=0
                for over in innings['overs']:
                    for d in over['deliveries']:
                        b=reg[d['batter']];q=reg[d['bowler']]
                        context=f'{i}/{p.phase(legal)}';vals=p.outcomes(d)
                        if held:plays.append((context,b,q,vals,teams,competition))
                        else:
                            for dct,key in ((train,context),(bat,(context,b)),(bowl,(context,q))):
                                cnt=dct[key];cnt[0]+=1
                                for j,v in enumerate(vals,1):cnt[j]+=v
                        ext=d.get('extras',{})
                        legal+=int('wides' not in ext and 'noballs' not in ext)
            if held:hold.append((mid,plays,teams,competition,pools['heldOut'][mid]))
    if seen!=set(pools['training'])|set(pools['heldOut']):raise ValueError('MISSING_MATCH')
    grouped=defaultdict(list);count=defaultdict(int)
    competition_games=defaultdict(set)
    for mid,plays,teams,competition,date in hold:
        parts=defaultdict(list)
        for ctx,b,q,vals,tm,comp in plays:
            grp=group(bat[(ctx,b)][0],bowl[(ctx,q)][0])
            parts[grp].append((ctx,b,q,vals));count[grp]+=1
            parts['ALL'].append((ctx,b,q,vals))
            parts['EARLY_DEV' if date<midhold else 'LATE_DEV'].append((ctx,b,q,vals))
            parts['COMP:'+str(comp)].append((ctx,b,q,vals))
        for label,rows in parts.items():
            grouped[label].append((mid,rows))
            if label.startswith('COMP:'):competition_games[label].add(mid)
    for label in list(grouped):
        if label.startswith('COMP:') and len(competition_games[label])<35:del grouped[label]
    result=evaluate(grouped,train,bat,bowl)
    return {'version':VERSION,'status':'DEVELOPMENT_HOLDOUT_PREDICTIVE_ASSOCIATION_ONLY',
            'sourceZipSha256':reference['sourceZipSha256'],'matchCounts':{
                'training':len(pools['training']),'developmentHoldout':len(pools['heldOut'])},
            'method':'Fixed M7H prior=300 per innings/phase; marginal dot, bat-boundary and wicket predictions; match bootstrap',
            'exposureGroupDefinitions':'>=300 training attempts in same innings/phase context',
            'warmthCountsByAttempt':dict(count),'earlyLateDevelopmentSplitAt':midhold,
            'results':result,'gameplayIntegrationPermitted':False,
            'untouchedFinalTestSet':False,'causalTacticalEffects':False,'calibratedGameplaySkillRatings':False,
            'cautions':['Competition and time strata reuse inspected development holdout; not release evidence.',
                        'Cold-start gains may be inherited from another known participant.',
                        'Cricsheet team/competition composition confounds player histories.',
                        'Marginal predictions are not a legal joint cricket-outcome sampler.']}

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--archive',required=True,type=Path)
    a.add_argument('--reference',required=True,type=Path)
    a.add_argument('--output',required=True,type=Path)
    args=a.parse_args()
    result=run(args.archive,json.loads(args.reference.read_text()))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'groups':list(result['results']),'counts':result['warmthCountsByAttempt']},indent=2))
if __name__=='__main__':main()
