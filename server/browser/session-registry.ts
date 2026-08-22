import type { BrowserSession } from './types.js';

const sessions=new Map<string,BrowserSession>();

export const sessionRegistry={
  add(session:BrowserSession):void{sessions.set(session.id,session);},
  get(id:string):BrowserSession|undefined{return sessions.get(id);},
  require(id:string):BrowserSession{const session=sessions.get(id);if(!session||session.destroyed)throw new Error('Browser preview session not found');return session;},
  remove(id:string):BrowserSession|undefined{const session=sessions.get(id);sessions.delete(id);return session;},
  values():BrowserSession[]{return [...sessions.values()];},
  ids():string[]{return [...sessions.keys()];}
};
