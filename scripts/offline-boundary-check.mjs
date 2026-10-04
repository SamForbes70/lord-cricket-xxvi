/** Offline package architecture check using available TypeScript. Unlike the full
 * lint gate, this does not run ESLint. */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {join,resolve,dirname,sep} from 'node:path';
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript');}catch{ts=require(join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const names=['contracts','domain','simulation','ai','projections','persistence','data'];
let scanned=0;
const scan=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?scan(join(dir,item.name)):
    item.name.endsWith('.ts')?[join(dir,item.name)]:[]);
for(const name of names){
 const root=resolve(`packages/${name}/src`);
 for(const file of scan(root)){
  scanned++;
  const sf=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const visit=node=>{
   if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
    const spec=node.moduleSpecifier;
    if(spec&&ts.isStringLiteral(spec)){
      const mod=spec.text;
      if(mod.startsWith('.')){
        if(!resolve(dirname(file),mod).startsWith(root+sep))throw Error(`Escaping package import ${file}: ${mod}`);
      } else if(!(name==='contracts'&&mod==='zod') &&
        !(name==='simulation'&&['@noble/hashes/sha2','@noble/hashes/utils','@lcxxvi/data'].includes(mod)) &&
        !(name!=='contracts'&&mod==='@lcxxvi/contracts'))throw Error(`Forbidden ${file}: ${mod}`);
    }
   }
   if(ts.isPropertyAccessExpression(node)&&['Math.random','Date.now'].includes(node.getText(sf)))throw Error(`Nondeterminism: ${file}`);
   if(ts.isNewExpression(node)&&node.expression.getText(sf)==='Date')throw Error(`Clock: ${file}`);
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)throw Error(`Dynamic import: ${file}`);
   ts.forEachChild(node,visit);
  };
  visit(sf);
 }
}
console.log(`PASS offline package import/determinism boundaries: ${scanned} source files (${ts.version})`);
