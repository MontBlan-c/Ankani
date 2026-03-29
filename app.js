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
  en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  ar: 'Arabic', hi: 'Hindi', ru: 'Russian', th: 'Thai', he: 'Hebrew', el: 'Greek',
};

// --- Persistence ---
function saveState() {
  localStorage.setItem('ankani_decks', JSON.stringify(state.decks));
}

function loadState() {
  try {
    const data = localStorage.getItem('ankani_decks');
    if (data) {
      state.decks = JSON.parse(data);
      // Fix nextReview values that got corrupted by JSON serialization
      // (Infinity becomes null, strings need to be numbers)
      state.decks.forEach(deck => {
        deck.cards.forEach(card => {
          if (card.srs) {
            if (card.srs.nextReview !== null && card.srs.nextReview !== undefined) {
              card.srs.nextReview = Number(card.srs.nextReview);
              if (isNaN(card.srs.nextReview)) card.srs.nextReview = null;
            }
          }
        });
      });
    }
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
      // Show chat FAB if API key exists
      document.getElementById('chat-fab').style.display = getApiKey() ? '' : 'none';
      break;
  }

  // Hide chat FAB and panel on non-quiz views
  if (view !== 'quiz') {
    document.getElementById('chat-fab').style.display = 'none';
    document.getElementById('ai-chat-panel').style.display = 'none';
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

  // Practice counts
  renderPracticeCounts();

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

// --- Practice Mode ---
function getPracticeCards(type) {
  const cards = [];
  state.decks.forEach(deck => {
    deck.cards.forEach(card => {
      cards.push({ card, deckId: deck.id, deckName: deck.name, deckColor: deck.color });
    });
  });

  switch (type) {
    case 'mistakes':
      // Cards that were recently answered wrong (low accuracy or stage dropped)
      return cards.filter(({ card }) =>
        card.srs.totalReviews > 0 &&
        (card.srs.correctCount / card.srs.totalReviews) < 0.7
      ).sort((a, b) =>
        (a.card.srs.correctCount / Math.max(1, a.card.srs.totalReviews)) -
        (b.card.srs.correctCount / Math.max(1, b.card.srs.totalReviews))
      );

    case 'new':
      // Apprentice-level cards (stages 1-4)
      return cards.filter(({ card }) =>
        card.srs.stage >= 1 && card.srs.stage <= 4
      );

    case 'refresh':
      // Burned & mature cards (stages 7-9) that might be forgotten
      return cards.filter(({ card }) =>
        card.srs.stage >= 7
      );

    default:
      return [];
  }
}

function renderPracticeCounts() {
  document.getElementById('practice-mistakes-count').textContent = getPracticeCards('mistakes').length;
  document.getElementById('practice-new-count').textContent = getPracticeCards('new').length;
  document.getElementById('practice-refresh-count').textContent = getPracticeCards('refresh').length;
}

function startPractice(type) {
  const items = getPracticeCards(type);
  if (items.length === 0) return;

  // Take up to 20, shuffled
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, 20);

  state.quiz = {
    deckId: null,
    multiDeck: true,
    cardDeckMap: Object.fromEntries(shuffled.map(item => [item.card.id, item.deckId])),
    queue: shuffled.map(item => item.card),
    totalUnique: shuffled.length,
    completed: 0,
    currentCard: null,
    answered: false,
    wasCorrect: false,
    totalAnswered: 0,
    totalCorrect: 0,
    returnTo: 'dashboard',
    practiceMode: true,
    history: [],
    historyIndex: -1,
  };

  navigate('quiz');
  showQuizCard();
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
  // Use end-of-current-hour as cutoff (matching isDue logic)
  const now = new Date();
  const endOfHour = new Date(now);
  endOfHour.setMinutes(59, 59, 999);
  const endOfHourMs = endOfHour.getTime();

  const allCards = [];
  const dueNowCards = [];
  state.decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.srs.nextReview && card.srs.nextReview > endOfHourMs) {
        allCards.push({ card, deckName: deck.name, deckColor: deck.color });
      } else if (card.srs.nextReview && card.srs.nextReview <= endOfHourMs && card.srs.nextReview > 0) {
        dueNowCards.push({ card, deckName: deck.name, deckColor: deck.color });
      }
    });
  });

  if (allCards.length === 0 && dueNowCards.length === 0) {
    container.innerHTML = '<div class="schedule-empty">No upcoming reviews scheduled.</div>';
    return;
  }

  // Sort by next review time
  allCards.sort((a, b) => a.card.srs.nextReview - b.card.srs.nextReview);

  // Build timeline buckets (starting after end of current hour)
  const nowMs = Date.now();
  const buckets = [
    { label: 'Next Hour', max: endOfHourMs + 3600000, cards: [] },
    { label: 'Next 4 Hours', max: endOfHourMs + 4 * 3600000, cards: [] },
    { label: 'Today', max: getEndOfDay(nowMs), cards: [] },
    { label: 'Tomorrow', max: getEndOfDay(nowMs) + 86400000, cards: [] },
    { label: 'This Week', max: nowMs + 7 * 86400000, cards: [] },
    { label: 'This Month', max: nowMs + 30 * 86400000, cards: [] },
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
  const totalForBar = allCards.length + dueNowCards.length;
  const dueNowHtml = dueNowCards.length > 0 ? `
    <div class="schedule-bucket schedule-bucket-due">
      <div class="schedule-bucket-header">
        <span class="schedule-bucket-label">Due Now</span>
        <span class="schedule-bucket-count schedule-due-count">${dueNowCards.length} card${dueNowCards.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="schedule-bucket-bar">
        <div class="schedule-bucket-fill schedule-due-fill" style="width:${Math.min(100, (dueNowCards.length / totalForBar) * 100)}%"></div>
      </div>
    </div>
  ` : '';

  const timelineHtml = dueNowHtml + buckets
    .filter(b => b.cards.length > 0)
    .map(b => `
      <div class="schedule-bucket">
        <div class="schedule-bucket-header">
          <span class="schedule-bucket-label">${b.label}</span>
          <span class="schedule-bucket-count">${b.cards.length} card${b.cards.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="schedule-bucket-bar">
          <div class="schedule-bucket-fill" style="width:${Math.min(100, (b.cards.length / totalForBar) * 100)}%"></div>
        </div>
      </div>
    `).join('');

  // Build 24-hour hourly breakdown
  const hourlyData = [];
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  for (let h = 0; h < 24; h++) {
    const hourStart = currentHour.getTime() + h * 3600000;
    const hourEnd = hourStart + 3600000;
    const count = allCards.filter(item =>
      item.card.srs.nextReview >= hourStart && item.card.srs.nextReview < hourEnd
    ).length;
    const hourDate = new Date(hourStart);
    const label = hourDate.toLocaleTimeString('en', { hour: 'numeric', hour12: true });
    const isNow = h === 0;
    hourlyData.push({ label, count, isNow });
  }
  const maxHourly = Math.max(...hourlyData.map(h => h.count), 1);

  const hourlyHtml = hourlyData.map(h => {
    const barHeight = h.count > 0 ? Math.max(8, (h.count / maxHourly) * 100) : 0;
    return `
      <div class="hourly-col ${h.isNow ? 'hourly-now' : ''} ${h.count === 0 ? 'hourly-empty' : ''}">
        <div class="hourly-count">${h.count || ''}</div>
        <div class="hourly-bar-wrap">
          <div class="hourly-bar" style="height:${barHeight}%"></div>
        </div>
        <div class="hourly-label">${h.label}</div>
      </div>
    `;
  }).join('');

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
    <div class="schedule-hourly">
      <div class="schedule-cal-label">Next 24 Hours</div>
      <div class="hourly-grid">${hourlyHtml}</div>
    </div>
    <div class="schedule-bottom">
      <div class="schedule-timeline">${timelineHtml}</div>
      <div class="schedule-calendar">
        <div class="schedule-cal-label">14-Day Forecast</div>
        <div class="cal-grid">${calendarHtml}</div>
      </div>
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
  let dueCount = state.decks.reduce((s, d) => s + d.cards.filter(c => SRS.isDue(c)).length, 0);

  // If a review is active, add cards still in the quiz queue + current card
  // (they may no longer be "due" in the deck after a wrong answer updates SRS)
  if (state.currentView === 'quiz' && state.quiz && !state.quiz.practiceMode) {
    const quizCardIds = new Set();
    if (state.quiz.queue) state.quiz.queue.forEach(c => quizCardIds.add(c.id));
    if (state.quiz.currentCard && !state.quiz.answered) quizCardIds.add(state.quiz.currentCard.id);
    // Count quiz cards that aren't already counted as due
    const alreadyDue = new Set();
    state.decks.forEach(d => d.cards.filter(c => SRS.isDue(c)).forEach(c => alreadyDue.add(c.id)));
    quizCardIds.forEach(id => {
      if (!alreadyDue.has(id)) dueCount++;
    });
  }

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
        <div class="reviews-deck-header" onclick="toggleReviewDeck('review-deck-${deck.id}')">
          <div class="reviews-deck-color" style="background:${deck.color}"></div>
          <h3 class="reviews-deck-name">${esc(deck.name)}</h3>
          <span class="reviews-deck-count">${dueCards.length} due</span>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); startDeckReview('${deck.id}')">Review Deck</button>
          <span class="reviews-deck-chevron" id="chevron-${deck.id}">&#9660;</span>
        </div>
        <div class="reviews-deck-cards" id="review-deck-${deck.id}" style="display:none">
          <div class="reviews-deck-schedule">${buildDeckScheduleHtml(deck)}</div>
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

