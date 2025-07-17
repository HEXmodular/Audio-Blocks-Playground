var canvas;
var graphics;


//--------------------------------  Color Palette Editor -----------------------------------------------------

var DEFAULT_PALETTE = [
    [0x00, 0x00, 0x00], [0xCC, 0xCC, 0xCC],
    [0xFF, 0x00, 0x00], [0x00, 0x00, 0xFF], [0x00, 0xDD, 0x00], [0xFF, 0x00, 0xFF], [0x00, 0xFF, 0xFF], [0xFF, 0xFF, 0x00], [0x80, 0x80, 0x80],
    [0x88, 0x00, 0x00], [0x00, 0x00, 0x88], [0x00, 0x88, 0x00], [0x88, 0x00, 0x88], [0x00, 0x88, 0x88], [0x88, 0x88, 0x00], [0xDD, 0xDD, 0xDD],
    [0xFF, 0xAA, 0xAA], [0xAA, 0xAA, 0xFF], [0xAA, 0xFF, 0xAA], [0xFF, 0xAA, 0xFF], [0xAA, 0xFF, 0xFF], [0xFF, 0xFF, 0xAA], [0xFF, 0xAA, 0x55],
    [0x88, 0x55, 0x55], [0x55, 0x55, 0x88], [0x55, 0x88, 0x55], [0x88, 0x55, 0x88], [0x55, 0x88, 0x88], [0x88, 0x88, 0x55], [0x55, 0xAA, 0xFF],
    [0xAA, 0xFF, 0x55], [0x55, 0x55, 0x55]
];
var palette = DEFAULT_PALETTE;


var ccIsVisible = false;
var ccPalette;
var ccSliders;
var ccSelectedColor;
var ccPatchList;
var ccColorPatches;


function installStandardPalette(type) {
    if (!ccIsVisible) {
        return;
    }
    ccPalette = makePalette(ccPalette.length, type);
    for (var i = 0; i < ccPalette.length; i++) {
        ccColorPatches[i].style.backgroundColor =
            "rgb(" + ccPalette[i][0] + "," + ccPalette[i][1] + "," + ccPalette[i][2] + ")";
        ccColorPatches[i].style.color =
            (ccPalette[i][0] > 150 || ccPalette[i][1] > 150) ? "black" : "white";
    }
    ccSliders.setValue(0, ccPalette[ccSelectedColor][0]);
    ccSliders.setValue(1, ccPalette[ccSelectedColor][1]);
    ccSliders.setValue(2, ccPalette[ccSelectedColor][2]);
    ccSelectPatchNum(0);
}

function ccSelectPatchNum(num) {
    if (ccSelectedColor >= 0) {
        ccColorPatches[ccSelectedColor].style.borderColor = "black";
        ccColorPatches[ccSelectedColor].style.outline = "none";
    }
    ccSelectedColor = num;
    ccColorPatches[ccSelectedColor].style.borderColor = "yellow";
    ccColorPatches[ccSelectedColor].style.outline = "2px solid yellow";
    ccSliders.setValue(0, ccPalette[ccSelectedColor][0]);
    ccSliders.setValue(1, ccPalette[ccSelectedColor][1]);
    ccSliders.setValue(2, ccPalette[ccSelectedColor][2]);
    document.getElementById("ccnum").innerHTML = "" + num;
}


