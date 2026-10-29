/* plan.js — 30 天居家徒手課表（固定種子，每天不同、重開一致） */
(function () {
  const POOL = [
    { name: "開合跳", hint: "落地輕，膝蓋微彎緩衝", tag: "cardio" },
    { name: "深蹲", hint: "臀部往後坐，膝蓋對齊腳尖", tag: "legs" },
    { name: "棒式", hint: "肚子收緊，屁股不要翹", tag: "core" },
    { name: "登山者", hint: "手撐穩，膝蓋往胸口帶", tag: "core" },
    { name: "臀橋", hint: "夾臀上推，停留一秒", tag: "glutes" },
    { name: "跪姿伏地挺身", hint: "手肘往後 45 度，胸口貼近地面", tag: "push" },
    { name: "後跨弓箭步", hint: "前腳膝蓋不超過腳尖", tag: "legs" },
    { name: "死蟲式", hint: "下背貼地，對側手腳慢慢伸", tag: "core" },
    { name: "側棒式（左右各半）", hint: "身體成一直線，不要塌腰", tag: "core" },
    { name: "超人式", hint: "手腳離地，脖子不後仰", tag: "back" },
    { name: "高抬腿", hint: "膝蓋抬到腰高，落地輕", tag: "cardio" },
    { name: "深蹲跳", hint: "落地先緩衝再起跳", tag: "legs" },
    { name: "腳踏車捲腹", hint: "對側肘碰膝，慢比快有效", tag: "core" },
    { name: "牆壁伏地挺身", hint: "身體成直線，手肘彎到底", tag: "push" },
    { name: "橋式抬腿", hint: "臀撐住，單腳輪流伸直", tag: "glutes" },
    { name: "開合深蹲", hint: "腳開合配合蹲，節奏穩", tag: "legs" },
    { name: "平板肩碰", hint: "髖部不要左右晃", tag: "core" },
    { name: "站姿提膝", hint: "手肘帶動，核心出力", tag: "cardio" }
  ];

  // 固定種子亂數（mulberry32）
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WEEK_SEC = [25, 30, 35, 40];      // 每週動作秒數
  const WEEK_ROUNDS = [3, 3, 4, 4];       // 每週輪數
  const REST = [20, 15, 15, 12];          // 組間休息
  const ROUND_REST = 45;

  function buildDay(day) {
    const week = Math.min(3, Math.floor((day - 1) / 7));
    const r = rng(day * 977 + 13);
    const pool = POOL.slice();
    // 洗牌後取 5 個，且保證至少 1 核心、1 腿、1 心肺
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = [];
    const want = ["core", "legs", "cardio"];
    for (const tag of want) {
      const idx = pool.findIndex(m => m.tag === tag);
      if (idx >= 0) picks.push(pool.splice(idx, 1)[0]);
    }
    while (picks.length < 5 && pool.length) picks.push(pool.shift());

    const moves = picks.map(m => ({ name: m.name, hint: m.hint, sec: WEEK_SEC[week] }));
    return {
      day: day,
      rounds: WEEK_ROUNDS[week],
      rest: REST[week],
      roundRest: ROUND_REST,
      moves: moves,
      minutes: Math.round((moves.length * (WEEK_SEC[week] + REST[week]) * WEEK_ROUNDS[week] + ROUND_REST * (WEEK_ROUNDS[week] - 1)) / 60)
    };
  }

  const DAYS = [];
  for (let d = 1; d <= 30; d++) DAYS.push(buildDay(d));

  // 每天一句提醒（固定順序，不做隨機，避免每天換話）
  const TIPS = [
    "姿勢優先於速度：動作做滿，寧慢不亂。",
    "今天只要動 12 分鐘，就算達標。",
    "呼吸不要憋：出力時吐氣。",
    "昨天痠是正常的，今天先做暖身再開始。",
    "累的話把速度放慢，但次數做滿。",
    "補水放在休息時間，不要邊做邊灌。",
    "睡前做也有效，重點是今天有做。"
  ];

  window.PLAN = {
    days: DAYS,
    get(day) { return DAYS[Math.max(0, Math.min(29, day - 1))]; },
    tipFor(day) { return TIPS[(day - 1) % TIPS.length]; }
  };
})();
