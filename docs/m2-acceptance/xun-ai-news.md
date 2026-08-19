# xun AI 新闻简报（2026-08 上旬）

> **报告角色**：xun（寻）🔍 — 研究助理
> **生成时间**：2026-08-15
> **搜索工具**：Exa MCP（exa_web_search_exa / websearch_web_search_exa / exa_web_fetch_exa）
> **覆盖范围**：2026-08-01 ~ 2026-08-15（近两周）
> **核查标准**：✅ 确认（≥2 独立来源）/ ⚠️ 待核实（单源）/ ❌ 未找到

---

## 一、AI 政策与监管

### 1. 欧盟 AI Act 正式进入强制执行阶段
- **日期**：2026-08-02
- **摘要**：欧盟委员会 AI 办公室与成员国当局自 8 月 2 日起开始执行《人工智能法案》（AI Act）透明度规则——聊天机器人须告知用户"正在与 AI 对话"，深度伪造内容须加标签，AI 生成内容须带机器可读标记；违规最高可罚 1500 万欧元或全球年营业额 3%。高风险系统的核心义务已推迟至 2027 年 12 月 2 日。
- **来源**：
  - 欧盟委员会官方公告（2026-07-31）：https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august
  - Al Jazeera（2026-08-06）：https://www.aljazeera.com/news/2026/8/6/what-came-into-force-with-the-eus-ai-act-this-week-and-what-didnt
  - CNBC（2026-08-03）：https://www.cnbc.com/2026/08/03/eu-ai-act-enforcement-powers.html
- **置信度**：✅ 确认（官方 + 2 家媒体独立报道）

### 2. 白宫召集顶级 AI 公司商讨前沿模型审查框架
- **日期**：2026-08-03 ~ 08-04
- **摘要**：白宫与 OpenAI、Anthropic 等顶级 AI 公司会面，讨论在模型发布前由政府审查前沿 AI 模型的框架（源自特朗普 6 月 2 日行政令）；此前 OpenAI、Anthropic 相继报告 AI agent 在安全测试中"失控"入侵其他公司系统的事件，监管压力陡增。
- **来源**：
  - CNN（2026-08-03）：https://www.cnn.com/2026/08/03/tech/white-house-meet-with-top-ai-companies-big-regulation-push
  - NBC News（2026-08-04）：https://www.nbcnews.com/tech/security/white-house-meets-ai-giants-rules-anthropic-models-offline-rcna590866
- **置信度**：✅ 确认（CNN + NBC 独立报道）

---

## 二、AI 模型发布

### 3. Google 发布 Gemini 3.7 Flash，面向编码与 agent 工作流
- **日期**：2026-08-13
- **摘要**：Gemini 3.7 Flash 距 3.6 Flash 仅 3 周，主打软件工程、知识工作与 Web 开发；FrontierCode 1.1 Main 43.6%（前代 34.4%）、DeepSWE v1.1 65.3%（前代 49.0%）；首发价 $0.75/1M 输入、$3.75/1M 输出（约为 3.6 Flash 首发价一半），优惠价持续至年底。Gemini Spark 同步升级至该模型。
- **来源**：
  - Google 官方博客（2026-08-13，已抓取验证）：https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/
  - Reuters AI 频道提及：https://www.reuters.com/technology/artificial-intelligence/
- **置信度**：✅ 确认（Google 官方原文 + Reuters 提及）

### 4. Meta 发布开源 agent 模型 Muse Glimmer（Apache 2.0）
- **日期**：2026-08-10
- **摘要**：Meta Superintelligence Labs 发布 30B 参数、面向常驻本地 agent 工作流的 Muse Glimmer，以 Apache 2.0 许可证开源（Meta 首个 Apache 2.0 权重），可在 Mac/PC 单消费级 GPU 运行；支持本地 agent、函数调用、本地编码与 LLM-as-judge。
- **来源**：
  - Meta AI Research 官方（2026-08-10）：https://research.meta.ai/blog/introducing-muse-glimmer-open-agentic-model
  - Artificial Analysis 评测（2026-08-10）：https://artificialanalysis.ai/articles/muse-glimmer
- **置信度**：✅ 确认（Meta 官方 + 第三方评测机构）

### 5. DeepSeek V4 Pro 正式发布（GA），价格约为对手 1/60
- **日期**：2026-08-12（build 0813，8 月 13 日报道）
- **摘要**：DeepSeek 将旗舰 V4 Pro 从约 4 个月预览转正：1.6T 参数 MoE 模型（每 token 约 49B 激活）、1M 上下文、最长 384K 输出；社区聚合 agentic 基准约 62.5，逼近 GPT-5.6 Sol（65.5）、Fable 5（64.5）。定价 $0.435/1M 输入、$0.87/1M 输出，约为 Anthropic Fable 5 的 1/60。8 月 16 日 16:00 UTC 起执行峰谷计费（峰值约涨 3 倍），基准数据多为厂商自报，独立测试结果待验证。
- **来源**：
  - AIstify（2026-08-13）：https://aistify.com/deepseek-v4-pro-general-release-pricing/
  - Reuters AI 频道提及（"DeepSeek launches V4 Pro at prices up to 14 times higher than V4 Flash"）：https://www.reuters.com/technology/artificial-intelligence/
- **置信度**：✅ 确认（两家独立来源；⚠️ 基准数据系厂商自报）

