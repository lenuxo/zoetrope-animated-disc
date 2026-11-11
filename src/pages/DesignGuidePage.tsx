import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import type { WorkbenchPlan } from '../simulation/plate'
import { ArrowRight, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LayoutDemo, LoopDemo, ParameterPreview, SamplingDemo } from '@/components/GuideDemos'
import { createGuideTemplate } from '@/simulation/guide-template'

const sections = [
  ['brief', '选一个小动作'], ['parameters', '定下帧数与节奏'], ['loop', '画出一组循环帧'],
  ['layout', '把动作排成圆盘'], ['verify', '旋转盘面做检查'], ['deliver', '整理你的第一份成品'],
] as const
const presets = [
  { rpm: '33⅓', slots: 54, frames: 18 },
  { rpm: '45', slots: 40, frames: 10 },
] as const
const draftKey = 'zoetrope-design-walkthrough-v1'
type Draft = { goal: string; presetIndex: number; frames: number; completed: boolean[] }
const defaultDraft: Draft = { goal: '一颗小球，原地弹跳一次', presetIndex: 0, frames: 18, completed: Array(6).fill(false) }
function readDraft(): Draft {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null')
    if (!draft || ![0, 1].includes(draft.presetIndex) || typeof draft.goal !== 'string' || draft.goal.length > 120) return defaultDraft
    const slots = presets[draft.presetIndex as 0 | 1].slots
    if (!Number.isInteger(draft.frames) || draft.frames < 2 || slots % draft.frames !== 0) return defaultDraft
    return { goal: draft.goal, presetIndex: draft.presetIndex, frames: draft.frames, completed: sections.map((_, i) => draft.completed?.[i] === true) }
  } catch { return defaultDraft }
}
function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Step({ index, children }: { index: number; children: ReactNode }) {
  const [id, title] = sections[index]
  return <section id={id} aria-labelledby={`${id}-title`} className="guide-task">
    <div className="guide-task-title"><span aria-hidden="true">{index + 1}</span><h2 id={`${id}-title`}>{title}</h2></div>
    {children}
  </section>
}
function Checkpoint({ index, output, checked, onChange }: { index: number; output: string; checked: boolean; onChange: () => void }) {
  const next = sections[index + 1]
  return <div className="guide-checkpoint">
    <label><input type="checkbox" checked={checked} onChange={onChange} /><span><strong>完成标准</strong>{output}</span></label>
    {next && <a href={`#${next[0]}`}>下一步：{next[1]}<ArrowRight aria-hidden="true" /></a>}
  </div>
}
function ParameterPlanner({ presetIndex, frames, onPreset, onFrames }: { presetIndex: number; frames: number; onPreset: (index: number) => void; onFrames: (frames: number) => void }) {
  const preset = presets[presetIndex]
  const divisors = Array.from({ length: preset.slots - 1 }, (_, i) => i + 2).filter((n) => preset.slots % n === 0)
  return (
    <div className="guide-planner">
      <div className="guide-planner-controls">
        <div className="guide-control-field"><Label htmlFor="guide-preset">观看组合</Label><Select value={String(presetIndex)} onValueChange={(value) => onPreset(Number(value))}>
          <SelectTrigger id="guide-preset" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{presets.map((item, i) => <SelectItem value={String(i)} key={item.slots}>{item.rpm} RPM · 30 fps · {item.slots} 格</SelectItem>)}</SelectContent>
        </Select></div>
        <div className="guide-control-field"><Label htmlFor="guide-frames">每个循环的独立帧数</Label><Select value={String(frames)} onValueChange={(value) => onFrames(Number(value))}>
          <SelectTrigger id="guide-frames" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{divisors.map((n) => <SelectItem key={n} value={String(n)}>{n} 帧</SelectItem>)}</SelectContent>
        </Select></div>
        <div className="guide-control-field"><Label htmlFor="guide-repeats">沿圆周重复次数</Label><Select value={String(preset.slots / frames)} onValueChange={(value) => onFrames(preset.slots / Number(value))}>
          <SelectTrigger id="guide-repeats" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{divisors.map((n) => preset.slots / n).reverse().map((n) => <SelectItem key={n} value={String(n)}>{n} 次</SelectItem>)}</SelectContent>
        </Select></div>
      </div>
      <div key={`${preset.slots}-${frames}`} className="guide-calculation guide-state-enter" aria-live="polite" aria-atomic="true">
        <p><strong>{preset.slots} 格</strong><span>=</span><strong>{frames} 帧</strong><span>×</span><strong>{preset.slots / frames} 次重复</strong></p>
        <p>动作每 <strong>{Number((frames / 30).toFixed(3))} 秒</strong>循环一次；每格夹角约 <strong>{Number((360 / preset.slots).toFixed(2))}°</strong>。</p>
      </div>
      <p className="guide-caption">当前组合的总格数固定。独立帧数与重复次数互相换算：帧数越多，每个循环越长，圆周上的重复组越少。下方预览与第 5 步的采样演示会同步更新。</p>
      <ParameterPreview slots={preset.slots} frames={frames} repeats={preset.slots / frames} rpm={presetIndex === 0 ? 100 / 3 : 45} />
    </div>
  )
}

