#!/usr/bin/env python3
"""M7H: deterministic, strictly offline two-innings T20 chase research.

Fits separate first and second innings observed component distributions from
M7C TRAINING ONLY, with second-innings required-rate context. Research entropy
never touches the accepted game generator. No skill, strategy or fielding
calibration is claimed; Cricsheet does not record captain intent.

Source: user-provided Cricsheet JSON T20 ZIP, ODC-By 1.0.
https://cricsheet.org/   https://cricsheet.org/licensing/
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import random
import statistics
import zipfile

spec=importlib.util.spec_from_file_location('m7g',Path(__file__).with_name('m7g-full-joint.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
VERSION='LC_T20_CHASE_COMPONENTS_RESEARCH_V1'
EVAL='LC_M7H_TWO_INNINGS_EVALUATION_V1'
PRESSURES=('LOW','MEDIUM','HIGH')

def require(ok,reason):
    if not ok:raise ValueError(reason)

def pressure(target,score,legal):
    require(all(type(i)==int for i in (target,score,legal)) and target>0 and score>=0 and 0<=legal<=120,'BAD_CHASE_STATE')
    remaining=max(1,120-legal)
    rate=6*max(0,target-score)/remaining
    return 'LOW' if rate<6 else ('MEDIUM' if rate<=10 else 'HIGH')

def chase_context(legal,wickets,target,score):
    return g.base.context_id(g.base.phase(legal),g.base.wicket_band(wickets))+'|'+pressure(target,score,legal)

def extract_second(archive_path,reference):
    require(reference.get('version')==g.base.SPLIT_VERSION and reference.get('licenseNoticePresent') is True,'INVALID_REFERENCE')
    require(sha256(archive_path.read_bytes()).hexdigest()==reference['sourceZipSha256'],'ARCHIVE_HASH_MISMATCH')
    pools={s:{r['matchId']:r for r in reference[s]['rows']} for s in ('training','heldOut')}
    require(len(pools['training'])>=200 and len(pools['heldOut'])>=200,'INSUFFICIENT_COHORT')
    require(not set(pools['training'])&set(pools['heldOut']),'MATCH_ID_LEAKAGE')
    require(max(r['date'] for r in pools['training'].values())<min(r['date'] for r in pools['heldOut'].values()),'DATE_LEAKAGE')
    all_ids=set(pools['training'])|set(pools['heldOut'])
    seen=set();excluded=Counter();unsupported=Counter();rows={'training':[],'heldOut':[]}
    with zipfile.ZipFile(archive_path) as z:
        # Same verified archive safety invariants as M7G; never extract to filesystem.
        members=z.infolist()
        require(len(members)<=50000 and len({i.filename for i in members})==len(members),'UNSAFE_COUNT')
        require(sum(i.file_size for i in members)<1_500_000_000,'UNSAFE_SIZE')
        require(any(PurePosixPath(i.filename).name.upper()=='LICENSE.TXT' for i in members),'MISSING_LICENCE')
        for i in members:
            p=PurePosixPath(i.filename)
            require(not p.is_absolute() and '..' not in p.parts and '\\' not in i.filename and i.file_size<=3_000_000 and
                    not ((i.external_attr>>16)&0o170000)==0o120000 and
                    (i.compress_size==0 or i.file_size/max(i.compress_size,1)<=500),'UNSAFE_MEMBER')
            mid=p.stem
            if mid not in all_ids:continue
            require(mid not in seen,'DUPLICATE_ID');seen.add(mid)
            record=json.loads(z.read(i))
            cohort='training' if mid in pools['training'] else 'heldOut'
            prior=pools[cohort][mid]
            require(record['info']['dates'][0]==prior['date'],'DATE_MISMATCH')
            innings=record['innings']
            require(len(innings)==2,'NOT_TWO_INNINGS')
            target=prior['first']['runs']+1
            declared=innings[1].get('target',{}).get('runs')
            if declared is not None and declared!=target:
                excluded['NON_STANDARD_TARGET']+=1;continue
            legal=wickets=score=attempts=0;events=[];local_exclusions=Counter();freehit=False
            for over in innings[1]['overs']:
                for d in over['deliveries']:
                    attempts+=1
                    ext=d.get('extras',{})
                    islegal=not ('wides' in ext or 'noballs' in ext)
                    new_wickets=sum(w.get('kind') not in ('retired hurt','obstructing the field') for w in d.get('wickets',[]))
                    if score>=target or legal>=120 or wickets>=10:
                        local_exclusions['DELIVERY_AFTER_TERMINAL']+=1
                    else:
                        try:
                            key=g.classify(d)
                            if freehit and g.unpack(key)['wicketKind'] not in ('NONE','RUN_OUT'):
                                raise ValueError('FREE_HIT_MASK')
                            events.append((chase_context(legal,wickets,target,score),key))
                        except (ValueError,KeyError,TypeError) as err:
                            local_exclusions[str(err)]+=1
                    legal+=int(islegal);wickets+=new_wickets;score+=d['runs']['total']
                    freehit=bool('noballs' in ext or (freehit and not islegal))
            if legal>120 or wickets>10 or attempts==0:
                excluded['INVALID_SECOND_INNINGS']+=1;continue
            # Some source matches terminate prematurely without a standard target;
            # exclude those entire innings rather than fabricate a chase outcome.
            if legal<120 and wickets<10 and score<target:
                excluded['PREMATURE_SECOND_INNINGS']+=1;continue
            for reason,n in local_exclusions.items():unsupported[reason]+=n
            rows[cohort].append({'matchId':mid,'date':prior['date'],'events':events,
                                 'target':target,'runs':score,'wickets':wickets,
                                 'legalBalls':legal,'attempts':attempts,
                                 'chased':score>=target,'missing':sum(local_exclusions.values()),
                                 'firstRuns':prior['first']['runs']})
    require(seen==all_ids,'MISSING_MATCH_IDS')
    for a in rows.values():a.sort(key=lambda r:(r['date'],r['matchId']))
    require(len(rows['training'])>=200 and len(rows['heldOut'])>=200,'INSUFFICIENT_VALID_SECOND')
    return rows,dict(excluded),dict(unsupported)

def contexts():
    return tuple(g.base.context_id(ph,w)+'|'+pr for ph in g.base.PHASES for w in g.base.WICKET_BANDS for pr in PRESSURES)

def fit(rows,first_model,prior=80):
    require(len(rows)>=200 and prior>0,'INSUFFICIENT_TRAINING')
    # The regime is a TRAINING match latent tempo class. A held-out match
    # is never assigned a regime using its completed innings score.
    rates=sorted(r['runs']*120/max(1,r['legalBalls']) for r in rows)
    cuts=[g.quantile(rates,i/g.REGIMES) for i in range(1,g.REGIMES)]
    def regime(row):return sum(row['runs']*120/max(1,row['legalBalls'])>cut for cut in cuts)
    cats=first_model['categories']
    # Explicit support for every *training*-observed second-innings category;
    # no fallback for unsupported or unseen heldout events.
    cats=sorted(set(cats)|{cat for row in rows for _,cat in row['events']})
    total=Counter();byctx=defaultdict(Counter);byreg=defaultdict(lambda:defaultdict(Counter));regcounts=Counter()
    for row in rows:
        r=regime(row);regcounts[r]+=1
        for ctx,cat in row['events']:
            total[cat]+=1;byctx[ctx][cat]+=1;byreg[r][ctx][cat]+=1
    n=sum(total.values());require(n>20000 and len(cats)>=15,'INSUFFICIENT_DELIVERIES')
    pooled={c:(total[c]+.01)/(n+.01*len(cats)) for c in cats}
    phase={};regs={str(j):{} for j in range(g.REGIMES)}
    for ctx in contexts():
        phase[ctx]=g.base.quantize({c:byctx[ctx][c]+prior*pooled[c] for c in cats},cats)
        for reg in range(g.REGIMES):
            regs[str(reg)][ctx]=g.base.quantize({c:byreg[reg][ctx][c]+prior*phase[ctx][c]/g.MASS for c in cats},cats)
    model={'version':VERSION,'modelStatus':'RESEARCH_ONLY_NOT_GAMEPLAY',
           'gameplayIntegrationPermitted':False,'empiricallyValidatedGameplay':False,
           'outcomeFields':first_model['outcomeFields'],'probabilityMass':g.MASS,
           'categories':cats,'phaseMass':phase,'regimeMass':regs,
           'regimeCounts':[regcounts[i] for i in range(g.REGIMES)],
           'regimeCutpoints':[int(x) if float(x).is_integer() else round(x,8) for x in cuts],'priorExposure':prior,
           'trainingMatchCount':len(rows),'trainingDeliveryCount':n,
           'contextDimensions':['innings 2','T20 phase','wickets lost band','required runs / balls remaining'],
           'unobservedFields':first_model['unobservedFields'],
           'identifiability':{'realPlayerSkillRatings':False,'captainTactics':False,
                              'matchRegime':'training-inferred, not observed'},
           'limitations':['Only observed support; rare legal outcomes may be missing.',
                          'Observed captain commands and fictional player ratings unavailable.',
                          'Research-only; no complete gameplay integration or model switch.',
                          'Second innings with truncated/irregular outcomes excluded.']}
    model['candidateSha256']=g.digest(model)
    return model

def heldout_nll(rows,model):
    totals=model['regimeCounts'];denom=sum(totals)
    output=[];unseen=Counter()
    for row in rows:
        logweights=[math.log(t/denom) for t in totals]
        candidate=baseline=0.;count=0
        for ctx,cat in row['events']:
            if cat not in model['phaseMass'][ctx]:unseen[cat]+=1;continue
            regprob=[max(model['regimeMass'][str(j)][ctx][cat]/g.MASS,1/g.MASS) for j in range(g.REGIMES)]
            incoming=[w+math.log(p) for w,p in zip(logweights,regprob)]
            marginal=g.logsumexp(incoming)
            candidate-=marginal
            baseline-=math.log(max(model['phaseMass'][ctx][cat]/g.MASS,1/g.MASS))
            count+=1;logweights=[v-marginal for v in incoming]
        if count:output.append({'matchId':row['matchId'],'n':count,'candidateNLL':candidate,'pooledNLL':baseline})
    require(bool(output),'NO_HELDOUT_EVENTS')
    n=sum(row['n'] for row in output)
    diff=sum(row['candidateNLL']-row['pooledNLL'] for row in output)/n
    return diff,g.base.bootstrap_delta(output,replicates=400,seed=20261016),dict(unseen),n

def regime_draw(model,seed):
    q=int.from_bytes(sha256((VERSION+'|regime|'+seed).encode()).digest()[:8],'big')
    i=q%sum(model['regimeCounts']);cum=0
    for k,n in enumerate(model['regimeCounts']):
        cum+=n
        if i<cum:return k
    raise AssertionError('UNREACHABLE_REGIME')

def sample(model,regime,ctx,seed,attempt,freehit):
    src=model['regimeMass'][str(regime)][ctx]
    if freehit:
        legal={cat:v for cat,v in src.items() if g.unpack(cat)['wicketKind'] in ('NONE','RUN_OUT')}
        require(bool(legal),'MASK_EXHAUSTED')
        src=g.base.quantize(legal,sorted(legal))
    addr=g.canonical({'version':VERSION,'seed':seed,'ordinal':attempt,'context':ctx})
    n=int.from_bytes(sha256(addr.encode()).digest()[:4],'big');total=0
    for cat,mass in sorted(src.items()):
        total+=mass
        if n<total:return cat
    raise AssertionError('DRAW_OVERFLOW')

def simulate_second(model,seed,target):
    require(type(target)==int and target>0,'BAD_TARGET')
    reg=regime_draw(model,seed)
    legal=wickets=runs=attempts=dots=boundaries=0;freehit=False
    while legal<120 and wickets<10 and runs<target and attempts<280:
        ctx=chase_context(legal,wickets,target,runs)
        cat=sample(model,reg,ctx,seed,attempts,freehit)
        e=g.unpack(cat)
        legal+=e['legalBalls'];wickets+=int(e['wicketKind']!='NONE');runs+=e['teamRuns']
        attempts+=1;dots+=int(e['teamRuns']==0);boundaries+=int(e['boundary']>0)
        freehit=e['legality']=='NO_BALL' or (freehit and e['legality']=='WIDE')
    require(legal==120 or wickets==10 or runs>=target,'UNTERMINATED_CHASE')
    return {'runs':runs,'wickets':wickets,'legalBalls':legal,'attempts':attempts,
            'dots':dots,'boundaries':boundaries,'chased':runs>=target,
            'terminal':'CHASE' if runs>=target else 'ALL_OUT' if wickets==10 else 'OVERS'}

def summarise(rows):
    require(bool(rows),'EMPTY_SUMMARY')
    return {'count':len(rows),'meanRuns':statistics.fmean(x['runs'] for x in rows),
            'meanWickets':statistics.fmean(x['wickets'] for x in rows),
            'meanLegalBalls':statistics.fmean(x['legalBalls'] for x in rows),
            'chaseWinRate':statistics.fmean(x['chased'] for x in rows),
            'p10':g.quantile([x['runs'] for x in rows],.1),
            'p50':g.quantile([x['runs'] for x in rows],.5),
            'p90':g.quantile([x['runs'] for x in rows],.9),
            'dotAttemptProportion':sum(x['dots'] for x in rows)/sum(x['attempts'] for x in rows) if 'dots' in rows[0] else None}

def run(archive,reference_path,first_path,outdir,n=400):
    reference=json.loads(reference_path.read_text());first=json.loads(first_path.read_text())
    require(first['version']==g.VERSION and first['sourceZipSha256']==reference['sourceZipSha256'],'FIRST_MODEL_MISMATCH')
    require(g.digest({k:v for k,v in first.items() if k!='candidateSha256'})==first['candidateSha256'],'TAMPERED_FIRST_MODEL')
    rows,excluded,unsupported=extract_second(archive,reference)
    model=fit(rows['training'],first)
    model['sourceZipSha256']=reference['sourceZipSha256']
    model['firstModelSha256']=first['candidateSha256']
    model['licence']='ODC-By-1.0';model['attribution']='Cricsheet https://cricsheet.org/'
    model.pop('candidateSha256');model['candidateSha256']=g.digest(model)
    delta,ci,unseen,holdcount=heldout_nll(rows['heldOut'],model)
    require(n>=200 and n<=3000,'BAD_SIM_COUNT')
    pairs=[]
    for i in range(n):
        fst=g.simulate_one(first,f'M7H-FIRST-{i:06d}')
        snd=simulate_second(model,f'M7H-SECOND-{i:06d}',fst['runs']+1)
        pairs.append({'first':fst,'second':snd})
    sim=summarise([x['second'] for x in pairs]);real=summarise(rows['heldOut'])
    # These are exploratory/evidentiary comparisons; the M7C holdout has
    # already guided design and cannot be represented as a pristine final set.
    gates={
        'meanSecondRunsWithin5Percent':abs(sim['meanRuns']-real['meanRuns'])<=real['meanRuns']*.05,
        'meanSecondWicketsWithinHalf':abs(sim['meanWickets']-real['meanWickets'])<=.5,
        'chaseWinRateWithin5pp':abs(sim['chaseWinRate']-real['chaseWinRate'])<=.05,
        'secondP10Within10Percent':abs(sim['p10']-real['p10'])<=real['p10']*.1,
        'secondP50Within10Percent':abs(sim['p50']-real['p50'])<=real['p50']*.1,
        'secondP90Within10Percent':abs(sim['p90']-real['p90'])<=real['p90']*.1,
        'heldoutNllBetterThanPhaseOnly':ci[1]<0,
        'zeroObservedExclusions':not excluded and not unsupported,
        'zeroUnseenHeldoutCategories':not unseen,
        'calibratedIndividualPlayerSkills':False,
        'empiricallyIdentifiedTactics':False,
        'freshUntouchedFinalTestSet':False,
        'browserAcceptance':False
    }
    result={'version':EVAL,'status':'RESEARCH_NOT_GAMEPLAY','trainMatches':len(rows['training']),
            'heldOutMatches':len(rows['heldOut']),'scoredHeldOutAttempts':holdcount,
            'sourceZipSha256':reference['sourceZipSha256'],'firstModelSha256':first['candidateSha256'],
            'candidateSha256':model['candidateSha256'],'excludedMatches':excluded,
            'unsupportedSecondDeliveries':unsupported,'unseenHeldoutCategories':unseen,
            'candidateMinusPhaseOnlyNll':delta,'bootstrap95':ci,
            'simulation':sim,'heldOutReference':real,'simulatedTwoInningsMatches':n,
            'gates':gates,'allPromotionGatesPassed':all(gates.values()),
            'gameplayIntegrationPermitted':False,
            'holdoutStatus':'DEVELOPMENT_EVALUATION_NOT_PRISTINE_FINAL_TEST',
            'historicalGameplayModelUnchanged':True}
    outdir.mkdir(parents=True,exist_ok=True)
    (outdir/'LC_M7H_CHASE_CANDIDATE.json').write_text(json.dumps(model,indent=2,sort_keys=True)+'\n')
    (outdir/'LC_M7H_TWO_INNINGS_EVALUATION.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'simulation':sim,'reference':real,'logLossDelta':delta,'bootstrap95':ci,
                      'excluded':excluded,'unsupported':unsupported,'unseen':unseen,'gates':gates},indent=2))
    return model,result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path,required=True)
    p.add_argument('--reference',type=Path,required=True)
    p.add_argument('--first',type=Path,required=True)
    p.add_argument('--outdir',type=Path,required=True)
    p.add_argument('--sim-matches',type=int,default=400)
    args=p.parse_args()
    run(args.archive,args.reference,args.first,args.outdir,args.sim_matches)
if __name__=='__main__':main()
