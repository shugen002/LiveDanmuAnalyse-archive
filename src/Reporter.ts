import { BiliApi } from './BiliApi.js';
import { sleep } from './utils.js';

export class Reporter {
  reportCounter: { [x: number]: number };
  api: BiliApi
  reportToken: any[];
  constructor(api) {
    this.reportCounter = {}
    this.api = api
    this.reportToken = []
    setInterval(() => {
      if (this.reportToken.length < 2) {
        this.reportToken.push(1);
      }
    }, 4000);
  }
  async handleAnalyse(roomid, message, weight, reason) {
    let uid = message.info[2][0]
    if (this.reportCounter[uid]) {
      this.reportCounter[uid]++;
    } else {
      this.reportCounter[uid] = 1
    }
    if (this.reportCounter[uid] > 1) {
      console.info("[Report]", new Date().toLocaleTimeString(), roomid, uid, `已举报，取消`)
      return
    }
    while (!this.reportToken.pop()) {
      await sleep(1000)
    }
    try {
      let res = await this.api.reportDanmu(roomid, message, reason) as any
      if (res.code == 0) {
        console.info("[Report] ", new Date().toLocaleTimeString(), roomid, uid, `成功 ${res.data.id ? "案件号：" + res.data.id : "附加数据：" + JSON.stringify(res.data)}`)
      } else {
        console.info("[Report]", new Date().toLocaleTimeString(), roomid, uid, `失败 ${JSON.stringify(res)} `)
      }
    } catch (e) {
      console.error(e);
    }
  }
}