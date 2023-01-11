function safeLocalStorage(name, data) {
  try {
    if (name === "portalDataCurrent") {
      // save at most every 450ms. Stringify is too expensive to run at max speed in timewarp, but still save every zone in liq otherwise
      if ((new Date() - lastSave) / 450 < 1) return
      else lastSave = new Date();
    }
    if (typeof data != "string") data = JSON.stringify(data);
    localStorage.setItem(name, data);
  } catch (e) {
    if (e.code == 22 || e.code == 1014) { // 
      // Storage full, delete oldest portal from history, and try again
      delete portalSaveData[Object.keys(portalSaveData)[0]];
      savePortalData(true);
      safeLocalStorage(name, data)
      console.debug("AT Graphs Error: LocalStorage is full. Automatically deleting a graph to clear up space.", e.code, e);
    }
  }
}

// Save Portal Data to history, or current only
function savePortalData(saveAll = true) {
  var currentPortal = getportalID();
  if (saveAll) {
    safeLocalStorage("portalDataHistory", LZString.compressToBase64(JSON.stringify(portalSaveData)))
  }
  else {
    let portalObj = {}
    portalObj[currentPortal] = portalSaveData[currentPortal];
    safeLocalStorage("portalDataCurrent", portalObj)
  }
}

// Save settings, with or without updating a key
function saveSetting(key, value) {
  if (key !== null && value !== null) GRAPHSETTINGS[key] = value;
  safeLocalStorage("GRAPHSETTINGS", GRAPHSETTINGS);
}

// Create all of the UI elements and load in scripts needed
// TODO reduce screaming
function init() {
  var head = document.getElementsByTagName("head")[0]

  var chartscript = document.createElement("script");
  chartscript.type = "text/javascript";
  chartscript.src = "https://code.highcharts.com/highcharts.js";
  head.appendChild(chartscript);

  var graphsButton = document.createElement("TD");
  graphsButton.appendChild(document.createTextNode("Graphs"))
  graphsButton.setAttribute("class", "btn btn-default")
  graphsButton.setAttribute("onclick", "autoToggleGraph(); drawGraph(); swapGraphUniverse();");

  var settingbarRow = document.getElementById("settingsTable").firstElementChild.firstElementChild;
  settingbarRow.insertBefore(graphsButton, settingbarRow.childNodes[10])

  document.getElementById("settingsRow").innerHTML += `
        <div id="graphParent" style="display: none; height: 600px; overflow: auto; position: relative;">
            <div id="graph" style="margin-bottom: 10px;margin-top: 5px; height: 530px;"></div>
            <div id="graphFooter" style="height: 50px;font-size: 1em;">
                <div id="graphFooterLine1" style="display: -webkit-flex;flex: 0.75;flex-direction: row; height:30px;"></div>
                <div id="graphFooterLine2"></div>
            </div>
        </div>
        `;

  function createSelector(id, sourceList, textMod = "", onchangeMod = "") {
    let selector = document.createElement("select");
    selector.id = id;
    selector.setAttribute("style", "");
    selector.setAttribute("onchange", "saveSetting(this.id, this.value); drawGraph();" + onchangeMod);
    for (var item of sourceList) {
      let opt = document.createElement("option");
      opt.value = item;
      opt.text = textMod + item;
      selector.appendChild(opt);
    }
    selector.value = GRAPHSETTINGS[selector.id]
    return selector;
  }

  // Create Universe and Graph selectors
  var universeFooter = document.getElementById("graphFooterLine1");
  [
    ["universeSelection", [1, 2], "Universe ", " swapGraphUniverse();"],
    ["u1graphSelection", graphList.filter((g) => g.universe == 1 || !g.universe).map((g) => g.selectorText)],
    ["u2graphSelection", graphList.filter((g) => g.universe == 2 || !g.universe).map((g) => g.selectorText)]
  ].forEach((opts) => universeFooter.appendChild(createSelector(...opts)))

  universeFooter.innerHTML += `
    <div><button onclick="drawGraph()" style="margin-left:0.5em;">Refresh</button></div>
    <div style="flex:0 100 5%;"></div>
    <div><input type="checkbox" id="clrChkbox" onclick="toggleClearButton();"></div>
    <div style="margin-left: 0.5vw;">
      <button id="clrAllDataBtn" onclick="clearData(null,true); drawGraph();" class="btn" disabled="" style="flex:auto; padding: 2px 6px;border: 1px solid white;">
        Clear All Previous Data</button></div>
    <div style="flex:0 100 5%;"></div>
    <div style="flex:0 2 3.5vw;"><input style="width:100%;min-width: 40px;" id="deleteSpecificTextBox"></div>
    <div style="flex:auto; margin-left: 0.5vw;"><button onclick="deleteSpecific(); drawGraph();">Delete Specific Portal</button></div>
    <div style="float:right; margin-right: 0.5vw;"><button onclick="toggleSpecificGraphs()">Invert Selection</button></div>
    <div style="float:right; margin-right: 1vw;"><button onclick="toggleAllGraphs()">All Off/On</button></div>`

  // AAAAAAAAAAAAAAAAAAAAAAAAAAAA (Setting the inner HTML of the parent element resets the value of these? what the fuck)
  document.querySelector("#universeSelection").value = GRAPHSETTINGS.universeSelection
  document.querySelector("#u1graphSelection").value = GRAPHSETTINGS.u1graphSelection
  document.querySelector("#u2graphSelection").value = GRAPHSETTINGS.u2graphSelection

  let tipsText = "You can zoom by dragging a box around an area. You can turn portals off by clicking them on the legend. Quickly view the last portal by clicking it off, then Invert Selection. Or by clicking All Off, then clicking the portal on. To delete a portal, Type its portal number in the box and press Delete Specific. Using negative numbers in the Delete Specific box will KEEP that many portals (starting counting backwards from the current one), ie: if you have Portals 1000-1015, typing -10 will keep 1005-1015."
  document.getElementById("graphFooterLine2").innerHTML += `
    <span style="float: left;" onmouseover='tooltip("Tips", "customText", event, "${tipsText}")' onmouseout='tooltip("hide")'>Tips: Hover for usage tips.</span>
    <input onclick="toggleDarkGraphs()" style="height: 20px; float: right; margin-right: 0.5vw;" type="checkbox" id="blackCB">
    <span style="float: right; margin-right: 0.5vw;">Black Graphs:</span>
    `;

  // Add a header with negative float hanging down on the top of the graph, for toggle buttons
  var toggleDiv = document.createElement("div");
  toggleDiv.id = "toggleDiv";
  toggleDiv.setAttribute("style", "position: absolute; top: 1rem; left: 3rem; z-index: 1;")
  toggleDiv.innerText = ""
  document.querySelector("#graphParent").appendChild(toggleDiv);


  // Handle Dark Graphs?  Old code
  MODULES.graphs.themeChanged = function () {
    if (game && game.options.menu.darkTheme.enabled != lastTheme) {
      function f(h) {
        h.style.color = 2 == game.options.menu.darkTheme.enabled ? "" : "black";
      }
      function g(h) {
        if ("graphSelection" == h.id) return void (2 != game.options.menu.darkTheme.enabled && (h.style.color = "black"));
      }
      toggleDarkGraphs();
      var c = document.getElementsByTagName("input");
      var d = document.getElementsByTagName("select");
      var e = document.getElementById("graphFooterLine1").children;
      for (let h of c) f(h);
      for (let h of d) f(h);
      for (let h of e) f(h);
      for (let h of e) g(h);
    }
    game && (lastTheme = game.options.menu.darkTheme.enabled);
  }

  MODULES.graphs.themeChanged();
  document.querySelector("#blackCB").checked = GRAPHSETTINGS.darkTheme
}