function makePalette(stateCt, type) {
    // types are:  1. White/Default  2. Black/Default  3. White/Spectrum  4. Black/Spectrum  5. Grays  6. Reverse Grays
    var newPalette = new Array(stateCt);
    for (var i = 0; i < stateCt; i++) {
        switch (type) {
            case 1:
            case 2:
                newPalette[i] = [DEFAULT_PALETTE[i][0], DEFAULT_PALETTE[i][1], DEFAULT_PALETTE[i][2]];
                break;
            case 3:
                newPalette[i] = (i == 0) ? [0, 0, 0] : getRGBFromHSV(360 * ((i - 1) / (stateCt - 1)), 1, 1);
                break;
            case 4:
                newPalette[i] = (i == 0) ? [255, 255, 255] : getRGBFromHSV(360 * ((i - 1) / (stateCt - 1)), 1, 0.7);
                break;
            case 5:
                newPalette[i] = getRGBFromHSV(0, 0, i / (stateCt - 1));
                break;
            case 6:
                newPalette[i] = getRGBFromHSV(0, 0, (stateCt - 1 - i) / (stateCt - 1));
                break;
        }
    }
    if (type == 2) {
        newPalette[0] = [255, 255, 255];
        newPalette[1] = [0, 0, 0];
    }
    return newPalette;
    function getRGBFromHSV(h, s, v) {  //0<=h<=359, s and v are in range 0.0 to 1.0
        var r, g, b;
        var c, x;
        c = v * s;
        x = (h < 120) ? h / 60 : (h < 240) ? (h - 120) / 60 : (h - 240) / 60;
        x = c * (1 - Math.abs(x - 1));
        x += (v - c);
        switch (Math.floor(h / 60)) {
            case 0: r = v; g = x; b = v - c; break;
            case 1: r = x; g = v; b = v - c; break;
            case 2: r = v - c; g = v; b = x; break;
            case 3: r = v - c; g = x; b = v; break;
            case 4: r = x; g = v - c; b = v; break;
            case 5: r = v; g = v - c; b = x; break;
        }
        return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
    }
}

//------------------------------------- random numbers -------------------------------------------
// Note: Use David Bau's seeded random number generator from seedrandom.js

var random;    // Current random number generator
var ruleSeed;  // Random number seed used to generate current rule set and lambda path
var worldSeed; // Random number seed used to generate cure

function randInt(min, max) {
    return min + Math.floor((max - min + 1) * random());
}



//------------------------------------ rules and worlds -------------------------------------------

var sliderCanvas;
var lambdaSlider;  // slider that controls the lambda value

var states = 4;           // Number of states/colors, an integer, 2 or more
var neighbors = 5;        // Number of neighbors, an odd number, 3 or more, states^neighbors < 2^20
var isIsotropic = true;   // Do reflected neighborhoods give the same result?
var worldSize;            // Number of cells in the world
var worldsInCanvas;       // Number of rows of cells that can be displayed in the canvas

var rule;                 // An array of all rules, length states^neighbors
var lambdaPath;           // An array giving the order in which rules are activated as lambda increases
var rulesUsed;            // How many rules in the path are used, equal to lambda*lambdaPath.length
var ruleIsUsed;           // An array where ruleIsUsed[i] == 1 iff rule i is activated
var generationNumber;
var currentWorld;
var savedWorlds;          // Contains all the generations that are currently in the canvas,
//     with generation number n in position (worldsInCanvas % n)
var ruleInfo;             // text for display above the canvas, with number of states, neighbors, rules

function newRuleSetData(seed) {
    ruleSeed = seed || Math.floor(Math.pow(2, 32) * Math.random());
    random = new Math.seedrandom(ruleSeed);
    var ruleCt = Math.pow(states, neighbors);
    rule = window.Uint8Array ? new Uint8Array(ruleCt) : new Array(ruleCt);
    ruleIsUsed = window.Uint8Array ? new Uint8Array(ruleCt) : new Array(ruleCt);
    rule[0] = 0;  // always dead
    for (var i = 1; i < ruleCt; i++) {
        ruleIsUsed[i] = 0;
        rule[i] = randInt(1, states - 1);
        if (isIsotropic)
            rule[isotropicMate(i)] = rule[i];
    }
    var lambdaCt;
    if (isIsotropic)
        lambdaCt = ((Math.pow(states, neighbors) + Math.pow(states, (neighbors + 1) / 2)) / 2) - 1;
    else
        lambdaCt = ruleCt - 1;
    lambdaPath = window.Uint32Array ? new Uint32Array(lambdaCt) : new Array(lambdaCt);
    var ct = 0;
    for (var i = 1; i < ruleCt; i++) {
        if (!ruleIsUsed[i]) {
            lambdaPath[ct] = i;
            ct++;
            ruleIsUsed[i] = 1;
            if (isIsotropic)
                ruleIsUsed[isotropicMate(i)] = 1;
        }
    }
    //if (ct != lambdaCt)  // for debugging
    //   throw "Bad programming; wrong lambdaCt??? " + ct + " " + lambdaCt;
    for (var i = 0; i < lambdaCt; i++) {
        var r = randInt(0, lambdaCt - 1);
        var temp = lambdaPath[i];
        lambdaPath[i] = lambdaPath[r];
        lambdaPath[r] = temp;
    }
    savedWorlds = null;
    ruleInfo = states + " states, " + neighbors + " neighbors, " +
        (isIsotropic ? "isotropic, " : "anisotropic, ") + (lambdaCt + 1) + " rules";
    setRulesUsed(0.33 * lambdaCt);  // NB: this resets the rulesUsed[] array.
}

