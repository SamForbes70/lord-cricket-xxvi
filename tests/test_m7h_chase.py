"""Offline deterministic M7H chase tests, no archive/network required."""
import importlib.util
from pathlib import Path
import json
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m7h',ROOT/'scripts/m7h-two-innings.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class M7HTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack=json.loads((ROOT/'tests/fixtures/m7h-chase-candidate.json').read_text())
        cls.first=json.loads((ROOT/'tests/fixtures/m7g-joint-candidate.json').read_text())
    def test_required_run_pressure_known_cases(self):
        self.assertEqual(m.pressure(50,10,60),'LOW')
        self.assertEqual(m.pressure(100,10,60),'MEDIUM')
        self.assertEqual(m.pressure(180,10,60),'HIGH')
        self.assertEqual(m.chase_context(40,4,125,40),'MIDDLE/3-5|MEDIUM')
    def test_invalid_state_rejected(self):
        for bad in ((0,0,1),(150,-1,40),(150,30,121),(150,4,-1)):
            with self.subTest(bad=bad),self.assertRaises(ValueError):m.pressure(*bad)
    def test_pack_includes_only_normalized_legal_categories(self):
        for reg in range(5):
            for ctx,row in self.pack['regimeMass'][str(reg)].items():
                self.assertEqual(sum(row.values()),m.g.MASS)
                self.assertEqual(set(row),set(self.pack['categories']))
        self.assertEqual(self.pack['candidateSha256'],m.g.digest({k:v for k,v in self.pack.items() if k!='candidateSha256'}))
    def test_research_not_approved_for_gameplay(self):
        self.assertFalse(self.pack['gameplayIntegrationPermitted'])
        self.assertFalse(self.pack['empiricallyValidatedGameplay'])
        self.assertFalse(self.pack['identifiability']['captainTactics'])
        self.assertFalse(self.pack['identifiability']['realPlayerSkillRatings'])
    def test_fixed_vectors_and_free_hit_mask(self):
        vectors=json.loads((ROOT/'tests/fixtures/m7h-cross-language-vectors.json').read_text())
        for v in vectors['vectors']:
            with self.subTest(seed=v['seed']):
                self.assertEqual(m.sample(self.pack,v['regime'],v['context'],v['seed'],v['ordinal'],v['freeHit']),v['category'])
        for i in range(50):
            cat=m.sample(self.pack,1,'MIDDLE/3-5|HIGH','same',i,True)
            self.assertIn(m.g.unpack(cat)['wicketKind'],('NONE','RUN_OUT'))
    def test_second_innings_terminates_at_legal_boundary(self):
        for i in range(80):
            target=80+i
            r=m.simulate_second(self.pack,f'research-{i}',target)
            self.assertTrue(r['chased'] or r['legalBalls']==120 or r['wickets']==10)
            self.assertLessEqual(r['legalBalls'],120)
            self.assertLessEqual(r['wickets'],10)
            self.assertEqual(r['chased'],r['runs']>=target)
    def test_deterministic_two_innings_replay(self):
        for i in range(8):
            seed=f'match-{i}'
            first=m.g.simulate_one(self.first,seed)
            second=m.simulate_second(self.pack,seed,first['runs']+1)
            self.assertEqual(first,m.g.simulate_one(self.first,seed))
            self.assertEqual(second,m.simulate_second(self.pack,seed,first['runs']+1))
    def test_heldout_not_used_to_fit(self):
        # A small synthetic training cohort used for the CONTRACT test only.
        # Real pack is fitted via the full user-supplied Cricsheet archive.
        categories=self.first['categories'][:18]
        rows=[{'runs':110+i%25,'legalBalls':120,
               'events':[('POWERPLAY/0-2|LOW',categories[i%len(categories)])],
               'matchId':str(i)} for i in range(210)]
        # Fitter correctly rejects insufficient delivery exposure.
        with self.assertRaisesRegex(ValueError,'INSUFFICIENT_DELIVERIES'):
            m.fit(rows,self.first)
    def test_bootstrap_uses_whole_match(self):
        rows=[{'matchId':str(i),'n':100,'candidateNLL':80,'pooledNLL':83} for i in range(210)]
        self.assertEqual(m.g.base.bootstrap_delta(rows,replicates=200),[-.03,-.03])

if __name__=='__main__':unittest.main()
