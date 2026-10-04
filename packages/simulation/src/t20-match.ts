import {
  T20CommandSchema, T20MatchExecutionManifestSchema, T20MatchEventSchema,
  T20CommandReceiptSchema, T20EventChainManifestSchema, T20ScorecardSchema, T20ReplayCaseSchema, T20MatchSetupRequestSchema,
  T20_MATCH_VERSION,T20_EVENT_CHAIN_VERSION,T20_CONDITIONS_VERSION,
  SCORING_ENGINE_VERSION,PROBABILITY_VERSION,RANDOM_VERSION,
  type T20Command,type T20MatchEvent,type T20CommandReceipt,type T20Scorecard,
  type InningsLedger,type Player,type DeliveryRecorded,type MatchResult,type BowlingPlan,
  type T20MatchSetupRequest,type WorldPack,
} from "@lcxxvi/contracts";
import {FIELD_REGISTRY,T20_POWERPLAY_SLOTS,T20_LATER_SLOTS,T20_CONDITION_POLICY,
  MODEL_PACK_SHA256,DELIVERY_STAGE_PACK_SHA256,EXP_LUT_SHA256,isBowlingCapable,FROZEN_WORLD_PINS} from "@lcxxvi/data";
import {validateInningsLedger,contextFromLedger,reduceInningsLedger,selectInningsBatter,selectInningsBowler,scoreDelivery} from "@lcxxvi/domain";
import {type FrozenT20Setup,isVerifiedFrozenT20Setup} from "./world-setup.js";
import {createRandomService,createStateHasher,canonicalStateBytes,sha256Hex} from "./determinism.js";
import {generateDelivery,expectedGeneratorPhase,generatorRuleHash} from "./generator.js";
import {EXP_LUT_VERSION,PROBABILITY_MODEL_ID} from "@lcxxvi/contracts";

const hasher=createStateHasher();
const random=createRandomService();
const hash=(v:unknown)=>hasher.hash(v);
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:string):never=>{throw new Error(`LC_T20_${code}`);};
function assert(v:unknown,code:string):asserts v {if(!v)fail(code);}
const policyHash=hash(T20_CONDITION_POLICY);
export const T20_CONDITION_POLICY_HASH=policyHash;
const DEFAULT_BOWLING:Omit<BowlingPlan,"bowlerId">={line:"STUMPS",length:"GOOD",variationId:"stock",effort:"NORMAL"};
type Phase="SETUP"|"TOSS"|"AWAITING_INNINGS"|"AWAITING_BATTER"|"AWAITING_BOWLER"|"READY"|"INTERVAL"|"COMPLETE";
type Team=FrozenT20Setup["teams"][number];
type FieldSlot={slotId:string;playerId:string};
type Pitch=FrozenT20Setup["ground"]["pitchPrior"];
export type T20Core={
  phase:Phase; setupHash:string;tossWinnerId:string|null;tossCallerId:string|null;
  battingFirstId:string|null;activeInningsIndex:number;innings:InningsLedger[];
  globalAttemptOrdinal:number;result:MatchResult|null;
  fieldSlots:FieldSlot[];bowlingPlan:BowlingPlan|null;
  battingPlans:Record<string,{aggression:number;intent:"NORMAL"|"ROTATE"|"PROTECT"}>;
  pitch:Pitch;fatigueBp:Record<string,number>;
};
export type T20Session={setup:FrozenT20Setup;executionManifest:ReturnType<typeof T20MatchExecutionManifestSchema.parse>;
  core:T20Core;revision:number;events:T20MatchEvent[];receipts:Record<string,T20CommandReceipt>;
  commands:T20Command[];genesisHash:string;lastEventHash:string};
