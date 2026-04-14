import React, { useState, useEffect, useRef } from 'react';
import { Book, Volume2, ArrowRight, CheckCircle2, XCircle, RotateCcw, BrainCircuit, GraduationCap, Check, Play, Download, Upload, Trash2, Lightbulb, CalendarClock, Keyboard, Save, UploadCloud, Sparkles, Wand2 } from 'lucide-react';
import cet4Raw from './data/cet4.txt?raw';
import cet6Raw from './data/cet6.txt?raw';

// --- 解析工具 (支持解析 KyleBing 仓库的 txt 和一般 json) ---
const parseTxt = (text, bookId, bookName) => {
  const lines = text.split('\n');
  const words = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let word = '', meaningRaw = '';
    
    const parts = line.split('\t');
    if (parts.length >= 2) {
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
        word, phonetic: '', pos, meaning, exampleEn: '', exampleZh: ''
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
    if (Array.isArray(meaning)) meaning = meaning.join('; ');
    return {
      id: `${bookId}_${index}`,
      word,
      phonetic: item.phonetic || item.usphone ? `/${item.usphone}/` : '',
      pos: '',
      meaning: typeof meaning === 'string' ? meaning : JSON.stringify(meaning),
      exampleEn: item.example || '',
      exampleZh: item.exampleZh || ''
    };
  }).filter(w => w.word !== "unknown");
  return { id: bookId, name: bookName, words };
};

