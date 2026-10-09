// 集計APIとのやりとり。デモ／本番の切り替えはスプレッドシート側の設定に従う
(function () {
  const cfg = window.VOTE_CONFIG;
  const POINTS = [3, 2, 1];
  const FALLBACK_DEADLINE = '2026-10-15T23:59:00+09:00';

  const session = { mode: 'demo', deadline: new Date(FALLBACK_DEADLINE) };

  async function get(params) {
    const res = await fetch(cfg.apiUrl + '?' + new URLSearchParams(params).toString());
    return res.json();
  }

  async function post(body) {
    // text/plain にするとブラウザの事前確認(CORS preflight)が発生しない
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // ---- デモモード（この端末の中だけに保存） ----
  const MOCK_KEY = 'bachi-mock-db';
  function mockDb() {
    try {
      return JSON.parse(localStorage.getItem(MOCK_KEY)) || { votes: [], voters: {} };
    } catch (e) {
      return { votes: [], voters: {} };
    }
  }
  function mockSave(db) {
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(db)); } catch (e) { /* noop */ }
  }
  function normalize(name) {
    return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  }
  function isClosed() {
    return Date.now() > session.deadline.getTime();
  }
  function tally(votes) {
    const items = [];
    for (let i = 1; i <= cfg.itemCount; i++) items.push({ id: i, points: 0, counts: [0, 0, 0] });
    votes.forEach(r => r.forEach((id, place) => {
      const it = items[id - 1];
      it.points += POINTS[place];
      it.counts[place]++;
    }));
    const cmp = (a, b) => b.points - a.points || b.counts[0] - a.counts[0] ||
      b.counts[1] - a.counts[1] || b.counts[2] - a.counts[2];
    items.sort((a, b) => cmp(a, b) || a.id - b.id);
    items.forEach((it, i) => { it.rank = i > 0 && cmp(items[i - 1], it) === 0 ? items[i - 1].rank : i + 1; });
    return items;
  }
  const mock = {
    async vote(name, ranks) {
      if (isClosed()) return { ok: false, error: 'closed' };
      const db = mockDb();
      const key = normalize(name);
      if (db.voters[key]) return { ok: false, error: 'already_voted' };
      const token = 'mock-' + Math.random().toString(36).slice(2);
      db.voters[key] = token;
      db.votes.push(ranks);
      mockSave(db);
      return { ok: true, token };
    },
    async results(token, admin) {
      const db = mockDb();
      if (!admin && !isClosed() && !Object.values(db.voters).includes(token)) return { ok: false, error: 'not_yet' };
      return { ok: true, closed: isClosed(), deadline: session.deadline.toISOString(), voters: db.votes.length, items: tally(db.votes) };
    },
  };

  // ---- 管理者のパスワード（このタブを閉じるまで保持） ----
  const ADMIN_KEY = 'bachi_admin';
  window.AdminSession = {
    get() { try { return sessionStorage.getItem(ADMIN_KEY); } catch (e) { return null; } },
    set(pw) { try { sessionStorage.setItem(ADMIN_KEY, pw); } catch (e) { /* noop */ } },
    clear() { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* noop */ } },
  };

  function apply(conf) {
    session.mode = conf.mode === 'live' ? 'live' : 'demo';
    session.deadline = new Date(conf.deadline);
    return conf;
  }

  window.VoteApi = {
    // サーバーから締切とモードを読み込む。URL未設定ならデモモード
    async init() {
      if (!cfg.apiUrl) {
        return { ok: true, mode: 'demo', deadline: session.deadline.toISOString(), closed: isClosed(), offline: true };
      }
      return apply(await get({ action: 'config' }));
    },
    isDemo: () => session.mode !== 'live',
    vote(name, ranks) {
      return this.isDemo() ? mock.vote(name, ranks) : post({ action: 'vote', name, ranks });
    },
    results(token) {
      return this.isDemo() ? mock.results(token, false) : get({ action: 'results', token: token || '' });
    },

    // 管理者用。パスワードの照合はサーバー側で行う
    async admin(op, value, password) {
      if (!cfg.apiUrl) return { ok: false, error: 'offline' };
      const res = await post({ action: 'admin', op, value, password: password || AdminSession.get() || '' });
      if (res.ok && res.mode) apply(res);
      return res;
    },
    adminResults() {
      return this.isDemo() ? mock.results(null, true) : this.admin('results');
    },
  };

  // 投票済みの記録（Cookie と localStorage の両方に残す）。デモと本番で別のキーにする
  const votedKey = () => (session.mode === 'live' ? 'bachi_voted' : 'bachi_demo_voted');
  window.VotedStore = {
    get() {
      const m = document.cookie.match(new RegExp('(?:^|; )' + votedKey() + '=([^;]*)'));
      if (m) return decodeURIComponent(m[1]);
      try { return localStorage.getItem(votedKey()); } catch (e) { return null; }
    },
    set(token) {
      document.cookie = votedKey() + '=' + encodeURIComponent(token) + '; max-age=' + 60 * 60 * 24 * 180 + '; SameSite=Lax';
      try { localStorage.setItem(votedKey(), token); } catch (e) { /* noop */ }
    },
  };

  // デモの投票と投票済みの記録を消す
  window.resetDemo = function () {
    try {
      localStorage.removeItem(MOCK_KEY);
      localStorage.removeItem('bachi_demo_voted');
    } catch (e) { /* noop */ }
    document.cookie = 'bachi_demo_voted=; max-age=0; SameSite=Lax';
  };

  // 2段タイトルの1段目を、2段目と同じ幅になる文字サイズにそろえる
  window.fitTitle = function (h1) {
    if (!h1) return;
    const t1 = h1.querySelector('.t1');
    const t2 = h1.querySelector('.t2');
    const fit = () => {
      t1.style.fontSize = '';
      // 左右の文字間隔ぶん（CSSで左にも同じだけ余白を付けて中央をそろえている）は見た目の幅に含めない
      const ink = el => el.getBoundingClientRect().width - 2 * (parseFloat(getComputedStyle(el).letterSpacing) || 0);
      const w1 = ink(t1);
      const w2 = ink(t2);
      if (w1 > 0 && w2 > 0) t1.style.fontSize = (parseFloat(getComputedStyle(t1).fontSize) * w2 / w1) + 'px';
    };
    fit();
    if (document.fonts) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);
  };

  window.imgSrc = id => 'img/' + String(id).padStart(2, '0') + '.jpg';
  window.ruby = (kanji, kana) => `<ruby>${kanji}<rt>${kana}</rt></ruby>`;
})();