function newWorldData(type, seed) {
    worldSeed = seed || Math.floor(Math.pow(2, 32) * Math.random());
    worldType = type;
    random = new Math.seedrandom(worldSeed);
    if (savedWorlds == null || (savedWorlds[0] && savedWorlds[0].length != worldSize)) {
        savedWorlds = new Array(worldsInCanvas);
    }
    generationNumber = 0;
    if (!savedWorlds[0]) {
        savedWorlds[0] = window.Uint8Array ? new Uint8Array(worldSize) : new Array(worldSize);
    }
    currentWorld = savedWorlds[0];
    var i, start, clumpSize, top;
    if (type > 3) {
        for (i = 0; i < worldSize; i++)
            currentWorld[i] = 0;
    }
    switch (type) {
        case 1:
            for (i = 0; i < worldSize; i++)
                currentWorld[i] = randInt(1, states - 1);
            break;
        case 2:
            top = Math.ceil(worldSize / 2);
            for (i = 0; i < top; i++)
                currentWorld[i] = currentWorld[worldSize - i - 1] = randInt(1, states - 1);
            break;
        case 3:
            for (i = 0; i < worldSize; i++) {
                currentWorld[i] = (Math.random() < 0.5) ? 0 : randInt(1, states - 1);
            }
            break;
        case 4:
            for (i = 0; i < worldSize; i++) {
                currentWorld[i] = (Math.random() < 0.75) ? 0 : randInt(1, states - 1);
            }
            break;
        case 5:
            clumpSize = Math.min(100, Math.floor(worldSize / 3));
            start = Math.floor((worldSize - clumpSize) / 2);
            for (i = start; i < start + clumpSize; i++) {
                currentWorld[i] = randInt(1, states - 1);
            }
            break;
        case 6:
            clumpSize = Math.min(100, Math.floor(worldSize / 3));
            start = Math.floor((worldSize - clumpSize) / 2);
            top = Math.ceil(worldSize / 2);
            for (i = start; i < top; i++)
                currentWorld[i] = currentWorld[worldSize - i - 1] = randInt(1, states - 1);
            break;
        case 7:
            clumpSize = Math.min(50, Math.floor(worldSize / 5));
            var clumpCt = Math.floor(worldSize / (2 * clumpSize));
            start = Math.floor((worldSize - clumpSize * (2 * clumpCt - 1)) / 2);
            for (var j = 0; j < clumpCt; j++) {
                for (i = start; i < start + clumpSize; i++) {
                    currentWorld[i] = randInt(1, states - 1);
                }
                start += 2 * clumpSize;
            }
            break;
        case 8:
            currentWorld[Math.floor(worldSize / 2)] = 1;
            break;
        case 9:
            for (i = 4; i < worldSize - 2; i += 10) {
                currentWorld[i] = randInt(1, states - 1);
            }
    }
}