// Graph constructor 
function Graph(dataVar, universe, selectorText, additionalParams = {}) {
  // graphTitle, customFunction, useAccumulator, xTitle, yTitle, formatter, xminFloor, yminFloor, yType
  this.dataVar = dataVar
  this.universe = universe; // false, 1, 2
  this.selectorText = selectorText ? selectorText : dataVar;
  this.id = selectorText.replace(/ /g, "_")
  this.graphTitle = this.selectorText;
  this.graphType = "line"
  this.customFunction;
  this.useAccumulator;
  this.xTitle = "Zone";
  this.yTitle = this.selectorText;
  this.formatter;
  this.xminFloor = 1;
  this.yminFloor;
  this.yType = "Linear";
  this.graphData = [];
  this.typeCheck = "number"
  this.conditional = () => { return true };
  for (const [key, value] of Object.entries(additionalParams)) {
    this[key] = value;
  }
  this.baseGraphTitle = this.graphTitle;

  // create an object to pass to Highcharts.Chart
  this.createHighChartsObj = function () {
    // TODO BUGS Max values sometimes clip
    return {
      chart: {
        renderTo: "graph",
        zoomType: "xy",
        animation: false,
        resetZoomButton: {
          position: {
            align: "right",
            verticalAlign: "top",
            x: -20,
            y: 15,
          },
          relativeTo: "chart",
        },
      },
      colors: ["#e60049", "#0bb4ff", "#50e991", "#e6d800", "#9b19f5", "#ffa300", "#dc0ab4", "#b3d4ff", "#00bfa0"],
      title: {
        text: this.graphTitle,
        x: -20,
      },
      plotOptions: {
        series: {
          lineWidth: 1,
          animation: false,
          marker: {
            enabled: false,
          },
        },
      },
      xAxis: {
        floor: this.xminFloor,
        title: {
          text: this.xTitle,
        },
      },
      yAxis: {
        floor: this.yminFloor,
        title: {
          text: this.yTitle,
        },
        plotLines: [
          {
            value: 0,
            width: 1,
            color: "#808080",
          },
        ],
        type: this.yType,
        labels: {
          formatter: function () {
            // These are Trimps format functions for durations(modified) and numbers, respectively
            if (this.dateTimeLabelFormat) return formatDuration(this.value / 1000)
            else return prettify(this.value);
          }
        }
      },
      tooltip: {
        pointFormatter: this.formatter,
      },
      legend: {
        layout: "vertical",
        align: "right",
        verticalAlign: "middle",
        borderWidth: 0,
      },
      series: this.graphData,
      additionalParams: {},
    }
  }
  // Main Graphing function
  this.updateGraph = function () {
    if (this.graphType == "line") this.lineGraph();
    if (this.graphType == "column") this.columnGraph();
    this.formatter = this.formatter
      || function () {
        var ser = this.series; // 'this' being the highcharts object that uses formatter()
        return '<span style="color:' + ser.color + '" >●</span> ' + ser.name + ": <b>" + prettify(this.y) + "</b><br>";
      };
    saveSelectedGraphs();
    chart1 = new Highcharts.Chart(this.createHighChartsObj());
    applyRememberedSelections();
  }
  // prepares data series for Highcharts, and optionally transforms it with toggled options, customFunction and/or useAccumulator
  this.lineGraph = function () {
    var item = this.dataVar;
    this.graphData = [];
    // TODO all of the ugliness with restting to 'defaults' can be avoided if toggles modify the highcharts object instead of the graph object.
    this.graphTitle = this.baseGraphTitle;
    this.yTitle = this.selectorText;
    if (item === "currentTime") { // TODO This is the ugliest way to handle this, but it's a one off, shoot me.  Resets this graph to defaults.
      this.yType = "datetime"
      this.formatter = formatters.datetime;
      this.useAccumulator = false;
    }
    var maxS3 = Math.max(...Object.values(portalSaveData).map((portal) => portal.s3).filter((s3) => s3));
    var activeToggles = [];
    if (this.toggles) {
      // create save space for the toggles if they don't exist (TODO should this really go here?)
      if (GRAPHSETTINGS.toggles[this.id] === undefined) { GRAPHSETTINGS.toggles[this.id] = {} }
      this.toggles.forEach((toggle) => {
        if (GRAPHSETTINGS.toggles[this.id][toggle] === undefined) { GRAPHSETTINGS.toggles[this.id][toggle] = false }
      })
      activeToggles = Object.keys(toggleProperties).filter(toggle => GRAPHSETTINGS.toggles[this.id][toggle])
      activeToggles.forEach(toggle => toggleProperties[toggle].graphMods(this));
    }
    // parse data per portal
    for (const portal of Object.values(portalSaveData)) {
      if (!(item in portal.perZoneData)) continue; // ignore blank
      if (portal.universe != GRAPHSETTINGS.universeSelection) continue; // ignore inactive universe
      let cleanData = [];
      // parse the requested datavar
      for (const index in portal.perZoneData[item]) {
        let x = portal.perZoneData[item][index];
        let time = portal.perZoneData.currentTime[index];
        if (typeof this.customFunction === "function") {
          x = this.customFunction(portal, index);
          if (x < 0) x = null;
        }
        // TOGGLES
        // Apply the toggled functions to the data. Order matters.
        if (activeToggles.includes("perZone")) {  // must be first in these checks
          this.useAccumulator = false; // TODO this might be incredibly stupid, find out later when you use this option for a different case!
          if (portal.perZoneData[item][index - 1] && portal.perZoneData[item][index]) { // check for missing data, or start of data
            x = portal.perZoneData[item][index] - portal.perZoneData[item][index - 1]
            time = portal.perZoneData.currentTime[index] - portal.perZoneData.currentTime[index - 1]
          }
          else {
            x = null
            time = null
          }
        }
        if (activeToggles.includes("lifetime")) {
          let initial;
          if (item === "heliumOwned") { initial = portal.totalHelium; }
          if (item === "radonOwned") { initial = portal.totalRadon; }
          if (item === "c23increase") { initial = portal.cinf; }
          if (!initial) {
            debug("Attempted to calc lifetime percent of an unknown type:" + item);
            continue;
          }
          if (item === "c23increase") {
            let totalBonus = (1 + (initial[1] / 100)) * initial[0]; // calc initial cinf            
            let c2 = initial[0];
            let c3 = initial[1];
            portal.universe == 1 ? c2 += x : c3 += x;
            let newBonus = (1 + (c3 / 100)) * c2; // calc final cinf
            x = ((newBonus - totalBonus) / (totalBonus ? totalBonus : 1));
          }
          else { x = x / (initial ? initial : 1) }
        }
        if (activeToggles.includes("perHr")) {
          if (x) { x = x / (time / 3600000) }
        }
        if (activeToggles.includes("s3normalized")) { // special case for radon
          x = x / 1.03 ** portal.s3 * 1.03 ** maxS3
        }
        if (activeToggles.includes("mapCount")) { // special case for maps
          try { x = portal.perZoneData.mapCount[index] || 0; }
          catch { x = 0 }
        }
        if (activeToggles.includes("mapPct")) {
          try { x = portal.perZoneData.timeOnMap[index] / x || 0; }
          catch { x = 0 }
        }
        if (activeToggles.includes("mapTime")) {
          try { x = portal.perZoneData.timeOnMap[index] || 0; }
          catch { x = 0 }
        }
        if (this.useAccumulator) x += cleanData.at(-1) !== undefined ? cleanData.at(-1)[1] : 0;
        if (this.typeCheck && typeof x != this.typeCheck) x = null;
        cleanData.push([Number(index), x]) // highcharts expects number, number, not str, number
      }
      if (activeToggles.includes("perZone") && ["fluffy", "scruffy"].includes(item)) {
        cleanData.splice(cleanData.length - 1); // current zone is too erratic to include due to weird order of granting resources in Trimps
      }
      this.graphData.push({
        name: `Portal ${portal.totalPortals}: ${portal.challenge}`,
        data: cleanData,
      })
    }
  }
  // prepares column data series from per-portal data
  this.columnGraph = function () {
    var item = this.portalVar;
    this.xTitle = "Portal"
    this.graphData = [];
    let cleanData = []
    // future use: test for datavar in portal, or in perZoneData, if you ever want to make column graphs based on max(perZoneData)
    for (const portal of Object.values(portalSaveData)) {
      if (portal.universe == GRAPHSETTINGS.universeSelection) {
        cleanData.push([portal.totalPortals, portal[item]])
      }
    }
    this.graphData.push({
      name: this.yTitle,
      data: cleanData,
      type: "column",
    });
  }
}

