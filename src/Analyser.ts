import EventEmitter from "events";
const numMap = {
  "0": "[0oO零]",
  "1": "[1l一壹]",
  "2": "[2二贰]",
  "3": "[3౩꒱ﾖ三叁]",
  "4": "[4四肆]",
  "5": "[5五伍]",
  "6": "[6Ⳓნେ六陆]",
  "7": "(𖩈|[7˥ꓶ七柒])",
  "8": "(𐌚|[ଃ8ꯕ႘੪八捌])",
  "9": "[9୨九玖]"
}

global.numMap = numMap;

function pitchEmpty(length, target) {
  return target + new Array(length - target.toString().length).join(" ")
}

export class Analyser extends EventEmitter {
  rule: Array<{ regex: RegExp, weight: number }>
  numMap: { [x: string]: string; };
  meta: any
  constructor() {
    super()
    this.rule = []
    this.numMap = numMap
  }
  public analyse(roomid, message: any) {
    let weight = 0;
    let danmu = message.info[1];
    for (let i = 0; i < this.rule.length; i++) {
      if (danmu.match(this.rule[i].regex)) {
        weight += this.rule[i].weight
        if (weight < 0) {
          return false
        }
        if (weight >= 5) {
          break;
        }
      }
    }
    if (weight >= 5) {
      this.emit('bad', roomid, message, weight);
      return true
    } else if (weight >= 1) {
      console.debug(`可疑弹幕 ${pitchEmpty(10, roomid)} ${pitchEmpty(17, message.info[2][0])} UL${pitchEmpty(3, message.info[4][0])} ${pitchEmpty(2, weight)} ${message.info[2][1]} : ${message.info[1]}`)
    }
    return false
  }
  public addRule(regex: RegExp, weight: number) {
    this.rule.push({
      regex, weight
    })
  }
  public addStringRule(str: string, weight: number) {
    this.rule.push({
      regex: new RegExp(`${str.split("").join(".{0,3}")}`), weight
    })
  }
  public addNumberRule(num: number | string) {
    this.rule.push({ regex: new RegExp(num.toString().split("").map((e) => { return numMap[e] || e }).join("[^\d]*")), weight: 10 })
  }
}