function team(s:T20Session|{setup:FrozenT20Setup},id:string):Team{
  const result=s.setup.teams.find(t=>t.teamId===id);assert(result,"UNKNOWN_TEAM");return result;
}
function player(s:T20Session|{setup:FrozenT20Setup},id:string):Readonly<Player>{
  const found=s.setup.teams.flatMap(t=>t.xi).find(p=>p.playerId===id);assert(found,"UNKNOWN_PLAYER");return found;
}
function other(s:T20Session|{setup:FrozenT20Setup},id:string):string{
  const result=s.setup.teams.find(t=>t.teamId!==id);assert(result,"UNKNOWN_OPPONENT");return result.teamId;
}
function ledger(s:T20Session):InningsLedger{const l=s.core.innings[s.core.activeInningsIndex];assert(l,"NO_ACTIVE_INNINGS");return l;}
function activeTeam(s:T20Session):Team{return team(s,ledger(s).innings.battingTeamId);}
function fieldTeam(s:T20Session):Team{return team(s,ledger(s).innings.bowlingTeamId);}
function namedPosition(slotId:string){const result=FIELD_REGISTRY.positions.find(p=>p.slotId===slotId);assert(result,"UNKNOWN_FIELD_POSITION");return result;}
function defaultSlots(outfield:readonly string[],legalBalls:number):FieldSlot[]{
  const positions=legalBalls<36?T20_POWERPLAY_SLOTS:T20_LATER_SLOTS;
  return [...outfield].sort().map((id,index)=>({slotId:positions[index]!,playerId:id}));
}
/** Handedness changes the derived leg/off orientation, never the frozen registry. */
export function validateT20Field(slots:readonly FieldSlot[],outfield:readonly string[],strikerHand:"R"|"L",legalBalls:number):void{
  assert(slots.length===9 && new Set(slots.map(x=>x.playerId)).size===9 &&
    new Set(slots.map(x=>x.slotId)).size===9,"INVALID_FIELD_DUPLICATES");
  assert([...slots.map(x=>x.playerId)].sort().join("|") === [...outfield].sort().join("|"),"INVALID_FIELD_IDENTITIES");
  const positions=slots.map(x=>namedPosition(x.slotId));
  const leg=positions.filter(p=>strikerHand==="R"?p.legSide:!p.legSide);
  const outside=positions.filter(p=>!p.insideCircle).length;
  assert(outside<=(legalBalls<36?2:5),"INVALID_FIELD_POWERPLAY");
  assert(leg.length<=5,"INVALID_FIELD_LEG_SIDE");
  assert(leg.filter(p=>p.behindSquare).length<=2,"INVALID_FIELD_BEHIND_SQUARE");
}
function beginInnings(s:T20Session,battingId:string,index:0|1):InningsLedger{
  const bat=team(s,battingId),bowl=team(s,other(s,battingId));
  const batting=Object.fromEntries(bat.playerIds.map(id=>[id,{runs:0,ballsFaced:0,fours:0,sixes:0,dismissed:false}]));
  const bowling=Object.fromEntries(bowl.playerIds.map(id=>[id,{runsConceded:0,legalBalls:0,wickets:0,maidens:0}]));
  const bowlerLegalBalls=Object.fromEntries(bowl.playerIds.map(id=>[id,0]));
  const outfield=bowl.playerIds.filter(id=>id!==bowl.keeperId).slice(0,9);
  return validateInningsLedger({engineVersion:SCORING_ENGINE_VERSION,rulesId:"LC_T20_01",nextDeliveryIndex:s.core.globalAttemptOrdinal,
    batting,bowling,dismissals:{},keeperId:bowl.keeperId,outfieldIds:outfield,currentOverRuns:0,
    innings:{index,battingTeamId:battingId,bowlingTeamId:bowl.teamId,runs:0,wickets:0,legalBalls:0,deliveryAttempts:0,
    targetToWin:index===1?s.core.innings[0]!.innings.runs+1:null,allocatedBalls:120,
    extras:{wides:0,noBalls:0,byes:0,legByes:0,penalties:0},northBatterId:null,southBatterId:null,
    strikerEnd:"NORTH",battingOrder:[...bat.playerIds],dismissed:[],bowlerId:null,
    previousOverBowlerId:null,bowlerLegalBalls,freeHitPending:false,ballAgeLegalBalls:0,complete:false}});
}
function makeManifest(setup:FrozenT20Setup){
  assert(isVerifiedFrozenT20Setup(setup)&&Object.isFrozen(setup)&&setup.setupVersion==="LC_T20_SETUP_V1" && setup.teams.length===2 && setup.fixtureOnly,"INVALID_FROZEN_SETUP");
  assert(setup.versions.worldHash===FROZEN_WORLD_PINS.worldCanonicalSha256&&setup.versions.modelHash===MODEL_PACK_SHA256&&
    setup.stagePackHash===DELIVERY_STAGE_PACK_SHA256 &&setup.versions.rulesHash===generatorRuleHash("LC_T20_01")&&
    setup.versions.random===RANDOM_VERSION&&setup.versions.rules==="LC_T20_01","UNSUPPORTED_PINNED_SETUP");
  return T20MatchExecutionManifestSchema.parse({engine:T20_MATCH_VERSION,eventChain:T20_EVENT_CHAIN_VERSION,
    conditionPolicy:T20_CONDITIONS_VERSION,conditionPolicyHash:policyHash,setupHash:hash(setup),
    worldHash:setup.versions.worldHash,rulesHash:setup.versions.rulesHash,modelHash:setup.versions.modelHash,
    stagePackHash:setup.stagePackHash,randomVersion:RANDOM_VERSION,scoringVersion:SCORING_ENGINE_VERSION,
    probabilityVersion:PROBABILITY_VERSION});
}
export function createT20Session(setup:FrozenT20Setup):T20Session{
  const executionManifest=makeManifest(setup),setupHash=hash(setup);
  const core:T20Core={phase:"SETUP",setupHash,tossWinnerId:null,tossCallerId:null,battingFirstId:null,
    activeInningsIndex:0,innings:[],globalAttemptOrdinal:0,result:null,fieldSlots:[],bowlingPlan:null,battingPlans:{},
    pitch:clone(setup.ground.pitchPrior),fatigueBp:Object.fromEntries(setup.teams.flatMap(t=>t.playerIds).map(id=>[id,0]))};
  const genesisHash=hash([T20_EVENT_CHAIN_VERSION,setupHash,hash(executionManifest)]);
  return {setup,executionManifest,core,revision:0,events:[],receipts:{},commands:[],genesisHash,lastEventHash:genesisHash};
}
function conditionsUpdate(s:T20Session,event:DeliveryRecorded,effort:BowlingPlan["effort"]){
  const bowler=player(s,event.bowlerId),spin=!(["FAST","MEDIUM"] as string[]).includes(bowler.bowlingStyle??"");
  const base=spin?12:20,factor=T20_CONDITION_POLICY.effortFactorBp[effort];
  const added=Math.floor((base*factor+5000)/10000);
  s.core.fatigueBp[event.bowlerId]=Math.min(10000,s.core.fatigueBp[event.bowlerId]!+added);
  if(event.legalBall){
    const pitch=clone(s.core.pitch);pitch.wearPoints+=1;
    if(pitch.wearPoints%100===0){pitch.turnBp=Math.min(10000,pitch.turnBp+20);
      pitch.variabilityBp=Math.min(10000,pitch.variabilityBp+10);pitch.seamBp=Math.max(0,pitch.seamBp-10);}
    s.core.pitch=pitch;
  }
}
type Payload={type:string;[key:string]:unknown};
/** Replay uses only this deterministic reducer, never generateDelivery or random.uint32. */
function reduceEvent(s:T20Session,kind:string,payload:Payload):void{
  const c=s.core;
  switch(kind){
    case "TEAMS_CONFIRMED":assert(c.phase==="SETUP","WRONG_PHASE");c.phase="TOSS";break;
    case "TOSS_RESOLVED":assert(c.phase==="TOSS","WRONG_PHASE");assert(team(s,payload.winnerId as string),"INVALID_TOSS");
      c.tossWinnerId=payload.winnerId as string;c.tossCallerId=payload.callerId as string;c.phase="AWAITING_INNINGS";break;
    case "INNINGS_STARTED":{
      const i=payload.inningsIndex as 0|1, batting=payload.battingTeamId as string;
      assert(c.phase==="AWAITING_INNINGS"||c.phase==="INTERVAL","WRONG_PHASE");
      assert(i===c.innings.length&&i<2,"INNINGS_ORDER");
      if(i===0)c.battingFirstId=batting;else assert(other(s,c.battingFirstId!)===batting,"INNINGS_ORDER");
      const next=beginInnings(s,batting,i);c.innings.push(next);c.activeInningsIndex=i;
      c.fieldSlots=[];c.bowlingPlan=null;c.phase="AWAITING_BATTER";break;}
    case "BATTER_SELECTED":{
      assert(c.phase==="AWAITING_BATTER","WRONG_PHASE");const l=ledger(s),id=payload.playerId as string;
      assert(activeTeam(s).playerIds.includes(id),"INVALID_BATTER_TEAM");
      if(l.innings.northBatterId===null && l.innings.southBatterId===null){
        assert(!l.batting[id]!.dismissed,"DISMISSED_BATTER");
        const copy=clone(l);copy.innings.northBatterId=id;c.innings[c.activeInningsIndex]=validateInningsLedger(copy);
      }else c.innings[c.activeInningsIndex]=selectInningsBatter(l,id);
      const n=ledger(s).innings;c.phase=n.northBatterId===null||n.southBatterId===null?"AWAITING_BATTER":n.bowlerId===null?"AWAITING_BOWLER":"READY";break;}
    case "BOWLER_SELECTED":{
      assert(c.phase==="AWAITING_BOWLER","WRONG_PHASE");const l=ledger(s),id=payload.playerId as string;
      assert(fieldTeam(s).playerIds.includes(id)&&player(s,id).bowlingStyle!==null,"INELIGIBLE_BOWLER");
      const outfield=fieldTeam(s).playerIds.filter(p=>p!==fieldTeam(s).keeperId&&p!==id);
      c.innings[c.activeInningsIndex]=selectInningsBowler(l,id,outfield);
      c.bowlingPlan={...DEFAULT_BOWLING,bowlerId:id};
      c.fieldSlots=defaultSlots(outfield,l.innings.legalBalls);
      const striker= contextFromLedger(ledger(s)).strikerId;
      validateT20Field(c.fieldSlots,outfield,player(s,striker).batHand,l.innings.legalBalls);
      c.phase="READY";break;}
    case "FIELD_CHANGED":{
      assert(c.phase==="READY","WRONG_PHASE");const l=ledger(s),striker=contextFromLedger(l).strikerId;
      const slots=payload.fieldSlots as FieldSlot[];
      validateT20Field(slots,l.outfieldIds,player(s,striker).batHand,l.innings.legalBalls);
      c.fieldSlots=clone(slots);break;}
    case "BATTING_PLAN_CHANGED":{
      assert(c.phase==="READY","WRONG_PHASE");const id=payload.playerId as string;
      assert([ledger(s).innings.northBatterId,ledger(s).innings.southBatterId].includes(id),"BATTER_NOT_ACTIVE");
      c.battingPlans[id]={aggression:payload.aggression as number,intent:payload.intent as "NORMAL"};break;}
    case "BOWLING_PLAN_CHANGED":{
      assert(c.phase==="READY","WRONG_PHASE");assert(payload.bowlerId===ledger(s).innings.bowlerId,"BOWLER_NOT_ACTIVE");
      assert(payload.variationId==="stock","UNSUPPORTED_VARIATION");c.bowlingPlan=clone(payload as unknown as BowlingPlan);break;}
    case "DELIVERY_RECORDED":{
      assert(c.phase==="READY","WRONG_PHASE");const l=ledger(s),event=payload.event as DeliveryRecorded;
      assert(payload.attemptOrdinal===c.globalAttemptOrdinal&&event.deliveryIndex===c.globalAttemptOrdinal,"GLOBAL_ATTEMPT_MISMATCH");
      validateT20Field(c.fieldSlots,l.outfieldIds,player(s,contextFromLedger(l).strikerId).batHand,l.innings.legalBalls);
      const outcome=reduceInningsLedger(l,event);c.innings[c.activeInningsIndex]=outcome.ledger;
      c.globalAttemptOrdinal++;
      conditionsUpdate(s,event,c.bowlingPlan!.effort);
      if(outcome.observation.result)c.result=outcome.observation.result;
      if(outcome.observation.inningsComplete)c.phase="INTERVAL";
      else if(outcome.observation.requiredBatterEnd)c.phase="AWAITING_BATTER";
      else if(outcome.observation.overCompleted)c.phase="AWAITING_BOWLER";
      else c.phase="READY";
      break;}
    case "OVER_COMPLETED":{
      assert(ledger(s).innings.legalBalls%6===0,"INVALID_OVER_MARKER");const lastBowler=payload.bowlerId as string;
      assert(ledger(s).innings.previousOverBowlerId===lastBowler,"OVER_BOWLER_MISMATCH");
      for(const id of fieldTeam(s).playerIds){
        if(id!==lastBowler)c.fatigueBp[id]=Math.max(0,c.fatigueBp[id]!-15);
      }break;}
    case "INNINGS_COMPLETED":assert(ledger(s).innings.complete,"INVALID_INNINGS_MARKER");c.phase=c.activeInningsIndex===0?"INTERVAL":c.phase;break;
    case "MATCH_COMPLETED":assert(c.activeInningsIndex===1&&ledger(s).innings.complete&&c.result!==null,"INVALID_RESULT_MARKER");c.phase="COMPLETE";break;
    default:fail("UNKNOWN_EVENT");
  }
}
function emit(s:T20Session,commandId:string,type:string,payload:Payload):void{
  reduceEvent(s,type,payload);
  const sequence=s.events.length+1,previousHash=s.lastEventHash,stateHash=hash(s.core);
  const eventHash=hash([T20_EVENT_CHAIN_VERSION,sequence,commandId,type,payload,previousHash,stateHash]);
  const entry=T20MatchEventSchema.parse({version:T20_EVENT_CHAIN_VERSION,sequence,commandId,type,payload,previousHash,stateHash,eventHash});
  s.events.push(entry);s.lastEventHash=eventHash;
}
function generate(s:T20Session){
  const l=ledger(s),context=contextFromLedger(l),bat=player(s,context.strikerId),bowl=player(s,context.bowlerId),
    keeper=player(s,context.keeperId),skills=bat.skills.T20,bowSkills=bowl.skills.T20;
  validateT20Field(s.core.fieldSlots,l.outfieldIds,bat.batHand,l.innings.legalBalls);
  const req={kind:"GENERATE_DELIVERY" as const,generatorVersion:"LC_CONDITIONAL_DELIVERY_V1" as const,
    stagePackId:"synthetic-alpha-01-delivery-v1" as const,stagePackHash:DELIVERY_STAGE_PACK_SHA256,
    randomVersion:RANDOM_VERSION,probabilityVersion:PROBABILITY_VERSION,modelId:PROBABILITY_MODEL_ID,
    modelHash:MODEL_PACK_SHA256,lutVersion:EXP_LUT_VERSION,lutHash:EXP_LUT_SHA256,rulesHash:s.setup.versions.rulesHash,
    matchId:s.setup.matchId,seed:s.setup.seed,attemptOrdinal:s.core.globalAttemptOrdinal,format:"T20" as const,
    phase:expectedGeneratorPhase("T20",l.innings.legalBalls),context,
    bowling:{bowlingStyle:bowl.bowlingStyle!,controlRating:bowSkills.control,movementRating:bowSkills.movement,
      fatigueBp:s.core.fatigueBp[bowl.playerId]!,line:s.core.bowlingPlan!.line,
      intendedLength:s.core.bowlingPlan!.length,effort:s.core.bowlingPlan!.effort,variationId:"stock" as const},
    batting:{defenceRating:skills.defence,timingRating:skills.timing,powerRating:skills.power,
      rotationRating:skills.rotation,vsPaceRating:skills.vsPace,vsSpinRating:skills.vsSpin,
      aggression:s.core.battingPlans[bat.playerId]?.aggression??2,intent:s.core.battingPlans[bat.playerId]?.intent??"NORMAL",
      attemptedStroke:true,shotSectorWeights:[...bat.shotSectorWeights]},
    conditions:{seamBp:s.core.pitch.seamBp,turnBp:s.core.pitch.turnBp},
    field:{keeper:{keepingRating:keeper.skills.T20.keeping,catchingRating:keeper.skills.T20.catching,
      throwingRating:keeper.skills.T20.throwing},slots:s.core.fieldSlots.map(slot=>{
      const f=player(s,slot.playerId),position=namedPosition(slot.slotId);
      return {playerId:slot.playerId,sector:position.sector,depth:position.depth,
        role:slot.slotId.startsWith("slip")?"SLIP" as const:"NORMAL" as const,
        catchingRating:f.skills.T20.catching,throwingRating:f.skills.T20.throwing};})},
  };
  const generated=generateDelivery(req);
  const event=scoreDelivery(context,generated.resolution);
  return {event,traceHash:hash(generated.trace)};
}
function commitDelivery(s:T20Session,commandId:string,event:DeliveryRecorded,traceHash:string):void{
  const ordinal=s.core.globalAttemptOrdinal;
  emit(s,commandId,"DELIVERY_RECORDED",{type:"DELIVERY_RECORDED",event,attemptOrdinal:ordinal,traceHash});
  const l=ledger(s),overCompleted=event.legalBall&&l.innings.legalBalls%6===0;
  if(overCompleted)emit(s,commandId,"OVER_COMPLETED",{type:"OVER_COMPLETED",bowlerId:event.bowlerId});
  if(l.innings.complete){
    emit(s,commandId,"INNINGS_COMPLETED",{type:"INNINGS_COMPLETED",inningsIndex:s.core.activeInningsIndex});
    if(s.core.activeInningsIndex===1)emit(s,commandId,"MATCH_COMPLETED",{type:"MATCH_COMPLETED",result:s.core.result});
    else emit(s,commandId,"INNINGS_STARTED",{type:"INNINGS_STARTED",inningsIndex:1,battingTeamId:other(s,l.innings.battingTeamId)});
  }
}
/** Controlled exact fixture injection bypasses only random sampling, NEVER scoring/rules/reducer.
 * Not accepted by the public command boundary, CLI or production match worker. */