function setRulesUsed(used) {
    rulesUsed = Math.round(used);
    if (rulesUsed < 0)
        rulesUsed = 0;
    else if (rulesUsed > lambdaPath.length)
        rulesUsed = lambdaPath.length;
    if (isIsotropic) {
        for (var i = 0; i < rulesUsed; i++) {
            var r = lambdaPath[i];
            ruleIsUsed[r] = 1;
            ruleIsUsed[isotropicMate(r)] = 1;
        }
        for (var i = rulesUsed; i < lambdaPath.length; i++) {
            var r = lambdaPath[i];
            ruleIsUsed[r] = 0;
            ruleIsUsed[isotropicMate(r)] = 0;
        }
    }
    else {
        for (var i = 0; i < rulesUsed; i++)
            ruleIsUsed[lambdaPath[i]] = 1;
        for (var i = rulesUsed; i < lambdaPath.length; i++)
            ruleIsUsed[lambdaPath[i]] = 0;
    }
    var ct = 0;
    for (var i = 0; i < ruleIsUsed.length; i++) {
        ct += ruleIsUsed[i] ? 1 : 0;
    }
}



function isotropicMate(n) {
    var partner = 0;
    var s = states;
    for (var i = 0; i < neighbors; i++) {
        partner = partner * s + (n % s);
        n = Math.floor(n / s);
    }
    return partner;
}





//------------------------------------ events  and animation -------------------------------------------

var cellSize;
var worldLeft;  // size of gap between left edge of canvas and first cell
var worldTop;   // y-coord in canvas for NEXT generation to be drawn.

var initialWorld; // copy of generation zero.

var ticksPerGeneration;
var ticksSinceLastGeneration;
var stopGeneration;
var running = false;
var lambdaChanging = false;

var imageData;
var worldType;


function frame() {
    if (running && !lambdaChanging) {
        ticksSinceLastGeneration++;
        if (ticksSinceLastGeneration >= ticksPerGeneration) {
            nextGeneration();
            drawCurrentWorld();
            ticksSinceLastGeneration = 0;
            if (stopGeneration > 0 && generationNumber >= stopGeneration) {
                doPause();
            }
        }
    }
    if (running) {
        requestAnimationFrame(frame);
    }
}



function doPause() {
    if (!running) {
        return;
    }
    running = false;
    // document.getElementById("run").disabled = false;
    // document.getElementById("step").disabled = false;
    // document.getElementById("pause").disabled = true;
}

function doStep() {
    if (running) {
        return;
    }
    nextGeneration();
    drawCurrentWorld();
}

function doRunToScreen() {
    if (!running) {
        doRun();
    }
    stopGeneration = generationNumber + worldsInCanvas;
}

function doRestart() {
    if (!savedWorlds[0]) {
        savedWorlds[0] = window.Unit8Array ? new Uint8Array(worldSize) : new Array(worldSize);
    }
    for (var i = 0; i < worldSize; i++) {
        savedWorlds[0][i] = initialWorld[i];
    }
    generationNumber = 0;
    stopGeneration = -1;
    currentWorld = savedWorlds[0];
    worldTop = 0;
    graphics.fillStyle = "rgb(" + palette[0][0] + "," + palette[0][1] + "," + palette[0][2] + ")";
    graphics.fillRect(0, 0, canvas.width, canvas.height);
    if (worldLeft > 0) {
        graphics.fillStyle = "gray";
        graphics.fillRect(0, 0, worldLeft, canvas.height);
    }
    var gapRight = canvas.width - (cellSize * worldSize) - worldLeft;
    if (gapRight > 0) {
        graphics.fillStyle = "gray";
        graphics.fillRect(worldLeft + (cellSize * worldSize), 0, gapRight, canvas.height);
    }
    imageData = graphics.getImageData(worldLeft, 0, cellSize * worldSize, 1);
    drawCurrentWorld();
}

