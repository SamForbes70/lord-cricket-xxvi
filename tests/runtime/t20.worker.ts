import {runT20Fixed} from "./t20.fixed.js";
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<unknown>)=>void)|null;postMessage(message:unknown):void};
scope.onmessage=(event)=>{try{
  if(!event.data || typeof event.data!=="object" ||!("kind" in event.data) || event.data.kind!=="RUN_T20_FIXED" ||
    !("caseId" in event.data)||typeof event.data.caseId!=="string")throw new Error("INVALID_T20_WORKER_REQUEST");
  scope.postMessage({ok:true,result:runT20Fixed(event.data.caseId)});
}catch(e){scope.postMessage({ok:false,error:e instanceof Error?e.message:String(e)});}};