export function applyT20FixtureResolution(input:T20Session,resolution:unknown):T20Session{
  assert(input.core.phase==="READY","FIXTURE_NOT_READY");
  const s:T20Session={...input,core:clone(input.core),events:[...input.events],receipts:{...input.receipts},commands:[...input.commands]};
  const context=contextFromLedger(ledger(s));
  const event=scoreDelivery(context,resolution);
  const commandId=`fixture-${s.events.length+1}`;
  commitDelivery(s,commandId,event,hash(["FIXTURE_ONLY",resolution]));
  s.revision++;
  return s;
}
function runAdvance(s:T20Session,commandId:string,scope:"DELIVERY"|"OVER"){
  assert(s.core.phase==="READY","WRONG_PHASE");
  const currentOver=Math.floor(ledger(s).innings.legalBalls/6);
  let steps=0;
  while(s.core.phase==="READY"&&steps<60){
    const {event,traceHash}=generate(s);
    commitDelivery(s,commandId,event,traceHash);
    steps++;
    const l=ledger(s);
    if(scope==="DELIVERY"||Math.floor(l.innings.legalBalls/6)!==currentOver)break;
  }
  assert(steps<60,"ADVANCE_ATTEMPT_LIMIT");
}
/** All command effects are prepared in a clone; rejection changes neither state nor receipts/draws. */
export function executeT20Command(input:T20Session,raw:unknown):{session:T20Session;receipt:T20CommandReceipt}{
  const command=T20CommandSchema.parse(raw);
  const existing=input.receipts[command.commandId];if(existing)return {session:input,receipt:existing};
  assert(command.expectedRevision===input.revision,"STALE_REVISION");
  const s: T20Session={...input,core:clone(input.core),events:[...input.events],receipts:{...input.receipts},commands:[...input.commands]};
  const start=s.events.length+1,id=command.commandId;
  const actionTeam=(teamId:string)=>{assert(s.setup.teams.some(t=>t.teamId===teamId),"ACTOR_TEAM_UNKNOWN");
    assert(command.actorId===`USER:${teamId}`||command.actorId===`AI:${teamId}`||command.actorId==="SYSTEM","ACTOR_UNAUTHORISED");};
  switch(command.kind){
    case "CONFIRM_TEAMS":assert(command.actorId==="SYSTEM","ACTOR_UNAUTHORISED");emit(s,id,"TEAMS_CONFIRMED",{type:"TEAMS_CONFIRMED"});break;
    case "CALL_TOSS":{
      actionTeam(command.payload.teamId);assert(s.core.phase==="TOSS","WRONG_PHASE");
      const coin=random.uint32({seed:s.setup.seed,domain:"TOSS",entityId:s.setup.matchId,eventOrdinal:0,stageName:"coin",drawIndex:0})%2===0?"HEADS":"TAILS";
      const winner=command.payload.call===coin?command.payload.teamId:other(s,command.payload.teamId);
      emit(s,id,"TOSS_RESOLVED",{type:"TOSS_RESOLVED",callerId:command.payload.teamId,winnerId:winner,call:command.payload.call,coin});break;}
    case "CHOOSE_INNINGS":{
      actionTeam(command.payload.teamId);assert(command.payload.teamId===s.core.tossWinnerId,"NOT_TOSS_WINNER");
      assert(s.core.phase==="AWAITING_INNINGS","WRONG_PHASE");
      const batting=command.payload.choice==="BAT"?command.payload.teamId:other(s,command.payload.teamId);
      emit(s,id,"INNINGS_STARTED",{type:"INNINGS_STARTED",inningsIndex:0,battingTeamId:batting});break;}
    case "SET_BATTER":actionTeam(command.payload.teamId);assert(s.core.phase==="AWAITING_BATTER"&&command.payload.teamId===activeTeam(s).teamId,"WRONG_TEAM_OR_PHASE");
      emit(s,id,"BATTER_SELECTED",{type:"BATTER_SELECTED",playerId:command.payload.playerId});break;
    case "SET_BOWLER":actionTeam(command.payload.teamId);assert(s.core.phase==="AWAITING_BOWLER"&&command.payload.teamId===fieldTeam(s).teamId,"WRONG_TEAM_OR_PHASE");
      emit(s,id,"BOWLER_SELECTED",{type:"BOWLER_SELECTED",playerId:command.payload.bowlerId});break;
    case "SET_FIELD":actionTeam(command.payload.teamId);assert(s.core.phase==="READY"&&command.payload.teamId===fieldTeam(s).teamId,"WRONG_TEAM_OR_PHASE");
      emit(s,id,"FIELD_CHANGED",{type:"FIELD_CHANGED",fieldSlots:command.payload.fieldSlots});break;
    case "SET_BATTING_PLAN":{
      const batting=activeTeam(s);actionTeam(batting.teamId);
      emit(s,id,"BATTING_PLAN_CHANGED",{type:"BATTING_PLAN_CHANGED",...command.payload});break;}
    case "SET_BOWLING_PLAN":{
      const bowling=fieldTeam(s);actionTeam(bowling.teamId);
      emit(s,id,"BOWLING_PLAN_CHANGED",{type:"BOWLING_PLAN_CHANGED",...command.payload});break;}
    case "ADVANCE":assert(command.actorId==="SYSTEM","ACTOR_UNAUTHORISED");runAdvance(s,id,command.payload.scope);break;
    default:fail("UNKNOWN_COMMAND");
  }
  assert(s.events.length>=start,"COMMAND_WITH_NO_EVENT");
  s.revision=input.revision+1;
  const receipt=T20CommandReceiptSchema.parse({commandId:id,committedRevision:s.revision,fromSequence:start,
    toSequence:s.events.length,lastEventHash:s.lastEventHash});
  s.receipts[id]=receipt;s.commands.push(command);
  return {session:s,receipt};
}
/** Verify every chained event and every rule transition without sampling any random number. */
export function replayT20Events(setup:FrozenT20Setup,events:readonly T20MatchEvent[],manifest?:ReturnType<typeof T20EventChainManifestSchema.parse>):T20Session{
  const s=createT20Session(setup);
  for(const [index,raw] of events.entries()){
    const e=T20MatchEventSchema.parse(raw);
    assert(e.sequence===index+1&&e.previousHash===s.lastEventHash,"REPLAY_CHAIN_GAP");
    assert(e.eventHash===hash([T20_EVENT_CHAIN_VERSION,e.sequence,e.commandId,e.type,e.payload,e.previousHash,e.stateHash]),"REPLAY_EVENT_HASH");
    reduceEvent(s,e.type,e.payload as Payload);
    if(e.stateHash!==hash(s.core))fail("REPLAY_STATE_HASH");
    s.events.push(e);s.lastEventHash=e.eventHash;
  }
  if(manifest){const m=T20EventChainManifestSchema.parse(manifest);
    assert(m.version===T20_EVENT_CHAIN_VERSION&&m.genesisHash===s.genesisHash&&m.finalEventHash===s.lastEventHash&&
      m.finalStateHash===hash(s.core)&&m.eventCount===events.length&&m.executionManifestHash===hash(s.executionManifest),"REPLAY_MANIFEST_MISMATCH");}
  return s;
}
export function eventChainManifest(s:T20Session){return T20EventChainManifestSchema.parse({
  version:T20_EVENT_CHAIN_VERSION,genesisHash:s.genesisHash,finalEventHash:s.lastEventHash,
  finalStateHash:hash(s.core),eventCount:s.events.length,executionManifestHash:hash(s.executionManifest)});}
