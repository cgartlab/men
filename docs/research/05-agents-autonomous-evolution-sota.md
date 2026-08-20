# AI Agent 团队如何自主学习与进化 — State-of-the-Art 调研报告

**编制**：xun（寻）· 研究助理  
**日期**：2026-08-21  
**版本**：v1.0  
**适用范围**：面向 6+1 团队（men/si/ji/chi/yi/xun）的自主进化能力调研  

---

> **声明**：本报告所有结论均来自可追溯的一手来源（arXiv / ACL / NeurIPS / AAAI / ICML 论文、GitHub 开源项目、机构博客）。未找到权威来源的方向已明确标注。本报告的"对我们的启示"基于现有研究推导的可执行建议，不代表已被工业界验证。

---

## 维度 1 — 多 Agent 协同学习

**核心机制**：团队层面的涌现（Emergence）—— 各 agent 通过结构化交互、知识共享和互惠行为，使团队整体能力超越个体简单加和。

### 关键来源

- **[MASC — Multi-Agent Socialized Collaboration]** — https://proceedings.mlr.press/v235/yao24d.html (ICML 2024) — 首次将"社会化学习"（Socialized Learning）引入多 agent 系统，提出"集体协作（Collective Collaboration）"和"互惠利他（Reciprocal Altruism）"两个模块。实验证明 agent 可以在学到新知识的同时保持原有专长不退化，关键洞察是"互惠机制"能让 agent 在信息共享中各取所需，避免知识坍塌。

- **[MAEL — Multi-Agent Cross-Task Experiential Learning]** — https://arxiv.org/abs/2505.23187 (2025) — 核心机制：每个 agent 维护自己的"经验池（Experience Pool）"，在推理时按奖励加权的相似度检索历史经验作为 few-shot 示例。实验对比了"完全无经验"vs"任务级检索"vs"步级检索"，证明步级检索最优，收敛更快、解的质量更高。

- **[MOSAIC — Modular Sharing and Composition in Collective Learning]** — https://arxiv.org/abs/2506.05577 (2025) — 提出 agent 基于"任务相似度（Wasserstein task embeddings）"从同伴中选择性地复用 policy，而非全局共享。观测到"隐式自组织（implicit self-organization）"现象：解决简单任务的 agent 会加速复杂任务的 agent 的学习，自然形成课程结构。

- **[Agent Drift 研究]** — https://arxiv.org/abs/2601.04170v1 (2026) — 提出 Agent Stability Index (ASI)，量化多 agent 系统中的 3 种漂移：语义漂移、协调漂移、行为漂移。发现 200 次交互后任务成功率从 87.3% 降至 50.6%，揭示了协同系统的脆弱性。

### 对我们的启示

- **建议 1（mael 模式）**：为每个 agent（men/si/ji/chi/yi/xun）建立独立的"经验池"，记录 (输入, 操作, 奖励) 三元组。团队任务中 agent 在每一步检索相似经验作为参考。
- **建议 2（互惠机制）**：men 作为 orchestrator 应主动收集各 agent 的成功/失败经验，定期"广播"给团队；不是 men 单向分配，而是各 agent 互相从对方经验池中学习。
- **建议 3（监控 ASI）**：对 ji（代码 agent）和 si（写作 agent）这类高频任务 agent，引入简易的"漂移检测"，当连续 N 次任务质量下降时触发"重置+重新锚定"。

---

## 维度 2 — 自主自我改进机制

**核心机制**：agent 能够读取、修改自身的代码/逻辑，在基准测试驱动下实现"递归自我改进"，无需人类手工修改元组件。

### 关键来源

- **[Darwin Gödel Machine (DGM)]** — https://arxiv.org/abs/2505.22954 (Zhang et al., 2025) — 核心机制：维护一个"archive"，从 archive 中选出 parent agent，让它分析自身基准评测日志并实现改进，新版本再次评测后回入 archive。SWE-bench 从 20% → 50%，Polyglot 从 14.2% → 30.7%。关键设计：开放探索（open-ended exploration）保留所有"stepping stones"，不只保留最优解。

