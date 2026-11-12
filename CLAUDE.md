# CLAUDE.md — taiwan-stargazing-map（台灣觀星地圖）

`taiwan-trail-map`（台灣自然步道地圖）系列的姊妹專案（2026-11-12 建立，使用者選了建議清單中的「台灣觀星地圖」）。3D 台灣（地形沿用賞鳥地圖），**時間軸是日期**（年＋月＋當月每天，每格畫月相）：用天文公式算當晚月相、月出月落、天文昏影、無月暗夜時數、銀河核心可見時段，結合各點光害等級（本工具估計）與當月晴夜機會（粗估）→ 15 個觀星點的觀星指數 1～5；流星雨（IMO 2026 年曆）、「下一個好夜晚」搜尋。畫面是**夜空星圖風**（深藍＋金色細線、Noto Serif TC；淺色＝紙本星圖面板），整張地圖是夜景：月光亮度跟月相、城市光害光暈（「光害圖層」）、點觀星點會轉到**面向南方**的低視角，可按「仰望星空」抬頭看依日期＋時間＋緯度轉動的天球（真實亮星、星座連線、沿銀道的銀河帶、月亮與行星實際位置）、流星雨期間流星；另有觀星護照（本機紀錄＋印章＋徽章）。**不放照片**。無框架、無建置。

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
- **天球**（`sky.cel`）：子物件都在赤道座標（J2000），`applySky()` 依 `AS.lst` 與緯度設旋轉矩陣（列：`[-sinL,cosL,0]、[cosφcosL,cosφsinL,sinφ]、[sinφcosL,sinφsinL,-cosφ]`，地平座標 x＝東、y＝天頂、z＝南），整組每幀跟著鏡頭位置（無限遠），`renderer.localClippingEnabled`＋`sky.clip` 平面切掉地平線以下。亮星／星座在 `data.js` 的 `SM.STARS / SM.CONSTS`（102 顆、16 組）。天空文字 `.skylab` 只在鏡頭仰角夠（polar > 1.2）時顯示。
- 銀河是 canvas 畫的 4096×512 貼圖（亮核心＋暗帶＋細星），貼在沿銀道的帶狀網格（銀經 ±180°、銀緯 ±20°，`galVec()` 用 IAU 轉換矩陣）；用點雲畫會變成一團團白霧，別改回去。
- **仰望星空** `S.lookUp(on)`：maxPolarAngle 暫放到 2.4、鏡頭在觀星點北側往南抬頭約 12°；`focusSpot/overview/focusRegion` 會 `endLookUp()`。俯瞰全台與地區一律北方朝上（`northUp()`），不沿用觀星點面向南方的方位。
- 3D 星空時間：`app.js` 的 `st.skyMs`（null＝預設：今晚的現在，或銀河／暗夜中點）、`skyBox()` 滑桿 18:00～06:00、`pushSky()` → `StarScene.setSky(ms, lat, lon)`；換日期會重設。驗證：8/12 21:00 鳶峰 gcAlt≈36°、可見天蠍座／人馬座；1/15 22:00 龍磐看得到老人星。
- 測試前若改了 scene.js，瀏覽器常用快取：先 `fetch('scene.js',{cache:'reload'})` 或 unregister SW。
- `AS.night()` 另回傳 `t0/step/samp{sun,moon,gc}`（當天中午起每 5 分鐘的高度），給面板的**逐小時時間軸**（`timeline()`，18:00～06:00 四條色帶＋現在紅線）。
- **分享連結**：`#d=YYYY-MM-DD&s=spotId`，啟動時優先於記住的設定，`save()` 用 `replaceState` 隨時同步網址；🔗 分享（`navigator.share` 或剪貼簿）、📅 `.ics`（無月暗夜時段、`-PT3H` 提醒、RFC 5545 折行）。
- **下一個好夜晚**：選了觀星點時改用 `spotCands()`（60 天內該點最高指數、優先暗夜 ≥ 4h），面板顯示前 3 晚；光害 4 的點最高只到 2～3，所以不能用固定門檻 5。
- **行星**：`astro.js` 的 `AS.planetPos / AS.planets(y,m,d,lat,lon)`（JPL 近似軌道根數＋Mallama 星等，太陽 < −6° 且高度 > 4°／8° 算可見，每 10 分鐘取樣、有快取）；面板 `planetBox()`。驗證：2026-01-10 木星衝角距 179.7°、10-04 土星衝 177°、08-15 金星東大距 45.9°、01-09 火星合日 0.9°。
- **雲量預報**：`fcFetch()` 一次查 15 點 Open-Meteo（`past_days=1&forecast_days=8`，帶 `elevation`），快取 `taiwanStarForecast` 1 小時（6 小時內仍可用）；設定 `SM.fcNight(p, night)` 後 `SM.score` 改用雲量係數 `SM.cloudF`（取代氣候晴夜機會），回傳 `r.fc{cloud,tmin,src}`；時間軸多「雲量」列、兩週格子底線＝預報。讀不到就退回氣候粗估。需標示 Open-Meteo（CC BY 4.0）。
- **觀星護照**：`taiwanStarLog`（陣列 `{id,date,spot,saw[],met,rate,note,at}`，spot 可為 `other`），`BADGES` 11 個成就、印章牆、匯出／匯入 JSON（匯入會過濾欄位、依 id 去重）；Esc 先關最上層對話框。
- **紅光夜視模式**：`#redveil` 全螢幕 `mix-blend-mode:multiply` 暗紅遮罩（z-index 99999，含 3D 與對話框），`set.red`，上方按鈕與⚙皆可切。
- `app.js`：測試 hook `window.__star`（`state/setDate/shiftDay/selectSpot/selectRegion/setLayer/nextGood/logs/openLog/renderPass/setSkyIdx/skyNow/toggleLook/fcFetch/fc/planetBox/spotCands/shareUrl/shareText/buildIcs/toast/SM/AS/scene`）；`scene.stats()` 有 `illum/darkH/gcH/mw/meteorRate`。

## 配套
- ✅ 跑馬燈（`taiwanStarMarquee`）、manual、使用警語（底部＋首訪自動跳，`taiwanStarSeenWarning`）、⚙常用設定收合式（`taiwanStarSettings`；展開 `taiwanStarSetOpen`）、偏好 `taiwanStarPrefs`、PWA（改 js 記得 `CACHE_NAME` +1）、訪客計數器 `page_id=m255525.taiwanstargazingmap`、RWD（375px 無橫向捲動；手機日期條可橫向捲動）。
- ❌ 序號授權
- GitHub Pages（**2026-11-12 已上線**）：`master`＋`.github/workflows/deploy-pages.yml`，https://m255525.github.io/taiwan-stargazing-map/ （repo 由使用者自己 `gh repo create`，Pages 由 Claude 用 `gh api` 開啟；push 觸發的部署即會成功）。

## Port／測試
- port **8872**（`.claude/launch.json` 的 `taiwan-stargazing-map`）。
- 驗證：`__star.setDate(2026,8,12); selectSpot('yuanfeng')` → 新月、gcH≈4.6、meteorRate 100、看得到銀河；`setDate(2026,11,26)` → 虧凸月、darkH≈0、指數多為 2；console 無錯誤；375px `scrollWidth===clientWidth`。
