# jsdom 质检踩坑全集（每条至少复发 2 次）

> 本文件是 `prototype-jsdom-qc` 生产技能的完整踩坑沉淀，英文方法论见 [gates.md](gates.md)。
> 每一条都在真实交付中至少翻车两次——不是理论风险，是复发过的坑。

## jsdom 环境差异类

**1. `getComputedStyle` 不穿透祖先 `display:none`** — 对后代元素取 computed style 仍返回后代自身的 display，祖先隐藏时断言照样"可见"→ 假阴性。必须写 `really()` 逐级上溯祖先链。

**2. 空态 CSS 只对激活页生效** — 空态样式常写成 `body.demo-empty section.page.active:not(#board)>…`。断言某页空态前必须先 `showPage(该页)`，否则恒假。

**3. 断言"某分支不含某文案"不要读父容器 `textContent`** — 父容器会把 `display:none` 兄弟分支的内容算进去，恒假。读可见分支元素自身的 textContent，或先断 display。⚠️ 这条也是负向断言的作用域铁律：扫描域限定到受约束容器，全文档扫会被别处的演示数据逼你删掉断言。

**4. 反向措辞的子串陷阱** — 文案"不产生调整记录"里**含**"调整记录"四字，断言"不出现调整记录"会误报。改为断言不出现「调整原因」字段，或断言隐藏分支 `display:none`。

**5. 切片/分段内的元素先切片再断言** — 未展开时全是假阴性。

**6. 静态 markup 里预置的假数据也是缺陷** — 条件分支在 HTML 里硬编码的演示记录（如写死的"调整原因"），即使默认隐藏也要断言「假文案已彻底移除」。

**8. 流程改动后旧断言集体变红是特性不是噪音** — 正确修法是改到新流程、保留原验证意图（往往顺带变强），而不是放宽条件凑绿。修完自问：这条断言在防什么？防的东西还在吗？

**18. `innerText` 在 jsdom 下可能返回数值** — `textContent` 始终是 string。断言统一 `String(el.textContent || el.innerText).trim()` 比较，否则强类型全等假失败。

**21. 一个套件内统一一种读值方式** — `textContent` 含全部子孙（含隐藏分支），`innerText` 在 jsdom 下可能只反映激活分支；混用会出现"同一事实两套断言一红一绿"。改断言前先独立脚本 dump 真值。

**22. 别从闭包 state 读状态，从渲染后的 DOM 读** — 闭包字段名会被重构改掉（`state.scoreRed` 改名后恒读 `undefined`）。读 `getElementById('score-red')` 并确认 `updateXxxUI()` 在每次写状态后刷新它。附：页面脚本顶层的 `const state = {}` 不挂 window，外部 `w.state.x=1` 是给 window 加影子属性——驱动用 `w.eval("flag=false; fn()")` 才在页面词法域生效。

**26. jsdom 的 `innerText` 赋值是假写入** — `el.innerText = 'X'` 不报错但 `textContent` 读到的仍是旧值；`innerHTML` 赋值却生效。后果：用 innerText 渲染的区块，jsdom 断言恒读旧值，误判"状态切换没生效"穷追 DOM 污染。**不要为过 jsdom 把页面 innerText 改成 textContent**——多状态流转直接上真浏览器（Chrome wrapper 法，见 §5.4）。

**30. 判可见性禁用 `offsetParent`** — `position:absolute` 的元素 `offsetParent` 恒为 null（jsdom 无排版引擎），拿它当隐藏判据会假红。用 `getComputedStyle(el).display`（注意坑 1 祖先穿透问题）。

**33. 布局判定用真浏览器量 DOM，别在 jsdom 里测几何** — jsdom 无排版（`offsetWidth` 全 0），布局类断言大面积假红。量真实落点：注入测量脚本把 `getBoundingClientRect` 写进 `document.title` 再 `--dump-dom` 读 title；或临时给目标元素上纯色背景截图量像素带宽。

## 交互驱动类

**9. 游离节点现取现点** — 动态渲染的内容重渲染后旧引用变 detached，对它派发 click 不冒泡到 document，全局捕获型拦截器（权限/埋点）根本不触发。症状：拦截断言假通过 + 提示断言假失败。对策：现取现点，或点击前断 `el.isConnected`。

