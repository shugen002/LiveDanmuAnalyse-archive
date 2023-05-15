import EventEmitter from "events";
declare module 'goimprotocol' {
  interface Config {
    host: string;
    port: number;
    path?: string;
    wss?: boolean;
    authInfo: any
    version?: number;
  }

  export class GoIMConnection extends EventEmitter {
    constructor(config: Config) { }
    connect() { }
    close() { }
    send() { }
    on(eventName: 'message', listener: (...args: any[]) => void): this;
    on(eventName: 'close', listener: (...args: any[]) => void): this;
  }
}