(function () {
  const cfg = window.VOTE_CONFIG;
  const $ = id => document.getElementById(id);
  const RANK_LABELS = ['1位', '2位', '3位'];
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';

  const state = { picks: [], closed: false, deadline: null };

  document.title = cfg.title;
  $('title').textContent = cfg.title;
  if (VoteApi.isMock) $('mockNote').hidden = false;

  function show(id) {
    ['loading', 'voteView', 'resultView', 'messageView'].forEach(s => { $(s).hidden = s !== id; });
    $('tray').hidden = id !== 'voteView';
  }

  function fmtDeadline(d) {
    const w = '日月火水木金土'[d.getDay()];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日(${w}) ${hh}:${mm}`;
  }

  // 表示順は人ごとにランダム（位置による偏りを防ぐ）。同じ端末では毎回同じ順
  function itemOrder() {
    let seed;
    try { seed = Number(localStorage.getItem('bachi_seed')); } catch (e) { /* noop */ }
    if (!seed) {
      seed = Math.floor(Math.random() * 2 ** 31) + 1;
      try { localStorage.setItem('bachi_seed', String(seed)); } catch (e) { /* noop */ }
    }
    const ids = Array.from({ length: cfg.itemCount }, (_, i) => i + 1);
    for (let i = ids.length - 1; i > 0; i--) {
      seed = (seed * 48271) % 2147483647;
      const j = seed % (i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  // ---------- 投票画面 ----------
  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    itemOrder().forEach(id => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `No.${id} を選ぶ`);
      card.innerHTML = `
        <div class="ph"><img src="${imgSrc(id)}" alt="No.${id}" loading="lazy"></div>
        <span class="no">No.${id}</span>
        <button class="zoom" type="button" aria-label="No.${id} を拡大">${ZOOM_ICON}</button>`;
      card.addEventListener('click', e => {
        if (e.target.closest('.zoom')) return openLightbox(id);
        toggle(id);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); }
      });
      grid.appendChild(card);
    });
    renderPicks();
  }

  function toggle(id) {
    const i = state.picks.indexOf(id);
    if (i >= 0) state.picks.splice(i, 1);
    else if (state.picks.length < 3) state.picks.push(id);
    else return flashTray();
    renderPicks();
  }

  function flashTray() {
    const s = $('slots');
    s.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 });
  }

  function renderPicks() {
    document.querySelectorAll('.card').forEach(card => {
      const id = Number(card.dataset.id);
      const i = state.picks.indexOf(id);
      card.classList.toggle('selected', i >= 0);
      card.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      let badge = card.querySelector('.badge');
      if (i >= 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; card.appendChild(badge); }
        badge.textContent = RANK_LABELS[i];
      } else if (badge) badge.remove();
    });

    const slots = $('slots');
    slots.innerHTML = '';
    RANK_LABELS.forEach((label, i) => {
      const id = state.picks[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot' + (id ? ' filled' : '');
      b.innerHTML = `<span class="lbl">${label}</span>` + (id ? `<img src="${imgSrc(id)}" alt="${label}: No.${id}">` : '未選択');
      if (id) {
        b.setAttribute('aria-label', `${label}のNo.${id}を取り消す`);
        b.addEventListener('click', () => toggle(id));
      }
      slots.appendChild(b);
    });
    updateSubmit();
  }

  function updateSubmit() {
    $('submit').disabled = !($('name').value.trim() && state.picks.length === 3);
    $('submit').textContent = state.picks.length === 3 && !$('name').value.trim() ? '名前を入力' : '送信';
  }

  function openLightbox(id) {
    $('lbImg').src = imgSrc(id);
    $('lbImg').alt = `No.${id}`;
    $('lightbox').showModal();
  }

  function openConfirm() {
    $('confirmName').textContent = $('name').value.trim();
    $('confirmList').innerHTML = state.picks.map((id, i) =>
      `<figure><div class="ph"><img src="${imgSrc(id)}" alt="No.${id}"></div><figcaption>${RANK_LABELS[i]}</figcaption></figure>`).join('');
    $('confirmError').hidden = true;
    $('sendBtn').disabled = false;
    $('sendBtn').textContent = '投票する';
    $('confirmDlg').showModal();
  }

  const ERRORS = {
    already_voted: 'このお名前ではすでに投票済みです。',
    closed: '締切を過ぎたため投票できません。',
    bad_name: 'お名前を30文字以内で入力してください。',
    bad_ranks: '3つの衣装を選び直してください。',
  };

  async function send() {
    $('sendBtn').disabled = true;
    $('sendBtn').textContent = '送信中…';
    try {
      const res = await VoteApi.vote($('name').value.trim(), state.picks.slice());
      if (!res.ok) throw new Error(ERRORS[res.error] || '送信に失敗しました。時間をおいてもう一度お試しください。');
      VotedStore.set(res.token);
      $('confirmDlg').close();
      window.scrollTo(0, 0);
      await loadResults(res.token, true);
    } catch (err) {
      $('confirmError').textContent = err.message || '通信エラーが発生しました。電波の良い場所でもう一度お試しください。';
      $('confirmError').hidden = false;
      $('sendBtn').disabled = false;
      $('sendBtn').textContent = '投票する';
    }
  }

  // ---------- 結果画面 ----------
  async function loadResults(token, justVoted) {
    show('loading');
    const res = await VoteApi.results(token);
    if (!res.ok) {
      showMessage('結果はまだ公開されていません', `結果は締切（${fmtDeadline(state.deadline)}）のあとに公開されます。`);
      return;
    }
    $('thanks').hidden = !justVoted && !token;
    $('thanksMsg').textContent = res.closed
      ? '投票は締め切られました。最終結果は以下のとおりです。'
      : `締切（${fmtDeadline(new Date(res.deadline))}）までは途中経過です。結果は変わることがあります。`;
    $('resultTitle').textContent = res.closed ? '最終結果' : '途中経過';
    $('resultStatus').textContent = `投票数 ${res.voters}人`;
    $('printLink').href = 'print.html' + (token ? '?t=' + encodeURIComponent(token) : '');

    const max = Math.max(1, ...res.items.map(it => it.points));
    $('rankList').innerHTML = res.items.map(it => `
      <div class="row ${it.rank <= 3 ? 'top' + it.rank : ''}">
        <div class="r">${it.rank}<small style="font-size:12px">位</small></div>
        <div class="ph"><img src="${imgSrc(it.id)}" alt="No.${it.id}" loading="lazy"></div>
        <div>
          <div class="pts">${it.points}<small>点</small></div>
          <div class="cnt">1位 ${it.counts[0]}票・2位 ${it.counts[1]}票・3位 ${it.counts[2]}票</div>
          <div class="bar"><span style="width:${(it.points / max) * 100}%"></span></div>
          <div class="no">No.${it.id}</div>
        </div>
      </div>`).join('');
    show('resultView');
  }

  function showMessage(title, body) {
    $('msgTitle').textContent = title;
    $('msgBody').textContent = body;
    show('messageView');
  }

  // ---------- 起動 ----------
  async function init() {
    let conf;
    try {
      conf = await VoteApi.config();
    } catch (e) {
      showMessage('読み込みに失敗しました', '通信状態を確認して、ページを再読み込みしてください。');
      return;
    }
    state.deadline = new Date(conf.deadline);
    state.closed = conf.closed;
    $('deadline').textContent = (conf.closed ? '締切済み：' : '締切：') + fmtDeadline(state.deadline);

    const token = VotedStore.get();
    if (token) return loadResults(token, false);
    if (conf.closed) return loadResults(null, false);

    buildGrid();
    show('voteView');
  }

  $('name').addEventListener('input', updateSubmit);
  $('submit').addEventListener('click', openConfirm);
  $('cancelBtn').addEventListener('click', () => $('confirmDlg').close());
  $('sendBtn').addEventListener('click', send);
  $('lbClose').addEventListener('click', () => $('lightbox').close());
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });

  init();
})();
