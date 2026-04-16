import React, { useState, useEffect, useRef } from 'react';
import { Book, Volume2, ArrowRight, CheckCircle2, XCircle, RotateCcw, BrainCircuit, GraduationCap, Check, Play, Download, Upload, Trash2, Lightbulb, CalendarClock, Keyboard, Save, UploadCloud, Sparkles, Wand2, Flame, TrendingUp, Target, Quote, ChevronRight, Search, LogIn, LogOut, UserRound, UserPlus } from 'lucide-react';
import cet4Raw from './data/cet4.txt?raw';
import cet6Raw from './data/cet6.txt?raw';

// --- 瑙ｆ瀽宸ュ叿 (鏀寔瑙ｆ瀽 KyleBing 浠撳簱鐨?txt 鍜屼竴鑸?json) ---
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

// --- SRS 鏍稿績绠楁硶 (SuperMemo-2) ---
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
    nextReview: Date.now() + nextReviewDelay // 鏈潵鐨勬椂闂存埑
  };
};

// 杈呭姪鍑芥暟锛氱敓鎴愬崟閫夐閫夐」 (鍖呭惈璇嶆€?
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
    wrongOptions.push(`骞叉壈閫夐」 ${Math.random().toString(36).substring(7)}`);
  }
  
  return [correctFormatted, ...wrongOptions].sort(() => 0.5 - Math.random());
};

