/* OSRM 路线规划服务层：负责拼装请求、调用开源 OSRM 服务、格式化结果与生成中文导航指令。 */
window.NAVIGATION_SERVICE = (function () {
  "use strict";

  const OSRM_BASE = "https://router.project-osrm.org/route/v1";

  // 出行方式 → OSRM profile
  const PROFILES = {
    driving: "driving",
    cycling: "bike",
  };

  // 转向修饰词的中文翻译
  const TURN_TEXT = {
    uturn: "掉头",
    "sharp right": "急右转",
    right: "右转",
    "slight right": "稍向右转",
    straight: "直行",
    "slight left": "稍向左转",
    left: "左转",
    "sharp left": "急左转",
  };

  // 无修饰词或特殊 maneuver 类型的中文翻译
  const TYPE_TEXT = {
    depart: "从起点出发",
    arrive: "到达目的地",
    merge: "并入",
    "on ramp": "上匝道",
    "off ramp": "下匝道",
    "new name": "继续直行",
    continue: "直行",
    "end of road": "到达道路尽头",
    roundabout: "进入环岛",
    rotary: "进入环岛",
    "roundabout turn": "在环岛",
    "exit roundabout": "驶出环岛",
  };

  function buildUrl(profile, start, end) {
    const coord = (point) => `${point.lng},${point.lat}`;
    const resolved = PROFILES[profile] || "driving";
    return `${OSRM_BASE}/${resolved}/${coord(start)};${coord(end)}?overview=full&geometries=geojson&steps=true&annotations=duration,distance`;
  }

  async function fetchRoute(profile, start, end) {
    let response;
    try {
      response = await fetch(buildUrl(profile, start, end));
    } catch (err) {
      throw new Error("无法连接路线服务，请检查网络后重试");
    }

    if (!response.ok) {
      if (response.status === 429) throw new Error("路线服务请求过于频繁，请稍后重试");
      throw new Error(`路线服务返回异常（${response.status}）`);
    }

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes || !data.routes.length) {
      throw new Error("该区域暂无可用路线，请更换起点或出行方式");
    }

    const route = data.routes[0];
    const steps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      steps,
    };
  }

  function formatDuration(seconds) {
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
    return `约 ${minutes} 分钟`;
  }

  function formatDistance(meters) {
    if (meters >= 1000) {
      const km = meters / 1000;
      return km >= 10 ? `${Math.round(km)} 公里` : `${km.toFixed(1)} 公里`;
    }
    return `${Math.round(meters)} 米`;
  }

  // 将单个步骤翻译为中文指令，例如「左转进入长安街」「沿中山路直行」
  function instructionText(step) {
    const maneuver = step.maneuver || {};
    const type = maneuver.type || "";
    const modifier = maneuver.modifier || "";
    const name = (step.name || "").trim();

    let action;
    if (type === "depart") action = TYPE_TEXT.depart;
    else if (type === "arrive") action = TYPE_TEXT.arrive;
    else if (type === "turn") action = TURN_TEXT[modifier] || "转向";
    else if (type === "roundabout" || type === "rotary" || type === "roundabout turn") action = TYPE_TEXT.roundabout;
    else if (type === "exit roundabout") action = TYPE_TEXT["exit roundabout"];
    else if (type === "merge") action = TYPE_TEXT.merge;
    else if (type === "on ramp" || type === "off ramp") action = TYPE_TEXT[type];
    else if (type === "new name" || type === "continue") {
      action = modifier === "straight" || !modifier ? TYPE_TEXT.continue : TURN_TEXT[modifier] || TYPE_TEXT.continue;
    } else if (type === "fork") {
      action = modifier && modifier !== "straight" ? `沿岔路${TURN_TEXT[modifier] || ""}` : "沿岔路直行";
    } else if (type === "end of road") {
      action = TURN_TEXT[modifier] || TYPE_TEXT["end of road"];
    } else {
      action = TYPE_TEXT[type] || "继续前行";
    }

    if (name && action !== TYPE_TEXT.depart && action !== TYPE_TEXT.arrive) {
      if (type === "new name" || type === "continue") return `沿${name}${action}`;
      return `${action}进入${name}`;
    }
    return action;
  }

  return {
    buildUrl,
    fetchRoute,
    formatDuration,
    formatDistance,
    instructionText,
  };
})();