- **[SICA — Self-Improving Coding Agent]** — https://arxiv.org/abs/2504.15228 (2025) — 首个完全自我改进的通用编码 agent（无 meta-agent / target-agent 区分）。从 SWE-Bench Verified 17% → 53%。关键发现：agent 自行发明了 diff 编辑、AST 符号定位等工具，并实现了 KV cache 优化降低调用成本。

- **[Gödel Agent]** — https://aclanthology.org/2025.acl-long.1354/ (ACL 2025) — 用 monkey patching 实现在运行时读取/修改自身代码，实现完全自指的递归改进。实验跨越游戏（24点）、问答（DROP/MMLU/GPQA）等多个领域，均超过手动设计的 agent。

- **[HyperAgents / DGM-H]** — https://ai.meta.com/research/publications/hyperagents/ (Meta, 2025) — DGM 的进化版：将"改进程序本身"也变成可编辑的，实现"元认知自我修改"。跨代码、论文评审、机器人奖励设计、数学解题等 4 个领域均取得持续改进，且元改进可跨领域迁移。

### 对我们的启示

- **建议 1（ji agent 先行）**：ji（工程师 agent）是 6+1 团队中最适合实现 DGM/SICA 的 agent。可以让 ji 在 CI 阶段对自己的工具脚本（如 `scripts/verify.mjs`）做 self-review，改进后跑回归测试验证。
- **建议 2（archive 机制）**：不要只保留"当前版本"的 agent 定义，维护一个 `.opencode/agent/archive/` 目录，记录历史版本的改进轨迹。
- **建议 3（沙箱+人工监督）**：所有自我修改必须在沙箱中完成，且必须有人类（men 或用户）确认后才 merge 到主分支。这是 DGM 论文明确的安全前提。

---

## 维度 3 — 错误驱动学习

**核心机制**：agent 从失败轨迹中提取结构化反思，通过"反思-修正-强化"循环持续改进。

### 关键来源

- **[RISE — Recursive Introspection]** — https://proceedings.neurips.cc/paper_files/paper/2024/file/639d992f819c2b40387d4d5170b8ffd7-Paper-Conference.pdf (NeurIPS 2024) — 核心发现：即使是最强的商用 LLM（GPT-3.5 自己 5 轮只提升 4.6%），也不具备"内蕴自我改进"能力。通过 iteratively fine-tune 将"如何改进"教给模型，LLaMA2-7B 在 5 轮内提升 17.7%。关键：fine-tune 数据必须来自"模型自己会犯的错"，不能用别家模型的数据。

- **[SAMULE — Self-Learning Agents with Multi-Level Reflection]** — https://aclanthology.org/2025.emnlp-main.839/ (EMNLP 2025) — 提出三级反思：Single-Trajectory（微观级错误修正）、Intra-Task（同一任务多次尝试的错误分类）、Inter-Task（跨任务同类错误的可迁移洞察）。在 TravelPlanner / NATURAL PLAN / Tau-bench 上显著优于反思类基线。

- **[Agent-R — Reflect via Iterative Self-Training]** — https://arxiv.org/abs/2501.11425 (2025) — 用 MCTS 构建训练样本：自动识别失败轨迹中"第一个错误步"，用正确轨迹的相邻分支拼接成修正样本。关键创新：在错误发生的时刻做修正，而非等到 rollout 结束。3 个交互环境均优于 baseline +5.59%。

- **[AgentDiagnose]** — https://aclanthology.org/2025.emnlp-demos.15/ (EMNLP 2025) — 开源诊断工具，量化 5 个 agent 能力维度（回溯探索、任务分解、观测阅读、自我验证、目标质量），与人工标注 Pearson 相关 0.57（任务分解维度达 0.78）。用它在 NNetNav-Live 上过滤 top 6k 轨迹训练 Llama-3.1-8B，WebArena 成功率提升 0.98。

### 对我们的启示

- **建议 1（chi-judge 强化）**：chi（独立评审 agent）应执行 SAMULE 的三级反思结构——对每个失败任务输出"微观错误（哪里错了）→ 同类错误分类 → 跨任务模式"。
- **建议 2（错误池）**：在 `.opencode/skills/` 层面建立"错误案例库（error case library）"，每个 skill 目录增加 `errors/` 子目录，记录该技能的历史失败案例和修正方法。
- **建议 3（即时修正）**：借鉴 Agent-R，当 xun 在搜索中失败（如 SearXNG 超时），应立刻记录"错误步+修正动作"，而不是等待任务结束再写复盘。

