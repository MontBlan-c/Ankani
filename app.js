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
            const nextText = card.srs.stage >= 9 ? 'Burned' : SRS.formatTimeUntil(card.srs.nextReview);
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

function renderDeckCard(deck) {
  const due = deck.cards.filter(c => SRS.isDue(c)).length;
  const total = deck.cards.length;
  return `
    <div class="deck-card" onclick="navigate('deck-detail', '${deck.id}')">
      <div class="deck-card-accent" style="background: ${deck.color}"></div>
      <div class="deck-card-body">
        <div class="deck-card-name">${esc(deck.name)}</div>
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
    const nextText = card.srs.stage >= 9 ? 'Burned' : SRS.formatTimeUntil(card.srs.nextReview);
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
  const nextReview = card.srs.stage >= 9 ? 'Burned (complete!)' : SRS.formatTimeUntil(card.srs.nextReview);
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
      <button class="btn btn-primary" onclick="reviewSingleCard('${deck.id}', '${card.id}')">Review Now</button>
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
    document.getElementById('quiz-card-type').textContent = 'Type Your Answer';
    const input = document.getElementById('free-input');
    input.value = '';
    input.className = 'free-input';
    input.disabled = false;
    document.getElementById('check-answer-btn').style.display = '';
    input.focus();
  }
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

function checkFreeAnswer() {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const card = state.quiz.currentCard;
  const input = document.getElementById('free-input');
  const userAnswer = input.value.trim().toLowerCase();
  const correctAnswer = card.back.trim().toLowerCase();

  // Fuzzy match: allow minor typos
  const correct = userAnswer === correctAnswer || levenshtein(userAnswer, correctAnswer) <= Math.max(1, Math.floor(correctAnswer.length * 0.2));

  state.quiz.wasCorrect = correct;
  state.quiz.totalAnswered++;
  if (correct) state.quiz.totalCorrect++;

  input.disabled = true;
  input.classList.add(correct ? 'correct' : 'wrong');
  document.getElementById('check-answer-btn').style.display = 'none';

  showResult(correct);
}

function showResult(correct) {
  const q = state.quiz;
  const card = q.currentCard;
  const resultArea = document.getElementById('result-area');
  const resultMsg = document.getElementById('result-message');
  const correctDisplay = document.getElementById('correct-answer-display');

  // Auto-grade: correct = Good (2), incorrect = Again (0) — like WaniKani
  const grade = correct ? 2 : 0;

  // Find and update actual card in deck
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  let stageName = '', stageClass = '', nextTime = '';

  if (deck) {
    const actualCard = deck.cards.find(c => c.id === card.id);
    if (actualCard) {
      SRS.reviewCard(actualCard, grade);
      stageName = SRS.STAGE_NAMES[actualCard.srs.stage] || 'New';
      stageClass = SRS.STAGE_CLASSES[actualCard.srs.stage] || 'new';
      nextTime = actualCard.srs.stage >= 9 ? 'Burned!' : SRS.formatTimeUntil(actualCard.srs.nextReview);
    }
  }

  if (correct) {
    // Card is done — it disappears and comes back based on SRS interval
    q.completed++;
    resultMsg.textContent = 'Correct!';
    resultMsg.className = 'result-message correct';
    correctDisplay.textContent = '';
    document.getElementById('srs-info').innerHTML = `
      <span class="srs-stage-badge ${stageClass}">${stageName}</span>
      <span class="srs-next-review">Next review: ${nextTime}</span>
    `;
  } else {
    // Wrong — card goes back into the queue to be reviewed again this session
    // Insert it a few cards later (not immediately) so you see other cards first
    const reinsertPos = Math.min(q.queue.length, Math.floor(Math.random() * 4) + 2);
    q.queue.splice(reinsertPos, 0, card);

    resultMsg.textContent = 'Incorrect';
    resultMsg.className = 'result-message wrong';
    correctDisplay.textContent = `Correct answer: ${card.back}`;
    document.getElementById('srs-info').innerHTML = `
      <span class="srs-stage-badge ${stageClass}">${stageName}</span>
      <span class="srs-next-review">This card will appear again this session</span>
    `;
  }

  saveState();
  updateReviewBadge();

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

// --- Init ---
loadState();
updateReviewBadge();
navigate('dashboard');
