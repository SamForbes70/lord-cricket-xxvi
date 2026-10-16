#!/usr/bin/env python3
"""M7I chase lower-tail conditional diagnosis, no parameter changes or fitting.

Reference comparison uses the *previously inspected development* cohort only;
new tuning decisions from this report require another later untouched test set.
"""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import statistics

spec=importlib.util.spec_from_file_location('m7h_diag',Path(__file__).with_name('m7h-two-innings.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
VERSION='LC_M7I_CHASE_TAIL_DIAGNOSTIC_V1'

def target_group(target,cutpoints):
    if type(target)!=int or target<=0:raise ValueError('INVALID_TARGET')
    if len(cutpoints)!=2 or cutpoints[0]>=cutpoints[1]:raise ValueError('INVALID_CUTPOINTS')
    return 'LOW_TARGET' if target<=cutpoints[0] else 'MID_TARGET' if target<=cutpoints[1] else 'HIGH_TARGET'

def report_group(rows):
    if not rows:return None
    return {'innings':len(rows),'meanRuns':statistics.fmean(r['runs'] for r in rows),
            'p10':h.g.quantile([r['runs'] for r in rows],.1),
            'median':h.g.quantile([r['runs'] for r in rows],.5),
            'p90':h.g.quantile([r['runs'] for r in rows],.9),
            'meanWickets':statistics.fmean(r['wickets'] for r in rows),
            'chaseRate':statistics.fmean(r['chased'] for r in rows),
            'allOutRate':statistics.fmean(r['wickets']==10 for r in rows),
            'oversExpiryRate':statistics.fmean(r['legalBalls']>=120 and r['runs']<r['target'] for r in rows)}

def assess(rows,cutpoints):
    grouped={'ALL':list(rows)}
    for r in rows:
        tg=target_group(r['target'],cutpoints)
        grouped.setdefault(tg,[]).append(r)
        termination='CHASE' if r['chased'] else 'ALL_OUT' if r['wickets']==10 else 'OVERS_OR_IRREGULAR'
        grouped.setdefault('TERMINATION_'+termination,[]).append(r)
    return {k:report_group(v) for k,v in sorted(grouped.items())}

def run(archive,reference,first,second,count=600):
    if count<100 or count>3000:raise ValueError('INVALID_SAMPLE_SIZE')
    rows,exclusions,unsupported=h.extract_second(archive,reference)
    # Only training data define comparisons and targets. Previous development
    # holdout is reported but never used to fit or change model coefficients.
    cuts=[h.g.quantile([r['target'] for r in rows['training']],q) for q in (1/3,2/3)]
    if cuts[0]>=cuts[1]:raise ValueError('COLLAPSED_TARGET_BINS')
    simulations=[]
    for k in range(count):
        a=h.g.simulate_one(first,f'M7I-FIRST-{k:06d}')
        target=a['runs']+1
        r=h.simulate_second(second,f'M7I-SECOND-{k:06d}',target)
        simulations.append({**r,'target':target})
    simulated=assess(simulations,cuts)
    observed_training=assess(rows['training'],cuts)
    observed_dev=assess(rows['heldOut'],cuts)
    return {'version':VERSION,'status':'DIAGNOSTIC_ONLY_NO_MODEL_CHANGES',
            'sourceZipSha256':reference['sourceZipSha256'],
            'modelSha256':second['candidateSha256'],'firstModelSha256':first['candidateSha256'],
            'samples':count,'trainingMatches':len(rows['training']),
            'developmentMatches':len(rows['heldOut']),
            'trainingOnlyTargetTertileCuts':cuts,
            'simulation':simulated,'trainingReference':observed_training,
            'inspectedDevelopmentReference':observed_dev,
            'referenceExclusions':exclusions,'unsupportedAttempts':unsupported,
            'modelChanged':False,'gameplayIntegrationPermitted':False,
            'untouchedFinalTestSet':False,
            'limitations':['Previously inspected development data cannot supply an untouched final release gate.',
                           'Model-generated first-innings target distribution can differ from the real cohort.',
                           'This analysis diagnoses low-score tails but does not calibrate tactical or player effects.']}

def main():
    a=argparse.ArgumentParser()
    for name in ('archive','reference','first','second','output'):
        a.add_argument('--'+name,type=Path,required=True)
    a.add_argument('--samples',type=int,default=600)
    opt=a.parse_args()
    r=run(opt.archive,json.loads(opt.reference.read_text()),json.loads(opt.first.read_text()),json.loads(opt.second.read_text()),opt.samples)
    opt.output.parent.mkdir(parents=True,exist_ok=True)
    opt.output.write_text(json.dumps(r,sort_keys=True,indent=2)+'\n')
    print(json.dumps({'trainingCuts':r['trainingOnlyTargetTertileCuts'],
                      'modelAll':r['simulation']['ALL'],
                      'trainingAll':r['trainingReference']['ALL'],
                      'devAll':r['inspectedDevelopmentReference']['ALL']},indent=2))
if __name__=='__main__':main()
