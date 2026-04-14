# word-learning 项目总结

## 1. 项目定位

`word-learning` 是一个基于 React + Vite 的英语背单词应用，目标是把“词书管理、分阶段学习、复习调度、发音辅助、AI 生成词书”放到一个纯前端优先的轻量项目里。

当前项目具备这些核心能力：

- 内置四级、六级词书
- 支持导入本地 `txt` / `json` 词书
- 支持删除或隐藏词书
- 三阶段学习流程
- 智能复习与拼写强化
- 例句练习
- 本地数据备份与恢复
- AI 智能生成词书
- 单词发音接入网易有道公益接口，失败时回退浏览器 TTS

## 2. 技术栈

- 前端框架：React 18
- 构建工具：Vite 6
- 图标：`lucide-react`
- 样式：Tailwind 风格原子类写法
- AI 接口：DeepSeek Chat Completions
- 云函数：Cloudflare Pages Functions
- 本地持久化：`localStorage`

关键文件：

- [`src/App.jsx`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx)
- [`functions/api/generate-book.js`](/d:/workplace/workplace1/python-projects/word-learning/functions/api/generate-book.js)
- [`src/data/cet4.txt`](/d:/workplace/workplace1/python-projects/word-learning/src/data/cet4.txt)
- [`src/data/cet6.txt`](/d:/workplace/workplace1/python-projects/word-learning/src/data/cet6.txt)
- [`package.json`](/d:/workplace/workplace1/python-projects/word-learning/package.json)

## 3. 功能结构

### 3.1 词书系统

项目把词书分成两类：

- 内置词书：四级核心、六级进阶
- 自定义词书：用户导入或 AI 生成

文本词书通过 `parseTxt()` 解析，JSON 词书通过 `parseJson()` 解析，统一转成内部结构：

```js
{
  id,
  name,
  words: [
    {
      id,
      word,
      phonetic,
      pos,
      meaning,
      exampleEn,
      exampleZh
    }
  ]
}
```

对应实现位置：

- [`src/App.jsx:7`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L7)
- [`src/App.jsx:43`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L43)

### 3.2 学习流程

项目的普通学习流程分成三个阶段：

1. 记忆输入：展示单词、词义、例句
2. 听音辨义：播放发音，用户做选择题
3. 巩固确认：确认已记住后进入下一词

完成一批学习后，会进入：

- 拼写测试
- 例句输入练习

这使整个流程从“识别”逐步推进到“回忆”和“输出”。

### 3.3 智能复习

项目支持全局扫描所有词书，找出“到期复习词”，组成 Smart Review 队列。用户不用手动记住该复习哪些词，系统会根据记忆参数自动安排。

对应实现：

- [`src/App.jsx:412`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L412)
- [`src/App.jsx:426`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L426)

### 3.4 AI 词书生成

用户输入一个主题，例如“咖啡馆实用英语”，前端会请求 `/api/generate-book`，由 Cloudflare Pages Function 调用 DeepSeek 生成一个新词书。

为了提高实用性，当前实现做了两件事：

- 每次生成都会带 `variationHint`，尽量避免重复结果
- 同主题词书会自动合并，并按 `word + meaning` 去重

对应实现：