// returns _d _h _m _s or _._s
function formatDuration(timeSince) {
  let timeObj = {
    d: Math.floor(timeSince / 86400),
    h: Math.floor(timeSince / 3600) % 24,
    m: Math.floor(timeSince / 60) % 60,
    s: Math.floor(timeSince % 60),
  }
  let milliseconds = Math.floor(timeSince % 1 * 10)
  let timeString = "";
  let unitsUsed = 0
  for (const [unit, value] of Object.entries(timeObj)) {
    if (value === 0 && timeString === "") continue;
    unitsUsed++;
    if (value) timeString += value.toString() + unit + " ";
  }
  if (unitsUsed <= 1) {
    timeString = [timeObj.s.toString().padStart(1, "0"), milliseconds.toString(), "s"].join(".");
  }
  return timeString
}

// Show/hide the universe-specific graph selectors
function swapGraphUniverse() {
  let universe = GRAPHSETTINGS.universeSelection;
  let active = `u${universe}`
  let inactive = `u${universe == 1 ? 2 : 1}`
  document.getElementById(`${active}graphSelection`).style.display = '';
  document.getElementById(`${inactive}graphSelection`).style.display = 'none';
}

// Draws the graph currently selected by the user
function drawGraph() {
  function lookupGraph(selectorText) {
    for (const graph of graphList) {
      if (graph.selectorText === selectorText) return graph;
    }
  }
  // TOGGLES
  function makeCheckbox(graph, toggle) {
    // create checkbox element labeled with the toggle
    var container = document.createElement("span")
    var checkbox = document.createElement("input");
    var label = document.createElement("span");

    container.style.padding = "0rem .5rem";

    checkbox.type = "checkbox";
    checkbox.id = toggle;
    // initialize the checkbox to saved value
    checkbox.checked = GRAPHSETTINGS.toggles[graph][toggle];
    // create a godawful inline function to set saved value on change, apply exclusions, and update the graph
    let funcString = "";
    if (toggleProperties[toggle] && toggleProperties[toggle].exclude) {
      toggleProperties[toggle].exclude.forEach(exTog => funcString += `GRAPHSETTINGS.toggles.${graph}.${exTog} = false; `)
    }
    funcString += `GRAPHSETTINGS.toggles.${graph}.${toggle} = this.checked; drawGraph();`
    checkbox.setAttribute("onclick", funcString);

    label.innerText = toggle;
    label.style.color = "#757575";

    container.appendChild(checkbox)
    container.appendChild(label)
    return container;
  }
  pushData(); // update current zone data on request
  let universe = GRAPHSETTINGS.universeSelection;
  let selectedGraph = document.getElementById(`u${universe}graphSelection`);
  if (selectedGraph.value) {
    // draw the graph
    let graph = lookupGraph(selectedGraph.value);
    graph.updateGraph();
    // create toggle elements
    toggleDiv = document.querySelector("#toggleDiv")
    toggleDiv.innerHTML = "";
    if (graph.toggles) {
      for (const toggle of graph.toggles) {
        toggleDiv.appendChild(makeCheckbox(graph.id, toggle))
      }
    }
  }
  showHideUnusedGraphs();
}