export function DesignGuidePage() {
  const navigate = useNavigate()
  const applyPlan = useOutletContext<(plan: WorkbenchPlan) => void>()
  const [draft, setDraft] = useState<Draft>(readDraft)
  const { goal, presetIndex, frames, completed } = draft
  const preset = presets[presetIndex]
  const geometry = useMemo(() => ({ slots: preset.slots, frames, repeats: preset.slots / frames }), [preset.slots, frames])
  const period = Number((frames / 30).toFixed(3))
  const degrees = Number((360 / geometry.slots).toFixed(3))
  const done = completed.filter(Boolean).length
  const goalText = goal.trim() || defaultDraft.goal
  const changePlan = (index: number, nextFrames: number) => setDraft((current) => {
    if (current.presetIndex === index && current.frames === nextFrames) return current
    return { ...current, presetIndex: index, frames: nextFrames, completed: current.completed.map((checked, i) => i === 0 && checked) }
  })
  const openWorkbench = () => {
    applyPlan({ geometry, rpm: presetIndex === 0 ? 100 / 3 : 45 })
    navigate('/')
  }
  const toggleStep = (index: number) => setDraft((current) => ({ ...current, completed: current.completed.map((value, i) => i === index ? !value : value) }))
  const checkpoint = (index: number, output: string) => <Checkpoint index={index} output={output} checked={completed[index]} onChange={() => toggleStep(index)} />
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* Continue when storage is unavailable. */ } }, [draft])
  const designNotes = () => [
    'Zoetrope 盘面设计单', `动作目标：${goalText}`, `转速：${preset.rpm} RPM（顺时针）`, '相机采样率：30 fps',
    `排布：${geometry.slots} 格 = ${frames} 独立帧 × ${geometry.repeats} 次重复`, `每格夹角：360 / ${geometry.slots} 度（约 ${degrees} 度）`, `动作周期：${frames} / 30 秒（约 ${period} 秒）`,
    `源帧：01–${String(frames).padStart(2, '0')}，统一画布与定位基准，不重复导出周期终点。`,
    '帧号沿逆时针递增；每张图的顶部朝圆外。相邻图像位置与朝向一起旋转。',
    '绘图：模板为 1200×1200，圆心 (600,600)，外缘半径 560。蓝点为每帧的放置基准；不要将最终盘面拉伸。',
    '导出：隐藏 guides 辅助组，导出完整静态 PNG。保留所有源帧与可编辑文件。',
    '验证：上传 PNG、校准圆心和半径、应用相同排布参数，相机采样开启自动匹配，以 1/1000 秒曝光起步。',
    '逐帧检查方向、末帧到首帧、定位、重叠；同时保留旋转采样预览与参数说明。',
  ].join('\n')
  return <div className="design-guide guide-walkthrough">
    <header className="guide-intro">
      <div>
        <p className="guide-kicker">Zoetrope 盘面制作指南</p>
        <h1>跟着六步，做出你的<br className="hidden sm:block" />第一张动画盘面。</h1>
        <p className="guide-lead">从一个小动作开始，画出循环帧、排成圆盘，再验证它是否真的动起来。每一步都有操作、示例和完成标准。</p>
        <Button asChild><a href="#brief">开始第 1 步<ArrowRight /></a></Button>
      </div>
      <div className="guide-start">
        <h2>这次先做一张单圈盘面</h2>
        <p>准备一个能逐帧绘图、旋转摆放图片的绘图或动画工具。跟着弹跳小球练习，也可以换成自己的简单动作。</p>
        <dl><div><dt>你将在绘图工具中完成</dt><dd>源动画帧 → 静态盘面 PNG</dd></div><div><dt>这里提供</dt><dd>参数试算、排布模板、检查演示</dd></div><div><dt>最后去工作台</dt><dd>导入自己的盘面并验证</dd></div></dl>
      </div>
    </header>
    <div className="guide-body">
      <aside className="guide-contents"><nav aria-label="盘面制作步骤">
        <p>制作进度 · {done} / 6</p><progress value={done} max={6} aria-label="已完成制作步骤" />
        {sections.map(([id, title], index) => <a href={`#${id}`} key={id} className={completed[index] ? 'is-complete' : ''}><span className="guide-nav-step">{completed[index] ? <Check aria-label="已完成" /> : index + 1}</span>{title}</a>)}
        <span className="guide-progress-hint">完成一步后勾选自查。当前标签页会保留进度。更改帧数或观看组合后，请从第 2 步重新核对。</span>
      </nav></aside>
      <article className="guide-article">
        <Step index={0}>
          <p className="guide-task-lead">先写清楚：你的主体，要反复做哪一个动作？</p>
          <p>第一张先画一个主体、一圈动作。选原地弹跳、花朵开合或箭头自转，让动作结束时能接回开始的状态。</p>
          <div className="guide-goal-field"><Label htmlFor="guide-goal">我的动作目标</Label><Input id="guide-goal" maxLength={120} value={goal} onChange={(e) => setDraft((current) => ({ ...current, goal: e.target.value, completed: current.completed.map((checked, i) => i === 1 && checked) }))} /><p className="guide-caption">例如「一颗小球，原地弹跳一次」。后面的设计单会带上这个目标。</p></div>
          <h3>跟着小球做</h3>
          <p>画一颗落在基线上的小球，让它上升到最高点，再落回基线。整套动作都对齐同一个圆心横坐标与地面基线。</p>
          <p>选定主体后，先画出最宽、最高的姿态，确认缩小后仍能看清。第一版先保留轮廓和明显的明暗对比。</p>
          {checkpoint(0, '能用一句话说清循环动作，并有一个清楚的主体轮廓。')}
        </Step>
        <Step index={1}>
          <p className="guide-task-lead">先用默认方案：画 18 帧，重复 3 次，铺满 54 个位置。</p>
          <p>这套方案以 33⅓ RPM 旋转、30 fps 观看，小球每 0.6 秒弹跳一次。点击「播放联动预览」感受节奏；想慢一点就增加独立帧数，想快一点就增加重复次数。</p>
          <ParameterPlanner presetIndex={presetIndex} frames={frames} onPreset={(index) => changePlan(index, presets[index].frames)} onFrames={(value) => changePlan(presetIndex, value)} />
          <div className="guide-current-plan"><strong>接下来按这份参数制作</strong><p>画 <b>{frames}</b> 张不同姿态 → 沿圆周放 <b>{geometry.repeats}</b> 遍 → 共 <b>{geometry.slots}</b> 个位置。下面的说明与下载模板会一起更新。</p></div>
          <details className="guide-disclosure"><summary>想使用其他转速或采样率？</summary><p>逐格同步时，圆周格数 = 60 × 采样率 ÷ RPM；格数还要等于独立帧数 × 重复次数。结果不是整数时，需要调整观看参数，不能直接四舍五入并期待精确同步。第一版建议先完成上面的匹配组合。</p></details>
          {checkpoint(1, `已选定 ${frames} 帧 × ${geometry.repeats} 次，知道要画几张图、动作多快。`)}
        </Step>
        <Step index={2}>
          <p className="guide-task-lead">在普通矩形画布里，完成你的 {frames} 张源动画。</p>
          <ol className="guide-steps">
            <li><h3>先画关键姿态，再补中间帧</h3><p>小球示例：先画落地和最高点，再补上升与下降的姿态。所有帧使用同样大小的画布，保留同一个定位基准；不要逐张紧贴图案边缘裁切。</p></li>
            <li><h3>把一个周期均匀分成 {frames} 份</h3><p>以当前 {period} 秒的周期为例，第 1 帧取 0 秒，第 2 帧取 1/30 秒，最后一帧取 {frames - 1}/30 秒。不要再把周期终点的首帧复制一遍；下一次播放自然回到第 1 帧。</p></li>
            <li><h3>先播放三遍，再逐帧看接缝</h3><p>以 30 fps 预览源动画。检查「倒数第二帧 → 末帧 → 首帧 → 第二帧」：位置、形状和速度应接续。如果卡顿，先回到源帧修改。</p></li>
            <li><h3>按顺序导出</h3><p>将不同姿态导出为透明背景图片，编号 <code>01–{String(frames).padStart(2, '0')}</code>。保留相同画布尺寸与定位，不要导出多余的重复首帧。</p></li>
          </ol>
          <details className="guide-disclosure"><summary>接缝不顺？用 12 帧对照看看哪里出了问题</summary><LoopDemo /></details>
          {checkpoint(2, `已有 ${frames} 张对齐的源帧，按 30 fps 连续播放三遍，接缝没有多停一拍。`)}
        </Step>
        <Step index={3}>
          <p className="guide-task-lead">下载排布模板，把刚才的源帧放进同一张圆盘。</p>
          <Button variant="outline" onClick={() => downloadFile(`zoetrope-${geometry.slots}slots-${frames}frames-template.svg`, createGuideTemplate(geometry), 'image/svg+xml;charset=utf-8')}><Download />下载当前参数的 SVG 排布模板</Button>
          <p className="guide-caption">1200 × 1200 画布 · {geometry.slots} 格 · {frames} 帧 × {geometry.repeats} 次 · 适用于顺时针旋转。模板包含辅助线和帧号，不包含你的动作素材。</p>
          <ol className="guide-steps">
            <li><h3>打开模板，把源帧放在蓝点上</h3><p>在支持 SVG 的绘图工具中打开模板。每个蓝点是一帧的统一放置基准，外沿数字告诉你这个位置要放哪张源帧。将图案放进两条虚线圆之间，先用最大姿态确认内外缘都放得下。</p></li>
            <li><h3>位置和朝向一起旋转</h3><p>先在顶部放第 1 帧，让图片顶部朝圆外。从顶部沿逆时针，每前进一格就放下一帧，位置与朝向一起逆时针旋转 <code>360/{geometry.slots}°</code>（约 {degrees}°）。用精确公式设置角度，避免多次累加近似值。</p></li>
            <li><h3>完整重复 {geometry.repeats} 次，检查最后一格</h3><p>每放完 {frames} 帧，从第 1 帧再放一组。最后一格之后应自然回到最初的第 1 帧。独立角色不要碰到邻格；内侧比外侧更窄，装不下时先简化轮廓或缩小整套动作。</p></li>
            <li><h3>隐藏辅助组，导出一张完整 PNG</h3><p>隐藏或删除模板中的 <code>guides</code> 辅助组，再导出整个画布。保留正圆、原始圆心和一致缩放，不要只裁出一段圆环。</p></li>
          </ol>
          <details className="guide-disclosure"><summary>不确定帧序或朝向？先用编号排一次</summary><p>下面用 12 格 / 6 帧简化演示。你的盘面按模板上的 {geometry.slots} 格与帧号制作，排布规则相同。</p><LayoutDemo /></details>
          {checkpoint(3, '已有一张包含所有姿态的静态盘面 PNG，辅助线已隐藏，圆心与比例正确。')}
        </Step>
        <Step index={4}>
          <p className="guide-task-lead">现在验证整张静态盘面是否真的支持动画。</p>
          <p>下面的小球演示使用你第 2 步选择的排布。先按当前参数播放一次，记住同步状态下的效果，再去工作台检查自己的图片。</p>
          <SamplingDemo geometry={geometry} rpm={presetIndex === 0 ? 100 / 3 : 45} />
          <ol className="guide-steps">
            <li><h3>在工作台上传自己的 PNG</h3><p>在「盘面素材与校准」上传图片。按原图设置圆心和外缘半径，点击「应用校准」。如果沿用下载模板，圆心是 (600, 600)，外缘半径为 560 像素；改变过导出尺寸时，按新图片重新校准。</p></li>
            <li><h3>核对工作台里的制作参数</h3><p>用本页按钮打开工作台后，核对圆周格数 <b>{geometry.slots}</b>、独立帧数 <b>{frames}</b>、重复次数 <b>{geometry.repeats}</b>，转速 <b>{preset.rpm} RPM</b>，方向为顺时针。这些参数应与你在绘图工具中导出的盘面一致。</p></li>
            <li><h3>先看清，再检查方向和接缝</h3><p>选择「相机采样」，开启自动匹配，应得到 30 fps；曝光从 1/1000 秒起步。调整观察半径对准你的圆环。先播放，再暂停逐帧检查；完成后试着延长曝光，确认拖影是否影响辨认。</p></li>
          </ol>
          <div className="guide-action-row"><Button onClick={openWorkbench}>用这份参数打开工作台<ArrowRight /></Button><Button variant="outline" onClick={() => downloadFile('zoetrope-design-notes.txt', designNotes(), 'text/plain;charset=utf-8')}><Download />带上参数单</Button></div>
          <p className="guide-caption">此按钮将工作台切到单盘面，并应用当前排布、顺时针转速和短曝光。可继续使用已导入的图片，也可以上传新的盘面。</p>
          <details className="guide-disclosure" id="troubleshooting"><summary>预览和预期不一样？按现象找修改位置</summary>
            <div className="guide-table-wrap"><table><caption className="sr-only">预览问题与返回修改的步骤</caption><thead><tr><th scope="col">现象</th><th scope="col">回到哪里修改</th></tr></thead><tbody>
              <tr><th scope="row">动作倒放、图案转头</th><td>回到第 4 步，检查帧序、旋转方向与局部朝向。</td></tr>
              <tr><th scope="row">接缝跳步或多停一拍</th><td>回到第 3 步，检查源帧首尾；再检查圆周是否完整重复。</td></tr>
              <tr><th scope="row">主体在抖动</th><td>检查每帧的定位基准，再检查盘面圆心与放置半径。</td></tr>
              <tr><th scope="row">整圈缓慢漂移</th><td>核对已应用的格数、转速与 30 fps 采样设置。</td></tr>
              <tr><th scope="row">位置稳定但看不清</th><td>先缩短曝光；仍模糊时回到第 4 步检查细节、尺寸、重叠与对比。</td></tr>
            </tbody></table></div>
          </details>
          <details className="guide-disclosure" id="principle"><summary>为什么普通旋转看不清，采样后才会动？</summary><p>旋转把相邻的固定姿态送到同一观察位置。相机在匹配的时刻采样，才看到位置稳定、姿态变化的动画；短曝光减少旋转期间的拖影。模拟器采用固定帧率与全局快门，不模拟真实设备的滚动快门和自动曝光，实际拍摄仍需按设备验证。</p></details>
          {checkpoint(4, '自己的静态盘面经过旋转采样，方向正确、位置稳定，连续循环没有明显跳步。')}
        </Step>
        <Step index={5}>
          <p className="guide-task-lead">把素材、盘面和观看条件放在一起，留下一份可复现的设计。</p>
          <div className="guide-delivery-plan"><h3>你的设计单</h3><dl><div><dt>动作</dt><dd>{goalText}</dd></div><div><dt>排布</dt><dd>{geometry.slots} 格 = {frames} 帧 × {geometry.repeats} 次</dd></div><div><dt>观看条件</dt><dd>{preset.rpm} RPM · 顺时针 · 30 fps</dd></div><div><dt>动作周期</dt><dd>{period} 秒</dd></div></dl></div>
          <ul className="guide-deliverables"><li><strong>源动画帧</strong><span>{frames} 张图片、可编辑文件，以及同一定位基准。</span></li><li><strong>完整静态盘面</strong><span>隐藏辅助线的 PNG，保留圆心与比例。</span></li><li><strong>验证结果</strong><span>从整张静态盘面旋转采样得到的预览；可以使用屏幕录制保存工作台效果。</span></li><li><strong>观看参数</strong><span>转速、采样率、方向、格数和重复次数，随盘面一起保存。</span></li></ul>
          <Button variant="outline" onClick={() => downloadFile('zoetrope-design-notes.txt', designNotes(), 'text/plain;charset=utf-8')}><Download />下载我的设计单</Button>
          {checkpoint(5, '源帧、静态盘面、验证结果和参数说明已一起保存。')}
          <details className="guide-disclosure"><summary>完成第一张以后，再尝试多圈</summary><p>先复制已经通过检查的基础网格。各圈共用 {geometry.slots} 格，再使用不同的独立帧数和重复次数形成不同节奏。复杂主体放外圈，内圈先用简化形状；逐圈检查后再组合。</p></details>
          {done === 6 && <p className="guide-finish" role="status"><Check aria-hidden="true" />六步自查已完成。保留这份成品，再开始下一种动作。</p>}
        </Step>
        <footer className="guide-footer">进一步参考：<a href="https://makezine.com/projects/animated-records-phenakistoscopes/" target="_blank" rel="noreferrer">Drew Tetz 的制作教程</a> · <a href="https://drdub.com/en/grafik/zoetrope/" target="_blank" rel="noreferrer">Dr. Dub 的观看参数</a>。模板与参数按逐格采样模型生成。</footer>
      </article>
    </div>
  </div>
}
