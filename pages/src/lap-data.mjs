import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
import * as fields from '/pages/src/fields.mjs';
const doc = document.documentElement;
const content = document.getElementById("content")
const thisLap = document.getElementById("thisLap")
const allLaps = document.getElementById("allLaps")
let sortOrder = "asc"
let currentLaps = -1;
let includeLapButton = false;


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
    fontScale: 1
});

common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
if (settings.ascDesc) {
    sortOrder = settings.ascDesc;
}
if (settings.includeLapButton) {
    includeLapButton = settings.includeLapButton;
}


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
    allLaps.innerHTML = generateLapDataTable(lapData)
    currentLaps = watching.lapCount

}

function generateLapDataTable(laps) {
    // Sort the lap data based on lap counter in ascending or descending order    
    let lapData = sortOrder == "desc" ? laps.toReversed().filter(x => x.stats.activeTime > 0) : laps.filter(x => x.stats.activeTime > 0)
    
    let tableHTML = '<table>';
    tableHTML += '<tr><th>Lap</th><th>Time</th><th>Power</th><th>HR</th></tr>';
    //console.log(lapData)
    // Loop through lap data and generate rows
    let lapCounter = sortOrder == "desc" ? lapData.length : 1;
    for (let data of lapData) {
    //lapData.forEach((data, index) => {
        //console.log(lapCounter, data)
        //const lapCounter = sortOrder == "desc" ? lapData.length - lapIndex : lapIndex;        
        const activeTime = formatTime(data.stats.activeTime.toFixed(0), 0);
        const cadenceAvg = data.stats.cadence.avg ? data.stats.cadence.avg.toFixed(0) : '-';
        const draftAvg = data.stats.draft.avg ? data.stats.draft.avg.toFixed(2) : '-';
        const hrAvg = data.stats.hr.avg ? data.stats.hr.avg.toFixed(0) : '-';
        const powerAvg = data.stats.power.avg ? data.stats.power.avg.toFixed(0) : '-';
        const speedAvg = data.stats.speed.avg ? data.stats.speed.avg.toFixed(2) : '-';
        
        // Append row to the table
        tableHTML += `<tr><td>${lapCounter}</td><td>${activeTime}</td><td>${powerAvg}</td><td>${hrAvg}</td></tr>`;
    
        sortOrder == "desc" ? lapCounter-- : lapCounter++
    };

    // Close the table
    tableHTML += '</table>';

    return tableHTML;
}

function newLap() {
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
    const numFieldsSm = 2;
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
    
    
    //debugger
    fieldRendererSm.addRotatingFields({
        mapping,
        fields: fields.fields.filter(({id}) => {
            const type = id.split('-')[1];
            return ['lap'].includes(type);
        })        
    });
    if (includeLapButton) {
        const lapButton = document.getElementById("lapButton")
        lapButton.insertAdjacentHTML('beforeend', `<button id="newLapButton">Lap</button>`)
        const newLapButton = document.getElementById("newLapButton")
        newLapButton.addEventListener('click', ev => {common.rpc.startLap()})
    }
    common.subscribe('athlete/watching', watching => {
        doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1); 
        fieldRenderer.setData(watching);
        fieldRenderer.render();                       
        fieldRendererSm.setData(watching);
        fieldRendererSm.render();
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
            changed.has("includeLapButton")
        ) {
//            sortOrder = changed.get('ascDesc');      
            location.reload()        
        }
        
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
