"""M7I negative cases and auditable evidence. No production scoring changes."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(script,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/script)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
rare=load('m7i-rare-adjudication.py','m7i_rare_test')
player=load('m7i-player-generalisation.py','m7i_player_test')
tail=load('m7i-tail-diagnostic.py','m7i_tail_test')

class M7IQuality(unittest.TestCase):
    def setUp(self):
        self.delivery={'batter':'BATTER','non_striker':'PARTNER',
                       'runs':{'batter':1,'extras':0,'total':1}}
    def test_normal_delivery_is_not_marked_unsupported(self):
        self.assertEqual(rare.classify_attempt(self.delivery,False)[0],'SUPPORTED')
    def test_retired_out_is_retained_not_converted_to_run_out(self):
        d={**self.delivery,'wickets':[{'player_out':'BATTER','kind':'retired out'}]}
        self.assertEqual(rare.classify_attempt(d,False)[0],'UNSUPPORTED_WICKET_TYPE')
        self.assertEqual(rare.disposition('UNSUPPORTED_WICKET_TYPE',d),'REQUIRES_RULES_AND_SCORER_ADJUDICATION')
    def test_multi_wicket_is_explicitly_rejected(self):
        d={**self.delivery,'wickets':[{'kind':'bowled','player_out':'BATTER'},
                                       {'kind':'run out','player_out':'PARTNER'}]}
        self.assertEqual(rare.classify_attempt(d,False)[0],'MULTI_WICKET_UNSUPPORTED')
    def test_penalty_extras_not_dropped(self):
        d={**self.delivery,'runs':{'batter':0,'extras':5,'total':5},'extras':{'penalty':5}}
        self.assertEqual(rare.classify_attempt(d,False)[0],'UNSUPPORTED_EXTRA_TYPE')
    def test_two_no_ball_penalties_remain_unresolved(self):
        d={**self.delivery,'runs':{'batter':0,'extras':2,'total':2},'extras':{'noballs':2}}
        self.assertEqual(rare.classify_attempt(d,False)[0],'INVALID_LEGALITY_CHANNEL')
    def test_free_hit_disallowed_wicket(self):
        d={**self.delivery,'runs':{'batter':0,'extras':0,'total':0},
           'wickets':[{'kind':'bowled','player_out':'BATTER'}]}
        self.assertEqual(rare.classify_attempt(d,True)[0],'FREE_HIT_MASK')
    def test_player_warmth_strata_are_mutually_exclusive(self):
        got={player.group(a,b) for a in (0,299,300,500) for b in (0,299,300,500)}
        self.assertEqual(len(got),4)
        self.assertEqual(player.group(299,300),'BOWLER_ONLY_300_PLUS')
        self.assertEqual(player.group(300,300),'BOTH_300_PLUS')
    def test_player_nll_audit_rejects_missing_training_pool(self):
        from collections import defaultdict
        pooled=defaultdict(lambda:[0,0,0,0]);bat=defaultdict(lambda:[0,0,0,0]);bowl=defaultdict(lambda:[0,0,0,0])
        grouped={'ALL':[(str(i),[('0/POWERPLAY','p1','p2',(1,0,0))]) for i in range(20)]}
        with self.assertRaisesRegex(ValueError,'EMPTY_TRAIN_CONTEXT'):
            player.evaluate(grouped,pooled,bat,bowl)
    def test_tail_target_groups_are_disjoint_and_complete(self):
        self.assertEqual([tail.target_group(n,[135,169]) for n in (1,135,136,169,170)],
                         ['LOW_TARGET','LOW_TARGET','MID_TARGET','MID_TARGET','HIGH_TARGET'])
        with self.assertRaises(ValueError):tail.target_group(0,[135,169])
    def test_tail_stratification_reconciles_all_600(self):
        r=json.loads((ROOT/'reference/m7i/LC_M7I_CHASE_TAIL_DIAGNOSTIC.json').read_text())
        samples=r['samples'];x=r['simulation']
        self.assertEqual(x['ALL']['innings'],samples)
        self.assertEqual(sum(x[k]['innings'] for k in ('LOW_TARGET','MID_TARGET','HIGH_TARGET')),samples)
        self.assertFalse(r['gameplayIntegrationPermitted'])
        self.assertFalse(r['untouchedFinalTestSet'])
    def test_rare_register_has_no_simulated_resolutions(self):
        r=json.loads((ROOT/'reference/m7i/LC_M7I_RARE_DELIVERY_REGISTER.json').read_text())
        self.assertEqual(sum(c['count'] for c in r['unsupportedCounts']),r['exceptionCount'])
        self.assertGreater(r['exceptionCount'],0)
        self.assertFalse(r['fullySupportedCoverage'])
        self.assertTrue(all(x['disposition']!='SCORER_COMPATIBLE' for x in r['exceptions']))
        self.assertTrue(all('sourceEventSha256' in x for x in r['exceptions']))
        self.assertFalse(r['gameplayIntegrationPermitted'])
    def test_skill_claims_remain_disabled(self):
        r=json.loads((ROOT/'reference/m7i/LC_M7I_PLAYER_GENERALISATION.json').read_text())
        self.assertFalse(r['calibratedGameplaySkillRatings'])
        self.assertFalse(r['causalTacticalEffects'])
        self.assertFalse(r['untouchedFinalTestSet'])
        self.assertGreater(r['warmthCountsByAttempt']['NEITHER_300_PLUS'],0)

if __name__=='__main__':unittest.main()