// Stores and updates data for an individual portal
function Portal() {
  this.universe = getGameData.universe();
  this.totalPortals = getTotalPortals();
  this.challenge = getGameData.challengeActive() === 'Daily'
    ? getCurrentChallengePane().split('.')[0].substr(13).slice(0, 16) // names dailies by their start date, only moderately cursed
    : getGameData.challengeActive();
  this.totalNullifium = getGameData.nullifium();
  this.totalVoidMaps = getGameData.totalVoids();
  this.cinf = getGameData.cinf();
  if (this.universe === 1) {
    this.totalHelium = game.global.totalHeliumEarned;
    this.initialFluffy = getGameData.fluffy() - game.stats.bestFluffyExp.value; // adjust for mid-run graph start
    this.initialDE = getGameData.essence();
  }
  if (this.universe === 2) {
    this.totalRadon = game.global.totalRadonEarned;
    this.initialScruffy = getGameData.scruffy() - game.stats.bestFluffyExp2.value; // adjust for mid-run graph start
    this.initialMutes = getGameData.mutatedSeeds();
    this.s3 = getGameData.s3();
  }
  // create an object to collect only the relevant data per zone, without fromEntries because old JS
  this.perZoneData = {};
  var perZoneItems = graphList.filter((graph) =>
    (graph.universe == this.universe || !graph.universe) // only save data relevant to the current universe
    && graph.conditional() && graph.dataVar) // and for relevant challenges, with datavars 
    .map((graph) => graph.dataVar)
    .concat(["currentTime", "mapCount", "timeOnMap"]); // always graph time vars
  perZoneItems.forEach((name) => this.perZoneData[name] = []);

  // update per zone data and special totals
  this.update = function (fromMap) { // check source of the update
    const world = getGameData.world();
    // TODO Nu is a rather fragile stat, assumes recycling everything on portal. Max throughout the run makes it slightly less crappy.
    // It would be better to store an initial value, and compare to final value + recycle value
    this.totalNullifium = Math.max(this.totalNullifium, getGameData.nullifium());
    this.totalVoidMaps = getGameData.totalVoids();
    for (const [name, data] of Object.entries(this.perZoneData)) {
      if (world + 1 < data.length) { // FENCEPOSTING
        data.splice(world + 1) // trim 'future' zones on reload
      }
      if (name === "timeOnMap") {
        let timeOnMap = getGameData.timeOnMap();
        if (fromMap) { data[world] = data[world] + timeOnMap || timeOnMap; } // additive per map within a zone
        continue;
      }
      if (name === "mapCount") {
        if (fromMap && game.global.mapsActive) { data[world] = data[world] + 1 || 1; } // start at 1 because the hook in is before the map is started/finished
        continue;
      }
      data[world] = getGameData[name]();
    }
  }
}