function toggleReviewDeck(id) {
  const el = document.getElementById(id);
  const deckId = id.replace('review-deck-', '');
  const chevron = document.getElementById('chevron-' + deckId);
  if (el.style.display === 'none') {
    el.style.display = '';
    if (chevron) chevron.innerHTML = '&#9650;';
  } else {
    el.style.display = 'none';
    if (chevron) chevron.innerHTML = '&#9660;';
  }
}

function buildDeckScheduleHtml(deck) {
  const now = new Date();
  const endOfHour = new Date(now);
  endOfHour.setMinutes(59, 59, 999);
  const endOfHourMs = endOfHour.getTime();

  // Gather this deck's upcoming cards
  const upcoming = [];
  const dueNow = [];
  deck.cards.forEach(card => {
    if (card.srs.nextReview && card.srs.nextReview > endOfHourMs) {
      upcoming.push(card);
    } else if (card.srs.nextReview && card.srs.nextReview <= endOfHourMs && card.srs.nextReview > 0) {
      dueNow.push(card);
    } else if (!card.srs.nextReview) {
      dueNow.push(card);
    }
  });

  if (upcoming.length === 0 && dueNow.length === 0) {
    return '<div class="deck-schedule-empty">No upcoming reviews for this deck.</div>';
  }

  // Build 12-hour forecast
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  const hourlyData = [];
  for (let h = 0; h < 12; h++) {
    const hourStart = currentHour.getTime() + h * 3600000;
    const hourEnd = hourStart + 3600000;
    const count = deck.cards.filter(c =>
      c.srs.nextReview && c.srs.nextReview >= hourStart && c.srs.nextReview < hourEnd
    ).length;
    const hourDate = new Date(hourStart);
    const label = hourDate.toLocaleTimeString('en', { hour: 'numeric', hour12: true });
    hourlyData.push({ label, count, isNow: h === 0 });
  }
  const maxH = Math.max(...hourlyData.map(h => h.count), 1);

  const barsHtml = hourlyData.map(h => {
    const barHeight = h.count > 0 ? Math.max(8, (h.count / maxH) * 100) : 0;
    return `
      <div class="hourly-col ${h.isNow ? 'hourly-now' : ''} ${h.count === 0 ? 'hourly-empty' : ''}">
        <div class="hourly-count">${h.count || ''}</div>
        <div class="hourly-bar-wrap">
          <div class="hourly-bar" style="height:${barHeight}%"></div>
        </div>
        <div class="hourly-label">${h.label}</div>
      </div>
    `;
  }).join('');

  // SRS stage breakdown for this deck
  const stages = [0, 0, 0, 0, 0]; // apprentice, guru, master, enlightened, burned
  deck.cards.forEach(c => {
    if (c.srs.stage >= 1 && c.srs.stage <= 4) stages[0]++;
    else if (c.srs.stage >= 5 && c.srs.stage <= 6) stages[1]++;
    else if (c.srs.stage === 7) stages[2]++;
    else if (c.srs.stage === 8) stages[3]++;
    else if (c.srs.stage >= 9) stages[4]++;
  });

  return `
    <div class="deck-schedule-row">
      <div class="deck-schedule-chart">
        <div class="schedule-cal-label">Next 12 Hours</div>
        <div class="hourly-grid deck-hourly-grid">${barsHtml}</div>
      </div>
      <div class="deck-schedule-stats">
        <div class="deck-schedule-stat">
          <span class="deck-sched-num" style="color:var(--accent)">${dueNow.length}</span>
          <span class="deck-sched-label">Due Now</span>
        </div>
        <div class="deck-schedule-stat">
          <span class="deck-sched-num" style="color:var(--text-dim)">${upcoming.length}</span>
          <span class="deck-sched-label">Upcoming</span>
        </div>
        <div class="deck-schedule-stat">
          <span class="deck-sched-num" style="color:#E91E90">${stages[0]}</span>
          <span class="deck-sched-label">Apprentice</span>
        </div>
        <div class="deck-schedule-stat">
          <span class="deck-sched-num" style="color:#882D9E">${stages[1]}</span>
          <span class="deck-sched-label">Guru</span>
        </div>
        <div class="deck-schedule-stat">
          <span class="deck-sched-num" style="color:#294DDB">${stages[2]}</span>
          <span class="deck-sched-label">Master</span>
        </div>
      </div>
    </div>
  `;
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
    history: [],
    historyIndex: -1,
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
    history: [],
    historyIndex: -1,
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
  const langSelect = document.getElementById('deck-language');
  langSelect.value = deck ? (deck.language || '') : '';
  document.getElementById('deck-learning-lang').checked = deck ? (deck.learningLang !== false) : true;
  document.getElementById('deck-romanized').checked = deck ? (deck.romanized || false) : false;
  document.getElementById('deck-auto-audio').checked = deck ? (deck.autoAudio !== false) : true;
  updateLanguageOptions();
  langSelect.addEventListener('change', updateLanguageOptions);

  // Cards
  const container = document.getElementById('card-rows');
  container.innerHTML = '';
  if (deck && deck.cards.length > 0) {
    deck.cards.forEach((card, i) => addCardRow(card.front, card.back, card.wrongAnswers || [], card.quizMode || 'deck', card.grading || 'deck', card.audio || null));
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

function updateLanguageOptions() {
  const lang = document.getElementById('deck-language').value;
  document.getElementById('language-options').style.display = lang ? '' : 'none';
}

function setQuizMode(mode) {
  state.quizMode = mode;
  document.querySelectorAll('.toggle-btn[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

function addCardRow(front = '', back = '', wrongAnswers = [], cardMode = 'deck', grading = 'deck', audio = null) {
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
        <div class="card-grading-toggle">
          <span class="card-option-label">Grading:</span>
          <button class="card-grade-btn ${grading === 'deck' ? 'active' : ''}" data-cardgrading="deck" onclick="setCardGrading(this)">Settings Default</button>
          <button class="card-grade-btn ${grading === 'exact' ? 'active' : ''}" data-cardgrading="exact" onclick="setCardGrading(this)">Exact</button>
          <button class="card-grade-btn ${grading === 'ai' ? 'active' : ''}" data-cardgrading="ai" onclick="setCardGrading(this)">AI Graded</button>
        </div>
        <div class="card-row-audio">
          <button class="btn-audio-upload" onclick="uploadCardAudio(this)">&#128264; Audio</button>
          <span class="audio-status">${audio ? 'Audio attached' : ''}</span>
          <button class="btn-audio-play" onclick="previewCardAudio(this)" style="display:${audio ? '' : 'none'}" title="Play">&#9654;</button>
          <button class="btn-audio-remove" onclick="removeCardAudio(this)" style="display:${audio ? '' : 'none'}" title="Remove">&times;</button>
          <input type="hidden" class="card-audio-data" value="${audio ? esc(audio) : ''}">
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

function setCardGrading(btn) {
  const row = btn.closest('.card-row');
  row.querySelectorAll('.card-grade-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
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
  const learningLang = language ? document.getElementById('deck-learning-lang').checked : false;
  const romanized = language ? document.getElementById('deck-romanized').checked : false;
  const autoAudio = language ? document.getElementById('deck-auto-audio').checked : false;
  const rows = document.querySelectorAll('.card-row');
  const cards = [];
  rows.forEach(row => {
    const front = row.querySelector('.card-front').value.trim();
    const back = row.querySelector('.card-back').value.trim();
    const wrongInputs = row.querySelectorAll('.card-wrong');
    const wrongAnswers = Array.from(wrongInputs).map(i => i.value.trim()).filter(Boolean);
    const activeMode = row.querySelector('.card-mode-btn.active');
    const cardMode = activeMode ? activeMode.dataset.cardmode : 'deck';
    const activeGrading = row.querySelector('.card-grade-btn.active');
    const grading = activeGrading ? activeGrading.dataset.cardgrading : 'deck';
    const audioInput = row.querySelector('.card-audio-data');
    const audio = audioInput && audioInput.value ? audioInput.value : null;
    if (front && back) {
      cards.push({ front, back, wrongAnswers, quizMode: cardMode, grading, audio });
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
      deck.learningLang = learningLang;
      deck.romanized = romanized;
      deck.autoAudio = autoAudio;

      // Merge cards: keep existing SRS data for matching front/back, add new ones
      const existingMap = new Map(deck.cards.map(c => [c.front + '|||' + c.back, c]));
      deck.cards = cards.map(c => {
        const key = c.front + '|||' + c.back;
        if (existingMap.has(key)) {
          const existing = existingMap.get(key);
          existing.wrongAnswers = c.wrongAnswers || [];
          existing.quizMode = c.quizMode || 'deck';
          existing.grading = c.grading || 'deck';
          if (c.audio) existing.audio = c.audio;
          return existing;
        }
        return { id: genId(), front: c.front, back: c.back, wrongAnswers: c.wrongAnswers || [], quizMode: c.quizMode || 'deck', grading: c.grading || 'deck', audio: c.audio || null, srs: SRS.newCardData() };
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
      learningLang: learningLang,
      romanized: romanized,
      autoAudio: autoAudio,
      cards: cards.map(c => ({
        id: genId(),
        front: c.front,
        back: c.back,
        wrongAnswers: c.wrongAnswers || [],
        quizMode: c.quizMode || 'deck',
        grading: c.grading || 'deck',
        audio: c.audio || null,
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
      <span class="modal-row-value">${esc(card.back)}${(card.audio || (deck && deck.autoAudio && deck.language)) ? ` <button class="btn-audio-play" onclick="event.stopPropagation(); speakCardInModal()" title="Play pronunciation">&#128264;</button>` : ''}</span>
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

function speakCardInModal() {
  const deck = state.decks.find(d => d.id === state.currentDeckId);
  if (!deck) return;
  // Find the card that's currently shown in the modal
  const modalBody = document.getElementById('modal-body');
  const backEl = modalBody.querySelector('.modal-row:nth-child(2) .modal-row-value');
  if (!backEl) return;
  const text = backEl.textContent.trim();
  if (deck.language) {
    speakText(text, deck.language);
  }
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
    history: [],
    historyIndex: -1,
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

  // Store resolved mode so it doesn't change on back/forward
  q.currentMode = mode;

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

  // Setup audio
  setupQuizAudio(card, deck, false);

  // Update nav bar and hide history
  document.getElementById('history-area').style.display = 'none';
  updateNavBar();

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
    const cardGrading = card.grading && card.grading !== 'deck' ? card.grading : getGradingMode();
    const hasApiKey = !!getApiKey();
    state.quiz.liveGrading = cardGrading; // track current grading for this card
    let typeLabel = '';
    const input = document.getElementById('free-input');
    input.value = '';
    input.className = 'free-input';
    input.disabled = false;
    input.style.height = 'auto';
    input.rows = 1;

    // Unbind previous kana converter
    RomajiToKana.unbind(input);

    // Set language for IME input
    const deckLang = deck ? (deck.language || '') : '';
    if (deckLang) {
      input.setAttribute('lang', deckLang);
      input.placeholder = `Type your answer in ${LANG_NAMES[deckLang] || deckLang}...`;

      if (deckLang === 'ja') {
        RomajiToKana.setMode('hiragana');
        RomajiToKana.bind(input);
        RomajiToKana.resetInput(input);
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

    // Show grading toggle if API key exists
    const gradingToggle = document.getElementById('quiz-grading-toggle');
    if (hasApiKey) {
      gradingToggle.style.display = '';
      document.querySelectorAll('.quiz-grade-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.quizgrade === state.quiz.liveGrading);
      });
    } else {
      gradingToggle.style.display = 'none';
      state.quiz.liveGrading = 'exact';
    }

    const isAI = state.quiz.liveGrading === 'ai' && hasApiKey;
    typeLabel = isAI ? 'Type Your Answer (AI Graded)' : 'Type Your Answer';
    if (deck && deck.language) typeLabel += ` — ${LANG_NAMES[deck.language] || deck.language}`;

    document.getElementById('quiz-card-type').textContent = typeLabel;
    const checkBtn = document.getElementById('check-answer-btn');
    checkBtn.style.display = '';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = false;
    document.getElementById('free-idk-btn').style.display = '';
    input.focus();
  }

  // Show MCQ idk button
  document.getElementById('mcq-idk-btn').style.display = '';
}

function setQuizGrading(mode) {
  state.quiz.liveGrading = mode;
  document.querySelectorAll('.quiz-grade-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.quizgrade === mode);
  });
  const isAI = mode === 'ai';
  const card = state.quiz.currentCard;
  const q = state.quiz;
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  let typeLabel = isAI ? 'Type Your Answer (AI Graded)' : 'Type Your Answer';
  if (deck && deck.language) typeLabel += ` — ${LANG_NAMES[deck.language] || deck.language}`;
  document.getElementById('quiz-card-type').textContent = typeLabel;
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
  state.quiz.lastMCQAnswer = btn.textContent.trim();
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

  const apiKey = getApiKey();
  const q = state.quiz;
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  const deckLang = deck ? (deck.language || '') : '';

  // Use the live grading toggle from the quiz UI
  const cardGrading = q.liveGrading || 'exact';

  let correct;
  let feedback = '';

  if (cardGrading === 'ai' && apiKey) {
    // AI grading
    btn.textContent = 'Grading...';
    btn.disabled = true;
    input.disabled = true;

    try {
      const result = await aiGradeFreeResponse(card.front, correctAnswer, userAnswer, apiKey, deckLang);
      correct = result.correct;
      feedback = result.feedback;
    } catch (err) {
      console.error('AI grading failed, falling back to exact match:', err);
      const ua = userAnswer.toLowerCase();
      const ca = correctAnswer.toLowerCase();
      correct = ua === ca || levenshtein(ua, ca) <= Math.max(1, Math.floor(ca.length * 0.2));
    }
  } else {
    // Exact match with fuzzy tolerance
    const ua = userAnswer.toLowerCase();
    const ca = correctAnswer.toLowerCase();
    // Detect questions or "I don't know"
    const isQuestion = /\?$/.test(userAnswer) || /^(idk|i don'?t know|no idea|help|what|how|why|is it)/i.test(userAnswer);
    if (isQuestion) {
      correct = false;
      feedback = `The answer is: ${correctAnswer}. Try to remember it for next time!`;
    } else {
      correct = ua === ca || levenshtein(ua, ca) <= Math.max(1, Math.floor(ca.length * 0.2));
    }
  }

  state.quiz.wasCorrect = correct;
  state.quiz.totalAnswered++;
  if (correct) state.quiz.totalCorrect++;

  input.disabled = true;
  input.classList.add(correct ? 'correct' : 'wrong');
  btn.style.display = 'none';

  showResult(correct, feedback);
}

async function idkAnswer() {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const card = state.quiz.currentCard;
  const q = state.quiz;
  const deckId = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  const deckLang = deck ? (deck.language || '') : '';

  q.wasCorrect = false;
  q.lastMCQAnswer = '';
  q.totalAnswered++;

  // Disable inputs
  const freeInput = document.getElementById('free-input');
  freeInput.disabled = true;
  document.getElementById('check-answer-btn').style.display = 'none';
  document.getElementById('free-idk-btn').style.display = 'none';
  document.getElementById('mcq-idk-btn').style.display = 'none';
  document.querySelectorAll('.mcq-option').forEach(b => {
    b.classList.add('disabled');
    if (b.dataset.correct === 'true') b.classList.add('correct');
  });

  // Try to get AI explanation
  let feedback = '';
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const personality = buildTutorPrompt();
      const langContext = deckLang ? `\nThis is a ${LANG_NAMES[deckLang] || deckLang} language quiz.` : '';
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
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `The student doesn't know the answer to this question. Teach them!${personality ? '\n\nPERSONALITY: ' + personality : ''}

Question: ${card.front}
Correct answer: ${card.back}${langContext}

Explain the answer in 2-4 sentences. Help them understand and remember it. Give a helpful tip, mnemonic, or example. Be encouraging — it's okay not to know!`
          }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        feedback = data.content[0].text.trim();
      }
    } catch (err) {
      console.error('AI explanation failed:', err);
    }
  }

  if (!feedback) {
    feedback = `The answer is: ${card.back}. Don't worry — you'll get it next time!`;
  }

  showResult(false, feedback);
}

async function aiGradeFreeResponse(question, correctAnswer, userAnswer, apiKey, deckLang) {
  let langContext = '';
  if (deckLang === 'ja') {
    langContext = `\n\nThis is a Japanese language quiz. The student is typing in hiragana. If the correct answer is in kanji, accept the hiragana reading as correct. For example if the correct answer is 草 (くさ), accept くさ. If the correct answer is 水 (みず), accept みず. Also accept katakana equivalents and romanized answers (romaji) if they match. Be lenient.`;
  } else if (deckLang) {
    langContext = `\n\nThis is a ${LANG_NAMES[deckLang] || deckLang} language quiz. Accept answers in any valid script for that language. Also accept romanized/transliterated answers if they match the correct pronunciation. Be lenient with diacritics and tone marks.`;
  }

  const personality = buildTutorPrompt();

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
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a quiz tutor grading an answer and giving helpful feedback.${personality ? '\n\nPERSONALITY: ' + personality : ''}

Question: ${question}
Correct answer: ${correctAnswer}
Student's response: ${userAnswer}

GRADING RULES:
- The student's answer doesn't need to match word-for-word. Accept answers that are essentially correct in meaning, even if abbreviated, rephrased, or using synonyms. Be lenient with minor spelling errors.
- If the student asks a question (e.g. "Is it like X?", "What does this mean?", "Can you explain?"), mark INCORRECT but answer their question helpfully and teach them the correct answer.
- If the student says they don't know (e.g. "I don't know", "idk", "no idea", "?", "help"), mark INCORRECT but kindly explain the answer with a helpful tip or mnemonic to help them remember.
- If the student gives a wrong answer, explain why it's wrong and help them remember the right one.
- If the student is correct, confirm what they got right and optionally add a helpful tip.${langContext}

Reply in EXACTLY this format (two lines):
CORRECT or INCORRECT
[Your feedback — 1-3 sentences. Be encouraging and helpful. If they asked a question, answer it. If they didn't know, teach them.]`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const lines = text.split('\n').filter(l => l.trim());
  const verdictLine = (lines[0] || '').toUpperCase();
  const correct = verdictLine.includes('CORRECT') && !verdictLine.includes('INCORRECT');
  const feedback = lines.slice(1).join(' ').trim() || '';

  return { correct, feedback };
}

function showResult(correct, feedback) {
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
  } else if (correct) {
    // Real review, correct — update SRS now (card is leaving the queue)
    // If the card was answered wrong before in this session, use Hard (1) instead of Good (2)
    const wasWrongBefore = q.history && q.history.some(h => h.card.id === card.id && !h.correct);
    const grade = wasWrongBefore ? 1 : 2;
    if (deck) {
      const actualCard = deck.cards.find(c => c.id === card.id);
      if (actualCard) {
        SRS.reviewCard(actualCard, grade);
        stageName = SRS.STAGE_NAMES[actualCard.srs.stage] || 'New';
        stageClass = SRS.STAGE_CLASSES[actualCard.srs.stage] || 'new';
        nextTime = SRS.formatTimeUntil(actualCard.srs.nextReview);
      }
    }
  } else {
    // Real review, wrong — DON'T update SRS yet. Card stays in queue.
    // SRS only updates when the card is finally answered correctly.
    if (deck) {
      const actualCard = deck.cards.find(c => c.id === card.id);
      if (actualCard) {
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

  // Show AI feedback if provided
  const feedbackEl = document.getElementById('ai-feedback');
  const voteEl = document.getElementById('feedback-vote');
  if (feedback) {
    feedbackEl.innerHTML = formatFeedback(feedback);
    feedbackEl.className = 'ai-feedback ' + (correct ? 'ai-feedback-correct' : 'ai-feedback-wrong');
    feedbackEl.style.display = '';
    // Show vote buttons, reset state
    voteEl.style.display = '';
    voteEl.querySelectorAll('.vote-btn').forEach(b => {
      b.classList.remove('voted');
      b.disabled = false;
    });
  } else {
    feedbackEl.style.display = 'none';
    voteEl.style.display = 'none';
  }

  // Save to history
  const freeInput = document.getElementById('free-input');
  const freeVisible = document.getElementById('free-area').style.display !== 'none';
  const userAnswer = freeVisible ? freeInput.value : (q.lastMCQAnswer || '');
  q.history.push({
    card: { front: card.front, back: card.back, id: card.id },
    correct,
    userAnswer,
    feedback: feedback || '',
    mode: q.currentMode,
    grading: q.liveGrading || 'exact',
  });
  q.historyIndex = q.history.length - 1;
  updateNavBar();

  // Update progress bar and remaining count
  const pct = (q.completed / q.totalUnique) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-text').textContent = `${q.completed} / ${q.totalUnique}`;
  document.getElementById('quiz-remaining').textContent = `${q.queue.length} remaining`;

  // Reveal audio after answering (for translation-direction cards)
  if (q.pendingAudio) {
    const deckId2 = q.multiDeck ? q.cardDeckMap[card.id] : q.deckId;
    const deck2 = state.decks.find(d => d.id === deckId2);
    setupQuizAudio(card, deck2, true);
  }

  resultArea.style.display = '';
  document.getElementById('history-area').style.display = 'none';
}

function nextCard() {
  closeChatPanel();
  state.quiz.viewingHistory = false;
  showQuizCard();
}

// --- Quiz Navigation (Quizlet-style) ---
// Position: -1 = current card, 0..n = history index
function quizNavPrev() {
  const q = state.quiz;
  if (!q.viewingHistory) {
    // Currently on the active card — go to latest history
    if (q.history.length === 0) return;
    q.viewingHistory = true;
    q.historyIndex = q.history.length - 1;
  } else {
    if (q.historyIndex <= 0) return;
    q.historyIndex--;
  }
  showHistoryCard(q.historyIndex);
  updateNavBar();
}

function quizNavNext() {
  const q = state.quiz;
  if (!q.viewingHistory) {
    // On the active card — skip to next card (same as Next after answering)
    if (q.answered) {
      nextCard();
    }
    // If not answered, forward does nothing (can't skip unanswered)
    return;
  }

  q.historyIndex++;
  if (q.historyIndex >= q.history.length) {
    // Return to active card
    q.viewingHistory = false;
    restoreCurrentCard();
    updateNavBar();
    return;
  }

  showHistoryCard(q.historyIndex);
  updateNavBar();
}

function updateNavBar() {
  const q = state.quiz;
  const prevBtn = document.getElementById('quiz-nav-prev');
  const nextBtn = document.getElementById('quiz-nav-next');
  const posLabel = document.getElementById('quiz-nav-position');

  if (q.viewingHistory) {
    prevBtn.disabled = q.historyIndex <= 0;
    nextBtn.disabled = false;
    posLabel.textContent = `${q.historyIndex + 1} of ${q.history.length} reviewed`;
  } else {
    prevBtn.disabled = q.history.length === 0;
    nextBtn.disabled = !q.answered;
    posLabel.textContent = q.answered ? 'Current' : `${q.history.length} reviewed`;
  }
}

function restoreCurrentCard() {
  const q = state.quiz;
  document.getElementById('history-area').style.display = 'none';

  if (q.currentCard) {
    document.getElementById('quiz-question').textContent = q.currentCard.front;
    document.getElementById('quiz-card-type').textContent = '';
  }

  if (q.answered) {
    document.getElementById('result-area').style.display = '';
    document.getElementById('mcq-area').style.display = 'none';
    document.getElementById('free-area').style.display = 'none';
  } else if (q.currentCard) {
    // Use the stored mode — don't re-randomize
    const mode = q.currentMode || 'mcq';
    if (mode === 'mcq') {
      document.getElementById('mcq-area').style.display = '';
      document.getElementById('free-area').style.display = 'none';
    } else {
      document.getElementById('mcq-area').style.display = 'none';
      document.getElementById('free-area').style.display = '';
      // Restore grading toggle
      const hasApiKey = !!getApiKey();
      const gradingToggle = document.getElementById('quiz-grading-toggle');
      if (hasApiKey) {
        gradingToggle.style.display = '';
        document.querySelectorAll('.quiz-grade-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.quizgrade === (q.liveGrading || 'exact'));
        });
      }
    }
  }

  // Restore chat context
  if (q.currentCard) {
    chatCardId = q.currentCard.id;
    chatHistory = [];
  }
}

function showHistoryCard(index) {
  const q = state.quiz;
  const entry = q.history[index];
  if (!entry) return;

  // Hide active quiz areas
  document.getElementById('result-area').style.display = 'none';
  document.getElementById('mcq-area').style.display = 'none';
  document.getElementById('free-area').style.display = 'none';

  // Set question
  document.getElementById('quiz-question').textContent = entry.card.front;
  document.getElementById('quiz-card-type').textContent = `Review (${index + 1} of ${q.history.length})`;

  // Fill history area
  const historyResult = document.getElementById('history-result-message');
  historyResult.textContent = entry.correct ? 'Correct!' : 'Incorrect';
  historyResult.className = 'result-message ' + (entry.correct ? 'correct' : 'wrong');

  const yourAnswer = document.getElementById('history-your-answer');
  yourAnswer.textContent = `Your answer: ${entry.userAnswer || '(no answer)'}`;
  yourAnswer.style.display = '';

  document.getElementById('history-correct-answer').textContent = `Correct answer: ${entry.card.back}`;

  const feedbackEl = document.getElementById('history-feedback');
  const histVoteEl = document.getElementById('history-feedback-vote');
  if (entry.feedback) {
    feedbackEl.innerHTML = formatFeedback(entry.feedback);
    feedbackEl.className = 'ai-feedback ' + (entry.correct ? 'ai-feedback-correct' : 'ai-feedback-wrong');
    feedbackEl.style.display = '';
    histVoteEl.style.display = '';
    // Show saved vote state if any
    histVoteEl.querySelectorAll('.vote-btn').forEach(b => {
      b.classList.toggle('voted', entry.vote === (b.classList.contains('vote-up') ? 'up' : 'down'));
      b.disabled = !!entry.vote;
    });
  } else {
    feedbackEl.style.display = 'none';
    histVoteEl.style.display = 'none';
  }

  document.getElementById('history-area').style.display = '';

  // Update chat context
  chatCardId = entry.card.id;
  chatHistory = [];
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
function isChatOpen() {
  return document.getElementById('ai-chat-panel').style.display !== 'none';
}

document.addEventListener('keydown', e => {
  if (state.currentView !== 'quiz') {
    if (e.key === 'Escape') closeModal();
    return;
  }

  // When chat panel is open, don't let Enter/Space advance cards
  if (isChatOpen()) {
    if (e.key === 'Escape') {
      closeChatPanel();
      e.preventDefault();
    }
    return;
  }

  // When dispute modal is open, don't intercept keys
  if (document.getElementById('dispute-modal').style.display !== 'none') {
    if (e.key === 'Escape') {
      closeDisputeModal();
      e.preventDefault();
    }
    return;
  }

  // Arrow keys for nav (when not typing in input)
  const isTyping = document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT');
  if (e.key === 'ArrowLeft' && !isTyping) {
    e.preventDefault();
    quizNavPrev();
    return;
  }
  if (e.key === 'ArrowRight' && !isTyping) {
    e.preventDefault();
    quizNavNext();
    return;
  }

  // If viewing history, Enter returns to current card
  if (state.quiz.viewingHistory) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      quizNavNext();
    }
    return;
  }

  if (state.quiz.answered) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextCard();
    }
  } else if (e.key === 'Enter' && !e.shiftKey) {
    const freeArea = document.getElementById('free-area');
    if (freeArea.style.display !== 'none') {
      e.preventDefault();
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

function voteFeedback(vote, btn) {
  const container = btn.closest('.feedback-vote');
  // Disable both buttons and highlight the selected one
  container.querySelectorAll('.vote-btn').forEach(b => {
    b.disabled = true;
    b.classList.remove('voted');
  });
  btn.classList.add('voted');

  // Save vote to current history entry
  const q = state.quiz;
  if (q && q.history) {
    // Determine which history entry this belongs to
    if (container.id === 'history-feedback-vote' && q.viewingHistory) {
      q.history[q.historyIndex].vote = vote;
    } else if (q.history.length > 0) {
      q.history[q.history.length - 1].vote = vote;
    }
  }
}

function formatFeedback(text) {
  // Escape HTML first, then apply markdown-like formatting
  let s = esc(text);
  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italic*
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // `code`
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  return s;
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

  // Load tutor personality
  const tutor = getTutorPersonality();
  document.getElementById('tutor-theme').value = tutor.theme || '';
  document.getElementById('tutor-grade').value = tutor.grade || '';
  document.getElementById('tutor-name').value = tutor.name || '';

  document.querySelectorAll('.toggle-btn[data-strictness]').forEach(b => {
    b.classList.toggle('active', b.dataset.strictness === (tutor.strictness || 'normal'));
  });
  document.querySelectorAll('.toggle-btn[data-kindness]').forEach(b => {
    b.classList.toggle('active', b.dataset.kindness === (tutor.kindness || 'balanced'));
  });
  const styles = tutor.styles || [];
  document.querySelectorAll('.toggle-multi .toggle-btn[data-style]').forEach(b => {
    b.classList.toggle('active', styles.includes(b.dataset.style));
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

  // Save tutor personality
  const styles = [];
  document.querySelectorAll('.toggle-multi .toggle-btn[data-style].active').forEach(b => {
    styles.push(b.dataset.style);
  });
  const activeStrictness = document.querySelector('.toggle-btn[data-strictness].active');
  const activeKindness = document.querySelector('.toggle-btn[data-kindness].active');

  const tutor = {
    theme: document.getElementById('tutor-theme').value.trim(),
    strictness: activeStrictness ? activeStrictness.dataset.strictness : 'normal',
    kindness: activeKindness ? activeKindness.dataset.kindness : 'balanced',
    styles: styles,
    grade: document.getElementById('tutor-grade').value.trim(),
    name: document.getElementById('tutor-name').value.trim(),
  };
  localStorage.setItem('ankani_tutor', JSON.stringify(tutor));

  closeSettings();
}

function getTutorPersonality() {
  try {
    return JSON.parse(localStorage.getItem('ankani_tutor') || '{}');
  } catch (e) { return {}; }
}

function setTutorOption(type, value) {
  document.querySelectorAll(`.toggle-btn[data-${type}]`).forEach(b => {
    b.classList.toggle('active', b.dataset[type] === value);
  });
}

function toggleTutorStyle(btn) {
  btn.classList.toggle('active');
}

function buildTutorPrompt() {
  const tutor = getTutorPersonality();
  const parts = [];

  if (tutor.theme) {
    parts.push(`You are a tutor with a ${tutor.theme} theme. Stay in character — use references, quotes, vocabulary, and humor from ${tutor.theme}. Speak as if you are a character from that world.`);
  }

  if (tutor.name) {
    parts.push(`Address the student as "${tutor.name}".`);
  }

  const strictnessMap = {
    lenient: 'Be very lenient with grading — give the benefit of the doubt and accept close answers generously.',
    normal: '',
    strict: 'Be strict with grading — only accept answers that are clearly correct. Partial answers should be marked incorrect.',
    harsh: 'Be a harsh grader — only accept answers that are precise and complete. Be blunt when they get it wrong, but still teach them.',
  };
  if (tutor.strictness && strictnessMap[tutor.strictness]) {
    parts.push(strictnessMap[tutor.strictness]);
  }

  const kindnessMap = {
    'tough-love': 'Use a tough-love tone — be direct and no-nonsense, but you genuinely want them to succeed. Don\'t sugarcoat mistakes.',
    balanced: '',
    'very-kind': 'Be very kind and gentle — always find something positive to say, even when they get it wrong. Make them feel safe to make mistakes.',
    cheerleader: 'Be an enthusiastic cheerleader — celebrate every attempt, use lots of encouragement and excitement! Even wrong answers deserve praise for trying.',
  };
  if (tutor.kindness && kindnessMap[tutor.kindness]) {
    parts.push(kindnessMap[tutor.kindness]);
  }

  if (tutor.styles && tutor.styles.length > 0) {
    const styleDesc = tutor.styles.map(s => {
      switch (s) {
        case 'mnemonics': return 'memory tricks and mnemonics';
        case 'metaphors': return 'metaphors and analogies';
        case 'jokes': return 'humor and jokes';
        case 'examples': return 'real-world examples';
        case 'stories': return 'short stories or scenarios';
        case 'visual': return 'emojis and visual descriptions';
        default: return s;
      }
    }).join(', ');
    parts.push(`Use these teaching techniques: ${styleDesc}.`);
  }

  if (tutor.grade) {
    parts.push(`The student is at a ${tutor.grade} level — adjust your vocabulary and explanations accordingly.`);
  }

  return parts.join(' ');
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
        max_tokens: 300,
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

// --- Text-to-Speech (Auto-pronunciation) ---
const LANG_SPEECH_CODES = {
  en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT',
  ar: 'ar-SA', hi: 'hi-IN', ru: 'ru-RU', th: 'th-TH', he: 'he-IL', el: 'el-GR',
};

function speakText(text, langCode) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();

  function doSpeak() {
    const utterance = new SpeechSynthesisUtterance(text);
    const speechCode = LANG_SPEECH_CODES[langCode] || langCode || 'en-US';
    utterance.lang = speechCode;
    utterance.rate = 0.85;
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      const match = voices.find(v => v.lang === speechCode)
        || voices.find(v => v.lang.startsWith(langCode))
        || voices.find(v => v.lang.startsWith(speechCode.split('-')[0]));
      if (match) utterance.voice = match;
    }
    speechSynthesis.speak(utterance);
  }

  // Voices may not be loaded yet — retry after a short delay
  if (speechSynthesis.getVoices().length === 0) {
    setTimeout(doSpeak, 200);
  } else {
    doSpeak();
  }
}

// Preload voices (some browsers load them async)
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}

// --- Audio Functions ---
function uploadCardAudio(btn) {
  const row = btn.closest('.card-row');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 512000) {
      alert('Audio file too large (max 500KB). Use a shorter clip or lower quality.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      row.querySelector('.card-audio-data').value = dataUrl;
      row.querySelector('.audio-status').textContent = file.name;
      row.querySelector('.btn-audio-play').style.display = '';
      row.querySelector('.btn-audio-remove').style.display = '';
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function removeCardAudio(btn) {
  const row = btn.closest('.card-row');
  row.querySelector('.card-audio-data').value = '';
  row.querySelector('.audio-status').textContent = '';
  row.querySelector('.btn-audio-play').style.display = 'none';
  row.querySelector('.btn-audio-remove').style.display = 'none';
}

function previewCardAudio(btn) {
  const row = btn.closest('.card-row');
  const dataUrl = row.querySelector('.card-audio-data').value;
  if (dataUrl) {
    const audio = new Audio(dataUrl);
    audio.play().catch(() => {});
  }
}

function batchUploadAudio() {
  document.getElementById('batch-audio-input').click();
}

async function handleBatchAudio(input) {
  const files = Array.from(input.files);
  if (files.length === 0) return;

  const rows = document.querySelectorAll('.card-row');
  if (rows.length === 0) { alert('Add cards first before uploading audio.'); return; }

  // Read all files as data URLs
  const audioFiles = [];
  for (const file of files) {
    if (file.size > 512000) {
      alert(`${file.name} is too large (max 500KB). Skipping.`);
      continue;
    }
    const dataUrl = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
    audioFiles.push({ name: file.name, dataUrl });
  }

  if (audioFiles.length === 0) return;

  // If same number of files as cards, assign in order
  if (audioFiles.length === rows.length) {
    audioFiles.forEach((af, i) => {
      const row = rows[i];
      row.querySelector('.card-audio-data').value = af.dataUrl;
      row.querySelector('.audio-status').textContent = af.name;
      row.querySelector('.btn-audio-play').style.display = '';
      row.querySelector('.btn-audio-remove').style.display = '';
    });
    input.value = '';
    return;
  }

  // Try AI matching
  const apiKey = getApiKey();
  if (apiKey) {
    const cardList = Array.from(rows).map((row, i) => {
      const front = row.querySelector('.card-front').value.trim();
      const back = row.querySelector('.card-back').value.trim();
      return `${i + 1}. ${front} → ${back}`;
    }).join('\n');

    const fileList = audioFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n');

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
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Match these audio filenames to flashcards based on the filename content.

Audio files:
${fileList}

Cards:
${cardList}

Reply with ONLY a JSON array of matches: [{"file":1,"card":1},{"file":2,"card":3}]
Use 1-based indices. Only match files you're confident about. Omit uncertain matches.`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content[0].text.trim();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const matches = JSON.parse(jsonMatch[0]);
          matches.forEach(m => {
            const fileIdx = m.file - 1;
            const cardIdx = m.card - 1;
            if (audioFiles[fileIdx] && rows[cardIdx]) {
              const row = rows[cardIdx];
              row.querySelector('.card-audio-data').value = audioFiles[fileIdx].dataUrl;
              row.querySelector('.audio-status').textContent = audioFiles[fileIdx].name;
              row.querySelector('.btn-audio-play').style.display = '';
              row.querySelector('.btn-audio-remove').style.display = '';
            }
          });
          input.value = '';
          return;
        }
      }
    } catch (e) {
      console.error('AI audio matching failed:', e);
    }
  }

  // Fallback: assign in order up to the number of cards
  audioFiles.slice(0, rows.length).forEach((af, i) => {
    const row = rows[i];
    row.querySelector('.card-audio-data').value = af.dataUrl;
    row.querySelector('.audio-status').textContent = af.name;
    row.querySelector('.btn-audio-play').style.display = '';
    row.querySelector('.btn-audio-remove').style.display = '';
  });
  input.value = '';
}

// Quiz audio playback
function playQuizAudio() {
  const audioEl = document.getElementById('quiz-audio');
  if (audioEl.src && audioEl.src !== window.location.href) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  } else if (state.quiz.pendingTTS) {
    speakText(state.quiz.pendingTTS.text, state.quiz.pendingTTS.lang);
  }
}

function setupQuizAudio(card, deck, afterAnswer) {
  const audioBtn = document.getElementById('quiz-audio-btn');
  const audioEl = document.getElementById('quiz-audio');
  const isTranslation = deck && deck.learningLang;
  const hasFileAudio = !!card.audio;
  // Default autoAudio to true for language decks (for decks created before this setting existed)
  const deckAutoAudio = deck && deck.language && (deck.autoAudio !== false);
  const hasTTS = deckAutoAudio && ('speechSynthesis' in window);
  const hasAnyAudio = hasFileAudio || hasTTS;

  if (!hasAnyAudio) {
    audioBtn.style.display = 'none';
    audioEl.src = '';
    state.quiz.pendingAudio = false;
    state.quiz.pendingTTS = null;
    return;
  }

  // Store what to play
  if (hasFileAudio) {
    audioEl.src = card.audio;
    state.quiz.pendingTTS = null;
  } else {
    audioEl.src = '';
    state.quiz.pendingTTS = { text: card.back, lang: deck.language };
  }

  if (afterAnswer || !isTranslation) {
    audioBtn.style.display = '';
    if (hasFileAudio) {
      audioEl.play().catch(() => {});
    } else if (hasTTS) {
      speakText(card.back, deck.language);
    }
    state.quiz.pendingAudio = false;
  } else {
    // Translation direction — hide until answered
    audioBtn.style.display = 'none';
    state.quiz.pendingAudio = true;
  }
}

// --- Flag / Dispute Question ---
let disputeCard = null;
let disputeDeckId = null;

function openDisputeModal() {
  const q = state.quiz;
  let card;

  if (q.viewingHistory && q.history[q.historyIndex]) {
    card = q.history[q.historyIndex].card;
  } else {
    card = q.currentCard;
  }

  if (!card) return;
  disputeCard = card;

  // Find the deck for this card
  disputeDeckId = q.multiDeck ? (q.cardDeckMap[card.id] || q.deckId) : q.deckId;

  document.getElementById('dispute-card-info').innerHTML = `
    <span class="dispute-q"><strong>Q:</strong> ${esc(card.front)}</span>
    <span class="dispute-a"><strong>A:</strong> ${esc(card.back)}</span>
  `;
  document.getElementById('dispute-reason').value = '';
  document.getElementById('dispute-ai-response').style.display = 'none';
  document.getElementById('dispute-submit-btn').style.display = '';
  document.getElementById('dispute-submit-btn').disabled = false;
  document.getElementById('dispute-submit-btn').textContent = 'Ask AI to Review';
  document.getElementById('dispute-modal').style.display = '';
  document.getElementById('dispute-reason').focus();
}

function closeDisputeModal() {
  document.getElementById('dispute-modal').style.display = 'none';
  disputeCard = null;
  disputeDeckId = null;
}

async function submitDispute() {
  const reason = document.getElementById('dispute-reason').value.trim();
  if (!reason) {
    document.getElementById('dispute-reason').style.borderColor = 'var(--danger)';
    setTimeout(() => document.getElementById('dispute-reason').style.borderColor = '', 2000);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    // No API key — skip AI review, just offer delete
    document.getElementById('dispute-submit-btn').style.display = 'none';
    document.getElementById('dispute-ai-feedback').innerHTML = formatFeedback(
      'No API key configured for AI review. You can still delete the card if you believe it\'s wrong.'
    );
    document.getElementById('dispute-ai-feedback').className = 'ai-feedback ai-feedback-wrong';
    document.getElementById('dispute-ai-response').style.display = '';
    return;
  }

  const btn = document.getElementById('dispute-submit-btn');
  btn.textContent = 'Reviewing...';
  btn.disabled = true;

  try {
    const personality = buildTutorPrompt();
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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `A student is disputing a quiz question and wants to delete it. Review their complaint and give your honest assessment. ${personality}

Question: ${disputeCard.front}
Listed correct answer: ${disputeCard.back}

Student's complaint: ${reason}

Give your honest assessment in 2-4 sentences:
- If the student is RIGHT and the question/answer is genuinely wrong, misleading, or poorly worded, say so clearly and recommend deleting it.
- If the student is WRONG and the question is actually fine, explain why the answer is correct and suggest they keep studying it.
- If it's debatable, acknowledge both sides.

Be honest, not just agreeable. End with a clear recommendation: "I recommend deleting this card." or "I recommend keeping this card."`
        }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    const reply = data.content[0].text.trim();

    btn.style.display = 'none';
    document.getElementById('dispute-ai-feedback').innerHTML = formatFeedback(reply);
    const recommends = reply.toLowerCase().includes('recommend deleting');
    document.getElementById('dispute-ai-feedback').className =
      'ai-feedback ' + (recommends ? 'ai-feedback-wrong' : 'ai-feedback-correct');
    document.getElementById('dispute-ai-response').style.display = '';

  } catch (err) {
    btn.textContent = 'Ask AI to Review';
    btn.disabled = false;
    alert('AI review failed: ' + err.message);
  }
}

function confirmDeleteCard() {
  if (!disputeCard || !disputeDeckId) return;

  const deck = state.decks.find(d => d.id === disputeDeckId);
  if (deck) {
    deck.cards = deck.cards.filter(c => c.id !== disputeCard.id);
    saveState();
  }

  // Remove from quiz queue if present
  const q = state.quiz;
  if (q.queue) {
    q.queue = q.queue.filter(c => c.id !== disputeCard.id);
  }

  closeDisputeModal();

  // If we deleted the current card, move to next
  if (q.currentCard && q.currentCard.id === disputeCard.id) {
    showQuizCard();
  }
}

// --- AI Chat Panel ---
let chatHistory = [];
let chatCardId = null; // Track which card the chat is about

function toggleChatPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (panel.style.display === 'none') {
    openChatPanel();
  } else {
    closeChatPanel();
  }
}

function openChatPanel() {
  const panel = document.getElementById('ai-chat-panel');
  const card = state.quiz.currentCard;

  // Only reset chat if it's a different card
  if (!card || chatCardId !== card.id) {
    chatHistory = [];
    chatCardId = card ? card.id : null;
    const messages = document.getElementById('chat-messages');
    const greeting = card
      ? `Ask me anything about this card! I can explain "${card.front}", give examples, mnemonics, or help you understand the answer.`
      : 'Ask me anything! I can help you understand concepts, give examples, or explain answers.';
    messages.innerHTML = `<div class="chat-msg chat-ai">${formatFeedback(greeting)}</div>`;
  }

  panel.style.display = '';
  document.getElementById('chat-input').focus();
}

function closeChatPanel() {
  document.getElementById('ai-chat-panel').style.display = 'none';
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const apiKey = getApiKey();
  if (!apiKey) { openSettings(); return; }

  const messages = document.getElementById('chat-messages');
  const btn = document.getElementById('chat-send-btn');

  // Show user message
  messages.innerHTML += `<div class="chat-msg chat-user">${esc(message)}</div>`;
  input.value = '';

  // Show loading
  const loadingId = 'chat-loading-' + Date.now();
  messages.innerHTML += `<div class="chat-msg chat-ai chat-loading" id="${loadingId}">Thinking...</div>`;
  messages.scrollTop = messages.scrollHeight;
  btn.disabled = true;

  // Build context — use the card the chat was opened for, not necessarily the current quiz card
  const q = state.quiz;
  let chatCard = null;
  if (chatCardId && q.deckId) {
    const deck = state.decks.find(d => d.id === q.deckId);
    if (deck) chatCard = deck.cards.find(c => c.id === chatCardId);
  }
  if (!chatCard && chatCardId) {
    // Search all decks for multi-deck reviews
    for (const d of state.decks) {
      chatCard = d.cards.find(c => c.id === chatCardId);
      if (chatCard) break;
    }
  }
  // Fallback to current card
  if (!chatCard) chatCard = state.quiz.currentCard;

  const deckId = q.multiDeck && chatCard ? (q.cardDeckMap[chatCard.id] || q.deckId) : q.deckId;
  const deck = state.decks.find(d => d.id === deckId);
  const deckLang = deck ? (deck.language || '') : '';
  const langName = deckLang ? (LANG_NAMES[deckLang] || deckLang) : '';

  let cardContext = '';
  if (chatCard) {
    cardContext = `The student is studying a flashcard:\nQuestion: ${chatCard.front}\nCorrect answer: ${chatCard.back}`;
    if (langName) cardContext += `\nLanguage: ${langName}`;
  }

  // Add to chat history
  chatHistory.push({ role: 'user', content: message });

  try {
    const apiMessages = [
      { role: 'user', content: `You are a friendly, encouraging tutor helping a student study. Be concise (2-4 sentences). ${cardContext}\n\nThe student asks: ${message}` },
      ...chatHistory.slice(1) // skip first since we built it into the system-like first message
    ];

    // For multi-turn, build properly
    const fullMessages = chatHistory.length <= 1
      ? [{ role: 'user', content: `You are a friendly, encouraging tutor helping a student study. Be concise (2-4 sentences). ${cardContext}\n\nStudent: ${message}` }]
      : buildChatMessages(cardContext, chatHistory);

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
        max_tokens: 300,
        system: `You are a tutor helping a student study. Be concise (2-4 sentences per response). ${buildTutorPrompt()} ${cardContext}`,
        messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
      })
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content[0].text.trim();

    chatHistory.push({ role: 'assistant', content: reply });

    // Replace loading with response
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
      loadingEl.className = 'chat-msg chat-ai';
      loadingEl.innerHTML = formatFeedback(reply);
      loadingEl.removeAttribute('id');
    }
  } catch (err) {
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
      loadingEl.className = 'chat-msg chat-ai';
      loadingEl.textContent = 'Sorry, something went wrong. Try again.';
      loadingEl.removeAttribute('id');
    }
    // Remove failed message from history
    chatHistory.pop();
  }

  btn.disabled = false;
  messages.scrollTop = messages.scrollHeight;
  input.focus();
}

// Enter to send in chat
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('chat-input')) {
    e.preventDefault();
    sendChatMessage();
  }
});

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

  // Extra quality checks
  const extraRules = [];
  if (document.getElementById('ai-check-no-visuals').checked) {
    extraRules.push('IMPORTANT: The student cannot see any images, graphs, diagrams, or charts. If the source material references visuals (e.g., "the graph below", "as shown in the figure", "look at the diagram"), you MUST rephrase the question so it can be answered WITHOUT seeing the visual. Describe the relevant data or concept in words instead of referring to the visual.');
  }
  if (document.getElementById('ai-check-equal-length').checked) {
    extraRules.push('IMPORTANT: For multiple choice questions, make ALL answer choices roughly equal in length. The correct answer should NOT be noticeably longer or more detailed than the wrong answers. Avoid the pattern where the longest, most specific answer is always correct. Mix it up.');
  }
  const extraInstructions = extraRules.length > 0 ? '\n\n' + extraRules.join('\n\n') : '';

  // Check deck language learning settings
  const deckLearningLang = document.getElementById('deck-learning-lang').checked && document.getElementById('deck-language').value;
  const deckRomanized = document.getElementById('deck-romanized').checked;
  const deckLangCode = document.getElementById('deck-language').value;
  const deckLangName = LANG_NAMES[deckLangCode] || '';

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
          content: (questionType === 'vocabulary' || deckLearningLang)
            ? buildLangPrompt(cardCount, includeWrong, deckLangName, sourceContext, deckRomanized, extraInstructions)
            : `Generate exactly ${cardCount} quiz/flashcard cards.

CRITICAL QUALITY RULES — FOLLOW THESE EXACTLY:
1. Every question MUST be a COMPLETE sentence that makes sense on its own. Test: could a student read JUST the question and know exactly what's being asked?
   - BAD: "How do you politely say" ← INCOMPLETE, say WHAT?
   - GOOD: "How do you politely say 'thank you' in Mandarin Chinese?"
   - BAD: "What is" ← INCOMPLETE
   - GOOD: "What is the Mandarin Chinese word for 'hello'?"
   - BAD: "What Mandarin Chinese phrase is u" ← CUT OFF
   - GOOD: "What Mandarin Chinese phrase means 'sorry' or 'excuse me'?"
2. Every answer MUST be a complete, specific response — not a vague description.
3. Every wrong answer (W line) MUST be a complete answer of similar length to the correct answer. No fragments like "means" or partial words.
4. NEVER use | inside an answer — only use | to SEPARATE wrong answers from each other on the W: line.
5. If the student mentions they CANNOT read a script (e.g., "can't read hanzi", "no kanji"), ALL answers and wrong answers MUST be in romanization/phonetic form ONLY. NO characters from that script.
6. Read the student's notes/instructions carefully and follow them.

${typeInstructions}

${wrongInstructions}${extraInstructions}

IMPORTANT: Output ONLY the cards in the exact format. No numbering, no extra text.

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

    // Determine card mode and grading to set per card
    const perCardMode = cardMode === 'both' ? 'deck' : cardMode;
    const gradingSelect = document.getElementById('ai-grading-mode').value;

    // Add cards to the form
    cards.forEach(card => {
      let cardGrading = gradingSelect;
      if (gradingSelect === 'auto') {
        // AI decides: use AI grading for free response / conceptual, exact for MCQ / factual
        if (perCardMode === 'free' || questionType === 'conceptual' || questionType === 'fill-blank') {
          cardGrading = 'ai';
        } else if (perCardMode === 'mcq') {
          cardGrading = 'deck'; // MCQ doesn't need grading mode
        } else {
          cardGrading = 'ai';
        }
      }
      addCardRow(card.front, card.back, card.wrongAnswers || [], perCardMode, cardGrading);
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

function buildLangPrompt(cardCount, includeWrong, langName, sourceContext, romanized, extraInstructions) {
  const lang = langName || 'the target language';

  // Determine answer format based on romanization setting
  let answerFormat, exampleQ1, exampleA1, exampleQ2, exampleA2;
  let exampleW1 = '', exampleW2 = '';
  let wrongFormat = '';

  if (romanized) {
    answerFormat = `Answers MUST be in romanization/phonetic spelling ONLY.
NEVER use native script characters (no hanzi, no kanji, no hangul, no kana, no Arabic script, etc.).
Use standard romanization: pinyin for Chinese, romaji for Japanese, revised romanization for Korean, etc.
Include tone marks for tonal languages (e.g., nǐ hǎo, xièxiè).`;

    exampleQ1 = `hello`;
    exampleA1 = lang.includes('Chinese') ? 'nǐ hǎo' : lang.includes('Japanese') ? 'konnichiwa' : 'hello equivalent';
    exampleQ2 = `thank you`;
    exampleA2 = lang.includes('Chinese') ? 'xièxiè' : lang.includes('Japanese') ? 'arigatou' : 'thank you equivalent';

    if (includeWrong) {
      exampleW1 = lang.includes('Chinese') ? '\nW: zàijiàn | duìbùqǐ | bù kèqi' : '\nW: sayounara | sumimasen | douitashimashite';
      exampleW2 = lang.includes('Chinese') ? '\nW: nǐ hǎo | duìbùqǐ | zàijiàn' : '\nW: konnichiwa | sumimasen | sayounara';
      wrongFormat = `\nW: [wrong1 in romanization] | [wrong2 in romanization] | [wrong3 in romanization]`;
    }
  } else {
    const isJapanese = lang.toLowerCase().includes('japanese');
    answerFormat = isJapanese
      ? `Answers MUST be in hiragana ONLY. NEVER use kanji. Only use katakana for loanwords.`
      : `Answers should be in ${lang} native script.`;

    exampleQ1 = 'fire';
    exampleA1 = isJapanese ? 'ほのお' : 'fire equivalent';
    exampleQ2 = 'water';
    exampleA2 = isJapanese ? 'みず' : 'water equivalent';

    if (includeWrong) {
      exampleW1 = isJapanese ? '\nW: みず | くうき | ひ' : '\nW: wrong1 | wrong2 | wrong3';
      exampleW2 = isJapanese ? '\nW: かぜ | つち | ほのお' : '\nW: wrong1 | wrong2 | wrong3';
      wrongFormat = `\nW: [wrong1] | [wrong2] | [wrong3]`;
    }
  }

  return `Generate exactly ${cardCount} ${lang} vocabulary/phrase flashcards in WaniKani style.

STRICT RULES:
1. Question = a single English word or short phrase. NO "What is", NO "How do you say". JUST the English meaning.
2. Answer = the ${lang} translation. ONE word or short phrase only.
3. ${answerFormat}
4. Wrong answers (W line) must be complete ${lang} words in the SAME format as the correct answer. No fragments.
5. Do NOT use | inside any answer. Only use | to separate wrong answers from each other.

FORMAT — follow this EXACTLY:
Q: ${exampleQ1}
A: ${exampleA1}${exampleW1}

Q: ${exampleQ2}
A: ${exampleA2}${exampleW2}

Generate ${cardCount} cards in this format:
Q: [English word or phrase]
A: [${lang} translation]${wrongFormat}

${sourceContext ? sourceContext + '\n\nUse vocabulary related to the source material above.' : `Use common, practical ${lang} words and phrases suitable for a beginner.`}
${extraInstructions}

Output ONLY the cards. No numbering, no explanations, no extra text.`;
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

// --- Auto-resize textarea ---
document.addEventListener('input', e => {
  if (e.target.id === 'free-input') {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
  }
});

// --- Init ---
loadState();
updateReviewBadge();
navigate('dashboard');

// Auto-refresh: update badge and dashboard every 60 seconds so reviews appear when due
setInterval(() => {
  updateReviewBadge();
  if (state.currentView === 'dashboard') {
    renderDashboard();
  }
}, 60000);
