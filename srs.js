// ===== Spaced Repetition System (Modified SM-2) =====
// WaniKani-style stages: New → Apprentice 1-4 → Guru 1-2 → Master → Enlightened → Burned

const SRS = {
  // Intervals in milliseconds
  INTERVALS: [
    0,              // 0: New (immediate)
    4 * 3600000,    // 1: Apprentice 1 → 4 hours
    8 * 3600000,    // 2: Apprentice 2 → 8 hours
    24 * 3600000,   // 3: Apprentice 3 → 1 day
    3 * 86400000,   // 4: Apprentice 4 → 3 days
    7 * 86400000,   // 5: Guru 1 → 1 week
    14 * 86400000,  // 6: Guru 2 → 2 weeks
    30 * 86400000,  // 7: Master → 1 month
    120 * 86400000, // 8: Enlightened → 4 months
    120 * 86400000, // 9: Burned → 4 months (comes back for reinforcement)
  ],

  STAGE_NAMES: [
    'New', 'Apprentice 1', 'Apprentice 2', 'Apprentice 3', 'Apprentice 4',
    'Guru 1', 'Guru 2', 'Master', 'Enlightened', 'Burned'
  ],

  STAGE_CLASSES: [
    'new', 'apprentice', 'apprentice', 'apprentice', 'apprentice',
    'guru', 'guru', 'master', 'enlightened', 'burned'
  ],

  // Get the SRS stage category for card list dot color
  getStageCategory(stage) {
    if (stage === 0) return 'new';
    if (stage <= 4) return 'learning';
    if (stage <= 6) return 'review';
    return 'mature';
  },

  // Calculate next review date based on grade
  // grade: 0=Again, 1=Hard, 2=Good, 3=Easy
  getNextInterval(currentStage, grade) {
    let nextStage;
    switch (grade) {
      case 0: // Again - drop back significantly
        nextStage = Math.max(0, currentStage - 2);
        break;
      case 1: // Hard - drop back one
        nextStage = Math.max(0, currentStage - 1);
        break;
      case 2: // Good - advance one
        nextStage = Math.min(9, currentStage + 1);
        break;
      case 3: // Easy - advance two
        nextStage = Math.min(9, currentStage + 2);
        break;
      default:
        nextStage = currentStage;
    }
    return nextStage;
  },

  getIntervalMs(stage) {
    return this.INTERVALS[stage] || this.INTERVALS[this.INTERVALS.length - 1];
  },

  // Preview intervals for the SRS buttons
  previewIntervals(currentStage) {
    return [0, 1, 2, 3].map(grade => {
      const nextStage = this.getNextInterval(currentStage, grade);
      return this.formatInterval(this.INTERVALS[nextStage] || 0);
    });
  },

  formatInterval(ms) {
    if (ms === 0) return 'Now';
    if (ms === Infinity) return 'Never';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(ms / 3600000);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(ms / 86400000);
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.round(days / 7)}w`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.round(months / 12)}y`;
  },

  formatTimeUntil(timestamp) {
    if (!timestamp) return 'New';
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return 'Due now';
    return `in ${this.formatInterval(diff)}`;
  },

  isDue(card) {
    if (!card.srs.nextReview) return true; // New card
    // Cards are due if their review time is within the current hour
    // (like WaniKani — reviews become available at the top of the hour)
    const now = new Date();
    const endOfCurrentHour = new Date(now);
    endOfCurrentHour.setMinutes(59, 59, 999);
    return endOfCurrentHour.getTime() >= card.srs.nextReview;
  },

  // Create a new card SRS data object
  newCardData() {
    return {
      stage: 0,
      nextReview: null,
      totalReviews: 0,
      correctCount: 0,
      lastReview: null,
    };
  },

  // Update card after review
  reviewCard(card, grade) {
    const nextStage = this.getNextInterval(card.srs.stage, grade);
    card.srs.stage = nextStage;
    card.srs.totalReviews++;
    if (grade >= 2) card.srs.correctCount++;
    card.srs.lastReview = Date.now();

    // Even at stage 0 after a wrong answer, schedule for Apprentice 1 interval (4h)
    const interval = nextStage === 0 ? this.INTERVALS[1] : this.getIntervalMs(nextStage);
    card.srs.nextReview = Date.now() + interval;

    return card;
  }
};
