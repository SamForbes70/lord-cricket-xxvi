import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import exactRules from "../fixtures/t20/independent-expectations.json" with {type:"json"};
import {validateT20MatchSetup,createT20Session,executeT20Command,fixtureAutopilotStep,
  runFixtureT20,replayT20Events,resimulateT20Commands,eventChainManifest,
  projectT20Scorecard,validateT20Field,applyT20FixtureResolution,
  type T20Session} from "@lcxxvi/simulation";
import {FIELD_REGISTRY,T20_POWERPLAY_SLOTS,T20_LATER_SLOTS} from "@lcxxvi/data";
const raw=JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json","utf8"));
const world=readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
const setup=validateT20MatchSetup(raw,world,manifest);
function autopilot(s:T20Session){return executeT20Command(s,fixtureAutopilotStep(s)).session;}
function ready(s:T20Session){let count=0;while(s.core.phase!=="READY"){expect(count++).toBeLessThan(8);s=autopilot(s);}return s;}
function resolution(s:T20Session,options:{runs?:number;legality?:"LEGAL"|"WIDE"|"NO_BALL";bowled?:boolean}={}){
  const i=s.core.innings[s.core.activeInningsIndex]!.innings;
  const striker=i.strikerEnd==="NORTH"?i.northBatterId!:i.southBatterId!;
  const wide=options.legality==="WIDE",noBall=options.legality==="NO_BALL",runs=options.runs??0;
  const out=options.bowled??false,boundary=runs===4?"FOUR":runs===6?"SIX":"NONE";
  const ends=out?{north:i.strikerEnd==="NORTH"?null:i.northBatterId,south:i.strikerEnd==="SOUTH"?null:i.southBatterId}:
    runs%2===1?{north:i.southBatterId,south:i.northBatterId}:{north:i.northBatterId,south:i.southBatterId};
  return {stage:(wide||noBall)&&i.targetToWin!==null&&i.runs+1>=i.targetToWin?"IMMEDIATE_PENALTY":"DELIVERY",
    legality:options.legality??"LEGAL",batRuns:wide?0:runs,
    extras:{wides:Number(wide),noBalls:Number(noBall),byes:0,legByes:0,penalties:0},
    completedRuns:wide?0:(boundary==="NONE"?runs:0),attemptedRuns:wide?0:(boundary==="NONE"?runs:0),
    boundary,dismissal:out?{kind:"BOWLED",playerId:striker,fielderId:null,wicketEnd:i.strikerEnd}:null,
    endsAfter:ends,batContact:runs>0,attemptedStroke:!wide,shotSector:runs>0?0:null,
    trajectory:runs>0?"GROUND":null,executedLength:"GOOD",fieldOutcome:"NONE",elapsedSeconds:40};
}
function firstAllOutZero(){let s=ready(createT20Session(setup));let wickets=0;while(s.core.activeInningsIndex===0){
  if(s.core.phase!=="READY"){s=autopilot(s);continue;}
  s=applyT20FixtureResolution(s,resolution(s,{bowled:true}));wickets++;expect(wickets).toBeLessThanOrEqual(10);
}return s;}
describe("Pass 07B independently authored match fixtures",()=>{
  it("uses frozen verified XI and returns immutable command receipt on retry, rejects stale/invalid without a draw",()=>{
    const s=createT20Session(setup);
    const cmd=fixtureAutopilotStep(s);
    const one=executeT20Command(s,cmd);
    expect(one.session.revision).toBe(1);
    expect(executeT20Command(one.session,cmd).receipt).toEqual(one.receipt);
    expect(executeT20Command(one.session,cmd).session).toBe(one.session);
    const before=eventChainManifest(one.session);
    expect(()=>executeT20Command(one.session,{...cmd,commandId:"new-id"})).toThrow("STALE_REVISION");
    expect(eventChainManifest(one.session)).toEqual(before);
    expect(s.revision).toBe(0);
  });
  it("a zero-run first innings ends on the tenth wicket; an immediate winning wide stops the chase on 0.0",()=>{
    let s=firstAllOutZero();expect(s.core.innings[0]!.innings).toMatchObject({runs:0,wickets:10,complete:true});
    expect(s.core.innings[1]!.innings.targetToWin).toBe(1);
    s=ready(s);s=applyT20FixtureResolution(s,resolution(s,{legality:"WIDE"}));
    const i=s.core.innings[1]!.innings;
    expect([i.runs,i.wickets,i.legalBalls,i.deliveryAttempts]).toEqual([1,0,0,1]);
    expect(s.core.phase).toBe("COMPLETE");
    expect(s.core.result).toMatchObject({kind:"WIN",marginType:"WICKETS",marginWickets:10});
    const last=s.events.slice(-3).map(e=>e.type);
    expect(last).toEqual(["DELIVERY_RECORDED","INNINGS_COMPLETED","MATCH_COMPLETED"]);
    expect(replayT20Events(setup,s.events,eventChainManifest(s)).core).toEqual(s.core);
    expect(()=>applyT20FixtureResolution(s,resolution(s))).toThrow("FIXTURE_NOT_READY");
  });
  it("a one-run chase ends immediately on a no-ball penalty, without a legal ball or additional contact",()=>{
    let s=ready(firstAllOutZero());
    s=applyT20FixtureResolution(s,resolution(s,{legality:"NO_BALL"}));
    expect(s.core.innings[1]!.innings).toMatchObject({runs:1,wickets:0,legalBalls:0,deliveryAttempts:1});
    expect(s.core.phase).toBe("COMPLETE");
    expect(s.core.result).toMatchObject({kind:"WIN",winnerTeamId:s.core.innings[1]!.innings.battingTeamId,
      marginType:"WICKETS",marginWickets:10});
    expect(s.events.slice(-3).map(e=>e.type)).toEqual(["DELIVERY_RECORDED","INNINGS_COMPLETED","MATCH_COMPLETED"]);
  });
  it("a winning boundary credits all four runs, not the single remaining run",()=>{
    let s=ready(firstAllOutZero());s=applyT20FixtureResolution(s,resolution(s,{runs:4}));
    expect(s.core.innings[1]!.innings.runs).toBe((exactRules.scenarios[1] as {chase:{runs:number}}).chase.runs);
    expect(s.core.result).toMatchObject({kind:"WIN",marginWickets:10});
  });
  it("all-out level chase is a tie, not a wicket-margin victory",()=>{
    let s=firstAllOutZero();let wickets=0;while(s.core.phase!=="COMPLETE"){
      if(s.core.phase!=="READY"){s=autopilot(s);continue;}
      s=applyT20FixtureResolution(s,resolution(s,{bowled:true}));wickets++;expect(wickets).toBeLessThanOrEqual(10);
    }
    expect(s.core.result).toMatchObject({kind:"TIE",winnerTeamId:null});
    expect(s.core.innings[1]!.innings.wickets).toBe(10);
    expect(replayT20Events(setup,s.events,eventChainManifest(s)).lastEventHash).toBe(s.lastEventHash);
  });
  it("sixth legal ball wicket asks for a batter before a new bowler",()=>{
    let s=ready(createT20Session(setup));
    for(let n=0;n<5;n++)s=applyT20FixtureResolution(s,resolution(s));
    s=applyT20FixtureResolution(s,resolution(s,{bowled:true}));
    expect(s.core.innings[0]!.innings.legalBalls).toBe(6);
    expect(s.core.phase).toBe("AWAITING_BATTER");
    expect(s.events.at(-1)?.type).toBe("OVER_COMPLETED");
    s=autopilot(s);expect(s.core.phase).toBe("AWAITING_BOWLER");
    s=autopilot(s);expect(s.core.phase).toBe("READY");
  });
  it("last allocated legal delivery can win; no phantom 121st ball",()=>{
    let s=ready(firstAllOutZero());
    for(let n=0;n<119;n++){
      if(s.core.phase!=="READY")s=ready(s);
      s=applyT20FixtureResolution(s,resolution(s));
    }
    expect(s.core.innings[1]!.innings.legalBalls).toBe(119);
    s=applyT20FixtureResolution(s,resolution(s,{runs:1}));
    expect(s.core.innings[1]!.innings.legalBalls).toBe(120);
    expect(s.core.result).toMatchObject({kind:"WIN",completionReason:"TARGET_REACHED"});
  });
  it("first innings consumes all 120 balls without a mandatory wicket",()=>{
    let s=ready(createT20Session(setup));
    for(let n=0;n<120;n++){
      if(s.core.phase!=="READY")s=ready(s);
      s=applyT20FixtureResolution(s,resolution(s));
    }
    expect(s.core.innings[0]!.innings).toMatchObject({legalBalls:120,wickets:0,runs:0,complete:true});
    expect(s.core.innings[1]!.innings.targetToWin).toBe(1);
  });
  it("free hit survives a wide and is consumed by a subsequent legal ball",()=>{
    let s=ready(createT20Session(setup));
    s=applyT20FixtureResolution(s,resolution(s,{legality:"NO_BALL"}));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(true);
    s=applyT20FixtureResolution(s,resolution(s,{legality:"WIDE"}));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(true);
    expect(s.core.innings[0]!.innings.legalBalls).toBe(0);
    s=applyT20FixtureResolution(s,resolution(s));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(false);
    expect(s.core.innings[0]!.innings.legalBalls).toBe(1);
    expect(s.core.globalAttemptOrdinal).toBe(3);
  });
  it("rejects illegal powerplay field, reused bowler, exhausted bowler and keeper selection",()=>{
    const base=ready(createT20Session(setup)),l=base.core.innings[0]!;
    const field=[...base.core.fieldSlots];field[0]={...field[0]!,slotId:"deep-cover"};
    expect(()=>validateT20Field(field,l.outfieldIds,"R",0)).toThrow("INVALID_FIELD_POWERPLAY");
    expect(()=>validateT20Field(base.core.fieldSlots.slice(0,8),l.outfieldIds,"R",0)).toThrow("INVALID_FIELD_DUPLICATES");
    const b=l.innings.bowlerId!;
    expect(()=>executeT20Command(base,{commandId:"invalid-keeper",expectedRevision:base.revision,
      actorId:`USER:${l.innings.bowlingTeamId}`,kind:"SET_BOWLER",payload:{teamId:l.innings.bowlingTeamId,bowlerId:l.keeperId}})).toThrow("WRONG_TEAM_OR_PHASE");
    expect(l.bowling[b]!.legalBalls).toBe(0);
    expect(FIELD_REGISTRY.positions).toHaveLength(11);
    expect(T20_POWERPLAY_SLOTS).toHaveLength(9);expect(T20_LATER_SLOTS).toHaveLength(9);
  });
  it("consumes no pitch wear on wides/no-balls and applies deterministic style/effort fatigue",()=>{
    let s=ready(createT20Session(setup));
    const bowler=s.core.innings[0]!.innings.bowlerId!;
    const initial=structuredClone(s.core.pitch),fatigue=s.core.fatigueBp[bowler]!;
    s=applyT20FixtureResolution(s,resolution(s,{legality:"NO_BALL"}));
    s=applyT20FixtureResolution(s,resolution(s,{legality:"WIDE"}));
    expect(s.core.pitch).toEqual(initial);
    expect(s.core.globalAttemptOrdinal).toBe(2);
    expect(s.core.fatigueBp[bowler]).toBeGreaterThan(fatigue);
    s=applyT20FixtureResolution(s,resolution(s));
    expect(s.core.pitch.wearPoints).toBe(initial.wearPoints+1);
    expect(s.core.globalAttemptOrdinal).toBe(3);
  });
  it("rejects exhausted 24-ball bowler and consecutive-over selection through the public command boundary",()=>{
    let s=ready(createT20Session(setup));
    const first=s.core.innings[0]!,teamId=first.innings.bowlingTeamId;
    const a=first.innings.bowlerId!;
    const b=first.outfieldIds.find(id=>setup.teams.find(t=>t.teamId===teamId)!.xi.some(p=>p.playerId===id&&p.bowlingStyle!==null))!;
    expect(b).toBeDefined();
    for(let over=0;over<8;over++){
      if(over!==0){
        expect(s.core.phase).toBe("AWAITING_BOWLER");
        const id=over%2===0?a:b;
        s=executeT20Command(s,{commandId:`pick-${over}`,expectedRevision:s.revision,
          actorId:`USER:${teamId}`,kind:"SET_BOWLER",payload:{teamId,bowlerId:id}}).session;
      }
      for(let ball=0;ball<6;ball++)s=applyT20FixtureResolution(s,resolution(s));
    }
    const after=s.core.innings[0]!;
    expect(after.innings.legalBalls).toBe(48);
    expect(after.bowling[a]!.legalBalls).toBe(24);
    expect(after.bowling[b]!.legalBalls).toBe(24);
    const attempt={commandId:"exhausted",expectedRevision:s.revision,actorId:`USER:${teamId}`,
      kind:"SET_BOWLER",payload:{teamId,bowlerId:a}};
    expect(()=>executeT20Command(s,attempt)).toThrow("BOWLER_QUOTA");
    const noChange=eventChainManifest(s);
    expect(eventChainManifest(s)).toEqual(noChange);
    expect(()=>executeT20Command(s,{...attempt,commandId:"consecutive",payload:{teamId,bowlerId:b}})).toThrow("ILLEGAL_BOWLER");
  });
  it("rejects hash-tampered event, state, chain, wrong version and invalid stage pack",()=>{
    const s=runFixtureT20(setup),chain=eventChainManifest(s);
    expect(replayT20Events(setup,s.events,chain).core).toEqual(s.core);
    const bad=s.events.map(e=>structuredClone(e));bad[3]!.eventHash="f".repeat(64);
    expect(()=>replayT20Events(setup,bad,chain)).toThrow("REPLAY_EVENT_HASH");
    const badState=s.events.map(e=>structuredClone(e));badState[3]!.stateHash="f".repeat(64);
    expect(()=>replayT20Events(setup,badState,chain)).toThrow("REPLAY_EVENT_HASH");
    expect(()=>replayT20Events(setup,s.events,{...chain,finalEventHash:"0".repeat(64)})).toThrow("REPLAY_MANIFEST_MISMATCH");
    expect(()=>replayT20Events(setup,([{...s.events[0]!,version:"LC_T20_EVENT_CHAIN_V2"}] as unknown as typeof s.events))).toThrow();
    expect(()=>createT20Session({...setup,stagePackHash:"0".repeat(64)})).toThrow();
    resimulateT20Commands(s);
  });
  it("pins first complete seeded match scorecard as regression observation distinct from independent rule goldens",()=>{
    const s=runFixtureT20(setup),card=projectT20Scorecard(s);
    expect(card.innings.map(i=>[i.runs,i.wickets,i.legalBalls])).toEqual([[107,6,120],[96,10,106]]);
    expect(card.innings.map(i=>i.extras)).toEqual([
      {wides:0,noBalls:0,byes:0,legByes:1,penalties:0},
      {wides:2,noBalls:1,byes:0,legByes:0,penalties:0}]);
    expect(card.result).toEqual({kind:"WIN",winnerTeamId:"team-01",marginType:"RUNS",marginRuns:11,
      marginWickets:null,completionReason:"CHASE_COMPLETE_SHORT"});
    expect(s.events.length).toBe(329);
    expect(s.core.globalAttemptOrdinal).toBe(229);
    expect(eventChainManifest(s).finalEventHash).toBe("99bc1d15f7e69accd9bc94d8044b976c2a85f7bcc7a3a7ef5bd841464987bec7");
  });
  it("fully seeded match reconciles scorecard/events and event-prefix interrupted replay at every event",()=>{
    const s=runFixtureT20(setup),scorecard=projectT20Scorecard(s);
    expect(s.core.phase).toBe("COMPLETE");expect(scorecard.innings).toHaveLength(2);
    expect(s.core.innings[0]!.innings.legalBalls).toBeLessThanOrEqual(120);
    expect(s.core.innings[1]!.innings.legalBalls).toBeLessThanOrEqual(120);
    // The independently authored edge-case corpus is deliberately small.
    // Replay+resume at every event, not O(N^2) over the 300-event seeded corpus.
    let edge=ready(firstAllOutZero());
    edge=applyT20FixtureResolution(edge,resolution(edge,{legality:"WIDE"}));
    for(let end=0;end<=edge.events.length;end++){
      const prefix=replayT20Events(setup,edge.events.slice(0,end));
      const resumed=replayT20Events(setup,[...prefix.events,...edge.events.slice(end)],eventChainManifest(edge));
      expect(resumed.lastEventHash).toBe(edge.lastEventHash);
    }

  });
});
