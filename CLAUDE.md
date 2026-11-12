# CLAUDE.md — taiwan-stargazing-map（台灣觀星地圖）

`taiwan-trail-map`（台灣自然步道地圖）系列的姊妹專案（2026-11-12 建立，使用者選了建議清單中的「台灣觀星地圖」）。3D 台灣（地形沿用賞鳥地圖），**時間軸是日期**（年＋月＋當月每天，每格畫月相）：用天文公式算當晚月相、月出月落、天文昏影、無月暗夜時數、銀河核心可見時段，結合各點光害等級（本工具估計）與當月晴夜機會（粗估）→ 15 個觀星點的觀星指數 1～5；流星雨（IMO 2026 年曆）、「下一個好夜晚」搜尋。畫面是**夜空星圖風**（深藍＋金色細線、Noto Serif TC；淺色＝紙本星圖面板），整張地圖是夜景：月光亮度跟月相、城市光害光暈（「光害圖層」）、點觀星點會轉到**面向南方**的低視角看星空、canvas 畫的銀河帶（亮度依當晚銀河核心可見時數與暗夜）、依月相畫的月亮、流星雨期間流星。**不放照片**。無框架、無建置。

## 天文計算（重要）
- `astro.js`（`window.AS`）**自行實作，不依賴外部函式庫**（下載 astronomy-engine 到本機執行被 auto mode 擋，改自寫）：太陽＝天文年鑑低精度公式、月亮＝Meeus 低精度（黃經約 0.3°，含視差），每 5 分鐘取樣當天中午～隔天中午。`AS.night(y,m,d,lat,lon)` 有快取，回傳 `illum/waxing/age/phase/dusk/dawn/mrise/mset/darkH/darkFrom/darkTo/gcH/gcFrom/gcTo`。暗夜＝太陽 < −18° 且（月亮在地平線下或照明 < 6%）；銀河核心＝人馬座 A* 高度 > 10° 且在暗夜。驗證：2026-11-09 新月、11-24 滿月、8-12 新月（英仙座）吻合；台北 11 月天文昏影約 18:30。
- 「今晚」＝台灣時間清晨 6 點前算前一晚。

## 資料
- `data.js`（`window.SM`）：`REGIONS / LP（光害 1～5，本工具估計）/ WXTYPES（ne wd my tn ty fg 海霧 fl 漁船燈光）/ WX / TYPES / SPOTS / SHOWERS / CITIES（光害示意）/ ETIQUETTE / GLOSSARY / PEAKS / ISLANDS`。
- **觀星點 15 個**（2026-11 網搜查證）：陽明山冷水坑、拉拉山（**2026-10 取得國際暗空勝地 Urban Night Sky Place，全台首座**）、武陵農場、合歡山暗空公園鳶峰＋武嶺（**2019 台灣第一座國際暗空公園、2022 升銀級，範圍台14甲 22.1K～37.1K**）、小雪山、塔塔加、恆春龍磐（屏東以社頂、佳樂水爭取「暗空小鎮」**申請中**）、台東鹿野高台（二星等）、加路蘭／池上大波池／三仙台（一星等）、綠島帆船鼻（二星等）、澎湖七美（暗空協會曾列推動地點）、馬祖大坵（申請暗空、光害管制條例，**結果未查到**）。`cert` 欄寫狀態，未確認的一律寫「以官方公告為準」。
- `SM.score(p,y,m,d)`：`site=(6-lp)/5`、`dark=min(1,darkH/6)`、`v=site×(.22+.78×dark)×晴夜係數＋銀河加分`，`score=round(1+4.4v)`。晴夜係數：ne .55（花東 .7、elev≥2500 .85）、my .6、ty .8、tn .85（elev≥2000 .9）、wd .8、fg .7、fl .8。
- 改資料後重產手冊：`node tools/build_manual.js . tools/manual_tpl.html [年份]`（**manual.html 是產出檔**，含當年每月最暗一晚表＋15×12 指數表＋流星雨表＋認證清單）。

## 程式
- **`scene.js` 是產出檔**：改 `tools/scene_tpl.js`，再跑 `python tools/build_scene.py ../taiwan-flower-map/scene.js`。樣板覆寫了 `S.overview`（polar .78）與 `S.focusSpot`（距離 3.2、polar 1.42、target 抬高 .7，並把鏡頭放在北邊**面向南**，因為銀河帶與月亮是放在南方天空的示意）。`controls.maxPolarAngle = 1.5`。
- 銀河是 canvas 畫的長條貼圖（亮核心＋暗帶＋細星），掛在南方天空的平面上（`sky.mw`）；用點雲畫會變成一團團白霧，別改回去。
- 測試前若改了 scene.js，瀏覽器常用快取：先 `fetch('scene.js',{cache:'reload'})` 或 unregister SW。
- `app.js`：測試 hook `window.__star`（`state/setDate/shiftDay/selectSpot/selectRegion/setLayer/nextGood/SM/AS/scene`）；`scene.stats()` 有 `illum/darkH/gcH/mw/meteorRate`。

## 配套
- ✅ 跑馬燈（`taiwanStarMarquee`）、manual、使用警語（底部＋首訪自動跳，`taiwanStarSeenWarning`）、⚙常用設定收合式（`taiwanStarSettings`；展開 `taiwanStarSetOpen`）、偏好 `taiwanStarPrefs`、PWA（改 js 記得 `CACHE_NAME` +1）、訪客計數器 `page_id=m255525.taiwanstargazingmap`、RWD（375px 無橫向捲動；手機日期條可橫向捲動）。
- ❌ 序號授權
- GitHub Pages（**2026-11-12 已上線**）：`master`＋`.github/workflows/deploy-pages.yml`，https://m255525.github.io/taiwan-stargazing-map/ （repo 由使用者自己 `gh repo create`，Pages 由 Claude 用 `gh api` 開啟；push 觸發的部署即會成功）。

## Port／測試
- port **8872**（`.claude/launch.json` 的 `taiwan-stargazing-map`）。
- 驗證：`__star.setDate(2026,8,12); selectSpot('yuanfeng')` → 新月、gcH≈4.6、meteorRate 100、看得到銀河；`setDate(2026,11,26)` → 虧凸月、darkH≈0、指數多為 2；console 無錯誤；375px `scrollWidth===clientWidth`。
