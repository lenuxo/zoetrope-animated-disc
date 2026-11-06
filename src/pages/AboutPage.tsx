import { PageHeading } from '../components/PageHeading'

export function AboutPage() {
  return <PageHeading title="关于这个实验" description="这是一个纯前端的 Zoetrope 唱片动画模拟器。支持内置示例与本地盘面图片，可校准圆心和半径、配置动作排布，并将最多四个独立圆环合成为一张静态盘面。各圈共用唱片转速和相机采样，可分别检查匹配情况。通过改变转速、相机采样率与曝光时间，可以观察同步动画、失配漂移和曝光拖影。所有画面均从同一静态盘面旋转计算，当前模拟固定帧率与全局快门，不使用页面频闪。" />
}
