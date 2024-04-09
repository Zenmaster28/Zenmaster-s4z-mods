import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
const doc = document.documentElement;
const content = document.getElementById("content")
let includeLapButton = true;
let includeSetButton = true;
let lapHotkey = true;
let setHotkey = true;
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
    includeLapButton: true,
    includeSetButton: true,
    lapHotkey: true,
    setHotkey: true
});
common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
includeLapButton = settings.includeLapButton;
includeSetButton = settings.includeSetButton;
lapHotkey = settings.lapHotkey;
setHotkey = settings.setHotkey;

if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

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
    if (includeLapButton) {
        const lapButton = document.getElementById("lapButton")
        lapButton.insertAdjacentHTML('beforeend', `<button id="newLapButton"><small>+</small>Lap</button>`)
        const newLapButton = document.getElementById("newLapButton")
        newLapButton.addEventListener('click', ev => {common.rpc.startLap()})
        newLapButton.className = "controlButton"        
    }
    if (lapHotkey) {
        window.addEventListener('keydown', function(event) {
            if (event.key === 'l') {
                common.rpc.startLap();
            }
        })
    }
    if (includeSetButton) {
        const setButton = document.getElementById("lapButton")
        setButton.insertAdjacentHTML('beforeend', `<button id="newSetButton"><small>+</small>Set</button>`)
        const newSetButton = document.getElementById("newSetButton")
        newSetButton.addEventListener('click', newSet);
        newSetButton.className = "controlButton"        
    }
    if (setHotkey) {
        window.addEventListener('keydown', function(event) {
            if (event.key === 's') {
                newSet();
            }
        })
    }

    common.subscribe('athlete/watching', watching => {
        doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);         
    });    
    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has("includeLapButton") ||
            changed.has("includeSetButton") ||
            changed.has("lapHotkey") ||
            changed.has("setHotkey")
        ) {//          
            location.reload()        
        }
        
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
