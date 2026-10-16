#!/usr/bin/env python3
"""M7H player-conditioned *predictive marginal* audit, research only.

Fixed 300-attempt Beta shrinkage toward training phase/innings baselines,
no Cricsheet player name used as ID, no holdout fitting, no tactical labels.
Estimates predictive player-history effects, NOT causal skill or 0-100 ratings.
Cricsheet ODC-By https://cricsheet.org/licensing/
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from hashlib import sha256
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import zipfile

spec=importlib.util.spec_from_file_location('m7g',Path(__file__).with_name('m7g-full-joint.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
VERSION='LC_M7H_PLAYER_MARGINAL_PREDICTIVE_V1'
PRIOR=300
OUTCOMES=('dot','boundary','wicket')

def require(x,why):
    if not x:raise ValueError(why)

def phase(legal):
    return 'POWERPLAY' if legal<36 else 'MIDDLE' if legal<90 else 'DEATH'

def outcomes(delivery):
    r=delivery['runs'];w=delivery.get('wickets',[])
    return (int(r['total']==0),
            int(r['batter'] in (4,6) and not delivery.get('non_boundary',False)),
            int(any(x.get('kind') not in ('retired hurt','obstructing the field') for x in w)))

def smoothed(count,exposure,base,prior=PRIOR):
    require(0<=base<=1 and 0<=count<=exposure and prior>0,'INVALID_SMOOTHING')
    return (count+prior*base)/(exposure+prior)

def binary_nll(value,p):
    p=max(1e-8,min(1-1e-8,p))
    return -math.log(p if value else 1-p)

def run(archive,reference,output):
    require(sha256(archive.read_bytes()).hexdigest()==reference['sourceZipSha256'],'SOURCE_HASH_MISMATCH')
    ids={s:{r['matchId'] for r in reference[s]['rows']} for s in ('training','heldOut')}
    require(len(ids['training'])>=200 and len(ids['heldOut'])>=200 and not ids['training']&ids['heldOut'],'SPLIT_INVALID')
    pooled=defaultdict(lambda:[0,0,0,0]);bat=defaultdict(lambda:[0,0,0,0]);bowl=defaultdict(lambda:[0,0,0,0]);
    holdouts=[];seen=set();missing=0
    with zipfile.ZipFile(archive) as z:
        require(len(z.infolist())<=50000,'ZIP_TOO_MANY')
        for info in z.infolist():
            mid=PurePosixPath(info.filename).stem
            if mid not in ids['training'] and mid not in ids['heldOut']:continue
            require(mid not in seen,'DUPLICATE_MATCH');seen.add(mid)
            m=json.loads(z.read(info));registry=m['info']['registry']['people'];held=mid in ids['heldOut']
            holdrows=[]
            for i,inn in enumerate(m['innings']):
                legal=0
                for over in inn['overs']:
                    for d in over['deliveries']:
                        b=registry.get(d['batter']);q=registry.get(d['bowler'])
                        if not b or not q:missing+=1;continue
                        ctx=f'{i}/{phase(legal)}'
                        values=outcomes(d)
                        if held:holdrows.append((ctx,b,q,values))
                        else:
                            for counter,key in ((pooled,ctx),(bat,(ctx,b)),(bowl,(ctx,q))):
                                t=counter[key];t[0]+=1
                                for k,v in enumerate(values,1):t[k]+=v
                        legal+=int('wides' not in d.get('extras',{}) and 'noballs' not in d.get('extras',{}))
            if held:holdouts.append((mid,holdrows))
    require(seen==ids['training']|ids['heldOut'],'MISSING_MATCHES')
    require(missing==0,'UNRESOLVED_REGISTRY_IDENTITIES')
    results={};per_cohort={}
    for j,name in enumerate(OUTCOMES,1):
        comparisons=[];attempts=0
        for mid,observations in holdouts:
            base_nll=adjusted_nll=0.;n=0
            for ctx,b,q,vals in observations:
                total=pooled[ctx];require(total[0]>0,'MISSING_BASE_CONTEXT')
                p0=total[j]/total[0]
                bat_record=bat[(ctx,b)];bowl_record=bowl[(ctx,q)]
                a=smoothed(bat_record[j],bat_record[0],p0)
                z=smoothed(bowl_record[j],bowl_record[0],p0)
                # No hyperparameter was fitted to holdout. Equal fixed-weight
                # predictive mixture of the two shrinkage estimates.
                p1=(a+z)/2
                base_nll+=binary_nll(vals[j-1],p0)
                adjusted_nll+=binary_nll(vals[j-1],p1)
                n+=1
            if n:comparisons.append({'matchId':mid,'n':n,'candidateNLL':adjusted_nll,'pooledNLL':base_nll});attempts+=n
        diff=sum(t['candidateNLL']-t['pooledNLL'] for t in comparisons)/attempts
        ci=g.base.bootstrap_delta(comparisons,replicates=400,seed=20261016)
        results[name]={'heldOutAttemptCount':attempts,'candidateMinusPhaseBaselineNLL':diff,
                       'bootstrap95ByMatch':ci,'predictiveImprovementSupported':ci[1]<0}
    obj={'version':VERSION,'status':'EXPLORATORY_PREDICTIVE_NOT_SKILL_RATINGS',
         'sourceZipSha256':reference['sourceZipSha256'],
         'trainMatches':len(ids['training']),'heldOutMatches':len(ids['heldOut']),
         'identityResolution':'Cricsheet per-match registry.people stable person IDs',
         'priorExposure':PRIOR,'mixture':'0.5*smoothed_batter+0.5*smoothed_bowler',
         'context':['innings index','phase by pre-delivery legal balls'],
         'results':results,'gameplayIntegrationPermitted':False,
         'calibratedSkill0To100':False,'tacticalEffectsIdentified':False,
         'untouchedFinalTestSet':False,
         'limitations':['Historical associations, not causal or format-independent player skill.',
                        'Missing opponent/ground/quality interactions can confound associations.',
                        'No observed captain choices in delivery records; no tactic-effect calibration.',
                        'Previous M7 work has already used this development holdout.',
                        'Separate marginal outcome predictions cannot replace a joint legal delivery sampler.']}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n')
    print(json.dumps(obj,indent=2))
    return obj

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--archive',type=Path,required=True)
    p.add_argument('--reference',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    run(a.archive,json.loads(a.reference.read_text()),a.output)
if __name__=='__main__':main()
