import { randomUUID, randomBytes } from 'crypto';
import fetch from 'node-fetch'
import { Agent } from 'https';

export interface BiliApiConfig {
  cookie?: string;
}

export interface DanmuInfo {
  code: number;
  message: string;
  ttl: number;
  data: {
    group: "live",
    business_id: number,
    refresh_row_factor: number,
    refresh_rate: number,
    max_delay: number,
    token: string,
    host_list: Array<{
      host: string,
      port: number,
      wss_port: number,
      ws_port: number,
    }>
  }
}

function getIdStr(b64: string) {
  return Buffer.from(b64, "base64").toString().substring(2, 36);
}

const agent = new Agent({
  keepAlive: true,
  maxSockets: 10
})

export class BiliApi {
  private _config: BiliApiConfig
  constructor(config: BiliApiConfig) {
    this._config = config
  }

  private headers() {
    return {
      "Accept": "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "zh-CN,zh;q=0.9,zh-HK;q=0.8,en-US;q=0.7,en;q=0.6",
      "Origin": "https://live.bilibili.com",
      "Referer": "https://live.bilibili.com/",
      "Cookie": this._config.cookie || ("_uuid=; rpdid=; buvid3=" + (randomUUID() + randomBytes(2).toString('hex')).toUpperCase() + "infoc"),
      "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
    }
  }

  private csrf() {
    return (this._config.cookie?.match(/(?<=bili_jct\=).{32}/) || [""])[0]
  }

  async getDanmuInfo(id: number): Promise<DanmuInfo> {
    let res = await fetch("https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?" + new URLSearchParams({ id: id.toString() }).toString(), {
      headers: this.headers(),
      agent: agent
    })
    return res.json() as any
  }

  async reportDanmu(roomId: number, message: any, reason: { id: number, reason: string } = { id: 2, reason: "低俗色情" }) {
    let idStr = getIdStr(message.dm_v2)
    return (await fetch("https://api.live.bilibili.com/xlive/web-ucenter/v1/dMReport/Report", {
      "headers": this.headers(),
      "body": new URLSearchParams({
        id: 0,
        roomid: roomId,
        tuid: message.info[2][0],
        msg: message.info[1],
        reason: reason.reason,
        ts: message.info[9].ts,
        sign: message.info[9].sign,
        reason_id: reason.id,
        token: "",
        dm_type: 0,
        id_str: idStr,
        csrf_token: this.csrf(),
        csrf: this.csrf(),
        visit_id: ""
      } as any),
      "method": "POST",
      agent: agent
    })).json()
  }

  async banUserInRoom(roomId: number, message: any, hour: number = 8) {
    return (await fetch("https://api.live.bilibili.com/xlive/web-ucenter/v1/banned/AddSilentUser", {
      "headers": this.headers(),
      "body": new URLSearchParams({
        room_id: roomId,
        tuid: message.info[2][0],
        msg: message.info[1],
        hour,
        mobile_app: "web",
        csrf_token: this.csrf(),
        csrf: this.csrf(),
        visit_id: ""
      } as any),
      "method": "POST",
      agent: agent
    })).json()
  }

  async getLiveAreaList(parentAreaId: number | string, areaId: number | string, page: number | string, sortType = "online") {
    return (await fetch("https://api.live.bilibili.com/xlive/web-interface/v1/second/getList?" + new URLSearchParams({
      platform: "web",
      parent_area_id: parentAreaId.toString(),
      area_id: areaId.toString(),
      page: page.toString(),
      sort_type: sortType
    }).toString(), {
      headers: this.headers(),
      agent: agent
    })).json()
  }
}