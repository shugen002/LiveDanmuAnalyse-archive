import EventEmitter from "events";
import type { Analyser } from "./Analyser.js";
import type { BiliApi } from "./BiliApi.js";
import { GoIMConnection } from 'goimprotocol/index.js'
import { inflateSync } from 'zlib';

function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

const reconnectQueue: Array<Function> = []

function getReconnectChance(): Promise<void> {
  return new Promise((resolve, _) => {
    reconnectQueue.push(resolve)
  })
}

const reconnectControllInterval = setInterval(() => {
  if (reconnectQueue.length > 0) {
    reconnectQueue.shift().call(null)
  }
}, 1000)

export class Room extends EventEmitter {
  id: number;
  _api: BiliApi;
  stoped: any;
  connection?: GoIMConnection;
  constructor(roomId: number, api: BiliApi) {
    super();
    this.id = roomId
    this._api = api;
  }

  public connect(): Promise<void> {
    return new Promise(async (resolve, _) => {
      try {
        let res = await this._api.getDanmuInfo(this.id)
        this.connection = new GoIMConnection({
          host: res.data.host_list[0].host,
          port: res.data.host_list[0].wss_port,
          authInfo: {
            uid: 0,
            roomid: this.id,
            protover: 1,
            platform: "web",
            type: "3",
            key: res.data.token
          },
          type: "websocket",
          path: "sub",
          wss: true
        });
        this.connection.on('close', (code: any, err: any) => {
          console.log(`Connection closed: code=${code},err=${err}`)
          resolve();
        })
        this.connection.on('message', (e) => { this.onMessage(e) })
        this.connection.on('error', (e) => console.error("[error]", this.id, e))
        this.connection.__onData = (function (data) {
          while (data.length > 0) {
            if (data.length == 15 && data.toString() == "[object Object]") {
              data = data.slice(15);
              continue
            }
            let packet = this.decoder.decode(data);
            if (this.operationMap[packet.operation]) {
              this.emit(this.operationMap[packet.operation] || "UnknownOperation", packet)
            }
            data = data.slice(packet.packageLength);
          }
        })
        this.connection.connect();
      } catch (e) {
        console.log(e)
      }
    })
  }
  onMessage(packet) {
    if (packet.protocolVersion === 2) {
      this.connection.__onData.bind(this.connection)(Buffer.from(inflateSync(packet.body)))
    } else {
      const message = JSON.parse(packet.body.toString())
      this.emit(message.cmd, message);
    }
  }
  async start() {
    while (!this.stoped) {
      await this.connect();
      await sleep(1000)
      await getReconnectChance();
    }
  }
  stop() {
    this.stoped = true;
    if (this.connection) {
      this.connection.close()
    }
  }
}