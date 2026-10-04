#!/usr/bin/env python3
"""Independent hashlib + integer probability oracle for the FIRST TWO generator stages.
Full-tree stage branch oracles also have hand-authored expected paths in CASES.
No TypeScript, Zod or production sampler imported. Re-run --check after all changes.
"""
from __future__ import annotations
import json,sys,hashlib
from pathlib import Path
P=Path('tests/fixtures/generator')
raw=(Path('packages/data/src/probability-pack.ts').read_text()).split('Object.freeze(\n',1)[1].rsplit(' as const,\n);',1)[0]
model=json.loads(raw)
request=json.loads((P/'base-request.json').read_text())
stage=json.loads((P/'delivery-stage-pack.json').read_text())
MASS=2**32
REGISTRY={'length':('length',0),'legality':('legality',0),'contact':('contact',0),
 'sector':('sector',0),'immediate':('dismissal',0),'stumping':('dismissal',1),
 'fieldChance':('fielding',0),'fieldConversion':('fielding',1),
 'runs':('running',0),'runOut':('running',1),'end':('running',2)}
# Explicit choices are human-readable regression requirements, not extracted from live TS output.
CASES=[
 ('pass06-independent-0', [('length','GOOD'),('legality','LEGAL'),('contact','GROUND'),('sector','SECTOR_4'),('runs','0')]),
 ('pass06-independent-6', [('length','SHORT'),('legality','LEGAL'),('contact','MISS'),('immediate','NONE'),('runs','0')]),
 ('pass06-independent-28', [('length','GOOD'),('legality','WIDE'),('runs','1')]),
 ('pass06-independent-35', [('length','FULL'),('legality','LEGAL'),('contact','EDGE'),('sector','SECTOR_6'),('fieldChance','CHANCE'),('fieldConversion','CATCH')]),
 ('pass06-independent-121', [('length','SHORT'),('legality','LEGAL'),('contact','MISS'),('immediate','BOWLED')]),
 ('pass06-independent-200', [('length','FULL'),('legality','LEGAL'),('contact','EDGE'),('sector','SECTOR_1'),('fieldChance','CHANCE'),('fieldConversion','DROP'),('runs','1'),('runOut','SAFE')]),
 ('pass06-independent-224', [('length','GOOD'),('legality','LEGAL'),('contact','GROUND'),('sector','SECTOR_7'),('runs','1'),('runOut','RUN_OUT'),('end','SOUTH')]),
 ('pass06-independent-487', [('length','GOOD'),('legality','NO_BALL'),('contact','GROUND'),('sector','SECTOR_4'),('runs','2'),('runOut','SAFE')]),
 ('pass06-independent-1119', [('length','GOOD'),('legality','LEGAL'),('contact','PAD'),('immediate','LBW')]),
]
def canonical(x):return json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def sha(x):return hashlib.sha256(x.encode('utf8')).hexdigest()
def integer_round(n,d):
    if d<=0:raise ValueError('invalid divisor')
    return ((abs(n)*2+d)//(2*d))*(1 if n>=0 else -1)
def normalize(categories):
    logits=[]
    for c in categories:
        n=c['interceptBp']
        for coef,feat in c['terms']:n+=integer_round(coef*feat,10000)
        logits.append(max(-80000,min(80000,n)) if c['allowed'] and c['baseWeight'] else None)
    active=[l for l in logits if l is not None]
    if not active:raise ValueError('no categories')
    greatest=max(active)
    indexes=[integer_round(greatest-l,100) if l is not None else None for l in logits]
    weights=[0 if index is None else categories[i]['baseWeight']*model['expLutValues'][index] for i,index in enumerate(indexes)]
    total=sum(weights)
    masses=[w*MASS//total for w in weights]
    remain=[w*MASS%total for w in weights]
    leftover=MASS-sum(masses)
    for idx in sorted(range(len(weights)),key=lambda i:(-remain[i],i))[:leftover]:masses[idx]+=1
    cumulative=0;out=[]
    for c,l,idx,m in zip(categories,logits,indexes,masses):
        cumulative+=m
        out.append({'id':c['id'],'allowed':c['allowed'],'logitBp':l,'lutIndex':idx,'mass':m,'cumulative':cumulative})
    assert cumulative==MASS
    return out
def cat(id,weight,terms=(),intercept=0,allowed=True):return {'id':id,'baseWeight':weight,'terms':list(terms),'interceptBp':intercept,'allowed':allowed}
def first_stages():
    b=request['bowling'];intend=b['intendedLength'];order=['YORKER','FULL','GOOD','SHORT'];pos=order.index(intend)
    weights={intend:stage['length']['intended']}
    neighbours=[n for n in (order[pos-1] if pos>0 else None, order[pos+1] if pos<3 else None) if n]
    for n in neighbours:weights[n]=weights.get(n,0)+stage['length']['neighboursTotal']//len(neighbours)
    err='FULL_TOSS' if pos<2 else 'FULL'
    weights[err]=weights.get(err,0)+stage['length']['gross']
    cats=[]
    for n in order+['FULL_TOSS']:
        if n in weights:cats.append(cat(n,weights[n],[(stage['length']['intendedControlBp'],(b['controlRating']-50)*200),
          (stage['length']['intendedFatigueBp'],b['fatigueBp'])] if n==intend else []))
    length=normalize(cats)
    features={'CONTROL':(b['controlRating']-50)*200,'FATIGUE':b['fatigueBp'],
     'LEG_LINE':10000 if b['line']=='LEG' else 0,
     'MAXIMUM_EFFORT':10000 if b['effort']=='MAXIMUM' else 0,
     'CONSERVE_EFFORT':10000 if b['effort']=='CONSERVE' else 0}
    legality=[]
    for c in model['baselines']['legality']:
        terms=[(value,features[key]) for key,value in model['coefficients']['legality'].get(c['id'],{}).items()]
        legality.append(cat(c['id'],c['baseWeight'],terms))
    return length,normalize(legality)
assert sha(canonical(model))==request['modelHash'],'independent model-pack hash differs'
assert sha(canonical(stage))==request['stagePackHash'],'independent stage-pack hash differs'
length,legality=first_stages()
def pick(masses,draw):return next(c['id'] for c in masses if c['mass']>0 and draw<c['cumulative'])
result=[]
for seed,path in CASES:
    stages=[]
    for key,choice in path:
        name,index=REGISTRY[key]
        address=[seed,'MATCH_DELIVERY',f"{request['matchId']}:{request['context']['inningsIndex']}",
          request['attemptOrdinal'],name,index]
        digest=hashlib.sha256(json.dumps(address,ensure_ascii=False,separators=(',',':')).encode('utf8')).digest()
        draw=int.from_bytes(digest[:4],'big')
        stage_=dict(stageName=name,drawIndex=index,draw=draw,selectedCategoryId=choice)
        if key in ['length','legality']:
            expected=length if key=='length' else legality
            if pick(expected,draw)!=choice:
                raise AssertionError(f'independent {key} oracle disagrees: {seed}: expected {choice}, got {pick(expected,draw)}')
            stage_['categories']=expected
        stages.append(stage_)
    result.append({'seed':seed,'trace':stages})
output={'authority':'Independent Python hashlib and integer first-stage oracle; remaining stage choices explicitly authored',
 'modelHash':request['modelHash'],'stagePackHash':request['stagePackHash'],
 'randomVersion':'SHA256_COUNTER_V1','probabilityVersion':'LC_INTEGER_PROBABILITY_V1',
 'fixtures':result}
encoded=json.dumps(output,indent=2,ensure_ascii=False)+'\n'
target=P/'reference-vectors.json'
if '--write' in sys.argv:
    target.write_text(encoded)
    print(f'Generated {len(result)} reference vectors ({sum(len(r["trace"]) for r in result)} independent SHA draws)')
elif target.read_text()!=encoded:
    raise SystemExit('FAIL: independent generator vector drift')
else:print(f'PASS: {len(result)} independently hashed generator fixtures and exact length/legality mass oracles')
