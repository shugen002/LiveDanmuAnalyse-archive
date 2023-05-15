import { readFileSync, watchFile } from 'fs';
import { Analyser } from './Analyser.js';
import { BiliApi } from './BiliApi.js';
import { Room } from './Room.js';
import debounce from 'lodash.debounce'
import { readFile } from 'fs/promises';

const bapi = new BiliApi({});
let analysers: Array<Analyser> = [];
let rooms: Array<Room> = [];
let newRooms: Array<number> = [];
const loginedbapi = new BiliApi({
  cookie: readFileSync("config/cookie.txt").toString(),
});

async function recreateAnalyser() {
  console.info("Reload Analysers")
  let newAnalysers: Array<Analyser> = [];
  try {
    let anas = JSON.parse((await readFile('config/analysers.json')).toString('utf-8'))
    anas.forEach(function (item) {
      let newAnalyser = new Analyser()
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
        try {
          let res = await loginedbapi.reportDanmu(roomid, message, item.reason) as any
          if (res.code == 0) {
            console.info("[Report] ", new Date().toLocaleTimeString(), roomid, message.info[2][0], `成功 ${res.data.id ? "案件号：" + res.data.id : "附加数据：" + JSON.stringify(res.data)}`)
          } else {
            console.info("[Report]", new Date().toLocaleTimeString(), roomid, message.info[2][0], `失败 ${JSON.stringify(res)} `)
          }

        } catch (e) {
          console.error(e);
        }
      })
      newAnalysers.push(newAnalyser)
    })
  } catch (error) {
    console.error("load config/analysers.json failed", error)
    return;
  }
  analysers = newAnalysers
}

recreateAnalyser()
let debounceRecreateAnalyser = debounce(recreateAnalyser, 1000);

function AddRoom(roomId) {
  let room = new Room(roomId, bapi)
  room.addListener('DANMU_MSG', function (message) {
    if (message.info[0][9] != 0) {
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
  room.start()
  rooms.push(room);
}

function recreateRoomList(newRoomList: Array<number>) {
  // let newRoomList: Array<number> = [];
  // try {
  //   newRoomList = JSON.parse(readFileSync('config/rooms.json', 'utf8'));
  // } catch (error) {
  //   console.log('Fail to Parse Room List', error)
  //   return;
  // }
  let alreadyhas: Array<Room> = []
  let needClose: Array<Room> = []
  rooms.forEach(function (room) {
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
  rooms = alreadyhas
}
let debounceRecreateRoomList = debounce(recreateRoomList, 1000);

// recreateRoomList()

const watcher = {
  watchRule: watchFile('config/analysers.json', () => debounceRecreateAnalyser()),
  // watchRoom: watchFile('config/rooms.json', () => debounceRecreateRoomList())
}

const connectInterval = setInterval(() => {
  let room = newRooms.pop()
  if (room !== undefined) {
    AddRoom(room)
  }
}, 1000)

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

setInterval(async () => {
  recreateRoomList(await renewList())
}, 60 * 10 * 1000);

(async () => {
  recreateRoomList(await renewList())
})()