function clearData(keepN, clrall = false) {
  let currentPortalNumber = getTotalPortals();
  if (clrall) {
    for (const [portalID, portalData] of Object.entries(portalSaveData)) {
      if (portalData.totalPortals != currentPortalNumber) {
        delete portalSaveData[portalID];
      }
    }
  } else {
    let totalSaved = Object.keys(portalSaveData).length;
    for (const [portalID, portalData] of Object.entries(portalSaveData)) {
      if (totalSaved > keepN && portalData.totalPortals <= currentPortalNumber - keepN) {
        delete portalSaveData[portalID];
        totalSaved--;
      }
    }
  }
  savePortalData(true)
  showHideUnusedGraphs();
}

function deleteSpecific() {
  let portalNum = Number(document.getElementById("deleteSpecificTextBox").value);
  if (parseInt(portalNum) < 0) { clearData(Math.abs(portalNum)); }
  else {
    for (const [portalID, portalData] of Object.entries(portalSaveData)) {
      if (portalData.totalPortals === portalNum) delete portalSaveData[portalID];
    }
  }
  savePortalData(true)
  showHideUnusedGraphs();
}

// ####### Here begins old code
function toggleClearButton() {
  document.getElementById("clrAllDataBtn").disabled = !document.getElementById("clrChkbox").checked;
}

function toggleDarkGraphs() {
  function removeDarkGraphs() {
    var darkcss = document.getElementById("dark-graph.css");
    darkcss && (document.head.removeChild(darkcss), debug("Removing dark-graph.css file", "graphs"));
  }
  function addDarkGraphs() {
    var darkcss = document.getElementById("dark-graph.css");
    if (!darkcss) {
      var b = document.createElement("link");
      (b.rel = "stylesheet"), (b.type = "text/css"), (b.id = "dark-graph.css"), (b.href = basepath + "dark-graph.css"), document.head.appendChild(b), debug("Adding dark-graph.css file", "graphs");
    }
  }
  if (game) {
    var darkcss = document.getElementById("dark-graph.css")
    var dark = document.getElementById("blackCB").checked;
    saveSetting("darkTheme", dark)
    if ((!darkcss && (0 == game.options.menu.darkTheme.enabled || 2 == game.options.menu.darkTheme.enabled)) || MODULES.graphs.useDarkAlways || dark) {
      addDarkGraphs()
    }
    else {
      if (darkcss && (1 == game.options.menu.darkTheme.enabled || 3 == game.options.menu.darkTheme.enabled || !dark)) {
        removeDarkGraphs();
      }
    }
  }

}
// ####### end scary old code

// Graph Selection 

function saveSelectedGraphs() {
  if (!chart1) return;
  for (let i = 0; i < chart1.series.length; i++) {
    GRAPHSETTINGS.rememberSelected[i] = chart1.series[i].visible;
  }
  saveSetting();
}
function applyRememberedSelections() {
  if (chart1.series.length !== GRAPHSETTINGS.rememberSelected.length) {
    GRAPHSETTINGS.rememberSelected = [] // if the graphlist changes, order is no longer guaranteed
  }
  for (let i = 0; i < chart1.series.length; i++) {
    if (GRAPHSETTINGS.rememberSelected[i] === false) { chart1.series[i].hide(); }
  }
}
function toggleSpecificGraphs() {
  for (const chart of chart1.series) {
    chart.visible ? chart.hide() : chart.show();
  }
}
// toggle all graphs to the opposite of the average visible/hidden state
function toggleAllGraphs() {
  let visCount = 0;
  chart1.series.forEach(chart => visCount += chart.visible)
  for (const chart of chart1.series) {
    visCount > chart1.series.length / 2 ? chart.hide() : chart.show();
  }
}

// show graph window
function autoToggleGraph() {
  if (game.options.displayed) {
    toggleSettingsMenu();
  }
  var autoSettings = document.getElementById("autoSettings");
  if (autoSettings && autoSettings.style.display === "block") {
    autoSettings.style.display = "none";
  }
  var ATMenu = document.getElementById("autoTrimpsTabBarMenu");
  if (ATMenu && ATMenu.style.display === "block") {
    ATMenu.style.display = "none";
  }
  var graphParent = document.getElementById("graphParent");
  if ("block" === graphParent.style.display) {
    graphParent.style.display = "none";
  }
  else {
    graphParent.style.display = "block";
    document.getElementById("deleteSpecificTextBox").focus()
  }
}

