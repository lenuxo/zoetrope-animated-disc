# Zoetrope 唱片实验室

一个纯前端的 Zoetrope 旋转动画唱片模拟器，用于设计盘面、验证循环动画，以及观察转速、相机采样率和曝光时间如何影响画面。

所有画面均由同一张静态盘面旋转、采样和曝光计算得到。自定义图片在浏览器本地处理，刷新后需重新导入。

## 功能

- 播放、暂停、逐帧检查和拖拽搓碟，支持正反转。
- 调整转速、采样率与曝光时间，观察同步、漂移和拖影。
- 导入并校准本地盘面，支持最多 4 个圆环独立配置。
- CD 受控变速演示，支持 CLV 跟随与电机加减速限制。
- 交互式图案设计指南，可下载 SVG 排布模板和设计单。
- 浅色 / 深色主题；界面针对桌面窗口优化。

## 本地运行

使用 Node.js 24 和 npm：

```bash
npm ci
npm run dev
```

打开终端输出的本地地址。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm test` | 运行模拟引擎与模板测试 |
| `npm run lint` | 静态检查 |
| `npm run build` | 类型检查并构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run preview:cf` | 构建并在本地 Cloudflare 环境预览 |
| `npm run deploy:check` | 构建并检查 Cloudflare 部署包 |
| `npm run deploy` | 构建并发布到 Cloudflare Workers |

Cloudflare 首次部署前运行 `npx wrangler login`。部署配置见 `wrangler.jsonc`，已启用单页应用路由回退。

## 项目结构

```text
src/components/  界面组件与编辑器
src/pages/       模拟器、设计指南与项目说明
src/simulation/  运动模型、采样、曝光与盘面渲染
src/routes/      前端路由
tests/          模拟引擎与模板测试
docs/           使用指南与引擎设计说明
```

技术栈：React、TypeScript、Vite、Tailwind CSS、Radix UI、Canvas。

## 文档

- [详细使用指南](docs/user-guide.md)
- [模拟引擎与受控变速设计](docs/simulation-design.md)

模拟采用固定帧率、全局快门和近似曝光积分，不模拟滚动快门或真实光驱的完整伺服系统。
