const E='/home/user/.evmtest/node_modules', A='/home/user/arc-savings-jar';
const {VM}=require(E+'/@nomicfoundation/ethereumjs-vm');
const {Common,Hardfork,Chain}=require(E+'/@nomicfoundation/ethereumjs-common');
const {BlockHeader}=require(E+'/@nomicfoundation/ethereumjs-block');
const {Address,hexToBytes,bytesToHex,Account}=require(E+'/@nomicfoundation/ethereumjs-util');
const {Message}=require(E+'/@nomicfoundation/ethereumjs-evm');
(async()=>{
for (const hf of [Hardfork.Shanghai, Hardfork.Cancun]) {
  const common = new Common({chain: Chain.Mainnet, hardfork: hf});
  const vm=new VM({common});
  console.log('--- hardfork', hf, '| EIP-3860 active:', common.isActivatedEIP(3860), '| PUSH0(3855):', common.isActivatedEIP(3855), '| hfByBlockNumber:', common.hardfork());
  const OWNER=Address.fromString('0x1111111111111111111111111111111111111111');
  await vm.stateManager.putAccount(OWNER,new Account(0n,10n**21n));
  const hdr=BlockHeader.fromHeaderData({number:1n,timestamp:1800000000n,difficulty:0n,gasLimit:30000000n},{common,hardforkByTSBlockNum:false});
  // initcode: returns runtime code "5f5ffd" -> actually return 4 bytes: PUSH0 PUSH0 RETURN? 
  // Simplest: runtime code = 0x60 0x2a 0x60 0x00 0x52 0x60 0x20 0x60 0x00 0xf3  (return uint 42)
  const runtime = hexToBytes('0x602a6000526020 6000f3'.replace(/\s/g,''));
  // initcode: copy runtime to memory and return it
  // PUSH<len> ... we'll build: 0x60 0x0a 0x60 0x0c 0x60 0x00 0x39 0x60 0x0a 0x60 0x00 0xf3 + runtime
  const init = Buffer.concat([Buffer.from('600a600c600039600a6000f3','hex'), Buffer.from(runtime)]);
  vm.evm._block=hdr; vm.evm._tx={gasPrice:0n,origin:OWNER};
  let r=await vm.evm.runCall({block:hdr,message:new Message({caller:OWNER,gasLimit:30000000n,value:0n,depth:0,data:new Uint8Array(init)})});
  if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
  console.log('created', r.createdAddress?.toString(), 'err', r.execResult.exceptionError?.error, 'codelen', (await vm.stateManager.getContractCode(r.createdAddress)).length);
  const res=await vm.evm.runCall({caller:OWNER,to:r.createdAddress,data:new Uint8Array(0),gasLimit:30000000n,value:0n,block:hdr});
  if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
  console.log('call ret', bytesToHex(res.execResult.returnValue), 'err', res.execResult.exceptionError?.error);
  // now test PUSH0 explicitly: runtime 0x5f6000526020 6000f3  (PUSH0 -> mstore[0]=0; return 32 bytes)
  const rt2 = hexToBytes('0x5f6000526020 6000f3'.replace(/\s/g,''));
  const init2 = Buffer.concat([Buffer.from('600a600c600039600a6000f3','hex'), Buffer.from(rt2)]);
  vm.evm._tx={gasPrice:0n,origin:OWNER};
  let r2=await vm.evm.runCall({block:hdr,message:new Message({caller:OWNER,gasLimit:30000000n,value:0n,depth:0,data:new Uint8Array(init2)})});
  if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
  const res2=await vm.evm.runCall({caller:OWNER,to:r2.createdAddress,data:new Uint8Array(0),gasLimit:30000000n,value:0n,block:hdr});
  if(vm.stateManager._checkpointCount>0) await vm.stateManager.commit();
  console.log('PUSH0 test err:', res2.execResult.exceptionError?.error ?? 'none');
}
})().catch(e=>console.log('ERR',e.message));
