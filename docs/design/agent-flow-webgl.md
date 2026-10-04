# AgentFlow — WebGL GPU 加速首页视觉特效设计文档

> 版本：v0.1.0 · 2026-10-21
> 状态：设计稿 + 原型代码（`site/src/components/AgentFlow.astro`）
> 参考：Argus `DigitalWater.astro`（1325 行 WebGL instanced renderer）

---

## 1  设计目标

| 维度 | 目标 |
|------|------|
| **视觉隐喻** | 6 个 Agent 角色构成星型拓扑，任务粒子从「门」辐射流出，经 verify 门禁回流，模拟完整工作流 |
| **性能** | 桌面 60fps / 移动 30fps / 低端 Canvas2D fallback |
| **技术** | WebGL1 instanced 渲染（`ANGLE_instanced_arrays`），Canvas2D fallback |
| **无障碍** | `prefers-reduced-motion` → 静态帧；`aria-hidden`；IntersectionObserver 暂停 |
| **依赖** | 零框架依赖，纯 vanilla JS，单文件 Astro 组件 |

---

## 2  从 Argus DigitalWater 学到的架构模式

### 2.1 直接复用的设计模式

| 模式 | Argus 实现 | AgentFlow 适配 |
|------|-----------|---------------|
| **Sprite Sheet Atlas** | 6 色块 × 63 字符 × 3 字号 = 1134 tiles，预渲染到离屏 canvas | 粒子无需 atlas（圆形 quad），但保留 `buildSpriteSheet` 模式供未来文字标签扩展 |
| **WebGL / Canvas2D 双路径** | `createRenderer()` 探测 WebGL + ext → 失败回退 2D | 同架构：探测 `ANGLE_instanced_arrays` + 软渲染检测 → 回退 2D |
| **软渲染检测** | `SOFTWARE_RE = /SwiftShader\|llvmpipe\|Software/` → 强制 2D | 同逻辑，避免 GPU 模拟器卡顿 |
| **Per-instance attributes** | `a_base` / `a_phys` / `a_phase` / `a_uv` / `a_alpha` / `a_mixColor` / `a_mix` | `a_pos` / `a_color` / `a_alpha` / `a_size`（更简洁，无需 wave） |
| **CPU 状态机 + GPU 像素提交** | 状态机 6-phase 在 CPU，仅像素提交走 WebGL | 同：粒子生命周期在 CPU 更新，渲染走 instanced draw |
| **visibilitychange 暂停** | `document.hidden` → `active = false` → 停止 rAF | 同 |
| **IntersectionObserver** | Hero 滚出视口时暂停 | 同：观察 `.hero` 元素 |
| **prefers-reduced-motion** | 静态帧降级（WCAG 2.3.3） | 同：渲染 80 个静态粒子 + 连线 |
| **DPR cap** | `Math.min(devicePixelRatio, 2)` | 同 |
| **帧率统计** | 1 秒窗口滚动更新 | 同（保留调试用） |

### 2.2 差异化设计（Argus 不需要，AgentFlow 需要）

| 特性 | 原因 |
|------|------|
| **星型拓扑布局** | 门为中心、5 个子 Agent 环绕 → 视觉传达「编排核心 + 分工协作」 |
| **节点标签渲染** | 每个节点需要渲染中文角色名（门/思/记/持/艺/寻），用 Canvas2D overlay 而非 WebGL（避免中文字体 atlas 复杂度） |
| **verify 门禁柱** | 绿色发光矩形 + 脉冲动画 → 视觉传达「双层机械验证」 |
| **路径状态机** | 粒子有 4 种路径类型（ORBIT → VERIFY → REPORT → FAIL），比 Argus 的 6-phase 颜色状态更强调空间流动 |
| **鼠标弹簧交互** | 粒子被鼠标推开后弹簧回弹 → 触感反馈「可交互的智能系统」 |

---

## 3  视觉设计

### 3.1 色彩系统

从 `global.css` 设计 token 读取，保持与现有站点一致：

| 角色 | 颜色 | Token | 语义 |
|------|------|-------|------|
| 门 (men) | `#e85d04` | `--color-accent` | 编排核心（橙） |
| 思 (si) | `#4a90d9` | — | 思考/知识（蓝） |
| 记 (ji) | `#2ea043` | — | 代码/工程（绿） |
| 持 (chi) | `#bf8700` | — | 评审/Judge（琥珀） |
| 艺 (yi) | `#a371f7` | — | 文生图/审美（紫） |
| 寻 (xun) | `#8b5cf6` | — | 搜索/核查（深紫） |
| verify 门禁 | `#2ea043` | — | 机械验证（绿） |
| 连线 | 8%–15% alpha | — | 背景层次感 |