- 前端入口：[`src/App.jsx:482`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L482)
- 合并逻辑：[`src/App.jsx:121`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L121)
- 云函数：[`functions/api/generate-book.js:1`](/d:/workplace/workplace1/python-projects/word-learning/functions/api/generate-book.js#L1)

## 4. 核心算法与策略

## 4.1 记忆调度算法：SM-2

项目的复习节奏基于 SuperMemo-2 思路实现。

核心参数：

- `repetition`：连续记住次数
- `interval`：下次复习间隔天数
- `easeFactor`：记忆难度系数
- `nextReview`：下次复习时间戳

判分逻辑：

- 回答较好：扩大复习间隔
- 回答较差：重置复习次数，缩短复习间隔

算法优点：

- 简单
- 足够稳定
- 很适合轻量级背词产品

对应实现：

- [`src/App.jsx:63`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L63)

简化理解：

```text
记得越稳，下次越晚复习
记错了，快速回到短周期
```

## 4.2 干扰项生成算法

在“听音辨义”阶段，系统会从所有词书中抽取其他词义，随机生成 3 个错误选项，再和正确答案混合，形成四选一题目。

策略特点：

- 干扰项来自真实词库，不是写死的假数据
- 自动去重
- 随机打乱顺序

对应实现：

- [`src/App.jsx:90`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L90)

## 4.3 错题循环策略

项目没有采用“答错后立即停在原地”的机械模式，而是把答错词重新塞回队尾，让它稍后再次出现。

这个策略在三个阶段都体现出来：

- 听音辨义答错：移到学习队尾
- 拼写答错：记录错误，后续再次出现
- 例句阶段使用提示：也会回到队尾

这样做的好处是：

- 避免用户卡死在单个词上
- 仍然保证薄弱词会再次出现
- 学习节奏更顺

## 4.4 AI 词书合并与去重策略

同主题多次生成时，项目不会简单新建多本同名词书，而是先查找已有主题词书，再执行合并。

合并规则：

- 先按主题键匹配
- 再按标准化后的词书名匹配
- 合并时以 `word + meaning` 作为去重键

对应实现：

- [`src/App.jsx:121`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L121)
- [`src/App.jsx:139`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L139)
- [`src/App.jsx:200`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L200)

## 4.5 发音策略

当前发音采用“双通道”策略：

- 单词发音：优先走网易有道公益接口
- 例句发音：使用浏览器 `speechSynthesis`
- 有道接口异常时：自动回退到浏览器 TTS

这样设计的原因：

- 单词音频更适合用词典接口
- 长句更适合浏览器 TTS
- 回退机制可以避免服务不可用时完全没声音

对应实现：

- TTS：[`src/App.jsx:286`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L286)
- 有道发音：[`src/App.jsx:306`](/d:/workplace/workplace1/python-projects/word-learning/src/App.jsx#L306)

## 5. 数据存储设计

项目使用浏览器本地存储，不依赖后端数据库。

主要存储项：

- `vocab_master_progress`
- `vocab_master_custom_books`
- `vocab_master_hidden_books`

这样做的优点：

- 无需登录
- 部署简单
- 适合个人学习和轻分享

缺点也很明确：

- 数据跟设备和浏览器绑定
- 清缓存会丢数据
- 跨设备同步需要手动备份恢复

所以项目补充了：

- 导出备份
- 导入恢复

## 6. AI 云函数设计

Cloudflare Pages Function 做的事情有：

1. 读取 `DEEPSEEK_API_KEY`
2. 接收前端主题词
3. 组装 Prompt
4. 调用 DeepSeek
5. 提取 JSON
6. 校验并清洗词条结构
7. 返回统一词书对象

为了提高稳定性，服务端还加了这些保护：

- 超时中断
- 仅接受 JSON 结构
- 兼容代码块包裹的 JSON
- 过滤空词条

对应实现：

- [`functions/api/generate-book.js:1`](/d:/workplace/workplace1/python-projects/word-learning/functions/api/generate-book.js#L1)

## 7. 适合展示的项目亮点

如果这份项目要用于课程汇报、作品集或答辩，可以重点讲这几个点：

- 把背词流程拆成“识别、拼写、例句输出”三个层级，而不是单一刷卡片
- 通过 SM-2 做个性化复习调度
- 支持 AI 按主题动态生成词书
- 同主题多轮生成可自动合并与去重
- 发音采用外部音频接口与浏览器 TTS 的容错组合
- 全部学习数据本地持久化，降低部署复杂度

## 8. 当前限制

目前项目仍有这些边界：

- 没有用户系统和云端同步
- AI 词书质量依赖模型输出
- 例句数据在 AI 极简模式下默认可能为空
- 本地数据一旦未备份且浏览器缓存被清除，会丢失
- 发音依赖外部接口或浏览器能力，不能保证所有设备完全一致

## 9. 后续可扩展方向

后续可以继续扩展这些方向：

- 增加登录与云端同步
- 引入更细的熟练度标签
- 为 AI 词书补充例句二次生成
- 增加学习统计面板
- 支持多语言词书
- 增加错误词专项训练模式

## 10. 一句话总结

这个项目本质上是一个“以记忆调度为核心、以三阶段学习为主线、用 AI 扩展词书来源、用本地存储降低产品复杂度”的英语单词学习应用。
