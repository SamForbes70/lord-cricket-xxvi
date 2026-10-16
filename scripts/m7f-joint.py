#!/usr/bin/env python3
"""M7F evidence-gated, research-only categorical joint T20 delivery-envelope model.

Trains from Cricsheet first-innings deliveries using the frozen M7C match/date split.
A category jointly represents legality, TEAM runs, whether a BAT boundary was recorded,
and wicket class. It is NOT a full scoring resolution (extras attribution, end changes,
fielding, dismissal location and player/tactical skill are unidentified). Never route
this pack into the accepted production delivery generator.
Cricsheet ODC-By 1.0, https://cricsheet.org/ and https://cricsheet.org/licensing/
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import random
import statistics
import zipfile
import stat

VERSION = 'LC_T20_JOINT_ENVELOPE_RESEARCH_V1'
MASS = 2 ** 32
PHASES = ('POWERPLAY', 'MIDDLE', 'DEATH')
WICKET_BANDS = ('0-2', '3-5', '6-9')
WICKET_CLASSES = ('NONE', 'BOWLER', 'RUN_OUT', 'STUMPED', 'OTHER')
LEGALS = ('LEGAL', 'WIDE', 'NO_BALL')
MIN_MATCHES = 200
SPLIT_VERSION = 'LC_M7C_CALIBRATION_PROTOCOL_V1'


def require(condition, message):
    if not condition: raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def phase(legal_balls):
    return 'POWERPLAY' if legal_balls < 36 else 'MIDDLE' if legal_balls < 90 else 'DEATH'


def wicket_band(wickets):
    return '0-2' if wickets < 3 else '3-5' if wickets < 6 else '6-9'


def context_id(phase_id, band):
    require(phase_id in PHASES and band in WICKET_BANDS, 'INVALID_CONTEXT')
    return phase_id + '/' + band


def tuple_id(legality, runs, boundary, wicket):
    return f'{legality}|{runs}|{int(boundary)}|{wicket}'


def parse_tuple_id(value):
    a,b,c,d = value.split('|')
    return a,int(b),int(c),d


def allowed(legality, runs, boundary, wicket):
    if legality not in LEGALS or type(runs) is not int or not 0 <= runs <= 10:
        return False
    if type(boundary) is not bool or wicket not in WICKET_CLASSES:
        return False
    if legality != 'LEGAL' and runs == 0: return False
    if boundary and (legality == 'WIDE' or runs < (5 if legality == 'NO_BALL' else 4)):
        return False
    if legality == 'WIDE' and wicket not in ('NONE', 'RUN_OUT', 'STUMPED'):
        return False
    if legality == 'NO_BALL' and wicket not in ('NONE', 'RUN_OUT'):
        return False
    # This categorical envelope cannot describe additional scored runs *after* an
    # already-crossed boundary. Eligible high-score classes use no boundary flag.
    return True


UNIVERSE = sorted(tuple_id(l,r,b,w) for l in LEGALS for r in range(11)
                  for b in (False,True) for w in WICKET_CLASSES if allowed(l,r,b,w))
UNIVERSE_SET = frozenset(UNIVERSE)


def quantize(raw, keys):
    """Hamilton largest-remainder apportionment: sum exactly 2^32 in stable order."""
    weights = [raw[k] for k in keys]
    require(weights and all(math.isfinite(v) and v >= 0 for v in weights) and sum(weights) > 0,
            'INVALID_CATEGORY_WEIGHTS')
    total = sum(weights)
    # Reserve one integer quantum per supported legal outcome: held-out
    # unseen-but-valid categories must never have zero predictive mass.
    exact = [v/total*(MASS-len(keys)) for v in weights]
    parts = [1+int(v) for v in exact]
    remainder = MASS-sum(parts)
    for idx in sorted(range(len(keys)), key=lambda i: (-(exact[i]-(parts[i]-1)), keys[i]))[:remainder]:
        parts[idx] += 1
    require(sum(parts) == MASS, 'MASS_NOT_NORMALIZED')
    return dict(zip(keys,parts))


def sample(masses, seed, ordinal, context):
    """Independent research entropy stream. Never reuse accepted game PRNG domains."""
    require(sum(masses.values()) == MASS, 'NON_NORMALIZED_MASS')
    addr = canonical({'researchVersion': VERSION, 'seed':str(seed), 'ordinal':ordinal, 'context':context})
    draw = int.from_bytes(hashlib.sha256(addr.encode()).digest()[:4], 'big')
    cursor = 0
    for cat in sorted(masses):
        cursor += masses[cat]
        if draw < cursor: return cat
    raise AssertionError('UNREACHABLE_DRAW')


def classify_delivery(delivery):
    extras=delivery.get('extras', {})
    require(isinstance(extras,dict), 'INVALID_EXTRAS')
    require(not ('wides' in extras and 'noballs' in extras), 'INVALID_DUAL_EXTRAS')
    legality = 'WIDE' if 'wides' in extras else 'NO_BALL' if 'noballs' in extras else 'LEGAL'
    run_info=delivery['runs']
    r=run_info['total']; bat=run_info['batter']; ex=run_info['extras']
    require(all(type(x) is int and x >= 0 for x in (r,bat,ex)), 'INVALID_RUN_VALUES')
    require(r == bat+ex == bat+sum(extras.values()), 'INVALID_EXTRAS_RECONCILIATION')
    wickets=[w for w in delivery.get('wickets',[]) if w['kind'] not in ('retired hurt','obstructing the field')]
    require(len(wickets)<=1,'MULTIPLE_WICKETS_NOT_SUPPORTED')
    if not wickets: wicket='NONE'
    elif wickets[0]['kind'] in ('caught','caught and bowled','bowled','lbw','hit wicket'):
        wicket='BOWLER'
    elif wickets[0]['kind']=='run out': wicket='RUN_OUT'
    elif wickets[0]['kind']=='stumped': wicket='STUMPED'
    else: wicket='OTHER'
    boundary=bool(bat in (4,6) and not delivery.get('non_boundary',False))
    require(allowed(legality,r,boundary,wicket), 'ILLEGAL_ENVELOPE')
    ident=tuple_id(legality,r,boundary,wicket)
    require(ident in UNIVERSE_SET,'CATEGORY_OUTSIDE_UNIVERSE')
    return ident,len(wickets),int(legality=='LEGAL'),int(boundary),r


def extract_observations(archive_path, reference):
    require(reference.get('version')==SPLIT_VERSION and reference.get('split')=='chronological_by_match_no_date_overlap',
            'UNSUPPORTED_REFERENCE_SPLIT')
    require(reference.get('licenseNoticePresent') is True, 'LICENSE_NOTICE_REQUIRED')
    with archive_path.open('rb') as f:
        digest=hashlib.file_digest(f, 'sha256').hexdigest()
    require(digest==reference.get('sourceZipSha256'), 'SOURCE_ARCHIVE_SHA_MISMATCH')
    training=reference['training']['rows']; heldout=reference['heldOut']['rows']
    require(len(training)>=MIN_MATCHES and len(heldout)>=MIN_MATCHES,'INSUFFICIENT_MATCHES')
    training_ids={r['matchId']:r for r in training}; heldout_ids={r['matchId']:r for r in heldout}
    require(len(training_ids)==len(training) and len(heldout_ids)==len(heldout) and
            not set(training_ids)&set(heldout_ids),'TRAIN_HOLDOUT_ID_LEAKAGE')
    require(max(r['date'] for r in training)<min(r['date'] for r in heldout), 'DATE_LEAKAGE')
    cohorts={'training':[],'heldOut':[]}; unsupported=Counter(); read_ids=set()
    with zipfile.ZipFile(archive_path) as z:
        info_list=z.infolist()
        require(len(info_list)<=50000 and sum(i.file_size for i in info_list)<1_500_000_000,
                'UNSAFE_ARCHIVE_CAPACITY')
        names=[i.filename for i in info_list]
        require(len(names)==len(set(names)), 'DUPLICATE_ARCHIVE_MEMBER')
        require(any(PurePosixPath(i.filename).name.upper()=='LICENSE.TXT' for i in info_list),
                'ARCHIVE_LICENSE_MISSING')
        for member in info_list:
            name=member.filename
            path=PurePosixPath(name)
            file_mode=member.external_attr>>16
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in name and
                    stat.S_IFMT(file_mode)!=stat.S_IFLNK and member.file_size<=3_000_000 and
                    (not member.compress_size or member.file_size/member.compress_size<=500),
                    'UNSAFE_ARCHIVE_MEMBER')
            identifier=path.stem
            if identifier not in training_ids and identifier not in heldout_ids: continue
            require(identifier not in read_ids,'DUPLICATE_MATCH_ID')
            read_ids.add(identifier)
            match=json.loads(z.read(member))
            expected=(training_ids.get(identifier) or heldout_ids.get(identifier))
            require(match['info']['dates'][0]==expected['date'], 'SOURCE_DATE_MISMATCH')
            target='training' if identifier in training_ids else 'heldOut'
            innings=match['innings'][0]
            balls=[]; legal=0; wickets=0; attempts=0; rejected=0
            for over in innings['overs']:
                for delivery in over['deliveries']:
                    attempts+=1
                    try:
                        cat, wk, lg, bound, runs=classify_delivery(delivery)
                    except (ValueError,KeyError,TypeError) as e:
                        unsupported[str(e)]+=1
                        # Still advance match wicket/ball clocks to avoid changing the
                        # contextual state of subsequent observed deliveries.
                        ex=delivery.get('extras',{})
                        lg=int('wides' not in ex and 'noballs' not in ex)
                        wk=sum(w.get('kind') not in ('retired hurt','obstructing the field') for w in delivery.get('wickets',[]))
                        legal+=lg; wickets+=wk; rejected+=1
                        continue
                    p=phase(legal)
                    wb=wicket_band(wickets) if wickets<10 else None
                    if wb is not None:
                        balls.append((context_id(p,wb),cat))
                    else:
                        unsupported['POST_TEN_WICKETS']+=1
                        rejected+=1
                    legal+=lg; wickets+=wk
            require(legal==expected['first']['legalBalls'] and
                    wickets==expected['first']['wickets'] and
                    attempts==expected['first']['attempts'], f'INNINGS_RECONCILIATION_FAILED {identifier}: actual {legal},{wickets},{attempts} expected {expected["first"]["legalBalls"]},{expected["first"]["wickets"]},{expected["first"]["attempts"]}')
            cohorts[target].append({'matchId':identifier,'date':expected['date'],'events':balls,'skipped':rejected})
    require(read_ids==set(training_ids)|set(heldout_ids),'MISSING_MATCH_IDS')
    for cohort in cohorts.values():
        cohort.sort(key=lambda x:(x['date'],x['matchId']))
    return cohorts,dict(unsupported),digest


def get_counts(match_rows):
    groups=defaultdict(Counter); pooled=Counter(); n=0
    for row in match_rows:
        for ctx,cat in row['events']:
            groups[ctx][cat]+=1;pooled[cat]+=1;n+=1
    return groups,pooled,n


def fit(train, *, prior_exposure=250, uniform_exposure=.1):
    require(prior_exposure>0 and uniform_exposure>0,'INVALID_PRIOR')
    groups,pooled,n=get_counts(train)
    require(n>0,'EMPTY_TRAINING')
    total=len(UNIVERSE)
    pooled_prob={key:(pooled[key]+uniform_exposure/total)/(n+uniform_exposure) for key in UNIVERSE}
    pooled_mass=quantize(pooled_prob,UNIVERSE)
    contexts={}
    for p in PHASES:
        for wb in WICKET_BANDS:
            ctx=context_id(p,wb)
            local=groups[ctx];local_n=sum(local.values())
            weighted={cat:local[cat]+prior_exposure*pooled_prob[cat] for cat in UNIVERSE}
            contexts[ctx]=quantize(weighted,UNIVERSE)
    return {'version':VERSION,'modelStatus':'RESEARCH_ONLY_NOT_GAMEPLAY',
            'contextDimensions':['powerplay/middle/death','pre-delivery wicket band 0-2/3-5/6-9'],
            'outcomeFields':['legality','teamRuns','batBoundaryFlag','wicketClass'],
            'probabilityMass':MASS, 'priorExposure':prior_exposure,
            'trainingMatchCount':len(train),'trainingDeliveryCount':n,
            'categories':UNIVERSE, 'pooledMass':pooled_mass,'contextMass':contexts,
            'limitations':['Team runs not split into bat runs and extras, wickets not fully attributed or located.',
                           'Cricsheet does not expose the game player-skill ratings or commanded tactics.',
                           'No fielder coverage, strike rotation, no-ball free-hit state, pressure or pitch conditions.',
                           'Not an engine drop-in; must not replace synthetic-alpha-01 or alter historical saves.'],
            'gameplayIntegrationPermitted':False,'empiricallyValidatedGameplay':False}


def logloss(obs,masses):
    probability=masses.get(obs,0)/MASS
    require(probability>0,'UNSEEN_OUTCOME_ZERO_PROBABILITY')
    return -math.log(probability)


def score_holdout(heldout,model):
    scored=[]
    for row in heldout:
        candidates=baseline=0.
        for ctx,cat in row['events']:
            candidates+=logloss(cat,model['contextMass'][ctx])
            baseline+=logloss(cat,model['pooledMass'])
        scored.append({'matchId':row['matchId'],'n':len(row['events']),
                       'candidateNLL':candidates,'pooledNLL':baseline})
    return scored


def bootstrap_delta(rows,replicates=600,seed=20261016):
    require(rows and replicates>=200,'INSUFFICIENT_BOOTSTRAP')
    rng=random.Random(seed); n=len(rows);vals=[]
    for _ in range(replicates):
        indices=[rng.randrange(n) for j in range(n)]
        denom=sum(rows[i]['n'] for i in indices)
        vals.append(sum(rows[i]['candidateNLL']-rows[i]['pooledNLL'] for i in indices)/denom)
    vals.sort()
    return [vals[int(replicates*.025)],vals[int(replicates*.975)-1]]


def synthetic_innings(model,seed):
    legal=wickets=runs=attempts=boundaries=dots=0
    while legal<120 and wickets<10 and attempts<240:
        ctx=context_id(phase(legal),wicket_band(wickets))
        cat=sample(model['contextMass'][ctx],seed,attempts,ctx)
        lg,rs,bound,wicket=parse_tuple_id(cat)
        legal+=int(lg=='LEGAL');wickets+=int(wicket!='NONE');runs+=rs
        boundaries+=bound;dots+=int(rs==0);attempts+=1
    return {'runs':runs,'wickets':wickets,'legalBalls':legal,'attempts':attempts,
            'boundaries':boundaries,'dots':dots,'complete':legal==120 or wickets==10}


def percentile(values,p):
    v=sorted(values)
    return v[min(len(v)-1,max(0,math.ceil(len(v)*p)-1))]


def run(reference_path,archive_path,outdir,sim_matches=400):
    reference=json.loads(reference_path.read_text())
    cohorts,excluded,digest=extract_observations(archive_path,reference)
    model=fit(cohorts['training'])
    model.update({'sourceZipSha256':digest,'attribution':'Cricsheet https://cricsheet.org/',
                  'licence':'ODC-By-1.0', 'split':'M7C chronological match/date isolation',
                  'holdoutMatchCount':len(cohorts['heldOut']), 'unsupportedDeliveryCounts':excluded})
    hash_payload={k:v for k,v in model.items() if k!='candidateSha256'}
    model['candidateSha256']=sha(hash_payload)
    holdout=score_holdout(cohorts['heldOut'],model)
    total=sum(x['n'] for x in holdout)
    delta=sum(x['candidateNLL']-x['pooledNLL'] for x in holdout)/total
    ci=bootstrap_delta(holdout)
    sim=[synthetic_innings(model,f'M7F-{i}') for i in range(sim_matches)]
    require(all(x['complete'] for x in sim),'SIMULATION_FAILED_TERMINATION')
    hold_stats=reference['heldOut']['statistics']
    simulated={'meanRuns':statistics.mean(x['runs'] for x in sim),
               'meanWickets':statistics.mean(x['wickets'] for x in sim),
               'dotAttemptProportion':sum(x['dots'] for x in sim)/sum(x['attempts'] for x in sim),
               'boundaryAttemptProportion':sum(x['boundaries'] for x in sim)/sum(x['attempts'] for x in sim),
               'p10':percentile([x['runs'] for x in sim],.1),
               'p50':percentile([x['runs'] for x in sim],.5),
               'p90':percentile([x['runs'] for x in sim],.9)}
    gates={
        'meanRuns':abs(simulated['meanRuns']-hold_stats['meanRuns'])<=.05*hold_stats['meanRuns'],
        'meanWickets':abs(simulated['meanWickets']-hold_stats['meanWickets'])<=.5,
        'dotAttemptProportion':abs(simulated['dotAttemptProportion']-hold_stats['dotAttemptProportion'])<=.02,
        'boundaryAttemptProportion':abs(simulated['boundaryAttemptProportion']-hold_stats['boundaryAttemptProportion'])<=.02,
        'p10':abs(simulated['p10']-hold_stats['p10'])<=.1*hold_stats['p10'],
        'p50':abs(simulated['p50']-hold_stats['p50'])<=.1*hold_stats['p50'],
        'p90':abs(simulated['p90']-hold_stats['p90'])<=.1*hold_stats['p90'],
        'heldoutLogloss':ci[1]<0,
        'playerSkillConditionalEffects':False,
        'tacticalEffects':False,
        'fullScoringResolution':False,
        'browserAcceptance':False,
    }
    evaluation={'version':'LC_T20_JOINT_ENVELOPE_EVALUATION_V1','modelSha256':model['candidateSha256'],
                'sourceZipSha256':digest,'trainingMatches':len(cohorts['training']),
                'heldOutMatches':len(cohorts['heldOut']), 'holdoutAttemptCount':total,
                'modelNLLPerAttempt':sum(x['candidateNLL'] for x in holdout)/total,
                'baselineNLLPerAttempt':sum(x['pooledNLL'] for x in holdout)/total,
                'candidateMinusPooledNLLPerAttempt':delta,
                'bootstrap95CandidateMinusPooledNLL':ci,
                'unsupportedEvents':excluded, 'generatedInnings':sim_matches,
                'generatedFirstInnings':simulated,'heldoutFirstInnings':{
                    k:hold_stats[k] for k in simulated},
                'checks':gates,'allAcceptanceGatesPassed':all(gates.values()),
                'status':'RESEARCH_JOINT_CANDIDATE_NOT_GAMEPLAY',
                'gameplayIntegrationPermitted':False,'saveMigrationRequiredNow':False}
    outdir.mkdir(parents=True,exist_ok=True)
    (outdir/'LC_M7F_JOINT_CANDIDATE.json').write_text(json.dumps(model,sort_keys=True,indent=2)+'\n')
    (outdir/'LC_M7F_HOLDOUT_EVALUATION.json').write_text(json.dumps(evaluation,sort_keys=True,indent=2)+'\n')
    print(json.dumps({'training':evaluation['trainingMatches'],'holdout':evaluation['heldOutMatches'],
                      'jointLogLossDelta':delta,'ci':ci,'simulated':simulated,'gates':gates},indent=2))
    return model,evaluation


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,required=True)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--outdir',type=Path,required=True)
    parser.add_argument('--sim-matches',type=int,default=400)
    args=parser.parse_args()
    require(200<=args.sim_matches<=10000,'INVALID_SIM_COUNT')
    run(args.reference,args.archive,args.outdir,args.sim_matches)


if __name__=='__main__': main()
