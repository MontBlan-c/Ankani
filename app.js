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
    deck.cards.forEach((card, i) => addCardRow(card.front, card.back, card.wrongAnswers || []));
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

function addCardRow(front = '', back = '', wrongAnswers = []) {
  const container = document.getElementById('card-rows');
  const num = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'card-row';
  const wrongStr = wrongAnswers.map(w => esc(w)).join(',');
  row.innerHTML = `
    <span class="card-row-num">${num}</span>
    <div class="card-row-fields">
      <div class="card-row-main">
        <input type="text" class="card-front" placeholder="Front (question)" value="${esc(front)}">
        <input type="text" class="card-back" placeholder="Back (correct answer)" value="${esc(back)}">
        <button class="card-row-delete" onclick="this.closest('.card-row').remove(); renumberCards();">&times;</button>
      </div>
      <div class="card-row-wrong">
        <button class="btn-add-wrong" onclick="addWrongAnswer(this)" title="Add a wrong answer choice">+ Wrong Answer</button>
        <div class="wrong-answers-list"></div>
      </div>
    </div>
  `;
  container.appendChild(row);
  // Add existing wrong answers
  const wrongList = row.querySelector('.wrong-answers-list');
  wrongAnswers.forEach(w => insertWrongInput(wrongList, w));
  if (!front) row.querySelector('.card-front').focus();
  // Allow pressing Enter on back field to add wrong answer or new row
  row.querySelector('.card-back').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCardRow();
    }
  });
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
    if (front && back) {
      cards.push({ front, back, wrongAnswers });
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
          return existing;
        }
        return { id: genId(), front: c.front, back: c.back, wrongAnswers: c.wrongAnswers || [], srs: SRS.newCardData() };
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
  `;
  document.getElementById('card-modal').style.display = '';
}

function closeModal() {
  document.getElementById('card-modal').style.display = 'none';
}

// --- Quiz / Review ---
function startReview() {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) return;

  const dueCards = deck.cards.filter(c => SRS.isDue(c));
  if (dueCards.length === 0) return;

  // Shuffle
  const shuffled = [...dueCards].sort(() => Math.random() - 0.5);

  state.quiz = {
    deckId: deck.id,
    cards: shuffled,
    currentIndex: 0,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
  };

  navigate('quiz');
  showQuizCard();
}

function showQuizCard() {
  const q = state.quiz;
  if (q.currentIndex >= q.cards.length) {
    endReview();
    return;
  }

  const card = q.cards[q.currentIndex];
  const deck = state.decks.find(d => d.id === q.deckId);
  const mode = getQuizModeForCard(deck);

  q.answered = false;

  // Update progress
  const pct = (q.currentIndex / q.cards.length) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-text').textContent = `${q.currentIndex + 1} / ${q.cards.length}`;

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

function getQuizModeForCard(deck) {
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

  const card = state.quiz.cards[state.quiz.currentIndex];
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
  const card = state.quiz.cards[state.quiz.currentIndex];
  const resultArea = document.getElementById('result-area');
  const resultMsg = document.getElementById('result-message');
  const correctDisplay = document.getElementById('correct-answer-display');

  resultMsg.textContent = correct ? 'Correct!' : 'Incorrect';
  resultMsg.className = 'result-message ' + (correct ? 'correct' : 'wrong');
  correctDisplay.textContent = correct ? '' : `Correct answer: ${card.back}`;

  // Show SRS interval previews
  const previews = SRS.previewIntervals(card.srs.stage);
  document.getElementById('srs-time-0').textContent = previews[0];
  document.getElementById('srs-time-1').textContent = previews[1];
  document.getElementById('srs-time-2').textContent = previews[2];
  document.getElementById('srs-time-3').textContent = previews[3];

  resultArea.style.display = '';
}

function gradeCard(grade) {
  const q = state.quiz;
  const card = q.cards[q.currentIndex];

  // Find and update actual card in deck
  const deck = state.decks.find(d => d.id === q.deckId);
  if (deck) {
    const actualCard = deck.cards.find(c => c.id === card.id);
    if (actualCard) {
      SRS.reviewCard(actualCard, grade);
    }
  }

  saveState();

  // Next card
  q.currentIndex++;
  showQuizCard();
}

function endReview() {
  const q = state.quiz;
  // Show summary if anything was reviewed
  if (q.totalAnswered > 0) {
    const accuracy = Math.round((q.totalCorrect / q.totalAnswered) * 100);
    alert(`Review complete!\n\nCards reviewed: ${q.totalAnswered}\nCorrect: ${q.totalCorrect}\nAccuracy: ${accuracy}%`);
  }
  navigate('deck-detail', q.deckId || state.currentDeckId);
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', e => {
  if (state.currentView === 'quiz' && state.quiz.answered) {
    const resultArea = document.getElementById('result-area');
    if (resultArea.style.display !== 'none') {
      switch (e.key) {
        case '1': gradeCard(0); break;
        case '2': gradeCard(1); break;
        case '3': gradeCard(2); break;
        case '4': gradeCard(3); break;
      }
    }
  }
  // Enter to check free answer
  if (state.currentView === 'quiz' && !state.quiz.answered && e.key === 'Enter') {
    const freeArea = document.getElementById('free-area');
    if (freeArea.style.display !== 'none') {
      checkFreeAnswer();
    }
  }
  // Escape to close modal
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
navigate('dashboard');