**10. toast/提示断言每轮点击前先清空** — 否则第二条之后的"是否弹出提示"全被上一条残留文案蒙混，一条断言能盖住 28 条假通过。写 `clearToast()` 并在循环内每轮调用。

**11. CSS 属性选择器不支持 `|` 交替** — `[onclick*="foo|bar"]` 是字面子串匹配，恒为空。用 `[...d.querySelectorAll('[onclick]')].filter(el => /foo|bar/.test(el.getAttribute('onclick')))`。

**12. 选择器不要按页面名猜** — 入口函数常与目标页名不同，且入口不在你以为的那页。先 dump `[...d.querySelectorAll('[onclick]')].map(e=>e.getAttribute('onclick'))` 去重再写。

**13. 页面可能有自己专属的返回函数，与全局 `goBack()` 是两套实现** — 用全局函数测"页内返回"会假失败。必须点用户真实点到的那个可见返回按钮才算复现真实路径；"两套返回是否一致"记为 ℹ 信息，只有全局那条真实可达时才算缺陷。

**16. 加"必填校验"会连环打断下游套件，且失败点在下游不是根因** — 一条根因拖出 9 条下游失败。诊断铁律：先看**第一条**失败项的上下文找根因，不要顺着失败清单逐个改下游断言（否则把真 bug 一起放宽掉）。附带结论：加必填之前先查需求文档是否要求——文档只写"二次确认+留痕"，加原因必填就是自作主张。

**29. 演示账本必须由明细推导，不许手填** — "账本四行 vs 逐局列表"两处演示数据分别手写必然漂移（实测三处互相矛盾）。`DATA` 里只存明细数组，汇总行代码里 `reduce` 聚合——一处事实一处源头。审查这类页面先写求和断言再交付。

## 定时器与进程类

**7. 别给非敏感操作乱加权限标记** — 存在 `[data-mgr]` 类"高权限专属"标记 + 全局 click 拦截器时，把它加到查看/勾选类操作会静默误伤低权限角色。加之前先问"这个操作低权限角色该不该能做"，权限套件补正反两条断言。

**17. `setInterval` 未清理会挂住 Node 进程** — 单文件原型常内置每秒时钟。Node/jsdom 下 event loop 永不退出，直到 runner 强杀（exit 124，日志什么都不说）。原型防御：`if (typeof window !== 'undefined' && typeof process === 'undefined') { setInterval(…); }`；脚本防御：结束前显式 `dom.window.close()` / `process.exit(0)`，绝不依赖自然退出。

**20. headless Chrome 下原生 `alert`/`confirm` 永久阻塞渲染进程** — 表现为 evaluate 超时/Target closed。脚本必须 `page.on('dialog', d => d.dismiss())`；这条同时是门禁——原型里残留的原生 confirm（应替换为站内弹层）会被它暴露。

**25. 禁用原生 `confirm()`/`alert()` 作交互确认** — 除测试阻塞外，真实用户侧样式与页面脱节且可能被浏览器拦截（用户表现也是"点了没反应"）。统一站内弹层，按钮文案与业务语境一致。

**32. headless Chrome 大概率挂起不退出** — `--dump-dom`/`--screenshot` 常渲染完成但不退出吃满超时。标准姿势：stdout 重定向到文件后台跑，`sleep 15` 后 `kill -9 $!`，再读落盘文件——产物早已写完。另：独立 `--user-data-dir` 的实例不受用户正在使用的 Chrome 影响。

**31. Chrome headless 视口宽度钳制** — `--window-size=375,W` 实际渲染约 500 宽，首屏截图右侧裁切/布局挤压全是假象。规范：用 520 宽截图，再按壳边界色差扫行定位壳左右缘裁回目标宽度；几何实测可直接对 520 原图量。

## 弹层与视觉塌陷类（jsdom 必漏）

