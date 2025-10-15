import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
import * as fields from '/pages/src/fields.mjs';
const doc = document.documentElement;
const content = document.getElementById("content")
const thisLap = document.getElementById("thisLap")
const allLaps = document.getElementById("allLaps")
const autoLapStatusDiv = document.getElementById("autoLapStatus")
let sortOrder = "asc"
let currentLaps = -1;
let includeLapButton = true;
let includeSetButton = false;
let lapHotkey = false;
let setHotkey = false;
let rideonBombAction = "none";
let steeringAction = "none";
let rideonBombRefresh = Date.now() - 5000;
let steeringRefresh = Date.now() - 5000;
let intervalRecovery = true;
let intervalTS = Date.now() + 1000000; //way in the future
let intervalTransition = false;
let autoLapOverride = false;
const autoLapRanges = {
    currentRange: null,
    rangeTS: Date.now() + 1000000,
    transition: false
}

function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {        
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}

common.settingsStore.setDefault({
    fontScale: 1,
    sortOrder: "desc",
    includeLapButton: true,
    includeSetButton: false,
    lapHotkey: false,
    setHotkey: false,
    rideonBombAction: "none",
    steeringAction: "none",
    fields: 2,
    autoLapPower: false,
    autoLapPowerThreshold: 200,
    autoLapPowerDuration: 1500,
    autoLapOverride: false
});

common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
if (settings.ascDesc) {
    sortOrder = settings.ascDesc;
} else {
    sortOrder = "desc"
}
includeLapButton = settings.includeLapButton;
includeSetButton = settings.includeSetButton;
lapHotkey = settings.lapHotkey;
setHotkey = settings.setHotkey;
rideonBombAction = settings.rideonBombAction;
steeringAction = settings.steeringAction;
autoLapOverride = settings.autoLapOverride || false;

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let formattedTime = '';

    if (hours > 0) {
        formattedTime += hours.toString().padStart(2, '0') + ':';
    }

    if (hours === 0 && minutes === 0) {
        formattedTime += '0:';
    } else {
        formattedTime += minutes.toString().padStart(1, '0') + ':';
    }

    formattedTime += remainingSeconds.toString().padStart(2, '0');

    return formattedTime;
}

async function getLapData(watching) {
    let lapData = await common.rpc.getAthleteLaps(watching.athleteId)    
    let setData = watching.sets ? watching.sets : [-1];
    allLaps.innerHTML = generateLapDataTable(lapData, setData)
    currentLaps = watching.lapCount
    sortOrder == "asc" ? allLaps.scrollTop = allLaps.scrollHeight : null;
    
}

