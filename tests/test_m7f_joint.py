"""M7F research-only joint category tests. No Cricsheet archive required for unit tests."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m7f_joint', ROOT/'scripts/m7f-joint.py')
joint=importlib.util.module_from_spec(spec)
spec.loader.exec_module(joint)


def innings(*categories):
    return {'matchId':'fixture', 'date':'2000-01-01', 'events':list(categories),'skipped':0}


class JointM7FTests(unittest.TestCase):
    def test_legal_category_mass_properties(self):
        for cat in joint.UNIVERSE:
            a,b,c,d=joint.parse_tuple_id(cat)
            self.assertTrue(joint.allowed(a,b,bool(c),d))
        self.assertEqual(len(joint.UNIVERSE),len(set(joint.UNIVERSE)))

    def test_negative_legality_constraints(self):
        for case in [('WIDE',0,False,'NONE'),('NO_BALL',0,False,'NONE'),
                     ('WIDE',1,False,'BOWLER'),('NO_BALL',5,True,'STUMPED'),
                     ('WIDE',5,True,'NONE'),('LEGAL',1,True,'NONE')]:
            self.assertFalse(joint.allowed(*case),str(case))
        self.assertTrue(joint.allowed('WIDE',1,False,'STUMPED'))
        self.assertTrue(joint.allowed('NO_BALL',5,True,'RUN_OUT'))

    def test_wide_and_no_ball_envelopes(self):
        wide={'runs':{'total':1,'batter':0,'extras':1}, 'extras':{'wides':1}}
        nb={'runs':{'total':5,'batter':4,'extras':1},'extras':{'noballs':1}}
        self.assertEqual(joint.classify_delivery(wide),(joint.tuple_id('WIDE',1,False,'NONE'),0,0,0,1))
        self.assertEqual(joint.classify_delivery(nb),(joint.tuple_id('NO_BALL',5,True,'NONE'),0,0,1,5))

    def test_runout_vs_credited_bowler_wicket(self):
        legal={'runs':{'total':0,'batter':0,'extras':0},'wickets':[{'kind':'bowled'}]}
        runout={'runs':{'total':2,'batter':2,'extras':0},'wickets':[{'kind':'run out'}]}
        self.assertEqual(joint.classify_delivery(legal)[0],'LEGAL|0|0|BOWLER')
        self.assertEqual(joint.classify_delivery(runout)[0],'LEGAL|2|0|RUN_OUT')

    def test_invalid_extras_and_multi_wickets_rejected(self):
        inputs=[
            {'runs':{'total':1,'batter':1,'extras':0},'extras':{'wides':1}},
            {'runs':{'total':2,'batter':0,'extras':2},'extras':{'wides':1,'noballs':1}},
            {'runs':{'total':0,'batter':0,'extras':0},'wickets':[{'kind':'bowled'},{'kind':'run out'}]},
        ]
        for payload in inputs:
            with self.assertRaises(ValueError):joint.classify_delivery(payload)

    def test_quantization_exact_positive_and_independent(self):
        keys=['A','B','C']
        a=joint.quantize({'A':1,'B':2,'C':.00000001},keys)
        self.assertEqual(sum(a.values()),2**32)
        self.assertTrue(all(v>0 for v in a.values()))
        self.assertEqual(a,joint.quantize({'A':1,'B':2,'C':.00000001},keys))

    def test_quantization_bad_zeros(self):
        for weights in ({'a':0,'b':0},{'a':-1,'b':3}):
            with self.assertRaises(ValueError):joint.quantize(weights,['a','b'])

    def test_train_only_fit(self):
        a=joint.tuple_id('LEGAL',0,False,'NONE')
        b=joint.tuple_id('LEGAL',4,True,'NONE')
        c='POWERPLAY/0-2'
        train=[innings((c,a),(c,b))]
        candidate=joint.fit(train)
        original=joint.canonical(candidate)
        holdout=[innings((c,b))]
        joint.score_holdout(holdout,candidate)
        self.assertEqual(original,joint.canonical(candidate))
        holdout[0]['events']=[(c,a)]
        self.assertEqual(original,joint.canonical(candidate))
        self.assertEqual(candidate['trainingDeliveryCount'],2)

    def test_every_phase_and_wicket_bucket_covered(self):
        model=joint.fit([innings(('POWERPLAY/0-2','LEGAL|0|0|NONE'))])
        for key,mass in model['contextMass'].items():
            self.assertIn(key,[joint.context_id(p,w) for p in joint.PHASES for w in joint.WICKET_BANDS])
            self.assertEqual(sum(mass.values()),joint.MASS)
            self.assertTrue(all(v>0 for v in mass.values()))

    def test_deterministic_draws(self):
        m=joint.fit([innings(('POWERPLAY/0-2','LEGAL|4|1|NONE'))])
        result=[joint.sample(m['contextMass']['POWERPLAY/0-2'],'seed',i,'POWERPLAY/0-2') for i in range(30)]
        self.assertEqual(result,[joint.sample(m['contextMass']['POWERPLAY/0-2'],'seed',i,'POWERPLAY/0-2') for i in range(30)])
        self.assertEqual(len(result),30)

    def test_bootstrap_uses_match_rows(self):
        rows=[{'n':10,'candidateNLL':12.,'pooledNLL':15.} for i in range(300)]
        self.assertEqual(joint.bootstrap_delta(rows,replicates=200),[-.3,-.3])

    def test_frozen_real_data_candidate_is_research_only(self):
        pack=json.loads((ROOT/'tests/fixtures/m7f-joint-candidate.json').read_text())
        sig=pack.pop('candidateSha256')
        self.assertEqual(joint.sha(pack),sig)
        self.assertFalse(pack['gameplayIntegrationPermitted'])
        self.assertFalse(pack['empiricallyValidatedGameplay'])
        self.assertEqual(pack['trainingMatchCount'],2605)
        self.assertEqual(pack['holdoutMatchCount'],652)


if __name__=='__main__':unittest.main()
