#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成拼音词典静态资产 src/pinyinDict.ts。

产出：
  - PINYIN_CHARS   音节 -> 汉字串（按使用频率降序，候选顺序即字符串顺序）
  - PINYIN_PHRASES 拼音 -> 短语（常用词 + 常见人名/昵称）

数据来源（首次运行自动下载到 tmp/dict-src/，不入库）：
  1. Jun Da 现代汉语单字字频表（tab 分隔，GBK）：字频排名 + 多音字读音
     https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO
  2. hotoo/pinyin 的单字表 dict-zi-web.js（带声调键），补全读音覆盖
     https://unpkg.com/pinyin@2.11.2/data/dict-zi-web.js

用法（在仓库根目录）：
  python scripts/gen-pinyin-dict.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "tmp" / "dict-src"
OUT_TS = ROOT / "src" / "pinyinDict.ts"

FREQ_URL = "https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO"
ZI_URL = "https://unpkg.com/pinyin@2.11.2/data/dict-zi-web.js"

# 声调/变体 -> 拉丁键（ü 统一成 v，与主流拼音输入法一致）
TONE_TABLE = str.maketrans(
    {
        "ā": "a", "á": "a", "ǎ": "a", "à": "a",
        "ē": "e", "é": "e", "ě": "e", "è": "e", "ê": "e",
        "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
        "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
        "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
        "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v", "ü": "v",
        "ń": "n", "ň": "n", "ǹ": "n", "ḿ": "m",
    }
)
TONE_DIGITS = re.compile(r"[0-5]+$")
VALID_SYLLABLE = re.compile(r"^[a-z]+$")

# 短语词典：拼音 -> 短语。多音字按常用读音显式标注拼音，不走单字首读音。
PHRASES: dict[str, str] = {
    # —— 问候 / 礼貌 ——
    "nihao": "你好", "xiexie": "谢谢", "bukeqi": "不客气", "duibuqi": "对不起",
    "meiguanxi": "没关系", "zaijian": "再见", "qingwen": "请问", "bahaoyisi": "不好意思",
    "huanying": "欢迎", "xinku": "辛苦", "jiayou": "加油",
    # —— 高频常用 ——
    "women": "我们", "nimen": "你们", "tamen": "他们", "tamenmen": "她们",
    "zhege": "这个", "nage": "那个", "shenme": "什么", "zenme": "怎么",
    "weishenme": "为什么", "keyi": "可以", "bushi": "不是", "meiyou": "没有",
    "xianzai": "现在", "yige": "一个", "wode": "我的", "nide": "你的",
    "tade": "他的", "zhende": "真的", "yiding": "一定",
    "danshi": "但是", "suoyi": "所以", "yinwei": "因为", "ruguo": "如果",
    "haode": "好的", "zhidao": "知道", "buzhidao": "不知道", "xihuan": "喜欢",
    "juede": "觉得", "xuyao": "需要", "yinggai": "应该", "neng": "能",
    # —— 时间 ——
    "jintian": "今天", "mingtian": "明天", "zuotian": "昨天", "shangwu": "上午",
    "xiawu": "下午", "wanshang": "晚上", "shijian": "时间", "xingqi": "星期",
    "yuefen": "月份", "zhongwu": "中午", "zaoshang": "早上",
    # —— 数量 / 描述 ——
    "daxiao": "大小", "duoshao": "多少", "changduan": "长短", "kuaiman": "快慢",
    "xinqing": "心情", "kaixin": "开心", "piaoliang": "漂亮", "keai": "可爱",
    "congming": "聪明", "zhenhao": "真好", "henhao": "很好", "bucuo": "不错",
    # —— 常见人名 / 昵称 ——
    "dahuang": "大黄", "xiaohuang": "小黄", "dahei": "大黑", "xiaohei": "小黑",
    "dahua": "大花", "xiaohua": "小花", "huahua": "花花", "heihei": "黑黑",
    "huanghuang": "黄黄", "baibai": "白白", "dabai": "大白", "xiaobai": "小白",
    "pangpang": "胖胖", "zhuangzhuang": "壮壮", "dabao": "大宝", "xiaobao": "小宝",
    "xiaoming": "小明", "xiaohong": "小红", "xiaogang": "小刚", "xiaoli": "小丽",
    "mimi": "咪咪", "maomao": "毛毛", "tiantian": "甜甜", "dandan": "蛋蛋",
    "tudou": "土豆", "niunai": "牛奶",
    # —— 操作 / 界面 ——
    "tijiao": "提交", "baocun": "保存", "bianhao": "编号", "xinjian": "新建",
    "xiugai": "修改", "shanchu": "删除", "chaxun": "查询", "sousuo": "搜索",
    "queren": "确认", "quxiao": "取消", "fanhui": "返回", "tuichu": "退出",
    "shezhi": "设置", "guanli": "管理", "kaishi": "开始", "jieshu": "结束",
    "wancheng": "完成", "zanting": "暂停", "jixu": "继续", "xuanze": "选择",
    "shuru": "输入", "qingchu": "清除", "shuaxin": "刷新", "dakai": "打开",
    "guanbi": "关闭", "shangchuan": "上传", "xiazai": "下载", "fuzhi": "复制",
    "niantie": "粘贴", "bianji": "编辑", "tianjia": "添加", "dayin": "打印",
    # —— 信息 / 名词 ——
    "mingzi": "名字", "dianhua": "电话", "dizhi": "地址", "beizhu": "备注",
    "mima": "密码", "zhanghao": "账号", "shouji": "手机", "youxiang": "邮箱",
    "wenjian": "文件", "tupian": "图片", "shipin": "视频", "yinyue": "音乐",
    "diannao": "电脑", "wangluo": "网络", "xitong": "系统", "yonghu": "用户",
    "wenti": "问题", "qingkuang": "情况", "riqi": "日期", "jilu": "记录",
    "xinxi": "信息", "shuju": "数据", "wenben": "文本", "neirong": "内容",
}


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"下载 {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())
    return dest


