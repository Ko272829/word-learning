import React, { useState, useEffect, useRef } from 'react';
import { Book, Volume2, ArrowRight, CheckCircle2, XCircle, RotateCcw, BrainCircuit, GraduationCap, Check, Play, Download, Upload, Trash2, Lightbulb, CalendarClock, Keyboard, Save, UploadCloud, Sparkles, Wand2, Flame, TrendingUp, Target, Quote, ChevronRight } from 'lucide-react';
import cet4Raw from './data/cet4.txt?raw';
import cet6Raw from './data/cet6.txt?raw';

// --- 解析工具 (支持解析 KyleBing 仓库的 txt 和一般 json) ---
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
  if (!Array.isArray(jsonData)) throw new Error("JSON 格式错误: 需要数组");
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

// 辅助函数：生成单选题选项 (包含词性)
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
          name: `${book.name} ${chunkNumber}册`,
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
    phonetic: '/ˈpærədɒks/',
    pos: 'n.',
    meaning: '悖论；自相矛盾',
    exampleEn: 'It sounds like a paradox, but both ideas are true.',
    exampleZh: '这听起来像个悖论，但两个观点都成立。'
  },
  {
    id: 'demo_1',
    bookId: 'demo_book',
    word: 'access',
    phonetic: '/ˈækses/',
    pos: 'n.',
    meaning: '入口；使用权',
    exampleEn: 'Students have access to the lab after class.',
    exampleZh: '学生下课后可以使用实验室。'
  },
  {
    id: 'demo_2',
    bookId: 'demo_book',
    word: 'generous',
    phonetic: '/ˈdʒenərəs/',
    pos: 'adj.',
    meaning: '慷慨的；大方的',
    exampleEn: 'She was generous enough to share her notes.',
    exampleZh: '她很大方，把自己的笔记分享了出来。'
  }
];
const normalizeTopicKey = (topic) => topic.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeBookName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeExampleKey = (word, meaning) =>
  `${String(word || '').trim().toLowerCase()}__${String(meaning || '').trim()}`;

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
  const [view, setView] = useState('home'); 
  const [sessionType, setSessionType] = useState('normal'); // 'normal' 或 'smart_review'
  const [selectedBook, setSelectedBook] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [exampleGenerationState, setExampleGenerationState] = useState({ bookId: null, completed: 0, total: 0 });
  
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

  useEffect(() => {
    safeWriteStorageJson('vocab_master_progress', userProgress);
  }, [userProgress]);

  useEffect(() => {
    safeWriteStorageJson('vocab_master_hidden_books', hiddenBookIds);
  }, [hiddenBookIds]);

  const ALL_BOOKS = Object.fromEntries(
    Object.entries({ ...CHUNKED_BUILT_IN_BOOKS, ...customBooks }).filter(([bookId, book]) => {
      if (hiddenBookIds.includes(bookId)) return false;
      if (book?.sourceBookId && hiddenBookIds.includes(book.sourceBookId)) return false;
      return true;
    })
  );
  const isBuiltInBook = (bookId) => Boolean(CHUNKED_BUILT_IN_BOOKS[bookId]);

  const addCustomBook = (book) => {
    setCustomBooks(prev => {
      const next = { ...prev, [book.id]: book };
      safeWriteStorageJson('vocab_master_custom_books', next);
      return next;
    });
    setHiddenBookIds(prev => prev.filter(id => id !== book.id));
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
          throw new Error('补例句请求超时，请稍后重试。');
        }
        throw error;
      }

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: `服务端返回了非 JSON 响应：${rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `补例句失败（HTTP ${res.status}）`);
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
      alert(`《${book.name}》例句补充完成，现在可以进行拼写句子练习了。`);
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
  const [learnStage, setLearnStage] = useState(1); // 1:展示, 2:测验, 3:巩固
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

  // 自动播放学习阶段一的单词音频
  useEffect(() => {
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
        alert(`🎉 导入成功！已添加词库：${bookName} (${parsedBook.words.length}词)`);
      } catch (err) {
        alert("导入失败，文件格式有误: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const deleteBook = (e, bookId) => {
    e.stopPropagation();
    if (confirm("确定要删除这个词库吗？相关的记忆进度虽然保留，但词库入口将移除。")) {
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

  // --- 智能复习逻辑 ---
  const startSmartReview = () => {
    if (isPreparingReview) return;

    const dueWords = getDueWords();
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

  // 阶段 1 跳转到 阶段 2
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

    setIsAiGenerating(true);
    try {
      const res = await fetch('/api/generate-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, variationHint })
      });

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: `服务端返回了非 JSON 响应（HTTP ${res.status}）: ${rawText.slice(0, 180)}` };
      }

      if (!res.ok) {
        throw new Error(data.error || `生成失败（HTTP ${res.status}）`);
      }

      const merged = addOrMergeAiBook(data.book, topic);
      setAiTopic('');
      alert(
        merged
          ? `🎉 AI 词书已合并到：${topic}词书\n本次新增或补充了 ${data.book.words.length} 个候选词。`
          : `🎉 AI 词书生成成功：${topic}词书\n已生成 ${data.book.words.length} 个单词。`
      );
    } catch (err) {
      alert(`AI 生成失败：${err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 阶段 2 单选题点击 (错误即跳过，放入队尾)
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
      }, 1500); // 留出1.5秒时间看正确答案
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
        alert(`例句准备失败：${error.message}`);
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

  // 拼写测验提交 (强制要求拼写正确后才进入下一个)
  const handleSpellingSubmit = (e) => {
    e.preventDefault();
    // 仅在完全正确时锁死提交
    if (!spellingInput.trim() || spellingFeedback === 'correct') return;

    const currentWord = spellingQueue[currentSpellingIndex];
    const targetWord = currentWord.word.toLowerCase();
    
    if (spellingInput.trim().toLowerCase() === targetWord) {
      setSpellingFeedback('correct');
      playWordAudio(targetWord, { allowUnlock: true });
      
      const hasMistakeOnThisAttempt = currentWordMistakes > 0;
      // 只有从来没在此 Session 拼错过，且本次也没有输错，才判定为掌握(Grade 4)
      const grade = (!hasMistakeOnThisAttempt && !currentWord._spMistake) ? 4 : 1;
      const prevProgress = userProgress[currentWord.id] || { repetition: 0, interval: 0, easeFactor: 2.5 };
      const newProgress = calculateSM2(grade, prevProgress.repetition, prevProgress.interval, prevProgress.easeFactor);
      
      setUserProgress(prev => ({ ...prev, [currentWord.id]: newProgress }));

      // 如果本次打错了，加入队列末尾重新循环
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
      playWordAudio(currentWord.word, { allowUnlock: true }); // 拼错时自动播放读音辅助记忆
      setCurrentWordMistakes(prev => prev + 1); // 记录错误，触发循环机制

      if (sessionType === 'smart_review') {
        setSpellingQueue(prev => prev.map((item, index) => (
          index === currentSpellingIndex
            ? { ...item, _reviewMistakeCount: (item._reviewMistakeCount || 0) + 1 }
            : item
        )));
      }
    }
  };

  // 例句使用提示后加入队尾循环
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
      hiddenBookIds: hiddenBookIds
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
          if(confirm("警告：恢复数据将覆盖您当前浏览器的所有进度和词库。确定要继续吗？")) {
            setUserProgress(data.progress);
            setCustomBooks(data.customBooks);
            setHiddenBookIds(Array.isArray(data.hiddenBookIds) ? data.hiddenBookIds : []);
            alert("🎉 数据恢复成功！");
          }
        } else {
          // 兼容普通的词库 JSON 文件上传，防止用户误点
          alert("文件格式不匹配。请确保这是您之前导出的备份文件（包含 progress 和 customBooks）。如果是新的词库文件，请在上方【扩充词汇库】区域上传。");
        }
      } catch (err) {
        alert("读取文件失败，可能不是合法的 JSON 文件：" + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // --- UI Views ---
  const renderHome = () => {
    const dueWordsCount = getDueWords().length;
    const allBooks = Object.values(ALL_BOOKS);
    const totalBooks = allBooks.length;
    const totalWords = allBooks.reduce((sum, book) => sum + book.words.length, 0);
    const totalLearned = allBooks.reduce((sum, book) => (
      sum + book.words.filter(w => userProgress[w.id]).length
    ), 0);
    const dailyNewTarget = Math.max(0, Math.min(20, totalWords - totalLearned));
    const estimatedMinutes = Math.max(5, Math.ceil((dueWordsCount + dailyNewTarget) * 0.75));

    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 shadow-sm">
              <div className="rounded-2xl bg-indigo-600 p-2.5 text-white shadow-lg shadow-indigo-500/20">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Word Learning</p>
                <p className="text-xs text-slate-500">本地记忆引擎 / 三阶段学习 / 动态复习</p>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">先做今天的任务，再扩你的词量。</h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                我按参考稿把首页改成任务驱动布局。先看今天的复习和新词负荷，再决定进入哪一本词书。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600">
              <Flame className="h-4 w-4" />
              当天可复习 {dueWordsCount} 词
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              已掌握 {totalLearned} 词
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
                今日任务
              </div>
              <div>
                <h3 className="text-3xl font-black tracking-tight sm:text-4xl">先处理该复习的词，再进入今天的新词。</h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-50/90 sm:text-base">
                  Smart Review 会优先拉出今天已经到期的词条。做完复习后，再进入新词阶段，学习节奏更稳定。
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">待复习</p>
                  <p className="mt-3 text-4xl font-black">{dueWordsCount}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">今天应该回看的词</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">新词目标</p>
                  <p className="mt-3 text-4xl font-black">{dailyNewTarget}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">保持可持续负荷</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">预计耗时</p>
                  <p className="mt-3 text-4xl font-black">{estimatedMinutes}</p>
                  <p className="mt-2 text-sm text-emerald-50/80">分钟内可完成</p>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/15 bg-slate-950/15 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/70">任务摘要</p>
                  <p className="mt-2 text-xl font-bold">今天先做复习，再开新词。</p>
                </div>
                <CalendarClock className="h-9 w-9 text-emerald-50/85" />
              </div>
              <div className="mt-5 space-y-3 text-sm text-emerald-50/90">
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>已接入词书</span>
                  <span className="font-bold text-white">{totalBooks}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>词库总量</span>
                  <span className="font-bold text-white">{totalWords}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>已掌握词数</span>
                  <span className="font-bold text-white">{totalLearned}</span>
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                <button
                  onClick={startSmartReview}
                  disabled={dueWordsCount === 0 || isPreparingReview}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-emerald-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPreparingReview ? '正在准备复习例句' : dueWordsCount > 0 ? '开始今日复习' : '今日复习已清空'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    const firstBookId = allBooks[0]?.id;
                    if (firstBookId) startLearning(firstBookId);
                  }}
                  disabled={allBooks.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  从当前词书继续
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
                <p className="text-sm font-medium text-slate-500">学习完成率</p>
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
                <p className="text-sm font-medium text-slate-500">当天可复习词数</p>
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
                <p className="text-sm font-medium text-slate-500">在库词书数量</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{totalBooks}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">我的词书</h2>
            <p className="mt-1 text-sm text-slate-500">卡片保留原功能，只把层级和密度按参考稿重排。</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 sm:inline-flex">
            已接入 {totalBooks} 本
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {Object.keys(ALL_BOOKS).length === 0 ? (
            <div className="col-span-full py-12 px-6 text-center bg-white rounded-3xl border-2 border-slate-200 border-dashed text-slate-500">
              <Book className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-700 mb-1">暂无学习词库</h3>
              <p className="text-sm">请从下方「扩充词汇库」区域导入您的第一本词书</p>
            </div>
          ) : (
            Object.values(ALL_BOOKS).map(book => {
              const totalWords = book.words.length;
              const learnedCount = book.words.filter(w => userProgress[w.id]).length;
              const progressPercent = Math.round((learnedCount / totalWords) * 100) || 0;
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
                    onClick={(e) => deleteBook(e, book.id)}
                    className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors z-10"
                    title={customBooks[book.id] ? "删除自定义词库" : "隐藏内置词库"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="relative z-10 mb-8 flex justify-between items-start">
                    <div className="rounded-2xl bg-white p-3 text-indigo-600 ring-1 ring-slate-200 shadow-sm transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600">
                      <Book className="w-6 h-6" />
                    </div>
                    <span className="mt-1 mr-8 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {totalWords} 词
                    </span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="pr-6 text-[28px] font-black leading-tight tracking-tight text-slate-950">{book.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">已学习 {learnedCount} / {totalWords} 词，点击即可继续。</p>
                  </div>
                  <div className="relative z-10 mt-5 rounded-2xl bg-slate-50/90 p-4 ring-1 ring-slate-100">
                    <p className="text-xs leading-6 text-slate-500">
                      {missingExamplesCount === 0 ? '已带完整例句' : `复习时自动补齐 ${missingExamplesCount} 条例句`}
                      {' · '}
                      {missingPhoneticsCount === 0 ? '已带完整音标' : `还缺 ${missingPhoneticsCount} 条音标`}
                    </p>
                  </div>
                  <div className="relative z-10 mt-auto w-full pt-6">
                    <div className="mb-3 flex justify-between text-sm text-slate-500">
                      <span className="font-medium">总学习进度</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-1000" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
                      进入这本词书
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* --- 词库导入模块 --- */}
        <div className="mt-12 bg-indigo-50/50 p-6 sm:p-8 rounded-3xl border border-indigo-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" />
            内置词书与扩充词库
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            四级核心与六级进阶已经内置在应用里，朋友打开网页即可直接学习，不再依赖 GitHub 在线下载。您仍然可以继续上传自己的本地词书。
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              已内置四级核心
            </div>
            <div className="flex-1 min-w-[200px] px-4 py-3 bg-white text-indigo-600 font-medium rounded-xl border border-indigo-200 flex items-center justify-center shadow-sm">
              <Book className="w-5 h-5 mr-2" />
              已内置六级进阶
            </div>
            
            <label className="flex-1 min-w-[200px] px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center cursor-pointer shadow-sm">
              <Upload className="w-5 h-5 mr-2" />
              上传本地 .txt / .json
              <input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="mt-8 bg-gradient-to-br from-indigo-50 to-white p-6 sm:p-8 rounded-3xl border border-indigo-100 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900 mb-3 flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-indigo-500" />
            AI 智能生成词书
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            输入一个主题，系统会调用 DeepSeek 自动生成一套可直接学习的单词书，并保存到当前设备。
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAiGenerateBook();
              }}
              placeholder="如：咖啡馆用语、大厂面试、赛博朋克、旅游英语..."
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
                  生成中
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  生成
                </>
              )}
            </button>
          </div>
        </div>

        {/* --- 数据备份模块 --- */}
        <div className="mt-8 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Save className="w-5 h-5 text-slate-600" />
            项目数据备份与恢复
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            您的学习进度默认保存在当前浏览器中。若您需要更换设备或防止清理浏览器缓存导致数据丢失，请定期导出备份。
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

  const renderLearning = () => {
    const word = activeLearningQueue[currentWordIndex];
    if (!word) return null;

    // 使用 Set 计算去重后的实际任务进度，防止错误循环导致分母变大
    const totalUnique = new Set(activeLearningQueue.map(w => w.id)).size;
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
            返回首页
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { step: 1, label: '听音辨义' },
              { step: 2, label: '记忆输入' },
              { step: 3, label: '巩固确认' }
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
                学习中
              </div>
              <div className="text-sm font-medium text-slate-400">剩余 {remainingUnique} 词</div>
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
                      <span className="text-lg font-mono tracking-wide">{word.phonetic || '/暂无音标/'}</span>
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
                    查看释义
                    <ArrowRight className="h-5 w-5" />
                  </button>
                )}
                {isStage2 && (
                  <button
                    onClick={handleToStage3}
                    className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] bg-slate-950 py-4 text-base font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                  >
                    进入巩固
                    <ArrowRight className="h-5 w-5" />
                  </button>
                )}
                {isStage3 && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      onClick={() => handleLearningDecision('forgot')}
                      className="rounded-[1.25rem] bg-slate-900 py-4 text-base font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                      不会
                    </button>
                    <button
                      onClick={() => handleLearningDecision('blurred')}
                      className="rounded-[1.25rem] bg-indigo-600 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 active:scale-[0.98]"
                    >
                      模糊
                    </button>
                    <button
                      onClick={() => handleLearningDecision('mastered')}
                      className="rounded-[1.25rem] bg-emerald-500 py-4 text-base font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
                    >
                      掌握
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">本次任务</p>
              <p className="mt-3 text-4xl font-black text-slate-950">{currentProgress}</p>
              <p className="mt-2 text-sm text-slate-500">当前进行到第 {currentProgress} 个词，队列总量 {totalUnique}。</p>
            </div>
            <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">阶段说明</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <p><span className="font-semibold text-slate-900">1.</span> 先只看单词和音标，先听发音，不展示释义和例句。</p>
                <p><span className="font-semibold text-slate-900">2.</span> 再展开释义和例句，完成记忆输入。</p>
                <p><span className="font-semibold text-slate-900">3.</span> 最后再做一次自我判断，不会退回听音，模糊退回记忆，掌握进入下一词。</p>
              </div>
            </div>
            <div className="rounded-[1.8rem] border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">当前词状态</p>
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

    // 使用 Set 计算去重后的实际任务进度
    const totalUnique = new Set(spellingQueue.map(w => w.id)).size;
    const remainingUnique = new Set(spellingQueue.slice(currentSpellingIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    const titleText = sessionType === 'smart_review' 
      ? `智能复习拼写 (${currentProgress}/${totalUnique})`
      : `阶段拼写测验 (${currentProgress}/${totalUnique})`;

    return (
      <div className="max-w-xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            {sessionType === 'smart_review' ? <CalendarClock className="w-4 h-4" /> : <GraduationCap className="w-4 h-4"/>}
            {titleText}
          </span>
          <h2 className="text-2xl font-bold text-slate-800">根据提示拼写出对应的英文单词</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="space-y-6 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
              <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><Book className="w-4 h-4"/></div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">释义提示</span>
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
                  title="播放读音提示"
                >
                  <Lightbulb className="w-7 h-7 group-active:scale-90 transition-transform" />
                </button>
              )}
            </div>
            
            {word.exampleZh && (
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><BrainCircuit className="w-4 h-4"/></div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">语境提示</span>
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
                aria-label="拼写输入框"
              />
              <p className="mt-4 text-center text-sm text-slate-400">
                每条横线代表一个字母，输错的位置会标红
              </p>
            </div>
            
            <button 
              type="submit"
              disabled={!spellingInput.trim() || spellingFeedback === 'correct'}
              className="mt-6 w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center transition-all active:scale-[0.98]"
            >
              提交校验
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
              拼写错误，请修改后重新提交。（该词将在稍后重测）
              <button 
                type="button"
                onClick={() => {
                  setCurrentWordMistakes(prev => prev + 1); // 记录错误以重置分数
                  setSpellingInput(word.word);
                  setSpellingFeedback(null);
                }}
                className="ml-auto underline font-medium hover:text-rose-900 shrink-0"
              >
                直接填入答案
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

    // 使用 Set 计算去重后的实际任务进度
    const totalUnique = new Set(sentenceQueue.map(w => w.id)).size;
    const remainingUnique = new Set(sentenceQueue.slice(currentSentenceIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    return (
      <div className="max-w-2xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            <Keyboard className="w-4 h-4"/>
            拼写句子 ({currentProgress}/{totalUnique})
          </span>
          <h2 className="text-2xl font-bold text-slate-800">请根据中文提示，拼写完整英文句子</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><BrainCircuit className="w-4 h-4"/></div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">目标中文句意</span>
                <p className="text-lg text-slate-800 font-medium mt-1">{word.exampleZh}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakText(word.exampleEn, { allowUnlock: true })}
              className="shrink-0 p-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
              title="播放整句提示"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          <div 
            className={`relative w-full min-h-[180px] bg-slate-50 border-2 rounded-2xl p-5 cursor-text transition-colors ${isFullyCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 focus-within:border-indigo-500'}`}
            onClick={() => sentenceInputRef.current?.focus()}
          >
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">目标中文句意</span>
              <p className="mt-2 text-sm text-slate-500">下方每条横线对应一个英文单词，点击后直接输入整句即可。</p>
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
                显示答案提示
              </button>
            )}
            <button
              onClick={handleSentenceSubmit}
              disabled={!sentenceInput.trim()}
              className={`flex-1 py-4 font-bold rounded-2xl flex items-center justify-center transition-all ${sentenceInput.trim() ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-[0.98]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isFullyCorrect ? '完全正确，下一个' : sentenceSubmitted ? '继续修改句子' : '提交句子'}
              {isFullyCorrect && <ArrowRight className="ml-2 w-5 h-5" />}
            </button>
          </div>
          {sentenceSubmitted && !isFullyCorrect && !showSentenceAnswer && (
            <p className="mt-4 text-sm text-rose-500 text-center animate-in fade-in">
              句子还没有完全拼对，修改后再提交。只有提交后才会标出错误位置。
            </p>
          )}
          {usedHint && !isFullyCorrect && (
            <p className="mt-4 text-sm text-amber-500 text-center animate-in fade-in">使用提示后，该句子将在队尾重新循环</p>
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
      <h2 className="text-3xl font-black text-slate-800">任务圆满完成！</h2>
      <p className="text-slate-500 text-lg leading-relaxed">
        {sessionType === 'smart_review' 
          ? "恭喜！今日的智能复习卡片已全部清空，您的记忆链接变得更牢固了。" 
          : "本轮学习卡片已全部过完，大脑需要休息来巩固神经链接。"}
      </p>
      <div className="pt-6">
        <button
          onClick={() => setView('home')}
          className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl w-full transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center">
        <div 
          className="flex items-center gap-2 font-bold text-lg tracking-tight cursor-pointer"
          onClick={() => setView('home')}
        >
          <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
            <Book className="w-5 h-5" />
          </div>
          单词大师
        </div>
        {selectedBook && view !== 'home' && sessionType === 'normal' && (
          <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1 max-w-[150px] sm:max-w-xs truncate">
            {ALL_BOOKS[selectedBook]?.name}
          </div>
        )}
        {view !== 'home' && sessionType === 'smart_review' && (
          <div className="text-sm font-medium text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full flex items-center gap-1">
            <CalendarClock className="w-4 h-4"/> 智能复习
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col justify-center p-4 sm:p-6 pb-20 relative z-10">
        {view === 'home' && renderHome()}
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
              <h3 className="text-2xl font-black text-slate-900">先休息一会儿</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                这一轮 10 个单词已经完成。现在可以先回首页休息，也可以继续学习下一批
                {nextBatchPreviewCount > 0 ? ` ${nextBatchPreviewCount} ` : ' '}
                个单词。
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleTakeBreak}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                休息一会儿
              </button>
              <button
                onClick={handleContinueLearning}
                className="rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
              >
                继续学习
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
