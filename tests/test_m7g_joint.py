"""Unit tests for M7G no data download required; Cricsheet archive remains external."""
import importlib.util
from pathlib import Path
import json
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m7g',ROOT/'scripts/m7g-full-joint.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class M7GTests(unittest.TestCase):
    def make(self,cat='LEGAL|0|0|0|0|0|0|NONE|NONE',n=210):
        return [{'matchId':str(i),'date':'2020-01-01', 'runs':(110+(i%5)*19),
                 'wickets':4,'legalBalls':120,'skipped':0,
                 'events':[('POWERPLAY/0-2',cat)]} for i in range(n)]
    def test_components_normalize(self):
        for key in json.loads((ROOT/'tests/fixtures/m7g-joint-candidate.json').read_text())['categories']:
            x=m.unpack(key)
            self.assertEqual(x['teamRuns'],sum(x[k] for k in ('batRuns','wides','noBalls','byes','legByes')))
    def test_reject_incompatible_channels(self):
        invalid=['WIDE|1|0|0|0|0|0|NONE|NONE','NO_BALL|0|0|2|0|0|0|NONE|NONE',
                 'LEGAL|1|0|0|1|0|0|NONE|NONE','LEGAL|4|0|0|0|0|4|CAUGHT|STRIKER',
                 'LEGAL|0|0|0|0|0|0|BOWLED|NON_STRIKER']
        for key in invalid:
            with self.subTest(key=key),self.assertRaises(ValueError):m.unpack(key)
    def test_observed_attribution(self):
        cases=[({'runs':{'batter':4,'extras':1,'total':5},'extras':{'noballs':1},'batter':'a','non_striker':'b'},
                'NO_BALL|4|0|1|0|0|4|NONE|NONE'),
               ({'runs':{'batter':0,'extras':2,'total':2},'extras':{'byes':2},'batter':'a','non_striker':'b'},
                'LEGAL|0|0|0|2|0|0|NONE|NONE'),
               ({'runs':{'batter':0,'extras':0,'total':0},'batter':'a','non_striker':'b',
                 'wickets':[{'kind':'run out','player_out':'b'}]},
                'LEGAL|0|0|0|0|0|0|RUN_OUT|NON_STRIKER')]
        for delivery,expected in cases:self.assertEqual(m.classify(delivery),expected)
    def test_fit_train_only_no_holdout_labels(self):
        train=self.make()
        cats=json.loads((ROOT/"tests/fixtures/m7g-joint-candidate.json").read_text())["categories"][:15]
        for i,row in enumerate(train): row["events"]=[("POWERPLAY/0-2",cats[i%len(cats)])]
        candidate=m.fit(train,prior=5)
        initial=m.digest(candidate)
        held=self.make(cat='LEGAL|4|0|0|0|0|4|NONE|NONE')
        m.holdout_nll(held,candidate)
        self.assertEqual(initial,m.digest(candidate))
    def test_repeatable_regime_and_deterministic_draw(self):
        data=json.loads((ROOT/'tests/fixtures/m7g-joint-candidate.json').read_text())
        seed='seed';self.assertEqual(m.sample_regime(data,seed),m.sample_regime(data,seed))
        ctx='POWERPLAY/0-2'
        actual=m.sample_row(data['regimeMass']['0'][ctx],seed,0,ctx)
        self.assertEqual(actual,m.sample_row(data['regimeMass']['0'][ctx],seed,0,ctx))
    def test_pack_isolated_from_gameplay(self):
        x=json.loads((ROOT/'tests/fixtures/m7g-joint-candidate.json').read_text())
        sig=x.pop('candidateSha256')
        self.assertEqual(m.digest(x),sig)
        self.assertFalse(x['gameplayIntegrationPermitted'])
        self.assertFalse(x['empiricallyValidatedGameplay'])
    def test_bootstrap_resamples_matches(self):
        rows=[{'n':100,'candidateNLL':80,'pooledNLL':83}]*210
        self.assertEqual(m.base.bootstrap_delta(rows,200),[-0.03,-0.03])

if __name__=='__main__':unittest.main()
