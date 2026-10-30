import {connect} from 'node:net';
// The only application listener in this local runtime is fixed to loopback4300.
// This check makes the local cutover precondition concrete; it does not claim to
// discover arbitrary external workers, which the operator must quiesce separately.
export async function assertNoLegacyApiListener(port=4300) {
 await new Promise<void>((resolve,reject)=>{
  const socket=connect({host:'127.0.0.1',port});
  socket.once('connect',()=>{socket.destroy();reject(new Error('Refusing schema cutover while a local API is listening. Run npm run dev:stop, start only MongoDB, and back up before migration.'));});
  socket.once('error',(error:NodeJS.ErrnoException)=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve();else reject(new Error(`Cannot verify stopped API before cutover: ${error.code??'network error'}`));});
  socket.setTimeout(1000,()=>{socket.destroy();reject(new Error('Cannot verify stopped API before cutover: listener probe timed out.'));});
 });
}
