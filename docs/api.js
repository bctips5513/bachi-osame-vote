// 集計APIとのやりとり。デモモードではブラウザ内にだけ保存する
(function () {
  const cfg = window.VOTE_CONFIG;
  const POINTS = [3, 2, 1];

  async function get(params) {
    const url = cfg.apiUrl + '?' + new URLSearchParams(params).toString();
    const res = await fetch(url);
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

  // ---- デモモード ----
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
  function mockDeadline() {
    return new Date('2026-10-15T23:59:00+09:00');
  }
  function normalize(name) {
    return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
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
    async config() {
      const d = mockDeadline();
      return { ok: true, deadline: d.toISOString(), closed: Date.now() > d.getTime() };
    },
    async vote(name, ranks) {
      const db = mockDb();
      const key = normalize(name);
      if (db.voters[key]) return { ok: false, error: 'already_voted' };
      const token = 'mock-' + Math.random().toString(36).slice(2);
      db.voters[key] = token;
      db.votes.push(ranks);
      mockSave(db);
      return { ok: true, token };
    },
    async results(token) {
      const db = mockDb();
      const closed = Date.now() > mockDeadline().getTime();
      if (!closed && !Object.values(db.voters).includes(token)) return { ok: false, error: 'not_yet' };
      return { ok: true, closed, deadline: mockDeadline().toISOString(), voters: db.votes.length, items: tally(db.votes) };
    },
  };

  const live = {
    config: () => get({ action: 'config' }),
    vote: (name, ranks) => post({ action: 'vote', name, ranks }),
    results: token => get({ action: 'results', token: token || '' }),
  };

  const isDemo = cfg.demo || !cfg.apiUrl;
  window.VoteApi = isDemo ? mock : live;
  window.VoteApi.isMock = isDemo;

  // 投票済みの記録（Cookie と localStorage の両方に残す）。デモと本番で別のキーにする
  const VOTED_KEY = isDemo ? 'bachi_demo_voted' : 'bachi_voted';

  // デモの投票と投票済みの記録を消す
  window.resetDemo = function () {
    try {
      localStorage.removeItem(MOCK_KEY);
      localStorage.removeItem(VOTED_KEY);
    } catch (e) { /* noop */ }
    document.cookie = VOTED_KEY + '=; max-age=0; SameSite=Lax';
  };
  window.VotedStore = {
    get() {
      const m = document.cookie.match(new RegExp('(?:^|; )' + VOTED_KEY + '=([^;]*)'));
      if (m) return decodeURIComponent(m[1]);
      try { return localStorage.getItem(VOTED_KEY); } catch (e) { return null; }
    },
    set(token) {
      document.cookie = VOTED_KEY + '=' + encodeURIComponent(token) + '; max-age=' + 60 * 60 * 24 * 180 + '; SameSite=Lax';
      try { localStorage.setItem(VOTED_KEY, token); } catch (e) { /* noop */ }
    },
  };

  window.imgSrc = id => 'img/' + String(id).padStart(2, '0') + '.jpg';
})();
