import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Book, Volume2, ArrowRight, CheckCircle2, XCircle, RotateCcw, BrainCircuit, GraduationCap, Check, Play, PlayCircle, Download, Upload, Trash2, Lightbulb, CalendarClock, Keyboard, Save, UploadCloud, Sparkles, Wand2, Flame, TrendingUp, Target, Quote, ChevronRight, Search, LogIn, LogOut, UserRound, UserPlus, Sun, Moon } from 'lucide-react';
import cet4Raw from './data/cet4.txt?raw';
import cet6Raw from './data/cet6.txt?raw';

// --- 解析工具（支持解析 KyleBing 仓库的 txt 和普通 json）---
const parseTxt = (text, bookId, bookName) => {
  const lines = text.split('\n');
  const words = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let word = '', meaningRaw = '', phonetic = '';
    
    const parts = line.split('\t');
    if (parts.length >= 3) {
      word = parts[0].trim();
      phonetic = parts[1].trim();
      meaningRaw = parts.slice(2).join(' ').trim();
    } else if (parts.length >= 2) {
      word = parts[0].trim();
      meaningRaw = parts.slice(1).join(' ').trim();
    } else {
      const firstSpace = line.indexOf(' ');
      if (firstSpace !== -1) {
        word = line.substring(0, firstSpace).trim();
        meaningRaw = line.substring(firstSpace + 1).trim();
      }
    }

    if (word && meaningRaw) {
      const match = meaningRaw.match(/^([a-zA-Z]+\.)\s*(.*)/);
      let pos = '';
      let meaning = meaningRaw;
      if (match) {
        pos = match[1];
        meaning = match[2] || meaningRaw;
      }
      words.push({
        id: `${bookId}_${index}`,
        bookId,
        word, phonetic, pos, meaning, exampleEn: '', exampleZh: ''
      });
    }
  });
  return { id: bookId, name: bookName, words };
};

const parseJson = (jsonData, bookId, bookName) => {
  if (!Array.isArray(jsonData)) throw new Error("JSON data must be an array");
  const words = jsonData.map((item, index) => {
    const word = item.word || item.name || Object.keys(item)[0] || "unknown";
    let meaning = item.meaning || item.trans || "";
    const phoneticRaw = item.phonetic || item.usphone || item.ukphone || '';
    if (Array.isArray(meaning)) meaning = meaning.join('; ');
    return {
      id: `${bookId}_${index}`,
      bookId,
      word,
      phonetic: phoneticRaw
        ? (String(phoneticRaw).startsWith('/') ? String(phoneticRaw) : `/${String(phoneticRaw)}/`)
        : '',
      pos: item.pos || '',
      meaning: typeof meaning === 'string' ? meaning : JSON.stringify(meaning),
      exampleEn: item.example || '',
      exampleZh: item.exampleZh || ''
    };
  }).filter(w => w.word !== "unknown");
  return { id: bookId, name: bookName, words };
};

const SAME_DAY_REVIEW_DELAY_MS = 0;

// --- SRS 核心算法 (SuperMemo-2) ---
const calculateSM2 = (grade, repetition, interval, easeFactor) => {
  let newRepetition = repetition;
  let newInterval = interval;
  let newEaseFactor = easeFactor;
  let nextReviewDelay = SAME_DAY_REVIEW_DELAY_MS;

  if (grade >= 3) {
    if (repetition === 0) {
      // The first successful recall should come back again the same day.
      newInterval = 0;
      nextReviewDelay = SAME_DAY_REVIEW_DELAY_MS;
    } else if (repetition === 1) {
      newInterval = 1;
      nextReviewDelay = 1 * 24 * 60 * 60 * 1000;
    } else {
      newInterval = Math.max(2, Math.round(interval * easeFactor));
      nextReviewDelay = newInterval * 24 * 60 * 60 * 1000;
    }
    newRepetition += 1;
  } else {
    newRepetition = 0;
    newInterval = 0;
    nextReviewDelay = SAME_DAY_REVIEW_DELAY_MS;
  }

  newEaseFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  return {
    repetition: newRepetition,
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReview: Date.now() + nextReviewDelay // 未来的时间戳
  };
};

// 辅助函数：生成单选题选项（包含词性和词义）
const generateMCOptions = (correctWord, allBooks) => {
  const allOptions = [];
  const correctFormatted = `${correctWord.pos ? correctWord.pos + ' ' : ''}${correctWord.meaning}`;

  Object.values(allBooks).forEach(book => {
    book.words.forEach(w => {
      const formatted = `${w.pos ? w.pos + ' ' : ''}${w.meaning}`;
      if (formatted && formatted !== correctFormatted) {
        allOptions.push(formatted);
      }
    });
  });
  
  const uniqueOptions = [...new Set(allOptions)].sort(() => 0.5 - Math.random());
  const wrongOptions = uniqueOptions.slice(0, 3);
  
  while (wrongOptions.length < 3) {
    wrongOptions.push(`干扰选项 ${Math.random().toString(36).substring(7)}`);
  }
  
  return [correctFormatted, ...wrongOptions].sort(() => 0.5 - Math.random());
};

const BUILT_IN_BOOKS = {
  kb_cet4: parseTxt(cet4Raw, 'kb_cet4', '四级核心'),
  kb_cet6: parseTxt(cet6Raw, 'kb_cet6', '六级进阶')
};

const splitBookIntoChunks = (book, chunkSize = 2000) => {
  const totalChunks = Math.ceil(book.words.length / chunkSize);

  return Object.fromEntries(
    Array.from({ length: totalChunks }, (_, chunkIndex) => {
      const start = chunkIndex * chunkSize;
      const end = start + chunkSize;
      const chunkWords = book.words.slice(start, end);
      const chunkNumber = chunkIndex + 1;

      return [
        `${book.id}_part_${chunkNumber}`,
        {
          id: `${book.id}_part_${chunkNumber}`,
          name: `${book.name} ${chunkNumber}`,
          words: chunkWords.map((word) => ({
            ...word,
            bookId: `${book.id}_part_${chunkNumber}`,
            sourceBookId: book.id
          })),
          sourceBookId: book.id
        }
      ];
    })
  );
};

const CHUNKED_BUILT_IN_BOOKS = {
  ...splitBookIntoChunks(BUILT_IN_BOOKS.kb_cet4),
  ...splitBookIntoChunks(BUILT_IN_BOOKS.kb_cet6)
};

const EXAMPLE_BATCH_SIZE = 20;
const EXAMPLE_REQUEST_TIMEOUT_MS = 15000;
const REVIEW_SENTENCE_MISTAKE_THRESHOLD = 2;
const NORMAL_SESSION_BATCH_SIZE = 10;
const LEARNING_PAGE_DEMO_WORDS = [
  {
    id: 'demo_0',
    bookId: 'demo_book',
    word: 'paradox',
    phonetic: '/藞p忙r蓹d蓲ks/',
    pos: 'n.',
    meaning: 'paradox; self-contradiction',
    exampleEn: 'It sounds like a paradox, but both ideas are true.',
    exampleZh: 'This sounds like a paradox, but both ideas are true.',
  },
  {
    id: 'demo_1',
    bookId: 'demo_book',
    word: 'access',
    phonetic: '/藞忙kses/',
    pos: 'n.',
    meaning: '入口；使用权',
    exampleEn: 'Students have access to the lab after class.',
    exampleZh: 'Students can use the lab after class.',
  },
  {
    id: 'demo_2',
    bookId: 'demo_book',
    word: 'generous',
    phonetic: '/藞d蕭en蓹r蓹s/',
    pos: 'adj.',
    meaning: 'generous; willing to share',
    exampleEn: 'She was generous enough to share her notes.',
    exampleZh: 'She was generous enough to share her notes.',
  }
];
const normalizeTopicKey = (topic) => topic.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeBookName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeExampleKey = (word, meaning) =>
  `${String(word || '').trim().toLowerCase()}__${String(meaning || '').trim()}`;
const tokenizeTopic = (topic) =>
  String(topic || '')
    .toLowerCase()
    .match(/[a-z0-9\u4e00-\u9fa5]+/g) || [];
const BOOK_LIBRARY_FILTERS = ['全部', '四级', '六级', '考研', '其他'];

const getBookCategory = (book) => {
  const name = String(book?.name || '').toLowerCase();
  if (name.includes('四级') || name.includes('cet4')) return '四级';
  if (name.includes('六级') || name.includes('cet6')) return '六级';
  if (name.includes('考研') || name.includes('netem')) return '考研';
  return '其他';
};

const getBookDescription = (book) => {
  if (book?.aiTopicKey) return 'AI-selected topic book built from the local vocabulary pool.';
  const category = getBookCategory(book);
  if (category === '四级') return 'Core CET-4 vocabulary for daily memorization and review.';
  if (category === '六级') return 'Advanced CET-6 vocabulary for reading and writing growth.';
  if (category === '考研') return 'Core postgraduate exam vocabulary for long-term review.';
  return 'Add this book to your home page and keep tracking your study progress.';
};

const VIEW_PATHS = {
  home: '/',
  library: '/library',
  login: '/login',
  register: '/register'
};

const getInitialViewFromPath = () => {
  if (typeof window === 'undefined') return 'home';
  const pathname = window.location.pathname || '/';
  if (pathname === '/library') return 'library';
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  return 'home';
};
const safeReadStorageJson = (key, fallbackValue) => {
  if (typeof window === 'undefined') return fallbackValue;

  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallbackValue;
  } catch (error) {
    console.warn(`Failed to read localStorage key: ${key}`, error);
    return fallbackValue;
  }
};

