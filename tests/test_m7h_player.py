"""Research-only identity-aware predictive marginal safeguards."""
import importlib.util
from pathlib import Path
import unittest
import json
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m7h_player',ROOT/'scripts/m7h-player-predictive.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class M7HPlayerTests(unittest.TestCase):
    def test_beta_shrinkage_tends_to_training_base_when_sparse(self):
        self.assertAlmostEqual(m.smoothed(0,0,.23),.23)
        self.assertGreater(m.smoothed(0,1,.23),0)
        self.assertLess(m.smoothed(20,100,.23),.23)
    def test_invalid_beta_exposure_rejected(self):
        for args in ((1,0,.5),(0,10,-.1),(2,1,.5),(0,0,1.1)):
            with self.subTest(args=args),self.assertRaises(ValueError):m.smoothed(*args)
    def test_binary_losses_direction(self):
        self.assertLess(m.binary_nll(1,.9),m.binary_nll(1,.1))
        self.assertLess(m.binary_nll(0,.1),m.binary_nll(0,.9))
    def test_cricsheet_outcome_flags(self):
        self.assertEqual(m.outcomes({'runs':{'batter':4,'total':4}}),(0,1,0))
        self.assertEqual(m.outcomes({'runs':{'batter':4,'total':4},'non_boundary':True}),(0,0,0))
        self.assertEqual(m.outcomes({'runs':{'batter':0,'total':0},'wickets':[{'kind':'bowled'}]}),(1,0,1))
        self.assertEqual(m.outcomes({'runs':{'batter':0,'total':0},'wickets':[{'kind':'retired hurt'}]}),(1,0,0))
    def test_generated_evidence_has_no_player_names_or_gameplay_claim(self):
        report=json.loads((ROOT/'reference/m7h/LC_M7H_PLAYER_PREDICTIVE_EVALUATION.json').read_text())
        self.assertFalse(report['calibratedSkill0To100'])
        self.assertFalse(report['tacticalEffectsIdentified'])
        self.assertFalse(report['gameplayIntegrationPermitted'])
        self.assertFalse(report['untouchedFinalTestSet'])
        self.assertEqual(report['priorExposure'],300)
        self.assertTrue(all(x['heldOutAttemptCount']>=100000 for x in report['results'].values()))

if __name__=='__main__':unittest.main()
