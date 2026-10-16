#!/usr/bin/env python3
"""M7C evidence-gated, non-gameplay T20 empirical comparison.

Subcommands:
 extract --input /licensed/cricsheet_json.zip --out reference.json
 compare --reference reference.json --synthetic sample.json --out comparison.json

No credentials, internet fetch, machine-learning model mutation, or runtime coefficient changes.
The training set is never evaluated as held-out data; holdout match dates never overlap training.
ODC-By 1.0 attribution: Cricsheet (https://cricsheet.org/), https://cricsheet.org/licensing/
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import random
import statistics
import zipfile
import stat

VERSION="LC_M7C_CALIBRATION_PROTOCOL_V1"
PHASES=("POWERPLAY","MIDDLE","DEATH")

def phase(n):
    return "POWERPLAY" if n<36 else "MIDDLE" if n<90 else "DEATH"

def empty():
    return dict(runs=0,wickets=0,legalBalls=0,attempts=0,dots=0,boundaries=0)

def percentile(values, fraction):
    if not values:return None
    a=sorted(values)
    return a[min(len(a)-1,max(0,math.ceil(fraction*len(a))-1))]

def summarise(rows):
    if not rows:return None
    innings=[r['first'] for r in rows]
    sums={p:empty() for p in PHASES}
    for i in innings:
        for p in PHASES:
            for k in sums[p]: sums[p][k]+=i['phases'][p][k]
    def rate(key):
        return sum(i[key] for i in innings)/sum(i['attempts'] for i in innings)
    return dict(matches=len(rows), meanRuns=statistics.fmean(i['runs'] for i in innings),
                meanWickets=statistics.fmean(i['wickets'] for i in innings),
                p10=percentile([i['runs'] for i in innings],.1),
                p50=percentile([i['runs'] for i in innings],.5),
                p90=percentile([i['runs'] for i in innings],.9),
                meanLegalBalls=statistics.fmean(i['legalBalls'] for i in innings),
                dotAttemptProportion=rate('dots'),boundaryAttemptProportion=rate('boundaries'),
                phaseStats={p:{**s,'runsPerLegalOver':6*s['runs']/s['legalBalls'] if s['legalBalls'] else None,
                               'dotAttemptProportion':s['dots']/s['attempts'] if s['attempts'] else None,
                               'boundaryAttemptProportion':s['boundaries']/s['attempts'] if s['attempts'] else None}
                            for p,s in sums.items()})

def parse_innings(innings):
    s=empty();s['phases']={p:empty() for p in PHASES}
    for over in innings['overs']:
        for d in over['deliveries']:
            run=d['runs']['total']
            if type(run) is not int or run<0:raise ValueError('invalid delivery runs')
            extras=d.get('extras',{})
            is_legal='wides' not in extras and 'noballs' not in extras
            wicket_count=sum(w['kind'] not in ('retired hurt','obstructing the field') for w in d.get('wickets',[]))
            boundary=int(d['runs']['batter'] in (4,6) and not (d.get('non_boundary') is True))
            p=s['phases'][phase(s['legalBalls'])]
            delta=dict(runs=run,wickets=wicket_count,legalBalls=int(is_legal),attempts=1,dots=int(run==0),boundaries=boundary)
            for key,value in delta.items(): s[key]+=value;p[key]+=value
    if s['legalBalls']>120 or s['attempts']<=0 or s['wickets']>10: raise ValueError('invalid innings length')
    if s['legalBalls']<120 and s['wickets']<10: raise ValueError('unfinished first innings')
    return s

def parse_match(blob,name):
    match=json.loads(blob)
    info=match.get('info',{})
    if info.get('match_type')!='T20' or info.get('overs')!=20 or info.get('gender')!='male':return None
    if info.get('outcome',{}).get('method') or info.get('outcome',{}).get('result') in ('no result','abandoned'):return None
    innings=match.get('innings',[])
    if len(innings)!=2:return None
    if any(i.get('target',{}).get('overs') not in (None,20) for i in innings):return None
    first=parse_innings(innings[0])
    d=info.get('dates',[None])[0]
    if not isinstance(d,str):return None
    datetime.date.fromisoformat(d)
    return {'matchId':PurePosixPath(name).stem,'date':d,'first':first}

def extract(source,dest,holdout,min_holdout):
    if not .1<=holdout<=.5:raise ValueError('holdout fraction must be .1 through .5')
    if min_holdout<200:raise ValueError('minimum held-out cohort cannot be less than 200')
    if source.stat().st_size>400_000_000:raise ValueError('archive exceeds 400MB limit')
    matches=[]; excluded={}; names_seen=set()
    with zipfile.ZipFile(source) as z:
        entries=z.infolist()
        if len(entries)>50_000:raise ValueError('too many ZIP members')
        total_expanded=0
        member_names=set()
        for file in entries:
            q=PurePosixPath(file.filename)
            mode=file.external_attr >> 16
            total_expanded+=file.file_size
            if (q.is_absolute() or '..' in q.parts or '\\' in file.filename or
                file.filename in member_names or file.file_size>3_000_000 or
                (stat.S_IFMT(mode)==stat.S_IFLNK) or
                (file.compress_size>0 and file.file_size/file.compress_size>500) or
                total_expanded>1_500_000_000):
                raise ValueError('unsafe ZIP entry')
            member_names.add(file.filename)
        licence_present = any(PurePosixPath(x.filename).name.upper() == 'LICENSE.TXT'
                              for x in entries)
        for file in entries:
            if file.is_dir() or not file.filename.endswith('.json') or file.filename.startswith('__MACOSX/'):
                continue
            try:
                m=parse_match(z.read(file),file.filename)
            except (ValueError,KeyError,IndexError,TypeError) as e:
                # Malformed rows are excluded; record counts rather than quietly substituting values.
                excluded['invalid_data'] = excluded.get('invalid_data',0)+1
                continue
            if m is None:
                excluded['outside_male_uninterrupted_T20'] = excluded.get('outside_male_uninterrupted_T20',0)+1
                continue
            if m['matchId'] in names_seen:raise ValueError('duplicate match identifier')
            names_seen.add(m['matchId']);matches.append(m)
    matches.sort(key=lambda m:(m['date'],m['matchId']))
    cut=int(len(matches)*(1-holdout))
    while 0<cut<len(matches) and matches[cut-1]['date']==matches[cut]['date']:cut-=1
    training,heldout=matches[:cut],matches[cut:]
    with source.open("rb") as source_bytes:
        source_hash=hashlib.file_digest(source_bytes,"sha256").hexdigest()
    result={'version':VERSION,'status':'REFERENCE_INPUT_UNVERIFIED_NOT_MODEL_VALIDATION',
            'declaredSource':'Cricsheet','sourceURL':'https://cricsheet.org/',
            'licence':'ODC-By-1.0','licenceURL':'https://cricsheet.org/licensing/',
            'sourceZipSha256':source_hash,
            'licenseNoticePresent':licence_present,
            'cohort':'Male full-length/uninterrupted T20, innings one, all-out retained',
            'split':'chronological_by_match_no_date_overlap',
            'excluded':excluded,'totalEligible':len(matches),
            'training':{'statistics':summarise(training),'rows':training},
            'heldOut':{'statistics':summarise(heldout),'rows':heldout},
            'holdoutMinMet':len(heldout)>=min_holdout,
            'datasetApprovedByHuman':False,'fittedModel':False,'gameModelChanged':False,
            'disclosure':'Source requires independent provenance/licence verification; constructed fixtures cannot count as real data.'}
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(result,indent=2)+'\n')
    return result

def bootstrap_mean_diff(a,b,n=500):
    rng=random.Random(20261016)
    if not a or not b:return None
    diffs=[]
    for _ in range(n):
        av=sum(a[rng.randrange(len(a))] for __ in range(len(a)))/len(a)
        bv=sum(b[rng.randrange(len(b))] for __ in range(len(b)))/len(b)
        diffs.append(av-bv)
    return {'low95':percentile(diffs,.025),'high95':percentile(diffs,.975),'unit':'MATCH'}

def compare(reference,synthetic,dest,min_holdout):
    if reference.get('version')!=VERSION or reference.get('declaredSource')!='Cricsheet':raise ValueError('unrecognised reference manifest')
    if min_holdout<200:raise ValueError('minimum held-out cohort cannot be less than 200')
    if synthetic.get('version')!='LC_M7C_SYNTHETIC_FIRST_INNINGS_V1' or synthetic.get('source')!='SYNTHETIC_ALPHA':raise ValueError('unrecognised simulation manifest')
    holdout=reference['heldOut']['rows'];training=reference['training']['rows'];sim=synthetic['rows']
    if not holdout or not sim:raise ValueError('no comparable observations')
    if not reference.get('sourceZipSha256') or len(reference['sourceZipSha256'])!=64:raise ValueError('source hash absent')
    if set(x['matchId'] for x in holdout)&set(x['matchId'] for x in training):raise ValueError('holdout leakage')
    if set(x['date'] for x in holdout)&set(x['date'] for x in training):raise ValueError('same-date holdout leakage')
    ref_stats=summarise(holdout)
    sim_stats=summarise([{'first':x['first']} for x in sim])
    bands={}
    for key in ('meanRuns','meanWickets','dotAttemptProportion','boundaryAttemptProportion','p10','p50','p90'):
        a=sim_stats[key];b=ref_stats[key];diff=a-b
        if key=='meanRuns':tolerance=abs(b)*.05
        elif key=='meanWickets':tolerance=.5
        elif key in ('dotAttemptProportion','boundaryAttemptProportion'):tolerance=.02
        else:tolerance=abs(b)*.10
        bands[key]={'synthetic':a,'heldOut':b,'difference':diff,'tolerance':tolerance,'withinTarget':abs(diff)<=tolerance}
    for p in PHASES:
        a=sim_stats['phaseStats'][p];b=ref_stats['phaseStats'][p]
        bands[p+'_runsPerLegalOver']={'synthetic':a['runsPerLegalOver'],'heldOut':b['runsPerLegalOver'],
                                       'difference':a['runsPerLegalOver']-b['runsPerLegalOver'] if a['runsPerLegalOver'] is not None and b['runsPerLegalOver'] is not None else None,
                                       'informationalOnly':True}
    ci=bootstrap_mean_diff([x['first']['runs'] for x in sim],[x['first']['runs'] for x in holdout]);
    adequate=len(holdout)>=min_holdout and len(training)>=min_holdout
    all_bands=all(v.get('withinTarget',True) for v in bands.values())
    result={'version':'LC_M7C_COMPARISON_V1','sourceHash':reference['sourceZipSha256'],
            'realHeldOutMatches':len(holdout),'trainingMatches':len(training),'simulatedMatches':len(sim),
            'minHoldoutRequired':min_holdout,'sampleAdequate':adequate,
            'withinProposedTargets':all_bands,'modelStatus':'SYNTHETIC_ALPHA',
            'candidateNewModelFitted':False,'datasetApproval':False,'approvalGatePassed':False,
            'status':('INSUFFICIENT_REFERENCE_MATCHES' if not adequate else
                      'REFERENCE_TARGETS_FAIL' if not all_bands else
                      'REFERENCE_TARGETS_PASS_BUT_NO_FITTED_MODEL_OR_APPROVAL'),
            'bands':bands,'meanRunsDifferenceBootstrap95':ci,
            'limitations':['The simulation uses a fictional world and fixed source model, not fitted player strengths.',
                           'Bootstrap intervals use independent match units and fixed resampling seed.',
                           'Passing aggregates is insufficient to claim an empirically fitted model.',
                           'Release requires licensing approval, model/version migration and independent cohort validation.']}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(result,indent=2)+'\n')
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__);sub=ap.add_subparsers(dest='cmd',required=True)
    a=sub.add_parser('extract');a.add_argument('--input',type=Path,required=True);a.add_argument('--out',type=Path,required=True)
    a.add_argument('--holdout',type=float,default=.2);a.add_argument('--min-holdout',type=int,default=200)
    b=sub.add_parser('compare');b.add_argument('--reference',type=Path,required=True);b.add_argument('--synthetic',type=Path,required=True)
    b.add_argument('--out',type=Path,required=True);b.add_argument('--min-holdout',type=int,default=200)
    args=ap.parse_args()
    if args.cmd=='extract':
        result=extract(args.input,args.out,args.holdout,args.min_holdout)
        print(json.dumps({'status':result['status'],'training':len(result['training']['rows']),'heldOut':len(result['heldOut']['rows']),'minimumMet':result['holdoutMinMet']}))
    else:
        result=compare(json.loads(args.reference.read_text()),json.loads(args.synthetic.read_text()),args.out,args.min_holdout)
        print(json.dumps({'status':result['status'],'meanRunsDifferenceBootstrap95':result['meanRunsDifferenceBootstrap95']}))
if __name__=='__main__':main()