function doNewWorld(oldWorld, useOldWorld) {  // two params are present when this is called because canvas size changed
    if (useOldWorld) {  // substitue data from previous initialWorld; presense of 2nd param means this was called because of resizing
        worldSize = Math.floor(canvas.width / cellSize);
        worldsInCanvas = Math.floor((canvas.height - 1) / cellSize) + 1;
        newWorldData(Number(document.getElementById("worldtype").value));
        for (var i = 0; i < oldWorld.length && i < currentWorld.length; i++) {
            currentWorld[i] = oldWorld[i];
        }
        for (i = oldWorld.length; i < currentWorld.length; i++) {
            currentWorld[i] = 0;
        }
    }
    else {
        cellSize = Number(document.getElementById("cellsize").value);
        ticksPerGeneration = Number(document.getElementById("speed").value); // in case size changes while running (also for first call)
        if (cellSize > 1) {  // for large cells, scale the speed
            ticksPerGeneration = Math.min(120, Math.floor(ticksPerGeneration * cellSize / 2));
        }
        worldSize = Math.floor(canvas.width / cellSize);
        worldsInCanvas = Math.floor((canvas.height - 1) / cellSize) + 1;
        newWorldData(Number(document.getElementById("worldtype").value));
    }
    initialWorld = window.Unit8Array ? new Uint8Array(worldSize) : new Array(worldSize);
    for (var i = 0; i < worldSize; i++) {
        initialWorld[i] = currentWorld[i];
    }
    graphics.fillStyle = "rgb(" + palette[0][0] + "," + palette[0][1] + "," + palette[0][2] + ")";
    graphics.fillRect(0, 0, canvas.width, canvas.height);
    var gapLeft = (canvas.width - (worldSize * cellSize)) / 2;
    if (gapLeft > 0) {
        graphics.fillStyle = "gray";
        graphics.fillRect(0, 0, gapLeft, canvas.height);
    }
    var gapRight = canvas.width - (cellSize * worldSize) - gapLeft;
    if (gapRight > 0) {
        graphics.fillStyle = "gray";
        graphics.fillRect(gapLeft + (cellSize * worldSize), 0, gapRight, canvas.height);
    }
    worldLeft = gapLeft;
    worldTop = 0;
    stopGeneration = -1;
    imageData = graphics.getImageData(gapLeft, 0, cellSize * worldSize, 1);
    document.getElementById("info").innerHTML = ruleInfo;
    document.getElementById("rulesused").value = "" + (rulesUsed + 1);
    drawCurrentWorld();
}



function doChangeSpeed() {
    var ticks = Number(document.getElementById("speed").value);
    if (cellSize > 1) {  // for large cells, scale the speed
        ticks = Math.min(120, Math.floor(ticks * cellSize / 2));
    }
    if (ticks != ticksPerGeneration) {
        ticksPerGeneration = ticks;
        ticksSinceLastGeneration = 0;
    }
}

function doChangeNumberOfStates() {
    var states = Number(document.getElementById("states").value);
    var neighbors = Number(document.getElementById("neighbors").value);
    var html = "";
    var n = 3;  // Number of neighbors
    var max = 3; // maximum number of neighbors allowed for this state number
    while (Math.pow(states, n) < 1048576) {  // 2^20; max number of rules
        html += "<option>" + n + "</option>";
        max = n;
        n = n + 2;
    }
    document.getElementById("neighbors").innerHTML = html;
    if (neighbors > max) {
        neighbors = max
    }
    document.getElementById("neighbors").value = "" + neighbors;
}

function doChangeLambda() {
    var lambda = lambdaSlider.value(0);
    if (currentWorld) {
        setRulesUsed(lambda * lambdaPath.length);
    }
    document.getElementById("info").innerHTML = ruleInfo;
    document.getElementById("rulesused").value = "" + (rulesUsed + 1);
    if (!lambdaChanging) { // Change is not part of draging, just a click on the bar
        doRestart();
    }
}
function doStartLambdDrag() {
    lambdaChanging = true;
}
function doEndLambdaDrag() {
    lambdaChanging = false;
    doRestart();
}

