const path=require('node:path'), fs=require('node:fs');
const E='/home/user/.evmtest/node_modules', A='/home/user/arc-savings-jar';
const {VM}=require(E+'/@nomicfoundation/ethereumjs-vm');
const {Common,Hardfork,Chain}=require(E+'/@nomicfoundation/ethereumjs-common');
const {BlockHeader}=require(E+'/@nomicfoundation/ethereumjs-block');
const {Address,hexToBytes,bytesToHex,Account}=require(E+'/@nomicfoundation/ethereumjs-util');
const {Message}=require(E+'/@nomicfoundation/ethereumjs-evm');
const solc=require('/home/user/.solcbuild/node_modules/solc');
const {encodeFunctionData}=require(A+'/node_modules/viem');
(async()=>{
const vm=new VM({common:new Common({chain:Chain.Mainnet,hardfork:Hardfork.Shanghai})});
const src=fs.readFileSync('/home/user/.evmtest/MockUSDC.sol','utf8');
const o=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'M.sol':{content:src}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
const abi=o.contracts['M.sol'].MockUSDC.abi, bc='0x'+o.contracts['M.sol'].MockUSDC.evm.bytecode.object;
const OWNER=Address.fromString('0x1111111111111111111111111111111111111111');
await vm.stateManager.putAccount(OWNER,new Account(0n,10n**21n));
const hdr=BlockHeader.fromHeaderData({number:1n,timestamp:1800000000n,difficulty:0n,gasLimit:30000000n},{common:vm.common,hardforkByTSBlockNum:false});
vm.evm._block=hdr; vm.evm._tx={gasPrice:0n,origin:OWNER};
let r=await vm.evm.runCall({block:hdr,message:new Message({caller:OWNER,gasLimit:30000000n,value:0n,depth:0,data:hexToBytes(bc)})});
if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
const USDC=r.createdAddress; console.log('USDC',USDC.toString(),'code len',(await vm.stateManager.getContractCode(USDC)).length);
for (const fn of ['decimals','symbol','name','totalSupply']) {
  const data=hexToBytes(encodeFunctionData({abi,functionName:fn,args:[]}));
  const res=await vm.evm.runCall({caller:OWNER,to:USDC,data,gasLimit:30000000n,value:0n,block:hdr});
  if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
  console.log(fn.padEnd(12), 'err=',res.execResult.exceptionError?.error ?? '-', 'ret=', bytesToHex(res.execResult.returnValue).slice(0,80), 'gas=', res.execResult.executionGasUsed?.toString());
}
})().catch(e=>console.log('ERR',e));
