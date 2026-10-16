#!/usr/bin/env python3
"""Read a locally supplied Cricsheet JSON ZIP. Never fetch or bundle third-party match bytes.
Reference aggregates are strictly match-level, with later matches reserved for holdout.
Licensing: https://cricsheet.org/licensing/ (ODC-By 1.0); retain attribution if published.
"""
import argparse, datetime, hashlib, json, math, pathlib, statistics, zipfile

def pct(xs,p):
    s=sorted(xs)
    return s[max(0, math.ceil(p*len(s))-1)] if s else None

def mean(xs): return sum(xs)/len(xs) if xs else None

def parse_match(raw, name):
    match=json.loads(raw)
    info=match.get('info',{})
    if info.get('match_type')!='T20' or info.get('overs')!=20: return None
    if info.get('gender')!='male': return None
    # Match-level exclusions prevent inning censoring inconsistencies.
    if info.get('outcome',{}).get('method') or info.get('outcome',{}).get('result') in ('no result','abandoned'):
        return None
    items=[]
    for idx, innings in enumerate(match.get('innings',[])[:2]):
        if innings.get('target',{}).get('overs') not in (None,20): return None
        if innings.get('target',{}).get('runs') is None and idx==1: # Some feeds omit a target: not a reason to drop the match.
            pass
        total=0; legal=0; attempts=0; dot=0; boundaries=0; wickets=0
        for over in innings.get('overs',[]):
            for d in over.get('deliveries',[]):
                runs=d.get('runs',{})
                delivered=runs.get('total')
                if not isinstance(delivered,int) or delivered<0: raise ValueError(f'{name}: invalid runs')
                extras=d.get('extras',{})
                legal += int(not ('wides' in extras or 'noballs' in extras))
                attempts+=1; total+=delivered; dot+=int(delivered==0)
                boundaries+=int(runs.get('batter') in (4,6))
                wickets += sum(w.get('kind') not in ('retired hurt','obstructing the field') for w in d.get('wickets',[]))
        if not attempts or legal>120: return None
        items.append({'innings':idx+1,'runs':total,'wickets':wickets,'legalBalls':legal,
                      'attempts':attempts,'dots':dot,'boundaries':boundaries,'censored':legal<120 and wickets<10})
    if len(items)!=2: return None
    dates=info.get('dates',[])
    if not dates: return None
    date=dates[0]
    if not isinstance(date,str): return None
    datetime.date.fromisoformat(date)
    return {'id':name.rsplit('/',1)[-1].replace('.json',''),'date':date,'innings':items}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True);ap.add_argument('--out',required=True)
    ap.add_argument('--holdout',type=float,default=.2);ap.add_argument('--min-holdout',type=int,default=200)
    a=ap.parse_args()
    if not .1<=a.holdout<=.5: raise ValueError('holdout fraction outside .1..5')
    raw=pathlib.Path(a.input).read_bytes()
    with zipfile.ZipFile(a.input) as z:
        names=z.namelist()
        if len(names)>25000 or any(n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts for n in names):
            raise ValueError('unsafe ZIP path/count')
        json_names=sorted(n for n in names if n.endswith('.json') and not n.startswith('__MACOSX/'))
        if not json_names: raise ValueError('no match JSON files')
        license_files=[n for n in names if pathlib.PurePosixPath(n).name.upper() in ('LICENSE.TXT','LICENSE')]
        # A user can supply an older archive, but it is not marked redistribution-approved.
        license_detected=bool(license_files)
        matches=[]; excluded=0
        for n in json_names:
            if z.getinfo(n).file_size>1_000_000: raise ValueError('oversized match JSON')
            m=parse_match(z.read(n),n)
            if m is None: excluded+=1
            else: matches.append(m)
    matches.sort(key=lambda x:(x['date'],x['id']))
    boundary=int(len(matches)*(1-a.holdout))
    # Boundary must not split the same date; chronology outweighs exact split percentage.
    while 0<boundary<len(matches) and matches[boundary-1]['date']==matches[boundary]['date']:
        boundary-=1
    def stats(rows):
        full_first=[x['innings'][0] for x in rows if not x['innings'][0]['censored']]
        all_first=[x['innings'][0] for x in rows]
        out={'matches':len(rows),'innings':2*len(rows),'allFirstInnings':{
          'count':len(all_first),'meanRuns':mean([i['runs'] for i in all_first]),
          'p10':pct([i['runs'] for i in all_first],.1),'p50':pct([i['runs'] for i in all_first],.5),
          'p90':pct([i['runs'] for i in all_first],.9),'meanWickets':mean([i['wickets'] for i in all_first])},
          'uncensoredFirstInnings':{'count':len(full_first),'meanRuns':mean([i['runs'] for i in full_first])}}
        attempts=sum(i['attempts'] for row in rows for i in row['innings'])
        out['attempts']=attempts
        out['dotAttemptProportion']=sum(i['dots'] for row in rows for i in row['innings'])/attempts if attempts else None
        out['boundaryAttemptProportion']=sum(i['boundaries'] for row in rows for i in row['innings'])/attempts if attempts else None
        return out
    out={'version':'LC_M7B_CRICSHEET_REFERENCE_V1','status':'REFERENCE_PREPARED_NOT_MODEL_VALIDATED',
         'source':'Cricsheet','sourceUrl':'https://cricsheet.org/','licenseUrl':'https://cricsheet.org/licensing/',
         'license':'Open Data Commons Attribution License (ODC-By 1.0)',
         'licenseNoticePresent':license_detected,'sourceZipSha256':hashlib.sha256(raw).hexdigest(),
         'split':'chronological_by_match_date_with_no_same_date_overlap',
         'excludedFiles':excluded,'training':stats(matches[:boundary]),'heldOut':stats(matches[boundary:]),
         'holdoutMinMet':len(matches[boundary:])>=a.min_holdout,
         'empiricalModelFitted':False,'modelStatus':'SYNTHETIC_ALPHA',
         'notes':['Male 20-over T20 two-innings matches only; no rain reductions or declared no-result.',
                  'First innings analysed separately to avoid chase censoring; all-out innings included in all-first cohort.',
                  'This describes real matches; it does not fit a new model or establish transfer to fictional skill profiles.',
                  'Do not distribute the source without maintaining required ODC-By attribution and notices.']}
    pathlib.Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    pathlib.Path(a.out).write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({'training':out['training']['matches'],'holdout':out['heldOut']['matches'],
                      'holdoutMinMet':out['holdoutMinMet'],'sourceZipSha256':out['sourceZipSha256']}))
if __name__=='__main__': main()