export function resimulateT20Commands(s:T20Session):void{
  let replay=createT20Session(s.setup);
  for(const cmd of s.commands)replay=executeT20Command(replay,cmd).session;
  assert(replay.events.length===s.events.length,"RESIMULATION_LENGTH");
  for(let i=0;i<s.events.length;i++)assert(
    sha256Hex(canonicalStateBytes(replay.events[i]))===sha256Hex(canonicalStateBytes(s.events[i])),`RESIMULATION_MISMATCH_${i}`);
  assert(hash(replay.core)===hash(s.core),"RESIMULATION_FINAL_STATE");
}
/** Fixture autopilot consumes accepted public innings/known XI, never hidden seed/future draws. */
export function fixtureAutopilotStep(s:T20Session):T20Command{
  const id=`auto-${String(s.revision+1).padStart(6,"0")}`;
  const base={commandId:id,expectedRevision:s.revision};
  if(s.core.phase==="SETUP")return {...base,actorId:"SYSTEM",kind:"CONFIRM_TEAMS",payload:{}};
  if(s.core.phase==="TOSS")return {...base,actorId:`AI:${s.setup.teams[0].teamId}`,kind:"CALL_TOSS",
    payload:{teamId:s.setup.teams[0].teamId,call:"HEADS"}};
  if(s.core.phase==="AWAITING_INNINGS")return {...base,actorId:`AI:${s.core.tossWinnerId}`,kind:"CHOOSE_INNINGS",
    payload:{teamId:s.core.tossWinnerId!,choice:"BAT"}};
  const l=ledger(s);
  if(s.core.phase==="AWAITING_BATTER"){
    const t=activeTeam(s),occupied=new Set([l.innings.northBatterId,l.innings.southBatterId,...l.innings.dismissed]);
    const choice=t.playerIds.find(pid=>!occupied.has(pid));assert(choice,"NO_ELIGIBLE_BATTER");
    return {...base,actorId:`AI:${t.teamId}`,kind:"SET_BATTER",payload:{teamId:t.teamId,playerId:choice}};
  }
  if(s.core.phase==="AWAITING_BOWLER"){
    const t=fieldTeam(s);
    const candidates=t.xi.filter(p=>p.bowlingStyle!==null&&p.playerId!==t.keeperId&&
      p.playerId!==l.innings.previousOverBowlerId&&l.bowling[p.playerId]!.legalBalls<24)
      .sort((a,b)=>l.bowling[a.playerId]!.legalBalls-l.bowling[b.playerId]!.legalBalls||a.playerId.localeCompare(b.playerId));
    assert(candidates.length,"NO_ELIGIBLE_BOWLER");
    return {...base,actorId:`AI:${t.teamId}`,kind:"SET_BOWLER",payload:{teamId:t.teamId,bowlerId:candidates[0]!.playerId}};
  }
  assert(s.core.phase==="READY","INVALID_AUTOPILOT_PHASE");
  return {...base,actorId:"SYSTEM",kind:"ADVANCE",payload:{scope:"OVER"}};
}
/** One fully seeded exhibition. Optional command callback supports interrupted in-memory resume. */
export function runFixtureT20(setup:FrozenT20Setup,maxCommands=400):T20Session{
  let s=createT20Session(setup);
  while(s.core.phase!=="COMPLETE"){
    assert(s.revision<maxCommands,"FIXTURE_COMMAND_LIMIT");
    s=executeT20Command(s,fixtureAutopilotStep(s)).session;
  }
  return s;
}
export function projectT20Scorecard(s:T20Session):T20Scorecard{
  assert(s.core.phase==="COMPLETE"&&s.core.innings.length===2&&s.core.result,"SCORECARD_NOT_COMPLETE");
  const innings=s.core.innings.map((l,index)=>{
    validateInningsLedger(l);
    const deliveryEvents=s.events.filter(e=>e.type==="DELIVERY_RECORDED" &&
      (e.payload as {event:DeliveryRecorded}).event.inningsIndex===index);
    let runs=0,legalBalls=0;const fallOfWickets=[] as {playerId:string;runs:number;legalBalls:number;sequence:number}[];
    for(const e of deliveryEvents){const d=(e.payload as {event:DeliveryRecorded}).event;
      runs+=d.batRuns+Object.values(d.extras).reduce((a,b)=>a+b,0);legalBalls+=Number(d.legalBall);
      if(d.dismissal)fallOfWickets.push({playerId:d.dismissal.playerId,runs,legalBalls,sequence:e.sequence});}
    assert(runs===l.innings.runs&&legalBalls===l.innings.legalBalls&&deliveryEvents.length===l.innings.deliveryAttempts,"PROJECTED_SCORE_MISMATCH");
    const i=l.innings;
    return {battingTeamId:i.battingTeamId,bowlingTeamId:i.bowlingTeamId,runs:i.runs,wickets:i.wickets,
      legalBalls:i.legalBalls,overs:`${Math.floor(i.legalBalls/6)}.${i.legalBalls%6}`,extras:clone(i.extras),
      batting:clone(l.batting),bowling:clone(l.bowling),fallOfWickets,targetToWin:i.targetToWin};
  });
  return T20ScorecardSchema.parse({matchId:s.setup.matchId,innings,result:s.core.result});
}
export function textT20Scorecard(s:T20Session):string{
  const card=projectT20Scorecard(s);
  const text=card.innings.map((i,index)=>{
    const t=team(s,i.battingTeamId);
    const batting=t.playerIds.filter(pid=>i.batting[pid]!.ballsFaced||i.batting[pid]!.dismissed||i.batting[pid]!.runs)
      .map(pid=>`${player(s,pid).name.padEnd(22)} ${String(i.batting[pid]!.runs).padStart(3)} (${i.batting[pid]!.ballsFaced})`).join("\n");
    const bowl=team(s,i.bowlingTeamId).playerIds.filter(pid=>i.bowling[pid]!.legalBalls)
      .map(pid=>`${player(s,pid).name.padEnd(22)} ${Math.floor(i.bowling[pid]!.legalBalls/6)}.${i.bowling[pid]!.legalBalls%6} ${i.bowling[pid]!.runsConceded}/${i.bowling[pid]!.wickets}`).join("\n");
    return `INNINGS ${index+1}: ${t.name} ${i.runs}/${i.wickets} (${i.overs} overs)${i.targetToWin?` target ${i.targetToWin}`:""}\n${batting}\nExtras ${Object.values(i.extras).reduce((a,b)=>a+b,0)} | wides ${i.extras.wides} no-balls ${i.extras.noBalls} byes ${i.extras.byes} leg-byes ${i.extras.legByes}\nBOWLING\n${bowl}`;});
  const r=card.result;
  return `${text.join("\n\n")}\n\nRESULT: ${r.kind}${r.winnerTeamId?` ${team(s,r.winnerTeamId).name}`:""}${r.marginType?` by ${r.marginRuns??r.marginWickets} ${r.marginType.toLowerCase()}`:""}\n`;
}