### 3.2 粒子行为

```
用户指令
    │
    ▼
  ┌─────┐
  │  门  │ ← 中心节点，橙色脉冲
  └──┬──┘
     │ spawn 粒子（随机选目标 Agent）
     ├──────────┬──────────┬──────────┐
     ▼          ▼          ▼          ▼
  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
  │  思  │  │  记  │  │  持  │  │  艺  │  │  寻  │
  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘
     │        │        │        │        │
     └────────┴────────┴────────┴────────┘
                    │
                    ▼
              ┌──────────┐
              │ verify.mjs │ ← 绿色发光柱，脉冲
              │ 五项机械检查 │
              └──────┬───┘
                     │
                     ▼ (report 回路)
                   门 → 淡出
```

### 3.3 鼠标交互

- **弹簧推开**：粒子在鼠标 200px 半径内被推开，弹簧系数 0.02，阻尼 0.94
- **速度传递**：鼠标移动速度影响粒子初速度（方向性推动）
- **有机摆动**：每个粒子有独立的 phase + wobble，产生非均匀流动感

---

## 4  技术架构

### 4.1 渲染管线

```
每帧 (16.67ms budget)
│
├─ 1. spawn 新粒子（概率 0.12/帧，上限 2400）
│
├─ 2. updateParticles() — CPU
│   ├─ 位置积分 (x += vx, y += vy)
│   ├─ 波浪摆动 (sin wave per-particle phase)
│   ├─ 鼠标交互 (spring-damper)
│   ├─ 路径状态机 (ORBIT → VERIFY → REPORT)
│   ├─ 弹簧回弹 (向目标节点)
│   ├─ 生命衰减 (淡入/淡出)
│   └─ 压缩存活粒子 (compact buffer)
│
├─ 3. renderer.begin() — WebGL clear
│
├─ 4. renderer.drawLines() — GL_LINES
│   └─ 门→子Agent + 子Agent→verify + verify→门
│
├─ 5. renderer.drawVerifyGate() — GL_LINES
│   └─ 绿色脉冲矩形
│
├─ 6. renderer.drawParticles() — instanced TRIANGLE_STRIP
│   ├─ bufferData (pos/color/alpha/size × count)
│   ├─ vertexAttribDivisorANGLE (per-instance)
│   └─ drawArraysInstancedANGLE (4 vertices × count instances)
│
└─ 7. renderer.end()
```

### 4.2 GPU 实例化渲染

Argus 的核心创新是 **单批次 instanced draw** 替代数千次 `drawImage`。AgentFlow 同样采用：

- **Quad buffer**：4 个顶点的单位正方形（`[-1,-1, 1,-1, -1,1, 1,1]`）
- **Per-instance attributes**：
  - `a_pos` (vec2) — 粒子世界坐标
  - `a_color` (vec3) — RGB 颜色
  - `a_alpha` (float) — 透明度
  - `a_size` (float) — 粒子半径
- **Vertex shader**：将 quad 顶点偏移到 `a_pos` 位置，缩放到 `a_size`
- **Fragment shader**：圆形裁剪 + 柔光衰减（`smoothstep` + `pow`）+ 内核高亮

```glsl
// Fragment Shader 核心逻辑
float dist = length(v_uv - 0.5) * 2.0;
if (dist > 1.0) discard;                    // 圆形裁剪
float glow = 1.0 - smoothstep(0.0, 1.0, dist);
glow = pow(glow, 1.5);                      // 柔光衰减
float core = 1.0 - smoothstep(0.0, 0.3, dist); // 内核高亮
vec3 col = v_color * (0.4 + 0.6 * glow) + vec3(core * 0.3);
gl_FragColor = vec4(col * v_alpha, v_alpha * glow * 0.8);
```

### 4.3 性能预算

| 指标 | 桌面 | 移动 | 低端 |
|------|------|------|------|
| 粒子数 | 2400 | 800 | 400 |
| DPR | ≤2 | ≤1.5 | ≤1 |
| 连线数 | ~22 | ~22 | ~22 |
| verify 门禁 | GL_LINES | GL_LINES | Canvas2D |
| 节点标签 | Canvas2D overlay | Canvas2D overlay | Canvas2D overlay |
| 预期帧率 | 60fps | 30–45fps | 20–30fps |

---

## 5  集成方案

### 5.1 替换现有 HeroArt

当前 `HeroArt.astro` 有 3 层：
1. **符号矩阵**（CSS animation，1120 个 span）→ 保留作为底层纹理
2. **ASCII dither arcs**（CSS animation）→ 保留作为装饰
3. **Canvas 粒子**（60 个 2D 粒子）→ **替换为 AgentFlow WebGL**

