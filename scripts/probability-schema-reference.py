#!/usr/bin/env python3
"""Offline structural mirror of Pass 05 Zod contracts. Does not replace Zod/AJV gates.

The Zod generator remains authoritative when npm is available. This mirror lets
restricted offline builds ship testable Draft 2020-12 schemas; --check verifies bytes.
"""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'packages/contracts/schemas'
DRAFT='https://json-schema.org/draft/2020-12/schema'
ID=dict(type='string',minLength=1,maxLength=128,
        pattern='^(?!(?:constructor|prototype)$)[A-Za-z0-9][A-Za-z0-9_.:-]*$')
HASH=dict(type='string',pattern='^[a-f0-9]{64}$')

def literal(value): return dict(type='string' if isinstance(value,str) else 'number',const=value)
def integer(lo,hi): return dict(type='integer',minimum=lo,maximum=hi)
def obj(**kw):return dict(type='object',properties=kw,required=list(kw),additionalProperties=False)
def array(item,min_=None,max_=None):
    x={}
    if min_ is not None:x['minItems']=min_
    if max_ is not None:x['maxItems']=max_
    x.update(type='array',items=item)
    return x

def record(key,val):return dict(type='object',propertyNames=key,additionalProperties=val)
feature=integer(-20000,20000)
coef=integer(-100000,100000)
intercept=integer(-200000,200000)
term=obj(coefficientBp=coef,featureBp=feature)
category=obj(id=ID,baseWeight=integer(0,1000000000),allowed=dict(type='boolean'),interceptBp=intercept,terms=array(term,max_=32))
context=obj(probabilityVersion=literal('LC_INTEGER_PROBABILITY_V1'),modelId=literal('synthetic-alpha-01'),modelHash=HASH,
            lutVersion=literal('LC_EXP_LUT_V1'),lutHash=HASH,categories=array(category,1,32))
normal=obj(**context['properties'],kind=literal('NORMALISE_CATEGORIES'))
address=json.loads((root/'RandomAddressSchema.json').read_text())
address={k:v for k,v in address.items() if k not in ('$schema','$id','title')}
sample=obj(**context['properties'],kind=literal('SAMPLE_CATEGORY'),stageName=ID,
           randomVersion=literal('SHA256_COUNTER_V1'),address=address)
weight=obj(id=ID,baseWeight=integer(0,10000))
manifest=obj(modelId=literal('synthetic-alpha-01'),schemaVersion=literal('1.0.0'),status=literal('SYNTHETIC_ALPHA'),
  randomId=literal('SHA256_COUNTER_V1'),fixedPointScale=literal(10000),expLutHash=HASH,featureSpecHash=HASH,
  variationIds=array(ID),effects=obj(overAroundWicket=literal(False),individualVariations=literal(False),
  moisture=literal(False),geometryEffects=literal(False),outfieldSpeed=literal(False)))
# Zod literal boolean uses type boolean (bool is subclass of int in Python).
for prop in manifest['properties']['effects']['properties'].values():prop['type']='boolean'
feature_spec=obj(maxTerms=literal(32),fixedPointScale=literal(10000),
  termMultiplyRounding=literal('NEAREST_TIES_AWAY_FROM_ZERO'),
  accumulationOrder=literal('INTERCEPT_TERMS_IN_ARRAY_ORDER'),clipTiming=literal('AFTER_SUM'),
  lutDeltaRounding=literal('NEAREST_TIES_AWAY_FROM_ZERO'),categoryOrder=literal('AS_SUPPLIED'),
  massAllocation=literal('LARGEST_REMAINDER_CATEGORY_INDEX'))
pack=obj(manifest=manifest,probabilityVersion=literal('LC_INTEGER_PROBABILITY_V1'),
  lutVersion=literal('LC_EXP_LUT_V1'),lutScale=literal('1000000000000'),
  lutStepBp=literal(100),lutMinDeltaBp=literal(-160000),lutMaxDeltaBp=literal(0),
  logitMinBp=literal(-80000),logitMaxBp=literal(80000),
  coefficients=obj(legality=record(ID,record(ID,coef)),contact=record(ID,record(ID,coef))),
  featureSpec=feature_spec,
  expLutValues=array(integer(1,1000000000000),1601,1601),
  baselines=obj(legality=array(weight,3,3),contact=record(ID,array(weight,6,6))))
schemas={
  'SignedFeatureBp':feature,'SignedCoefficientBp':coef,'SignedInterceptBp':intercept,
  'ProbabilityTerm':term,'ProbabilityCategory':category,'ProbabilityContext':context,
  'NormaliseCategoriesRequest':normal,'SampleCategoryRequest':sample,
  'ProbabilityRequest':dict(anyOf=[normal,sample]),
  'ProbabilityBaselineWeight':weight,'ProbabilityPack':pack,
  'LegalityFeatureInput':obj(controlRating=integer(0,100),fatigueBp=integer(0,10000),
                             line=dict(type='string',enum=['OFF','STUMPS','LEG']),
                             effort=dict(type='string',enum=['CONSERVE','NORMAL','MAXIMUM'])),
  'ContactFeatureInput':obj(phase=dict(type='string',enum=['T20_EARLY','T20_MIDDLE','T20_LATE','ODI_EARLY','ODI_MIDDLE','ODI_LATE','RED_BALL']),
                            defenceRating=integer(0,100),timingRating=integer(0,100),powerRating=integer(0,100),
                            effectiveMovementBp=integer(-10000,10000),aggression=integer(0,4)),
}
for name,s in sorted(schemas.items()):
    text=json.dumps({'$schema':DRAFT,**s,'$id':f'urn:lcxxvi:{name}:1','title':name},indent=2)+'\n'
    p=root/f'{name}Schema.json'
    if '--write' in sys.argv:p.write_text(text)
    elif p.read_text()!=text:raise AssertionError(f'SCHEMA_DRIFT {name}')
print(f'PASS offline structural mirror: {len(schemas)} additional strict Draft 2020-12 schemas')
