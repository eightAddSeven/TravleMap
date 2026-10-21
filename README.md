# 云游中国：旅游景区交互地图

基于 Vue 3、MapLibre GL JS 与 OpenFreeMap 矢量底图构建的中国大陆旅游景区地图。页面沿用实验二的静态网页结构，不需要打包工具即可运行。

## 功能

- 收录中国大陆代表性博物馆、历史名迹、公园自然、商业街区和主题乐园
- 按景点名称、城市、省份、分类或关键词模糊搜索并飞行动画定位
- 鼠标悬浮景点标记时展示介绍、评分、亮点和建议游览时间
- 按类别筛选地图标记，支持热门景点快速定位
- 使用 OpenFreeMap 矢量地图，缩放时文字与道路保持清晰，最大支持 18 级缩放
- 定位导航：从当前位置、地图选点或另一景点出发，规划到目标景点的驾车 / 骑行路线（基于 OSRM），展示总距离、预计用时与分段转向指引
- 桌面端三栏数据面板与移动端自适应布局

## 目录结构

```text
实验二/
├─ index.htm                       # Vue 页面模板
├─ css/style.css                   # 页面、标记及悬浮卡片样式
├─ js/
│  ├─ app.js                       # Vue 状态、MapLibre 地图与交互逻辑
│  ├─ attractions.js               # 景区数据
│  └─ navigation.js                # OSRM 路线规划服务
├─ libs/
│  ├─ vue/vue.global.prod.js       # Vue 3.5.22
│  └─ maplibre/                    # MapLibre GL JS 5.12.0
│     ├─ maplibre-gl.js
│     └─ maplibre-gl.css
└─ openlayers.pdf                  # 原实验说明
```

## 运行

在当前目录启动静态服务器：

```powershell
python -m http.server 8000
```

浏览器访问 `http://localhost:8000/index.htm`。Vue 与 MapLibre 已保存在本地；OpenFreeMap 矢量地图数据与 OSRM 路线服务仍需联网加载。

## 扩展数据

在 `js/attractions.js` 的 `window.CHINA_ATTRACTIONS` 数组中添加对象即可新增景点。每条数据包括名称、城市、省份、分类、WGS84 经纬度、评分、简介、亮点和建议游览时间。
