#!/usr/bin/env python3
"""Fit and holdout-evaluate an OFFLINE T20 phase-marginal research model.

Trains only on M7C's chronological training first-innings; never reads held-out
observations during fitting. Aggregated dot, boundary and wicket probabilities
are *separate marginals*, not an executable joint delivery distribution.
No runtime match probability, random draw, score or save format is modified.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import random

PHASES = ('POWERPLAY', 'MIDDLE', 'DEATH')
MODEL_VERSION = 'LC_T20_PHASE_MARGINAL_RESEARCH_V1'
MIN_MATCHES = 200
METRICS = ('dot', 'boundary', 'wicket')


def _ensure(cond, message):
    if not cond:
        raise ValueError(message)


def check_reference(reference, min_matches=MIN_MATCHES):
    _ensure(reference.get('version') == 'LC_M7C_CALIBRATION_PROTOCOL_V1', 'unsupported reference contract')
    _ensure(reference.get('declaredSource') == 'Cricsheet', 'unknown source')
    _ensure(reference.get('split') == 'chronological_by_match_no_date_overlap', 'unsupported holdout split')
    _ensure(reference.get('sourceZipSha256') and len(reference['sourceZipSha256']) == 64, 'archive hash missing')
    train = reference['training']['rows']
    holdout = reference['heldOut']['rows']
    _ensure(len(train) >= min_matches and len(holdout) >= min_matches, 'INSUFFICIENT_INDEPENDENT_MATCHES')
    dates_train = {x['date'] for x in train}
    dates_hold = {x['date'] for x in holdout}
    ids_train = {x['matchId'] for x in train}
    ids_hold = {x['matchId'] for x in holdout}
    _ensure(not dates_train & dates_hold and not ids_train & ids_hold, 'train/holdout leakage')
    _ensure(max(dates_train) < min(dates_hold), 'non-chronological train/holdout')
    _ensure(len(ids_train) == len(train) and len(ids_hold) == len(holdout), 'duplicate match identifiers')
    for rows in (train, holdout):
        for row in rows:
            _ensure(set(row['first']['phases']) == set(PHASES), 'unexpected phase identifiers')
            total = row['first']
            _ensure(total['attempts'] > 0 and 0 <= total['legalBalls'] <= 120, 'bad innings exposure')
            _ensure(0 <= total['wickets'] <= 10, 'bad wicket total')
            for ph in PHASES:
                p = total['phases'][ph]
                _ensure(p['attempts'] >= 0 and p['legalBalls'] >= 0, 'bad phase exposure')
                _ensure(0 <= p['dots'] <= p['attempts'] and 0 <= p['boundaries'] <= p['attempts'] and
                        0 <= p['wickets'] <= p['attempts'], 'bad phase event counts')
            for key in ('runs', 'wickets', 'legalBalls', 'attempts', 'dots', 'boundaries'):
                _ensure(sum(total['phases'][p][key] for p in PHASES) == total[key], 'phase reconciliation failure')
    return train, holdout


def counts(rows):
    out = {p: defaultdict(int) for p in PHASES}
    for row in rows:
        for phase in PHASES:
            src = row['first']['phases'][phase]
            for key in ('runs', 'legalBalls', 'attempts', 'dots', 'boundaries', 'wickets'):
                out[phase][key] += src[key]
    return {p: dict(c) for p,c in out.items()}


def fit_rates(rows, alpha=0.5):
    _ensure(alpha > 0 and math.isfinite(alpha), 'invalid prior')
    totals = counts(rows)
    baseline = defaultdict(int)
    for p in PHASES:
        for key,value in totals[p].items():
            baseline[key] += value
    def estimate(c):
        denom = c['attempts'] + 2*alpha
        return {
            'dot': (c['dots'] + alpha)/denom,
            'boundary': (c['boundaries'] + alpha)/denom,
            'wicket': (c['wickets'] + alpha)/denom,
            'runsPerLegalBall': c['runs']/c['legalBalls'] if c['legalBalls'] else None,
        }
    _ensure(all(totals[p].get('attempts',0) > 0 for p in PHASES), 'empty training phase')
    return {p: estimate(totals[p]) for p in PHASES}, estimate(baseline)


def _logloss(hits, trials, prob):
    if trials == 0:
        return 0.0
    return -(hits*math.log(prob) + (trials-hits)*math.log1p(-prob))


def score_rows(rows, phase_model, pooled):
    per_match = []
    for row in rows:
        candidate_loss = {metric:0.0 for metric in METRICS}
        pooled_loss = {metric:0.0 for metric in METRICS}
        trials = 0
        for ph in PHASES:
            obs = row['first']['phases'][ph]
            trials += obs['attempts']
            for metric, col in (('dot','dots'),('boundary','boundaries'),('wicket','wickets')):
                candidate_loss[metric] += _logloss(obs[col], obs['attempts'], phase_model[ph][metric])
                pooled_loss[metric] += _logloss(obs[col], obs['attempts'], pooled[metric])
        per_match.append({'matchId': row['matchId'], 'attempts': trials,
            'deltaNllPerAttempt': {metric: (candidate_loss[metric]-pooled_loss[metric])/trials
                                   for metric in METRICS}})
    return per_match


def bootstrap_ci(scores, metric, seed=20261016, replicates=1000):
    rng = random.Random(seed)
    n = len(scores)
    diffs = []
    for _ in range(replicates):
        selection = [scores[rng.randrange(n)] for _ in range(n)]
        total = sum(s['attempts'] for s in selection)
        diffs.append(sum(s['deltaNllPerAttempt'][metric]*s['attempts'] for s in selection)/total)
    diffs.sort()
    return [diffs[int(.025*replicates)], diffs[int(.975*replicates)-1]]


def fit_evaluate(reference, *, min_matches=MIN_MATCHES):
    _ensure(min_matches >= MIN_MATCHES, 'minimum match gate cannot be weakened')
    train, heldout = check_reference(reference, min_matches)
    fitted, pooled = fit_rates(train)
    heldout_scores = score_rows(heldout, fitted, pooled)
    metrics = {}
    for metric in METRICS:
        delta = sum(s['deltaNllPerAttempt'][metric]*s['attempts'] for s in heldout_scores)/sum(s['attempts'] for s in heldout_scores)
        metrics[metric] = {'phaseModelMinusPooledNllPerAttempt': delta,
                           'bootstrap95': bootstrap_ci(heldout_scores,metric),
                           'direction': 'negative means phase candidate predicts held-out observations better'}
    research_payload = {'version':MODEL_VERSION, 'status':'OFFLINE_RESEARCH_ONLY_NOT_GAMEPLAY',
                        'sourceZipSha256':reference['sourceZipSha256'],
                        'licence':'ODC-By-1.0', 'attribution':'Cricsheet https://cricsheet.org/',
                        'trainingMatchCount':len(train), 'holdoutMatchCount':len(heldout),
                        'fitting':'Jeffreys-smoothed binomial marginals; first innings; 3 T20 phases',
                        'marginals':fitted, 'pooledComparator':pooled,
                        'disclaimer':'Marginals overlap; NOT a normalized joint ball outcome distribution. Does NOT model player/ground skill, tactical interactions or legal command masks.'}
    research_hash = hashlib.sha256(json.dumps(research_payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {'candidate': {**research_payload,'candidatePayloadSha256':research_hash},
            'evaluation': {'version':'LC_T20_PHASE_HOLDOUT_EVALUATION_V1',
                           'candidateSha256':research_hash, 'sourceZipSha256':reference['sourceZipSha256'],
                           'heldoutMatches':len(heldout), 'trainingMatches':len(train),
                           'referenceLicenseNoticePresent':reference.get('licenseNoticePresent'),
                           'metrics':metrics,
                           'sourceApproved':False, 'gameplayIntegrationPermitted':False,
                           'saveMigrationRequiredNow':False,
                           'status':'HELDOUT_RESEARCH_METRICS_NOT_GAMEPLAY_VALIDATION'}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--reference',type=Path,required=True)
    p.add_argument('--candidate',type=Path,required=True)
    p.add_argument('--evaluation',type=Path,required=True)
    p.add_argument('--min-matches',type=int,default=MIN_MATCHES)
    p.add_argument('--acquisition-manifest',type=Path,required=True,
                   help='Provenance generated by scripts/m7d-acquire.py (not supplied sample metadata)')
    args=p.parse_args()
    source_meta=json.loads(args.acquisition_manifest.read_text())
    reference=json.loads(args.reference.read_text())
    _ensure(source_meta.get('sourceURL')=='https://cricsheet.org/downloads/t20s_json.zip',
            'unexpected acquisition URL')
    _ensure(source_meta.get('archiveSha256')==reference.get('sourceZipSha256'),
            'source acquisition manifest hash mismatch')
    _ensure(source_meta.get('licenseNoticePresent') is True and
            reference.get('licenseNoticePresent') is True, 'ODC-By LICENSE notice missing')
    result=fit_evaluate(reference,min_matches=args.min_matches)
    result['evaluation']['retrievedAtUTC']=source_meta.get('retrievedAtUTC')
    result['evaluation']['acquisitionManifestVerified']=True
    for filename,key in ((args.candidate,'candidate'),(args.evaluation,'evaluation')):
        filename.parent.mkdir(parents=True,exist_ok=True)
        filename.write_text(json.dumps(result[key],indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':result['evaluation']['status'], 'candidate':str(args.candidate),
                      'heldoutMatches':result['evaluation']['heldoutMatches'],
                      'candidateSha256':result['candidate']['candidatePayloadSha256']}))

if __name__ == '__main__':main()