---

## 维度 4 — 技能获取与进化

**核心机制**：agent 自主发现新技能（而非由人类手工定义），并通过试错、调试、蒸馏形成可复用的 skill library。

### 关键来源

- **[SkillWeaver]** — https://osu-nlp-group.github.io/SkillWeaver/ (Zheng et al., 2025) — agent 将每次成功的网站操作抽象为 Python API 函数，后续任务直接复用这些 API。WebArena 提升 31.8%，真实网站提升 39.8%。更强 agent 生成的 API 可转移给更弱 agent，提升达 54.3%。关键：**技能即代码（Skill-as-Code）**，agent 可以 debug 自己生成的 API。

- **[PAE — Proposer-Agent-Evaluator]** — https://proceedings.mlr.press/v267/zhou25ah.html (ICML 2025) — 三组件架构：Task Proposer（基于网站内容生成任务指令）、Agent（在真实环境执行）、VLM Evaluator（自主评估成功/失败）。作为 RL 奖励信号。零样本泛化提升约 50%。

- **[Agentic Skill Discovery (ASD)]** — https://arxiv.org/abs/2405.15019 (2024) — 完全由 LLM 驱动的机器人技能发现：LLM 基于场景描述生成任务 → RL 训练 → 第二 VLM 独立评估可信度（防止假阳性污染 skill library）。从 0 技能起步，逐步构建库。

- **[SAGE]** — https://proceedings.neurips.cc/paper_files/paper/2025/file/2852977ade3d2a70eceb78cdef91f4b3-Paper-Conference.pdf (NeurIPS 2025) — 三层探索：预探索（构建网站语义图）→ 顶层探索（自适应任务生成，从易到难）→ 底层探索（MCTS + 步进学习）。WebArena 上超越所有开源基线 26%，超过商用模型 11%。

### 对我们的启示

- **建议 1（skill-as-code 模式）**：把 `.opencode/skills/*/SKILL.md` 升级为可执行的"技能定义"，ji agent 可以在 CI 中运行 SkillWeaver 式的测试来验证 skill 的可用性。
- **建议 2（自主技能发现）**：借鉴 PAE 架构，让 ji 或 si 在遇到无法用现有 skill 完成的任务时，自动生成新 skill 草案，通过 chi-judge 审核后入库。
- **建议 3（技能调试）**：当 xun-search 频繁遇到某类搜索失败（如 SearXNG 超时），ji 可以自动为该 skill 编写一个"降级策略"（jina 代理兜底），并经过 chi 审核后合并。

---

## 维度 5 — 元学习（Meta-Learning）

**核心机制**：agent 不仅学"如何做事"，还学"如何学得更快"—— 通过 few-shot 适应和元知识迁移，快速应对新任务/新领域。

### 关键来源

- **[AdaptAgent]** — https://aclanthology.org/2025.acl-long.1008/ (ACL 2025) — 用 1-2 个人类演示（human demonstration）即可让多模态 web agent 快速适应新网站。在 Mind2Web / VisualWebArena 上相对提升 21.03%–65.75%。多模态演示优于纯文本。

- **[AdaptFlow — Adaptive Workflow Optimization via Meta-Learning]** — https://aclanthology.org/2025.findings-emnlp.175/ (EMNLP 2025 Findings) — 用 MAML 灵感的双层优化：内环做任务特定适配（LLM 生成反馈），外环将改进固化为可泛化的初始化。在 QA / 代码生成 / 数学推理上均达 SOTA。

- **[POEM — Meta-RL with Preference-Order-Preserving Task Embedding]** — https://proceedings.mlr.press/v267/xu25ao.html (ICML 2025) — 用人类偏好查询（preference query）代替奖励信号实现 few-shot 元适应，任务嵌入保持偏好序。有理论收敛保证。

- **[Learn-by-interact]** — https://arxiv.org/abs/2501.10893 (2025) — 数据中心的自适应框架：agent 基于文档 self-instruct 生成任务 → 与环境交互生成轨迹 → 用"backward construction"从轨迹反推指令。在 SWE-bench / WebArena / OSWorld / Spider2-V 上改进 12.2%–19.5%。

