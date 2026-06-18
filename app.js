const DATASET = window.PAIN_CLINIC_QUESTIONS;
const QUESTIONS = DATASET && Array.isArray(DATASET.questions) ? DATASET.questions : [];
const DISPLAY_LABELS = ["ア", "イ", "ウ", "エ", "オ"];
const CYCLE_COUNTS = [1, 5, 10, 30];
const EXAM_DATE = { year: 2027, month: 1, day: 9 };
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_KEY = "painClinicExamHistory:v1";
const EXPLANATION_EDITS_KEY = "painClinicExplanationEdits:v1";
const STUDY_META_KEY = "painClinicStudyMeta:v1";
const STUDY_GAP_WARNING_DAYS = 3;
const STREAK_MILESTONE_DAYS = 10;
const STREAK_MILESTONE_MESSAGE = "がんばっておるな。この調子じゃ";

const els = {
  datasetBadge: document.querySelector("#datasetBadge"),
  examCountdown: document.querySelector("#examCountdown"),
  examCountdownText: document.querySelector("#examCountdownText"),
  studyWarning: document.querySelector("#studyWarning"),
  setupView: document.querySelector("#setupView"),
  quizView: document.querySelector("#quizView"),
  resultsView: document.querySelector("#resultsView"),
  historyView: document.querySelector("#historyView"),
  setupForm: document.querySelector("#setupForm"),
  yearFilters: document.querySelector("#yearFilters"),
  cycleInfo: document.querySelector("#cycleInfo"),
  yearSummary: document.querySelector("#yearSummary"),
  totalQuestionCount: document.querySelector("#totalQuestionCount"),
  historySummary: document.querySelector("#historySummary"),
  historyButton: document.querySelector("#historyButton"),
  mistakeTrainingButton: document.querySelector("#mistakeTrainingButton"),
  exportEditsButton: document.querySelector("#exportEditsButton"),
  importEditsButton: document.querySelector("#importEditsButton"),
  importEditsInput: document.querySelector("#importEditsInput"),
  exitQuizButton: document.querySelector("#exitQuizButton"),
  progressLabel: document.querySelector("#progressLabel"),
  questionOrigin: document.querySelector("#questionOrigin"),
  progressBar: document.querySelector("#progressBar"),
  selectionHint: document.querySelector("#selectionHint"),
  questionPrompt: document.querySelector("#questionPrompt"),
  choiceList: document.querySelector("#choiceList"),
  validationMessage: document.querySelector("#validationMessage"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  scoreRing: document.querySelector("#scoreRing"),
  scoreValue: document.querySelector("#scoreValue"),
  scoreTotal: document.querySelector("#scoreTotal"),
  mentorCard: document.querySelector("#mentorCard"),
  mentorMessage: document.querySelector("#mentorMessage"),
  streakCard: document.querySelector("#streakCard"),
  streakMessage: document.querySelector("#streakMessage"),
  retryButton: document.querySelector("#retryButton"),
  newQuizButton: document.querySelector("#newQuizButton"),
  resultList: document.querySelector("#resultList"),
  historyTrainingButton: document.querySelector("#historyTrainingButton"),
  historyBackButton: document.querySelector("#historyBackButton"),
  historyStats: document.querySelector("#historyStats"),
  historyList: document.querySelector("#historyList"),
};

const state = {
  session: [],
  answers: new Map(),
  currentIndex: 0,
  lastSettings: null,
  lastCourse: null,
  selectedYears: new Set(),
};

function unique(values) {
  return Array.from(new Set(values));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeDigits(text) {
  return String(text).replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function getRequiredCount(question) {
  const normalized = normalizeDigits(question.prompt);
  const match = normalized.match(/([1-5])\s*つ/);
  if (match) {
    return Number(match[1]);
  }
  return question.invalidQuestion ? 2 : question.answers.length;
}

function getSelectedIds(questionId) {
  return state.answers.get(questionId) || [];
}

function setSelectedIds(questionId, ids) {
  state.answers.set(questionId, ids);
}

function setView(viewName) {
  els.setupView.classList.toggle("hidden", viewName !== "setup");
  els.quizView.classList.toggle("hidden", viewName !== "quiz");
  els.resultsView.classList.toggle("hidden", viewName !== "results");
  els.historyView.classList.toggle("hidden", viewName !== "history");
}

function getTokyoDateParts(date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  return {
    year: Number((parts.find((part) => part.type === "year") || {}).value),
    month: Number((parts.find((part) => part.type === "month") || {}).value),
    day: Number((parts.find((part) => part.type === "day") || {}).value),
  };
}

function getDayNumber({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function getDaysUntilExam(now = new Date()) {
  const today = getTokyoDateParts(now);
  return getDayNumber(EXAM_DATE) - getDayNumber(today);
}

function getTodayDayNumber(now = new Date()) {
  return getDayNumber(getTokyoDateParts(now));
}

function getDayNumberFromDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return getTodayDayNumber(date);
}

function getCountdownTone(days) {
  if (days <= 30) {
    return "red";
  }
  if (days <= 100) {
    return "yellow";
  }
  return "green";
}

function renderExamCountdown() {
  if (!els.examCountdown || !els.examCountdownText) {
    return;
  }

  const days = getDaysUntilExam();
  const displayDays = Math.abs(days);
  els.examCountdownText.textContent =
    days >= 0 ? `試験日まであと${displayDays}日` : `試験日から${displayDays}日経過`;
  els.examCountdown.classList.remove("countdown-green", "countdown-yellow", "countdown-red");
  els.examCountdown.classList.add(`countdown-${getCountdownTone(days)}`);
}

function loadStudyMeta() {
  try {
    const raw = window.localStorage.getItem(STUDY_META_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStudyMeta(meta) {
  try {
    window.localStorage.setItem(STUDY_META_KEY, JSON.stringify(meta));
  } catch {
    window.alert("学習日の保存ができませんでした。ブラウザの保存設定を確認してください。");
  }
}

function getStoredDayNumber(meta, dayKey, dateKey) {
  const storedDay = Number(meta[dayKey]);
  if (Number.isFinite(storedDay)) {
    return storedDay;
  }
  return getDayNumberFromDateTime(meta[dateKey]);
}

function shouldShowStudyWarning(meta = loadStudyMeta(), now = new Date()) {
  const firstStudyDay = getStoredDayNumber(meta, "firstStudyDay", "firstStartedAt");
  const lastStudyDay = getStoredDayNumber(meta, "lastStudyDay", "lastStudiedAt");
  if (!Number.isFinite(firstStudyDay) || !Number.isFinite(lastStudyDay)) {
    return false;
  }
  return getTodayDayNumber(now) - lastStudyDay >= STUDY_GAP_WARNING_DAYS;
}

function renderStudyWarning() {
  if (!els.studyWarning) {
    return;
  }
  els.studyWarning.classList.toggle("hidden", !shouldShowStudyWarning());
}

function applyStudyActivityMeta(meta, now = new Date()) {
  const todayDay = getTodayDayNumber(now);
  const timestamp = now.toISOString();

  if (!meta.firstStartedAt) {
    meta.firstStartedAt = timestamp;
  }
  if (!Number.isFinite(Number(meta.firstStudyDay))) {
    const firstStudyDay = getDayNumberFromDateTime(meta.firstStartedAt);
    meta.firstStudyDay = firstStudyDay === null ? todayDay : firstStudyDay;
  }
  meta.lastStudiedAt = timestamp;
  meta.lastStudyDay = todayDay;

  return { todayDay, timestamp };
}

function recordStudyActivity(now = new Date()) {
  const meta = loadStudyMeta();
  applyStudyActivityMeta(meta, now);
  saveStudyMeta(meta);
  renderStudyWarning();
}

function getCurrentAnswerStreak(meta) {
  const streak = Number(meta.answerStreakDays);
  return Number.isFinite(streak) && streak > 0 ? streak : 0;
}

function recordStudyCompletion(now = new Date()) {
  const meta = loadStudyMeta();
  const previousAnsweredDay = getStoredDayNumber(meta, "lastAnsweredDay", "lastAnsweredAt");
  const { todayDay, timestamp } = applyStudyActivityMeta(meta, now);
  let streakDays = getCurrentAnswerStreak(meta);

  if (previousAnsweredDay === todayDay) {
    streakDays = Math.max(streakDays, 1);
  } else if (previousAnsweredDay === todayDay - 1) {
    streakDays = Math.max(streakDays, 1) + 1;
  } else {
    streakDays = 1;
    meta.lastStreakMilestone = 0;
  }

  const lastMilestone = Number(meta.lastStreakMilestone) || 0;
  const milestoneHit =
    streakDays >= STREAK_MILESTONE_DAYS &&
    streakDays % STREAK_MILESTONE_DAYS === 0 &&
    streakDays > lastMilestone;

  meta.lastAnsweredAt = timestamp;
  meta.lastAnsweredDay = todayDay;
  meta.answerStreakDays = streakDays;
  if (milestoneHit) {
    meta.lastStreakMilestone = streakDays;
  }

  saveStudyMeta(meta);
  renderStudyWarning();
  return { streakDays, milestoneHit };
}

function renderStreakMessage(streakInfo) {
  if (!els.streakCard || !els.streakMessage) {
    return;
  }

  const showMessage = Boolean(streakInfo && streakInfo.milestoneHit);
  els.streakCard.classList.toggle("hidden", !showMessage);
  if (showMessage) {
    els.streakMessage.textContent = STREAK_MILESTONE_MESSAGE;
  }
}

function byYearThenNumber(a, b) {
  return a.year - b.year || a.number - b.number;
}

function orderByYear(questions, order) {
  const sortedYears = unique(questions.map((question) => question.year)).sort((a, b) => a - b);
  const orderedQuestions = [];

  for (const year of sortedYears) {
    const yearQuestions = questions.filter((question) => question.year === year);
    const orderedYearQuestions = order === "random" ? shuffle(yearQuestions) : [...yearQuestions].sort(byYearThenNumber);
    orderedQuestions.push(...orderedYearQuestions);
  }

  return orderedQuestions;
}

function getSelectedCycleCount() {
  const selectedCycleInput = els.setupForm.querySelector("input[name='cycleCount']:checked");
  const selectedValue = Number(selectedCycleInput ? selectedCycleInput.value : undefined);
  return CYCLE_COUNTS.includes(selectedValue) ? selectedValue : 5;
}

function syncYearChecks() {
  for (const button of els.yearFilters.querySelectorAll(".year-check")) {
    const selected = button.classList.contains("selected");
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function getSelectedYears() {
  const years = [];
  for (const button of els.yearFilters.querySelectorAll(".year-check.selected")) {
    const year = Number(button.dataset.year);
    if (Number.isFinite(year)) {
      years.push(year);
    }
  }
  return years.sort((a, b) => a - b);
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    window.alert("履歴を保存できませんでした。ブラウザの保存設定を確認してください。");
  }
}

function loadExplanationEdits() {
  try {
    const raw = window.localStorage.getItem(EXPLANATION_EDITS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveExplanationEdits(edits) {
  try {
    window.localStorage.setItem(EXPLANATION_EDITS_KEY, JSON.stringify(edits));
  } catch {
    window.alert("解説を保存できませんでした。ブラウザの保存設定を確認してください。");
  }
}

// 自分で編集した解説をファイルに書き出す（端末間で移すため）
function exportExplanationEdits() {
  const edits = loadExplanationEdits();
  const count = Object.keys(edits).length;
  if (count === 0) {
    window.alert("書き出す編集がありません。先に解説を編集して保存してください。");
    return;
  }
  const payload = {
    type: "painClinicExplanationEdits",
    version: 1,
    exportedAt: new Date().toISOString(),
    edits,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  link.href = url;
  link.download = `explanation-edits-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ファイルから編集を読み込む（既存の編集に上書きマージ）
function importExplanationEdits(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let incoming = null;
    try {
      const data = JSON.parse(String(reader.result));
      if (data && data.edits && typeof data.edits === "object") {
        incoming = data.edits;
      } else if (data && typeof data === "object") {
        incoming = data;
      }
    } catch {
      window.alert("ファイルを読み込めませんでした。書き出したJSONファイルか確認してください。");
      return;
    }
    if (!incoming || typeof incoming !== "object") {
      window.alert("ファイルの形式が正しくありません。");
      return;
    }
    const current = loadExplanationEdits();
    const merged = { ...current, ...incoming };
    saveExplanationEdits(merged);
    const added = Object.keys(incoming).length;
    window.alert(`${added}件の編集を読み込みました。問題を開くと反映されます。`);
  };
  reader.onerror = () => {
    window.alert("ファイルの読み込み中にエラーが発生しました。");
  };
  reader.readAsText(file);
}

function getOfficialExplanation(question) {
  return question.explanation || "この問題にはPDF上の解説文がありません。";
}

function getEditedExplanation(questionId, edits = loadExplanationEdits()) {
  const edit = edits[questionId];
  return edit && typeof edit.text === "string" ? edit.text : "";
}

function getDisplayExplanation(question, edits = loadExplanationEdits()) {
  const edited = getEditedExplanation(question.id, edits);
  return edited || getOfficialExplanation(question);
}

function hasEditedExplanation(questionId, edits = loadExplanationEdits()) {
  return Boolean(getEditedExplanation(questionId, edits));
}

function saveEditedExplanation(questionId, text) {
  const edits = loadExplanationEdits();
  const trimmed = text.trim();
  if (!trimmed) {
    delete edits[questionId];
  } else {
    edits[questionId] = {
      text: trimmed,
      updatedAt: new Date().toISOString(),
    };
  }
  saveExplanationEdits(edits);
}

function clearEditedExplanation(questionId) {
  const edits = loadExplanationEdits();
  delete edits[questionId];
  saveExplanationEdits(edits);
}

function getQuestionHistory(questionId, history = loadHistory()) {
  return Array.isArray(history[questionId]) ? history[questionId] : [];
}

function getLatestAttempt(questionId, history = loadHistory()) {
  const attempts = getQuestionHistory(questionId, history);
  return attempts.length ? attempts[attempts.length - 1] : null;
}

function recordAttemptResults(results) {
  const history = loadHistory();
  const completedAt = new Date().toISOString();

  for (const result of results) {
    const { question } = result.item;
    const attempts = getQuestionHistory(question.id, history);
    attempts.push({
      at: completedAt,
      correct: result.correct,
      selectedIds: result.selectedIds,
    });
    history[question.id] = attempts.slice(-80);
  }

  saveHistory(history);
}

function getLatestWrongQuestions(history = loadHistory()) {
  return QUESTIONS.filter((question) => {
    const latest = getLatestAttempt(question.id, history);
    return latest && latest.correct === false;
  }).sort(byYearThenNumber);
}

function getHistoryStats(history = loadHistory()) {
  let attemptedQuestions = 0;
  let totalAttempts = 0;
  let latestCorrect = 0;
  let latestWrong = 0;

  for (const question of QUESTIONS) {
    const attempts = getQuestionHistory(question.id, history);
    if (!attempts.length) {
      continue;
    }
    attemptedQuestions += 1;
    totalAttempts += attempts.length;
    if (attempts[attempts.length - 1].correct) {
      latestCorrect += 1;
    } else {
      latestWrong += 1;
    }
  }

  return { attemptedQuestions, latestCorrect, latestWrong, totalAttempts };
}

function renderHistorySummary() {
  const stats = getHistoryStats();
  const wrongCount = stats.latestWrong;
  const hasWrong = wrongCount > 0;
  const cycleCount = getSelectedCycleCount();
  const trainingLabel =
    wrongCount > cycleCount
      ? `直前特訓（${cycleCount}/${wrongCount}問）`
      : hasWrong
        ? `直前特訓（${wrongCount}問）`
        : "直前特訓";

  els.historySummary.textContent = stats.totalAttempts
    ? `${stats.totalAttempts}回回答 / 直近不正解 ${wrongCount}問`
    : "履歴なし";
  els.mistakeTrainingButton.disabled = !hasWrong;
  els.mistakeTrainingButton.textContent = trainingLabel;
  els.historyTrainingButton.disabled = !hasWrong;
  els.historyTrainingButton.textContent = trainingLabel;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function renderHistoryView() {
  const history = loadHistory();
  const stats = getHistoryStats(history);
  const rows = QUESTIONS.map((question) => ({ question, attempts: getQuestionHistory(question.id, history) }));

  els.historyStats.innerHTML = `
    <div><strong>${stats.totalAttempts}</strong><span>回答回数</span></div>
    <div><strong>${stats.attemptedQuestions}</strong><span>着手済み</span></div>
    <div><strong>${stats.latestCorrect}</strong><span>直近正解</span></div>
    <div><strong>${stats.latestWrong}</strong><span>直近不正解</span></div>
  `;

  els.historyList.innerHTML = "";
  for (const row of rows) {
    els.historyList.append(renderHistoryCard(row.question, row.attempts));
  }

  renderHistorySummary();
  setView("history");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistoryCard(question, attempts) {
  const card = document.createElement("article");
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  const correctCount = attempts.filter((attempt) => attempt.correct).length;
  const wrongCount = attempts.length - correctCount;
  const statusClass = latest ? (latest.correct ? "correct" : "incorrect") : "empty";
  const statusText = latest ? (latest.correct ? "直近 正解" : "直近 不正解") : "未挑戦";

  card.className = `history-card ${statusClass}`;
  card.innerHTML = `
    <div class="history-card-main">
      <div class="history-card-title">
        <span class="history-origin">${question.year}年 第${question.number}問</span>
        <span class="history-status ${statusClass}">${statusText}</span>
      </div>
      <p>${escapeHtml(question.prompt)}</p>
      <div class="history-counts">
        <span>正解 ${correctCount}</span>
        <span>誤答 ${wrongCount}</span>
        <span>合計 ${attempts.length}</span>
      </div>
    </div>
    <div class="history-trail"></div>
  `;

  const trail = card.querySelector(".history-trail");
  if (!attempts.length) {
    trail.innerHTML = `<span class="history-empty">まだ回答していません</span>`;
    return card;
  }

  for (const attempt of attempts) {
    const chip = document.createElement("span");
    chip.className = `history-chip ${attempt.correct ? "correct" : "incorrect"}`;
    chip.textContent = `${attempt.correct ? "○" : "×"} ${formatDateTime(attempt.at)}`;
    trail.append(chip);
  }

  return card;
}

function renderSetup() {
  renderExamCountdown();
  renderStudyWarning();

  if (!QUESTIONS.length) {
    els.datasetBadge.textContent = "データなし";
    els.setupForm.innerHTML = "<p>問題データを読み込めませんでした。</p>";
    return;
  }

  const years = unique(QUESTIONS.map((question) => question.year)).sort((a, b) => a - b);
  state.selectedYears = new Set(years);
  els.datasetBadge.textContent = `${years[0]}-${years[years.length - 1]} / ${QUESTIONS.length}問`;
  els.totalQuestionCount.textContent = String(QUESTIONS.length);

  els.yearFilters.innerHTML = years
    .map(
      (year) => `
        <button type="button" class="year-check selected" data-year="${year}" aria-pressed="true">${year}年</button>
      `,
    )
    .join("");
  syncYearChecks();

  els.yearSummary.innerHTML = years
    .map((year) => {
      const count = QUESTIONS.filter((question) => question.year === year).length;
      return `<div><strong>${year}年</strong><span>${count}問</span></div>`;
    })
    .join("");

  renderHistorySummary();
}

function readSettings() {
  const selectedYears = getSelectedYears();
  const count = getSelectedCycleCount();
  const selectedOrderInput = els.setupForm.querySelector("input[name='order']:checked");
  const selectedOrder = selectedOrderInput ? selectedOrderInput.value : undefined;
  const order = selectedOrder === "random" ? "random" : "number";
  return { selectedYears, count, order };
}

function buildSession(settings) {
  const pool = QUESTIONS.filter((question) => settings.selectedYears.includes(question.year));
  const orderedPool = orderByYear(pool, settings.order);
  const desiredCount = CYCLE_COUNTS.includes(settings.count) ? settings.count : 5;
  const picked = orderedPool.slice(0, Math.min(desiredCount, orderedPool.length));

  return makeSession(picked);
}

function makeSession(questions) {
  return questions.map((question) => ({
    question,
    choices: shuffle(question.choices).map((choice, index) => ({
      ...choice,
      displayLabel: DISPLAY_LABELS[index] || String(index + 1),
    })),
  }));
}

function startQuiz(settings) {
  if (!settings.selectedYears.length) {
    window.alert("年度を1つ以上選択してください。");
    return;
  }

  state.session = buildSession(settings);
  if (!state.session.length) {
    window.alert("出題できる問題がありません。");
    return;
  }

  state.answers = new Map();
  state.currentIndex = 0;
  state.lastSettings = settings;
  state.lastCourse = { type: "normal", settings };
  recordStudyActivity();
  setView("quiz");
  renderQuestion();
}

function startQuestionCourse(questions, course) {
  state.session = makeSession(questions);
  if (!state.session.length) {
    window.alert("出題できる問題がありません。");
    return;
  }

  state.answers = new Map();
  state.currentIndex = 0;
  state.lastSettings = null;
  state.lastCourse = course;
  recordStudyActivity();
  setView("quiz");
  renderQuestion();
}

function startMistakeTraining(reuseLastCourse = false) {
  let questions = [];
  if (reuseLastCourse && state.lastCourse && state.lastCourse.type === "mistake") {
    const ids = state.lastCourse.questionIds || [];
    questions = ids.map((id) => QUESTIONS.find((question) => question.id === id)).filter(Boolean);
  } else {
    questions = shuffle(getLatestWrongQuestions()).slice(0, getSelectedCycleCount());
  }

  if (!questions.length) {
    window.alert("直近で間違えた問題はまだありません。");
    renderHistorySummary();
    return;
  }

  startQuestionCourse(questions, {
    type: "mistake",
    questionIds: questions.map((question) => question.id),
  });
}

function renderQuestion() {
  const item = state.session[state.currentIndex];
  const { question } = item;
  const selectedIds = getSelectedIds(question.id);
  const requiredCount = getRequiredCount(question);
  const progress = ((state.currentIndex + 1) / state.session.length) * 100;

  els.progressLabel.textContent = `${state.currentIndex + 1} / ${state.session.length}`;
  els.questionOrigin.textContent = `${question.year}年 第${question.number}問`;
  els.progressBar.style.width = `${progress}%`;
  els.selectionHint.textContent = `${requiredCount}個選択`;
  els.questionPrompt.textContent = question.prompt;
  els.validationMessage.textContent = "";
  els.prevButton.disabled = state.currentIndex === 0;
  els.nextButton.textContent = state.currentIndex === state.session.length - 1 ? "結果を見る" : "次へ";

  els.choiceList.innerHTML = "";
  for (const choice of item.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice-button${selectedIds.includes(choice.id) ? " selected" : ""}`;
    button.setAttribute("aria-pressed", selectedIds.includes(choice.id) ? "true" : "false");
    button.innerHTML = `
      <span class="choice-marker">${choice.displayLabel}</span>
      <span class="choice-text"></span>
    `;
    button.querySelector(".choice-text").textContent = choice.text;
    button.addEventListener("click", () => toggleChoice(choice.id, requiredCount));
    els.choiceList.append(button);
  }
}

function toggleChoice(choiceId, requiredCount) {
  const questionId = state.session[state.currentIndex].question.id;
  const selected = getSelectedIds(questionId);
  if (selected.includes(choiceId)) {
    setSelectedIds(
      questionId,
      selected.filter((id) => id !== choiceId),
    );
    renderQuestion();
    return;
  }

  if (selected.length >= requiredCount) {
    els.validationMessage.textContent = `${requiredCount}個まで選択できます。`;
    return;
  }

  setSelectedIds(questionId, [...selected, choiceId]);
  renderQuestion();
}

function canLeaveCurrentQuestion() {
  const question = state.session[state.currentIndex].question;
  const requiredCount = getRequiredCount(question);
  const selectedCount = getSelectedIds(question.id).length;
  if (selectedCount !== requiredCount) {
    els.validationMessage.textContent = `${requiredCount}個選択してください。`;
    return false;
  }
  return true;
}

function isCorrect(question, selectedIds) {
  if (question.invalidQuestion) {
    return true;
  }
  return getAcceptedAnswerSets(question).some((answerSet) => sameAnswerSet(selectedIds, answerSet));
}

function getAcceptedAnswerSets(question) {
  if (Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
    return question.acceptedAnswers;
  }
  return [question.answers];
}

function sameAnswerSet(left, right) {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

function isOfficialChoice(question, choiceId) {
  if (question.invalidQuestion) {
    return true;
  }
  return getAcceptedAnswerSets(question).some((answerSet) => answerSet.includes(choiceId));
}

function labelForChoice(item, choiceId) {
  const choice = item.choices.find((candidate) => candidate.id === choiceId);
  return choice && choice.displayLabel ? choice.displayLabel : choiceId;
}

function formatSelectedLabels(item, ids) {
  if (!ids.length) {
    return "未回答";
  }
  return ids.map((id) => labelForChoice(item, id)).join("、");
}

function formatOfficialAnswer(item) {
  const { question } = item;
  if (question.invalidQuestion) {
    return "全員正解";
  }
  return getAcceptedAnswerSets(question)
    .map((answerSet) => formatSelectedLabels(item, answerSet))
    .join(" または ");
}

function getMentorBand(score, total) {
  if (!total) {
    return 0;
  }
  return Math.floor((score / total) * 5);
}

function getMentorMessage(score, total) {
  if (total === 1) {
    return score === 1 ? "この調子でがんばれ" : "もっと勉強せい";
  }

  const band = getMentorBand(score, total);
  if (band === 5) {
    return "この調子でがんばれ";
  }
  if (band === 4) {
    return "もう少し";
  }
  if (band === 3) {
    return "合格までまだまだ";
  }
  if (band === 2) {
    return "しっかり勉強しろ";
  }
  return "気合いいれろ";
}

function shouldShowHarisen(score, total) {
  return total > 1 && getMentorBand(score, total) <= 1;
}

function showResults() {
  const results = state.session.map((item) => {
    const selectedIds = getSelectedIds(item.question.id);
    return {
      item,
      selectedIds,
      correct: isCorrect(item.question, selectedIds),
    };
  });
  const score = results.filter((result) => result.correct).length;
  const total = results.length;
  const degrees = total ? Math.round((score / total) * 360) : 0;

  recordAttemptResults(results);
  const streakInfo = recordStudyCompletion();
  els.scoreValue.textContent = String(score);
  els.scoreTotal.textContent = `/ ${total}`;
  els.mentorMessage.textContent = getMentorMessage(score, total);
  els.mentorCard.classList.toggle("harisen-mode", shouldShowHarisen(score, total));
  renderStreakMessage(streakInfo);
  els.scoreRing.style.setProperty("--score", `${degrees}deg`);
  els.resultList.innerHTML = "";

  for (const result of results) {
    els.resultList.append(renderResultCard(result));
  }

  renderHistorySummary();
  setView("results");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderResultCard(result) {
  const { item, selectedIds, correct } = result;
  const { question } = item;
  const card = document.createElement("article");
  card.className = `result-card ${correct ? "correct" : "incorrect"}`;

  const statusText = correct ? "正解" : "不正解";
  const officialAnswer = formatOfficialAnswer(item);
  const explanationEdits = loadExplanationEdits();
  const explanation = getDisplayExplanation(question, explanationEdits);
  const isEditedExplanation = hasEditedExplanation(question.id, explanationEdits);
  const explanationLabel = isEditedExplanation ? "保存済み解説" : "公式解説";

  card.innerHTML = `
    <div class="result-card-header">
      <h3>${question.year}年 第${question.number}問　${escapeHtml(question.prompt)}</h3>
      <span class="result-status ${correct ? "correct" : "incorrect"}">${statusText}</span>
    </div>
    <div class="result-body">
      <div class="review-tags">
        <span class="review-tag">回答: ${escapeHtml(formatSelectedLabels(item, selectedIds))}</span>
        <span class="review-tag">正答: ${escapeHtml(officialAnswer)}</span>
      </div>
      <div class="review-choice-list"></div>
      <div class="explanation-block">
        <div class="explanation-heading">
          <strong>${explanationLabel}</strong>
          <span>${isEditedExplanation ? "自分で編集した内容を表示中" : "PDFから抽出した内容を表示中"}</span>
        </div>
        <div class="explanation">${escapeHtml(explanation)}</div>
      </div>
      <div class="explanation-editor">
        <label for="editor-${question.id}">解説を編集</label>
        <textarea id="editor-${question.id}" rows="5" spellcheck="false"></textarea>
        <div class="editor-actions">
          <button class="secondary-action save-explanation-button" type="button">保存</button>
          <button class="ghost-button reset-explanation-button" type="button">公式に戻す</button>
          <span class="editor-status" aria-live="polite"></span>
        </div>
      </div>
      ${question.references ? `<div class="references">${escapeHtml(question.references)}</div>` : ""}
    </div>
  `;

  const reviewList = card.querySelector(".review-choice-list");
  for (const choice of item.choices) {
    const isUserChoice = selectedIds.includes(choice.id);
    const isCorrectChoice = isOfficialChoice(question, choice.id);
    const row = document.createElement("div");
    row.className = [
      "review-choice",
      isUserChoice ? "user-choice" : "",
      isCorrectChoice ? "correct-choice" : "",
    ]
      .filter(Boolean)
      .join(" ");
    row.innerHTML = `
      <span class="choice-marker">${choice.displayLabel}</span>
      <span>${escapeHtml(choice.text)}</span>
    `;
    reviewList.append(row);
  }

  setupExplanationEditor(card, question);
  return card;
}

function setupExplanationEditor(card, question) {
  const textarea = card.querySelector("textarea");
  const saveButton = card.querySelector(".save-explanation-button");
  const resetButton = card.querySelector(".reset-explanation-button");
  const status = card.querySelector(".editor-status");
  const explanationNode = card.querySelector(".explanation");
  const heading = card.querySelector(".explanation-heading strong");
  const headingNote = card.querySelector(".explanation-heading span");

  function refreshEditor(message = "") {
    const edits = loadExplanationEdits();
    const edited = getEditedExplanation(question.id, edits);
    const hasEdit = Boolean(edited);
    const displayText = getDisplayExplanation(question, edits);

    textarea.value = displayText;
    explanationNode.textContent = displayText;
    heading.textContent = hasEdit ? "保存済み解説" : "公式解説";
    headingNote.textContent = hasEdit ? "自分で編集した内容を表示中" : "PDFから抽出した内容を表示中";
    status.textContent = message;
  }

  saveButton.addEventListener("click", () => {
    saveEditedExplanation(question.id, textarea.value);
    refreshEditor("保存しました");
  });

  resetButton.addEventListener("click", () => {
    clearEditedExplanation(question.id);
    refreshEditor("公式解説に戻しました");
  });

  refreshEditor();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

els.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startQuiz(readSettings());
});

els.setupForm.addEventListener("change", (event) => {
  if (event.target && event.target.name === "cycleCount") {
    renderHistorySummary();
  }
  if (event.target && event.target.name === "year") {
    syncYearChecks();
  }
});

// 年度はボタンで実装する（iPad/iOS Safari でも確実にタップで切り替わる）。
// クイズの選択肢ボタンと同じ仕組みなので、ラベル+チェックボックス方式で
// 起きていた iPad の不具合を根本的に回避する。
els.yearFilters.addEventListener("click", (event) => {
  const button = event.target.closest(".year-check");
  if (!button || !els.yearFilters.contains(button)) {
    return;
  }
  button.classList.toggle("selected");
  button.setAttribute("aria-pressed", button.classList.contains("selected") ? "true" : "false");
});

els.nextButton.addEventListener("click", () => {
  if (!canLeaveCurrentQuestion()) {
    return;
  }
  if (state.currentIndex === state.session.length - 1) {
    showResults();
    return;
  }
  state.currentIndex += 1;
  renderQuestion();
});

els.prevButton.addEventListener("click", () => {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    renderQuestion();
  }
});

els.exitQuizButton.addEventListener("click", () => {
  renderHistorySummary();
  setView("setup");
});

els.retryButton.addEventListener("click", () => {
  if (state.lastCourse && state.lastCourse.type === "mistake") {
    startMistakeTraining(true);
  } else if (state.lastSettings) {
    startQuiz(state.lastSettings);
  }
});

els.newQuizButton.addEventListener("click", () => {
  renderHistorySummary();
  setView("setup");
});

els.historyButton.addEventListener("click", () => {
  renderHistoryView();
});

els.mistakeTrainingButton.addEventListener("click", () => {
  startMistakeTraining();
});

els.historyTrainingButton.addEventListener("click", () => {
  startMistakeTraining();
});

els.historyBackButton.addEventListener("click", () => {
  renderHistorySummary();
  setView("setup");
});

els.exportEditsButton.addEventListener("click", () => {
  exportExplanationEdits();
});

els.importEditsButton.addEventListener("click", () => {
  els.importEditsInput.click();
});

els.importEditsInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) {
    importExplanationEdits(file);
  }
  event.target.value = "";
});

renderSetup();
