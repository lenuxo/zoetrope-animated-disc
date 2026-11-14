import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/button'

export function AboutPage() {
  return <article className="about-page">
    <header className="about-intro">
      <p>Zoetrope · 唱片实验室</p>
      <h1>关于这个实验</h1>
      <p className="about-lead">把一组静态图案排成圆盘，让它旋转，再用相机采样观察循环动作。这是一个可以制作、调整与验证动画盘面的浏览器实验室。</p>
    </header>
    <div className="about-body">
      <div className="about-copy">
        <section><h2>从一张盘面开始</h2><p>选择弹跳、计数示例，或导入自己的盘面图片。校准圆心与半径，设置动作帧与圆周排布，也可以把最多四个独立圆环合成为一张唱片，分别调整素材、位置与相位。</p></section>
        <section><h2>唱片在转，相机在看</h2><p>唱片模型按实际转速连续旋转。独立的相机视窗按设定帧率与曝光时间采样，可以观察逐格同步、失配漂移和曝光拖影。各圈共用唱片运动与相机设置，并按各自的格数检查匹配情况。</p></section>
        <section><h2>模拟的边界</h2><p>当前模拟固定帧率相机与全局快门，曝光通过多个旋转位置加权累积近似生成。所有画面都从同一份静态盘面计算，不使用页面频闪。</p></section>
        <section><h2>在本地完成</h2><p>实验在浏览器中运行，导入图片仅在本地处理。刷新后需要重新选择图片，记得保留自己的源动画帧与可编辑盘面文件。</p></section>
      </div>
      <aside className="about-aside" aria-label="从盘面到相机视野">
        <figure>
          <svg viewBox="0 0 400 260" role="img" aria-label="同一张静态唱片分别用于连续旋转和相机采样观察">
            <circle cx="122" cy="126" r="91" fill="#182437" stroke="#b6cbe14d" />
            {[70, 74, 78, 82].map(r => <circle key={r} cx="122" cy="126" r={r} fill="none" stroke="#d7e5f01a" />)}
            {Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return <ellipse key={i} cx={122 + Math.sin(a) * 65} cy={126 - Math.cos(a) * 65} rx="3.5" ry={2 + (1 - Math.cos(i * Math.PI / 6))} fill="#b7dcf4" transform={`rotate(${i * 15} ${122 + Math.sin(a) * 65} ${126 - Math.cos(a) * 65})`} /> })}
            <circle cx="122" cy="126" r="32" fill="#4c6b9e" /><circle cx="122" cy="126" r="5" fill="#dce7f2" />
            <rect x="104" y="48" width="36" height="24" rx="3" fill="none" stroke="#ead0a9" />
            <path d="M142 60H218Q230 60 230 72V104H244" fill="none" stroke="#c5d9ee66" strokeDasharray="4 4" />
            <rect x="244" y="82" width="134" height="92" rx="14" fill="#172538" stroke="#c3d5ea55" />
            <path d="M256 106H366" stroke="#c3d5ea26" />
            <text x="257" y="99" fill="#dce7f5" fontSize="10">相机视野</text>
            {[266, 296, 326, 356].map((x, i) => <ellipse key={x} cx={x} cy={136 + (i % 2) * 3} rx="8" ry="4" fill="#b7dcf4" />)}
            <text x="122" y="242" fill="#d3e0f0" textAnchor="middle" fontSize="12">盘面连续旋转</text>
            <text x="311" y="207" fill="#d3e0f0" textAnchor="middle" fontSize="12">独立采样观察</text>
          </svg>
          <figcaption>同一份图案，两种观察方式。调整相机参数，只改变采样视窗中的结果。</figcaption>
        </figure>
        <div className="about-actions"><Button asChild><Link to="/">打开工作台<ArrowRight /></Link></Button><Button asChild variant="outline"><Link to="/design-guide">阅读设计指南</Link></Button></div>
      </aside>
    </div>
  </article>
}
