/* global Vue, maplibregl */

(function () {
  "use strict";

  const CATEGORY_MAP = {
    all: { key: "all", label: "全部景点", icon: "✦", description: "全国精选目的地" },
    museum: { key: "museum", label: "博物馆", icon: "▥", description: "艺术与文明宝库" },
    heritage: { key: "heritage", label: "历史名迹", icon: "⌂", description: "古城、宫殿与遗址" },
    park: { key: "park", label: "公园自然", icon: "♧", description: "山川、湖泊与绿地" },
    commercial: { key: "commercial", label: "商业街区", icon: "◇", description: "都市购物与夜生活" },
    theme: { key: "theme", label: "主题乐园", icon: "◉", description: "亲子游乐与城市观景" },
  };

  const CATEGORIES = Object.values(CATEGORY_MAP);
  const CHINA_VIEW = { center: [104.5, 35.4], zoom: 3.6, pitch: 0, bearing: 0 };
  const CHINA_BOUNDS = [[73.2, 17.8], [135.2, 53.8]];

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  Vue.createApp({
    data() {
      return {
        attractions: window.CHINA_ATTRACTIONS,
        categories: CATEGORIES,
        categoryMap: CATEGORY_MAP,
        activeCategory: "all",
        searchQuery: "",
        showSuggestions: false,
        selectedAttraction: null,
        mapStatus: { type: "loading", text: "矢量地图加载中" },
        map: null,
        popup: null,
        markerStore: new Map(),
        sparkBars: [34, 49, 41, 68, 56, 83, 70, 94, 78, 88, 66, 92],
        navigation: {
          active: false,           // 是否显示路线面板
          pickingStart: false,     // 是否处于「点击地图选起点」模式
          profile: "driving",      // 出行方式：driving | cycling
          start: null,             // 起点 { lng, lat, label }
          end: null,               // 终点 { lng, lat, label }
          startMarker: null,       // 起点标记引用
          showAttractionPicker: false, // 是否展开「选景点」下拉
          phase: "idle",           // idle | locating | planning | ready | error
          error: null,
          route: null,
          summary: null,           // { distance, duration }
          steps: [],
        },
      };
    },

    computed: {
      suggestions() {
        const query = this.searchQuery.toLowerCase().replaceAll(" ", "");
        if (!query) return [];
        return this.attractions
          .filter((item) => {
            const haystack = [item.name, item.city, item.province, CATEGORY_MAP[item.category].label, item.summary, ...item.highlights]
              .join("")
              .toLowerCase()
              .replaceAll(" ", "");
            return haystack.includes(query);
          })
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 7);
      },

      visibleCount() {
        if (this.activeCategory === "all") return this.attractions.length;
        return this.attractions.filter((item) => item.category === this.activeCategory).length;
      },

      cityCount() {
        return new Set(this.attractions.map((item) => item.city)).size;
      },

      provinceCount() {
        return new Set(this.attractions.map((item) => item.province)).size;
      },

      activeCategoryLabel() {
        return CATEGORY_MAP[this.activeCategory].label;
      },

      topAttractions() {
        return [...this.attractions].sort((a, b) => b.popularity - a.popularity || b.rating - a.rating).slice(0, 5);
      },

      coveragePercent() {
        return Math.round((this.provinceCount / 34) * 100);
      },
    },

    watch: {
      activeCategory() {
        this.updateMarkerVisibility();
      },
    },

    mounted() {
      this.initMap();
      window.addEventListener("resize", this.resizeMap);
    },

    beforeUnmount() {
      window.removeEventListener("resize", this.resizeMap);
      if (this.map) this.map.remove();
    },

    methods: {
      initMap() {
        this.map = new maplibregl.Map({
          container: "map",
          style: "https://tiles.openfreemap.org/styles/positron",
          center: CHINA_VIEW.center,
          zoom: CHINA_VIEW.zoom,
          minZoom: 1.6,
          maxZoom: 18,
          maxBounds: [[70, 15], [140, 56]],
          attributionControl: false,
          antialias: true,
          renderWorldCopies: false,
          locale: {
            "NavigationControl.ZoomIn": "放大",
            "NavigationControl.ZoomOut": "缩小",
            "NavigationControl.ResetBearing": "重置方向",
          },
        });

        this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        this.map.addControl(new maplibregl.FullscreenControl(), "top-right");
        this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
        this.map.addControl(
          new maplibregl.AttributionControl({ compact: true, customAttribution: "旅游景点数据：课程实验示例" }),
          "bottom-right",
        );

        this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 24, maxWidth: "320px", className: "attraction-popup" });

        this.map.on("load", () => {
          this.createMarkers();
          this.map.resize();
          this.fitChinaView(0);
          this.mapStatus = { type: "ready", text: "高清矢量地图已就绪" };
        });

        this.map.on("error", (event) => {
          const message = String(event?.error?.message || "");
          if (message.includes("sprite") || message.includes("glyph")) return;
          this.mapStatus = { type: "error", text: "地图资源加载异常" };
        });

        this.map.on("movestart", () => {
          this.showSuggestions = false;
        });

        this.map.on("click", (event) => {
          if (!this.navigation.pickingStart) return;
          const { lng, lat } = event.lngLat;
          this.setNavigationStart({ lng, lat, label: `地图选点 (${lng.toFixed(4)}, ${lat.toFixed(4)})` });
          this.navigation.pickingStart = false;
          this.map.getCanvas().style.cursor = "";
          this.planRoute();
        });
      },

      createMarkers() {
        this.attractions.forEach((item) => {
          const element = document.createElement("button");
          element.type = "button";
          element.className = `tourism-marker is-${item.category}`;
          element.setAttribute("aria-label", `${item.name}，${item.city}`);
          element.innerHTML = `<span class="marker-halo"></span><span class="marker-core">${escapeHtml(CATEGORY_MAP[item.category].icon)}</span><span class="marker-pin"></span>`;

          const marker = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(item.coordinates).addTo(this.map);
          element.addEventListener("mouseenter", () => this.showHoverCard(item));
          element.addEventListener("mouseleave", () => {
            if (this.selectedAttraction?.id !== item.id) this.popup.remove();
          });
          element.addEventListener("focus", () => this.showHoverCard(item));
          element.addEventListener("blur", () => {
            if (this.selectedAttraction?.id !== item.id) this.popup.remove();
          });
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            this.focusAttraction(item);
          });
          this.markerStore.set(item.id, { marker, element, item });
        });
      },

      showHoverCard(item) {
        const category = CATEGORY_MAP[item.category];
        const tags = item.highlights.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
        this.popup
          .setLngLat(item.coordinates)
          .setHTML(`<article class="hover-card is-${escapeHtml(item.category)}"><div class="hover-card-head"><span class="hover-icon">${escapeHtml(category.icon)}</span><span class="hover-place">${escapeHtml(item.province)} · ${escapeHtml(item.city)}</span><span class="hover-score">★ ${item.rating.toFixed(1)}</span></div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.summary)}</p><div class="hover-tags">${tags}</div><div class="hover-foot"><span>建议游览</span><strong>${escapeHtml(item.visitTime)}</strong></div></article>`)
          .addTo(this.map);
      },

      focusAttraction(item) {
        if (!item || !this.map) return;
        this.activeCategory = "all";
        this.selectedAttraction = item;
        this.searchQuery = item.name;
        this.showSuggestions = false;
        this.map.flyTo({ center: item.coordinates, zoom: 11.8, pitch: 42, bearing: -10, speed: 1.25, curve: 1.35, essential: true });
        window.setTimeout(() => this.showHoverCard(item), 750);
      },

      searchFirst() {
        if (this.suggestions.length) this.focusAttraction(this.suggestions[0]);
      },

      clearSearch() {
        this.searchQuery = "";
        this.showSuggestions = false;
        this.selectedAttraction = null;
        if (this.popup) this.popup.remove();
      },

      resetView() {
        if (!this.map) return;
        this.selectedAttraction = null;
        this.searchQuery = "";
        this.activeCategory = "all";
        this.popup.remove();
        this.fitChinaView(800);
      },

      fitChinaView(duration) {
        this.map.fitBounds(CHINA_BOUNDS, {
          padding: { top: 72, right: 42, bottom: 48, left: 42 },
          maxZoom: 4.35,
          pitch: 0,
          bearing: 0,
          duration,
          essential: true,
        });
      },

      updateMarkerVisibility() {
        this.markerStore.forEach(({ element, item }) => {
          const visible = this.activeCategory === "all" || item.category === this.activeCategory;
          element.classList.toggle("is-hidden", !visible);
        });
        if (this.selectedAttraction && this.activeCategory !== "all" && this.selectedAttraction.category !== this.activeCategory) {
          this.selectedAttraction = null;
          this.popup.remove();
        }
      },

      categoryCount(category) {
        if (category === "all") return this.attractions.length;
        return this.attractions.filter((item) => item.category === category).length;
      },

      resizeMap() {
        if (this.map) this.map.resize();
      },

      startNavigation(item) {
        if (!item || !this.map) return;
        this.navigation.active = true;
        this.navigation.end = { lng: item.coordinates[0], lat: item.coordinates[1], label: item.name };
        this.navigation.start = null;
        this.navigation.error = null;
        this.navigation.steps = [];
        this.navigation.summary = null;
        this.navigation.showAttractionPicker = false;
        this.locateMe();
      },

      locateMe() {
        if (!("geolocation" in navigator)) {
          this.navigation.phase = "error";
          this.navigation.error = "当前浏览器不支持定位，请手动选择起点";
          return;
        }
        this.navigation.phase = "locating";
        this.navigation.error = null;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { longitude, latitude } = pos.coords;
            this.setNavigationStart({ lng: longitude, lat: latitude, label: "我的位置" });
            this.planRoute();
          },
          (err) => {
            this.navigation.phase = "error";
            this.navigation.error = err.code === err.PERMISSION_DENIED
              ? "定位权限被拒绝，请手动选择起点"
              : "定位失败，请手动选择起点";
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
      },

      pickOnMap() {
        this.navigation.pickingStart = true;
        this.navigation.error = null;
        this.map.getCanvas().style.cursor = "crosshair";
      },

      chooseAttractionStart(item) {
        if (!item) return;
        this.setNavigationStart({ lng: item.coordinates[0], lat: item.coordinates[1], label: item.name });
        this.navigation.showAttractionPicker = false;
        this.planRoute();
      },

      setNavigationStart(start) {
        this.navigation.start = start;
      },

      planRoute() {
        const { start, end, profile } = this.navigation;
        if (!start || !end) return;
        this.navigation.phase = "planning";
        this.navigation.error = null;
        NAVIGATION_SERVICE.fetchRoute(profile, start, end)
          .then((route) => {
            this.navigation.route = route;
            this.navigation.summary = { distance: route.distance, duration: route.duration };
            this.navigation.steps = route.steps;
            this.navigation.phase = "ready";
            this.drawRoute(route.geometry);
            this.fitRouteView(start, end);
          })
          .catch((err) => {
            this.navigation.phase = "error";
            this.navigation.error = err.message || "路线规划失败";
            this.clearRouteLayer();
          });
      },

      drawRoute(geometry) {
        if (!this.map || !geometry) return;
        const feature = { type: "Feature", geometry, properties: {} };
        if (this.map.getSource("route-line")) {
          this.map.getSource("route-line").setData(feature);
        } else {
          this.map.addSource("route-line", { type: "geojson", data: feature });
          this.map.addLayer({
            id: "route-line-layer",
            type: "line",
            source: "route-line",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#7257e8", "line-width": 4, "line-opacity": 0.85 },
          });
        }
        this.drawStartMarker();
      },

      drawStartMarker() {
        const { start } = this.navigation;
        if (!start || !this.map) return;
        if (this.navigation.startMarker) this.navigation.startMarker.remove();
        const element = document.createElement("div");
        element.className = "route-start-marker";
        this.navigation.startMarker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([start.lng, start.lat])
          .addTo(this.map);
      },

      fitRouteView(start, end) {
        if (!this.map) return;
        const mobile = window.innerWidth < 800;
        this.map.fitBounds([[start.lng, start.lat], [end.lng, end.lat]], {
          padding: mobile
            ? { top: 60, right: 40, bottom: 320, left: 40 }
            : { top: 90, right: 90, bottom: 80, left: 340 },
          maxZoom: 12,
          duration: 700,
          essential: true,
        });
      },

      clearRouteLayer() {
        if (!this.map) return;
        if (this.map.getLayer("route-line-layer")) this.map.removeLayer("route-line-layer");
        if (this.map.getSource("route-line")) this.map.removeSource("route-line");
        if (this.navigation.startMarker) {
          this.navigation.startMarker.remove();
          this.navigation.startMarker = null;
        }
      },

      clearNavigation() {
        this.clearRouteLayer();
        this.navigation.active = false;
        this.navigation.pickingStart = false;
        this.navigation.start = null;
        this.navigation.end = null;
        this.navigation.route = null;
        this.navigation.summary = null;
        this.navigation.steps = [];
        this.navigation.error = null;
        this.navigation.phase = "idle";
        this.navigation.showAttractionPicker = false;
        if (this.map) this.map.getCanvas().style.cursor = "";
      },

      switchProfile(profile) {
        if (this.navigation.profile === profile) return;
        this.navigation.profile = profile;
        if (this.navigation.start && this.navigation.end) this.planRoute();
      },

      navInstruction(step) {
        return NAVIGATION_SERVICE.instructionText(step);
      },

      navDistance(meters) {
        return NAVIGATION_SERVICE.formatDistance(meters);
      },

      navDuration(seconds) {
        return NAVIGATION_SERVICE.formatDuration(seconds);
      },
    },
  }).mount("#app");
})();