// focus main game
function escapeATWindows() {
  var a = document.getElementById("tooltipDiv");
  if ("none" != a.style.display) return void cancelTooltip();
  game.options.displayed && toggleSettingsMenu();
  var b = document.getElementById("autoSettings");
  "block" === b.style.display && (b.style.display = "none");
  var b = document.getElementById("autoTrimpsTabBarMenu");
  "block" === b.style.display && (b.style.display = "none");
  var c = document.getElementById("graphParent");
  "block" === c.style.display && (c.style.display = "none");
}
document.addEventListener(
  "keydown",
  function (a) {
    1 != game.options.menu.hotkeys.enabled || game.global.preMapsActive || game.global.lockTooltip
      || ctrlPressed || heirloomsShown || 27 != a.keyCode || escapeATWindows();
    if (["1", "2", "3", "4", "5"].includes(a.key)) {
      //a.stopPropagation() // does not work, whee
    }
  },
  true
);

function getportalID() { return `u${getGameData.universe()} p${getTotalPortals()}` }

function pushData(fromMap) {
  //debug("Starting Zone " + getGameData.world(), "graphs");
  const portalID = getportalID();
  if (!portalSaveData[portalID] || getGameData.world() === 1) { // reset portal data if restarting a portal
    savePortalData(true) // save old portal to history
    portalSaveData[portalID] = new Portal();
  }
  portalSaveData[portalID].update(fromMap);
  clearData(GRAPHSETTINGS.maxGraphs);
  savePortalData(false) // save current portal
}

// Hide graphs that have no collected data
function showHideUnusedGraphs() {
  let activeUniverses = [];
  for (const graph of graphList) {
    if (graph.graphType != "line") continue; // ignore column graphs (pure laziness, the only two always exist anyways)
    const universes = graph.universe ? [graph.universe] : [1, 2]
    for (const universe of universes) {
      let style = "none"
      for (portal of Object.values(portalSaveData)) {
        if (portal.perZoneData[graph.dataVar] && portal.universe === universe  // has collected data, in the right universe
          && new Set(portal.perZoneData[graph.dataVar].filter(x => x)).size > 1) { // and there is nonzero, variable data
          style = ""
          if (!activeUniverses.includes(universe)) activeUniverses.push(universe);
          break;
        }
      }
      // hide unused graphs
      document.querySelector(`#u${universe}graphSelection [value="${graph.selectorText}"]`).style.display = style;
    }
  }
  // hide universe selector if graphs are only in one universe
  let universeSel = document.querySelector(`#universeSelection`);
  if (activeUniverses.length === 1) {
    universeSel.style.display = "none";
    GRAPHSETTINGS.universeSelection = activeUniverses[0];
    swapGraphUniverse()
  }
  else {
    universeSel.style.display = "";
  }
}

function loadGraphData() {
  var loadedData = LZString.decompressFromBase64(localStorage.getItem("portalDataHistory"));
  var currentPortal = JSON.parse(localStorage.getItem("portalDataCurrent"));
  if (loadedData != "") {
    var loadedData = JSON.parse(loadedData);
    if (currentPortal) { loadedData[Object.keys(currentPortal)[0]] = Object.values(currentPortal)[0] }
    console.log("Graphs: Found portalSaveData")
    // remake object structure
    for (const [portalID, portalData] of Object.entries(loadedData)) {
      portalSaveData[portalID] = new Portal();
      for (const [k, v] of Object.entries(portalData)) {
        portalSaveData[portalID][k] = v;
      }
    }
  }
  loadedSettings = JSON.parse(localStorage.getItem("GRAPHSETTINGS"));
  if (loadedSettings !== null) GRAPHSETTINGS = loadedSettings;
  MODULES.graphs = {}
  MODULES.graphs.useDarkAlways = false
}


// Custom Function Helpers
// diff between x and x-1, or x and initial
function diff(dataVar, initial) {
  return function (portal, i) {
    let e1 = portal.perZoneData[dataVar][i];
    let e2 = initial ? initial : portal.perZoneData[dataVar][i - 1];
    if (e1 === null || e2 === null) return null;
    return e1 - e2
  }
}

const formatters = {
  datetime: function () {
    let ser = this.series;
    return '<span style="color:' + ser.color + '" >●</span> ' + ser.name + ": <b>" + formatDuration(this.y / 1000) + "</b><br>";
  },
}

// Create all the Graph objects
// Graph(dataVar, universe, selectorText, additionalParams)
// additionalParams == graphTitle, conditional, customFunction, useAccumulator, toggles, xTitle, yTitle, formatter

// To add a new graph, add it to graphList with the desired options,
// If using a new dataVar, add that to getGameData

// Toggles are perHr, lifetime, s3normalized
// To make a new toggle, add the switch case and title mod to Graph.lineGraph

