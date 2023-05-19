import { existsSync, readFileSync, statSync, watchFile } from 'fs';
import { Analyser } from './Analyser.js';
import { BiliApi } from './BiliApi.js';
import { Room } from './Room.js';
import debounce from 'lodash.debounce'
import { readFile, writeFile } from 'fs/promises';
import { Reporter } from './Reporter.js';
import { ElasticUploader } from './Elastic.js';


let analysers: Array<Analyser> = [];
let listenRooms: Array<Room> = [];
let newRooms: Array<number> = [];
let manageRoom: { [x: number]: { already: number[], hour: number } } = [];

const bapi = new BiliApi({});
const loginedbapi = new BiliApi({
  cookie: readFileSync("config/cookie.txt").toString(),
});
let elasticUploader;
const reporter = new Reporter(loginedbapi);
if (existsSync("config/elastichost.txt")) {
  elasticUploader = new ElasticUploader({
    node: readFileSync("config/elastichost.txt").toString()
  });
}

async function roomBadHandler(roomId, message, weight) {
  let uid = message.info[2][0]
  if (manageRoom[roomId] && manageRoom[roomId].already.includes(uid)) {
    let res = await loginedbapi.banUserInRoom(roomId, message, manageRoom[roomId].hour) as any
    if (res.code == 0) {
      writeFile("logs/ban.log",
        `[RoomBan] ${new Date().toLocaleTimeString()} ${roomId} ${uid} 成功 附加数据：${JSON.stringify(res.data)}`, { mode: "ap" }).then(() => { }).catch(console.error)
      console.info("[RoomBan] ", new Date().toLocaleTimeString(), roomId, uid, `成功, 附加数据：${JSON.stringify(res.data)}`)
      manageRoom[roomId].already.push(uid)
    } else {
      console.info("[RoomBan]", new Date().toLocaleTimeString(), roomId, uid, `失败 ${JSON.stringify(res)} `)
    }
  }
}

async function recreateAnalyser() {
  console.info("Reload Analysers")
  let newAnalysers: Array<Analyser> = [];
  try {
    let anas = JSON.parse((await readFile('config/analysers.json')).toString('utf-8'))
    anas.forEach(function (item) {
      let newAnalyser = new Analyser()
      newAnalyser.meta = item
      if (item.matchNumber) {
        item.matchNumber.forEach(function (item) {
          newAnalyser.addNumberRule(item);
        })
      }
      if (item.matchString) {
        item.matchString.forEach(function (item) {
          newAnalyser.addStringRule(item, 5);
        });
      }
      if (item.matchRule) {
        item.matchRule.forEach(function (item) {
          newAnalyser.addRule(new RegExp(item.regex), item.weight || 5);
        })
      }
      newAnalyser.addListener('bad', async function (roomid, message, weight) {
        reporter.handleAnalyse(roomid, message, weight, this.meta.reason);
      })
      newAnalyser.addListener('bad', roomBadHandler)
      newAnalysers.push(newAnalyser)
    })
  } catch (error) {
    console.error("load config/analysers.json failed", error)
    return;
  }
  analysers = newAnalysers
}

function AddRoom(roomId) {
  let room = new Room(roomId, bapi)
  if (elasticUploader) {
    room.addListener('DANMU_MSG', function (message) {
      elasticUploader.uploadDanmu(this.id, message)
      if (message.info[0][9] != 0) {
        return;
      }
      if (message.info[0][12] == 1) {
        return;
      }
      if (message.info[4][0] > 10) {
        return;
      }
      if (message.info[3] && message.info[3][0] > 10) {
        return;
      }
      for (let i = 0; i < analysers.length; i++) {
        if (analysers[i].analyse(this.id, message)) {
          return
        }
      };
    })
  }


  room.start()
  listenRooms.push(room);
}

async function renewList() {
  let roomList = await Promise.all([1, 2, 3, 6, 9].map((parentAreaId) => {
    return [1, 2, 3].map(async (page) => {
      return await bapi.getLiveAreaList(parentAreaId, 0, page)
    })
  }).flat())
  let undup: any = {}
  roomList.map((e: any) => {
    if (e.code == 0) {
      return e.data.list.map((room: any) => {
        return room.roomid
      })
    } else {
      return []
    }
  }).flat().forEach((e) => {
    undup[e] = 1
  })
  return newRooms = Object.keys(undup).map((e) => { return parseInt(e) })
}

function recreateListenRoomList(newRoomList: Array<number>) {
  let alreadyhas: Array<Room> = []
  let needClose: Array<Room> = []
  listenRooms.forEach(function (room) {
    let i = newRoomList.indexOf(room.id);
    if (i != -1) {
      alreadyhas.push(room);
      newRoomList.splice(i, 1);
    } else {
      needClose.push(room);
    }
  })
  newRooms = newRoomList
  if (newRoomList.length > 0) console.info("Require Connect: ", newRoomList.join(", "))
  if (needClose.length > 0) console.info("Require Disconnect: ", needClose.map((e) => { return e.id }).join(", "))
  needClose.forEach(function (room) {
    room.stop()
  })
  listenRooms = alreadyhas
}


function recreateManageRoomList() {
  // let newRoomList: Array<number> = [];
  // try {
  //   newRoomList = JSON.parse(readFileSync('config/rooms.json', 'utf8'));
  // } catch (error) {
  //   console.log('Fail to Parse Room List', error)
  //   return;
  // }
}

const connectInterval = setInterval(() => {
  let room = newRooms.pop()
  if (room !== undefined) {
    AddRoom(room)
  }
}, 1000)


recreateAnalyser()
let debounceRecreateAnalyser = debounce(recreateAnalyser, 1000);
let debounceRecreateManageRoomList = debounce(recreateManageRoomList, 1000);

const watcher = {
  watchRule: watchFile('config/analysers.json', () => debounceRecreateAnalyser()),
  watchRoom: watchFile('config/rooms.json', () => debounceRecreateManageRoomList())
}
setInterval(async () => {
  recreateListenRoomList(await renewList())
}, 60 * 10 * 1000);

(async () => {
  recreateListenRoomList(await renewList())
})()