const safeWriteStorageJson = (key, value) => {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Failed to write localStorage key: ${key}`, error);
    return false;
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = EXAMPLE_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const mergeBookWords = (existingWords, incomingWords, bookId) => {
  const mergedMap = new Map();

  [...existingWords, ...incomingWords].forEach((word, index) => {
    const dedupeKey = `${String(word.word || '').trim().toLowerCase()}__${String(word.meaning || '').trim()}`;
    if (!dedupeKey || mergedMap.has(dedupeKey)) return;
    mergedMap.set(dedupeKey, {
      ...word,
      id: `${bookId}_${mergedMap.size || index}`
    });
  });

  return Array.from(mergedMap.values()).map((word, index) => ({
    ...word,
    id: `${bookId}_${index}`
  }));
};

const findExistingAiBook = (books, topicKey, topic) => {
  const expectedName = normalizeBookName(`${topic}词书`);
  return Object.values(books).find(
    (item) => item.aiTopicKey === topicKey || normalizeBookName(item.name) === expectedName
  );
};

export default function VocabularyMaster() {
  const [view, setView] = useState(getInitialViewFromPath); 
  const [sessionType, setSessionType] = useState('normal'); // 'normal' 或 'smart_review'
  const [selectedBook, setSelectedBook] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [exampleGenerationState, setExampleGenerationState] = useState({ bookId: null, completed: 0, total: 0 });
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('全部');
  
  // 1. 本地存储：复习进度持久化
  const [userProgress, setUserProgress] = useState(() =>
    safeReadStorageJson('vocab_master_progress', {})
  );

  // 2. 本地存储：导入的自定义词库持久化
  const [customBooks, setCustomBooks] = useState(() =>
    safeReadStorageJson('vocab_master_custom_books', {})
  );
  const [hiddenBookIds, setHiddenBookIds] = useState(() =>
    safeReadStorageJson('vocab_master_hidden_books', [])
  );
  const [selectedBookIds, setSelectedBookIds] = useState(() =>
    safeReadStorageJson('vocab_master_selected_books', [])
  );
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [userSettings, setUserSettings] = useState({});
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', username: '' });
  const [themeMode, setThemeMode] = useState(() => safeReadStorageJson('vocab_master_theme', 'light'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    safeWriteStorageJson('vocab_master_theme', themeMode);
  }, [themeMode]);

  const toggleTheme = () => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    safeWriteStorageJson('vocab_master_progress', userProgress);
  }, [userProgress]);

  useEffect(() => {
    safeWriteStorageJson('vocab_master_hidden_books', hiddenBookIds);
  }, [hiddenBookIds]);

  useEffect(() => {
    safeWriteStorageJson('vocab_master_selected_books', selectedBookIds);
  }, [selectedBookIds]);

  const ALL_BOOKS = useMemo(() => ({ ...CHUNKED_BUILT_IN_BOOKS, ...customBooks }), [customBooks]);
  const ALL_BOOK_LIST = useMemo(() => Object.values(ALL_BOOKS), [ALL_BOOKS]);
  const WORD_META_MAP = useMemo(() => Object.fromEntries(
    ALL_BOOK_LIST.flatMap((book) =>
      book.words.map((word) => [
        word.id,
        {
          bookId: word.bookId || book.id,
          sourceBookId: word.sourceBookId || book.sourceBookId || book.id,
          word
        }
      ])
    )
  ), [ALL_BOOK_LIST]);
  const isBuiltInBook = (bookId) => Boolean(CHUNKED_BUILT_IN_BOOKS[bookId]);
  const MY_BOOKS = selectedBookIds
    .map((bookId) => ALL_BOOKS[bookId])
    .filter(Boolean);
  const MY_BOOKS_MAP = Object.fromEntries(MY_BOOKS.map((book) => [book.id, book]));

  useEffect(() => {
    setSelectedBookIds((prev) => prev.filter((bookId) => Boolean(ALL_BOOKS[bookId])));
  }, [customBooks]);

  const apiFetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { error: rawText || `Request failed (${response.status})` };
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
  };

  const buildProgressPayloadItem = (wordId, progress) => {
    const meta = WORD_META_MAP[wordId];
    if (!meta) return null;

    const nextReviewTimestamp =
      typeof progress?.nextReview === 'number'
        ? progress.nextReview
        : progress?.nextReviewAt
          ? Date.parse(progress.nextReviewAt)
          : null;

    return {
      id: `${meta.bookId}:${wordId}`,
      bookId: meta.bookId,
      wordId,
      status: progress?.status || '',
      lastReviewedAt: progress?.lastReviewedAt || null,
      nextReviewAt: nextReviewTimestamp ? new Date(nextReviewTimestamp).toISOString() : null,
      progress
    };
  };

  const addCustomBook = (book) => {
    setCustomBooks(prev => {
      const next = { ...prev, [book.id]: book };
      safeWriteStorageJson('vocab_master_custom_books', next);
      return next;
    });
    setHiddenBookIds(prev => prev.filter(id => id !== book.id));
    setSelectedBookIds(prev => (prev.includes(book.id) ? prev : [...prev, book.id]));
    if (authUser) {
      apiFetchJson('/api/user/books', {
        method: 'POST',
        body: JSON.stringify({ bookId: book.id })
      }).catch((error) => console.warn('Failed to persist custom book selection', error));
    }
  };

  const addBookToHome = (bookId) => {
    setSelectedBookIds((prev) => (prev.includes(bookId) ? prev : [...prev, bookId]));
    if (authUser) {
      apiFetchJson('/api/user/books', {
        method: 'POST',
        body: JSON.stringify({ bookId })
      }).catch((error) => console.warn('Failed to persist selected books', error));
    }
  };

  const removeBookFromHome = (bookId) => {
    setSelectedBookIds((prev) => prev.filter((id) => id !== bookId));
    if (selectedBook === bookId) {
      setSelectedBook(null);
      if (!['home', 'library'].includes(view)) {
        setView('home');
      }
    }
    if (authUser) {
      apiFetchJson(`/api/user/books/${encodeURIComponent(bookId)}`, {
        method: 'DELETE',
        headers: {}
      }).catch((error) => console.warn('Failed to remove selected book from D1', error));
    }
  };

  const toggleBookSelection = (bookId) => {
    if (selectedBookIds.includes(bookId)) {
      removeBookFromHome(bookId);
      return;
    }
    addBookToHome(bookId);
  };

  const addOrMergeAiBook = (book, topic) => {
    const topicKey = normalizeTopicKey(topic);
    let mergedIntoExisting = false;
    let targetBookId = book.id;

    setCustomBooks(prev => {
      const next = { ...prev };
      const existingBook = findExistingAiBook(prev, topicKey, topic);
      targetBookId = existingBook?.id || book.id;

      if (existingBook) {
        mergedIntoExisting = true;
        next[existingBook.id] = {
          ...existingBook,
          name: `${topic}词书`,
          aiTopicKey: topicKey,
          words: mergeBookWords(existingBook.words, book.words, existingBook.id)
        };
      } else {
        next[book.id] = {
          ...book,
          name: `${topic}词书`,
          aiTopicKey: topicKey
        };
      }

      safeWriteStorageJson('vocab_master_custom_books', next);
      return next;
    });

    setHiddenBookIds(prev => prev.filter(id => id !== targetBookId));
    setSelectedBookIds(prev => (prev.includes(targetBookId) ? prev : [...prev, targetBookId]));
    if (authUser) {
      apiFetchJson('/api/user/books', {
        method: 'POST',
        body: JSON.stringify({ bookId: targetBookId })
      }).catch((error) => console.warn('Failed to persist AI book selection', error));
    }
    return mergedIntoExisting;
  };

  const saveBookOverride = (book) => {
    setCustomBooks(prev => {
      const next = { ...prev, [book.id]: book };
      safeWriteStorageJson('vocab_master_custom_books', next);
      return next;
    });
  };

  const enrichExamplesForBook = async (bookId, targetWords, { showCompletionAlert = false } = {}) => {
    const book = ALL_BOOKS[bookId];
    if (!book || !Array.isArray(targetWords) || targetWords.length === 0) {
      return 0;
    }

    let workingBook = {
      ...(customBooks[bookId] || book),
      sourceBookId: book.sourceBookId || book.id,
      words: [...book.words]
    };

    setExampleGenerationState({ bookId, completed: 0, total: targetWords.length });

    for (let start = 0; start < targetWords.length; start += EXAMPLE_BATCH_SIZE) {
      const batch = targetWords.slice(start, start + EXAMPLE_BATCH_SIZE);
      let res;
      try {
        res = await fetchWithTimeout('/api/generate-examples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookName: book.name,
            words: batch.map(({ word, pos, meaning }) => ({ word, pos, meaning }))
          })
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('Example request timed out. Please try again later.');
        }
        throw error;
      }

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: `Server returned a non-JSON response: ${rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `Example generation failed (HTTP ${res.status})`);
      }

      const examplesMap = new Map(
        (data.examples || []).map((item) => [
          normalizeExampleKey(item.word, item.meaning),
          item
        ])
      );

      workingBook = {
        ...workingBook,
        words: workingBook.words.map((item) => {
          const matched = examplesMap.get(normalizeExampleKey(item.word, item.meaning));
          if (!matched) return item;
          return {
            ...item,
            exampleEn: matched.exampleEn || item.exampleEn,
            exampleZh: matched.exampleZh || item.exampleZh
          };
        })
      };

      saveBookOverride(workingBook);
      setExampleGenerationState({
        bookId,
        completed: Math.min(start + batch.length, targetWords.length),
        total: targetWords.length
      });
    }

    if (showCompletionAlert) {
      alert(`Examples for ${book.name} are ready. Sentence practice is now available.`);
    }

    return workingBook;
  };

  // Session State (Learning Phase)
  const [queue, setQueue] = useState([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [learnedInSession, setLearnedInSession] = useState([]);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);
  const [nextBatchPreviewCount, setNextBatchPreviewCount] = useState(0);
  const activeLearningQueue = queue.length ? queue : LEARNING_PAGE_DEMO_WORDS;
  
  // 3-Stage Learning State
  const [learnStage, setLearnStage] = useState(1); // 1:灞曠ず, 2:娴嬮獙, 3:宸╁浐
  const [mcOptions, setMcOptions] = useState([]);
  const [mcFeedback, setMcFeedback] = useState(null);

  // Spelling State
  const [spellingQueue, setSpellingQueue] = useState([]);
  const [currentSpellingIndex, setCurrentSpellingIndex] = useState(0);
  const [spellingInput, setSpellingInput] = useState('');
  const [spellingFeedback, setSpellingFeedback] = useState(null);
  const [currentWordMistakes, setCurrentWordMistakes] = useState(0);
  
  // Sentence Practice State
  const [sentenceQueue, setSentenceQueue] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [sentenceInput, setSentenceInput] = useState('');
  const [showSentenceAnswer, setShowSentenceAnswer] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [sentenceSubmitted, setSentenceSubmitted] = useState(false);
  const [sentenceHadMistake, setSentenceHadMistake] = useState(false);

  const inputRef = useRef(null);
  const sentenceInputRef = useRef(null);
  const voicesRef = useRef([]);
  const audioRef = useRef(null);
  const isRemoteHydratingRef = useRef(false);
  const guestSnapshotRef = useRef({
    userProgress,
    hiddenBookIds,
    selectedBookIds
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      guestSnapshotRef.current = {
        userProgress,
        hiddenBookIds,
        selectedBookIds
      };
    }
  }, [authUser, userProgress, hiddenBookIds, selectedBookIds]);

  const loadRemoteUserData = async () => {
    isRemoteHydratingRef.current = true;
    try {
      const [booksData, progressData, favoritesData, settingsData] = await Promise.all([
        apiFetchJson('/api/user/books'),
        apiFetchJson('/api/user/progress'),
        apiFetchJson('/api/user/favorites'),
        apiFetchJson('/api/user/settings')
      ]);

      setSelectedBookIds(
        Array.isArray(booksData.bookIds)
          ? booksData.bookIds.filter((bookId) => Boolean(ALL_BOOKS[bookId]))
          : []
      );
      setUserProgress(progressData.progressMap || {});
      setFavorites(Array.isArray(favoritesData.items) ? favoritesData.items : []);
      setUserSettings(settingsData.settings || {});
      setHiddenBookIds(Array.isArray(settingsData.settings?.hiddenBookIds) ? settingsData.settings.hiddenBookIds : []);
    } finally {
      isRemoteHydratingRef.current = false;
    }
  };

  const migrateLocalDataToD1 = async () => {
    try {
      if (selectedBookIds.length > 0) {
        await apiFetchJson('/api/user/books', {
          method: 'POST',
          body: JSON.stringify({ bookIds: selectedBookIds })
        });
      }

      const progressItems = Object.entries(userProgress)
        .map(([wordId, progress]) => buildProgressPayloadItem(wordId, progress))
        .filter(Boolean);

      if (progressItems.length > 0) {
        await apiFetchJson('/api/user/progress', {
          method: 'POST',
          body: JSON.stringify({ items: progressItems })
        });
      }

      await apiFetchJson('/api/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            hiddenBookIds
          }
        })
      });
    } catch (error) {
      console.warn('Failed to migrate local data to D1', error);
    }
  };

  const restoreGuestSnapshot = () => {
    const snapshot = guestSnapshotRef.current;
    setUserProgress(snapshot.userProgress || {});
    setHiddenBookIds(snapshot.hiddenBookIds || []);
    setSelectedBookIds(snapshot.selectedBookIds || []);
    setFavorites([]);
    setUserSettings({});
  };

  const persistProgressToD1 = async (wordId, progress) => {
    if (!authUser) return;

    const item = buildProgressPayloadItem(wordId, progress);
    if (!item) return;

    try {
      await apiFetchJson('/api/user/progress', {
        method: 'POST',
        body: JSON.stringify({ items: [item] })
      });
    } catch (error) {
      console.warn('Failed to persist progress to D1', error);
    }
  };

  const syncSettingsToD1 = async (settingsPatch) => {
    if (!authUser || isRemoteHydratingRef.current) return;

    try {
      await apiFetchJson('/api/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({ settings: settingsPatch })
      });
    } catch (error) {
      console.warn('Failed to persist settings to D1', error);
    }
  };

  const handleAuthSuccess = async (user) => {
    setAuthUser(user);
    setAuthError('');
    await migrateLocalDataToD1();
    await loadRemoteUserData();
    setView('home');
  };

  const handleLogout = async () => {
    try {
      await apiFetchJson('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.warn('Logout failed', error);
    } finally {
      setAuthUser(null);
      restoreGuestSnapshot();
      setView('home');
    }
  };

    useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      const pathname = window.location.pathname || '/';
      if (pathname === '/library') setView('library');
      else if (pathname === '/login') setView('login');
      else if (pathname === '/register') setView('register');
      else setView('home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextPath = VIEW_PATHS[view];
    if (!nextPath) return;
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  }, [view]);
  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const data = await apiFetchJson('/api/auth/me', { headers: {} });
        if (cancelled) return;
        if (data.user) {
          setAuthUser(data.user);
          await loadRemoteUserData();
        }
      } catch (error) {
        console.warn('Auth bootstrap failed', error);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authUser) {
      setUserSettings((prev) => ({
        ...prev,
        hiddenBookIds
      }));
      syncSettingsToD1({ hiddenBookIds });
    }
  }, [authUser, hiddenBookIds]);

  const speakText = (text, { allowUnlock = false } = {}) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
    if (!audioUnlocked && !allowUnlock) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const englishVoice = voicesRef.current.find((voice) => voice.lang?.toLowerCase().startsWith('en'));

    utterance.lang = englishVoice?.lang || 'en-US';
    utterance.voice = englishVoice || null;
    utterance.rate = 0.9;

    if (allowUnlock && !audioUnlocked) {
      setAudioUnlocked(true);
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  };

  const playWordAudio = (text, { allowUnlock = false } = {}) => {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;
    if (!audioUnlocked && !allowUnlock) return;

    if (allowUnlock && !audioUnlocked) {
      setAudioUnlocked(true);
    }

    const shouldUseYoudao =
      typeof window !== 'undefined' && /^[a-zA-Z][a-zA-Z' -]*$/.test(normalizedText);
    if (!shouldUseYoudao) {
      speakText(normalizedText, { allowUnlock });
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(normalizedText)}&type=2`);
      audioRef.current = audio;
      audio.onerror = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        speakText(normalizedText, { allowUnlock });
      };
      audio.onended = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
      };
      audio.play().catch(() => {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        speakText(normalizedText, { allowUnlock });
      });
    } catch {
      speakText(normalizedText, { allowUnlock });
    }
  };

  useEffect(() => {
    if (view === 'spelling' && inputRef.current) inputRef.current.focus();
    if (view === 'sentence_practice' && sentenceInputRef.current) sentenceInputRef.current.focus();
  }, [view, currentSpellingIndex, spellingFeedback, currentSentenceIndex, showSentenceAnswer]);

  // Automatically play the word audio when stage 1 opens.
  useEffect(() => {
    if (view === 'learning' && learnStage === 1 && activeLearningQueue[currentWordIndex]) {
      playWordAudio(activeLearningQueue[currentWordIndex].word);
    }
  }, [currentWordIndex, view, learnStage, activeLearningQueue]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        let parsedBook;
        const bookId = 'custom_' + Date.now();
        const bookName = file.name.replace(/\.[^/.]+$/, ""); 
        
        if (file.name.endsWith('.json')) parsedBook = parseJson(JSON.parse(content), bookId, bookName);
        else parsedBook = parseTxt(content, bookId, bookName);
        
        addCustomBook(parsedBook);
        alert(`Import succeeded: ${bookName} (${parsedBook.words.length} words)`);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const deleteBook = (e, bookId) => {
    e.stopPropagation();
    if (confirm("Delete this book entry? Related progress is kept, but the book entry will be removed.")) {
      if (!isBuiltInBook(bookId) && customBooks[bookId]) {
        setCustomBooks(prev => {
          const next = {...prev};
          delete next[bookId];
          safeWriteStorageJson('vocab_master_custom_books', next);
          return next;
        });
      } else {
        setHiddenBookIds(prev => [...new Set([...prev, bookId])]);
      }

      if (selectedBook === bookId) {
        setSelectedBook(null);
        setView('home');
      }
    }
  };

  // --- 获取到期复习的单词 ---

  const getDueWordsForBooks = (books = ALL_BOOKS) => {
    const now = Date.now();
    const dueWords = [];
    Object.values(books).forEach(book => {
      book.words.forEach(w => {
        if (userProgress[w.id] && userProgress[w.id].nextReview <= now) {
          dueWords.push({
            ...w,
            bookId: w.bookId || book.id,
            sourceBookId: w.sourceBookId || book.sourceBookId || book.id
          });
        }
      });
    });
    return dueWords.sort((a, b) => userProgress[a.id].nextReview - userProgress[b.id].nextReview);
  };

  const handleRemoveOrDeleteBook = (e, bookId) => {
    e.stopPropagation();
    const isCustomBook = Boolean(customBooks[bookId]);
    const confirmMessage = isCustomBook
      ? 'Delete this custom book? It will be removed from both the library and home.'
      : 'Remove this book from home? It will still stay in the library.';

    if (!confirm(confirmMessage)) return;

    removeBookFromHome(bookId);

    if (isCustomBook) {
      setCustomBooks(prev => {
        const next = { ...prev };
        delete next[bookId];
        safeWriteStorageJson('vocab_master_custom_books', next);
        return next;
      });
    }
  };

  // --- 智能复习逻辑 ---
  const startSmartReview = () => {
    if (isPreparingReview) return;

    const dueWords = getDueWordsForBooks(MY_BOOKS_MAP);
    if (dueWords.length === 0) return;

    setSessionType('smart_review');
    setSpellingQueue(dueWords.slice(0, 40));
    setCurrentSpellingIndex(0);
    setSpellingInput('');
    setSpellingFeedback(null);
    setView('spelling');
  };

  const buildNormalSessionQueue = (bookId) => {
    const book = ALL_BOOKS[bookId];
    if (!book) return [];

    const bookWords = book.words;
    const now = Date.now();
    const reviews = [];
    const newWords = [];

    bookWords.forEach(w => {
      const progress = userProgress[w.id];
      if (!progress) newWords.push(w);
      else if (progress.nextReview <= now) reviews.push(w);
    });

    reviews.sort((a, b) => userProgress[a.id].nextReview - userProgress[b.id].nextReview);

    const sessionReviews = reviews.slice(0, NORMAL_SESSION_BATCH_SIZE);
    const sessionNew = newWords.slice(0, Math.max(0, NORMAL_SESSION_BATCH_SIZE - sessionReviews.length));
    return [...sessionReviews, ...sessionNew];
  };

  const buildAiCandidatePool = (topic, limit = 220) => {
    const tokens = tokenizeTopic(topic).filter((token) => token.length > 1);
    const seen = new Set();
    const allCandidates = [];

    Object.values(ALL_BOOKS)
      .filter((book) => !book.aiTopicKey)
      .forEach((book) => {
        book.words.forEach((item) => {
          const dedupeKey = `${String(item.word || '').trim().toLowerCase()}__${String(item.meaning || '').trim()}`;
          if (!item.word || !item.meaning || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);

          const searchText = `${item.word} ${item.pos || ''} ${item.meaning}`.toLowerCase();
          let score = 0;
          tokens.forEach((token) => {
            if (searchText.includes(token)) score += token.length > 2 ? 4 : 2;
            if (String(item.word || '').toLowerCase() === token) score += 6;
          });

          if (String(item.exampleZh || '').includes(topic) || String(item.exampleEn || '').toLowerCase().includes(String(topic || '').toLowerCase())) {
            score += 3;
          }

          allCandidates.push({
            candidateId: item.id,
            word: item.word,
            pos: item.pos || '',
            meaning: item.meaning,
            phonetic: item.phonetic || '',
            exampleEn: item.exampleEn || '',
            exampleZh: item.exampleZh || '',
            _score: score,
            _rand: Math.random()
          });
        });
      });

    const ranked = [...allCandidates].sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a._rand - b._rand;
    });

    const prioritized = ranked.filter((item) => item._score > 0).slice(0, Math.min(120, limit));
    const prioritizedIds = new Set(prioritized.map((item) => item.candidateId));
    const fallback = ranked
      .filter((item) => !prioritizedIds.has(item.candidateId))
      .slice(0, Math.max(0, limit - prioritized.length));

    return [...prioritized, ...fallback].map(({ _score, _rand, ...item }) => item);
  };

  // --- 正常学习逻辑 ---
  const startLearning = (bookId) => {
    setSelectedBook(bookId);
    setShowBreakPrompt(false);
    setNextBatchPreviewCount(0);
    const sessionQueue = buildNormalSessionQueue(bookId);

    if (sessionQueue.length === 0) {
      setView('finished');
    } else {
      setSessionType('normal');
      setQueue(sessionQueue);
      setCurrentWordIndex(0);
      setLearnStage(1);
      setLearnedInSession([]);
      setView('learning');
    }
  };

  // 阶段 1 跳转到阶段 2
  const handleToStage2 = () => {
    setLearnStage(2);
  };

  const handleToStage3 = () => {
    setLearnStage(3);
  };

  const handleAiGenerateBook = async () => {
    const topic = aiTopic.trim();
    if (!topic || isAiGenerating) return;
    const variationHint = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const candidates = buildAiCandidatePool(topic);

    if (candidates.length < 6) {
      alert('Not enough candidate words in the local vocabulary to build this topic book.');
      return;
    }

    setIsAiGenerating(true);
    try {
      const res = await fetch('/api/generate-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, variationHint, candidates })
      });

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: `Server returned a non-JSON response (HTTP ${res.status}): ${rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `Book generation failed (HTTP ${res.status})`);
      }

      const merged = addOrMergeAiBook(data.book, topic);
      setAiTopic('');
      alert(
        merged
          ? `AI book merged into ${topic} book. Added or refreshed ${data.book.words.length} candidate words.`
          : `AI book created successfully: ${topic} book with ${data.book.words.length} words.`
      );
    } catch (err) {
      alert(`AI generation failed: ${err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 阶段 2 单选题点击（错误则跳过，并放入队尾）
  const handleOptionClick = (opt, word) => {
    if (mcFeedback) return; 
    
    const correctFormatted = `${word.pos ? word.pos + ' ' : ''}${word.meaning}`;
    setMcFeedback(opt); 
    
    if (opt === correctFormatted) {
      playWordAudio(word.word, { allowUnlock: true });
      setTimeout(() => {
        setLearnStage(3);
        setMcFeedback(null);
      }, 800);
    } else {
      playWordAudio(word.word, { allowUnlock: true });
      setTimeout(() => {
        // 选择错误，加入队列末尾重新循环
        setQueue(prev => [...prev, { ...word, _mcMistake: true }]);
        moveToNextWord();
        setMcFeedback(null);
      }, 1500); // 留出 1.5 秒时间看正确答案
    }
  };

  const handleNextLearn = () => {
    const currentWord = activeLearningQueue[currentWordIndex];
    const newLearnedSession = [...learnedInSession, currentWord];
    setLearnedInSession(newLearnedSession);

    // 计算真实的已完成唯一单词数
    const totalUnique = new Set(activeLearningQueue.map(w => w.id)).size;
    const learnedUnique = new Set(newLearnedSession.map(w => w.id)).size;

    if (learnedUnique === totalUnique) {
      setView('finished');
    } else {
      moveToNextWord();
    }
  };

  const moveToNextWord = () => {
    setCurrentWordIndex(prev => Math.min(prev + 1, activeLearningQueue.length - 1));
    setLearnStage(1);
    setView('learning');
  };

  const handleLearningDecision = (decision) => {
    if (decision === 'mastered') {
      handleNextLearn();
      return;
    }

    if (decision === 'blurred') {
      setLearnStage(2);
      return;
    }

    setLearnStage(1);
  };

  const handleContinueLearning = () => {
    if (!selectedBook) {
      setShowBreakPrompt(false);
      setView('home');
      return;
    }

    startLearning(selectedBook);
  };

  const handleTakeBreak = () => {
    setShowBreakPrompt(false);
    setNextBatchPreviewCount(0);
    setLearnedInSession([]);
    setView('home');
  };

  const finishSessionBatch = () => {
    if (sessionType === 'smart_review') {
      setLearnedInSession([]);
      setView('finished');
    } else {
      const nextSessionQueue = selectedBook ? buildNormalSessionQueue(selectedBook) : [];
      setLearnedInSession([]);

      if (nextSessionQueue.length > 0) {
        setNextBatchPreviewCount(nextSessionQueue.length);
        setShowBreakPrompt(true);
      } else {
        setView('finished');
      }
    }
  };

  const proceedToSentencePractice = async (candidateWords) => {
    const uniqueCandidates = Array.from(new Map(candidateWords.map((item) => [item.id, item])).values());
    const sentenceCandidates = sessionType === 'smart_review'
      ? uniqueCandidates.filter((item) => (item._reviewMistakeCount || 0) > REVIEW_SENTENCE_MISTAKE_THRESHOLD)
      : uniqueCandidates;

    if (sentenceCandidates.length === 0) {
      finishSessionBatch();
      return;
    }

    const missingExampleGroups = sentenceCandidates
      .filter((item) => !item.exampleEn || !item.exampleZh)
      .reduce((groups, item) => {
        const targetBookId = item.bookId || item.sourceBookId || item.id.split('_').slice(0, -1).join('_');
        if (!targetBookId) return groups;
        if (!groups[targetBookId]) groups[targetBookId] = [];
        groups[targetBookId].push(item);
        return groups;
      }, {});

    let hydratedCandidates = sentenceCandidates;
    if (Object.keys(missingExampleGroups).length > 0) {
      setIsPreparingReview(true);
      try {
        for (const [bookId, words] of Object.entries(missingExampleGroups)) {
          const updatedBook = await enrichExamplesForBook(bookId, words);
          if (updatedBook?.words) {
            const updatedMap = new Map(updatedBook.words.map((item) => [item.id, item]));
            hydratedCandidates = hydratedCandidates.map((item) => updatedMap.get(item.id) || item);
          }
        }
      } catch (error) {
        alert(`Preparing examples failed: ${error.message}`);
      } finally {
        setExampleGenerationState({ bookId: null, completed: 0, total: 0 });
        setIsPreparingReview(false);
      }
    }

    const validSentences = hydratedCandidates.filter((item) => item.exampleEn && item.exampleZh);
    if (validSentences.length === 0) {
      finishSessionBatch();
      return;
    }

    setSentenceQueue(validSentences);
    setCurrentSentenceIndex(0);
    setSentenceInput('');
    setShowSentenceAnswer(false);
    setUsedHint(false);
    setSentenceSubmitted(false);
    setSentenceHadMistake(false);
    setView('sentence_practice');
  };

  // 拼写测验提交（强制要求拼写正确后才进入下一个）
  const handleSpellingSubmit = (e) => {
    e.preventDefault();
    const currentWord = spellingQueue[currentSpellingIndex];
    if (!currentWord || !spellingInput.trim()) return;

    const isCorrect = spellingInput.trim().toLowerCase() === currentWord.word.toLowerCase();

    if (isCorrect) {
      const hasMistakeOnThisAttempt = currentWordMistakes > 0;
      const grade = hasMistakeOnThisAttempt ? 3 : 5;
      const oldProgress = userProgress[currentWord.id] || { repetition: 0, interval: 0, easeFactor: 2.5 };
      const sm2Result = calculateSM2(grade, oldProgress.repetition, oldProgress.interval, oldProgress.easeFactor);
      const newProgress = { ...oldProgress, ...sm2Result, status: 'learned', lastReviewedAt: Date.now() };

      setUserProgress(prev => ({ ...prev, [currentWord.id]: newProgress }));
      persistProgressToD1(currentWord.id, newProgress);
      setSpellingFeedback('correct');

      const nextQueue = hasMistakeOnThisAttempt ? [...spellingQueue, { ...currentWord, _spMistake: true }] : spellingQueue;
      if (hasMistakeOnThisAttempt) {
        setSpellingQueue(nextQueue);
      }

      setTimeout(() => {
        if (currentSpellingIndex + 1 < nextQueue.length) {
          setCurrentSpellingIndex(prev => prev + 1);
          setSpellingInput('');
          setSpellingFeedback(null);
          setCurrentWordMistakes(0);
        } else {
          proceedToSentencePractice(nextQueue);
        }
      }, 1000);
    } else {
      setSpellingFeedback('incorrect');
      playWordAudio(currentWord.word, { allowUnlock: true });
      setCurrentWordMistakes(prev => prev + 1);
      if (sessionType === 'smart_review') {
        setSpellingQueue(prev => prev.map((item, index) => (
          index === currentSpellingIndex
            ? { ...item, _reviewMistakeCount: (item._reviewMistakeCount || 0) + 1 }
            : item
        )));
      }
    }
  };

  // Add the sentence back to the queue after using a hint.
  const handleShowSentenceAnswer = () => {
    setShowSentenceAnswer(true);
    setUsedHint(true);
    setSentenceHadMistake(true);
  };
  const handleSentenceSubmit = () => {
    if (!sentenceInput.trim()) return;

    const normalizeSentenceWhitespace = (text) => String(text || '').trim().replace(/\s+/g, ' ');
    const word = sentenceQueue[currentSentenceIndex];
    const targetSentence = normalizeSentenceWhitespace(word?.exampleEn);
    const currentSentence = normalizeSentenceWhitespace(sentenceInput);
    const isCorrect = currentSentence === targetSentence;

    setSentenceSubmitted(true);
    if (isCorrect) {
      handleSentenceNext();
      return;
    }

    setSentenceHadMistake(true);
  };

  const handleSentenceNext = () => {
    const word = sentenceQueue[currentSentenceIndex];
    // 如果使用了提示或之前错过，则加入队尾
    if (usedHint || sentenceHadMistake || word._snMistake) {
      setSentenceQueue(prev => [...prev, { ...word, _snMistake: true }]);
    }

    if (currentSentenceIndex + 1 < sentenceQueue.length) {
      setCurrentSentenceIndex(prev => prev + 1);
      setSentenceInput('');
      setShowSentenceAnswer(false);
      setUsedHint(false);
      setSentenceSubmitted(false);
      setSentenceHadMistake(false);
    } else {
      setSentenceSubmitted(false);
      setSentenceHadMistake(false);
      finishSessionBatch();
    }
  };

  // --- 数据备份与恢复逻辑 ---
  const handleExportData = () => {
    const backupData = {
      progress: userProgress,
      customBooks: customBooks,
      hiddenBookIds: hiddenBookIds,
      selectedBookIds: selectedBookIds
    };
    const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab_master_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.progress !== undefined && data.customBooks !== undefined) {
          if(confirm("警告：恢复数据将覆盖您当前浏览器中的所有进度和词库。确定要继续吗？")) {
            setUserProgress(data.progress);
            setCustomBooks(data.customBooks);
            setHiddenBookIds(Array.isArray(data.hiddenBookIds) ? data.hiddenBookIds : []);
            setSelectedBookIds(Array.isArray(data.selectedBookIds) ? data.selectedBookIds : []);
            alert('Backup restored successfully.');
          }
        } else {
          // 兼容普通的词库 JSON 文件上传，防止用户误点
          alert('Invalid backup file format. Please import a valid exported backup JSON.');
        }
      } catch (err) {
        alert('Failed to read the file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (authSubmitting) return;

    setAuthSubmitting(true);
    setAuthError('');
    try {
      const data = await apiFetchJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });
      setLoginForm({ email: '', password: '' });
      await handleAuthSuccess(data.user);
    } catch (error) {
      setAuthError(error.message || '登录失败');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (authSubmitting) return;

    setAuthSubmitting(true);
    setAuthError('');
    try {
      const data = await apiFetchJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm)
      });
      setRegisterForm({ email: '', password: '', username: '' });
      await handleAuthSuccess(data.user);
    } catch (error) {
      setAuthError(error.message || '注册失败');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // --- UI Views ---
  const renderAuthPanel = (mode = 'login') => {
    const isLogin = mode === 'login';
    const title = isLogin ? '欢迎回来' : '创建账号';
    const desc = isLogin ? '登录后词书与进度优先同步到云端' : '创建账号，将进度绑定到你的账号';
    const chEmail = (e) => isLogin ? setLoginForm(p=>({...p,email:e.target.value})) : setRegisterForm(p=>({...p,email:e.target.value}));
    const chPwd   = (e) => isLogin ? setLoginForm(p=>({...p,password:e.target.value})) : setRegisterForm(p=>({...p,password:e.target.value}));
    return (
      <div className="max-w-sm mx-auto w-full animate-in fade-in zoom-in-95 duration-400">
        <div className="card p-8" style={{borderRadius:'1.5rem'}}>
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{background:'linear-gradient(135deg,#6366f1,#7c3aed)',color:'white',boxShadow:'0 4px 20px rgba(99,102,241,.4)'}}>
              {isLogin ? <LogIn className="h-5 w-5"/> : <UserPlus className="h-5 w-5"/>}
            </div>
            <h1 className="text-2xl font-black t1">{title}</h1>
            <p className="mt-1 text-sm t2">{desc}</p>
          </div>
          <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold t2">用户名（选填）</label>
                <input type="text" value={registerForm.username} onChange={e=>setRegisterForm(p=>({...p,username:e.target.value}))} className="inp" placeholder="可选"/>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold t2">邮箱</label>
              <input type="email" value={isLogin?loginForm.email:registerForm.email} onChange={chEmail} className="inp" placeholder="you@example.com" required/>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold t2">密码</label>
              <input type="password" value={isLogin?loginForm.password:registerForm.password} onChange={chPwd} className="inp" placeholder="至少 6 位字符" required/>
            </div>
            {authError && <div className="pill pill-re w-full justify-center py-2 text-xs rounded-xl">{authError}</div>}
            <button type="submit" disabled={authSubmitting} className="btn btn-p w-full mt-1">
              {authSubmitting ? '处理中...' : isLogin ? '登录' : '注册'}
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between text-sm">
            <button onClick={()=>{setAuthError('');setView('home');}} className="t3 transition hover:t2">游客模式继续</button>
            <button onClick={()=>{setAuthError('');setView(isLogin?'register':'login');}} className="font-semibold transition" style={{color:'var(--ac)'}}>
              {isLogin ? '去注册 →' : '返回登录 →'}
            </button>
          </div>
        </div>
      </div>
    );
  };


  const renderHome = () => {
    const dueWordsCount = getDueWordsForBooks(MY_BOOKS_MAP).length;
    const totalBooks = MY_BOOKS.length;
    const totalWords = MY_BOOKS.reduce((s,b)=>s+b.words.length, 0);
    const totalLearned = MY_BOOKS.reduce((s,b)=>s+b.words.filter(w=>userProgress[w.id]).length, 0);
    const dailyNewTarget = Math.max(0, Math.min(20, totalWords-totalLearned));
    const estMins = Math.max(5, Math.ceil((dueWordsCount+dailyNewTarget)*0.75));
    const firstId = MY_BOOKS[0]?.id;
    const pct = totalWords ? Math.round((totalLearned/totalWords)*100) : 0;
    const catCls = c=>({'四级':'pill-bl','六级':'pill-vi','考研':'pill-am'})[c]||'pill-mu';
    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="pill pill-ac mb-2"><BrainCircuit className="h-3 w-3"/>我的词书</div>
            <h1 className="text-3xl font-black tracking-tight t1 sm:text-4xl">今日学习计划</h1>
            <p className="mt-1 text-sm t2">首页仅显示你加入的词书，全部词书在词书库统一管理。</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <span className="pill pill-or"><Flame className="h-3 w-3"/>今日待复习 {dueWordsCount} 词</span>
            <span className="pill pill-mu"><TrendingUp className="h-3 w-3"/>{totalBooks} 本词书</span>
          </div>
        </div>

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8 text-white" style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed,#6d28d9)',boxShadow:'0 20px 60px rgba(99,102,241,.35)'}}>
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none"/>
          <div className="absolute -bottom-16 left-8 h-48 w-48 rounded-full bg-purple-300/15 blur-3xl pointer-events-none"/>
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_260px] lg:items-center">
            <div className="space-y-4">
              <div className="pill" style={{background:'rgba(255,255,255,.15)',color:'rgba(255,255,255,.9)',border:'1px solid rgba(255,255,255,.2)'}}><Target className="h-3 w-3"/>今日任务概览</div>
              <div>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">先复习已学词汇，再继续新词学习。</h2>
                <p className="mt-2 text-sm leading-6" style={{color:'rgba(255,255,255,.72)'}}>智能复习仅从「我的词书」筛选到期卡片，完成后可前往词书库添加更多内容。</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[['待复习',dueWordsCount,'来自我的词书'],['预计新词',dailyNewTarget,'当前词书估算'],['预计时长',`${estMins}m`,'今日完成时间']].map(([l,v,s])=>(
                  <div key={l} className="rounded-xl p-4" style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)'}}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:'rgba(255,255,255,.6)'}}>{l}</p>
                    <p className="mt-1.5 text-3xl font-black">{v}</p>
                    <p className="mt-0.5 text-[11px]" style={{color:'rgba(255,255,255,.6)'}}>{s}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl p-5 space-y-3" style={{background:'rgba(0,0,0,.2)',border:'1px solid rgba(255,255,255,.15)'}}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:'rgba(255,255,255,.55)'}}>快速开始</p>
              <button onClick={startSmartReview} disabled={dueWordsCount===0||isPreparingReview}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0" style={{color:'#4f46e5'}}>
                {isPreparingReview?'准备中...':dueWordsCount>0?'开始今日复习':'暂无待复习卡片'}<ArrowRight className="h-4 w-4"/>
              </button>
              <button onClick={()=>{if(firstId)startLearning(firstId);}} disabled={!firstId}
                className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',color:'white'}}>
                继续学习词书
              </button>
              <button onClick={()=>setView('library')}
                className="flex w-full items-center justify-center gap-1 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-90" style={{background:'rgba(0,0,0,.15)',border:'1px solid rgba(255,255,255,.12)',color:'rgba(255,255,255,.8)'}}>
                前往词书库<ChevronRight className="h-4 w-4"/>
              </button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[[<CheckCircle2 className="h-4 w-4"/>, '#10b981', 'rgba(16,185,129,.1)', '完成率', `${pct}%`],
            [<Flame className="h-4 w-4"/>, '#f97316', 'rgba(249,115,22,.1)', '今日待复习', dueWordsCount],
            [<TrendingUp className="h-4 w-4"/>, '#6366f1', 'rgba(99,102,241,.1)', '已加入词书', totalBooks]
          ].map(([icon,c,bg,label,val])=>(
            <div key={label} className="card p-4">
              <div className="mb-3 inline-flex rounded-xl p-2" style={{background:bg,color:c}}>{icon}</div>
              <p className="text-xs t2">{label}</p>
              <p className="mt-0.5 text-2xl font-black t1">{val}</p>
            </div>
          ))}
        </div>

        {/* My Books */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black t1">我的词书</h2>
              <p className="mt-0.5 text-xs t2">按加入顺序排列，点击即可学习</p>
            </div>
            <button onClick={()=>setView('library')} className="pill pill-mu transition hover:border-indigo-400">词书库<ChevronRight className="h-3 w-3"/></button>
          </div>
          {MY_BOOKS.length===0 ? (
            <div className="rounded-2xl border-2 border-dashed p-16 text-center" style={{borderColor:'var(--cb)'}}>
              <Book className="mx-auto mb-3 h-10 w-10 t3"/>
              <h3 className="text-lg font-black t1">还没有词书</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm t2">前往词书库选择想学的词书，加入后立即出现在这里。</p>
              <button onClick={()=>setView('library')} className="btn btn-p mt-6"><ArrowRight className="h-4 w-4"/>前往词书库</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {MY_BOOKS.map(book=>{
                const cnt=book.words.length, learned=book.words.filter(w=>userProgress[w.id]).length;
                const p=cnt?Math.round((learned/cnt)*100):0, cat=getBookCategory(book);
                const misEx=book.words.filter(w=>!w.exampleEn).length;
                const isGen=exampleGenerationState.bookId===book.id&&exampleGenerationState.completed<exampleGenerationState.total;
                return (
                  <div key={book.id} onClick={()=>startLearning(book.id)} className="card card-i relative p-6">
                    <div className="card-top-bar"/>
                    <button onClick={e=>handleRemoveOrDeleteBook(e,book.id)} className="absolute right-4 top-4 rounded-full p-1.5 t3 transition hover:pill-re"
                      title={customBooks[book.id]?'删除词书':'从首页移除'}><Trash2 className="h-4 w-4"/></button>
                    <div className="mb-4 flex items-start gap-3">
                      <div className="rounded-xl p-2.5 transition" style={{background:'var(--acs)',color:'var(--ac)'}}><Book className="h-5 w-5"/></div>
                      <div className="min-w-0 flex-1 pr-8">
                        <span className={`pill ${catCls(cat)} mb-1`}>{cat}</span>
                        <h3 className="text-lg font-black leading-tight t1">{book.name}</h3>
                        <p className="mt-0.5 text-xs t3">已学 {learned} / {cnt} 词</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] font-semibold t3"><span>学习进度</span><span>{p}%</span></div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:'var(--mu)'}}>
                        {isGen
                          ? <div className="h-full p-shimmer rounded-full" style={{width:`${Math.round((exampleGenerationState.completed/exampleGenerationState.total)*100)}%`}}/>
                          : <div className="h-full rounded-full transition-all duration-500" style={{width:`${p}%`,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>}
                      </div>
                    </div>
                    {isGen&&<p className="mt-1.5 text-[11px]" style={{color:'var(--ac)'}}>生成例句中 ({exampleGenerationState.completed}/{exampleGenerationState.total})...</p>}
                    {!isGen&&misEx>0&&<p className="mt-1.5 text-[11px] t3">缺失 {misEx} 条例句</p>}
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{color:'var(--ac)'}}><PlayCircle className="h-4 w-4"/>点击开始学习</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Backup */}
        <div className="card p-6">
          <h3 className="text-base font-bold t1 mb-1 flex items-center gap-2"><Save className="h-4 w-4 t2"/>数据备份与恢复</h3>
          <p className="text-sm t2 mb-4">学习进度默认保存在浏览器中。更换设备前请定期导出备份。</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleExportData} className="btn btn-ok flex-1"><Save className="h-4 w-4"/>导出进度备份</button>
            <label className="btn btn-g flex-1 cursor-pointer"><UploadCloud className="h-4 w-4"/>恢复历史备份<input type="file" accept=".json" className="hidden" onChange={handleImportData}/></label>
          </div>
        </div>
      </div>
    );
  };

  const renderLibrary = () => {
    const ns = librarySearch.trim().toLowerCase();
    const filtered = ALL_BOOK_LIST.filter(b => {
      const cat = getBookCategory(b);
      if (libraryFilter !== BOOK_LIBRARY_FILTERS[0] && cat !== libraryFilter) return false;
      if (!ns) return true;
      return `${b.name} ${cat} ${getBookDescription(b)}`.toLowerCase().includes(ns);
    });
    const catCls = c=>({'四级':'pill-bl','六级':'pill-vi','考研':'pill-am'})[c]||'pill-mu';
    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="pill pill-ac mb-2"><Book className="h-3 w-3"/>词书库</div>
            <h1 className="text-3xl font-black tracking-tight t1 sm:text-4xl">从词书库选择，再加入首页。</h1>
            <p className="mt-1 text-sm t2">搜索、筛选并挑选你真正要学的词书，加入后首页立刻同步显示。</p>
          </div>
          <button onClick={()=>setView('home')} className="btn btn-g shrink-0">返回我的词书<ChevronRight className="h-4 w-4"/></button>
        </div>

        {/* Search + filter */}
        <div className="card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 t3"/>
              <input type="text" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)}
                placeholder="按词书名、分类或描述搜索" className="inp pl-10"/>
            </div>
            <div className="flex flex-wrap gap-2">
              {BOOK_LIBRARY_FILTERS.map(f=>(
                <button key={f} onClick={()=>setLibraryFilter(f)}
                  className={`pill transition ${libraryFilter===f?'btn-p text-white border-0':'pill-mu hover:border-indigo-400'}`}>{f}</button>
              ))}
            </div>
          </div>
          {!authUser&&<p className="mt-3 text-xs t3">当前是游客模式。词书加入首页后保存在本地，登录后可同步到账号。</p>}
        </div>

        {/* Book grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(book=>{
            const sel = selectedBookIds.includes(book.id);
            const cat = getBookCategory(book);
            return (
              <div key={book.id} className="card card-i relative p-6">
                <div className="card-top-bar"/>
                <div className="mb-4 flex items-start justify-between">
                  <div className="rounded-xl p-2.5" style={{background:'var(--acs)',color:'var(--ac)'}}><Book className="h-5 w-5"/></div>
                  <span className="text-xs font-semibold t3">{book.words.length} 词</span>
                </div>
                <div className="mb-4">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className={`pill ${catCls(cat)}`}>{cat}</span>
                    {sel&&<span className="pill pill-gr">已加入首页</span>}
                  </div>
                  <h3 className="text-xl font-black leading-tight t1">{book.name}</h3>
                  <p className="mt-2 text-sm t2 leading-6">{getBookDescription(book)}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={()=>toggleBookSelection(book.id)}
                    className={`btn flex-1 ${sel?'btn-g':'btn-p'}`}>
                    {sel?'从首页移除':'加入首页'}
                  </button>
                  {sel&&<button onClick={()=>startLearning(book.id)} className="btn btn-g flex-1">开始学习</button>}
                </div>
              </div>
            );
          })}
          {filtered.length===0&&(
            <div className="col-span-full rounded-2xl border-2 border-dashed p-16 text-center" style={{borderColor:'var(--cb)'}}>
              <Search className="mx-auto mb-3 h-10 w-10 t3"/>
              <h3 className="text-lg font-black t1">没有找到符合条件的词书</h3>
              <p className="mt-2 text-sm t2">试试调整搜索词或切换分类筛选，也可以上传本地词书。</p>
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="card p-6">
          <h3 className="text-base font-bold t1 mb-1 flex items-center gap-2"><Download className="h-4 w-4 t2"/>内置词书与扩充词库</h3>
          <p className="text-sm t2 mb-4">四级核心与六级进阶已内置，也可上传本地词书（.txt / .json），上传后自动加入首页。</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="btn btn-g flex-1 cursor-default"><Book className="h-4 w-4"/>已内置四级核心</div>
            <div className="btn btn-g flex-1 cursor-default"><Book className="h-4 w-4"/>已内置六级进阶</div>
            <label className="btn btn-p flex-1 cursor-pointer"><Upload className="h-4 w-4"/>上传本地词书<input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload}/></label>
          </div>
        </div>

        {/* AI generation */}
        <div className="card p-6" style={{background:'linear-gradient(135deg,var(--card),var(--acs))',borderColor:'var(--cbh)'}}>
          <h3 className="text-xl font-black t1 mb-2 flex items-center gap-2"><Sparkles className="h-5 w-5" style={{color:'var(--ac)'}}/>AI 智能生成词书</h3>
          <p className="text-sm t2 mb-4">输入主题，从词库里筛选合适词汇生成专题词书，自动加入首页。</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" value={aiTopic} onChange={e=>setAiTopic(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')handleAiGenerateBook();}}
              placeholder="如：咖啡馆用语、大厂面试、旅游英语..."
              className="inp flex-1 text-base py-3"/>
            <button onClick={handleAiGenerateBook} disabled={!aiTopic.trim()||isAiGenerating}
              className="btn btn-p min-w-[120px]">
              {isAiGenerating?<><RotateCcw className="h-4 w-4 animate-spin"/>生成中</>:<><Wand2 className="h-4 w-4"/>生成词书</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLearning = () => {
    const word = activeLearningQueue[currentWordIndex];
    if (!word) return null;
    const totalUnique = new Set(activeLearningQueue.map(i=>i.id)).size;
    const remUnique = new Set(activeLearningQueue.slice(currentWordIndex).map(i=>i.id)).size;
    const prog = totalUnique - remUnique + 1;
    const s1=learnStage===1, s2=learnStage===2, s3=learnStage===3;
    const stages=[{n:1,l:'先听发音'},{n:2,l:'理解词义'},{n:3,l:'完成确认'}];
    return (
      <div className="mx-auto w-full max-w-4xl animate-in slide-in-from-bottom-6 duration-400">
        {/* Top bar */}
        <div className="card mb-5 p-3 grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
          <button onClick={()=>setView('home')} className="btn btn-g py-2 px-3 text-xs"><RotateCcw className="h-3.5 w-3.5"/>返回首页</button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stages.map(({n,l})=>(
              <div key={n} className={`pill transition ${learnStage===n?'btn-p text-white':'pill-mu'}`}>
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${learnStage===n?'bg-white/30':'bg-white/10'}`}>{n}</span>{l}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <div className="h-1.5 w-24 rounded-full overflow-hidden hidden sm:block" style={{background:'var(--mu)'}}>
              <div className="h-full rounded-full" style={{width:`${Math.max(4,Math.round((prog/totalUnique)*100))}%`,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>
            </div>
            <span className="pill pill-mu text-[11px]">{prog}<span className="t3">/{totalUnique}</span></span>
          </div>
        </div>
        {/* Main card */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid var(--cb)',background:'var(--mu)'}}>
            <div className="pill pill-ac"><GraduationCap className="h-3 w-3"/>学习阶段</div>
            <span className="text-xs t3">剩余 {remUnique} 词</span>
          </div>
          <div className="flex min-h-[520px] flex-col justify-between p-8 sm:p-12">
            <div className="flex flex-col items-center text-center flex-1">
              <div className="pill pill-mu text-[10px] tracking-widest uppercase">{s1?'听音阶段':s2?'词义输入':'自我确认'}</div>
              <h2 className="mt-6 text-6xl font-black tracking-tight t1 sm:text-8xl" style={{fontFamily:'Inter,sans-serif'}}>{word.word}</h2>
              <button onClick={()=>playWordAudio(word.word,{allowUnlock:true})}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm transition" style={{background:'var(--mu)',color:'var(--t2)',border:'1px solid var(--cb)'}}>
                <Volume2 className="h-4 w-4" style={{color:'var(--ac)'}}/>
                <span className="font-mono tracking-wide">{word.phonetic||'/暂无音标/'}</span>
              </button>
              {(s2||s3)&&(
                <div className="w-full max-w-2xl space-y-4 text-left mt-8 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3 rounded-2xl p-5" style={{background:'var(--mu)',border:'1px solid var(--cb)'}}>
                    {word.pos&&<span className="mt-0.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold" style={{background:'var(--acs)',color:'var(--ac)'}}>{word.pos}</span>}
                    <p className="text-xl font-semibold leading-snug t1">{word.meaning}</p>
                  </div>
                  {word.exampleEn&&(
                    <div className="flex items-start gap-3 rounded-2xl p-5" style={{background:'var(--acs)',border:'1px solid var(--cbh)'}}>
                      <Quote className="mt-1 h-4 w-4 shrink-0 t3"/>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-base leading-7 t1">{word.exampleEn}</p>
                          <button onClick={()=>speakText(word.exampleEn,{allowUnlock:true})} className="shrink-0 rounded-full p-1.5 transition" style={{color:'var(--ac)'}}><Play className="h-3.5 w-3.5"/></button>
                        </div>
                        {word.exampleZh&&<p className="mt-2 text-sm t2">{word.exampleZh}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-8 pt-5" style={{borderTop:'1px solid var(--cb)'}}>
              {s1&&<button onClick={handleToStage2} className="btn btn-p w-full py-3.5">查看词义<ArrowRight className="h-4 w-4"/></button>}
              {s2&&<button onClick={handleToStage3} className="btn btn-p w-full py-3.5">进入确认<ArrowRight className="h-4 w-4"/></button>}
              {s3&&(
                <div className="grid gap-3 sm:grid-cols-3">
                  <button onClick={()=>handleLearningDecision('forgot')} className="btn btn-danger py-3.5">不会</button>
                  <button onClick={()=>handleLearningDecision('blurred')} className="btn btn-warn py-3.5">模糊</button>
                  <button onClick={()=>handleLearningDecision('mastered')} className="btn btn-ok py-3.5 font-black">掌握 ✓</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
  const renderSpelling = () => {
    const word = spellingQueue[currentSpellingIndex];
    if (!word) return null;
    const tgt = word.word;
    const normIn = spellingInput.toLowerCase();
    const normTgt = tgt.toLowerCase();
    const slots = tgt.split('').map((ch,i) => {
      const typed = spellingInput[i]||'';
      const isSep = ch===' '||ch==='-'||ch==="'";
      const isOk = normIn[i]===normTgt[i];
      const showErr = spellingFeedback==='incorrect'&&typed&&!isOk;
      return {key:`${ch}_${i}`,ch,typed,isSep,isOk,showErr};
    });
    const totalU=new Set(spellingQueue.map(w=>w.id)).size;
    const remU=new Set(spellingQueue.slice(currentSpellingIndex).map(w=>w.id)).size;
    const prog=totalU-remU+1;
    return (
      <div className="max-w-lg mx-auto w-full animate-in slide-in-from-right-6 duration-400">
        <div className="text-center mb-6">
          <div className="pill pill-ac mx-auto mb-3 w-fit">
            {sessionType==='smart_review'?<CalendarClock className="h-3 w-3"/>:<GraduationCap className="h-3 w-3"/>}
            {sessionType==='smart_review'?'智能复习拼写':'阶段拼写测试'} ({prog}/{totalU})
          </div>
          <h2 className="text-xl font-black t1">根据提示拼写出对应的英文单词</h2>
        </div>
        <div className="card p-7 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg p-2 mt-0.5" style={{background:'var(--mu)'}}><Book className="h-4 w-4 t3"/></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest t3 mb-1">词义提示</p>
                {word.phonetic&&<p className="text-xs font-mono t3 mb-1">{word.phonetic}</p>}
                <p className="text-base font-semibold t1">
                  {word.pos&&<span className="mr-2 text-sm font-bold" style={{color:'var(--ac)'}}>{word.pos}</span>}
                  {word.meaning}
                </p>
              </div>
            </div>
            {spellingFeedback!=='correct'&&(
              <button type="button" onClick={()=>playWordAudio(word.word,{allowUnlock:true})}
                className="shrink-0 rounded-full p-2 transition" style={{background:'rgba(245,158,11,.1)',color:'#f59e0b'}} title="播放读音提示">
                <Lightbulb className="h-5 w-5"/>
              </button>
            )}
          </div>
          {word.exampleZh&&(
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 mt-0.5" style={{background:'var(--mu)'}}><BrainCircuit className="h-4 w-4 t3"/></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest t3 mb-1">语境提示</p>
                <p className="text-base t1">{word.exampleZh}</p>
              </div>
            </div>
          )}
          <form onSubmit={handleSpellingSubmit}>
            <div onClick={()=>inputRef.current?.focus()}
              className={`w-full rounded-2xl border-2 px-5 py-5 transition-all cursor-text ${spellingFeedback==='correct'?'border-emerald-500 bg-emerald-50':spellingFeedback==='incorrect'?'border-rose-500 animate-shake':'focus-within:border-indigo-400'}`}
              style={!spellingFeedback?{borderColor:'var(--cb)',background:'var(--mu)'}:{}}>
              <div className="pointer-events-none flex flex-wrap justify-center gap-2">
                {slots.map(s=>(
                  <div key={s.key} className={`slot ${s.isSep?'border-transparent t3':s.showErr?'slot-err':s.isOk&&s.typed?'slot-ok':'slot-empty'}`}
                    style={{minWidth:s.isSep?'1rem':'2rem'}}>
                    {s.typed||(s.isSep?s.ch:'_')}
                  </div>
                ))}
              </div>
              <input ref={inputRef} type="text" value={spellingInput}
                onChange={e=>{setSpellingInput(e.target.value);setSpellingFeedback(null);}}
                disabled={spellingFeedback==='correct'} className="sr-only"
                autoComplete="off" autoCorrect="off" spellCheck="false" aria-label="拼写输入"/>
              <p className="mt-3 text-center text-xs t3">每条横线代表一个字母，输错的位置会标红</p>
            </div>
            <button type="submit" disabled={!spellingInput.trim()||spellingFeedback==='correct'} className="btn btn-p w-full mt-4">
              提交校验<ArrowRight className="h-4 w-4"/>
            </button>
          </form>
          {spellingFeedback==='correct'&&<div className="flex justify-center animate-in zoom-in"><CheckCircle2 className="h-8 w-8" style={{color:'#10b981'}}/></div>}
          {spellingFeedback==='incorrect'&&(
            <div className="flex items-center rounded-xl px-4 py-3 text-sm animate-in slide-in-from-top-2" style={{background:'rgba(244,63,94,.08)',color:'#f43f5e',border:'1px solid rgba(244,63,94,.2)'}}>
              <XCircle className="mr-2 h-4 w-4 shrink-0"/>拼写错误，修改后重试。
              <button type="button" onClick={()=>{setCurrentWordMistakes(p=>p+1);setSpellingInput(word.word);setSpellingFeedback(null);}} className="ml-auto font-semibold underline shrink-0">直接填入答案</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSentencePractice = () => {
    const word = sentenceQueue[currentSentenceIndex];
    if (!word) return null;
    const norm = v=>String(v||'').trim().replace(/\s+/g,' ');
    const tgtSen = word.exampleEn||'';
    const normTgt = norm(tgtSen);
    const normIn = norm(sentenceInput);
    const isOk = normIn===normTgt;
    const tgtWords = normTgt?normTgt.split(' '):[];
    const inWords = normIn?normIn.split(' '):[];
    const slots = tgtWords.map((tp,i)=>{
      const typed=inWords[i]||'';
      const showAns=showSentenceAnswer?tp:'';
      const isOkPart=typed===tp;
      const showErr=sentenceSubmitted&&typed&&!isOkPart;
      return {key:`${tp}_${i}`,tp,typed,showAns,isOkPart,showErr,ph:'_'.repeat(Math.max(tp.length,2))};
    });
    const totalU=new Set(sentenceQueue.map(w=>w.id)).size;
    const remU=new Set(sentenceQueue.slice(currentSentenceIndex).map(w=>w.id)).size;
    const prog=totalU-remU+1;
    return (
      <div className="max-w-lg mx-auto w-full animate-in slide-in-from-right-6 duration-400">
        <div className="text-center mb-6">
          <div className="pill pill-ac mx-auto mb-3 w-fit"><Keyboard className="h-3 w-3"/>例句练习 ({prog}/{totalU})</div>
          <h2 className="text-xl font-black t1">根据中文提示写出完整的英文句子</h2>
        </div>
        <div className="card p-7 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 mt-0.5" style={{background:'var(--mu)'}}><BrainCircuit className="h-4 w-4 t3"/></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest t3 mb-1">中文提示</p>
                <p className="text-base font-semibold t1">{word.exampleZh}</p>
              </div>
            </div>
            <button type="button" onClick={()=>speakText(word.exampleEn,{allowUnlock:true})}
              className="shrink-0 rounded-full p-2.5 transition" style={{background:'var(--acs)',color:'var(--ac)'}}><Volume2 className="h-4 w-4"/></button>
          </div>
          <div className={`relative min-h-[160px] w-full cursor-text rounded-2xl border-2 p-5 transition-colors ${isOk?'border-emerald-500':'focus-within:border-indigo-400'}`}
            style={{borderColor:isOk?'#10b981':'var(--cb)',background:'var(--mu)'}}
            onClick={()=>sentenceInputRef.current?.focus()}>
            <p className="text-[10px] font-bold uppercase tracking-widest t3 mb-3">在此输入英文句子</p>
            <textarea ref={sentenceInputRef} value={sentenceInput}
              onChange={e=>{setSentenceInput(e.target.value);if(sentenceSubmitted)setSentenceSubmitted(false);}}
              className="absolute inset-0 h-full w-full resize-none cursor-text p-5 opacity-0"
              spellCheck="false" autoCapitalize="off" autoComplete="off"/>
            <div className="pointer-events-none flex flex-wrap gap-x-2.5 gap-y-3 font-mono text-lg">
              {slots.map(s=>(
                <div key={s.key} className={`border-b-2 pb-0.5 text-center ${s.showErr?'slot-err':s.isOkPart&&s.typed?'slot-ok':'slot-empty'}`}
                  style={{minWidth:`${Math.max(s.tp.length,2)*0.7}rem`}}>
                  {s.typed||s.showAns||s.ph}
                </div>
              ))}
              {!isOk&&<span className="inline-block h-5 w-2 animate-pulse self-end rounded-sm" style={{background:'var(--ac)'}}/>}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {!isOk&&<button onClick={handleShowSentenceAnswer} className="btn btn-g flex-1">显示答案提示</button>}
            <button onClick={handleSentenceSubmit} disabled={!sentenceInput.trim()}
              className={`btn flex-1 ${sentenceInput.trim()?'btn-ok':'btn-g opacity-50 cursor-not-allowed'}`}>
              {isOk?<>全部正确，下一题<ArrowRight className="h-4 w-4"/></>:sentenceSubmitted?'继续修改句子':'提交句子'}
            </button>
          </div>
          {sentenceSubmitted&&!isOk&&!showSentenceAnswer&&<p className="text-center text-xs" style={{color:'#f43f5e'}}>句子尚未完全正确，继续修改后提交。</p>}
          {usedHint&&!isOk&&<p className="text-center text-xs" style={{color:'#f59e0b'}}>使用了提示，该句子会加入队尾重试。</p>}
        </div>
      </div>
    );
  };

  const renderFinished = () => (
    <div className="max-w-sm mx-auto text-center space-y-5 animate-in zoom-in duration-400">
      <div className="card p-10">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{background:'rgba(16,185,129,.1)'}}>
          <Check className="h-10 w-10" style={{color:'#10b981'}}/>
        </div>
        <h2 className="text-2xl font-black t1">本轮完成！</h2>
        <p className="mt-3 text-base t2 leading-7">
          {sessionType==='smart_review'?'太棒了！今日所有智能复习卡片已全部清空。':'本学习批次已完成，稍作休息再继续下一轮。'}
        </p>
        <button onClick={()=>setView('home')} className="btn btn-p w-full mt-7">返回首页</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans flex flex-col" style={{background:'var(--pg)',color:'var(--t1)'}}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-5 py-3" style={{background:'rgba(var(--pg-rgb,240,240,248),.85)',backdropFilter:'blur(14px)',borderBottom:'1px solid var(--cb)'}}>
        <div onClick={()=>setView('home')} className="flex items-center gap-2 font-black text-lg tracking-tight cursor-pointer t1">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{background:'linear-gradient(135deg,#6366f1,#7c3aed)',color:'white'}}>
            <Book className="h-4 w-4"/>
          </div>
          单词大师
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {selectedBook&&!['home','library','login','register'].includes(view)&&sessionType==='normal'&&(
            <div className="hidden sm:flex pill pill-mu max-w-[160px] truncate">{ALL_BOOKS[selectedBook]?.name}</div>
          )}
          {!['home','library','login','register'].includes(view)&&sessionType==='smart_review'&&(
            <div className="hidden sm:flex pill pill-ac"><CalendarClock className="h-3 w-3"/>智能复习</div>
          )}
          {/* Theme toggle */}
          <button onClick={toggleTheme} className="theme-toggle-btn flex h-8 w-8 items-center justify-center rounded-xl transition" style={{background:'var(--mu)',color:'var(--t2)',border:'1px solid var(--cb)'}} title={themeMode==='dark'?'切换日间模式':'切换夜间模式'}>
            {themeMode==='dark'?<Sun className="h-4 w-4"/>:<Moon className="h-4 w-4"/>}
          </button>
          {authLoading?(
            <span className="text-xs t3">加载中...</span>
          ):authUser?(
            <>
              <div className="hidden sm:flex pill pill-mu"><UserRound className="h-3 w-3" style={{color:'var(--ac)'}}/>{authUser.username||authUser.email}</div>
              <button onClick={handleLogout} className="btn btn-g py-1.5 px-3 text-xs"><LogOut className="h-3.5 w-3.5"/>退出</button>
            </>
          ):(
            <>
              <button onClick={()=>{setAuthError('');setView('login');}} className="btn btn-g py-1.5 px-3 text-xs"><LogIn className="h-3.5 w-3.5"/>登录</button>
              <button onClick={()=>{setAuthError('');setView('register');}} className="btn btn-p py-1.5 px-3 text-xs"><UserPlus className="h-3.5 w-3.5"/>注册</button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center p-4 sm:p-6 pb-20 relative z-10">
        {view==='home'&&renderHome()}
        {view==='library'&&renderLibrary()}
        {view==='login'&&renderAuthPanel('login')}
        {view==='register'&&renderAuthPanel('register')}
        {view==='learning'&&renderLearning()}
        {view==='spelling'&&renderSpelling()}
        {view==='sentence_practice'&&renderSentencePractice()}
        {view==='finished'&&renderFinished()}
        {showBreakPrompt&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,.45)',backdropFilter:'blur(6px)'}}>
            <div className="card w-full max-w-md p-8 animate-in zoom-in-95" style={{borderRadius:'1.5rem'}}>
              <h3 className="text-xl font-black t1 text-center">稍作休息</h3>
              <p className="mt-3 text-sm t2 text-center leading-6">
                你刚刚完成了一批！可以休息一下，也可以继续学习
                {nextBatchPreviewCount>0?` ${nextBatchPreviewCount} `:" "}个新词。
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button onClick={handleTakeBreak} className="btn btn-g">休息一下</button>
                <button onClick={handleContinueLearning} className="btn btn-p">继续学习</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