var rulesUsedTimeout = null;
function doKeyInRulesUsed(evt) {
    var code = evt.keyCode;
    if (code == 10 || code == 13 || code == 37 || code == 39) {
        return;
    }
    if ((code < 48 || code > 57) && code != 8) {
        evt.preventDefault();
        return;
    }
    if (rulesUsedTimeout) {
        clearTimeout(rulesUsedTimeout);
    }
    rulesUsedTimeout = setTimeout(completeEnterRulesUsed, 1000);
}

function doChangeRulesUsed() {  // handles a blur or change event, only need to respond to them immediately
    if (rulesUsedTimeout) {
        clearTimeout(rulesUsedTimeout);
        rulesUsedTimeout = null;
        completeEnterRulesUsed();
    }
}

function completeEnterRulesUsed() {
    var val = Number(document.getElementById("rulesused").value.trim());
    if (isNaN(val) || val <= 0 || val > lambdaPath.length + 1) {
        document.getElementById("info").innerHTML = "Error: Rules in use must be in range 1 to " + (lambdaPath.length + 1);
        return;
    }
    document.getElementById("info").innerHTML = ruleInfo;
    if ((val - 1) != rulesUsed) {
        lambdaSlider.setValue(0, (val - 1) / lambdaPath.length);
        setRulesUsed(val);
        doRestart();
    }
}


//----------------------------------- Drawing the World -----------------------------------------------

function drawCurrentWorld() {
    if (worldTop + cellSize > canvas.height) {
        var scroll = (worldTop - canvas.height + cellSize);
        graphics.drawImage(canvas, 0, scroll, canvas.width, canvas.height - scroll,
            0, 0, canvas.width, canvas.height - scroll);
        worldTop = canvas.height - cellSize;
    }
    putWorld(currentWorld, worldTop)
    worldTop += cellSize;
}

function putWorld(world, worldTop) {
    var hres = Math.round(imageData.width / (cellSize * worldSize));  // device pixels per pixel, horizontal
    var vres = imageData.height;             // device pixels per pixel, vertical
    // (Math.round here shouldn't be needed)
    //if (hres != 1 || vres != 1 || hres != vres) {
    //    console.log("Surprising pixels-size / device-pixels-size, " + hres + " " + vres);
    //}
    for (var i = 0; i < worldSize; i++) {
        var color = palette[world[i]];
        for (var j = 0; j < hres * cellSize; j++) {
            var p = 4 * (i * cellSize * hres + j);
            imageData.data[p] = color[0];
            imageData.data[p + 1] = color[1];
            imageData.data[p + 2] = color[2];
            imageData.data[p + 3] = 255;
        }
    }
    for (var y = 0; y < cellSize * vres; y++) {
        graphics.putImageData(imageData, worldLeft, worldTop + y);
    }
}

function paletteChanged() {  // called when user finishes editing the color palette, to change colors on screen.
    graphics.fillStyle = "rgb(" + palette[0][0] + "," + palette[0][1] + "," + palette[0][2] + ")";
    graphics.fillRect(worldLeft, 0, cellSize * worldSize, canvas.height);
    var top = worldTop;
    var pos = generationNumber % worldsInCanvas;
    do {
        top -= cellSize;
        putWorld(savedWorlds[pos], top);
        pos--;
        if (pos < 0) {
            pos = savedWorlds.length - 1;
        }
    }
    while (top > 0);
}


function doRun() {
    if (running) {
        return;
    }
    running = true;
    stopGeneration = -1;
    ticksSinceLastGeneration = 0;
    frame();
}

