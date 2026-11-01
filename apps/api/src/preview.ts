import {timingSafeEqual} from 'node:crypto';
export interface PreviewConfig {mode:'preview';gatewaySecret:string;revision:string}
export function validatePreview(preview:PreviewConfig,origin:string){
 if(preview.mode!=='preview'||origin!=='https://theflock.icet-lab.eu'||!/^[A-Za-z0-9_-]{43,}$/.test(preview.gatewaySecret)||!/^[a-f0-9]{40}$/.test(preview.revision))throw new Error('Invalid protected-preview configuration.');
}
export function gatewayMatches(value:string|undefined,secret:string){return !!value&&Buffer.byteLength(value)===Buffer.byteLength(secret)&&timingSafeEqual(Buffer.from(value),Buffer.from(secret));}
