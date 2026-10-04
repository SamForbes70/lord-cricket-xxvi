import {runT20Fixed} from "./t20.fixed.js";
import {
  executeDeterminismRequest,
  encodeRandomAddress,
  canonicalStateBytes,
  sha256Hex,
  executeProbabilityRequest,
  generateDelivery,
} from "@lcxxvi/simulation";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const worker = new Worker(
  new URL("../../apps/web/src/determinism.worker.ts", import.meta.url),
  { type: "module" },
);
// Serial queue belongs to this test adapter only; service draws are stateless.
let queue = Promise.resolve<unknown>(undefined);
function inWorker(request: unknown): Promise<unknown> {
  const next = queue.then(
    () =>
      new Promise((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(request);
      }),
  );
  queue = next.catch(() => undefined);
  return next;
}
const t20Worker=new Worker(new URL("./t20.worker.ts",import.meta.url),{type:"module"});
let t20Queue=Promise.resolve<unknown>(undefined);
function t20InWorker(caseId:string):Promise<unknown>{
  const next=t20Queue.then(()=>new Promise((resolve,reject)=>{
    t20Worker.onmessage=(event)=>resolve(event.data);
    t20Worker.onerror=(event)=>reject(new Error(event.message));
    t20Worker.postMessage({kind:"RUN_T20_FIXED",caseId});
  }));
  t20Queue=next.catch(()=>undefined);return next;
}
const harness = {
  runT20Fixed,t20InWorker,
  execute: executeDeterminismRequest,
  addressHex: (value: unknown) => hex(encodeRandomAddress(value)),
  stateHex: (value: unknown) => hex(canonicalStateBytes(value)),
  hashText: (value: string) => sha256Hex(new TextEncoder().encode(value)),
  inWorker,
  probability: executeProbabilityRequest,
  generator: generateDelivery,
};
declare global {
  interface Window {
    determinism: typeof harness;
  }
}
window.determinism = harness;
