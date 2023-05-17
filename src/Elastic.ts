import { Client, ClientOptions } from '@elastic/elasticsearch'
import { randomUUID } from 'crypto'

export class ElasticUploader {
  client: Client
  queue: any[]
  interval: any;
  constructor(config: ClientOptions) {
    this.client = new Client(config)
    this.queue = []
    this.interval = setInterval(this.pushQueue.bind(this), 1000);
  }

  uploadDanmu(roomid, message) {
    this.queue.push(
      { index: { _index: "danmu", _id: randomUUID() } },
      {
        time: new Date(message.info[9].ts * 1000).valueOf(),
        roomId: roomid,
        userId: message.info[2][0],
        userName: message.info[2][1],
        userLevel: message.info[4][0],
        badgeRoomId: message.info[3].length ? message.info[3][3] : null,
        badgeLevel: message.info[3].length ? message.info[3][0] : null,
        badgeGuardLevel: message.info[3].length ? message.info[3][10] : null,
        content: message.info[1]
      }
    )
  }
  private async pushQueue() {
    if (this.queue.length > 0) {
      let current = this.queue
      this.queue = []
      let resp = await this.client.bulk({
        refresh: true,
        operations: current
      }, {
        ignore: [201]
      })
      if (resp.errors) {
        resp.items.forEach((e) => {
          if (e.index.error) {
            console.error(e);
          }
        })
      }
    }

  }

}