### 对我们的启示

- **建议 1（少样本适应）**：当需要引入一个全新 agent（如未来增加"财务 agent"），不必从头训练，而是给 AdaptFlow 式的"2-3 个典型任务演示"即可快速适应。
- **建议 2（元流程固化）**：`.opencode/agent/` 下的 agent 定义本身应支持"元更新"—— men 在编排中收集到"哪种模式对哪种任务有效"的经验后，可以将模式固化进 agent prompt 的初始化。
- **建议 3（数据生成闭环）**：借鉴 Learn-by-interact，让 xun 在遇到新数据源时先通过"self-instruct + 交互 + backward construction"自动生成该数据源的适配示例。

---

## 维度 6 — 行为回归检测与漂移管理

**核心机制**：持续监控 agent 行为偏离基线的程度，在漂移发生早期检测到并触发纠正机制，避免"沉默退化"。

### 关键来源

- **[AMDM — Adaptive Multi-Dimensional Monitoring]** — https://github.com/jlov7/AMDM (2025) — 端到端 agent 监控系统。核心算法：逐轴 EWMA + 联合 Mahalanobis 距离异常检测。检测延迟从 12.3s 降至 5.6s，误报率从 4.5% 降至 0.9%。监测 5 轴：能力/鲁棒性/安全/人类因素/经济成本。

- **[Evaluating Goal Drift]** — https://ojs.aaai.org/index.php/AIES/article/view/36541 (AIES 2025) — 发现即使是最强商用模型（Claude 3.5 Sonnet scaffolded），在 100,000+ tokens 的自主运行中仍会出现目标漂移，且漂移与"随着 context 增长的模式匹配倾向增强"正相关。

- **[EvalView]** — https://github.com/hidai25/eval-view (2025) — "AI Agent 的 snapshot testing"。思路：记录 agent 当前的行为轨迹（工具调用名称、参数、顺序）作为基线，CI 中 diff 检测任何变化。类似 Jest snapshot，但针对多轮工具调用 agent。支持 LangGraph / CrewAI / OpenAI / Anthropic / MCP。

- **[Agent Drift（多维框架）]** — https://arxiv.org/abs/2601.04170v1 (2026) — 提出 12 维 Agent Stability Index (ASI)。发现：73 次交互后出现可检测漂移（ASI < 0.85），300-400 次后加速恶化。三种缓解策略：Episodic Memory Consolidation（51.9% 降漂）、Drift-Aware Routing（63.0%）、Adaptive Behavioral Anchoring（70.4%）。三者结合降漂 81.5%。

### 对我们的启示

- **建议 1（EvalView 模式先行）**：最容易落地。为每个 agent 维护一个 `baseline.jsonl`，记录"典型任务的完整轨迹"。任何 agent 定义/prompt 变更后，自动 diff 检测行为变化。
- **建议 2（ASI 简化版）**：对高频 agent（ji/xun），建立 5 个核心指标：任务成功率、token 效率、工具调用稳定性、失败类型分布、人工干预率。设置 EWMA 阈值，连续 N 个窗口低于阈值触发"行为锚定重置"。
- **建议 3（目标漂移防御）**：men 作为 orchestrator 在长任务（>50 轮）中定期"重新宣读任务目标"，这是最简形式的 Adaptive Behavioral Anchoring。

---

## 维度 7 — 长期记忆巩固与知识压缩

**核心机制**：从海量执行历史中提取最有价值的经验，以压缩、结构化形式存储，避免"记忆膨胀"和"错误传播"。

### 关键来源

- **[MEM1]** — https://arxiv.org/abs/2506.15841 (MIT, 2025) — 端到端 RL 框架，让 agent 用恒定大小的内部状态维护记忆。核心洞察："推理（reasoning）本身就是一种工作记忆"—— agent 的推理过程同时完成记忆巩固。16 目标 multi-hop QA 上，MEM1-7B 性能超 Qwen2.5-14B 3.5×，内存占用减少 3.7×。