集成方式：在 `HeroArt.astro` 的 `.hero-canvas` 容器中添加 `<AgentFlow />`，z-index 置于符号矩阵和 dither 之间。

### 5.2 与 HeroCanvas（门动画）的关系

`HeroCanvas.astro` 是独立的门开合动画（12 秒 sine 周期），位于 hero 下方区域。AgentFlow 是 hero 全屏背景。两者不冲突：
- AgentFlow：hero 全屏背景（z-index: 0）
- HeroArt 符号矩阵：叠加层（z-index: 1）
- HeroCanvas 门动画：hero 区域独立组件（z-index: 2）

### 5.3 CSS Token 依赖

从 `global.css` 读取（`readColorToken()` 模式，同 Argus）：

```css
:root {
  --color-accent: #e85d04;    /* 门 */
  --color-fg: #1f2328;
  --color-fg-muted: #8b949e;
}
```

---

## 6  无障碍设计

| 要求 | 实现 |
|------|------|
| WCAG 2.3.3 动画 | `prefers-reduced-motion: reduce` → 静态帧（80 粒子 + 连线 + 门禁） |
| 屏幕阅读器 | `aria-hidden="true"` + `role="presentation"` |
| 键盘 | canvas 无交互（指针事件由父元素 `.hero` 捕获） |
| 暂停控制 | `visibilitychange` + `IntersectionObserver` 自动暂停 |
| 色彩对比 | 粒子在浅色背景上 alpha 0.3–1.0，满足 4.5:1 对比度 |

---

## 7  与 Argus DigitalWater 的对比

| 维度 | Argus DigitalWater | Men AgentFlow |
|------|-------------------|---------------|
| **视觉隐喻** | 代码字符流（审查流程） | Agent 网络拓扑（协作流程） |
| **粒子类型** | 文字 token（atlas 渲染） | 圆形光点（quad 渲染） |
| **粒子数** | 16,000（桌面） | 2,400（桌面） |
| **状态机** | 6-phase 颜色循环 | 4-path 空间流动 |
| **交互** | 流体弹簧 + 轨迹 | 弹簧推开 + 速度传递 |
| **布局** | 横向代码行（grid） | 星型拓扑（节点 + 连线） |
| **Shader 复杂度** | 高（wave + mix） | 中（圆形裁剪 + 柔光） |
| **文件大小** | 1325 行 | ~450 行（目标） |

---

## 8  待办 & 后续迭代

### Phase 1（当前）
- [x] WebGL instanced renderer 骨架
- [x] 粒子系统 + 星型拓扑
- [x] Canvas2D fallback
- [x] 无障碍（reduced-motion / pause）
- [ ] 节点标签渲染（Canvas2D overlay）
- [ ] verify 门禁文字标签
- [ ] 响应式布局（移动端粒子数降级）

### Phase 2
- [ ] 粒子颜色渐变（门→子Agent 颜色混合）
- [ ] 连线流动虚线动画（dash offset）
- [ ] FAIL 路径粒子（红色回退）
- [ ] 鼠标悬停节点高亮（节点放大 + 连线加粗）
- [ ] 触摸手势支持（双指缩放拓扑）

### Phase 3
- [ ] WebGPU renderer（`navigator.gpu` 探测）
- [ ] 粒子文字标签（中文 glyph atlas）
- [ ] 粒子间斥力（N-body 近似）
- [ ] 音频响应（Web Audio API 分析器）

---

## 9  文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `site/src/components/AgentFlow.astro` | ✅ 已创建 | WebGL/Canvas2D 渲染器 + 粒子系统 |
| `site/src/components/HeroArt.astro` | 🔄 待修改 | 集成 AgentFlow，替换 Canvas 粒子层 |
| `site/src/styles/global.css` | ✅ 无需修改 | 已有 design token |
| `site/src/pages/index.astro` | ✅ 无需修改 | HeroArt 已在使用 |

---

## 10  风险 & 缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| WebGL 在极旧浏览器不可用 | 无动画 | Canvas2D fallback 自动降级 |
| 中文 glyph atlas 复杂度 | Phase 3 才实现文字标签 | Phase 1-2 用 Canvas2D overlay 渲染标签 |
| 移动端 GPU 性能 | 掉帧 | 粒子数降级 + DPR 限制 + IntersectionObserver 暂停 |
| 内存占用（2400 粒子 × 16 floats） | ~150KB | 远低于 GPU 显存上限 |
| Astro `is:inline` 脚本作用域 | 全局污染 | IIFE 包裹，零全局变量 |

---

*设计参考：Argus `DigitalWater.astro` (BSL 1.1) · Men `AgentFlow.astro` (MIT)*