function init() {
    try {
        canvas = document.getElementById("canvas");
        graphics = canvas.getContext("2d");
    }
    catch (e) {
        document.getElementById("message").innerHTML =
            "Sorry, this page requires canvas support, which is not available in your browser.";
        return;
    }
    if (!window.localStorage) {
        document.getElementById("localstorage").style.display = "none";
    }
    else {
        document.getElementById("save").onclick = doSave;
        document.getElementById("load").onclick = doLoad;
        document.getElementById("delete").onclick = doDelete;
        document.getElementById("undodelete").onclick = doUndoDelete;
        document.getElementById("undodelete").disabled = true;
        document.getElementById("deleteall").onclick = doDeleteAll;
        populateExampleMenus();
    }
    sliderCanvas = document.getElementById("slider-canvas");
    lambdaSlider = new SliderCanvas(sliderCanvas);
    lambdaSlider.addSlider({ label: "lambda", min: 0.0, max: 1.0, value: 0.5, step: 0.0001, decimals: 4 });
    lambdaSlider.draw();
    lambdaSlider.onChange = doChangeLambda;
    lambdaSlider.onDragStart = doStartLambdDrag;
    lambdaSlider.onDragEnd = doEndLambdaDrag;
    ticksPerGeneration = 3;
    document.getElementById("speed").value = "3";
    document.getElementById("cellsize").value = "2";
    document.getElementById("worldtype").value = "3";
    document.getElementById("states").value = "4";
    document.getElementById("neighbors").value = "5";
    document.getElementById("isotropic").checked = true;;
    document.getElementById("run").onclick = doRun;
    document.getElementById("pause").onclick = doPause;
    document.getElementById("step").onclick = doStep;
    document.getElementById("runToScreen").onclick = doRunToScreen;
    document.getElementById("restart").onclick = doRestart;
    document.getElementById("newworld").onclick = doNewWorld;
    document.getElementById("new").onclick = doNewRules;
    // document.getElementById("colors").onclick = showPaletteEditor;
    document.getElementById("speed").onchange = doChangeSpeed;
    document.getElementById("states").onchange = doChangeNumberOfStates;
    document.getElementById("rulesused").onkeydown = doKeyInRulesUsed;
    document.getElementById("rulesused").onblur = doChangeRulesUsed;
    document.getElementById("rulesused").onchange = doChangeRulesUsed;
    // window.onresize = function () { doResize(false) };
    // doResize(true);
    // if (! installBuiltInExampleFromURL() ) {
    doNewRules();
    // }
    doRun();
}

function doNewRules() {
    states = Number(document.getElementById("states").value);
    neighbors = Number(document.getElementById("neighbors").value);
    isIsotropic = document.getElementById("isotropic").checked;
    if (palette.length != states) {
        palette = DEFAULT_PALETTE;
    }
    newRuleSetData();
    doNewWorld();
    lambdaSlider.setStep(0, 1 / lambdaPath.length);
    document.getElementById("info").innerHTML = ruleInfo;
    document.getElementById("rulesused").value = "" + (rulesUsed + 1);
    lambdaSlider.setValue(0, rulesUsed / lambdaPath.length);
}

function getState(n) {
    if (n < 0) {
        n += worldSize;
    }
    else if (n >= worldSize) {
        n -= worldSize;
    }
    return currentWorld[n];
}

function neighborhoodCode(n) {
    var code = 0;
    for (var i = 0; i < neighbors; i++)
        code = code * states +
            getState(n + i - Math.floor(neighbors / 2));
    return code;
}


function frame() {
    if (running && !lambdaChanging) {
        ticksSinceLastGeneration++;
        if (ticksSinceLastGeneration >= ticksPerGeneration) {
            nextGeneration();
            drawCurrentWorld();
            ticksSinceLastGeneration = 0;
            if (stopGeneration > 0 && generationNumber >= stopGeneration) {
                doPause();
            }
        }
    }
    if (running) {
        requestAnimationFrame(frame);
    }
}

function nextGeneration() {
    generationNumber++;
    var pos = generationNumber % worldsInCanvas;
    if (!savedWorlds[pos]) {
        savedWorlds[pos] = window.Uint8Array ? new Uint8Array(worldSize) : new Array(worldSize);
    }
    var nextWorld = savedWorlds[pos];
    for (var i = 0; i < worldSize; i++) {
        var code = neighborhoodCode(i);
        if (ruleIsUsed[code])
            nextWorld[i] = rule[code];
        else
            nextWorld[i] = 0;
    }
    currentWorld = nextWorld;
}