/** Frozen 100-seed input corpus selector. Data/world records are never mutated. */
export function createT20CorpusRequest(raw:unknown,baseRaw:unknown,world:WorldPack):T20MatchSetupRequest{
  const record=T20ReplayCaseSchema.parse(raw),base=T20MatchSetupRequestSchema.parse(baseRaw);
  assert(world.packId==="fictional-eight-01"&&new Set(record.teamIds).size===2,"INVALID_CORPUS_WORLD_OR_TEAMS");
  assert(world.grounds.some(g=>g.groundId===record.groundId),"INVALID_CORPUS_GROUND");
  const players=new Map(world.players.map(p=>[p.playerId,p]));
  const selections=record.teamIds.map(id=>{
    const t=world.teams.find(t=>t.teamId===id);assert(t,"UNKNOWN_CORPUS_TEAM");
    const available=t.squadIds.map(id=>players.get(id)).filter((p):p is Player=>p!==undefined);
    assert(available.length===20,"INCOMPLETE_CORPUS_SQUAD");
    const keeper=available.find(p=>p.role==="KEEPER");assert(keeper,"NO_CORPUS_KEEPER");
    const bowlers=available.filter(p=>p.playerId!==keeper.playerId&&isBowlingCapable(p)).slice(0,6);
    assert(bowlers.length===6,"INSUFFICIENT_CORPUS_BOWLERS");
    const chosen=[keeper,...bowlers,...available.filter(p=>p.playerId!==keeper.playerId&&!bowlers.some(b=>b.playerId===p.playerId))].slice(0,11);
    return {teamId:id,playerIds:chosen.map(p=>p.playerId),captainId:chosen[0]!.playerId,keeperId:keeper.playerId};
  }) as T20MatchSetupRequest["selectedTeams"];
  return T20MatchSetupRequestSchema.parse({...base,setup:{...base.setup,gameId:`g-${record.caseId}`,
    matchId:`m-${record.caseId}`,seed:record.seed,teamIds:record.teamIds,groundId:record.groundId},selectedTeams:selections});
}
