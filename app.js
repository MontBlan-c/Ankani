// ===== Ankani App =====

// --- State ---
let state = {
  decks: [],
  currentView: 'dashboard',
  currentDeckId: null,
  editingDeckId: null,
  selectedColor: '#00AAFF',
  quizMode: 'mcq',
  // Quiz state
  quiz: {
    cards: [],
    currentIndex: 0,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
  }
};

const LANG_NAMES = {
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
  hi: 'Hindi', ru: 'Russian', th: 'Thai', he: 'Hebrew', el: 'Greek',
};

// --- Persistence ---
function saveState() {
  localStorage.setItem('ankani_decks', JSON.stringify(state.decks));
}

function loadState() {
  try {
    const data = localStorage.getItem('ankani_decks');
    if (data) state.decks = JSON.parse(data);
  } catch (e) {
    console.error('Failed to load state:', e);
  }
}

// --- ID Generation ---
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Navigation ---
function navigate(view, data) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const navBtn = document.querySelector(`[data-nav="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  state.currentView = view;

  switch (view) {
    case 'dashboard':
      document.getElementById('view-dashboard').style.display = '';
      renderDashboard();
      break;
    case 'decks':
      document.getElementById('view-decks').style.display = '';
      renderDecks();
      break;
    case 'reviews':
      document.getElementById('view-reviews').style.display = '';
      renderReviews();
      break;
    case 'create':
      document.getElementById('view-create').style.display = '';
      initCreateForm(data);
      break;
    case 'deck-detail':
      document.getElementById('view-deck-detail').style.display = '';
      state.currentDeckId = data;
      renderDeckDetail();
      break;
    case 'quiz':
      document.getElementById('view-quiz').style.display = '';
      break;
  }
}

// --- Dashboard ---
function renderDashboard() {
  const totalCards = state.decks.reduce((s, d) => s + d.cards.length, 0);
  const dueCards = state.decks.reduce((s, d) => s + d.cards.filter(c => SRS.isDue(c)).length, 0);
  const learnedCards = state.decks.reduce((s, d) => s + d.cards.filter(c => c.srs.stage > 0).length, 0);
  const totalReviews = state.decks.reduce((s, d) => s + d.cards.reduce((cs, c) => cs + c.srs.totalReviews, 0), 0);
  const totalCorrect = state.decks.reduce((s, d) => s + d.cards.reduce((cs, c) => cs + c.srs.correctCount, 0), 0);
  const accuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;

  document.getElementById('stat-due').textContent = dueCards;
  document.getElementById('stat-learned').textContent = learnedCards;
  document.getElementById('stat-accuracy').textContent = accuracy + '%';
  document.getElementById('stat-total').textContent = totalCards;
  updateReviewBadge();

  // SRS stage piles
  renderSRSPiles();

  // Review schedule
  renderReviewSchedule();

  const container = document.getElementById('dashboard-decks');
  const emptyState = document.getElementById('empty-state');

  if (state.decks.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = state.decks.map(deck => renderDeckCard(deck)).join('');
}

function renderSRSPiles() {
  // Collect all cards across all decks, grouped by SRS category
  const piles = [
    { key: 'apprentice', label: 'Apprentice', stages: [1,2,3,4], cards: [] },
    { key: 'guru',       label: 'Guru',       stages: [5,6],     cards: [] },
    { key: 'master',     label: 'Master',     stages: [7],       cards: [] },
    { key: 'enlightened',label: 'Enlightened', stages: [8],       cards: [] },
    { key: 'burned',     label: 'Burned',     stages: [9],       cards: [] },
  ];

  state.decks.forEach(deck => {
    deck.cards.forEach(card => {
      const pile = piles.find(p => p.stages.includes(card.srs.stage));
      if (pile) {
        pile.cards.push({ card, deckName: deck.name, deckColor: deck.color, deckId: deck.id });
      }
    });
  });

  const container = document.getElementById('srs-piles');
  container.innerHTML = `
    <div class="srs-piles-row">
      ${piles.map(pile => `
        <div class="srs-pile srs-pile-${pile.key} ${pile.cards.length === 0 ? 'empty' : ''}" onclick="togglePile('${pile.key}')">
          <div class="srs-pile-count">${pile.cards.length}</div>
          <div class="srs-pile-label">${pile.label}</div>
        </div>
      `).join('')}
    </div>
    ${piles.map(pile => `
      <div class="srs-pile-cards" id="pile-${pile.key}" style="display:none">
        ${pile.cards.length === 0 ? '<div class="srs-pile-empty">No cards at this stage</div>' :
          pile.cards.map(({ card, deckName, deckColor, deckId }) => {
            const stageName = SRS.STAGE_NAMES[card.srs.stage] || 'New';
            const nextText = SRS.formatTimeUntil(card.srs.nextReview);
            return `
              <div class="srs-pile-card" onclick="state.currentDeckId='${deckId}'; showCardInfo('${card.id}')">
                <div class="srs-pile-card-color" style="background:${deckColor}"></div>
                <div class="srs-pile-card-front">${esc(card.front)}</div>
                <div class="srs-pile-card-back">${esc(card.back)}</div>
                <div class="srs-pile-card-meta">
                  <span class="srs-pile-card-deck">${esc(deckName)}</span>
                  <span class="srs-pile-card-next">${nextText}</span>
                </div>
              </div>
            `;
          }).join('')
        }
      </div>
    `).join('')}
  `;
}

function togglePile(key) {
  const el = document.getElementById('pile-' + key);
  const isOpen = el.style.display !== 'none';
  // Close all piles
  document.querySelectorAll('.srs-pile-cards').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.srs-pile').forEach(p => p.classList.remove('open'));
  // Open clicked one if it was closed
  if (!isOpen) {
    el.style.display = '';
    document.querySelector(`.srs-pile-${key}`).classList.add('open');
  }
}

function renderReviewSchedule() {
  const container = document.getElementById('review-schedule');

  // Gather all cards with nextReview timestamps
  const allCards = [];
  state.decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.srs.nextReview && card.srs.nextReview > Date.now()) {
        allCards.push({ card, deckName: deck.name, deckColor: deck.color });
      }
    });
  });

  if (allCards.length === 0) {
    container.innerHTML = '<div class="schedule-empty">No upcoming reviews scheduled.</div>';
    return;
  }

  // Sort by next review time
  allCards.sort((a, b) => a.card.srs.nextReview - b.card.srs.nextReview);

  // Build timeline buckets
  const now = Date.now();
  const buckets = [
    { label: 'Next Hour', max: now + 3600000, cards: [] },
    { label: 'Next 4 Hours', max: now + 4 * 3600000, cards: [] },
    { label: 'Today', max: getEndOfDay(now), cards: [] },
    { label: 'Tomorrow', max: getEndOfDay(now) + 86400000, cards: [] },
    { label: 'This Week', max: now + 7 * 86400000, cards: [] },
    { label: 'This Month', max: now + 30 * 86400000, cards: [] },
    { label: 'Later', max: Infinity, cards: [] },
  ];

  allCards.forEach(item => {
    const t = item.card.srs.nextReview;
    for (const bucket of buckets) {
      if (t <= bucket.max) {
        bucket.cards.push(item);
        break;
      }
    }
  });

  // Build upcoming timeline
  const timelineHtml = buckets
    .filter(b => b.cards.length > 0)
    .map(b => `
      <div class="schedule-bucket">
        <div class="schedule-bucket-header">
          <span class="schedule-bucket-label">${b.label}</span>
          <span class="schedule-bucket-count">${b.cards.length} card${b.cards.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="schedule-bucket-bar">
          <div class="schedule-bucket-fill" style="width:${Math.min(100, (b.cards.length / allCards.length) * 100)}%"></div>
        </div>
      </div>
    `).join('');

  // Build 14-day calendar grid
  const calendarDays = [];
  for (let d = 0; d < 14; d++) {
    const dayStart = getStartOfDay(now) + d * 86400000;
    const dayEnd = dayStart + 86400000;
    const count = allCards.filter(item =>
      item.card.srs.nextReview >= dayStart && item.card.srs.nextReview < dayEnd
    ).length;
    const date = new Date(dayStart);
    const dayLabel = d === 0 ? 'Today' : d === 1 ? 'Tmrw' : date.toLocaleDateString('en', { weekday: 'short' });
    const dateNum = date.getDate();
    calendarDays.push({ dayLabel, dateNum, count, isToday: d === 0 });
  }

  const maxCount = Math.max(...calendarDays.map(d => d.count), 1);

  const calendarHtml = calendarDays.map(day => {
    const intensity = day.count > 0 ? Math.max(0.2, day.count / maxCount) : 0;
    return `
      <div class="cal-day ${day.isToday ? 'cal-today' : ''} ${day.count === 0 ? 'cal-empty' : ''}">
        <div class="cal-day-label">${day.dayLabel}</div>
        <div class="cal-day-num">${day.dateNum}</div>
        <div class="cal-day-dot" style="opacity:${intensity}; transform:scale(${0.5 + intensity * 0.5})">${day.count || ''}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="schedule-timeline">${timelineHtml}</div>
    <div class="schedule-calendar">
      <div class="schedule-cal-label">14-Day Forecast</div>
      <div class="cal-grid">${calendarHtml}</div>
    </div>
  `;
}

function getStartOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function renderDeckCard(deck) {
  const due = deck.cards.filter(c => SRS.isDue(c)).length;
  const total = deck.cards.length;
  return `
    <div class="deck-card" onclick="navigate('deck-detail', '${deck.id}')">
      <div class="deck-card-accent" style="background: ${deck.color}"></div>
      <div class="deck-card-body">
        <div class="deck-card-name">${esc(deck.name)}${deck.language ? ` <span class="deck-lang-badge">${LANG_NAMES[deck.language] || deck.language}</span>` : ''}</div>
        <div class="deck-card-desc">${esc(deck.description || '')}</div>
        <div class="deck-card-footer">
          <div class="deck-card-stat due"><strong>${due}</strong> due</div>
          <div class="deck-card-stat"><strong>${total}</strong> cards</div>
        </div>
      </div>
    </div>
  `;
}

// --- Decks View ---
function renderDecks() {
  document.getElementById('decks-list').innerHTML = state.decks.map(deck => renderDeckCard(deck)).join('');
}

// --- Review Badge ---
function updateReviewBadge() {
  const dueCount = state.decks.reduce((s, d) => s + d.cards.filter(c => SRS.isDue(c)).length, 0);
  const badge = document.getElementById('nav-badge-reviews');
  if (dueCount > 0) {
    badge.textContent = dueCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// --- Reviews View ---
function renderReviews() {
  updateReviewBadge();
  const reviewsList = document.getElementById('reviews-list');
  const emptyState = document.getElementById('reviews-empty');
  const allBtn = document.getElementById('start-all-reviews-btn');

  // Gather all due cards across all decks
  let totalDue = 0;
  let html = '';

  state.decks.forEach(deck => {
    const dueCards = deck.cards.filter(c => SRS.isDue(c));
    if (dueCards.length === 0) return;
    totalDue += dueCards.length;

    html += `
      <div class="reviews-deck-group">
        <div class="reviews-deck-header">
          <div class="reviews-deck-color" style="background:${deck.color}"></div>
          <h3 class="reviews-deck-name">${esc(deck.name)}</h3>
          <span class="reviews-deck-count">${dueCards.length} due</span>
          <button class="btn btn-secondary btn-sm" onclick="startDeckReview('${deck.id}')">Review Deck</button>
        </div>
        <div class="card-list">
          ${dueCards.map(card => {
            const stageClass = SRS.getStageCategory(card.srs.stage);
            const stageName = SRS.STAGE_NAMES[card.srs.stage] || 'New';
            return `
              <div class="card-list-item" onclick="showReviewCardInfo('${deck.id}', '${card.id}')">
                <div class="card-list-srs ${stageClass}"></div>
                <div class="card-list-front">${esc(card.front)}</div>
                <div class="card-list-back">${esc(card.back)}</div>
                <div class="card-list-next">
                  <span class="srs-stage-badge ${SRS.STAGE_CLASSES[card.srs.stage] || 'new'}" style="font-size:0.65rem">${stageName}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  if (totalDue === 0) {
    emptyState.style.display = '';
    reviewsList.innerHTML = '';
    allBtn.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    reviewsList.innerHTML = html;
    allBtn.style.display = '';
    allBtn.textContent = `Review All Due (${totalDue})`;
  }
}

function startAllReviews() {
  // Gather all due cards across all decks
  const allDue = [];
  state.decks.forEach(deck => {
    deck.cards.filter(c => SRS.isDue(c)).forEach(card => {
      allDue.push({ card, deckId: deck.id });
    });
  });
  if (allDue.length === 0) return;

  const shuffled = allDue.sort(() => Math.random() - 0.5);

  const cards = shuffled.map(item => item.card);
  state.quiz = {
    deckId: null, // multi-deck review
    multiDeck: true,
    cardDeckMap: Object.fromEntries(shuffled.map(item => [item.card.id, item.deckId])),
    queue: [...cards],
    totalUnique: cards.length,
    completed: 0,
    currentCard: null,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
    returnTo: 'reviews',
  };

  navigate('quiz');
  showQuizCard();
}

function startDeckReview(deckId) {
  state.currentDeckId = deckId;
  startReview('reviews');
}

function showReviewCardInfo(deckId, cardId) {
  state.currentDeckId = deckId;
  showCardInfo(cardId);
}

function reviewSingleCard(deckId, cardId) {
  const deck = state.decks.find(d => d.id === deckId);
  if (!deck) return;
  const card = deck.cards.find(c => c.id === cardId);
  if (!card) return;

  closeModal();

  state.quiz = {
    deckId: deckId,
    queue: [card],
    totalUnique: 1,
    completed: 0,
    currentCard: null,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
    returnTo: state.currentView,
    practiceMode: true,
  };

  navigate('quiz');
  showQuizCard();
}

// --- Create/Edit Form ---
function initCreateForm(deckId) {
  state.editingDeckId = deckId || null;
  const isEdit = !!deckId;
  const deck = isEdit ? state.decks.find(d => d.id === deckId) : null;

  document.getElementById('create-title').textContent = isEdit ? 'Edit Deck' : 'Create New Deck';
  document.getElementById('save-deck-btn').textContent = isEdit ? 'Save Changes' : 'Save Deck';
  document.getElementById('deck-name').value = deck ? deck.name : '';
  document.getElementById('deck-desc').value = deck ? deck.description : '';

  // Color
  state.selectedColor = deck ? deck.color : '#00AAFF';
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === state.selectedColor);
  });

  // Quiz mode
  state.quizMode = deck ? deck.quizMode : 'mcq';
  document.querySelectorAll('.toggle-btn[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.quizMode);
  });

  // Language
  document.getElementById('deck-language').value = deck ? (deck.language || '') : '';

  // Cards
  const container = document.getElementById('card-rows');
  container.innerHTML = '';
  if (deck && deck.cards.length > 0) {
    deck.cards.forEach((card, i) => addCardRow(card.front, card.back, card.wrongAnswers || [], card.quizMode || 'deck'));
  } else {
    addCardRow();
    addCardRow();
    addCardRow();
  }

  // Bulk add reset
  document.getElementById('bulk-add-area').style.display = 'none';
  document.getElementById('bulk-textarea').value = '';
}

// Color picker
document.getElementById('color-picker').addEventListener('click', e => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  state.selectedColor = swatch.dataset.color;
});

function setQuizMode(mode) {
  state.quizMode = mode;
  document.querySelectorAll('.toggle-btn[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

function addCardRow(front = '', back = '', wrongAnswers = [], cardMode = 'deck') {
  const container = document.getElementById('card-rows');
  const num = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'card-row';
  row.innerHTML = `
    <span class="card-row-num">${num}</span>
    <div class="card-row-fields">
      <div class="card-row-main">
        <input type="text" class="card-front" placeholder="Front (question)" value="${esc(front)}">
        <input type="text" class="card-back" placeholder="Back (correct answer)" value="${esc(back)}">
        <button class="card-row-delete" onclick="this.closest('.card-row').remove(); renumberCards();">&times;</button>
      </div>
      <div class="card-row-options">
        <div class="card-mode-toggle">
          <button class="card-mode-btn ${cardMode === 'deck' ? 'active' : ''}" data-cardmode="deck" onclick="setCardMode(this)">Deck Default</button>
          <button class="card-mode-btn ${cardMode === 'mcq' ? 'active' : ''}" data-cardmode="mcq" onclick="setCardMode(this)">MCQ</button>
          <button class="card-mode-btn ${cardMode === 'free' ? 'active' : ''}" data-cardmode="free" onclick="setCardMode(this)">Free</button>
        </div>
        <div class="card-row-wrong" ${cardMode === 'free' ? 'style="display:none"' : ''}>
          <button class="btn-add-wrong" onclick="addWrongAnswer(this)" title="Add a wrong answer choice">+ Wrong Answer</button>
          <button class="btn-ai-generate" onclick="aiGenerateWrong(this)" title="Use AI to generate wrong answers">AI Generate</button>
          <div class="wrong-answers-list"></div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(row);
  // Add existing wrong answers
  const wrongList = row.querySelector('.wrong-answers-list');
  wrongAnswers.forEach(w => insertWrongInput(wrongList, w));
  if (!front) row.querySelector('.card-front').focus();
  row.querySelector('.card-back').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCardRow();
    }
  });
}

function setCardMode(btn) {
  const row = btn.closest('.card-row');
  row.querySelectorAll('.card-mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Hide/show wrong answers section based on mode
  const wrongSection = row.querySelector('.card-row-wrong');
  if (btn.dataset.cardmode === 'free') {
    wrongSection.style.display = 'none';
  } else {
    wrongSection.style.display = '';
  }
}

function addWrongAnswer(btn) {
  const wrongList = btn.closest('.card-row-wrong').querySelector('.wrong-answers-list');
  insertWrongInput(wrongList, '');
}

function insertWrongInput(container, value) {
  const div = document.createElement('div');
  div.className = 'wrong-answer-row';
  div.innerHTML = `
    <span class="wrong-label">Wrong:</span>
    <input type="text" class="card-wrong" placeholder="Wrong answer choice" value="${esc(value)}">
    <button class="card-row-delete" onclick="this.parentElement.remove();">&times;</button>
  `;
  container.appendChild(div);
  if (!value) div.querySelector('.card-wrong').focus();
}

function renumberCards() {
  document.querySelectorAll('.card-row .card-row-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

function toggleBulkAdd() {
  const area = document.getElementById('bulk-add-area');
  area.style.display = area.style.display === 'none' ? '' : 'none';
}

function parseBulkAdd() {
  const text = document.getElementById('bulk-textarea').value.trim();
  if (!text) return;
  const lines = text.split('\n').filter(l => l.trim());
  lines.forEach(line => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 3) {
      // front | correct | wrong1; wrong2; wrong3
      const wrongAnswers = parts.slice(2).join('|').split(';').map(s => s.trim()).filter(Boolean);
      addCardRow(parts[0], parts[1], wrongAnswers);
    } else if (parts.length >= 2) {
      addCardRow(parts[0], parts[1]);
    } else if (parts[0]) {
      addCardRow(parts[0], '');
    }
  });
  document.getElementById('bulk-textarea').value = '';
  document.getElementById('bulk-add-area').style.display = 'none';
}

function saveDeck() {
  const name = document.getElementById('deck-name').value.trim();
  if (!name) {
    document.getElementById('deck-name').focus();
    document.getElementById('deck-name').style.borderColor = 'var(--danger)';
    setTimeout(() => document.getElementById('deck-name').style.borderColor = '', 2000);
    return;
  }

  const description = document.getElementById('deck-desc').value.trim();
  const language = document.getElementById('deck-language').value;
  const rows = document.querySelectorAll('.card-row');
  const cards = [];
  rows.forEach(row => {
    const front = row.querySelector('.card-front').value.trim();
    const back = row.querySelector('.card-back').value.trim();
    const wrongInputs = row.querySelectorAll('.card-wrong');
    const wrongAnswers = Array.from(wrongInputs).map(i => i.value.trim()).filter(Boolean);
    const activeMode = row.querySelector('.card-mode-btn.active');
    const cardMode = activeMode ? activeMode.dataset.cardmode : 'deck';
    if (front && back) {
      cards.push({ front, back, wrongAnswers, quizMode: cardMode });
    }
  });

  if (state.editingDeckId) {
    // Edit existing
    const deck = state.decks.find(d => d.id === state.editingDeckId);
    if (deck) {
      deck.name = name;
      deck.description = description;
      deck.color = state.selectedColor;
      deck.quizMode = state.quizMode;
      deck.language = language;

      // Merge cards: keep existing SRS data for matching front/back, add new ones
      const existingMap = new Map(deck.cards.map(c => [c.front + '|||' + c.back, c]));
      deck.cards = cards.map(c => {
        const key = c.front + '|||' + c.back;
        if (existingMap.has(key)) {
          const existing = existingMap.get(key);
          existing.wrongAnswers = c.wrongAnswers || [];
          existing.quizMode = c.quizMode || 'deck';
          return existing;
        }
        return { id: genId(), front: c.front, back: c.back, wrongAnswers: c.wrongAnswers || [], quizMode: c.quizMode || 'deck', srs: SRS.newCardData() };
      });
    }
  } else {
    // Create new
    const deck = {
      id: genId(),
      name,
      description,
      color: state.selectedColor,
      quizMode: state.quizMode,
      language: language,
      cards: cards.map(c => ({
        id: genId(),
        front: c.front,
        back: c.back,
        wrongAnswers: c.wrongAnswers || [],
        quizMode: c.quizMode || 'deck',
        srs: SRS.newCardData(),
      })),
      createdAt: Date.now(),
    };
    state.decks.push(deck);
  }

  saveState();
  navigate('dashboard');
}

// --- Deck Detail ---
function renderDeckDetail() {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) { navigate('dashboard'); return; }

  document.getElementById('deck-detail-header').style.borderLeft = `4px solid ${deck.color}`;
  document.getElementById('detail-deck-name').textContent = deck.name;
  document.getElementById('detail-deck-desc').textContent = deck.description || '';

  const due = deck.cards.filter(c => SRS.isDue(c)).length;
  const newCards = deck.cards.filter(c => c.srs.stage === 0).length;
  document.getElementById('detail-due').textContent = due;
  document.getElementById('detail-new').textContent = newCards;
  document.getElementById('detail-total').textContent = deck.cards.length;

  const btn = document.getElementById('start-review-btn');
  if (due === 0 && deck.cards.length > 0) {
    btn.textContent = 'No Reviews Due';
    btn.disabled = true;
    btn.style.opacity = '0.5';
  } else if (deck.cards.length === 0) {
    btn.textContent = 'Add Cards First';
    btn.disabled = true;
    btn.style.opacity = '0.5';
  } else {
    btn.textContent = `Start Review (${due} card${due !== 1 ? 's' : ''})`;
    btn.disabled = false;
    btn.style.opacity = '1';
  }

  // Card list
  const list = document.getElementById('card-list');
  list.innerHTML = deck.cards.map(card => {
    const stageClass = SRS.getStageCategory(card.srs.stage);
    const nextText = SRS.formatTimeUntil(card.srs.nextReview);
    return `
      <div class="card-list-item" onclick="showCardInfo('${card.id}')">
        <div class="card-list-srs ${stageClass}"></div>
        <div class="card-list-front">${esc(card.front)}</div>
        <div class="card-list-back">${esc(card.back)}</div>
        <div class="card-list-next">${nextText}</div>
      </div>
    `;
  }).join('');
}

function editCurrentDeck() {
  navigate('create', state.currentDeckId);
}

function deleteCurrentDeck() {
  if (!confirm('Delete this deck and all its cards? This cannot be undone.')) return;
  state.decks = state.decks.filter(d => d.id !== state.currentDeckId);
  saveState();
  navigate('dashboard');
}

// --- Card Info Modal ---
function showCardInfo(cardId) {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) return;
  const card = deck.cards.find(c => c.id === cardId);
  if (!card) return;

  const stageName = SRS.STAGE_NAMES[card.srs.stage] || 'Unknown';
  const stageClass = SRS.STAGE_CLASSES[card.srs.stage] || 'new';
  const accuracy = card.srs.totalReviews > 0
    ? Math.round((card.srs.correctCount / card.srs.totalReviews) * 100)
    : 0;
  const nextReview = SRS.formatTimeUntil(card.srs.nextReview);
  const lastReview = card.srs.lastReview ? new Date(card.srs.lastReview).toLocaleDateString() : 'Never';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-row">
      <span class="modal-row-label">Front</span>
      <span class="modal-row-value">${esc(card.front)}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">Back</span>
      <span class="modal-row-value">${esc(card.back)}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">SRS Stage</span>
      <span class="srs-stage-badge ${stageClass}">${stageName}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">Next Review</span>
      <span class="modal-row-value">${nextReview}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">Last Review</span>
      <span class="modal-row-value">${lastReview}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">Total Reviews</span>
      <span class="modal-row-value">${card.srs.totalReviews}</span>
    </div>
    <div class="modal-row">
      <span class="modal-row-label">Accuracy</span>
      <span class="modal-row-value">${accuracy}%</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="reviewSingleCard('${deck.id}', '${card.id}')">Practice Now</button>
    </div>
  `;
  document.getElementById('card-modal').style.display = '';
}

function closeModal() {
  document.getElementById('card-modal').style.display = 'none';
}

// --- Quiz / Review ---
function startReview(returnTo) {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) return;

  const dueCards = deck.cards.filter(c => SRS.isDue(c));
  if (dueCards.length === 0) return;

  // Shuffle
  const shuffled = [...dueCards].sort(() => Math.random() - 0.5);

  state.quiz = {
    deckId: deck.id,
    queue: [...shuffled],       // mutable queue — cards get removed or re-added
    totalUnique: shuffled.length,
    completed: 0,               // unique cards answered correctly
    currentCard: null,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
    returnTo: returnTo || 'deck-detail',
  };

  navigate('quiz');
  showQuizCard();
}

function showQuizCard() {
  const q = state.quiz;
  if (q.queue.length === 0) {
    endReview();
    return;
  }

  // Pull the next card from the front of the queue
  q.currentCard = q.queue.shift();
  const card = q.currentCard;

  // For multi-deck reviews, look up which deck this card belongs to
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  const mode = getQuizModeForCard(card, deck);

  q.answered = false;

  // Update progress — completed out of total unique
  const pct = (q.completed / q.totalUnique) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-text').textContent = `${q.completed} / ${q.totalUnique}`;

  // Remaining indicator
  const remaining = q.queue.length + 1; // +1 for current card
  document.getElementById('quiz-remaining').textContent = `${remaining} remaining`;

  // Set question
  document.getElementById('quiz-question').textContent = card.front;
  document.getElementById('quiz-card').style.borderTopColor = deck ? deck.color : 'var(--accent)';

  // Show/hide areas
  document.getElementById('result-area').style.display = 'none';

  if (mode === 'mcq') {
    document.getElementById('mcq-area').style.display = '';
    document.getElementById('free-area').style.display = 'none';
    document.getElementById('quiz-card-type').textContent = 'Multiple Choice';
    renderMCQOptions(card, deck);
  } else {
    document.getElementById('mcq-area').style.display = 'none';
    document.getElementById('free-area').style.display = '';
    const isAI = getGradingMode() === 'ai' && getApiKey();
    let typeLabel = isAI ? 'Type Your Answer (AI Graded)' : 'Type Your Answer';
    const input = document.getElementById('free-input');
    input.value = '';
    input.className = 'free-input';
    input.disabled = false;

    // Unbind any previous kana converter
    RomajiToKana.unbind(input);

    // Set language for IME input
    const deckLang = deck ? (deck.language || '') : '';
    if (deckLang) {
      input.setAttribute('lang', deckLang);
      input.placeholder = `Type your answer in ${LANG_NAMES[deckLang] || deckLang}...`;
      typeLabel += ` — ${LANG_NAMES[deckLang] || deckLang}`;

      // For Japanese, auto-convert romaji → kana as you type
      if (deckLang === 'ja') {
        RomajiToKana.setMode('hiragana');
        RomajiToKana.bind(input);
        // Show kana toggle
        document.getElementById('kana-toggle').style.display = '';
        document.querySelectorAll('.kana-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.kana === 'hiragana');
        });
      } else {
        document.getElementById('kana-toggle').style.display = 'none';
      }
    } else {
      input.removeAttribute('lang');
      input.placeholder = 'Type your answer...';
      document.getElementById('kana-toggle').style.display = 'none';
    }

    document.getElementById('quiz-card-type').textContent = typeLabel;
    const checkBtn = document.getElementById('check-answer-btn');
    checkBtn.style.display = '';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = false;
    input.focus();
  }
}

function setKanaMode(mode) {
  RomajiToKana.setMode(mode);
  document.querySelectorAll('.kana-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.kana === mode);
  });
  // Re-convert existing input content
  const input = document.getElementById('free-input');
  if (input.value) {
    // Convert current hiragana ↔ katakana
    if (mode === 'katakana') {
      input.value = RomajiToKana.toKatakana(input.value);
    } else {
      // Katakana to hiragana
      input.value = input.value.replace(/[\u30A1-\u30F6]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
      );
    }
  }
  input.focus();
}

function getQuizModeForCard(card, deck) {
  // Card-level override takes priority
  if (card.quizMode && card.quizMode !== 'deck') {
    return card.quizMode;
  }
  // Fall back to deck default
  if (!deck) return 'mcq';
  if (deck.quizMode === 'both') return Math.random() > 0.5 ? 'mcq' : 'free';
  return deck.quizMode;
}

function renderMCQOptions(card, deck) {
  const container = document.getElementById('mcq-options');

  let wrongChoices = [];

  // Use user-provided wrong answers first
  if (card.wrongAnswers && card.wrongAnswers.length > 0) {
    wrongChoices = [...card.wrongAnswers];
  }

  // If we still need more wrong answers (want 3 total), pull from other cards in deck
  if (wrongChoices.length < 3) {
    const otherAnswers = deck.cards
      .filter(c => c.id !== card.id && !wrongChoices.includes(c.back) && c.back !== card.back)
      .map(c => c.back)
      .sort(() => Math.random() - 0.5);
    wrongChoices.push(...otherAnswers.slice(0, 3 - wrongChoices.length));
  }

  // Build options array with correct answer
  const options = [
    { text: card.back, correct: true },
    ...wrongChoices.map(t => ({ text: t, correct: false }))
  ].sort(() => Math.random() - 0.5);

  container.innerHTML = options.map((opt, i) => `
    <button class="mcq-option" data-correct="${opt.correct}" data-index="${i}" onclick="selectMCQ(this)">
      ${esc(opt.text)}
    </button>
  `).join('');
}

function selectMCQ(btn) {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const correct = btn.dataset.correct === 'true';
  state.quiz.wasCorrect = correct;
  state.quiz.totalAnswered++;
  if (correct) state.quiz.totalCorrect++;

  // Highlight all buttons
  document.querySelectorAll('.mcq-option').forEach(b => {
    b.classList.add('disabled');
    if (b.dataset.correct === 'true') b.classList.add('correct');
  });
  if (!correct) btn.classList.add('wrong');

  showResult(correct);
}

async function checkFreeAnswer() {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const card = state.quiz.currentCard;
  const input = document.getElementById('free-input');
  const btn = document.getElementById('check-answer-btn');
  const userAnswer = input.value.trim();
  const correctAnswer = card.back.trim();

  const gradingMode = getGradingMode();
  const apiKey = getApiKey();
  const q = state.quiz;
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  const deckLang = deck ? (deck.language || '') : '';

  let correct;

  if (gradingMode === 'ai' && apiKey) {
    // AI grading
    btn.textContent = 'Grading...';
    btn.disabled = true;
    input.disabled = true;

    try {
      correct = await aiGradeFreeResponse(card.front, correctAnswer, userAnswer, apiKey, deckLang);
    } catch (err) {
      console.error('AI grading failed, falling back to exact match:', err);
      // Fallback to exact match
      const ua = userAnswer.toLowerCase();
      const ca = correctAnswer.toLowerCase();
      correct = ua === ca || levenshtein(ua, ca) <= Math.max(1, Math.floor(ca.length * 0.2));
    }
  } else {
    // Exact match with fuzzy tolerance
    const ua = userAnswer.toLowerCase();
    const ca = correctAnswer.toLowerCase();
    correct = ua === ca || levenshtein(ua, ca) <= Math.max(1, Math.floor(ca.length * 0.2));
  }

  state.quiz.wasCorrect = correct;
  state.quiz.totalAnswered++;
  if (correct) state.quiz.totalCorrect++;

  input.disabled = true;
  input.classList.add(correct ? 'correct' : 'wrong');
  btn.style.display = 'none';

  showResult(correct);
}

async function aiGradeFreeResponse(question, correctAnswer, userAnswer, apiKey, deckLang) {
  let langContext = '';
  if (deckLang === 'ja') {
    langContext = `\n\nThis is a Japanese language quiz. The student is typing in hiragana. If the correct answer is in kanji, accept the hiragana reading as correct. For example if the correct answer is 草 (くさ), accept くさ. If the correct answer is 水 (みず), accept みず. Also accept katakana equivalents and romanized answers (romaji) if they match. Be lenient.`;
  } else if (deckLang) {
    langContext = `\n\nThis is a ${LANG_NAMES[deckLang] || deckLang} language quiz. Accept answers in any valid script for that language. Also accept romanized/transliterated answers if they match the correct pronunciation. Be lenient with diacritics and tone marks.`;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `You are grading a quiz answer. Is the student's answer correct?

Question: ${question}
Correct answer: ${correctAnswer}
Student's answer: ${userAnswer}

The student's answer doesn't need to match word-for-word. Accept answers that are essentially correct in meaning, even if abbreviated, rephrased, or using synonyms. Be lenient with minor spelling errors. But reject answers that are wrong, incomplete in a meaningful way, or show a misunderstanding.${langContext}

Reply with ONLY "CORRECT" or "INCORRECT", nothing else.`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const data = await response.json();
  const verdict = data.content[0].text.trim().toUpperCase();
  return verdict.includes('CORRECT') && !verdict.includes('INCORRECT');
}

function showResult(correct) {
  const q = state.quiz;
  const card = q.currentCard;
  const resultArea = document.getElementById('result-area');
  const resultMsg = document.getElementById('result-message');
  const correctDisplay = document.getElementById('correct-answer-display');

  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  let stageName = '', stageClass = '', nextTime = '';

  if (q.practiceMode) {
    // Practice mode — no SRS changes, just show result
    if (deck) {
      const actualCard = deck.cards.find(c => c.id === card.id);
      if (actualCard) {
        stageName = SRS.STAGE_NAMES[actualCard.srs.stage] || 'New';
        stageClass = SRS.STAGE_CLASSES[actualCard.srs.stage] || 'new';
        nextTime = SRS.formatTimeUntil(actualCard.srs.nextReview);
      }
    }
  } else {
    // Real review — update SRS
    const grade = correct ? 2 : 0;
    if (deck) {
      const actualCard = deck.cards.find(c => c.id === card.id);
      if (actualCard) {
        SRS.reviewCard(actualCard, grade);
        stageName = SRS.STAGE_NAMES[actualCard.srs.stage] || 'New';
        stageClass = SRS.STAGE_CLASSES[actualCard.srs.stage] || 'new';
        nextTime = SRS.formatTimeUntil(actualCard.srs.nextReview);
      }
    }
  }

  if (correct) {
    q.completed++;
    resultMsg.textContent = 'Correct!';
    resultMsg.className = 'result-message correct';
    correctDisplay.textContent = '';
    document.getElementById('srs-info').innerHTML = q.practiceMode
      ? `<span class="srs-stage-badge ${stageClass}">${stageName}</span>
         <span class="srs-next-review">Practice — no SRS change</span>`
      : `<span class="srs-stage-badge ${stageClass}">${stageName}</span>
         <span class="srs-next-review">Next review: ${nextTime}</span>`;
  } else {
    const reinsertPos = Math.min(q.queue.length, Math.floor(Math.random() * 4) + 2);
    q.queue.splice(reinsertPos, 0, card);

    resultMsg.textContent = 'Incorrect';
    resultMsg.className = 'result-message wrong';
    correctDisplay.textContent = `Correct answer: ${card.back}`;
    document.getElementById('srs-info').innerHTML = q.practiceMode
      ? `<span class="srs-stage-badge ${stageClass}">${stageName}</span>
         <span class="srs-next-review">Practice — no SRS change</span>`
      : `<span class="srs-stage-badge ${stageClass}">${stageName}</span>
         <span class="srs-next-review">This card will appear again this session</span>`;
  }

  if (!q.practiceMode) {
    saveState();
    updateReviewBadge();
  }

  // Update progress bar
  const pct = (q.completed / q.totalUnique) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-text').textContent = `${q.completed} / ${q.totalUnique}`;

  resultArea.style.display = '';
}

function nextCard() {
  showQuizCard();
}

function endReview() {
  // Unbind kana converter on exit
  RomajiToKana.unbind(document.getElementById('free-input'));

  const q = state.quiz;
  // Show summary if anything was reviewed
  if (q.totalAnswered > 0) {
    const accuracy = Math.round((q.totalCorrect / q.totalAnswered) * 100);
    alert(`Review complete!\n\nCards reviewed: ${q.totalAnswered}\nCorrect: ${q.totalCorrect}\nAccuracy: ${accuracy}%`);
  }
  updateReviewBadge();
  const returnTo = q.returnTo || 'deck-detail';
  if (returnTo === 'reviews') {
    navigate('reviews');
  } else if (returnTo === 'deck-detail') {
    navigate('deck-detail', q.deckId || state.currentDeckId);
  } else {
    navigate(returnTo, q.deckId || state.currentDeckId);
  }
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', e => {
  if (state.currentView !== 'quiz') {
    if (e.key === 'Escape') closeModal();
    return;
  }

  if (state.quiz.answered) {
    // After answering, Enter or Space goes to next card
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextCard();
    }
  } else if (e.key === 'Enter') {
    // Before answering, Enter submits free answer
    const freeArea = document.getElementById('free-area');
    if (freeArea.style.display !== 'none') {
      checkFreeAnswer();
    }
  }

  if (e.key === 'Escape') closeModal();
});

// --- Utility ---
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i-1] === b[j-1]
        ? d[i-1][j-1]
        : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
    }
  }
  return d[m][n];
}

// --- Settings ---
function getApiKey() {
  return localStorage.getItem('ankani_api_key') || '';
}

function openSettings() {
  document.getElementById('api-key-input').value = getApiKey();
  const mode = getGradingMode();
  document.querySelectorAll('.toggle-btn[data-grading]').forEach(b => {
    b.classList.toggle('active', b.dataset.grading === mode);
  });
  document.getElementById('settings-modal').style.display = '';
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function getGradingMode() {
  return localStorage.getItem('ankani_grading_mode') || 'exact';
}

function setGradingMode(mode) {
  localStorage.setItem('ankani_grading_mode', mode);
  document.querySelectorAll('.toggle-btn[data-grading]').forEach(b => {
    b.classList.toggle('active', b.dataset.grading === mode);
  });
}

function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    localStorage.setItem('ankani_api_key', key);
  } else {
    localStorage.removeItem('ankani_api_key');
  }
  closeSettings();
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  const btn = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

// --- AI Wrong Answer Generation ---
async function aiGenerateWrong(btn) {
  const apiKey = getApiKey();
  if (!apiKey) {
    openSettings();
    return;
  }

  const row = btn.closest('.card-row');
  const front = row.querySelector('.card-front').value.trim();
  const back = row.querySelector('.card-back').value.trim();

  if (!front || !back) {
    // Flash the empty fields
    if (!front) row.querySelector('.card-front').style.borderColor = 'var(--danger)';
    if (!back) row.querySelector('.card-back').style.borderColor = 'var(--danger)';
    setTimeout(() => {
      row.querySelector('.card-front').style.borderColor = '';
      row.querySelector('.card-back').style.borderColor = '';
    }, 2000);
    return;
  }

  // Show loading state
  const originalText = btn.textContent;
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Generate exactly 3 plausible but incorrect answers for this quiz card. They should be believable wrong answers that a student might confuse with the correct one.

Question: ${front}
Correct answer: ${back}

Reply with ONLY 3 wrong answers, one per line, nothing else. No numbering, no bullets, no explanation.`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const wrongAnswers = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);

    // Add them to the card row
    const wrongList = row.querySelector('.wrong-answers-list');
    wrongAnswers.forEach(w => insertWrongInput(wrongList, w));

  } catch (err) {
    console.error('AI generation failed:', err);
    alert('AI generation failed: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// --- AI Generate Cards from Text ---
function toggleAIGenerate() {
  const area = document.getElementById('ai-generate-area');
  area.style.display = area.style.display === 'none' ? '' : 'none';
}

async function aiGenerateCards() {
  const apiKey = getApiKey();
  if (!apiKey) {
    openSettings();
    return;
  }

  const sourceText = document.getElementById('ai-source-text').value.trim();
  const subject = document.getElementById('ai-subject').value.trim();

  if (!sourceText && !subject) {
    document.getElementById('ai-subject').style.borderColor = 'var(--danger)';
    document.getElementById('ai-source-text').style.borderColor = 'var(--danger)';
    setTimeout(() => {
      document.getElementById('ai-subject').style.borderColor = '';
      document.getElementById('ai-source-text').style.borderColor = '';
    }, 2000);
    return;
  }

  const cardCount = document.getElementById('ai-card-count').value;
  const questionType = document.getElementById('ai-question-type').value;
  const cardMode = document.getElementById('ai-card-mode').value;
  const includeWrong = cardMode === 'mcq' || cardMode === 'both';

  const btn = document.getElementById('ai-gen-btn');
  btn.innerHTML = '<span class="ai-sparkle">&#10024;</span> Generating...';
  btn.disabled = true;

  try {
    // Build question type instruction
    const deckLang = document.getElementById('deck-language').value;
    const langName = LANG_NAMES[deckLang] || '';

    let vocabInstruction = '';
    if (questionType === 'vocabulary' && langName) {
      vocabInstruction = `Make all questions vocabulary questions in the WaniKani style.

CRITICAL FORMAT RULES:
- The question MUST be: "What is [ENGLISH WORD] in ${langName}?" — you MUST include the actual English word in the question. For example: "What is armor in ${langName}?" or "What is water in ${langName}?"
- The answer MUST be a SINGLE word or short phrase in ${langName} native script (e.g., hiragana/katakana for Japanese, hangul for Korean, characters for Chinese).
- NEVER write "What is" without the English word. The English word is the whole point of the question.
- Keep answers to one word whenever possible.`;
    } else if (questionType === 'vocabulary') {
      vocabInstruction = `Make all questions vocabulary questions. The question MUST include the English word being asked about. Format: "What is [ENGLISH WORD] in [language]?" — for example "What is cat in Spanish?". The answer is a single word in the target language. NEVER omit the English word from the question.`;
    }

    const typeInstructions = {
      mixed: 'Use a mix of question types: definitions, factual recall, conceptual understanding, and fill-in-the-blank.',
      vocabulary: vocabInstruction,
      definition: 'Make all questions ask for definitions. Format: "What is [term]?" with the definition as the answer.',
      factual: 'Make all questions factual recall. Ask about specific facts, dates, names, numbers, or events.',
      conceptual: 'Make all questions test conceptual understanding. Ask "why", "how", or "explain" questions with concise answers.',
      'fill-blank': 'Make all questions fill-in-the-blank. Format: "_____ is the process by which..." with the missing word/phrase as the answer.',
      'true-false': 'Make all questions true or false statements. The question is a statement, the answer is either "True" or "False".',
    }[questionType] || '';

    const wrongInstructions = includeWrong
      ? `For each card, also generate 3 plausible but incorrect wrong answers.
Use this exact format per card:
Q: [question]
A: [correct answer]
W: [wrong1] | [wrong2] | [wrong3]`
      : `Use this exact format per card:
Q: [question]
A: [correct answer]`;

    // Build source context
    let sourceContext = '';
    if (sourceText && subject) {
      sourceContext = `Subject: ${subject}\n\nSource material:\n---\n${sourceText}\n---`;
    } else if (sourceText) {
      sourceContext = `Source material:\n---\n${sourceText}\n---`;
    } else {
      sourceContext = `Subject: ${subject}\n\nGenerate cards from your knowledge of this subject. Cover the most important and commonly tested concepts.`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: questionType === 'vocabulary'
            ? buildVocabPrompt(cardCount, includeWrong, langName, sourceContext)
            : `Generate exactly ${cardCount} quiz/flashcard cards. Extract the most important facts, concepts, definitions, and relationships.

${typeInstructions}

${wrongInstructions}

IMPORTANT: Output ONLY the cards in the exact format above. No numbering, no extra text, no explanations.

${sourceContext}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Parse the response
    const cards = parseAICards(text, includeWrong);

    if (cards.length === 0) {
      throw new Error('Could not parse any cards from AI response');
    }

    // Determine card mode to set per card
    const perCardMode = cardMode === 'both' ? 'deck' : cardMode;

    // Add cards to the form
    cards.forEach(card => {
      addCardRow(card.front, card.back, card.wrongAnswers || [], perCardMode);
    });

    // Clear and close
    document.getElementById('ai-source-text').value = '';
    document.getElementById('ai-generate-area').style.display = 'none';

  } catch (err) {
    console.error('AI card generation failed:', err);
    alert('AI generation failed: ' + err.message);
  } finally {
    btn.innerHTML = '<span class="ai-sparkle">&#10024;</span> Generate Cards';
    btn.disabled = false;
  }
}

function buildVocabPrompt(cardCount, includeWrong, langName, sourceContext) {
  const lang = langName || 'the target language';
  const wrongPart = includeWrong
    ? `\nW: [wrong answer 1 in ${lang}] | [wrong answer 2 in ${lang}] | [wrong answer 3 in ${lang}]`
    : '';
  const exampleWrong = includeWrong ? '\nW: みず | くうき | ひ' : '';

  const isJapanese = lang.toLowerCase().includes('japanese');
  const scriptRule = isJapanese
    ? `3. Answers MUST be in hiragana ONLY. NEVER use kanji. NEVER use katakana unless it is a loanword. For example: 草 is WRONG, くさ is CORRECT. 水 is WRONG, みず is CORRECT. コンピュータ is OK for "computer" because it is a loanword.`
    : `3. Each answer MUST be a single word or short phrase in ${lang} native script`;

  return `Generate exactly ${cardCount} vocabulary flashcards for studying ${lang}.

RULES:
1. Each question MUST be in English asking for a ${lang} word
2. Each question MUST contain the English word being asked about
${scriptRule}
4. Keep answers to ONE word whenever possible

FORMAT (follow EXACTLY):
Q: What is fire in ${lang}?
A: ほのお${exampleWrong}

Q: What is water in ${lang}?
A: みず${includeWrong ? '\nW: かぜ | つち | ほのお' : ''}

Now generate ${cardCount} cards using this exact format:
Q: What is [ENGLISH WORD] in ${lang}?
A: [single ${lang} word${isJapanese ? ' in hiragana, NO kanji' : ''}]${wrongPart}

${sourceContext ? sourceContext + '\n\nUse vocabulary from the source material above.' : `Use common, useful ${lang} vocabulary words.`}

Output ONLY the cards. No numbering, no explanations.`;
}

function parseAICards(text, includeWrong) {
  const cards = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentCard = null;

  for (const line of lines) {
    if (line.startsWith('Q:') || line.startsWith('Q :')) {
      // Start a new card
      if (currentCard && currentCard.front && currentCard.back) {
        cards.push(currentCard);
      }
      currentCard = { front: line.replace(/^Q\s*:\s*/, '').trim(), back: '', wrongAnswers: [] };
    } else if (line.startsWith('A:') || line.startsWith('A :')) {
      if (currentCard) {
        currentCard.back = line.replace(/^A\s*:\s*/, '').trim();
      }
    } else if (line.startsWith('W:') || line.startsWith('W :')) {
      if (currentCard) {
        currentCard.wrongAnswers = line.replace(/^W\s*:\s*/, '').split('|').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  // Don't forget the last card
  if (currentCard && currentCard.front && currentCard.back) {
    cards.push(currentCard);
  }

  return cards;
}

// --- Init ---
loadState();
updateReviewBadge();
navigate('dashboard');
