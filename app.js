/* app.js — Fit30 訓練 App（本機資料、無後端） */
(function () {
  "use strict";

  const KEY = "fit30.v1";
  const SESSION = "fit30.session";
  const FREE_DAYS = 7;

  // ---------- 小工具 ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const pad2 = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  const today = () => dayKey(new Date());
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
  const fmtClock = (s) => Math.floor(s / 60) + ":" + pad2(Math.max(0, Math.round(s % 60)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 資料 ----------
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!s || typeof s !== "object") s = {};
    return {
      v: 1,
      start: s.start || today(),
      unlocked: !!s.unlocked,
      voice: s.voice !== false,
      beep: s.beep !== false,
      remind: !!s.remind,
      log: s.log && typeof s.log === "object" ? s.log : {}
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  let S = load();

  // ---------- 進度計算 ----------
  function planDay() {                    // 今天是第幾天（1..30，超過就停在 30）
    const n = diffDays(S.start, today()) + 1;
    return clamp(n, 1, 30);
  }
  function rawDay() { return diffDays(S.start, today()) + 1; }
  function isLocked() { return rawDay() > FREE_DAYS && !S.unlocked; }

  function streak() {
    let n = 0;
    let d = new Date();
    // 今天還沒做也不算斷：從今天往回找連續有紀錄的日子
    if (!S.log[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (S.log[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function totals() {
    const keys = Object.keys(S.log);
    let min = 0;
    keys.forEach(k => { min += Number(S.log[k].mins || 0); });
    return { count: keys.length, min: Math.round(min) };
  }

  // ---------- 畫面切換 ----------
  const views = { home: "view-home", train: "view-train", done: "view-done", log: "view-log", me: "view-me" };
  function show(name) {
    Object.values(views).forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove("on"); });
    const el = document.getElementById(views[name]);
    if (el) el.classList.add("on");
    $$("#tabbar .tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
    window.scrollTo(0, 0);
  }

  // ---------- 首頁 ----------
  function renderHome() {
    const d = planDay(), plan = PLAN.get(d);
    $("#dayChip").textContent = "第 " + d + " 天";
    $("#heroNum").textContent = d;
    $("#heroTitle").textContent = rawDay() > 30 ? "30 天完成，重新開始吧" : "今天，動起來";
    $("#heroSub").textContent = plan.moves.length + " 個動作 · " + plan.rounds + " 輪 · 約 " + plan.minutes + " 分鐘";
    $("#homeMoves").innerHTML = plan.moves.map((m, i) =>
      `<li><span class="mv-i">${i + 1}</span><span class="mv-n">${m.name}</span><span class="mv-s">${m.sec}s</span></li>`
    ).join("");
    $("#homeTip").textContent = PLAN.tipFor(d);

    const t = totals();
    $("#stStreak").textContent = streak();
    $("#stTotal").textContent = t.count;
    $("#stMin").textContent = t.min;

    $("#btnStart").textContent = S.log[today()] ? "今天已完成，再練一次" : "開始訓練";
  }

  // ---------- 訓練引擎 ----------
  const T = {
    queue: [], idx: 0, plan: null, done: 0,
    endAt: 0, left: 0, phase: "prep", paused: false, timer: null, startedAt: 0
  };

  function buildQueue(plan) {
    const q = [{ type: "prep", sec: 5, label: "準備", name: "準備開始" }];
    for (let r = 1; r <= plan.rounds; r++) {
      plan.moves.forEach((m, i) => {
        q.push({ type: "work", sec: m.sec, label: "第 " + r + " 輪", name: m.name, hint: m.hint, move: i + 1, moves: plan.moves.length, round: r });
        const last = (r === plan.rounds && i === plan.moves.length - 1);
        if (!last) q.push({ type: "rest", sec: m.sec === 0 ? 10 : plan.rest, label: "休息", name: "休息一下" });
      });
      if (r < plan.rounds) q.push({ type: "rest", sec: plan.roundRest, label: "輪間休息", name: "喝水，深呼吸" });
    }
    return q;
  }

  function startWorkout() {
    if (isLocked()) { openPaywall(); return; }
    T.plan = PLAN.get(planDay());
    T.queue = buildQueue(T.plan);
    T.idx = 0; T.done = 0; T.paused = false; T.startedAt = Date.now();
    show("train");
    enter(0);
    keepAwake();
  }

  function enter(i) {
    T.idx = i;
    if (i >= T.queue.length) { finish(); return; }
    const st = T.queue[i];
    T.phase = st.type;
    T.left = st.sec;
    T.endAt = Date.now() + st.sec * 1000;

    $("#trName").textContent = st.name;
    $("#trHint").textContent = st.hint || "";
    $("#trRound").textContent = st.type === "work" ? ("第 " + st.round + " / " + T.plan.rounds + " 輪") : st.label;
    $("#trStep").textContent = st.type === "work" ? (st.move + " / " + st.moves) : "—";
    $("#trPhase").textContent = st.type === "work" ? "動作中" : (st.type === "prep" ? "準備" : "休息");

    renderRing(1);
    renderClock(st.sec);
    renderUpNext();

    if (st.type === "work") { speak(st.name); beep(880, 0.12); }
    else if (st.type === "prep") { speak("準備"); }
    else { speak(st.sec > 25 ? "休息" : "休息" + st.sec + "秒"); beep(520, 0.1); }

    saveSession();
    startTicker();
  }

  function startTicker() {
    clearInterval(T.timer);
    T.timer = setInterval(tick, 200);
  }

  function tick() {
    if (T.paused) return;
    const st = T.queue[T.idx];
    if (!st) return;
    let left = (T.endAt - Date.now()) / 1000;
    if (left <= 0) { next(); return; }
    T.left = left;
    renderClock(left);
    renderRing(1 - left / st.sec);
    const sec = Math.ceil(left);
    if (sec <= 3 && sec !== T.lastBeep) { T.lastBeep = sec; beep(st.type === "work" ? 660 : 440, 0.08); }
  }

  function next() {
    const st = T.queue[T.idx];
    if (st && st.type === "work") T.done++;
    T.lastBeep = null;
    enter(T.idx + 1);
  }

  function renderClock(sec) {
    $("#trClock").textContent = fmtClock(Math.ceil(sec));
  }
  function renderRing(p) {
    const C = 2 * Math.PI * 104;
    $("#ringFg").setAttribute("stroke-dasharray", C.toFixed(1));
    $("#ringFg").setAttribute("stroke-dashoffset", (C * clamp(p, 0, 1)).toFixed(1));
  }
  function renderUpNext() {
    const rest = T.queue.slice(T.idx + 1).filter(s => s.type === "work").slice(0, 4);
    $("#upNext").innerHTML = rest.map((s, i) =>
      `<li><span class="un-i">${i + 1}</span><span class="un-n">${s.name}</span><span class="un-s">${s.sec}s</span></li>`
    ).join("");
  }

  function finish() {
    clearInterval(T.timer);
    const mins = Math.max(1, Math.round((Date.now() - T.startedAt) / 60000));
    const d = planDay();
    const k = today();
    const old = S.log[k];
    if (!old || mins >= (old.mins || 0)) S.log[k] = { day: d, mins: mins, moves: T.done, at: Date.now() };
    save();
    try { localStorage.removeItem(SESSION); } catch (e) {}
    releaseAwake();

    $("#doneSub").textContent = "第 " + d + " 天 · " + mins + " 分鐘 · " + T.done + " 個動作";
    $("#doneStreak").textContent = streak();
    $("#doneTotal").textContent = totals().count;
    show("done");
    speak("完成了，做得好");
    beep(990, 0.2);
    renderHome();
  }

  function quit() {
    if (!confirm("結束這回合？已做的動作不會計入紀錄。")) return;
    clearInterval(T.timer);
    try { localStorage.removeItem(SESSION); } catch (e) {}
    releaseAwake();
    renderHome();
    show("home");
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION, JSON.stringify({ idx: T.idx, started: T.startedAt, day: planDay() }));
    } catch (e) {}
  }

  // ---------- 語音與音效 ----------
  let AC = null;
  function beep(freq, dur) {
    if (!S.beep) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.value = 0.06;
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + dur);
    } catch (e) {}
  }
  function speak(text) {
    if (!S.voice || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-TW"; u.rate = 1.05; u.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ---------- 螢幕常亮 ----------
  let wakeLock = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  function releaseAwake() { try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} }

  // ---------- 紀錄頁 ----------
  function renderLog() {
    // 近 28 天方格
    const cells = [];
    const t = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(t); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const rec = S.log[k];
      cells.push(`<div class="cell${rec ? " on" : ""}${k === today() ? " now" : ""}" title="${k}${rec ? " · " + rec.mins + " 分鐘" : ""}"><span>${d.getDate()}</span></div>`);
    }
    $("#cal").innerHTML = `<div class="cal-grid">${cells.join("")}</div>`;

    const keys = Object.keys(S.log).sort().reverse().slice(0, 20);
    $("#logList").innerHTML = keys.length ? keys.map(k => {
      const r = S.log[k];
      return `<li><div><b>第 ${r.day} 天</b><small>${k}</small></div><span>${r.mins} 分鐘 · ${r.moves} 動作</span></li>`;
    }).join("") : `<li class="empty">還沒有紀錄，先去動一動。</li>`;
  }

  // ---------- 我的 ----------
  function renderMe() {
    $("#meStart").textContent = S.start;
    $("#meDay").textContent = "第 " + planDay() + " 天";
    $("#mePlan").textContent = S.unlocked ? "完整版" : (rawDay() > FREE_DAYS ? "體驗已結束" : "免費體驗（剩 " + Math.max(0, FREE_DAYS - rawDay() + 1) + " 天）");
    $("#swVoice").classList.toggle("on", S.voice);
    $("#swBeep").classList.toggle("on", S.beep);
    $("#swRemind").classList.toggle("on", S.remind);
    $("#swVoice").setAttribute("aria-pressed", String(S.voice));
    $("#swBeep").setAttribute("aria-pressed", String(S.beep));
    $("#swRemind").setAttribute("aria-pressed", String(S.remind));
  }

  // ---------- 付費牆 ----------
  function openPaywall() { $("#paywall").hidden = false; }
  function closePaywall() { $("#paywall").hidden = true; }

  // ---------- 事件 ----------
  $("#btnStart").addEventListener("click", startWorkout);
  $("#btnHome").addEventListener("click", () => { renderHome(); show("home"); });
  $("#btnSkip").addEventListener("click", () => { T.lastBeep = null; next(); });
  $("#btnQuit").addEventListener("click", quit);
  $("#btnPause").addEventListener("click", () => {
    T.paused = !T.paused;
    if (T.paused) {
      T.left = (T.endAt - Date.now()) / 1000;
      $("#btnPause").textContent = "繼續";
      $("#trPhase").textContent = "暫停";
    } else {
      T.endAt = Date.now() + T.left * 1000;
      $("#btnPause").textContent = "暫停";
      $("#trPhase").textContent = T.phase === "work" ? "動作中" : "休息";
    }
  });

  $("#btnMe").addEventListener("click", () => { renderMe(); show("me"); });
  $$("#tabbar .tab").forEach(t => t.addEventListener("click", () => {
    const tab = t.dataset.tab;
    if (tab === "log") renderLog();
    if (tab === "me") renderMe();
    if (tab === "home") renderHome();
    show(tab);
  }));

  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fit30-" + today() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  $("#btnRestart").addEventListener("click", () => {
    if (!confirm("重新開始 30 天？紀錄會保留，但天數從第 1 天算起。")) return;
    S.start = today();
    save(); renderHome(); renderMe();
  });

  function bindSwitch(id, key) {
    $(id).addEventListener("click", () => {
      S[key] = !S[key];
      save(); renderMe();
      if (key === "remind" && S.remind) askNotify();
    });
  }
  bindSwitch("#swVoice", "voice");
  bindSwitch("#swBeep", "beep");
  bindSwitch("#swRemind", "remind");

  async function askNotify() {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") {
        new Notification("Fit30", { body: "每日提醒已開啟，時間到你會收到通知（需 App 開著或系統允許）。" });
      }
    } catch (e) {}
  }

  $("#btnSubscribe").addEventListener("click", () => {
    alert("這是展示版：正式上架後會接 Google Play 訂閱（NT$120/月）。");
  });
  $("#btnUnlockDemo").addEventListener("click", () => {
    S.unlocked = true; save(); closePaywall(); renderHome(); renderMe();
  });
  $("#btnClosePw").addEventListener("click", closePaywall);

  // 從背景回來時修正計時（分頁暫停會讓 setInterval 停擺）
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && T.queue.length && T.queue[T.idx]) {
      T.endAt = Date.now() + Math.max(0, T.left) * 1000;
      startTicker();
    }
  });

  // ---------- 啟動 ----------
  renderHome();
  if (rawDay() > FREE_DAYS && !S.unlocked && !S.log[today()]) openPaywall();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
  }

  // 開放給測試用（不影響一般操作）
  window.__fit = {
    state: () => S,
    start: startWorkout,
    jump: (i) => enter(i),
    finishNow: () => { T.startedAt = Date.now() - 12 * 60000; T.done = T.plan ? T.plan.moves.length * T.plan.rounds : 5; finish(); },
    lockToday: (daysAgo) => { S.start = dayKey(new Date(Date.now() - daysAgo * 86400000)); save(); renderHome(); }
  };
})();