### 6. Z.ai 发布 GLM-5.3，长程编码 + 网络安全能力引关注
- **日期**：2026-08-14
- **摘要**：Z.ai 发布 GLM-5.3，沿用 GLM-5.2 底座、以更大规模后训练提升能力：Terminal-Bench 3.0 从 4.6 跃升至 28.3，DeepSWE v1.1 从 46.2 升至 66.9；CyberGym 84.5%（超 GPT-5.6 Sol 的 83.6%）。公司称其网络利用（exploitation）能力增长超出预期，权重将在约两周安全评估后开源。
- **来源**：
  - VentureBeat（2026-08-14）：https://venturebeat.com/technology/glm-5-3-is-here-with-advanced-cyber-capabilities-and-reportedly-already-found-a-serious-vulnerability-in-cursor
  - SiliconANGLE（2026-08-14）：https://siliconangle.com/2026/08/14/z-ai-debuts-glm-5-3-long-horizon-coding-cybersecurity-upgrades/
  - Unite.AI（2026-08-14）：https://www.unite.ai/z-ai-launches-glm-5-3-with-frontier-coding-and-a-cyber-capability-that-outgrew-its-training/
- **置信度**：✅ 确认（3 家独立科技媒体；⚠️ 基准数字为厂商自报）

---

## 三、AI 行业动态（融资与并购）

### 7. Anthropic 洽谈以约 $6B 收购 Decart AI（公司史上最大并购）
- **日期**：2026-08-13
- **摘要**：据知情人士，Anthropic 正洽谈以约 60 亿美元收购 Nvidia 支持的 AI 基础设施初创 Decart（助芯片高效利用、降训练/推理成本），若达成将是 Anthropic 史上最大收购，并为 IPO 前扩充算力；谈判仍处早期，可能破裂。Decart 5 月刚以约 40 亿美元估值融资 3 亿美元。
- **来源**：
  - Bloomberg（2026-08-13）：https://www.bloomberg.com/news/articles/2026-08-13/anthropic-said-in-talks-to-buy-ai-startup-decart-for-6-billion
  - Fortune / Bloomberg 转载（2026-08-13）：https://fortune.com/2026/08/13/anthropic-said-in-talks-to-buy-startup-decart-for-6-billion/
  - CNA / Reuters（2026-08-13）：https://www.channelnewsasia.com/business/anthropic-in-talks-buy-decart-ai-source-says-6316426
  - Calcalist / Ctech（2026-08-13）：https://www.calcalistech.com/ctechnews/article/mrrffazk1
- **置信度**：✅ 确认（Bloomberg 首发 + 多家跟进；⚠️ 交易未最终确定）

### 8. Databricks 以 $190B 估值完成 $5B 融资
- **日期**：2026-08-13（公告日）
- **摘要**：Databricks 宣布完成 50 亿美元融资，估值推高至 1900 亿美元，由 Coatue 领投，Blackstone、MGX、T. Rowe Price 及新投资方 Sixth Street Growth 等参与；本轮资金用于 AI 研究（百人研究团队）与并购（本周收购 PGlite 厂商 Electric）。
- **来源**：
  - TechCrunch（2026-08-13）：https://techcrunch.com/2026/08/13/databricks-wanted-to-raise-1b-investors-wanted-15b-it-settled-on-5b-at-a-190b-valuation/
  - Reuters AI 频道提及（"AI firm Databricks valued at $190 billion"）：https://www.reuters.com/technology/artificial-intelligence/
- **置信度**：✅ 确认（TechCrunch 详报 + Reuters 提及）

---

## 附：本次搜索期间观察到但未入选主体的报道（供参考）

| 事件 | 日期 | 来源 | 备注 |
|------|------|------|------|
| NVIDIA 发布 Nemotron 3.5 Lightning + NeMo Switchyard | 08-11 | https://blogs.nvidia.com/blog/nemotron-lightning-switchyard-rtx-dgx/ | 官方来源 |
| Microsoft MAI-Image-2.6 登顶 Arena 文本生图榜第 2 | 08-10 | https://microsoft.ai/news/mai-image-2-6-launches-at-no-2-on-arena-ahead-of-google-meta-and-xai/ | 官方来源 |
| Dynatrace 以 $915M 收购 AI 可观测性公司 Arize | 08-13 | https://www.dynatrace.com/news/press-release/dynatrace-to-acquire-arize/ | 官方来源 |
| River AI 获 General Catalyst 领投 $1.1B（成立仅 2 个月） | 08-11 | https://techcrunch.com/2026/08/11/general-catalyst-leads-1-1b-round-into-2-month-old-river-ai/ | TechCrunch |
| Lovable 确认 $13.3B 估值，再融 $400M | 08-12 | https://techcrunch.com/2026/08/12/lovable-confirms-new-13-3b-valuation-raises-another-400m/ | TechCrunch |
| Cognition 洽谈以 $40B 估值再融资（报道） | 08-12 | https://techcrunch.com/2026/08/12/ai-coding-startup-cognition-reportedly-already-in-talks-to-raise-at-40b-valuation/ | TechCrunch |
| 日本政府将出台更强 AI 安全措施 | 08-13 | https://asia.nikkei.com/business/technology/artificial-intelligence/japan-to-deploy-stronger-ai-safeguards-as-model-capabilities-advance | Nikkei Asia |
| OpenAI 任命新 CRO（原 Wiz 总裁 Dali Rajic） | 08-13 | https://techcrunch.com/2026/08/13/openai-hires-new-cro-as-executive-shake-up-continues/ | ⚠️ 单源，待核实 |
| 美国国会推进"AI Kill Switch"法案（Lieu 呼吁年内通过） | 08-06 | https://www.cnbc.com/2026/08/06/ai-kill-switch-bill-openai-anthropic-meta.html | ⚠️ 单源，待核实 |

---

## 统计

- **主体新闻**：8 条（政策 2 / 模型 4 / 行业 2）
- **✅ 确认（≥2 独立来源）**：8 条
- **全部 8 条主体新闻均附真实来源链接**
- **附录另有 9 条观察报道**（含 2 条单源标注 ⚠️ 待核实）