- **[Nemori — Adaptive Memory Distillation]** — https://arxiv.org/abs/2508.03341 (2025) — 核心洞察："预测误差即记忆"—— 基于 Predictive Coding Theory，只有当经验中包含了"现有知识无法预测"的内容时才值得保留。两级：Episodic Memory Integration → Semantic Knowledge Distillation。与 A-MEM / MemoryOS 集成，存储减少 45-64% 同时性能 ±4%。

- **[Contextual Experience Replay (CER)]** — https://aclanthology.org/2025.acl-long.694/ (ACL 2025) — 训练无关框架：累积/合成历史经验为动态记忆缓冲，推理时检索增强。VisualWebArena 达 31.9% SOTA，WebArena 达 36.7%（相对 GPT-4o baseline 提升 51.0%）。

- **[Experience-Following Behavior 研究]** — https://arxiv.org/abs/2505.16067 (2025) — 重要发现：agent 表现出"experience-following 属性"—— 当检索到的历史任务与当前任务高度相似时，输出也高度相似。这导致两大问题：**错误传播**（错误记忆被复制放大）和**错位回放**（不相关的历史干扰当前任务）。解决方案：选择性添加（Selective Addition）+ 组合删除（Combined Deletion），平均性能提升 10%。

### 对我们的启示

- **建议 1（Selective Addition 强制）**：任何执行记录写入 xun 的经验池之前，必须经过 chi-judge 的质量审核。未经审核的轨迹不得入库，这是防止"错误传播"的根本手段。
- **建议 2（定期 consolidation）**：借鉴 Drift-Aware Routing 的"Episodic Memory Consolidation"，每 50 次交互后由 si 对经验池做一次"摘要压缩"，删除冗余、合并重复、提炼可迁移原则。
- **建议 3（预测误差过滤）**：xun 的"知识库检索"应增加"预测误差"过滤——如果某条历史经验是当前检索结果的"可预测"部分（即已有其他知识覆盖），则丢弃，只保留"新信息"。

---

## 维度 8 — 自动评估与基准

**核心机制**：用自动化方法持续衡量 agent 团队的进步/退化，但必须注意现有 benchmark 普遍存在严重漏洞。

### 关键来源

- **[Agentic Benchmark Checklist (ABC)]** — https://proceedings.neurips.cc/paper_files/paper/2025/file/f316275b44ee2de533102913828a8107-Paper-Datasets_and_Benchmarks_Track.pdf (NeurIPS 2025 D&B) — 系统性发现 17 个主流 agent benchmark 的严重缺陷：SWE-bench-Verified 测试用例不足导致 24% 的 top-50 排名错误；τ-bench 把空回复判为成功（38% 假阳性）；WebArena 的 LLM-as-a-Judge 未经验证导致 1.4-5.2% 高估。应用 ABC checklist 后 CVE-Bench 高估降低 33%。

- **[BenchJack / "How We Broke Top AI Agent Benchmarks"]** — https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/ (UC Berkeley, 2025) — 构建了"exploit agent"系统性攻破 8 大 benchmark：SWE-bench 100%（pytest hook 注入）、WebArena ~100%（配置泄漏 + DOM 注入）、GAIA ~98%（公开答案）、Terminal-Bench 100%（二进制 wrapper 植入）。结论：**如果评估代码本身可以被优化绕过，排行榜反映的是噪声而非能力。**

- **[Agent-as-a-Judge]** — https://proceedings.mlr.press/v267/zhuge25a.html (ICML 2025) — 用 agent 评估 agent，而非仅用 LLM-as-a-Judge。提出 DevAI benchmark（55 个真实 AI 代码任务 + 365 个层级标注要求）。证明 Agent-as-a-Judge 大幅优于 LLM-as-a-Judge，与人类评估同等可靠。

- **[SWE-bench-Live]** — https://github.com/Microsoft/SWE-bench-Live (NeurIPS 2025 D&B) — 首个自动更新、多语言、多 OS 的 SWE benchmark。每月新增 50 个经人工验证的 issue，保持"live"状态以避免 benchmark overfitting。

### 对我们的启示