// --- SRS 核心算法 (SuperMemo-2) ---
const calculateSM2 = (grade, repetition, interval, easeFactor) => {
  let newRepetition = repetition;
  let newInterval = interval;
  let newEaseFactor = easeFactor;

  if (grade >= 3) {
    if (repetition === 0) newInterval = 1;
    else if (repetition === 1) newInterval = 6;
    else newInterval = Math.round(interval * easeFactor);
    newRepetition += 1;
  } else {
    newRepetition = 0;
    newInterval = 1;
  }

  newEaseFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  return {
    repetition: newRepetition,
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReview: Date.now() + newInterval * 24 * 60 * 60 * 1000 // 未来的时间戳
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

const normalizeTopicKey = (topic) => topic.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeBookName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

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
  
  // 1. 本地存储：复习进度持久化
  const [userProgress, setUserProgress] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vocab_master_progress');
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  // 2. 本地存储：导入的自定义词库持久化
  const [customBooks, setCustomBooks] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vocab_master_custom_books');
      if (saved) return JSON.parse(saved);
    }
    return {};
  });
  const [hiddenBookIds, setHiddenBookIds] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vocab_master_hidden_books');
      if (saved) return JSON.parse(saved);
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('vocab_master_progress', JSON.stringify(userProgress));
  }, [userProgress]);

  useEffect(() => {
    localStorage.setItem('vocab_master_hidden_books', JSON.stringify(hiddenBookIds));
  }, [hiddenBookIds]);

  const ALL_BOOKS = Object.fromEntries(
    Object.entries({ ...BUILT_IN_BOOKS, ...customBooks }).filter(([bookId]) => !hiddenBookIds.includes(bookId))
  );

  const addCustomBook = (book) => {
    setCustomBooks(prev => {
      const next = { ...prev, [book.id]: book };
      localStorage.setItem('vocab_master_custom_books', JSON.stringify(next));
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

      localStorage.setItem('vocab_master_custom_books', JSON.stringify(next));
      return next;
    });

    setHiddenBookIds(prev => prev.filter(id => id !== targetBookId));
    return mergedIntoExisting;
  };

  // Session State (Learning Phase)
  const [queue, setQueue] = useState([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [learnedInSession, setLearnedInSession] = useState([]);
  
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

    const shouldUseYoudao = typeof window !== 'undefined' && /^[a-zA-Z][a-zA-Z-' ]*$/.test(normalizedText);
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
    if (view === 'learning' && learnStage === 1 && queue[currentWordIndex]) {
      playWordAudio(queue[currentWordIndex].word);
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
      if (customBooks[bookId]) {
        setCustomBooks(prev => {
          const next = {...prev};
          delete next[bookId];
          localStorage.setItem('vocab_master_custom_books', JSON.stringify(next));
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
          dueWords.push(w);
        }
      });
    });
    return dueWords.sort((a, b) => userProgress[a.id].nextReview - userProgress[b.id].nextReview);
  };

  // --- 智能复习逻辑 ---
  const startSmartReview = () => {
    const dueWords = getDueWords();
    if (dueWords.length === 0) return;

    const sessionReviews = dueWords.slice(0, 40);

    setSessionType('smart_review');
    setSpellingQueue(sessionReviews);
    setCurrentSpellingIndex(0);
    setSpellingInput('');
    setSpellingFeedback(null);
    setView('spelling');
  };

  // --- 正常学习逻辑 ---
  const startLearning = (bookId) => {
    setSelectedBook(bookId);
    const bookWords = ALL_BOOKS[bookId].words;
    
    const now = Date.now();
    const reviews = [];
    const newWords = [];
    
    bookWords.forEach(w => {
      const progress = userProgress[w.id];
      if (!progress) newWords.push(w);
      else if (progress.nextReview <= now) reviews.push(w);
    });

    reviews.sort((a, b) => userProgress[a.id].nextReview - userProgress[b.id].nextReview);
    
    const sessionReviews = reviews.slice(0, 10);
    const sessionNew = newWords.slice(0, 10 - sessionReviews.length);
    const sessionQueue = [...sessionReviews, ...sessionNew];

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
    const word = queue[currentWordIndex];
    setMcOptions(generateMCOptions(word, ALL_BOOKS));
    setMcFeedback(null);
    setLearnStage(2);
    playWordAudio(word.word, { allowUnlock: true });
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
    const newLearnedSession = [...learnedInSession, queue[currentWordIndex]];
    setLearnedInSession(newLearnedSession);

    // 计算真实的已完成唯一单词数
    const totalUnique = new Set(queue.map(w => w.id)).size;
    const learnedUnique = new Set(newLearnedSession.map(w => w.id)).size;

    if (learnedUnique >= 10 || learnedUnique === totalUnique) {
      // 提取唯一的单词进入拼写测试
      const uniqueSessionWords = Array.from(new Set(newLearnedSession.map(w => w.id)))
        .map(id => newLearnedSession.find(w => w.id === id));
      
      setSpellingQueue(uniqueSessionWords);
      setCurrentSpellingIndex(0);
      setSpellingInput('');
      setSpellingFeedback(null);
      setView('spelling');
    } else {
      moveToNextWord();
    }
  };

  const moveToNextWord = () => {
    setCurrentWordIndex(prev => prev + 1);
    setLearnStage(1);
    setView('learning');
  };

  const finishSessionBatch = () => {
    setLearnedInSession([]);
    if (sessionType === 'smart_review') {
      setView('finished');
    } else {
      // 检查是否还有剩余未学习的词
      const remainingUnique = new Set(queue.slice(currentWordIndex + 1).map(w => w.id)).size;
      if (remainingUnique > 0) {
        moveToNextWord();
      } else {
        setView('finished');
      }
    }
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
          // 拼写全通过后，萃取有例句的单词进入句子环节（去重处理，防止因循环导致相同句子出现多次）
          const validSentences = spellingQueue.filter(w => w.exampleEn && w.exampleZh);
          if (validSentences.length > 0) {
            const uniqueSentences = Array.from(new Set(validSentences.map(w => w.id)))
              .map(id => validSentences.find(w => w.id === id));
            
            setSentenceQueue(uniqueSentences);
            setCurrentSentenceIndex(0);
            setSentenceInput('');
            setShowSentenceAnswer(false);
            setUsedHint(false);
            setView('sentence_practice');
          } else {
            finishSessionBatch();
          }
        }
      }, 1000);
    } else {
      setSpellingFeedback('incorrect');
      playWordAudio(currentWord.word, { allowUnlock: true }); // 拼错时自动播放读音辅助记忆
      setCurrentWordMistakes(prev => prev + 1); // 记录错误，触发循环机制
    }
  };

  // 例句使用提示后加入队尾循环
  const handleShowSentenceAnswer = () => {
    setShowSentenceAnswer(true);
    setUsedHint(true);
  };

  const handleSentenceNext = () => {
    const word = sentenceQueue[currentSentenceIndex];
    // 如果使用了提示或之前错过，则加入队尾
    if (usedHint || word._snMistake) {
      setSentenceQueue(prev => [...prev, { ...word, _snMistake: true }]);
    }

    if (currentSentenceIndex + 1 < sentenceQueue.length) {
      setCurrentSentenceIndex(prev => prev + 1);
      setSentenceInput('');
      setShowSentenceAnswer(false);
      setUsedHint(false);
    } else {
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

    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-100 rounded-full mb-2">
            <BrainCircuit className="w-12 h-12 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">单词大师 <span className="text-indigo-600 text-2xl">Pro</span></h1>
          <p className="text-lg text-slate-600">本地记忆引擎 / 三阶段学习法 / 错误动态循环</p>
        </div>

        {/* --- 智能复习专区 --- */}
        <div className="mt-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden transition-transform hover:scale-[1.01]">
          <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
            <CalendarClock className="w-48 h-48" />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <CalendarClock className="w-6 h-6"/> 智能复习 (Smart Review)
              </h3>
              <p className="mt-2 text-emerald-50 max-w-md leading-relaxed text-sm">
                系统基于艾宾浩斯记忆曲线全局扫描。<br/>今天共有 <strong className="text-xl mx-1 text-white">{dueWordsCount}</strong> 个单词已经到达遗忘临界点。
              </p>
            </div>
            <button
              onClick={startSmartReview}
              disabled={dueWordsCount === 0}
              className="px-6 py-3.5 bg-white text-emerald-600 font-bold rounded-xl shadow-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shrink-0 flex items-center justify-center gap-2"
            >
              {dueWordsCount > 0 ? '🚀 立即开始复习' : '🎉 今日已清空'}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-8">
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

              return (
                <div
                  key={book.id}
                  onClick={() => startLearning(book.id)}
                  className="relative group text-left bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-indigo-300 transition-all duration-300 flex flex-col cursor-pointer"
                >
                  <button 
                    onClick={(e) => deleteBook(e, book.id)}
                    className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors z-10"
                    title={customBooks[book.id] ? "删除自定义词库" : "隐藏内置词库"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-slate-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Book className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-500 rounded-full mt-1 mr-8">
                      {totalWords} 词
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2 truncate pr-6">{book.name}</h3>
                  <div className="mt-auto pt-4 w-full">
                    <div className="flex justify-between text-sm text-slate-500 mb-2">
                      <span>总学习进度</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full rounded-full transition-all duration-1000" 
                        style={{ width: `${progressPercent}%` }}
                      />
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
    const word = queue[currentWordIndex];
    if (!word) return null;

    // 使用 Set 计算去重后的实际任务进度，防止错误循环导致分母变大
    const totalUnique = new Set(queue.map(w => w.id)).size;
    const remainingUnique = new Set(queue.slice(currentWordIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    return (
      <div className="max-w-xl mx-auto w-full animate-in slide-in-from-bottom-8 duration-500">
        <div className="flex justify-between items-center mb-6 text-sm font-medium text-slate-400 px-2">
          <button onClick={() => setView('home')} className="hover:text-slate-700 flex items-center">
            <RotateCcw className="w-4 h-4 mr-1" /> 保存并退出
          </button>
          <span>本次任务: {currentProgress} / {totalUnique}</span>
          <div className="flex items-center text-indigo-500">
            <GraduationCap className="w-4 h-4 mr-1" />
            <span>距测验剩 {remainingUnique} 词</span>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden min-h-[440px] flex flex-col relative">
          
          {/* 三阶段指示器 */}
          <div className="flex w-full bg-slate-50 border-b border-slate-100">
             <div className={`flex-1 py-2 text-center text-xs font-bold transition-colors ${learnStage === 1 ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300'}`}>1. 记忆输入</div>
             <div className={`flex-1 py-2 text-center text-xs font-bold transition-colors ${learnStage === 2 ? 'text-[#2563eb] bg-[#f0f5ff]' : 'text-slate-300 border-l border-r border-slate-100'}`}>2. 听音辨义</div>
             <div className={`flex-1 py-2 text-center text-xs font-bold transition-colors ${learnStage === 3 ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300'}`}>3. 巩固确认</div>
          </div>

          <div className="p-8 sm:p-10 flex-1 flex flex-col items-center justify-center text-center">
            
            {/* 阶段 1 & 3: 全量展示 */}
            {(learnStage === 1 || learnStage === 3) && (
              <>
                <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">{word.word}</h2>
                <div className="flex items-center gap-3">
                  {word.phonetic && (
                    <span className="text-lg text-slate-500 font-mono bg-slate-50 px-3 py-1 rounded-lg">
                      {word.phonetic}
                    </span>
                  )}
                  <button 
                    onClick={() => playWordAudio(word.word, { allowUnlock: true })}
                    className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-full transition-colors bg-indigo-50/50"
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="mt-8 space-y-6 w-full animate-in fade-in zoom-in-95">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left flex items-start gap-2">
                    {word.pos && <span className="text-indigo-600 font-semibold shrink-0 mt-0.5">{word.pos}</span>}
                    <p className="text-xl text-slate-800 leading-relaxed">{word.meaning}</p>
                  </div>
                  
                  {word.exampleEn && (
                    <div className="text-left bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50">
                      <div className="flex justify-between items-start">
                        <p className="text-slate-700 font-medium mb-1 flex-1">{word.exampleEn}</p>
                        <button onClick={() => speakText(word.exampleEn, { allowUnlock: true })} className="text-indigo-400 hover:text-indigo-600 ml-2 mt-0.5">
                          <Play className="w-4 h-4" />
                        </button>
                      </div>
                      {word.exampleZh && <p className="text-slate-500 text-sm mt-2">{word.exampleZh}</p>}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 阶段 2: 听音辨义测验 */}
            {learnStage === 2 && (
              <div className="w-full flex flex-col items-center animate-in zoom-in-95 duration-300">
                <div className="mb-8">
                  <button
                    onClick={() => playWordAudio(word.word, { allowUnlock: true })}
                    className="w-28 h-28 bg-[#f0f5ff] text-[#2563eb] rounded-full flex items-center justify-center mx-auto hover:bg-[#e0ebff] transition-all active:scale-95 shadow-sm"
                  >
                    <Volume2 className="w-14 h-14" strokeWidth={2.5} />
                  </button>
                </div>

                {word.exampleEn && (
                  <div className="w-full mb-6 text-left bg-indigo-50/60 p-5 rounded-2xl border border-indigo-100/70">
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-slate-700 text-lg italic leading-relaxed flex-1">"{word.exampleEn}"</p>
                      <button
                        onClick={() => speakText(word.exampleEn, { allowUnlock: true })}
                        className="text-indigo-400 hover:text-indigo-600 mt-0.5 shrink-0"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                    {word.exampleZh && (
                      <p className="text-slate-500 text-sm mt-3 leading-relaxed">{word.exampleZh}</p>
                    )}
                  </div>
                )}

                <div className="w-full grid gap-3">
                   {mcOptions.map((opt, i) => {
                     const correctFormatted = `${word.pos ? word.pos + ' ' : ''}${word.meaning}`;
                     const isCorrectOpt = opt === correctFormatted;
                     let btnStyle = "border-slate-200 bg-white hover:border-[#93c5fd] hover:bg-[#eff6ff] text-slate-800";
                     
                     if (mcFeedback) {
                       if (isCorrectOpt) {
                         btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium";
                       } else if (mcFeedback === opt) {
                         btnStyle = "border-rose-500 bg-rose-50 text-rose-800 opacity-70";
                       } else {
                         btnStyle = "border-slate-100 bg-slate-50 text-slate-400 opacity-50";
                       }
                     }

                     return (
                       <button
                         key={i}
                         onClick={() => handleOptionClick(opt, word)}
                         disabled={!!mcFeedback}
                         className={`p-4 rounded-xl text-left border transition-all duration-300 shadow-sm ${btnStyle}`}
                       >
                         <span className="text-[16px] leading-snug">{opt}</span>
                       </button>
                     )
                   })}
                </div>
                {mcFeedback && mcFeedback !== `${word.pos ? word.pos + ' ' : ''}${word.meaning}` && (
                  <p className="mt-4 text-sm text-rose-500 animate-in fade-in">选择错误，该词已移至队列尾部稍后重现</p>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 mt-auto">
            {learnStage === 1 && (
              <button
                onClick={handleToStage2}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-2xl transition-all shadow-md active:scale-[0.98]"
              >
                进入听音辨识测验
              </button>
            )}
            {learnStage === 2 && (
              <div className="py-4 text-center text-sm font-medium text-slate-400">
                请听发音，选择正确的中文释义
              </div>
            )}
            {learnStage === 3 && (
              <button
                onClick={handleNextLearn}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center"
              >
                记住了，下一个 <ArrowRight className="ml-2 w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSpelling = () => {
    const word = spellingQueue[currentSpellingIndex];
    if (!word) return null;

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
            <input
              ref={inputRef}
              type="text"
              value={spellingInput}
              onChange={(e) => {
                setSpellingInput(e.target.value);
                setSpellingFeedback(null); // 修改后自动清除错误状态
              }}
              disabled={spellingFeedback === 'correct'} // 仅在正确时锁死输入框
              placeholder="请输入英文字母..."
              className={`w-full text-2xl font-mono py-5 px-5 rounded-2xl outline-none border-2 transition-all text-center
                ${spellingFeedback === 'correct' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 
                  spellingFeedback === 'incorrect' ? 'border-rose-500 bg-rose-50 text-rose-700 animate-shake' : 
                  'border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white'}
              `}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            
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
    
    const targetSentence = word.exampleEn;
    const targetChars = targetSentence.split('');
    const inputChars = sentenceInput.split('');
    const isFullyCorrect = sentenceInput === targetSentence;

    // 使用 Set 计算去重后的实际任务进度
    const totalUnique = new Set(sentenceQueue.map(w => w.id)).size;
    const remainingUnique = new Set(sentenceQueue.slice(currentSentenceIndex).map(w => w.id)).size;
    const currentProgress = totalUnique - remainingUnique + 1;

    return (
      <div className="max-w-2xl mx-auto w-full animate-in slide-in-from-right-8 duration-500">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full mb-4 flex items-center gap-2 justify-center w-max mx-auto">
            <Keyboard className="w-4 h-4"/>
            情境例句输入 ({currentProgress}/{totalUnique})
          </span>
          <h2 className="text-2xl font-bold text-slate-800">请根据中文释义，完成英文例句</h2>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
          <div className="mb-8 flex items-start gap-3">
            <div className="mt-1 bg-slate-100 text-slate-500 p-2 rounded-lg"><BrainCircuit className="w-4 h-4"/></div>
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">目标中文句意</span>
              <p className="text-lg text-slate-800 font-medium mt-1">{word.exampleZh}</p>
            </div>
          </div>

          <div 
            className={`relative w-full min-h-[140px] bg-slate-50 border-2 rounded-2xl p-5 cursor-text transition-colors ${isFullyCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 focus-within:border-indigo-500'}`}
            onClick={() => sentenceInputRef.current?.focus()}
          >
            <textarea
              ref={sentenceInputRef}
              value={sentenceInput}
              onChange={(e) => setSentenceInput(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 resize-none cursor-text p-5"
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
            />
            <div className="text-[20px] sm:text-2xl font-mono text-left break-words whitespace-pre-wrap pointer-events-none leading-loose">
              {inputChars.map((char, i) => {
                const isCorrect = i < targetChars.length && char === targetChars[i];
                return (
                  <span key={i} className={isCorrect ? "text-emerald-500" : "text-rose-500 bg-rose-100 underline decoration-rose-500 underline-offset-4"}>
                    {char}
                  </span>
                );
              })}
              {!isFullyCorrect && (
                <span className="inline-block w-2.5 h-6 bg-indigo-500 animate-pulse align-middle ml-0.5" style={{ marginBottom: '-4px' }}></span>
              )}
              {showSentenceAnswer && targetChars.slice(inputChars.length).map((char, i) => (
                <span key={`hint-${i}`} className="text-slate-300">
                  {char}
                </span>
              ))}
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
              onClick={() => {
                if(isFullyCorrect) handleSentenceNext();
              }}
              className={`flex-1 py-4 font-bold rounded-2xl flex items-center justify-center transition-all ${isFullyCorrect ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-[0.98]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isFullyCorrect ? '完全正确，下一个' : '请输入完整且正确的句子'}
              {isFullyCorrect && <ArrowRight className="ml-2 w-5 h-5" />}
            </button>
          </div>
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
