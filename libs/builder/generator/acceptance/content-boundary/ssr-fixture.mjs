import { put } from './fixture.mjs';

export async function prepareSsr(root, bodyPath, headerPath) {
  const specifier = (target) => `../generated/${target.replace(/\.content\.mjs$/, '.source.mjs')}`;
  await put(
    root,
    'src/probe.ts',
    `import {ApplicationRef,Component,DestroyRef,InjectionToken,inject} from '@angular/core';
import {NgDocContentSource} from '@ng-doc/core/interfaces';
import {NgDocPageHeaderComponent} from '@ng-doc/app/components/page-header';
import bodySource from ${JSON.stringify(specifier(bodyPath))};
import headerSource from ${JSON.stringify(specifier(headerPath))};
export const CONTROL = new InjectionToken<any>('request-owned-content-control');
@Component({selector:'native-processed',standalone:true,template:'<span data-testid="ssr-processed">{{id}}</span>'})
export class Processed { readonly control=inject(CONTROL); readonly id=this.control.id; constructor(){ this.control.events.push({kind:'processor-created',id:this.id}); this.control.processed?.(); inject(DestroyRef).onDestroy(()=>this.control.events.push({kind:'processor-destroyed',id:this.id})); } }
@Component({selector:'app-root',standalone:true,imports:[NgDocPageHeaderComponent],template:'<ng-doc-page-header headerContent="" [headerContentSource]="body"/><ng-doc-page-header headerContent="" [headerContentSource]="header"/>'})
export class ProbeApp {
  readonly control=inject(CONTROL);
  readonly body=this.source(bodySource,'body'); readonly header=this.source(headerSource,'header');
  constructor(){inject(DestroyRef).onDestroy(()=>this.control.events.push({kind:'app-destroyed',id:this.control.id}));}
  source(original:NgDocContentSource,part:string):NgDocContentSource {
    const control=this.control;
    return {id:original.id,load:async(signal:AbortSignal)=>{
      const version=control.version; control.events.push({kind:'load-start',part,version,id:control.id});
      signal.addEventListener('abort',()=>control.events.push({kind:'load-abort',part,version,id:control.id}),{once:true});
      const payload=await original.load(signal);
      control.events.push({kind:'real-payload-loaded',part,version,id:control.id,payloadId:payload.id,html:payload.html});
      control.entered(part,version);
      await control.wait(part,version);
      if(control.fail && part==='body') throw control.failure;
      control.events.push({kind:'load-return',part,version,id:control.id,aborted:signal.aborted});
      return {...payload,revision:payload.revision+':'+control.id+':'+version,html:payload.html+'<p data-testid="request-marker">'+control.id+':'+(control.sameHtml?1:version)+'</p><native-probe-marker></native-probe-marker>'};
    },subscribe:(invalidate:()=>void)=>{control.listeners.add(invalidate); return ()=>{control.listeners.delete(invalidate);control.events.push({kind:'unsubscribe',part,id:control.id});};}};
  }
}
`,
  );
  await put(
    root,
    'server.ts',
    `import 'zone.js/node';
import {enableProdMode} from '@angular/core';
import {bootstrapApplication,BootstrapContext,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser';
import {renderApplication,provideServerRendering} from '@angular/platform-server';
import {provideHttpClient,withFetch} from '@angular/common/http';
import {provideRouter,withDisabledInitialNavigation} from '@angular/router';
import {withNgDocContentReady} from '@ng-doc/app/helpers';
import {provideNgDocApp,providePageProcessor} from '@ng-doc/app';
import {App} from './src/app'; import {providers} from './src/providers'; import {provideNgDocContext} from '@ng-doc/generated';
import {ProbeApp,Processed,CONTROL} from './src/probe';
enableProdMode();
const document='<!doctype html><html><head><base href="/preview/"></head><body><app-root></app-root></body></html>';
export const renderRoute=(url:string,documentOverride?:string)=>renderApplication(withNgDocContentReady((context:BootstrapContext)=>bootstrapApplication(App,{providers:[...providers,provideServerRendering(),provideClientHydration(withNoIncrementalHydration())]},context)),{document:documentOverride??document,url,allowedHosts:['localhost','127.0.0.1']});
export const renderProbe=(url:string,control:any)=>renderApplication(withNgDocContentReady(async(context:BootstrapContext)=>{
  const app=await bootstrapApplication(ProbeApp,{providers:[provideServerRendering(),provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),provideRouter([],withDisabledInitialNavigation()),{provide:CONTROL,useValue:control},providePageProcessor({selector:'native-probe-marker',component:Processed,extractOptions:()=>({})})]},context);
  control.appReady(app); return app;
}),{document,url,allowedHosts:['localhost','127.0.0.1']});
`,
  );
}