- **建议 1（自测即攻防）**：我们自己的验证脚本（`scripts/verify.mjs` / `gate.mjs`）也应接受"exploit agent"攻击——如果 ji 能找到绕过 verify 的方法，说明验证有漏洞。这是 BenchJack 的核心思想，成本极低但收益极高。
- **建议 2（ABC 自检）**：在引入任何新 benchmark（如 GAIA / WebArena 用于评测 xun）前，先跑一遍 ABC checklist，确认评估方法本身没有明显缺陷。
- **建议 3（动态基线）**：不依赖静态 benchmark 分数。借鉴 SWE-bench-Live 的"月度更新"思路，每月为团队引入 3-5 个新任务作为"活基准"，防止过拟合。

---

## 综合对比表

| 维度 | 核心机制 | 自动化程度 | 主要风险 | 我们实现难度 |
|------|---------|-----------|---------|------------|
| 1. 多 agent 协同学习 | 经验池共享 + 互惠机制 | 中（需经验采集+检索管线） | 错误记忆传播、知识坍塌 | **中**（改造现有 skill 结构即可） |
| 2. 自主自我改进 | code archive + 基准驱动递归修改 | 高（完全自动化 loop） | 安全失控、目标偏移 | **高**（需沙箱+人工 gate） |
| 3. 错误驱动学习 | 三级反思 + 即时修正 | 中（需反思管线+数据构建） | 反思质量依赖 LLM 能力 | **中**（chi-judge 已有框架） |
| 4. 技能获取与进化 | Task proposer + Agent + Evaluator 闭环 | 高（PAE 模式） | 假阳性污染 skill library | **中**（借鉴 PAE 三组件） |
| 5. 元学习 | Few-shot 适应 + 元流程固化 | 中（需少量演示数据） | 演示数据不足导致泛化差 | **低-中**（AdaptAgent 只需 1-2 demo） |
| 6. 行为回归与漂移 | EWMA + Mahalanobis + snapshot diff | 高（AMDM/EvalView 开源可用） | 误报导致过度干预 | **低**（EvalView 直接可用） |
| 7. 记忆巩固与压缩 | 预测误差过滤 + 定期 consolidation | 中（需 distillation 管线） | 过度压缩丢失关键上下文 | **中**（Nemori 框架可参考） |
| 8. 自动评估与基准 | Agent-as-a-Judge + exploit 攻防测试 | 高（但需高质量标注） | benchmark 漏洞导致分数失真 | **中**（需引入攻防测试环节） |

---

## 附录：优先实施路线图建议

基于"实现难度 × 预期收益"矩阵，建议按以下优先级推进：

1. **🥇 第 1 阶段（难度低）**：维度 6（EvalView snapshot diff）—— 立即引入，0 成本防御 silent regression。
2. **🥇 第 1 阶段（难度低）**：维度 5（AdaptAgent few-shot）—— 引入新 agent 时直接套用。
3. **🥈 第 2 阶段（难度中）**：维度 1（mael 经验池）—— 为每个 agent 建立独立经验库。
4. **🥈 第 2 阶段（难度中）**：维度 3（chi-judge 三级反思）—— 强化评审流程。
5. **🥈 第 2 阶段（难度中）**：维度 7（选择性添加 + 定期 consolidation）—— 防止经验污染。
6. **🥉 第 3 阶段（难度高）**：维度 2（DGM 自我改进）—— 仅限 ji agent，沙箱内试点。
7. **🥉 第 3 阶段（难度中）**：维度 4（PAE 技能发现）—— ji 自主发现新工具脚本。
8. **🥉 第 3 阶段（难度中）**：维度 8（BenchJack 攻防测试）—— 定期 audit 验证脚本。

---

## 未覆盖/证据不足的方向

以下方向在 2024-2025 年顶级会议/预印本中缺乏权威研究成果，不做深入讨论：

- **跨 agent 的显式知识图谱构建**：虽然 OSC（2025 EMNLP）有提及 CKM（Collaborator Knowledge Model），但仍是实验性探索，缺乏系统框架。
- **agent 团队的集体元学习**（team-level meta-learning）：现有 meta-learning 工作（AdaptFlow 等）均聚焦单 agent，团队层面的 meta-learner 尚未形成体系。
- **agent 自我意识（self-awareness）的形式化定义**：Gödel Agent 使用了"self-awareness"一词，但论文明确声明不涉及哲学层面的意识，目前无公认的形式化框架。

---

*报告结束。所有链接均经 2026-08-21 检索验证可访问。*