const graphList = [
  ["currentTime", false, "Clear Time", {
    yType: "datetime",
    formatter: formatters.datetime,
    toggles: ["perZone", "mapTime", "mapCount"],
    // , "mapPct" TODO having issues with accumulators on this one, more trouble than it's worth given nobody asked for it
  }],
  // U1 Graphs
  ["heliumOwned", 1, "Helium", {
    toggles: ["perHr", "perZone", "lifetime"]
  }],
  ["fluffy", 1, "Fluffy Exp", {
    conditional: () => { return getGameData.u1hze() >= 300 && getGameData.fluffy() < 3413330078125000 }, // pre unlock, post E10L10
    customFunction: (portal, i) => { return diff("fluffy", portal.initialFluffy)(portal, i) },
    toggles: ["perHr", "perZone",]
  }],
  ["essence", 1, "Dark Essence", {
    conditional: () => { return getGameData.essence() < 5.826e+39 },
    customFunction: (portal, i) => { return diff("essence", portal.initialDE)(portal, i) },
    toggles: ["perHr", "perZone",],
    xminFloor: 181,
  }],
  ["lastWarp", 1, "Warpstations", {
    graphTitle: "Warpstations built on previous Giga",
    conditional: () => { return getGameData.u1hze() > 60 && ((game.global.totalHeliumEarned - game.global.heliumLeftover) < 10 ** 10) }, // Warp unlock, less than 10B He allocated
    xminFloor: 60,
  }],
  ["amals", 1, "Amalgamators"],
  ["wonders", 1, "Wonders", {
    conditional: () => { return getGameData.challengeActive() === "Experience" },
    xminFloor: 300,
  }],

  // U2 Graphs
  ["radonOwned", 2, "Radon", {
    toggles: ["perHr", "perZone", "lifetime", "s3normalized"]
  }],
  ["scruffy", 2, "Scruffy Exp", {
    customFunction: (portal, i) => { return diff("scruffy", portal.initialScruffy)(portal, i) },
    toggles: ["perHr", "perZone",]
  }],
  ["mutatedSeeds", 2, "Mutated Seeds", {
    conditional: () => { return getGameData.u2hze() > 200 },
    customFunction: (portal, i) => { return diff("mutatedSeeds", portal.initialMutes)(portal, i) },
    toggles: ["perHr", "perZone"],
    xminFloor: 200,
  }],
  ["worshippers", 2, "Worshippers", {
    conditional: () => { return getGameData.u2hze() >= 50 },
    xminFloor: 50,
  }],
  ["smithies", 2, "Smithies"],
  ["bonfires", 2, "Bonfires", {
    graphTitle: "Active Bonfires",
    conditional: () => { return getGameData.challengeActive() === "Hypothermia" }
  }],
  ["embers", 2, "Embers", {
    conditional: () => { return getGameData.challengeActive() === "Hypothermia" }
  }],
  ["cruffys", 2, "Cruffys", {
    conditional: () => { return getGameData.challengeActive() === "Nurture" }
  }],

  // Generic Graphs
  ["c23increase", false, "C2 Bonus", {
    conditional: () => { return game.global.runningChallengeSquared },
    toggles: ["perHr", "perZone", "lifetime"]
  }],
  ["voids", false, "Void Map History", {
    graphTitle: "Void Map History (voids finished during the same level acquired are not counted/tracked)",
    yTitle: "Number of Void Maps",
  }],
  [false, false, "Total Voids", {
    portalVar: "totalVoidMaps",
    graphType: "column",
    graphTitle: "Total Void Maps Run"
  }],
  [false, false, "Nullifium Gained", {
    portalVar: "totalNullifium",
    graphType: "column",
  }],
  ["coord", false, "Coordinations", {
    graphTitle: "Unbought Coordinations",
  }],
  ["overkill", false, "Overkill Cells", {
    // Overkill unlock zones (roughly)
    conditional: () => {
      return ((getGameData.universe() == 1 && getGameData.u1hze() >= 170)
        || getGameData.universe() == 2 && getGameData.u2hze() >= 201)
    }
  }],
  ["mapbonus", false, "Map Bonus"],
  ["empower", false, "Empower", {
    conditional: () => { return getGameData.challengeActive() === "Daily" && typeof game.global.dailyChallenge.empower !== "undefined" }
  }]
].map(opts => new Graph(...opts));