**19. 弹层"点了没反应"类缺陷 jsdom 全绿 ≠ 用户看得见** — jsdom 只断言 display 翻转，抓不住三类视觉塌陷：①弹层挂在 `display:none` 页内被折叠成 0×0；②`slide` 入场动画把 sheet 停在壳外（headless 停在 from 帧）；③`position:absolute` 弹层相对文档顶定位（滚到底触发时弹层在视口外）。修复：弹层统一挂滚动容器直下与业务页平级；定位敏感弹层禁用 slide 动画改 `bottom:0` 贴底；壳加 `transform:translateZ(0)` 成为 fixed 包含块、弹层 `position:fixed; inset:0`。验收必须真浏览器断言 `sheet rect ∈ 壳 rect`。

**24. 弹层组件必须挂载在滚动容器直下，与业务页平级** — 嵌进任何业务页内都会随该页 `display:none` 折叠成 0×0。这是结构规范不是样式微调，发现嵌错第一优先级挪位置。

**23. 多轮迭代后交付前先跑"几何体检"** — 历轮脚本注入会堆积过时的 `padding-bottom` 预留、`position:absolute` 参照错位、z-index 打架，表现为"页面底部空一大截""弹层点不到"。真浏览器量 `scrollHeight - clientHeight` 差值 >100px 即有死空白，顺藤摸瓜删过时预留。

## 断言自身质量类

**14. macOS BSD grep 不支持 BRE 的 `\|` 交替** — `grep -c "a\|b" f` 按字面量匹配恒返回 0，"废弃命名已清零"类断言恰好写成"含关键词数===0" → **静默假绿**，比假红危险得多。用 `grep -E` 或拆多 pattern。⚠️ `grep -c "✅"` 计数同理不可靠——消息文本出现该符号会多算，断言数必须读套件自报总数。

**15. 同一文件不要并发发起多个编辑** — 各自基于同一快照写入互相覆盖，表现为"工具报成功但内容没变"。多行改动用单个脚本批量 replace，每处断言命中数===1，落盘后独立复核。

**27. 一次性替换多个同 class 生成块禁止按索引连替** — 替换第 1 块后重新扫描，第 2 次的 idx=0 会命中刚插入的新块，把刚写的内容吞掉。按唯一内容锚点重新定位，或先收集全部块的起止坐标再从后往前替换。

**28. 多轮修正后交付前，先跑用户最后一条纠正项的专项断言** — 返工重灾区是"修正 A 时把 B 改坏/又改回来"。每轮修正前记录用户已拍板的硬红线清单，对每条红线加存在性/不存在性断言，交付前全套跑一遍。用户纠正同一事项 ≥2 次必须写入需求的禁止回归条目，不能只靠对话记忆。

**极性与匹配域（禁词断言的两类假红）**：
- **极性反转**：把"不得含 X"写成 `bad() = 全部干净时才 true`，循环里 `!bad()` 取反 → 页面越干净越报红。禁词函数必须返回"命中=true"，统一 `!bad()` 判通过。
- **匹配域污染**：正则 `/Frame/` 会命中代码命名而非用户文案。禁词扫**渲染后的 textContent**，术语类带上下文整词匹配，禁扫 CSS 类名与 JS 源码。
- 多层脚本生成后正则极易双重转义（`/Frame \\d/` 匹配字面反斜杠）——先在独立最小脚本验证极性再合入。
- 断言红了先**独立最小复现**（只建 DOM 只跑该断言）再改：独立过套件挂 → 查套件上下文污染；独立也挂 → 查断言本身。
- **打点值与断言结果矛盾时，第一优先级逐句走一遍函数极性**，再查环境。实测教训：函数体打印全部干净却返回 true——把"全部干净才 true"当成了 bad() 语义。给套件加打点要连判定循环一起改，否则看不出 ok 的真实输入。调试脚本产出后先 `ls` 确认真的落盘了，否则 node 跑的还是旧文件。

## 真浏览器补充类