def normalize_syllable(raw: str) -> str | None:
    s = raw.strip().lower().translate(TONE_TABLE)
    s = s.replace("u:", "v")
    s = TONE_DIGITS.sub("", s)
    if not s or not VALID_SYLLABLE.match(s):
        return None
    return s


def load_freq() -> tuple[dict[str, int], dict[str, set[str]]]:
    """返回 (char -> 频次排名, char -> 音节集合)。"""
    path = download(FREQ_URL, CACHE_DIR / "charfreq-modern.txt")
    text = path.read_bytes().decode("gbk", errors="replace")
    ranks: dict[str, int] = {}
    readings: dict[str, set[str]] = {}
    for line in text.splitlines():
        if not line.strip() or line.startswith("/*"):
            continue
        cols = line.split("\t")
        if len(cols) < 5:
            continue
        char = cols[1].strip()
        if len(char) != 1:
            continue
        try:
            rank = int(cols[0])
        except ValueError:
            continue
        ranks.setdefault(char, rank)
        syls = readings.setdefault(char, set())
        for part in cols[4].split("/"):
            syl = normalize_syllable(re.sub(r"[0-5]+$", "", part))
            if syl:
                syls.add(syl)
    return ranks, readings


def load_zi_dict() -> dict[str, set[str]]:
    path = download(ZI_URL, CACHE_DIR / "dict-zi-web.js")
    src = path.read_text(encoding="utf-8")
    out: dict[str, set[str]] = {}
    for key, chars in re.findall(r'"([^"]+)":"([^"]*)"', src):
        syl = normalize_syllable(key)
        if not syl:
            continue
        bucket = out.setdefault(syl, set())
        bucket.update(chars)
    return out


def build_chars() -> dict[str, str]:
    ranks, freq_readings = load_freq()
    zi = load_zi_dict()

    # char -> 音节集合（两源合并）
    readings: dict[str, set[str]] = {c: set(s) for c, s in freq_readings.items()}
    for syl, chars in zi.items():
        for ch in chars:
            readings.setdefault(ch, set()).add(syl)

    # 音节 -> 汉字（按字频排名升序；未上榜的按 GB2312 码兜底，排在后面）
    def sort_key(ch: str):
        rank = ranks.get(ch)
        if rank is not None:
            return (0, rank, 0)
        try:
            code = ch.encode("gb2312")
            return (1, 0, code[0] * 256 + code[1])
        except Exception:
            return (2, 0, ord(ch))

    table: dict[str, list[str]] = {}
    for ch, syls in readings.items():
        for syl in syls:
            table.setdefault(syl, []).append(ch)

    out: dict[str, str] = {}
    for syl, chars in table.items():
        chars = sorted(set(chars), key=sort_key)
        out[syl] = "".join(chars)
    return out


def build_phrases() -> dict[str, str]:
    bad = [p for p in PHRASES if not VALID_SYLLABLE.match(p)]
    if bad:
        raise SystemExit(f"短语拼音非法：{bad}")
    return dict(sorted(PHRASES.items()))


def main() -> int:
    chars = build_chars()
    phrases = build_phrases()

    lines = [
        "/* eslint-disable */",
        "/**",
        " * 拼音词典（自动生成，勿手工编辑）。",
        " * 重新生成：python scripts/gen-pinyin-dict.py",
        " * PINYIN_CHARS：音节 -> 汉字串，字符串顺序 = 候选顺序（按字频降序）。",
        " * PINYIN_PHRASES：拼音 -> 短语（常用词 + 常见人名/昵称）。",
        " */",
        "",
        f"export const PINYIN_CHARS: Record<string, string> = {json.dumps(chars, ensure_ascii=False, sort_keys=True)};",
        "",
        f"export const PINYIN_PHRASES: Record<string, string> = {json.dumps(phrases, ensure_ascii=False, sort_keys=True)};",
        "",
    ]
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    total_chars = sum(len(v) for v in chars.values())
    print(f"音节 {len(chars)} 个，覆盖汉字 {total_chars} 次，短语 {len(phrases)} 条")
    print(f"写出 {OUT_TS}（{OUT_TS.stat().st_size // 1024} KB）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
