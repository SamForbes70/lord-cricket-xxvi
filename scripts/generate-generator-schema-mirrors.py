#!/usr/bin/env python3
"""Structural mirrors when Zod dependencies are unavailable. NEVER replaces schemas:check.
After npm ci, authoritative scripts/generate-schemas.ts MUST be rerun and drift reviewed.
"""
import copy,json
from pathlib import Path
from jsonschema import Draft202012Validator
root=Path('packages/contracts/schemas')
read=lambda name:json.loads((root/f'{name}Schema.json').read_text())
ID=read('RandomAddress')['properties']['entityId']
HASH=read('ProbabilityContext')['properties']['modelHash']
INT=read('ScoringContext')['properties']['deliveryIndex']
RATING=read('Player')['properties']['skills']['properties']['T20']['properties']['defence'] if False else {'type':'integer','minimum':0,'maximum':100}
BP={'type':'integer','minimum':0,'maximum':10000}
ENUM=lambda *values:{'type':'string','enum':list(values)}
CONST=lambda value:{'type':'string' if isinstance(value,str) else 'boolean','const':value}
ARRAY=lambda items,minn=None,maxn=None:dict(**({'minItems':minn} if minn is not None else {}),**({'maxItems':maxn} if maxn is not None else {}),type='array',items=copy.deepcopy(items))
OBJ=lambda props:dict(type='object',properties=copy.deepcopy(props),required=list(props),additionalProperties=False)
field=OBJ({'playerId':ID,'sector':{'type':'integer','minimum':0,'maximum':7},
           'depth':ENUM('INNER','MIDDLE','DEEP'), 'role':ENUM('NORMAL','SLIP','GULLY'),
           'catchingRating':RATING,'throwingRating':RATING})
request=OBJ({
 'kind':CONST('GENERATE_DELIVERY'), 'generatorVersion':CONST('LC_CONDITIONAL_DELIVERY_V1'),
 'stagePackId':CONST('synthetic-alpha-01-delivery-v1'), 'stagePackHash':HASH,
 'randomVersion':CONST('SHA256_COUNTER_V1'),'probabilityVersion':CONST('LC_INTEGER_PROBABILITY_V1'),
 'modelId':CONST('synthetic-alpha-01'),'modelHash':HASH,'lutVersion':CONST('LC_EXP_LUT_V1'),'lutHash':HASH,
 'rulesHash':HASH,'matchId':ID,'seed':{'type':'string','minLength':1,'maxLength':256},
 'attemptOrdinal':INT,'format':ENUM('T20','ODI','RED_BALL'),
 'phase':ENUM('T20_EARLY','T20_MIDDLE','T20_LATE','ODI_EARLY','ODI_MIDDLE','ODI_LATE','RED_BALL'),
 'context':{k:v for k,v in read('ScoringContext').items() if k not in ['$id','$schema','title']},
 'bowling':OBJ({'bowlingStyle':ENUM('FAST','MEDIUM','OFF_SPIN','LEG_SPIN','SLOW_LEFT_ARM','LEFT_ARM_WRIST'),
       'controlRating':RATING,'movementRating':RATING,'fatigueBp':BP,
       'line':ENUM('OFF','STUMPS','LEG'),'intendedLength':ENUM('YORKER','FULL','GOOD','SHORT'),
       'effort':ENUM('CONSERVE','NORMAL','MAXIMUM'),'variationId':CONST('stock')}),
 'batting':OBJ({'defenceRating':RATING,'timingRating':RATING,'powerRating':RATING,
       'rotationRating':RATING,'vsPaceRating':RATING,'vsSpinRating':RATING,
       'aggression':{'type':'integer','minimum':0,'maximum':4},
       'intent':ENUM('NORMAL','ROTATE','PROTECT'),'attemptedStroke':{'type':'boolean'},
       'shotSectorWeights':{'minItems':8,'maxItems':8,'type':'array',
         'items':{'type':'integer','minimum':0,'maximum':10000}}}),
 'conditions':OBJ({'seamBp':BP,'turnBp':BP}),
 'field':OBJ({'keeper':OBJ({'keepingRating':RATING,'catchingRating':RATING,'throwingRating':RATING}),
              'slots':ARRAY(field,9,9)}),
})
trace=OBJ({'stageName':ID,'address':{k:v for k,v in read('RandomAddress').items() if k not in ['$id','$schema','title']},
  'draw':{'type':'integer','minimum':0,'maximum':4294967295},'selectedCategoryId':ID,
  'categories':ARRAY(OBJ({'id':ID,'allowed':{'type':'boolean'},
   'logitBp':{'anyOf':[{'type':'integer'},{'type':'null'}]},
   'lutIndex':{'anyOf':[{'type':'integer'},{'type':'null'}]},
   'mass':INT,'cumulative':INT}),1)})
response=OBJ({'kind':CONST('GENERATED_DELIVERY'),'generatorVersion':CONST('LC_CONDITIONAL_DELIVERY_V1'),
 'modelHash':HASH,'stagePackHash':HASH,'internalOnly':CONST(True),'trace':ARRAY(trace,2),
 'resolution':{k:v for k,v in read('DeliveryResolution').items() if k not in ['$id','$schema','title']}})
for name,obj in [('GeneratorFieldSlot',field),('GenerateDeliveryRequest',request),
                 ('GeneratorTraceStage',trace),('GeneratedDelivery',response)]:
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema',**obj,'$id':f'urn:lcxxvi:{name}:1','title':name}
    Draft202012Validator.check_schema(schema)
    (root/f'{name}Schema.json').write_text(json.dumps(schema,indent=2)+'\n')
    print(name)