function generateLapDataTable(laps, sets) {
    //console.log(sortOrder, sets, laps)
    let setLaps = [];
    if (laps.length > 0 && sets[0] != -1) {
        for (let i = 0;i < sets.length; i++) {
            setLaps.push(i == 0 ? laps.slice(0,sets[i]) : laps.slice(sets[i-1],sets[i]))        
        }
        let lastSet = laps.slice(sets.at(-1))
        if (lastSet.length > 0) {
            //console.log("adding final laps to set")
            setLaps.push(lastSet)
        }  
    } else {
        setLaps.push(laps)
    }
    sortOrder == "desc" ? setLaps = setLaps.toReversed() : null;
    //console.log(setLaps)
    // Sort the lap data based on lap counter in ascending or descending order   
    let tableHTML = '<table>';
    if (setLaps.length <= 1) {
        document.getElementById("headerRow").innerHTML = "<table><tr><td>Lap</td><td>Time</td><td>Power</td><td>HR</td></tr></table>"
        let lapData = sortOrder == "desc" ? laps.toReversed().filter(x => x.stats.activeTime > 0) : laps.filter(x => x.stats.activeTime > 0)
        let setData = sortOrder == "desc" ? sets.toReversed() : sets;
        
        let lapCounter = sortOrder == "desc" ? lapData.length : 1;
        let rowClass = sortOrder == "desc" ? "lineRowDesc" : "lineRow";
        let setIndex = 0;
        let setCounter = setData[setIndex];
        let repCounter = lapCounter;
        for (let data of lapData) {    
            const activeTime = formatTime(data.stats.activeTime.toFixed(0), 0);        
            const hrAvg = data.stats.hr.avg ? data.stats.hr.avg.toFixed(0) : '-';
            const powerAvg = data.stats.power.avg ? data.stats.power.avg.toFixed(0) : '-';                
            
            if (lapCounter == setCounter) {            
                tableHTML += `<tr class=${rowClass}><td>${lapCounter}</td><td>${activeTime}</td><td>${powerAvg}</td><td>${hrAvg}</td></tr>`;
                setIndex++;
                setCounter = setData[setIndex]
            } else {
                tableHTML += `<tr><td>${lapCounter}</td><td>${activeTime}</td><td>${powerAvg}</td><td>${hrAvg}</td></tr>`;
            }
            sortOrder == "desc" ? repCounter-- : repCounter++
            sortOrder == "desc" ? lapCounter-- : lapCounter++
        };
        
        tableHTML += '</table>';
    } else {
        document.getElementById("headerRow").innerHTML = "<table><tr><td>Set</td><td>Time</td><td>Power</td><td>HR</td></tr></table>"
        let setCounter = sortOrder == "desc" ? setLaps.length : 1;
        for (let set of setLaps) {
            
            sortOrder == "desc" ? set = set.toReversed() : null;
            let lapCounter = sortOrder == "desc" ? set.length : 1;
            for (let data of set) {    
                const activeTime = formatTime(data.stats.activeTime.toFixed(0), 0);        
                const hrAvg = data.stats.hr.avg ? data.stats.hr.avg.toFixed(0) : '-';
                const powerAvg = data.stats.power.avg ? data.stats.power.avg.toFixed(0) : '-';                
                let rowClass = sortOrder == "desc" && lapCounter == 1 ? "lineRow" : sortOrder != "desc" && lapCounter == set.length ? "lineRow" : ""
                tableHTML += `<tr class=${rowClass}><td>${setCounter}.${lapCounter}</td><td>${activeTime}</td><td>${powerAvg}</td><td>${hrAvg}</td></tr>`;                                
                sortOrder == "desc" ? lapCounter-- : lapCounter++
            };
            sortOrder == "desc" ? setCounter -- : setCounter++
        }
    }
    return tableHTML;
}

async function newSet() {
    //console.log("New Set")
    let watching = await common.rpc.getAthleteData("watching")
    if (!watching.sets) {
        await common.rpc.updateAthleteData(watching.athleteId, {sets: []});
    }
    let setData = watching.sets ? watching.sets : [];
    setData.push(watching.lapCount);
    await common.rpc.updateAthleteData(watching.athleteId, {sets: setData})
    common.rpc.startLap();
}


