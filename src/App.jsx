import React, { useState, useEffect, useRef } from 'react';
import { Book, Volume2, ArrowRight, CheckCircle2, XCircle, RotateCcw, BrainCircuit, GraduationCap, Check, Play, Download, Upload, Trash2, Lightbulb, CalendarClock, Keyboard, Save, UploadCloud, Sparkles, Wand2, Flame, TrendingUp, Target, Quote, ChevronRight, Search, LogIn, LogOut, UserRound, UserPlus } from 'lucide-react';
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

  useEffect(() => {
    safeWriteStorageJson('vocab_master_progress', userProgress);
  }, [userProgress]);

  useEffect(() => {
    safeWriteStorageJson('vocab_master_hidden_books', hiddenBookIds);
  }, [hiddenBookIds]);

  useEffect(() => {
    safeWriteStorageJson('vocab_master_selected_books', selectedBookIds);
  }, [selectedBookIds]);

  const ALL_BOOKS = { ...CHUNKED_BUILT_IN_BOOKS, ...customBooks };
  const ALL_BOOK_LIST = Object.values(ALL_BOOKS);
  const WORD_META_MAP = Object.fromEntries(
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
  );
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
  const getDueWords = () => {
    const now = Date.now();
    const dueWords = [];
    Object.values(ALL_BOOKS).forEach(book => {
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
    const title = isLogin ? 'Login' : 'Create account';
    const description = isLogin
      ? 'After login, your books, progress and settings will be saved to D1 first.'
      : 'Create an account to bind your books and study progress to the current user.';

    return (
      <div className="max-w-md mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]">
          <div className="text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              {isLogin ? <LogIn className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
          </div>

          <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} className="mt-8 space-y-4">
            {!isLogin && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
                <input
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, username: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  placeholder="Optional"
                />
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                value={isLogin ? loginForm.email : registerForm.email}
                onChange={(e) => (
                  isLogin
                    ? setLoginForm((prev) => ({ ...prev, email: e.target.value }))
                    : setRegisterForm((prev) => ({ ...prev, email: e.target.value }))
                )}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
              <input
                type="password"
                value={isLogin ? loginForm.password : registerForm.password}
                onChange={(e) => (
                  isLogin
                    ? setLoginForm((prev) => ({ ...prev, password: e.target.value }))
                    : setRegisterForm((prev) => ({ ...prev, password: e.target.value }))
                )}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                placeholder="At least 6 characters"
                required
              />
            </div>

            {authError && (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 ring-1 ring-rose-100">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authSubmitting ? 'Submitting...' : isLogin ? 'Login' : 'Register'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <button
              onClick={() => {
                setAuthError('');
                setView('home');
              }}
              className="font-medium transition hover:text-slate-800"
            >
              Continue as guest
            </button>
            <button
              onClick={() => {
                setAuthError('');
                setView(isLogin ? 'register' : 'login');
              }}
              className="font-semibold text-indigo-600 transition hover:text-indigo-700"
            >
              {isLogin ? 'Create account' : 'Back to login'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderHome = () => {
    const dueWordsCount = getDueWordsForBooks(MY_BOOKS_MAP).length;
    const totalBooks = MY_BOOKS.length;
    const totalWords = MY_BOOKS.reduce((sum, book) => sum + book.words.length, 0);
    const totalLearned = MY_BOOKS.reduce((sum, book) => (
      sum + book.words.filter(w => userProgress[w.id]).length
    ), 0);
    const dailyNewTarget = Math.max(0, Math.min(20, totalWords - totalLearned));
    const estimatedMinutes = Math.max(5, Math.ceil((dueWordsCount + dailyNewTarget) * 0.75));
    const firstSelectedBookId = MY_BOOKS[0]?.id;

    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 shadow-sm">
              <div className="rounded-2xl bg-indigo-600 p-2.5 text-white shadow-lg shadow-indigo-500/20">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">My Books</p>
                <p className="text-xs text-slate-500">Only the books you added to home are shown here.</p>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                Finish today&apos;s tasks, then choose what to study next.
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                Home now shows only the books you selected. All available books, imports, and AI topic books are managed in the library.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600">
              <Flame className="h-4 w-4" />
              Due today {dueWordsCount} words
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              Added {totalBooks} books
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-7 text-white shadow-[0_24px_70px_-22px_rgba(13,148,136,0.55)] sm:p-9">
          <div className="absolute -top-16 right-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.95fr] lg:items-end">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-emerald-50 backdrop-blur">
                <Target className="h-4 w-4" />
                Today&apos;s tasks
              </div>
              <div>
                <h3 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Work through My Books first, then expand from the library.
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-50/90 sm:text-base">
                  Smart Review only reads due cards from My Books. When you finish reviewing, you can go back to the library and add more books anytime.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">Due now</p>
                  <p className="mt-3 text-4xl font-black">{dueWordsCount}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">From My Books</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">New words</p>
                  <p className="mt-3 text-4xl font-black">{dailyNewTarget}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">Estimated from current books</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">Est. minutes</p>
                  <p className="mt-3 text-4xl font-black">{estimatedMinutes}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">Expected to finish today</p>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/15 bg-slate-950/15 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">Overview</p>
                  <p className="mt-2 text-xl font-bold">Home only keeps the books you truly want to study.</p>
                </div>
                <CalendarClock className="h-9 w-9 text-emerald-50/85" />
              </div>
              <div className="mt-5 space-y-3 text-sm text-emerald-50/90">
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>My books</span>
                  <span className="font-bold text-white">{totalBooks}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>Total words</span>
                  <span className="font-bold text-white">{totalWords}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>Learned words</span>
                  <span className="font-bold text-white">{totalLearned}</span>
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                <button
                  onClick={startSmartReview}
                  disabled={dueWordsCount === 0 || isPreparingReview}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-emerald-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPreparingReview ? 'Preparing review examples' : dueWordsCount > 0 ? "Start today's review" : 'No due review cards in my books'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (firstSelectedBookId) startLearning(firstSelectedBookId);
                  }}
                  disabled={!firstSelectedBookId}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue from My Books
                </button>
                <button
                  onClick={() => setView('library')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-slate-950/15 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-950/25"
                >
                  Go to library
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Completion rate</p>
                <p className="mt-1 text-3xl font-black text-slate-900">
                  {totalWords ? Math.round((totalLearned / totalWords) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-orange-50 p-3 text-orange-500">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Words due today</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{dueWordsCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Books on home</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{totalBooks}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">My Books</h2>
            <p className="mt-1 text-sm text-slate-500">Only books added to home are shown here, in the order you added them.</p>
          </div>
          <button
            onClick={() => setView('library')}
            className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-indigo-600 sm:inline-flex"
          >
            Go to library <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {MY_BOOKS.length === 0 ? (
            <div className="col-span-full rounded-[2rem] border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center text-slate-500">
              <Book className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <h3 className="text-xl font-black text-slate-800">You have not added any books yet</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                Go to the library and choose the books you want to study. Once added, they will appear on the home page immediately.
              </p>
              <button
                onClick={() => setView('library')}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                Go to library
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            MY_BOOKS.map(book => {
              const bookWordCount = book.words.length;
              const learnedCount = book.words.filter(w => userProgress[w.id]).length;
              const progressPercent = Math.round((learnedCount / bookWordCount) * 100) || 0;
              const missingExamplesCount = book.words.filter(w => !w.exampleEn || !w.exampleZh).length;
              const missingPhoneticsCount = book.words.filter(w => !w.phonetic).length;

              return (
                <div
                  key={book.id}
                  onClick={() => startLearning(book.id)}
                  className="relative group flex cursor-pointer flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]"
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-slate-50 via-indigo-50/60 to-white opacity-90" />
                  <button
                    onClick={(e) => handleRemoveOrDeleteBook(e, book.id)}
                    className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                    title={customBooks[book.id] ? 'Delete custom book' : 'Remove from home'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="relative z-10 mb-8 flex items-start justify-between">
                    <div className="rounded-2xl bg-white p-3 text-indigo-600 ring-1 ring-slate-200 shadow-sm transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600">
                      <Book className="h-6 w-6" />
                    </div>
                    <span className="mr-8 mt-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {bookWordCount} words
                    </span>
                  </div>
                  <div className="relative z-10">
                    <div className="mb-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">
                      {getBookCategory(book)}
                    </div>
                    <h3 className="pr-6 text-[28px] font-black leading-tight tracking-tight text-slate-950">{book.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Learned {learnedCount} / {bookWordCount} words. Tap to continue.
                    </p>
                  </div>
                  <div className="relative z-10 mt-6 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-400">
                        <span>Overall progress</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-500">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span>Examples</span>
                        <span className="font-semibold text-slate-700">
                          {missingExamplesCount === 0 ? 'Ready' : `${missingExamplesCount} missing`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span>Phonetics</span>
                        <span className="font-semibold text-slate-700">
                          {missingPhoneticsCount === 0 ? 'Ready' : `${missingPhoneticsCount} missing`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 text-sm font-semibold text-indigo-600">
                      <PlayCircle className="h-5 w-5" />
                      Start learning
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Save className="w-5 h-5 text-slate-600" />
            项目数据备份与恢复
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            您的学习进度默认保存在当前浏览器中。若您需要更换设备，或防止清理浏览器缓存导致数据丢失，请定期导出备份。
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleExportData}
              className="flex-1 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition-colors flex items-center justify-center border border-emerald-200"
            >
              <Save className="w-5 h-5 mr-2" />
              导出进度备份 (.json)
            </button>
            <label className="flex-1 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors flex items-center justify-center cursor-pointer">
              <UploadCloud className="w-5 h-5 mr-2" />
              恢复历史备份
              <input type="file" accept=".json" className="hidden" onChange={handleImportData} />
            </label>
          </div>
        </div>
      </div>
    );
  };

  const renderLibrary = () => {
    const normalizedSearch = librarySearch.trim().toLowerCase();
    const filteredBooks = ALL_BOOK_LIST.filter((book) => {
      const category = getBookCategory(book);
      const matchesCategory = libraryFilter === BOOK_LIBRARY_FILTERS[0] || category === libraryFilter;
      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;

      const haystack = `${book.name} ${category} ${getBookDescription(book)}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 shadow-sm">
              <div className="rounded-2xl bg-indigo-600 p-2.5 text-white shadow-lg shadow-indigo-500/20">
                <Book className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Book Library</p>
                <p className="text-xs text-slate-500">All available books are managed here in one place.</p>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Choose from the library, then add books to home.</h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                Search, filter, and add the books you really want to study. Once added, they will appear on the home page immediately.
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('home')}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-indigo-600"
          >
            Back to My Books
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search books by name, category, or description"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {BOOK_LIBRARY_FILTERS.map((filter) => {
                const active = libraryFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setLibraryFilter(filter)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>
          {!authUser && (
            <p className="mt-4 text-sm text-slate-500">
              You are in guest mode. You can still add books to home and keep them locally. After logging in, they can be synced to your account.
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {filteredBooks.map((book) => {
            const isSelected = selectedBookIds.includes(book.id);
            const category = getBookCategory(book);
            return (
              <div
                key={book.id}
                className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]"
              >
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-slate-50 via-indigo-50/60 to-white opacity-90" />
                <div className="relative z-10 mb-8 flex items-start justify-between">
                  <div className="rounded-2xl bg-white p-3 text-indigo-600 ring-1 ring-slate-200 shadow-sm">
                    <Book className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                    {book.words.length} words
                  </span>
                </div>
                <div className="relative z-10">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">{category}</span>
                    {isSelected && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Added to home</span>
                    )}
                  </div>
                  <h3 className="text-[28px] font-black leading-tight tracking-tight text-slate-950">{book.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-500">{getBookDescription(book)}</p>
                </div>
                <div className="relative z-10 mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => toggleBookSelection(book.id)}
                    className={`flex-1 rounded-2xl px-5 py-4 text-sm font-bold transition ${isSelected ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700'}`}
                  >
                    {isSelected ? 'Remove from home' : 'Add to home'}
                  </button>
                  {isSelected && (
                    <button
                      onClick={() => startLearning(book.id)}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      Start learning
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredBooks.length === 0 && (
            <div className="col-span-full rounded-[2rem] border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center text-slate-500">
              <Search className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <h3 className="text-xl font-black text-slate-800">No books match the current filter</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                Try adjusting the search term or category filter. You can also import your own local book.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };


  const renderSentencePractice = () => {
    const word = sentenceQueue[currentSentenceIndex];
    if (!word) return null;

    const normalizeSentenceWhitespace = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const targetSentence = word.exampleEn || '';
    const normalizedTargetSentence = normalizeSentenceWhitespace(targetSentence);
    const normalizedInputSentence = normalizeSentenceWhitespace(sentenceInput);
    const isFullyCorrect = normalizedInputSentence === normalizedTargetSentence;
    const targetWords = normalizedTargetSentence ? normalizedTargetSentence.split(' ') : [];
    const inputWords = normalizedInputSentence ? normalizedInputSentence.split(' ') : [];
    const sentenceSlots = targetWords.map((targetPart, index) => {
      const typedPart = inputWords[index] || '';
      const showAnswerPart = showSentenceAnswer ? targetPart : '';
      const isCorrectPart = typedPart === targetPart;
      const showError = sentenceSubmitted && typedPart && !isCorrectPart;
      const placeholder = '_'.repeat(Math.max(targetPart.length, 2));

      return {
        key: `${targetPart}_${index}`,
        targetPart,
        typedPart,
        showAnswerPart,
        isCorrectPart,
        showError,
        placeholder,
      };
    });

    // 使用 Set 计算去重后的实际任务进度
    const totalUnique = new Set(sentenceQueue.map(w => w.id)).size;
    const remainingUnique = new Set(sentenceQueue.slice(currentSentenceIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    return (
      <div className="max-w-xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            <Keyboard className="w-4 h-4"/>
            Sentence practice ({currentProgress}/{totalUnique})
          </span>
          <h2 className="text-2xl font-bold text-slate-800">Write the full English sentence based on the Chinese hint</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-slate-100 p-2 text-slate-500"><BrainCircuit className="h-4 w-4" /></div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Chinese hint</span>
                <p className="mt-1 text-lg font-medium text-slate-800">{word.exampleZh}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakText(word.exampleEn, { allowUnlock: true })}
              className="shrink-0 rounded-full bg-indigo-50 p-3 text-indigo-600 transition-colors hover:bg-indigo-100"
              title="Play full sentence hint"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>

          <div
            className={`relative min-h-[180px] w-full cursor-text rounded-2xl border-2 p-5 transition-colors ${isFullyCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 focus-within:border-indigo-500'}`}
            onClick={() => sentenceInputRef.current?.focus()}
          >
            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Chinese hint</span>
              <p className="mt-2 text-sm text-slate-500">Each underline below corresponds to one English word. Click anywhere and type the full sentence.</p>
            </div>
            <textarea
              ref={sentenceInputRef}
              value={sentenceInput}
              onChange={(e) => {
                setSentenceInput(e.target.value);
                if (sentenceSubmitted) setSentenceSubmitted(false);
              }}
              className="absolute inset-0 h-full w-full resize-none cursor-text p-5 opacity-0"
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
            />
            <div className="pointer-events-none flex flex-wrap gap-x-3 gap-y-4 font-mono text-[18px] sm:text-xl">
              {sentenceSlots.map((slot) => (
                <div
                  key={slot.key}
                  className={`min-w-[3rem] border-b-2 pb-1 text-center ${slot.showError ? 'border-rose-400 text-rose-600' : slot.isCorrectPart && slot.typedPart ? 'border-emerald-400 text-emerald-700' : 'border-slate-300 text-slate-500'}`}
                  style={{ minWidth: `${Math.max(slot.targetPart.length, 2) * 0.75}rem` }}
                >
                  {slot.typedPart || slot.showAnswerPart || slot.placeholder}
                </div>
              ))}
              {!isFullyCorrect && <span className="inline-block h-6 w-2.5 animate-pulse self-end bg-indigo-500" />}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            {!isFullyCorrect && (
              <button
                onClick={handleShowSentenceAnswer}
                className="flex-1 rounded-2xl bg-slate-100 py-4 font-bold text-slate-600 transition-all hover:bg-slate-200"
              >
                Show answer hint
              </button>
            )}
            <button
              onClick={handleSentenceSubmit}
              disabled={!sentenceInput.trim()}
              className={`flex-1 rounded-2xl py-4 font-bold transition-all ${sentenceInput.trim() ? 'bg-emerald-500 text-white shadow-md hover:bg-emerald-600 active:scale-[0.98]' : 'cursor-not-allowed bg-slate-200 text-slate-400'}`}
            >
              <span className="flex items-center justify-center">
                {isFullyCorrect ? 'All correct, next one' : sentenceSubmitted ? 'Keep editing the sentence' : 'Submit sentence'}
                {isFullyCorrect && <ArrowRight className="ml-2 h-5 w-5" />}
              </span>
            </button>
          </div>

          {sentenceSubmitted && !isFullyCorrect && !showSentenceAnswer && (
            <p className="mt-4 animate-in fade-in text-center text-sm text-rose-500">
              The sentence is not fully correct yet. Edit it and submit again to reveal error positions.
            </p>
          )}
          {usedHint && !isFullyCorrect && (
            <p className="mt-4 animate-in fade-in text-center text-sm text-amber-500">
              Using a hint will send this sentence to the back of the queue.
            </p>
          )}
        </div>
      </div>
    );
  };


  const renderFinished = () => (
    <div className="max-w-md mx-auto text-center space-y-6 animate-in zoom-in duration-500 bg-white p-10 rounded-[2rem] shadow-xl border border-slate-100">
      <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <Check className="w-12 h-12" />
      </div>
      <h2 className="text-3xl font-black text-slate-800">Session complete</h2>
      <p className="text-slate-500 text-lg leading-relaxed">
        {sessionType === 'smart_review' 
          ? "Great job. Today's smart review cards are all cleared."
          : 'This learning batch is complete. Take a short break before the next round.'}
      </p>
      <div className="pt-6">
        <button
          onClick={() => setView('home')}
          className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl w-full transition-colors"
        >
          Back to home
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center gap-4">
        <div 
          className="flex items-center gap-2 font-bold text-lg tracking-tight cursor-pointer"
          onClick={() => setView('home')}
        >
          <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
            <Book className="w-5 h-5" />
          </div>
          Word Master
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {selectedBook && !['home', 'library', 'login', 'register'].includes(view) && sessionType === 'normal' && (
            <div className="hidden max-w-xs items-center gap-1 truncate rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-500 sm:flex">
              {ALL_BOOKS[selectedBook]?.name}
            </div>
          )}
          {view !== 'home' && view !== 'library' && view !== 'login' && view !== 'register' && sessionType === 'smart_review' && (
            <div className="hidden items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-600 sm:flex">
              <CalendarClock className="w-4 h-4"/> Smart Review
            </div>
          )}
          {authLoading ? (
            <div className="text-sm text-slate-400">Loading account...</div>
          ) : authUser ? (
            <>
              <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 sm:flex">
                <UserRound className="h-4 w-4 text-indigo-500" />
                {authUser.username || authUser.email}
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setAuthError('');
                  setView('login');
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-900"
              >
                <LogIn className="h-4 w-4" />
                Log in
              </button>
              <button
                onClick={() => {
                  setAuthError('');
                  setView('register');
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                Register
              </button>
            </>
          )}
        </div>
        {false && selectedBook && !['home', 'library'].includes(view) && sessionType === 'normal' && (
          <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1 max-w-[150px] sm:max-w-xs truncate">
            {ALL_BOOKS[selectedBook]?.name}
          </div>
        )}
        {false && view !== 'home' && view !== 'library' && sessionType === 'smart_review' && (
          <div className="text-sm font-medium text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full flex items-center gap-1">
            <CalendarClock className="w-4 h-4"/> Smart Review
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col justify-center p-4 sm:p-6 pb-20 relative z-10">
        {view === 'home' && renderHome()}
        {view === 'library' && renderLibrary()}
        {view === 'login' && renderAuthPanel('login')}
        {view === 'register' && renderAuthPanel('register')}
        {view === 'learning' && renderLearning()}
        {view === 'spelling' && renderSpelling()}
        {view === 'sentence_practice' && renderSentencePractice()}
        {view === 'finished' && renderFinished()}
        {showBreakPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl animate-in zoom-in-95">
              <div className="text-center">
                <h3 className="text-2xl font-black text-slate-900">Take a short break</h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  You just finished a batch. You can go back home for a break or continue with the next
                  {nextBatchPreviewCount > 0 ? ` ${nextBatchPreviewCount} ` : " "}
                  words.
                </p>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={handleTakeBreak}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Take a break
                </button>
                <button
                  onClick={handleContinueLearning}
                  className="rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
                >
                  Continue learning
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}} />
    </div>
  );
}