const BUILT_IN_BOOKS = {
  kb_cet4: parseTxt(cet4Raw, 'kb_cet4', '鍥涚骇鏍稿績'),
  kb_cet6: parseTxt(cet6Raw, 'kb_cet6', '鍏骇杩涢樁')
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
    meaning: '鍏ュ彛锛涗娇鐢ㄦ潈',
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
const BOOK_LIBRARY_FILTERS = ['鍏ㄩ儴', '鍥涚骇', '鍏骇', '鑰冪爺', '鍏朵粬'];

const getBookCategory = (book) => {
  const name = String(book?.name || '').toLowerCase();
  if (name.includes('鍥涚骇') || name.includes('cet4')) return '鍥涚骇';
  if (name.includes('鍏骇') || name.includes('cet6')) return '鍏骇';
  if (name.includes('鑰冪爺') || name.includes('netem')) return '鑰冪爺';
  return '鍏朵粬';
};

const getBookDescription = (book) => {
  if (book?.aiTopicKey) return 'AI-selected topic book built from the local vocabulary pool.';
  const category = getBookCategory(book);
  if (category === '鍥涚骇') return 'Core CET-4 vocabulary for daily memorization and review.';
  if (category === '鍏骇') return 'Advanced CET-6 vocabulary for reading and writing growth.';
  if (category === '鑰冪爺') return 'Core postgraduate exam vocabulary for long-term review.';
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
  const expectedName = normalizeBookName(`${topic}璇嶄功`);
  return Object.values(books).find(
    (item) => item.aiTopicKey === topicKey || normalizeBookName(item.name) === expectedName
  );
};

export default function VocabularyMaster() {
  const [view, setView] = useState(getInitialViewFromPath); 
  const [sessionType, setSessionType] = useState('normal'); // 'normal' 鎴?'smart_review'
  const [selectedBook, setSelectedBook] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [exampleGenerationState, setExampleGenerationState] = useState({ bookId: null, completed: 0, total: 0 });
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('鍏ㄩ儴');
  
  // 1. 鏈湴瀛樺偍锛氬涔犺繘搴︽寔涔呭寲
  const [userProgress, setUserProgress] = useState(() =>
    safeReadStorageJson('vocab_master_progress', {})
  );

  // 2. 鏈湴瀛樺偍锛氬鍏ョ殑鑷畾涔夎瘝搴撴寔涔呭寲
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
          name: `${topic}璇嶄功`,
          aiTopicKey: topicKey,
          words: mergeBookWords(existingBook.words, book.words, existingBook.id)
        };
      } else {
        next[book.id] = {
          ...book,
          name: `${topic}璇嶄功`,
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
        data = { error: `鏈嶅姟绔繑鍥炰簡闈?JSON 鍝嶅簲锛?{rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `琛ヤ緥鍙ュけ璐ワ紙HTTP ${res.status}锛塦);
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
      alert(`銆?{book.name}銆嬩緥鍙ヨˉ鍏呭畬鎴愶紝鐜板湪鍙互杩涜鎷煎啓鍙ュ瓙缁冧範浜嗐€俙);
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

  // 鑷姩鎾斁瀛︿範闃舵涓€鐨勫崟璇嶉煶棰?  useEffect(() => {
    if (view === 'learning' && learnStage === 1 && activeLearningQueue[currentWordIndex]) {
      playWordAudio(activeLearningQueue[currentWordIndex].word);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWordIndex, view, learnStage]);

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
        alert(`馃帀 瀵煎叆鎴愬姛锛佸凡娣诲姞璇嶅簱锛?{bookName} (${parsedBook.words.length}璇?`);
      } catch (err) {
        alert("瀵煎叆澶辫触锛屾枃浠舵牸寮忔湁璇? " + err.message);
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

  // --- 鑾峰彇鍒版湡澶嶄範鐨勫崟璇?---
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

  // --- 鏅鸿兘澶嶄範閫昏緫 ---
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

  // --- 姝ｅ父瀛︿範閫昏緫 ---
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

  // 闃舵 1 璺宠浆鍒?闃舵 2
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
        data = { error: `鏈嶅姟绔繑鍥炰簡闈?JSON 鍝嶅簲锛圚TTP ${res.status}锛? ${rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `鐢熸垚澶辫触锛圚TTP ${res.status}锛塦);
      }

      const merged = addOrMergeAiBook(data.book, topic);
      setAiTopic('');
      alert(
        merged
          ? `馃帀 AI 璇嶄功宸插悎骞跺埌锛?{topic}璇嶄功\n鏈鏂板鎴栬ˉ鍏呬簡 ${data.book.words.length} 涓€欓€夎瘝銆俙
          : `馃帀 AI 璇嶄功鐢熸垚鎴愬姛锛?{topic}璇嶄功\n宸茬敓鎴?${data.book.words.length} 涓崟璇嶃€俙
      );
    } catch (err) {
      alert(`AI 鐢熸垚澶辫触锛?{err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 闃舵 2 鍗曢€夐鐐瑰嚮 (閿欒鍗宠烦杩囷紝鏀惧叆闃熷熬)
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
        // 閫夋嫨閿欒锛屽姞鍏ラ槦鍒楁湯灏鹃噸鏂板惊鐜?        setQueue(prev => [...prev, { ...word, _mcMistake: true }]);
        moveToNextWord();
        setMcFeedback(null);
      }, 1500); // 鐣欏嚭1.5绉掓椂闂寸湅姝ｇ‘绛旀
    }
  };

  const handleNextLearn = () => {
    const currentWord = activeLearningQueue[currentWordIndex];
    const newLearnedSession = [...learnedInSession, currentWord];
    setLearnedInSession(newLearnedSession);

    // 璁＄畻鐪熷疄鐨勫凡瀹屾垚鍞竴鍗曡瘝鏁?    const totalUnique = new Set(activeLearningQueue.map(w => w.id)).size;
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
        alert(`渚嬪彞鍑嗗澶辫触锛?{error.message}`);
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

  // 鎷煎啓娴嬮獙鎻愪氦 (寮哄埗瑕佹眰鎷煎啓姝ｇ‘鍚庢墠杩涘叆涓嬩竴涓?
  const handleSpellingSubmit = (e) => {
    e.preventDefault();
    // 浠呭湪瀹屽叏姝ｇ‘鏃堕攣姝绘彁浜?
    if (!spellingInput.trim() || spellingFeedback === 'correct') return;

    const currentWord = spellingQueue[currentSpellingIndex];
    const targetWord = currentWord.word.toLowerCase();
    
    if (spellingInput.trim().toLowerCase() === targetWord) {
      setSpellingFeedback('correct');
      playWordAudio(targetWord, { allowUnlock: true });
      
      const hasMistakeOnThisAttempt = currentWordMistakes > 0;
      // 鍙湁浠庢潵娌″湪姝?Session 鎷奸敊杩囷紝涓旀湰娆′篃娌℃湁杈撻敊锛屾墠鍒ゅ畾涓烘帉鎻?Grade 4)
      const grade = (!hasMistakeOnThisAttempt && !currentWord._spMistake) ? 4 : 1;
      const prevProgress = userProgress[currentWord.id] || { repetition: 0, interval: 0, easeFactor: 2.5 };
      const newProgress = calculateSM2(grade, prevProgress.repetition, prevProgress.interval, prevProgress.easeFactor);
      
      setUserProgress(prev => ({ ...prev, [currentWord.id]: newProgress }));
      persistProgressToD1(currentWord.id, newProgress);

      // 濡傛灉鏈鎵撻敊浜嗭紝鍔犲叆闃熷垪鏈熬閲嶆柊寰幆
      if (hasMistakeOnThisAttempt) {
        setSpellingQueue(prev => [...prev, { ...currentWord, _spMistake: true }]);
      }

      const nextQueueLength = hasMistakeOnThisAttempt ? spellingQueue.length + 1 : spellingQueue.length;

      setTimeout(() => {
        if (currentSpellingIndex + 1 < nextQueueLength) {
          setCurrentSpellingIndex(prev => prev + 1);
          setSpellingInput('');
          setSpellingFeedback(null);
          setCurrentWordMistakes(0);
        } else {
          proceedToSentencePractice(spellingQueue);
        }
      }, 1000);
    } else {
      setSpellingFeedback('incorrect');
      playWordAudio(currentWord.word, { allowUnlock: true }); // 鎷奸敊鏃惰嚜鍔ㄦ挱鏀捐闊宠緟鍔╄蹇?      setCurrentWordMistakes(prev => prev + 1); // 璁板綍閿欒锛岃Е鍙戝惊鐜満鍒?
      if (sessionType === 'smart_review') {
        setSpellingQueue(prev => prev.map((item, index) => (
          index === currentSpellingIndex
            ? { ...item, _reviewMistakeCount: (item._reviewMistakeCount || 0) + 1 }
            : item
        )));
      }
    }
  };

  // 渚嬪彞浣跨敤鎻愮ず鍚庡姞鍏ラ槦灏惧惊鐜?  const handleShowSentenceAnswer = () => {
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
    // 濡傛灉浣跨敤浜嗘彁绀烘垨涔嬪墠閿欒繃锛屽垯鍔犲叆闃熷熬
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

  // --- 鏁版嵁澶囦唤涓庢仮澶嶉€昏緫 ---
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
          if(confirm("璀﹀憡锛氭仮澶嶆暟鎹皢瑕嗙洊鎮ㄥ綋鍓嶆祻瑙堝櫒鐨勬墍鏈夎繘搴﹀拰璇嶅簱銆傜‘瀹氳缁х画鍚楋紵")) {
            setUserProgress(data.progress);
            setCustomBooks(data.customBooks);
            setHiddenBookIds(Array.isArray(data.hiddenBookIds) ? data.hiddenBookIds : []);
            setSelectedBookIds(Array.isArray(data.selectedBookIds) ? data.selectedBookIds : []);
            alert('Backup restored successfully.');
          }
        } else {
          // 鍏煎鏅€氱殑璇嶅簱 JSON 鏂囦欢涓婁紶锛岄槻姝㈢敤鎴疯鐐?
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
      setAuthError(error.message || '鐧诲綍澶辫触');
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
      setAuthError(error.message || '娉ㄥ唽澶辫触');
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
                <p className="text-sm font-semibold text-slate-900">鎴戠殑璇嶄功</p>
                <p className="text-xs text-slate-500">鍙睍绀轰綘宸茬粡鍔犲叆棣栭〉鐨勮瘝涔</p>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">鍏堝仛浠婂ぉ鐨勪换鍔★紝鍐嶅喅瀹氬鍝竴鏈€</h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                棣栭〉鐜板湪鍙繚鐣欎綘鑷繁閫夋嫨鐨勮瘝涔︺€傛墍鏈夊彲閫夎瘝涔︺€佸鍏ュ叆鍙ｅ拰 AI 涓婚璇嶄功閮芥斁鍦ㄨ瘝涔﹀簱閲岀粺涓€绠＄悊銆?              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600">
              <Flame className="h-4 w-4" />
              褰撳ぉ鍙涔?{dueWordsCount} 璇?            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              宸插姞鍏?{totalBooks} 鏈?            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-7 text-white shadow-[0_24px_70px_-22px_rgba(13,148,136,0.55)] sm:p-9">
          <div className="absolute -top-16 right-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.95fr] lg:items-end">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-emerald-50 backdrop-blur">
                <Target className="h-4 w-4" />
                浠婃棩浠诲姟
              </div>
              <div>
                <h3 className="text-3xl font-black tracking-tight sm:text-4xl">鍏堝鐞嗘垜鐨勮瘝涔︼紝鍐嶄粠璇嶄功搴撴墿灞曟柊涓婚銆</h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-50/90 sm:text-base">
                  Smart Review 鍙細璇诲彇銆屾垜鐨勮瘝涔︺€嶉噷鐨勫埌鏈熻瘝鏉°€傚仛瀹屽涔犲悗锛屼綘鍙互闅忔椂鍘昏瘝涔﹀簱鎶婃柊鐨勮瘝涔﹀姞鍏ラ椤点€?                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">寰呭涔</p>
                  <p className="mt-3 text-4xl font-black">{dueWordsCount}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">鏉ヨ嚜鎴戠殑璇嶄功</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">鏂拌瘝鐩爣</p>
                  <p className="mt-3 text-4xl font-black">{dailyNewTarget}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">鎸夊綋鍓嶈瘝涔︿及绠</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">棰勮鑰楁椂</p>
                  <p className="mt-3 text-4xl font-black">{estimatedMinutes}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">鍒嗛挓鍐呭彲瀹屾垚</p>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/15 bg-slate-950/15 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">浠诲姟鎽樿</p>
                  <p className="mt-2 text-xl font-bold">棣栭〉鍙繚鐣欎綘鐪熸瑕佸鐨勮瘝涔︺€</p>
                </div>
                <CalendarClock className="h-9 w-9 text-emerald-50/85" />
              </div>
              <div className="mt-5 space-y-3 text-sm text-emerald-50/90">
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>鎴戠殑璇嶄功</span>
                  <span className="font-bold text-white">{totalBooks}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>璇嶆暟鎬婚噺</span>
                  <span className="font-bold text-white">{totalWords}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>宸叉帉鎻¤瘝鏁</span>
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
                  浠庢垜鐨勮瘝涔︾户缁?                </button>
                <button
                  onClick={() => setView('library')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-slate-950/15 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-950/25"
                >
                  鍘昏瘝涔﹀簱
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
                <p className="text-sm font-medium text-slate-500">瀛︿範瀹屾垚鐜</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{totalWords ? Math.round((totalLearned / totalWords) * 100) : 0}%</p>
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-orange-50 p-3 text-orange-500">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">褰撳ぉ鍙涔犺瘝鏁</p>
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
                <p className="text-sm font-medium text-slate-500">鎴戠殑璇嶄功鏁伴噺</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{totalBooks}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">鎴戠殑璇嶄功</h2>
            <p className="mt-1 text-sm text-slate-500">鍙睍绀轰綘宸茬粡鍔犲叆棣栭〉鐨勮瘝涔︼紝鎸夋坊鍔犻『搴忔帓鍒椼€</p>
          </div>
          <button
            onClick={() => setView('library')}
            className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-indigo-600 sm:inline-flex"
          >
            杩涘叆璇嶄功搴?            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {MY_BOOKS.length === 0 ? (
            <div className="col-span-full rounded-[2rem] border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center text-slate-500">
              <Book className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <h3 className="text-xl font-black text-slate-800">浣犺繕娌℃湁娣诲姞璇嶄功</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                鍘昏瘝涔﹀簱閫夋嫨浣犺瀛︿範鐨勮瘝涔︺€傛坊鍔犲悗锛岄椤典細绔嬪嵆鍑虹幇瀵瑰簲鍗＄墖锛屽涔犱篃鍙細鍩轰簬杩欎簺璇嶄功杩涜銆?              </p>
              <button
                onClick={() => setView('library')}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                鍘昏瘝涔﹀簱
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
                    className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors z-10"
                    title={customBooks[book.id] ? "鍒犻櫎鑷畾涔夎瘝搴? : "浠庨椤电Щ闄?}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="relative z-10 mb-8 flex justify-between items-start">
                    <div className="rounded-2xl bg-white p-3 text-indigo-600 ring-1 ring-slate-200 shadow-sm transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600">
                      <Book className="w-6 h-6" />
                    </div>
                    <span className="mt-1 mr-8 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {bookWordCount} 璇?                    </span>
                  </div>
                  <div className="relative z-10">
                    <div className="mb-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">
                      {getBookCategory(book)}
                    </div>
                    <h3 className="pr-6 text-[28px] font-black leading-tight tracking-tight text-slate-950">{book.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">宸插涔?{learnedCount} / {bookWordCount} 璇嶏紝鐐瑰嚮鍗冲彲缁х画銆</p>
                  </div>
                  <div className="relative z-10 mt-5 rounded-2xl bg-slate-50/90 p-4 ring-1 ring-slate-100">
                    <p className="text-xs leading-6 text-slate-500">
                      {missingExamplesCount === 0 ? '宸插甫瀹屾暣渚嬪彞' : `澶嶄範鏃惰嚜鍔ㄨˉ榻?${missingExamplesCount} 鏉′緥鍙}
                      {' 路 '}
                      {missingPhoneticsCount === 0 ? '宸插甫瀹屾暣闊虫爣' : `杩樼己 ${missingPhoneticsCount} 鏉￠煶鏍嘸}
                    </p>
                  </div>
                  <div className="relative z-10 mt-auto w-full pt-6">
                    <div className="mb-3 flex justify-between text-sm text-slate-500">
                      <span className="font-medium">鎬诲涔犺繘搴</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-1000" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
                      寮€濮嬭儗璇?                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* --- 璇嶅簱瀵煎叆妯″潡 --- */}
        {false && (
        <>
        <div className="mt-12 bg-indigo-50/50 p-6 sm:p-8 rounded-3xl border border-indigo-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" />
            鍐呯疆璇嶄功涓庢墿鍏呰瘝搴?          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            鍥涚骇鏍稿績涓庡叚绾ц繘闃跺凡缁忓唴缃湪搴旂敤閲岋紝鏈嬪弸鎵撳紑缃戦〉鍗冲彲鐩存帴瀛︿範锛屼笉鍐嶄緷璧?GitHub 鍦ㄧ嚎涓嬭浇銆傛偍浠嶇劧鍙互缁х画涓婁紶鑷繁鐨勬湰鍦拌瘝涔︺€?          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              宸插唴缃洓绾ф牳蹇?            </div>
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              宸插唴缃叚绾ц繘闃?            </div>
            
            <label className="flex-1 min-w-[200px] px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center cursor-pointer shadow-sm">
              <Upload className="w-5 h-5 mr-2" />
              涓婁紶鏈湴 .txt / .json
              <input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="mt-8 bg-gradient-to-br from-indigo-50 to-white p-6 sm:p-8 rounded-3xl border border-indigo-100 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900 mb-3 flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-indigo-500" />
            AI 鏅鸿兘鐢熸垚璇嶄功
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            杈撳叆涓€涓富棰橈紝绯荤粺浼氳皟鐢?DeepSeek 鑷姩鐢熸垚涓€濂楀彲鐩存帴瀛︿範鐨勫崟璇嶄功锛屽苟淇濆瓨鍒板綋鍓嶈澶囥€?          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAiGenerateBook();
              }}
              placeholder="濡傦細鍜栧暋棣嗙敤璇€佸ぇ鍘傞潰璇曘€佽禌鍗氭湅鍏嬨€佹梾娓歌嫳璇?.."
              className="flex-1 px-6 py-5 rounded-2xl border border-slate-200 bg-white text-lg outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
            />
            <button
              onClick={handleAiGenerateBook}
              disabled={!aiTopic.trim() || isAiGenerating}
              className="px-8 py-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 min-w-[160px]"
            >
              {isAiGenerating ? (
                <>
                  <RotateCcw className="w-5 h-5 animate-spin" />
                  鐢熸垚涓?                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  鐢熸垚
                </>
              )}
            </button>
          </div>
        </div>

        {/* --- 鏁版嵁澶囦唤妯″潡 --- */}
        </>
        )}

        <div className="mt-8 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Save className="w-5 h-5 text-slate-600" />
            椤圭洰鏁版嵁澶囦唤涓庢仮澶?
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            鎮ㄧ殑瀛︿範杩涘害榛樿淇濆瓨鍦ㄥ綋鍓嶆祻瑙堝櫒涓€傝嫢鎮ㄩ渶瑕佹洿鎹㈣澶囨垨闃叉娓呯悊娴忚鍣ㄧ紦瀛樺鑷存暟鎹涪澶憋紝璇峰畾鏈熷鍑哄浠姐€?
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleExportData}
              className="flex-1 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition-colors flex items-center justify-center border border-emerald-200"
            >
              <Save className="w-5 h-5 mr-2" />
              瀵煎嚭杩涘害澶囦唤 (.json)
            </button>
            <label className="flex-1 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors flex items-center justify-center cursor-pointer">
              <UploadCloud className="w-5 h-5 mr-2" />
              鎭㈠鍘嗗彶澶囦唤
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
      const matchesCategory = libraryFilter === '鍏ㄩ儴' || category === libraryFilter;
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
                <p className="text-sm font-semibold text-slate-900">璇嶄功搴</p>
                <p className="text-xs text-slate-500">鎵€鏈夊彲鐢ㄨ瘝涔﹂兘鍦ㄨ繖閲岀粺涓€绠＄悊</p>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">浠庤瘝涔﹀簱閫夋嫨锛屽啀鍔犲叆棣栭〉銆</h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                鎼滅储銆佺瓫閫夊苟鎸戦€変綘鐪熸瑕佸鐨勮瘝涔︺€傚姞鍏ュ悗锛岄椤典細绔嬪嵆鍚屾鏄剧ず銆?              </p>
            </div>
          </div>
          <button
            onClick={() => setView('home')}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-indigo-600"
          >
            杩斿洖鎴戠殑璇嶄功
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
              褰撳墠涓烘湭鐧诲綍妯″紡銆備綘浠嶇劧鍙互鎶婅瘝涔﹀姞鍏ラ椤靛苟淇濆瓨鍦ㄦ湰鏈猴紝鐧诲綍鍚庝細鑷姩鍚屾鍒颁簯绔€?            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {filteredBooks.map((book) => {
            const isSelected = selectedBookIds.includes(book.id);
            const category = getBookCategory(book);
            return (
              <div key={book.id} className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-slate-50 via-indigo-50/60 to-white opacity-90" />
                <div className="relative z-10 mb-8 flex items-start justify-between">
                  <div className="rounded-2xl bg-white p-3 text-indigo-600 ring-1 ring-slate-200 shadow-sm">
                    <Book className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                    {book.words.length} 璇?                  </span>
                </div>
                <div className="relative z-10">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">{category}</span>
                    {isSelected && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">宸叉坊鍔犲埌棣栭〉</span>}
                  </div>
                  <h3 className="text-[28px] font-black leading-tight tracking-tight text-slate-950">{book.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-500">{getBookDescription(book)}</p>
                </div>
                <div className="relative z-10 mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => toggleBookSelection(book.id)}
                    className={`flex-1 rounded-2xl px-5 py-4 text-sm font-bold transition ${isSelected ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700'}`}
                  >
                    {isSelected ? '浠庨椤电Щ闄? : '娣诲姞鍒伴椤?}
                  </button>
                  {isSelected && (
                    <button
                      onClick={() => startLearning(book.id)}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      寮€濮嬭儗璇?                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredBooks.length === 0 && (
            <div className="col-span-full rounded-[2rem] border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center text-slate-500">
              <Search className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <h3 className="text-xl font-black text-slate-800">娌℃湁鎵惧埌绗﹀悎鏉′欢鐨勮瘝涔</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">璇曡瘯璋冩暣鎼滅储璇嶆垨鍒囨崲鍒嗙被绛涢€夛紝涔熷彲浠ヤ笂浼犺嚜宸辩殑鏈湴璇嶄功銆</p>
            </div>
          )}
        </div>

        <div className="bg-indigo-50/50 p-6 sm:p-8 rounded-3xl border border-indigo-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" />
            鍐呯疆璇嶄功涓庢墿鍏呰瘝搴?          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            杩欓噷缁熶竴绠＄悊鎵€鏈夊彲鐢ㄨ瘝涔︺€備綘鍙互缁х画涓婁紶鏈湴璇嶄功锛屼笂浼犲悗浼氳嚜鍔ㄥ姞鍏ラ椤碉紝鍚屾椂涔熶細鍑虹幇鍦ㄨ瘝涔﹀簱閲屻€?          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              宸插唴缃洓绾ф牳蹇?            </div>
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              宸插唴缃叚绾ц繘闃?            </div>
            <label className="flex-1 min-w-[200px] px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center cursor-pointer shadow-sm">
              <Upload className="w-5 h-5 mr-2" />
              涓婁紶鏈湴 .txt / .json
              <input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-white p-6 sm:p-8 rounded-3xl border border-indigo-100 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900 mb-3 flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-indigo-500" />
            AI 鏅鸿兘鐢熸垚璇嶄功
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            杈撳叆涓€涓富棰橈紝绯荤粺浼氫粠鐜版湁璇嶅簱閲岀瓫閫夊悎閫傜殑鍊欓€夎瘝锛岀敓鎴愭柊鐨勪笓棰樿瘝涔︼紝骞惰嚜鍔ㄥ姞鍏ラ椤点€?          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAiGenerateBook();
              }}
              placeholder="濡傦細鍜栧暋棣嗙敤璇€佸ぇ鍘傞潰璇曘€佹梾娓歌嫳璇?.."
              className="flex-1 px-6 py-5 rounded-2xl border border-slate-200 bg-white text-lg outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
            />
            <button
              onClick={handleAiGenerateBook}
              disabled={!aiTopic.trim() || isAiGenerating}
              className="px-8 py-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 min-w-[160px]"
            >
              {isAiGenerating ? (
                <>
                  <RotateCcw className="w-5 h-5 animate-spin" />
                  鐢熸垚涓?                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  鐢熸垚
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLearning = () => {
    const word = activeLearningQueue[currentWordIndex];
    if (!word) return null;

    // 浣跨敤 Set 璁＄畻鍘婚噸鍚庣殑瀹為檯浠诲姟杩涘害锛岄槻姝㈤敊璇惊鐜鑷村垎姣嶅彉澶?    const totalUnique = new Set(activeLearningQueue.map(w => w.id)).size;
    const remainingUnique = new Set(activeLearningQueue.slice(currentWordIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;
    const isStage1 = learnStage === 1;
    const isStage2 = learnStage === 2;
    const isStage3 = learnStage === 3;

    return (
      <div className="mx-auto w-full max-w-5xl animate-in slide-in-from-bottom-8 duration-500">
        <div className="mb-6 grid gap-4 rounded-[2rem] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur md:grid-cols-[auto_1fr_auto] md:items-center">
          <button
            onClick={() => setView('home')}
            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            杩斿洖棣栭〉
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { step: 1, label: '鍚煶杈ㄤ箟' },
              { step: 2, label: '璁板繂杈撳叆' },
              { step: 3, label: '宸╁浐纭' }
            ].map(item => {
              const active = learnStage === item.step;
              return (
                <div
                  key={item.step}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]'
                      : 'bg-slate-50 text-slate-400 ring-1 ring-slate-100'
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'
                    }`}
                  >
                    {item.step}
                  </span>
                  {item.label}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-3">
            <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-slate-100 sm:block">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                style={{ width: `${Math.max(8, Math.round((currentProgress / totalUnique) * 100))}%` }}
              />
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
              {currentProgress} <span className="font-medium text-slate-400">/ {totalUnique}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="overflow-hidden rounded-[2.25rem] border border-slate-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-6 py-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600 ring-1 ring-slate-200">
                <GraduationCap className="h-4 w-4" />
                瀛︿範涓?              </div>
              <div className="text-sm font-medium text-slate-400">鍓╀綑 {remainingUnique} 璇</div>
            </div>

            <div className="flex min-h-[620px] flex-col justify-between p-8 sm:p-12">
              <div className="flex-1">
                {(isStage1 || isStage2 || isStage3) && (
                  <div className="flex h-full flex-col items-center text-center">
                    <div className="mt-2 inline-flex items-center rounded-full bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-400 ring-1 ring-slate-100">
                      {isStage1 ? 'Listen First' : isStage2 ? 'Memory Input' : 'Consolidation'}
                    </div>
                    <h2 className="mt-7 text-5xl font-black tracking-tight text-slate-950 sm:text-[5rem]">{word.word}</h2>
                    <button
                      onClick={() => playWordAudio(word.word, { allowUnlock: true })}
                      className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-slate-600 transition hover:bg-slate-100"
                    >
                      <Volume2 className="h-5 w-5 text-indigo-500" />
                      <span className="text-lg font-mono tracking-wide">{word.phonetic || '/鏆傛棤闊虫爣/'}</span>
                    </button>

                    <div className="my-10 h-px w-full max-w-xl bg-slate-100" />

                    {(isStage2 || isStage3) && (
                      <div className="w-full max-w-2xl space-y-8 text-left animate-in fade-in duration-300">
                        <div className="flex items-start gap-4 rounded-[1.75rem] bg-slate-50/90 p-6 ring-1 ring-slate-100">
                          {word.pos && (
                            <span className="mt-0.5 shrink-0 rounded-lg bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-600 ring-1 ring-indigo-100">
                              {word.pos}
                            </span>
                          )}
                          <p className="text-2xl font-semibold leading-snug text-slate-800">{word.meaning}</p>
                        </div>

                        {word.exampleEn && (
                          <div className="flex items-start gap-4 rounded-[1.75rem] border border-indigo-100 bg-indigo-50/60 p-6">
                            <Quote className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-lg leading-8 text-slate-700">{word.exampleEn}</p>
                                <button
                                  onClick={() => speakText(word.exampleEn, { allowUnlock: true })}
                                  className="mt-0.5 shrink-0 rounded-full p-2 text-indigo-400 transition hover:bg-white/70 hover:text-indigo-600"
                                >
                                  <Play className="h-4 w-4" />
                                </button>
                              </div>
                              {word.exampleZh && (
                                <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{word.exampleZh}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-10 border-t border-slate-100 pt-6">
                {isStage1 && (
                  <button
                    onClick={handleToStage2}
                    className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] bg-slate-950 py-4 text-base font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                  >
                    鏌ョ湅閲婁箟
                    <ArrowRight className="h-5 w-5" />
                  </button>
                )}
                {isStage2 && (
                  <button
                    onClick={handleToStage3}
                    className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] bg-slate-950 py-4 text-base font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                  >
                    杩涘叆宸╁浐
                    <ArrowRight className="h-5 w-5" />
                  </button>
                )}
                {isStage3 && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      onClick={() => handleLearningDecision('forgot')}
                      className="rounded-[1.25rem] bg-slate-900 py-4 text-base font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                      涓嶄細
                    </button>
                    <button
                      onClick={() => handleLearningDecision('blurred')}
                      className="rounded-[1.25rem] bg-indigo-600 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 active:scale-[0.98]"
                    >
                      妯＄硦
                    </button>
                    <button
                      onClick={() => handleLearningDecision('mastered')}
                      className="rounded-[1.25rem] bg-emerald-500 py-4 text-base font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
                    >
                      鎺屾彙
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">鏈浠诲姟</p>
              <p className="mt-3 text-4xl font-black text-slate-950">{currentProgress}</p>
              <p className="mt-2 text-sm text-slate-500">褰撳墠杩涜鍒扮 {currentProgress} 涓瘝锛岄槦鍒楁€婚噺 {totalUnique}銆</p>
            </div>
            <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">闃舵璇存槑</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <p><span className="font-semibold text-slate-900">1.</span> 鍏堝彧鐪嬪崟璇嶅拰闊虫爣锛屽厛鍚彂闊筹紝涓嶅睍绀洪噴涔夊拰渚嬪彞銆</p>
                <p><span className="font-semibold text-slate-900">2.</span> 鍐嶅睍寮€閲婁箟鍜屼緥鍙ワ紝瀹屾垚璁板繂杈撳叆銆</p>
                <p><span className="font-semibold text-slate-900">3.</span> 鏈€鍚庡啀鍋氫竴娆¤嚜鎴戝垽鏂紝涓嶄細閫€鍥炲惉闊筹紝妯＄硦閫€鍥炶蹇嗭紝鎺屾彙杩涘叆涓嬩竴璇嶃€</p>
              </div>
            </div>
            <div className="rounded-[1.8rem] border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">褰撳墠璇嶇姸鎬</p>
              <p className="mt-3 text-2xl font-black">{word.word}</p>
              {!isStage1 && <p className="mt-2 text-sm text-slate-300">{word.meaning}</p>}
              {word.phonetic && (
                <p className="mt-4 font-mono text-sm text-slate-200">{word.phonetic}</p>
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

    const targetWord = word.word;
    const normalizedInput = spellingInput.toLowerCase();
    const normalizedTarget = targetWord.toLowerCase();
    const spellingSlots = targetWord.split('').map((char, index) => {
      const typedChar = spellingInput[index] || '';
      const normalizedTypedChar = normalizedInput[index] || '';
      const isSeparator = char === ' ' || char === '-' || char === "'";
      const hasTypedChar = typedChar.length > 0;
      const isCorrectChar = normalizedTypedChar === normalizedTarget[index];
      const showError = spellingFeedback === 'incorrect' && hasTypedChar && !isCorrectChar;

      return {
        key: `${char}_${index}`,
        char,
        typedChar,
        isSeparator,
        isCorrectChar,
        showError
      };
    });

    // 浣跨敤 Set 璁＄畻鍘婚噸鍚庣殑瀹為檯浠诲姟杩涘害
    const totalUnique = new Set(spellingQueue.map(w => w.id)).size;
    const remainingUnique = new Set(spellingQueue.slice(currentSpellingIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    const titleText = sessionType === 'smart_review' 
      ? `鏅鸿兘澶嶄範鎷煎啓 (${currentProgress}/${totalUnique})`
      : `闃舵鎷煎啓娴嬮獙 (${currentProgress}/${totalUnique})`;

    return (
      <div className="max-w-xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            {sessionType === 'smart_review' ? <CalendarClock className="w-4 h-4" /> : <GraduationCap className="w-4 h-4"/>}
            {titleText}
          </span>
          <h2 className="text-2xl font-bold text-slate-800">鏍规嵁鎻愮ず鎷煎啓鍑哄搴旂殑鑻辨枃鍗曡瘝</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="space-y-6 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
              <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><Book className="w-4 h-4"/></div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">閲婁箟鎻愮ず</span>
                {word.phonetic && (
                  <p className="text-sm text-slate-500 font-mono mt-1">{word.phonetic}</p>
                )}
                <p className="text-lg font-medium text-slate-800 mt-1">
                  {word.pos && <span className="text-indigo-600 mr-2">{word.pos}</span>}
                  {word.meaning}
                </p>
              </div>
              </div>
              {spellingFeedback !== 'correct' && (
                <button
                  type="button"
                  onClick={() => playWordAudio(word.word, { allowUnlock: true })}
                  className="shrink-0 p-2 text-amber-500 hover:bg-amber-100 rounded-full transition-colors group -mt-1"
                  title="鎾斁璇婚煶鎻愮ず"
                >
                  <Lightbulb className="w-7 h-7 group-active:scale-90 transition-transform" />
                </button>
              )}
            </div>
            
            {word.exampleZh && (
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><BrainCircuit className="w-4 h-4"/></div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">璇鎻愮ず</span>
                  <p className="text-lg text-slate-700 mt-1">{word.exampleZh}</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSpellingSubmit}>
            <div
              onClick={() => inputRef.current?.focus()}
              className={`w-full rounded-2xl border-2 transition-all px-5 py-5 ${
                spellingFeedback === 'correct'
                  ? 'border-emerald-500 bg-emerald-50'
                  : spellingFeedback === 'incorrect'
                    ? 'border-rose-500 bg-rose-50 animate-shake'
                    : 'border-slate-200 bg-slate-50 focus-within:border-indigo-500 focus-within:bg-white'
              }`}
            >
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 pointer-events-none">
                {spellingSlots.map((slot) => (
                  <div
                    key={slot.key}
                    className={`min-w-[2.2rem] sm:min-w-[2.6rem] border-b-2 text-center text-2xl font-mono leading-[2.6rem] ${
                      slot.isSeparator
                        ? 'border-transparent text-slate-400'
                        : slot.showError
                          ? 'border-rose-400 text-rose-600'
                          : slot.isCorrectChar && slot.typedChar
                            ? 'border-emerald-400 text-emerald-700'
                            : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    {slot.typedChar || (slot.isSeparator ? slot.char : '_')}
                  </div>
                ))}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={spellingInput}
                onChange={(e) => {
                  setSpellingInput(e.target.value);
                  setSpellingFeedback(null);
                }}
                disabled={spellingFeedback === 'correct'}
                className="sr-only"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                aria-label="Spelling input"
              />
              <p className="mt-4 text-center text-sm text-slate-400">
                姣忔潯妯嚎浠ｈ〃涓€涓瓧姣嶏紝杈撻敊鐨勪綅缃細鏍囩孩
              </p>
            </div>
            
            <button 
              type="submit"
              disabled={!spellingInput.trim() || spellingFeedback === 'correct'}
              className="mt-6 w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center transition-all active:scale-[0.98]"
            >
              鎻愪氦鏍￠獙
              <ArrowRight className="ml-2 w-5 h-5" />
            </button>
          </form>

          {spellingFeedback === 'correct' && (
            <div className="mt-4 flex justify-end text-emerald-500 animate-in zoom-in">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}
          
          {spellingFeedback === 'incorrect' && (
            <div className="mt-4 p-4 bg-rose-50 text-rose-700 rounded-xl flex items-center text-sm animate-in slide-in-from-top-2">
              <XCircle className="w-5 h-5 mr-2 shrink-0" />
              鎷煎啓閿欒锛岃淇敼鍚庨噸鏂版彁浜ゃ€傦紙璇ヨ瘝灏嗗湪绋嶅悗閲嶆祴锛?
              <button 
                type="button"
                onClick={() => {
                  setCurrentWordMistakes(prev => prev + 1); // 璁板綍閿欒浠ラ噸缃垎鏁?
                  setSpellingInput(word.word);
                  setSpellingFeedback(null);
                }}
                className="ml-auto underline font-medium hover:text-rose-900 shrink-0"
              >
                鐩存帴濉叆绛旀
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSentencePractice = () => {
    const word = sentenceQueue[currentSentenceIndex];
    if (!word) return null;
    
    const normalizeSentenceWhitespace = (text) => String(text || '').trim().replace(/\s+/g, ' ');
    const targetSentence = word.exampleEn;
    const normalizedTargetSentence = normalizeSentenceWhitespace(targetSentence);
    const normalizedInputSentence = normalizeSentenceWhitespace(sentenceInput);
    const isFullyCorrect = normalizedInputSentence === normalizedTargetSentence;
    const targetWords = normalizedTargetSentence.split(' ');
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
        placeholder
      };
    });

    // 浣跨敤 Set 璁＄畻鍘婚噸鍚庣殑瀹為檯浠诲姟杩涘害
    const totalUnique = new Set(sentenceQueue.map(w => w.id)).size;
    const remainingUnique = new Set(sentenceQueue.slice(currentSentenceIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    return (
      <div className="max-w-2xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            <Keyboard className="w-4 h-4"/>
            鎷煎啓鍙ュ瓙 ({currentProgress}/{totalUnique})
          </span>
          <h2 className="text-2xl font-bold text-slate-800">璇锋牴鎹腑鏂囨彁绀猴紝鎷煎啓瀹屾暣鑻辨枃鍙ュ瓙</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><BrainCircuit className="w-4 h-4"/></div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">鐩爣涓枃鍙ユ剰</span>
                <p className="text-lg text-slate-800 font-medium mt-1">{word.exampleZh}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakText(word.exampleEn, { allowUnlock: true })}
              className="shrink-0 p-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
              title="鎾斁鏁村彞鎻愮ず"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          <div 
            className={`relative w-full min-h-[180px] bg-slate-50 border-2 rounded-2xl p-5 cursor-text transition-colors ${isFullyCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 focus-within:border-indigo-500'}`}
            onClick={() => sentenceInputRef.current?.focus()}
          >
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">鐩爣涓枃鍙ユ剰</span>
              <p className="mt-2 text-sm text-slate-500">涓嬫柟姣忔潯妯嚎瀵瑰簲涓€涓嫳鏂囧崟璇嶏紝鐐瑰嚮鍚庣洿鎺ヨ緭鍏ユ暣鍙ュ嵆鍙€</p>
            </div>
            <textarea
              ref={sentenceInputRef}
              value={sentenceInput}
              onChange={(e) => {
                setSentenceInput(e.target.value);
                if (sentenceSubmitted) setSentenceSubmitted(false);
              }}
              className="absolute inset-0 w-full h-full opacity-0 resize-none cursor-text p-5"
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-4 text-[18px] sm:text-xl font-mono pointer-events-none">
              {sentenceSlots.map((slot) => (
                <div
                  key={slot.key}
                  className={`min-w-[3rem] border-b-2 pb-1 text-center ${
                    slot.showError
                      ? 'border-rose-400 text-rose-600'
                      : slot.isCorrectPart && slot.typedPart
                        ? 'border-emerald-400 text-emerald-700'
                        : 'border-slate-300 text-slate-500'
                  }`}
                  style={{ minWidth: `${Math.max(slot.targetPart.length, 2) * 0.75}rem` }}
                >
                  {slot.typedPart || slot.showAnswerPart || slot.placeholder}
                </div>
              ))}
              {!isFullyCorrect && (
                <span className="inline-block w-2.5 h-6 bg-indigo-500 animate-pulse self-end" />
              )}
            </div>
            
            {isFullyCorrect && (
              <div className="absolute right-4 bottom-4 text-emerald-500 animate-in zoom-in">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            {!isFullyCorrect && (
              <button
                onClick={handleShowSentenceAnswer}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
              >
                鏄剧ず绛旀鎻愮ず
              </button>
            )}
            <button
              onClick={handleSentenceSubmit}
              disabled={!sentenceInput.trim()}
              className={`flex-1 py-4 font-bold rounded-2xl flex items-center justify-center transition-all ${sentenceInput.trim() ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-[0.98]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isFullyCorrect ? 'All correct, next one' : sentenceSubmitted ? 'Keep editing the sentence' : 'Submit sentence'}
              {isFullyCorrect && <ArrowRight className="ml-2 w-5 h-5" />}
            </button>
          </div>
          {sentenceSubmitted && !isFullyCorrect && !showSentenceAnswer && (
            <p className="mt-4 text-sm text-rose-500 text-center animate-in fade-in">
              鍙ュ瓙杩樻病鏈夊畬鍏ㄦ嫾瀵癸紝淇敼鍚庡啀鎻愪氦銆傚彧鏈夋彁浜ゅ悗鎵嶄細鏍囧嚭閿欒浣嶇疆銆?            </p>
          )}
          {usedHint && !isFullyCorrect && (
            <p className="mt-4 text-sm text-amber-500 text-center animate-in fade-in">浣跨敤鎻愮ず鍚庯紝璇ュ彞瀛愬皢鍦ㄩ槦灏鹃噸鏂板惊鐜</p>
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
          杩斿洖棣栭〉
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
          鍗曡瘝澶у笀
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {selectedBook && !['home', 'library', 'login', 'register'].includes(view) && sessionType === 'normal' && (
            <div className="hidden max-w-xs items-center gap-1 truncate rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-500 sm:flex">
              {ALL_BOOKS[selectedBook]?.name}
            </div>
          )}
          {view !== 'home' && view !== 'library' && view !== 'login' && view !== 'register' && sessionType === 'smart_review' && (
            <div className="hidden items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-600 sm:flex">
              <CalendarClock className="w-4 h-4"/> 鏅鸿兘澶嶄範
            </div>
          )}
          {authLoading ? (
            <div className="text-sm text-slate-400">璐︽埛鍔犺浇涓?..</div>
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
                閫€鍑?              </button>
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
                鐧诲綍
              </button>
              <button
                onClick={() => {
                  setAuthError('');
                  setView('register');
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                娉ㄥ唽
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
            <CalendarClock className="w-4 h-4"/> 鏅鸿兘澶嶄範
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
      </main>

      {showBreakPrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-30px_rgba(15,23,42,0.55)]">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-1 ring-amber-100">
              <Flame className="h-7 w-7" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-slate-900">鍏堜紤鎭竴浼氬効</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                杩欎竴杞?10 涓崟璇嶅凡缁忓畬鎴愩€傜幇鍦ㄥ彲浠ュ厛鍥為椤典紤鎭紝涔熷彲浠ョ户缁涔犱笅涓€鎵?                {nextBatchPreviewCount > 0 ? ` ${nextBatchPreviewCount} ` : ' '}
                涓崟璇嶃€?              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleTakeBreak}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                浼戞伅涓€浼氬効
              </button>
              <button
                onClick={handleContinueLearning}
                className="rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                缁х画瀛︿範
              </button>
            </div>
          </div>
        </div>
      )}

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