export async function main() {
    common.initInteractionListeners();      
    const fieldsLapLarge = document.getElementById('thisLapLarge');
    const fieldsLapSmall = document.getElementById('thisLapSmall');
    const fieldRenderer = new common.Renderer(fieldsLapLarge, {fps: 5});
    const fieldRendererSm = new common.Renderer(fieldsLapSmall, {fps: 5});
    const mapping = [];
    const mappingSm = [];
    const defaults = {
        f1: 'pwr-lap',
        fs1: 'hr-lap',
        fs2: 'time-lap'
    };
    //const numFields = common.settingsStore.get('fields');
    const numFields = 1    
    for (let i = 0; i < (isNaN(numFields) ? 1 : numFields); i++) {
        const id = `f${i + 1}`;
        fieldsLapLarge.insertAdjacentHTML('afterbegin', `
            <div class="field" data-field="${id}" style="display: flex">
                <div class="key"></div>:&nbsp<div class="value"></div><div class="unit"></div>
            </div>
        `);
        mapping.push({id, default: defaults[id] || 'pwr-lap'});
    }
    fieldRenderer.addRotatingFields({
        mapping,
        fields: fields.fields.filter(({id}) => {
            const type = id.split('-')[1];
            return ['lap'].includes(type);
        })        
    });    
    const numFieldsSm = settings.fields || 2;
    mapping.length = 0;
    for (let i = 0; i < (isNaN(numFieldsSm) ? 1 : numFieldsSm); i++) {
        const id = `fs${i + 1}`;
        fieldsLapSmall.insertAdjacentHTML('afterbegin', `
            <div data-field="${id}" style="display: flex">
            <div class="key"></div>:&nbsp<div class="value"></div><div class="unit"></div>
            </div>
        `);                
        mapping.push({id, default: defaults[id] || 'time-lap'});
    }    
    
    fieldRendererSm.addRotatingFields({
        mapping,
        fields: fields.fields.filter(x => !["athlete", "course", "draft", "Segments"].includes(x.group))
        //fields: fields.fields.filter(({id}) => {
        //    const type = id.split('-')[1];
        //    return ['lap','cur'].includes(type);
        //})        

    });
    if (includeLapButton) {
        const lapButton = document.getElementById("buttons");
        lapButton.insertAdjacentHTML('beforeend', `<button id="newLapButton"><small>+</small>Lap</button>`);
        const newLapButton = document.getElementById("newLapButton");
        newLapButton.className = "controlButton";
        newLapButton.addEventListener('click', ev => {common.rpc.startLap()});      
    }
    if (lapHotkey) {
        window.addEventListener('keydown', function(event) {
            if (event.key === 'l') {
                common.rpc.startLap();
            }
        });
    }
    if (includeSetButton) {
        const lapButton = document.getElementById("buttons");
        lapButton.insertAdjacentHTML('beforeend', `<button id="newSetButton"><small>+</small>Set</button>`);
        const newSetButton = document.getElementById("newSetButton");
        newSetButton.className = "controlButton";
        newSetButton.addEventListener('click', newSet);     
    }
    if (setHotkey) {
        window.addEventListener('keydown', function(event) {
            if (event.key === 's') {
                newSet();
            }
        });
    }
    autoLapStatusDiv.addEventListener("click", function() {
        autoLapOverride = !autoLapOverride;
        common.settingsStore.set("autoLapOverride", autoLapOverride);
    })
    window.addEventListener('keydown', function(event) {
        if (event.key === 'a') {
            autoLapOverride = !autoLapOverride;
            common.settingsStore.set("autoLapOverride", autoLapOverride);
        }
        if (event.key === "ArrowDown" && !autoLapOverride) {
            common.settingsStore.set("autoLapPowerThreshold", settings.autoLapPowerThreshold - 5);
        }
        if (event.key === "ArrowUp" && !autoLapOverride) {
            common.settingsStore.set("autoLapPowerThreshold", settings.autoLapPowerThreshold + 5);
        }
    });
    common.subscribe('athlete/watching', watching => {
        doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1); 
        fieldRenderer.setData(watching);
        fieldRenderer.render();                       
        fieldRendererSm.setData(watching);
        fieldRendererSm.render();
        
        if (settings.autoLapPower) {
            if (!autoLapOverride) {
                autoLapStatusDiv.innerHTML = `Auto Lap Power: ${settings.autoLapPowerThreshold}w`
            
                if (intervalRecovery && watching.state.power >= settings.autoLapPowerThreshold) {
                    if (!intervalTransition) {
                        intervalTransition = true;
                        intervalTS = Date.now();                    
                        //console.log("Transitioning from recovery to work")
                    } else {
                        if (Date.now() - intervalTS > settings.autoLapPowerDuration) {
                            //went over the power threshold for more than 1.5 seconds, set a lap
                            common.rpc.startLap()
                            intervalTransition = false;
                            intervalRecovery = false;
                            //console.log("Lapping to start work interval")
                        }
                    }                
                } else if (intervalRecovery && watching.state.power < settings.autoLapPowerThreshold && intervalTransition) {
                    //went over the threshold but not for more than 1.5 seconds
                    intervalTransition = false;
                    //console.log("Went over the threshold briefly but then went below again, not lapping")
                } else if (!intervalRecovery && watching.state.power < settings.autoLapPowerThreshold) {
                    if (!intervalTransition) {
                        intervalTransition = true;
                        intervalTS = Date.now();   
                        //console.log("Transitioning from work to recovery")                 
                    } else {
                        if (Date.now() - intervalTS > settings.autoLapPowerDuration) {
                            //went below the power threshold for more than 1.5 seconds, set a lap
                            common.rpc.startLap()
                            intervalTransition = false;
                            intervalRecovery = true;
                            //console.log("Lapping to start recovery interval")
                        }
                    }   
                } else if (!intervalRecovery && watching.state.power > settings.autoLapPowerThreshold && intervalTransition) {
                    //went below the threshold but not for more than 1.5 seconds
                    intervalTransition = false;
                    //console.log("Went below the threshold briefly but then went below again, not lapping")
                }
            } else {
                autoLapStatusDiv.innerHTML = "Auto Lap Power: Disabled"
            }
        } else if (settings.autoLapRanges) {
            if (!autoLapOverride) {
                const currentRange = watching.state.power >= settings.autoLapRangeHigh ? "high" : watching.state.power >= settings.autoLapRangeLow ? "mid" : "low";
                if (!autoLapRanges.currentRange) { //initialize
                    autoLapRanges.currentRange = currentRange;
                    autoLapRanges.rangeTS = Date.now();
                    autoLapRanges.transition = false;
                } else if (currentRange != autoLapRanges.currentRange) {
                    if (!autoLapRanges.transition) { // not already in a transition state, enable it
                        autoLapRanges.rangeTS = Date.now();
                        autoLapRanges.transition = true;
                    } else if (Date.now() - autoLapRanges.rangeTS > settings.autoLapRangesDuration) { // exceeded the transition time threshold, trigger a lap
                        common.rpc.startLap();
                        autoLapRanges.transition = false;
                        autoLapRanges.rangeTS = Date.now();
                        autoLapRanges.currentRange = currentRange;
                    }
                } else {
                    autoLapRanges.rangeTS = Date.now();
                    autoLapRanges.transition = false;
                }

            }
        } else {
            autoLapStatusDiv.innerHTML = "";
        }
        if (watching.state.rideonBomb && Date.now() - rideonBombRefresh > 5000 && rideonBombAction != "none") {
            rideonBombRefresh = Date.now();            
            if (rideonBombAction == "lap") {
                common.rpc.startLap()
            } else if (rideonBombAction == "set") {
                newSet()
            }
        }
        if (watching.state.activeSteer && !watching.state.rideonBomb && Date.now() - steeringRefresh > 5000 && steeringAction != "none") { // a ride on bomb also triggers activeSteer for some reason
            steeringRefresh = Date.now()            
            if (steeringAction == "lap") {
                common.rpc.startLap()
            } else if (steeringAction == "set") {
                newSet()
            }
        }
        if (watching.lapCount != currentLaps) {
            getLapData(watching);
        }
    });    
    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has("ascDesc") ||
            changed.has("includeLapButton") ||
            changed.has("includeSetButton") ||
            changed.has("lapHotkey") ||
            changed.has("setHotkey") ||
            changed.has("fields")
        ) {
//            sortOrder = changed.get('ascDesc');      
            location.reload()        
        } else if (changed.has("rideonBombAction")) {
            rideonBombAction = changed.get("rideonBombAction")
        } else if (changed.has("steeringAction")) {
            steeringAction = changed.get("steeringAction")
        }
        
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
