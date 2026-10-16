#!/usr/bin/env python3
"""M7G: research-only, observed scoring-component joint delivery model.

Uses CRICSHEET first innings and M7C frozen chronological split. Inference and
latent-tempo labels are fitted exclusively on training innings. Unlike the M7F
envelope it separates bat runs and each supported extras channel and identifies
supported dismissal classes and which batter is out. Ball-tracking, tactics,
physical wicket end and actual fielding outcomes are not identified; gameplay
promotion is intentionally prohibited.
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
import sys
import zipfile

spec=importlib.util.spec_from_file_location('m7f_joint',Path(__file__).with_name('m7f-joint.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
VERSION='LC_T20_SCORING_COMPONENTS_RESEARCH_V1'
EVAL_VERSION='LC_M7G_HOLDOUT_EVALUATION_V1'
REGIMES=5
WICKET_MAP={'bowled':'BOWLED','lbw':'LBW','caught':'CAUGHT',
            'caught and bowled':'CAUGHT','stumped':'STUMPED',
            'hit wicket':'HIT_WICKET','run out':'RUN_OUT'}
EXTRA_KEYS=('wides','noballs','byes','legbyes')
MASS=2**32

def require(ok,message):
    if not ok: raise ValueError(message)

def canonical(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(x): return sha256(canonical(x).encode()).hexdigest()

def make_key(legality,bat,wide,nb,byes,lb,boundary,wicket,who):
    return '|'.join(map(str,(legality,bat,wide,nb,byes,lb,boundary,wicket,who)))

def unpack(key):
    a=key.split('|')
    require(len(a)==9,'WRONG_COMPONENT_COUNT')
    lg,bat,wide,nb,byes,lb,boundary,wicket,who=a
    for v in a[1:7]:require(v.isascii() and v.isdecimal(),'NOT_NONNEGATIVE_INT')
    bat,wide,nb,byes,lb,boundary=map(int,a[1:7])
    require(lg in ('LEGAL','WIDE','NO_BALL') and wicket in (*WICKET_MAP.values(),'NONE')
            and who in ('NONE','STRIKER','NON_STRIKER'),'UNSUPPORTED_COMPONENT')
    require(max(bat,wide,nb,byes,lb)<=12,'UNSUPPORTED_RUN_MAGNITUDE')
    require(boundary in (0,4,6),'INVALID_BOUNDARY')
    require(((lg=='WIDE' and wide>=1 and not nb and not bat and not byes and not lb)
             or (lg=='NO_BALL' and nb==1 and not wide)
             or (lg=='LEGAL' and wide==0 and nb==0)), 'INVALID_LEGALITY_CHANNEL')
    require(not (byes and lb) and not (bat and (byes or lb)),'INVALID_EXTRA_CHANNEL')
    total=bat+wide+nb+byes+lb
    if boundary:
        require(wicket=='NONE' and total-nb-(1 if lg=='WIDE' else 0)==boundary,
                'BOUNDARY_DISMISSAL_OR_ALLOWANCE')
        if boundary==6:require(bat==6,'SIX_MUST_BE_BAT')
    require((wicket=='NONE')==(who=='NONE'),'INVALID_DISMISSED_PARTY')
    if wicket not in ('NONE','RUN_OUT'):
        require(who=='STRIKER','ONLY_RUNOUT_DISMISSES_NON_STRIKER')
        require(bat+byes+lb+max(0,wide-1)==0,'UNSUPPORTED_RUNNING_WICKET')
        if wicket=='CAUGHT':require(bat==0,'CAUGHT_WITH_BAT_RUNS')
    if lg=='WIDE':require(wicket in ('NONE','RUN_OUT','STUMPED'),'WIDE_WICKET_MASK')
    if lg=='NO_BALL':require(wicket in ('NONE','RUN_OUT'),'NO_BALL_WICKET_MASK')
    return {'legality':lg,'batRuns':bat,'wides':wide,'noBalls':nb,'byes':byes,'legByes':lb,
            'boundary':boundary,'wicketKind':wicket,'dismissed':who,'teamRuns':total,
            'completedRuns': 0 if boundary else bat+byes+lb+max(0,wide-1),
            'legalBalls':int(lg=='LEGAL')}

def classify(d):
    extras=d.get('extras',{})
    require(isinstance(extras,dict),'INVALID_EXTRAS')
    require(not (set(extras)-set(EXTRA_KEYS)),'UNSUPPORTED_EXTRA_TYPE')
    a=[]
    for name in EXTRA_KEYS:
        x=extras.get(name,0)
        require(type(x)==int and 0<=x<=12,'INVALID_EXTRA_VALUE')
        a.append(x)
    wide,nb,byes,lb=a
    lg='WIDE' if wide else ('NO_BALL' if nb else 'LEGAL')
    bat=d['runs']['batter'];tot=d['runs']['total'];extra_total=d['runs']['extras']
    require(type(bat)==int and type(tot)==int and type(extra_total)==int and
            bat>=0 and tot==bat+extra_total and extra_total==sum(a),'RUN_RECONCILIATION')
    wickets=[w for w in d.get('wickets',[]) if w.get('kind') not in ('retired hurt','obstructing the field')]
    require(len(wickets)<=1,'MULTI_WICKET_UNSUPPORTED')
    if wickets:
        wicket=WICKET_MAP.get(wickets[0].get('kind'))
        require(wicket is not None,'UNSUPPORTED_WICKET_TYPE')
        out=wickets[0]['player_out']
        who='STRIKER' if out==d['batter'] else 'NON_STRIKER' if out==d['non_striker'] else 'UNKNOWN'
    else:wicket='NONE';who='NONE'
    boundary=0
    if not d.get('non_boundary',False):
        if bat in (4,6):boundary=bat
        elif wide==5 or byes==4 or lb==4:boundary=4
    key=make_key(lg,bat,wide,nb,byes,lb,boundary,wicket,who)
    unpack(key)
    return key

def extract(archive_path:Path,reference):
    require(reference.get('version')==base.SPLIT_VERSION and
            reference.get('split')=='chronological_by_match_no_date_overlap' and
            reference.get('licenseNoticePresent') is True,'INVALID_REFERENCE_PROTOCOL')
    checksum=sha256(archive_path.read_bytes()).hexdigest()
    require(checksum==reference['sourceZipSha256'],'ARCHIVE_SHA_MISMATCH')
    training={r['matchId']:r for r in reference['training']['rows']}
    holdout={r['matchId']:r for r in reference['heldOut']['rows']}
    require(len(training)>=200 and len(holdout)>=200 and not set(training)&set(holdout),'MATCH_SPLIT_LEAKAGE')
    require(max(r['date'] for r in training.values())<min(r['date'] for r in holdout.values()),'DATE_LEAKAGE')
    output={'training':[],'heldOut':[]};unsupported=Counter();seen=set()
    with zipfile.ZipFile(archive_path) as archive:
        infos=archive.infolist()
        require(len(infos)<=50000 and len({i.filename for i in infos})==len(infos),'UNSAFE_ZIP_COUNT')
        require(sum(i.file_size for i in infos)<1_500_000_000,'UNSAFE_ZIP_SIZE')
        require(any(PurePosixPath(i.filename).name.upper()=='LICENSE.TXT' for i in infos),'MISSING_LICENSE')
        for member in infos:
            name=member.filename;path=PurePosixPath(name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in name and
                    member.file_size<=3_000_000 and not ((member.external_attr>>16)&0o170000==0o120000),
                    'UNSAFE_ZIP_MEMBER')
            match_id=path.stem
            row=training.get(match_id) or holdout.get(match_id)
            if row is None:continue
            require(match_id not in seen,'DUPLICATE_MATCH');seen.add(match_id)
            m=json.loads(archive.read(member))
            require(row['date']==m['info']['dates'][0],'DATE_CHANGED')
            events=[]; legal=wickets=attempts=0; skipped=0
            freehit=False
            for over in m['innings'][0]['overs']:
                for d in over['deliveries']:
                    attempts+=1
                    e=d.get('extras',{})
                    was_legal=not ('wides' in e or 'noballs' in e)
                    ordinary_wickets=sum(w.get('kind') not in ('retired hurt','obstructing the field') for w in d.get('wickets',[]))
                    try:
                        cat=classify(d)
                        if freehit and unpack(cat)['wicketKind'] not in ('NONE','RUN_OUT'):
                            raise ValueError('FREE_HIT_INELIGIBLE_WICKET')
                        if wickets<10:
                            events.append((base.context_id(base.phase(legal),base.wicket_band(wickets)),cat))
                        else:raise ValueError('AFTER_ALL_OUT')
                    except (ValueError,KeyError,TypeError) as exc:
                        unsupported[str(exc)]+=1;skipped+=1
                    legal+=int(was_legal);wickets+=ordinary_wickets
                    freehit=bool('noballs' in e or (freehit and not was_legal))
            require((legal,wickets,attempts)==tuple(row['first'][k] for k in ('legalBalls','wickets','attempts')),
                    'MATCH_RECONCILIATION_FAILED '+match_id)
            item={'matchId':match_id,'date':row['date'],'events':events,
                  'runs':row['first']['runs'],'wickets':row['first']['wickets'],
                  'legalBalls':legal,'skipped':skipped}
            output['training' if match_id in training else 'heldOut'].append(item)
    require(seen==set(training)|set(holdout),'MISSING_REFERENCE_MATCHES')
    for v in output.values():v.sort(key=lambda x:(x['date'],x['matchId']))
    return output,dict(unsupported),checksum

def quantile(values,p):
    s=sorted(values);return s[max(0,min(len(s)-1,math.ceil(p*len(s))-1))]

def fit(train, *, prior=40):
    require(len(train)>=200 and prior>0,'INSUFFICIENT_TRAINING')
    rates=sorted((row['runs']*120/max(row['legalBalls'],1) for row in train))
    cuts=[quantile(rates,i/REGIMES) for i in range(1,REGIMES)]
    def regime(row):return sum(row['runs']*120/max(row['legalBalls'],1)>cut for cut in cuts)
    all_counts=Counter();contexts=defaultdict(Counter);components=defaultdict(lambda:defaultdict(Counter));groups=Counter()
    for row in train:
        k=regime(row);groups[k]+=1
        for ctx,cat in row['events']:
            all_counts[cat]+=1;contexts[ctx][cat]+=1;components[str(k)][ctx][cat]+=1
    categories=sorted(all_counts)
    require(len(categories)>10,'INSUFFICIENT_CATEGORIES')
    # This is a bounded observed-category distribution: unobserved legal tuples
    # have zero support, so cannot be interpreted as exhaustive gameplay support.
    total=sum(all_counts.values());pooled={x:(all_counts[x]+.01)/(total+.01*len(categories)) for x in categories}
    phase={}
    for p in base.PHASES:
        for wb in base.WICKET_BANDS:
            ctx=base.context_id(p,wb)
            phase[ctx]=base.quantize({x:contexts[ctx][x]+prior*pooled[x] for x in categories},categories)
    mass={}
    for k in range(REGIMES):
        mass[str(k)]={}
        for ctx in phase:
            ctx_prior={x:phase[ctx][x]/MASS for x in categories}
            mass[str(k)][ctx]=base.quantize({x:components[str(k)][ctx][x]+prior*ctx_prior[x] for x in categories},categories)
    return {'version':VERSION,'modelStatus':'RESEARCH_ONLY_NOT_GAMEPLAY',
            'gameplayIntegrationPermitted':False,'empiricallyValidatedGameplay':False,
            'probabilityMass':MASS,'categories':categories,'phaseMass':phase,
            'regimeMass':mass,'regimeCounts':[groups[i] for i in range(REGIMES)],
            'regimeCutpoints':[int(x) if float(x).is_integer() else round(x,8) for x in cuts],'priorExposure':prior,
            'trainingMatchCount':len(train),'trainingDeliveryCount':total,
            'outcomeFields':['legality','batRuns','wides','noBalls','byes','legByes',
                             'boundary','dismissalKind','dismissedBatter'],
            'unobservedFields':['fielder identity','wicketEnd','shotSector',
                                'trajectory','executedLength','attemptedStroke','ball timing'],
            'identifiability':{'realPlayerSkillRatings':False,'captainTactics':False,
                               'latentScoringRegime':'training-innings inferred, not observed'},
            'limitations':['Not exhaustive over cricket-legal outcomes; only training-observed categories.',
                           'Match regime learned using completed training innings, latent at generation.',
                           'Cannot reconstruct real physical fielding evidence from Cricsheet.',
                           'No tactical intent or skill rating recorded for empirical fitting.',
                           'Not permitted to change accepted match generation or saves.']}

def logsumexp(vals):
    hi=max(vals)
    return hi+math.log(sum(math.exp(x-hi) for x in vals))

def holdout_nll(test,model):
    n=0;rows=[];unseen=Counter()
    totals=model['regimeCounts'];denom=sum(totals)
    for row in test:
        weights=[math.log(x/denom) for x in totals]
        c_nll=p_nll=0.;count=0
        for ctx,key in row['events']:
            if key not in model['phaseMass'][ctx]:
                unseen[key]+=1
                continue # disclose support failure, no dishonest floor for unseen events
            masses=[model['regimeMass'][str(k)][ctx][key]/MASS for k in range(REGIMES)]
            pp=model['phaseMass'][ctx][key]/MASS
            incoming=[w+math.log(max(m,1/MASS)) for w,m in zip(weights,masses)]
            marginal=logsumexp(incoming)
            c_nll-=marginal;p_nll-=math.log(pp);count+=1
            weights=[x-marginal for x in incoming] # sequence-aware posterior, no holdout outcome label
        if count:rows.append({'matchId':row['matchId'],'n':count,
                               'candidateNLL':c_nll,'pooledNLL':p_nll})
        n+=count
    return rows,dict(unseen),n

def sample_row(mass, seed,ordinal,ctx):
    # Deterministic research address with its own distinct domain.
    address=canonical({'version':VERSION,'seed':seed,'ordinal':ordinal,'context':ctx})
    draw=int.from_bytes(sha256(address.encode()).digest()[:4],'big')
    c=0
    for cat,value in sorted(mass.items()):
        c+=value
        if draw<c:return cat
    raise AssertionError('MASS_INCOMPLETE')

def sample_regime(model,seed):
    draw=int.from_bytes(sha256((VERSION+'|regime|'+seed).encode()).digest()[:8],'big')
    cum=0;total=sum(model['regimeCounts'])
    for k,weight in enumerate(model['regimeCounts']):
        cum+=weight
        if draw%total<cum:return k
    raise AssertionError('REGIME_MASS')

def simulate_one(model,seed):
    tempo=sample_regime(model,seed)
    legal=wickets=runs=attempts=dot=boundary=0;freehit=False
    while legal<120 and wickets<10 and attempts<280:
        ctx=base.context_id(base.phase(legal),base.wicket_band(wickets))
        source=model['regimeMass'][str(tempo)][ctx]
        # The cricket dismissal/free-hit constraints are filtered BEFORE the
        # random draw. When no-ball still has free-hit next, keep it active.
        if freehit:
            permitted={key:v for key,v in source.items() if unpack(key)['wicketKind'] in ('NONE','RUN_OUT')}
            require(bool(permitted),'NO_FREE_HIT_SUPPORT')
            # One fixed address per attempt. Reallocate quantised masses stably.
            weights=base.quantize(permitted,sorted(permitted))
        else: weights=source
        cat=sample_row(weights,seed,attempts,ctx)
        event=unpack(cat)
        legal+=event['legalBalls'];wickets+=int(event['wicketKind']!='NONE');runs+=event['teamRuns']
        boundary+=int(event['boundary']>0);dot+=int(event['teamRuns']==0);attempts+=1
        freehit=event['legality']=='NO_BALL' or (freehit and event['legality']=='WIDE')
    return {'runs':runs,'wickets':wickets,'legalBalls':legal,'attempts':attempts,
            'dots':dot,'boundaries':boundary,'complete':legal==120 or wickets==10,'regime':tempo}

def run(archive,reference_path,out, n_sim=600):
    reference=json.loads(reference_path.read_text())
    cohorts,exclusions,source=extract(archive,reference)
    model=fit(cohorts['training']);model.update({'sourceZipSha256':source,'licence':'ODC-By-1.0',
                                                  'attribution':'Cricsheet https://cricsheet.org/',
                                                  'split':'M7C chronological/no date overlap',
                                                  'heldOutMatchCount':len(cohorts['heldOut']),
                                                  'excludedObservedEvents':exclusions})
    model['candidateSha256']=digest(model)
    rows,unseen,hold_n=holdout_nll(cohorts['heldOut'],model)
    ci=base.bootstrap_delta(rows,replicates=400,seed=20261016)
    diff=sum(r['candidateNLL']-r['pooledNLL'] for r in rows)/hold_n
    results=[simulate_one(model,f'M7G-{i:06d}') for i in range(n_sim)]
    require(all(r['complete'] for r in results),'SIMULATION_DID_NOT_TERMINATE')
    values=sorted(x['runs'] for x in results)
    stats={'meanRuns':statistics.mean(values),'meanWickets':statistics.mean(x['wickets'] for x in results),
           'dotAttemptProportion':sum(x['dots'] for x in results)/sum(x['attempts'] for x in results),
           'boundaryAttemptProportion':sum(x['boundaries'] for x in results)/sum(x['attempts'] for x in results),
           'p10':quantile(values,.1),'p50':quantile(values,.5),'p90':quantile(values,.9)}
    held=reference['heldOut']['statistics']
    gates={ 'meanRuns':abs(stats['meanRuns']-held['meanRuns'])<=held['meanRuns']*.05,
            'meanWickets':abs(stats['meanWickets']-held['meanWickets'])<=.5,
            'dotAttemptProportion':abs(stats['dotAttemptProportion']-held['dotAttemptProportion'])<=.02,
            'boundaryAttemptProportion':abs(stats['boundaryAttemptProportion']-held['boundaryAttemptProportion'])<=.02,
            'p10':abs(stats['p10']-held['p10'])<=held['p10']*.1,
            'p50':abs(stats['p50']-held['p50'])<=held['p50']*.1,
            'p90':abs(stats['p90']-held['p90'])<=held['p90']*.1,
            'logLossImprovesAgainstPhaseOnly':ci[1]<0,
            'noUnseenHeldoutCategories':not unseen,
            'allObservedDeliveriesScorerCompatible':not exclusions,
            'calibratedSkillEffects':False,'calibratedTactics':False,
            'realFieldingEvidence':False,'fullBrowserAcceptance':False }
    report={'version':EVAL_VERSION,'status':'RESEARCH_NOT_GAMEPLAY',
            'candidateSha256':model['candidateSha256'],'sourceZipSha256':source,
            'trainMatches':len(cohorts['training']),'heldOutMatches':len(cohorts['heldOut']),
            'trainDeliveryCount':model['trainingDeliveryCount'],'heldOutScoredAttempts':hold_n,
            'unseenHeldoutCategories':unseen,'exclusions':exclusions,
            'candidateMinusPhaseNllPerAttempt':diff,'bootstrap95':ci,
            'simulatedInnings':n_sim,'simulated':stats,
            'heldOutReference':{k:held[k] for k in stats},'gates':gates,
            'allPromotionGatesPassed':all(gates.values()),
            'gameplayIntegrationPermitted':False,'historicalSaveModelUnchanged':True}
    out.mkdir(parents=True,exist_ok=True)
    (out/'LC_M7G_JOINT_CANDIDATE.json').write_text(json.dumps(model,indent=2,sort_keys=True)+'\n')
    (out/'LC_M7G_HOLDOUT_EVALUATION.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'summary':stats,'holdout':{k:held[k] for k in stats},'nllDelta':diff,
                      'nllCI':ci,'regimeCuts':model['regimeCutpoints'],
                      'observedCategoryCount':len(model['categories']),
                      'excluded':exclusions,'unseen':unseen,'gates':gates},indent=2))
    return model,report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path,required=True)
    p.add_argument('--reference',type=Path,required=True)
    p.add_argument('--outdir',type=Path,required=True)
    p.add_argument('--sim-innings',type=int,default=600)
    args=p.parse_args()
    require(200<=args.sim_innings<=5000,'INVALID_SAMPLE_COUNT')
    run(args.archive,args.reference,args.outdir,args.sim_innings)
if __name__=='__main__':main()
