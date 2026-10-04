#!/usr/bin/env python3
"""Independent Decimal/Fraction reference for Pass 05; never imports TypeScript production code.

--generate writes the frozen table and fixture expectations. Default verifies all published
bytes and hand-worked mass identities, including random SHA-256 addresses.
"""
import hashlib
import json
import sys
from decimal import Decimal, ROUND_HALF_UP, getcontext
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
getcontext().prec = 55
MASS = 2**32
EXP_SCALE = 10**12
SCALE = 10000
IDS = ('MISS', 'PAD', 'GROUND', 'AERIAL', 'EDGE', 'HIT_WICKET')


def json_bytes(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf8')


def digest(obj):
    return hashlib.sha256(json_bytes(obj)).hexdigest()


def signed_round_div(n, d):
    assert isinstance(n, int) and d > 0
    return (1 if n >= 0 else -1) * ((abs(n) * 2 + d) // (2 * d))


def data():
    vals = [int(((-Decimal(i)/Decimal(100)).exp() * EXP_SCALE).to_integral_value(rounding=ROUND_HALF_UP)) for i in range(1601)]
    lut = dict(version='LC_EXP_LUT_V1', stepBp=100, minDeltaBp=-160000, maxDeltaBp=0,
               scale=str(EXP_SCALE), values=vals)
    feature = dict(maxTerms=32, fixedPointScale=SCALE,
        termMultiplyRounding='NEAREST_TIES_AWAY_FROM_ZERO',
        accumulationOrder='INTERCEPT_TERMS_IN_ARRAY_ORDER',clipTiming='AFTER_SUM',
        lutDeltaRounding='NEAREST_TIES_AWAY_FROM_ZERO',categoryOrder='AS_SUPPLIED',
        massAllocation='LARGEST_REMAINDER_CATEGORY_INDEX')
    def row(weights):
        return [dict(id=id_,baseWeight=weight) for id_,weight in zip(IDS,weights)]
    pack = dict(
        manifest=dict(modelId='synthetic-alpha-01',schemaVersion='1.0.0',status='SYNTHETIC_ALPHA',
            randomId='SHA256_COUNTER_V1',fixedPointScale=SCALE,
            expLutHash=digest(lut),featureSpecHash=digest(feature),variationIds=['stock'],
            effects=dict(overAroundWicket=False,individualVariations=False,moisture=False,
                         geometryEffects=False,outfieldSpeed=False)),
        probabilityVersion='LC_INTEGER_PROBABILITY_V1',lutVersion='LC_EXP_LUT_V1',
        lutScale=str(EXP_SCALE),lutStepBp=100,lutMinDeltaBp=-160000,lutMaxDeltaBp=0,
        logitMinBp=-80000,logitMaxBp=80000,
        coefficients=dict(
            legality=dict(
                WIDE=dict(CONTROL=-7000,FATIGUE=5000,LEG_LINE=2000,MAXIMUM_EFFORT=1500,CONSERVE_EFFORT=-1000),
                NO_BALL=dict(CONTROL=-5000,FATIGUE=4000,MAXIMUM_EFFORT=1500,CONSERVE_EFFORT=-1000),
            ),
            contact=dict(
                MISS=dict(DEFENCE=-4000,AGGRESSION=2500,MOVEMENT=2500),
                PAD=dict(DEFENCE=-3000,MOVEMENT=2000),
                GROUND=dict(TIMING=3500,AGGRESSION=-1500),
                AERIAL=dict(AGGRESSION=4500,POWER=2500),
                EDGE=dict(TIMING=-4000,AGGRESSION=2500,MOVEMENT=3000),
                HIT_WICKET=dict(AGGRESSION=1000),
            ),
        ),
        featureSpec=feature,expLutValues=vals,
        baselines=dict(
            legality=[dict(id=i,baseWeight=w) for i,w in [('LEGAL',9820),('WIDE',130),('NO_BALL',50)]],
            contact={
                'T20_EARLY':row([1250,700,5900,1500,645,5]),
                'T20_MIDDLE':row([1100,650,6100,1500,645,5]),
                'T20_LATE':row([1350,500,5000,2500,645,5]),
                'ODI_EARLY':row([1700,900,5950,800,645,5]),
                'ODI_MIDDLE':row([1300,800,6400,900,595,5]),
                'ODI_LATE':row([1300,550,5300,2200,645,5]),
                'RED_BALL':row([1900,1400,5650,400,645,5]),
            }),
    )
    assert len(vals) == 1601 and vals[0] == EXP_SCALE and vals[-1] > 0
    assert sum(i['baseWeight'] for i in pack['baselines']['legality']) == 10000
    for r in pack['baselines']['contact'].values():
        assert sum(i['baseWeight'] for i in r) == 10000
    return lut, pack


def category(name, weight=1, allowed=True, intercept=0, terms=()):
    return dict(id=name, baseWeight=weight, allowed=allowed,
                interceptBp=intercept,
                terms=[dict(coefficientBp=a,featureBp=b) for a,b in terms])


def normalise(categories, vals):
    assert categories and len({c['id'] for c in categories}) == len(categories)
    logits = []
    for c in categories:
        n = c['interceptBp']
        for t in c['terms']:
            n += signed_round_div(t['coefficientBp'] * t['featureBp'], SCALE)
        logits.append(max(-80000, min(80000, n)) if c['allowed'] and c['baseWeight'] else None)
    active = [l for l in logits if l is not None]
    if not active:
        raise ValueError('EMPTY_POSITIVE_MASK')
    maximum = max(active)
    weights = []
    indices = []
    for c, logit in zip(categories, logits):
        if logit is None:
            weights.append(0)
            indices.append(None)
        else:
            delta = max(-160000, logit - maximum)
            idx = -signed_round_div(delta, 100)
            indices.append(idx)
            weights.append(c['baseWeight'] * vals[idx])
    total = sum(weights)
    shares = [Fraction(w * MASS, total) for w in weights]
    floors = [s.numerator//s.denominator for s in shares]
    leftovers = MASS - sum(floors)
    assert 0 <= leftovers < len(categories)
    order = sorted(range(len(categories)),key=lambda i:(-(shares[i] - floors[i]), i))
    for i in order[:leftovers]:
        floors[i] += 1
    result = []
    running = 0
    for c,logit,idx,mass in zip(categories,logits,indices,floors):
        running += mass
        result.append(dict(id=c['id'],allowed=c['allowed'],logitBp=logit,
                           lutIndex=idx,mass=mass,cumulative=running))
    assert running == MASS
    return result


def address(ordinal, stage='legality', draw=0, domain='MATCH_DELIVERY'):
    return dict(seed='pass05-independent',domain=domain,entityId='match-0001',
                eventOrdinal=ordinal,stageName=stage,drawIndex=draw)


def draw_uint32(a):
    ordered = [a[k] for k in ('seed','domain','entityId','eventOrdinal','stageName','drawIndex')]
    return int.from_bytes(hashlib.sha256(json.dumps(ordered,ensure_ascii=False,separators=(',',':')).encode('utf8')).digest()[:4],'big')


def build_legality(pack,control,fatigue,line,effort):
    features=dict(CONTROL=(control-50)*200,FATIGUE=fatigue,LEG_LINE=10000 if line=='LEG' else 0,
                  MAXIMUM_EFFORT=10000 if effort=='MAXIMUM' else 0,
                  CONSERVE_EFFORT=10000 if effort=='CONSERVE' else 0)
    return [category(x['id'],x['baseWeight'],terms=[(val,features[name])
             for name,val in pack['coefficients']['legality'].get(x['id'],{}).items()])
             for x in pack['baselines']['legality']]


def build_contact(pack,phase,defence,timing,power,movement,aggression):
    features=dict(DEFENCE=(defence-50)*200,TIMING=(timing-50)*200,POWER=(power-50)*200,
                  AGGRESSION=(aggression-2)*10000,MOVEMENT=movement)
    return [category(x['id'],x['baseWeight'],terms=[(val,features[name])
             for name,val in pack['coefficients']['contact'].get(x['id'],{}).items()])
             for x in pack['baselines']['contact'][phase]]


def vectors(pack):
    vals=pack['expLutValues']
    cases = [
        ('halves', [category('A'),category('B')]),
        ('thirds-largest-remainder', [category('A'),category('B'),category('C')]),
        ('quarter-half-quarter', [category('A',1),category('B',2),category('C',1)]),
        ('mask-and-cumulative-plateau', [category('A'),category('B',99,False),category('C')]),
        ('explicit-zero-weight', [category('A'),category('B',0),category('C',3)]),
        ('positive-and-negative-terms', [category('A',100,True,0,[(5000,5000),(-5000,2500)]),category('B',100,True,0,[(5000,-5000)])]),
        ('rounding-ties-away', [category('A',1,True,0,[(1,5000)]),category('B',1,True,0,[(-1,5000)])]),
        ('lut-rounding-half-step', [category('A',1,True,0,[(100,5000)]),category('B')]),
        ('logit-clip-after-sum', [category('A',1,True,200000,[(100000,10000),(-100000,10000)]),category('B',1,True,-200000)]),
        ('exp-low-positive-zero-mass', [category('A',1000000000,True,80000),category('B',1,True,-80000)]),
        ('synthetic-neutral-legality', [category(x['id'],x['baseWeight']) for x in pack['baselines']['legality']]),
        ('synthetic-t20-early-contact', [category(x['id'],x['baseWeight']) for x in pack['baselines']['contact']['T20_EARLY']]),
        ('mask-all-but-one', [category('A',3,False),category('B',0,True),category('C',1,True)]),
        ('legality-leg-line-maximum-effort', build_legality(pack,80,2000,'LEG','MAXIMUM')),
        ('contact-t20-late-attack', build_contact(pack,'T20_LATE',70,40,80,5000,4)),
    ]
    expected_simple = {
        'halves': [2**31,2**31],
        'thirds-largest-remainder': [1431655766,1431655765,1431655765],
        'quarter-half-quarter': [2**30,2**31,2**30],
        'mask-and-cumulative-plateau': [2**31,0,2**31],
        'explicit-zero-weight': [2**30,0,3*2**30],
        'mask-all-but-one': [0,0,MASS],
    }
    result=[]
    for n,(label,cats) in enumerate(cases):
        masses=normalise(cats,vals)
        if label in expected_simple:
            assert [m['mass'] for m in masses] == expected_simple[label],label
        if label == 'legality-leg-line-maximum-effort':
            assert [m['logitBp'] for m in masses] == [0, 300, -700]
        if label == 'contact-t20-late-attack':
            assert [m['logitBp'] for m in masses] == [4650, -200, -3700, 10500, 7300, 2000]
        a=address(n)
        d=draw_uint32(a)
        choice=next(i for i,m in enumerate(masses) if d < m['cumulative'] and m['mass'])
        result.append(dict(id=label,categories=cats,masses=masses,address=a,draw=d,
                           selectedIndex=choice,selectedCategoryId=masses[choice]['id']))
    # Explicit interval boundaries independent of SHA draws.
    bounds = [dict(draw=d,index=i,id_=['A','B'][i]) for d,i in
              [(0,0),(2147483647,0),(2147483648,1),(4294967295,1)]]
    return dict(version='LC_INTEGER_PROBABILITY_V1',modelId='synthetic-alpha-01',
                modelHash=digest(pack),lutHash=pack['manifest']['expLutHash'],
                cases=result,boundaries=bounds)


def main():
    lut,pack=data()
    v=vectors(pack)
    src = ('/** Generated offline by scripts/reference_probability.py using Decimal exp; NEVER at runtime. */\n'
           'export const SYNTHETIC_ALPHA_PACK = Object.freeze(\n'
           +json.dumps(pack,ensure_ascii=False,indent=2)+' as const,\n);\n'
           'export const EXP_LUT_SHA256 = "'+pack['manifest']['expLutHash']+'" as const;\n'
           'export const MODEL_PACK_SHA256 = "'+digest(pack)+'" as const;\n')
    files={
      ROOT/'packages/data/src/probability-pack.ts':src+'\n',
      ROOT/'tests/fixtures/probability/model-spec.json':json.dumps(pack,indent=2,ensure_ascii=False)+'\n',
      ROOT/'tests/fixtures/probability/vectors.json':json.dumps(v,indent=2,ensure_ascii=False)+'\n',
      ROOT/'tests/fixtures/probability/request-normalise.json': json.dumps({
          'kind':'NORMALISE_CATEGORIES','probabilityVersion':v['version'],'modelId':v['modelId'],
          'modelHash':v['modelHash'],'lutVersion':'LC_EXP_LUT_V1','lutHash':v['lutHash'],
          'categories':v['cases'][10]['categories'],
      },indent=2,ensure_ascii=False)+'\n',
      ROOT/'tests/fixtures/probability/request-sample.json': json.dumps({
          'kind':'SAMPLE_CATEGORY','probabilityVersion':v['version'],'modelId':v['modelId'],
          'modelHash':v['modelHash'],'lutVersion':'LC_EXP_LUT_V1','lutHash':v['lutHash'],
          'stageName':'legality','randomVersion':'SHA256_COUNTER_V1',
          'categories':v['cases'][10]['categories'],'address':v['cases'][10]['address'],
      },indent=2,ensure_ascii=False)+'\n'
    }
    if '--generate' in sys.argv:
        for path, content in files.items():
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(content,encoding='utf8')
    else:
        for path,content in files.items():
            actual=path.read_text(encoding='utf8')
            if actual != content:
                raise AssertionError(f'FROZEN_VECTOR_DRIFT: {path}')
    print(f'PASS Python independent Decimal LUT: {len(lut["values"])} entries; checksum {digest(lut)}')
    print(f'PASS model: {digest(pack)}; {len(v["cases"])} mass/draw vectors; {len(v["boundaries"])} boundaries')
    print('PASS manual fraction identities, masks, empty-mass guard and category-order tie-breaking')

if __name__=='__main__':
    main()