const getGameData = {
  currentTime: () => { return getGameTime() - game.global.portalTime }, // portalTime changes on pause, 'when a portal started' is not a static concept
  // TODO need to store a 'last exited map' time
  timeOnMap: () => {
    let annoyingRemainder = 0;
    if (game.global.mapStarted < game.global.zoneStarted) {
      annoyingRemainder = getGameTime() - game.global.mapStarted;
    }
    //if (game.global.mapsActive) {
    return getGameTime() - game.global.mapStarted - annoyingRemainder;
    //}
    //else return 0
  },
  world: () => { return game.global.world },
  challengeActive: () => { return game.global.challengeActive },
  voids: () => { return game.global.totalVoidMaps },
  totalVoids: () => { return game.stats.totalVoidMaps.value },
  nullifium: () => { return recycleAllExtraHeirlooms(true) },
  coord: () => { return game.upgrades.Coordination.allowed - game.upgrades.Coordination.done },
  overkill: () => {
    // overly complex check for Liq, overly fragile check for overkill cells. please rewrite this at some point.
    if (game.options.menu.overkillColor.enabled == 0) toggleSetting("overkillColor");
    if (game.options.menu.liquification.enabled && game.talents.liquification.purchased && !game.global.mapsActive && game.global.gridArray && game.global.gridArray[0] && game.global.gridArray[0].name == "Liquimp")
      return 100;
    else return document.getElementById("grid").getElementsByClassName("cellColorOverkill").length;
  },
  zoneTime: () => { return Math.round((getGameTime() - game.global.zoneStarted) * 100) / 100 }, // rounded to x.xs, not used
  mapbonus: () => { return game.global.mapBonus },
  empower: () => { return game.global.challengeActive == "Daily" && typeof game.global.dailyChallenge.empower !== "undefined" ? game.global.dailyChallenge.empower.stacks : 0 },
  lastWarp: () => { return game.global.lastWarp },
  essence: () => { return game.global.spentEssence + game.global.essence },
  heliumOwned: () => { return game.resources.helium.owned },
  //magmite: () => { return game.global.magmite },
  //magmamancers: () => { return game.jobs.Magmamancer.owned },
  fluffy: () => {
    //sum of all previous evo costs + current exp
    let exp = game.global.fluffyExp;
    for (var evo = 0; evo < Fluffy.getCurrentPrestige(); evo++) {
      exp += Math.floor((1000 * Math.pow(5, evo)) * ((Math.pow(4, 10) - 1) / (4 - 1)));;
    }
    return exp
  },
  //nursery: () => { return game.buildings.Nursery.purchased },
  amals: () => { return game.jobs.Amalgamator.owned },
  wonders: () => { return game.challenges.Experience.wonders },
  scruffy: () => { return game.global.fluffyExp2 },
  smithies: () => { return game.buildings.Smithy.owned },
  radonOwned: () => { return game.resources.radon.owned },
  worshippers: () => { return game.jobs.Worshipper.owned },
  bonfires: () => { return game.challenges.Hypothermia.bonfires },
  embers: () => { return game.challenges.Hypothermia.embers },
  cruffys: () => { return game.challenges.Nurture.level },
  universe: () => { return game.global.universe },
  s3: () => { return game.global.lastRadonPortal },
  u1hze: () => { return game.global.highestLevelCleared },
  u2hze: () => { return game.global.highestRadonLevelCleared },
  c23increase: () => {
    if (game.global.challengeActive !== "" && game.global.runningChallengeSquared) {
      return Math.max(0, getIndividualSquaredReward(game.global.challengeActive, game.global.world) - getIndividualSquaredReward(game.global.challengeActive));
    }
    else { return 0; }
  },
  cinf: () => { return countChallengeSquaredReward(false, false, true) },
  mutatedSeeds: () => { return game.global.mutatedSeedsSpent + game.global.mutatedSeeds }
}

var toggleProperties = { // rules for toggle based graphs
  mapCount: {
    exclude: ["mapTime", "mapPct"],
    graphMods: (graph) => {
      graph.formatter = undefined;
      graph.yType = "Linear";
      graph.graphTitle = "Maps Run"
      graph.yTitle = "Maps Run"
      graph.useAccumulator = true;
    }
  },
  mapTime: {
    exclude: ["mapCount", "mapPct"],
    graphMods: (graph) => {
      graph.graphTitle = "Time in Maps";
      graph.useAccumulator = true;
    }
  },
  mapPct: {
    exclude: ["mapCount", "mapTime"],
    graphMods: (graph) => {
      graph.formatter = undefined;
      graph.yType = "Linear"
      graph.graphTitle = "% of Clear time spent Mapping"
      graph.yTitle = "% Clear Time"
      graph.useAccumulator = true;
    }
  },
  perZone: {
    graphMods: (graph) => {
      graph.graphTitle += " each Zone"
    },
  },
  perHr: {
    graphMods: (graph) => {
      graph.graphTitle += " / Hour"
    },
  },
  lifetime: {
    graphMods: (graph) => {
      graph.graphTitle += " % of Lifetime Total";
      graph.yTitle += " % of lifetime"
    },
  },
  s3normalized: {
    graphMods: (graph) => {
      graph.graphTitle += `, Normalized to z${maxS3} S3`
    },
  },
}

// Global vars
var chart1;
var lastSave = new Date()
var GRAPHSETTINGS = {
  universeSelection: 1,
  u1graphSelection: null,
  u2graphSelection: null,
  rememberSelected: [],
  toggles: {},
  darkTheme: true,
  maxGraphs: 20, // Highcharts gets a bit angry rendering more graphs, also 30 is the maximum you can fit on the legend before it splits into pages.  
}
var portalSaveData = {}

// load and initialize the UI
loadGraphData();
init()
showHideUnusedGraphs()
var lastTheme = -1;


//Wrappers for Trimps functions to reliably collect data

//On Zone transition
var originalnextWorld = nextWorld;
nextWorld = function () {
  try {
    if (game.options.menu.pauseGame.enabled) return;
    if (null === portalSaveData) portalSaveData = {};
    if (getGameData.world()) { pushData(); }
  }
  catch (e) { debug("Gather info failed: " + e) }
  originalnextWorld(...arguments);
}

//On Portal
var originalactivatePortal = activatePortal;
activatePortal = function () {
  try { pushData(); }
  catch (e) { debug("Gather info failed: " + e) }
  originalactivatePortal(...arguments)
}

//On Map start
// This unfortunately loses the last map, since we grab map time at the creation of the map
var originalbuildMapGrid = buildMapGrid;
buildMapGrid = function () {
  try { pushData(true); }
  catch (e) { debug("Gather info failed: " + e) }
  originalbuildMapGrid(...arguments)
}

//On leaving maps for world
// this captures the last map shen you switch away from maps
var originalmapsSwitch = mapsSwitch;
mapsSwitch = function () {
  originalmapsSwitch(...arguments)
  try { if (!game.global.mapsActive) pushData(true); }
  catch (e) { debug("Gather info failed: " + e) }

}