**5.1 jsdom 查不出"视觉塌陷"：动画/3D/transform 类必须真浏览器复核** — 实测事故：翻牌卡正面被 `backface-visibility:hidden` 隐藏（入场动画 keyframe 的 transform 覆盖了元素自身的 `rotateY(180deg)`），jsdom 40 项全过，真机整屏空白。要点：关键帧里把静态旋转烘进去（`@keyframes popInFlip{0%{transform:rotateY(180deg) scale(.88)}…}`）；真浏览器用 `new DOMMatrix(getComputedStyle(el).transform).m11 < -0.9` 证明正面朝前——❌ 别用正则解析 transform（`matrix3d` 里的 `3` 会被当成第一个数，实测假 PASS）；截图给足虚拟时间 `--virtual-time-budget=2200`，漏了会把动画拍在中途帧误判布局崩了。

**5.4 多状态流转的 Chrome wrapper 法** — jsdom 的 innerText 赋值不生效（坑 26）且闭包 state 外部改不进（坑 22 附）——"三态切换""段位流转"类验证在 jsdom 里是死路。无需 Playwright：写 wrapper HTML 内嵌 `<iframe src="file://原型">`，`iframe.onload` 后驱动 `contentWindow`，各状态关键文本写进 wrapper 自己的 `<pre id="out">`，一条命令出结果：`chrome --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget=5000 --dump-dom file://wrapper.html | grep -E "BEGIN|CASE|END"`。file:// 下同源 iframe 可互访必须带 flag；`--virtual-time-budget` 会快进 `setTimeout` 状态机。适用判断：逻辑分支多/渲染走 innerText/依赖 setTimeout → wrapper 法；纯 DOM 存在性断言 → jsdom 更快。

**对齐/居中类判断禁用 vision 当裁判** — 实测同一张等宽网格图，vision 连续两次报"整体右偏一列"，量坐标后所有中心偏差 0px。截屏缩放后的位置估计会系统性偏移。凡"是否对齐/居中/列对应"一律 `getBoundingClientRect()` 对比中心坐标出结论（阈值 1px）；vision 只看"有没有塌陷、重叠、空白"。

**响应式覆盖写在基础规则之前＝被静默吞掉** — `@media (max-width:820px){…}` 排在后文同权重规则之前会被覆盖，表现是"明明写了移动端规则窄屏还是溢出"。修法：提高选择器优先级或把媒体查询移到基础规则之后，不要用 `!important` 掩盖顺序问题。

**窄视口溢出只测桌面永远查不出** — 表格首列 `white-space:nowrap` 把最小宽度撑到 470px，1180/860/700 全 0 溢出、420 就炸（375 必炸）。门禁：真浏览器在 1180/860/700/420/375 五档量 `scrollWidth > clientWidth` 与越界元素数。宽表在窄屏必须转卡片——改的是结构不是宽度，光把列宽设 `auto` 没用（实测 6 列表 375px 下溢出 51 处元素，改卡片后归零）。

**grid/flex 子项默认 `min-width:auto`** — 长中文串与无空格英文串撑不住直接溢出父容器。给子项补 `min-width:0`（或 `overflow-wrap:anywhere`），不要用 `overflow:hidden` 掩盖（静默截断内容，变成另一种缺陷）。

**引用了哪个源，就要以那个源为准** — 交付物自称"数据取自 X"时逐字段回源校验；实测页面标"取自线上真值"、子项却混用几天前的本地导出，两源日期状态已打架。混源必须在页面上注明。

---

## 元方法论（比任何单条坑都值钱）

1. **断言必须等价于用户真实路径**：点真实 DOM（`el.click()`），不调内部函数（`w.someFn()`）。
2. **先跑存在性再跑强制性**：元素存在 ≠ 门禁生效，专测"是否真的被拦停/真的被阻断"。
3. **场景化脚本优于逐控件脚本**：把用户原话拆成场景逐条复刻成端到端断言；用户抱怨过的点单独建复刻回归脚本，永久防复发。
4. **多套独立脚本各聚焦一个维度**，比一个巨型脚本更能定位回归。
5. **数字必须实测**：文档里写"回归 N/N"前用插桩统计真实执行条数，不许估算；三种数法不一致说明脚本结构与假设不符。
6. **只查不改**：发现缺陷输出"文件:行 + 现象 + 复现步骤"交回上一环局部修，禁止质检环节整页推倒。
