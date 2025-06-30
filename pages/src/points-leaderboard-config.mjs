import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
let dbSegments = await zen.openSegmentsDB();
let dbSegmentConfig = await zen.openSegmentConfigDB();
await zen.cleanupSegmentsDB(dbSegments);
await zen.cleanupSegmentsDB(dbSegments, {live: true});
await zen.cleanupSegmentConfigDB(dbSegmentConfig);
let allKnownRacers = [];
//let segmentResults = [];
let raceResults = [];
let ftsScoringResults = [];
let lastKnownSG = {
    eventSubgroupId: 0,
    eventSubgroupStart: 0
};
let lastKnownSegmentData;
let currentEventConfig;
let watchingTeam;
let refresh = Date.now() - 2000000;
const doc = document.documentElement;
doc.style.setProperty('--font-scale', (common.settingsStore.get('fontScale') * 0.5) || 0.5);  
doc.querySelector('#titlebar').classList.add('always-visible');

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
    onlyTotalPoints: false,
    lastKnownSG: {
        eventSubgroupId: 0,
        eventSubgroupStart: 0
    },
    showTeamBadges: true,
    badgeScale: 0.7
});

let settings = common.settingsStore.get();
console.log(settings)
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

const formatTime = (milliseconds,timePrecision) => {
    milliseconds = Math.round(milliseconds * 1000);
    const ms = milliseconds.toString().padStart(3, "0").substr(-3).slice(0,timePrecision);    
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0)
    {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    if (minutes != 0)
    {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0") + "." + ms;
    }
    else
    {
        return seconds.toString().padStart(1, "0") + "." + ms;
    }
}



function getUniqueValues(arr, property) {
    const uniqueValues = [];
    const map = new Map();
  
    for (const item of arr) {
      if (!map.has(item[property])) {
        map.set(item[property], true);   
        uniqueValues.push(item[property]);
      }
    }
  
    return uniqueValues;
  }





function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', (common.settingsStore.get('fontScale') * 0.5) || 1);  
}
function changeBadgeScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--badge-scale', common.settingsStore.get('badgeScale') || 0.7);  
}

function showSegments(allEventConfigs) {
    const penSelect = document.getElementById("selectPen");
    const segmentDataDiv = document.getElementById("segmentData");
    const eventSubgroupId = parseInt(penSelect.value);        
    const sgConfig = allEventConfigs.find(x => x.eventSubgroupId == eventSubgroupId)
    document.getElementById("customTitle").style.display = "block";
    console.log(sgConfig)
    const overrideConfig = settings.configOverride ? JSON.parse(settings.configOverride) : null;
    console.log(overrideConfig)
    let customScoring = false;
    if (overrideConfig?.eventSubgroupId == eventSubgroupId) {
        customScoring = true
        
        document.getElementById("customTitleInput").value = overrideConfig.customTitle || "";
    }
    let tableOutput = `<table id='segmentsTable' value='${eventSubgroupId}' class='customScoring'>`
    for (let segment of sgConfig.segments) {
        const disabledInConfig = segment.enabled ? false : true;
        if (customScoring) {
            const thisSegmentConfig = overrideConfig.segments.find(x => x.segmentId == segment.segmentId && x.repeat == segment.repeat);
            if (thisSegmentConfig) {
                segment.enabled = segment.enabled ? thisSegmentConfig.enabled : false;
            }
        }
        tableOutput += `<tr><td>${segment.name} [${segment.repeat}]</td>
            <td style='display:none'>${segment.segmentId}</td>
            <td style='display:none'>${segment.repeat}</td>
            <td><input type="checkbox" ${segment.enabled ? 'checked' : ''} ${disabledInConfig ? 'disabled' : ''}></td>            
            </tr>`;
    }
    tableOutput += "</table>";
    segmentDataDiv.innerHTML = tableOutput;
    segmentDataDiv.addEventListener("change", saveConfig);
    //debugger
}

function saveConfig() {
    const segmentsTable = document.getElementById("segmentsTable");
    const customTitle = document.getElementById("customTitleInput").value;
    if (segmentsTable) {
        const tableRows = segmentsTable.querySelectorAll("tr");
        const segData = [];
        const eventSgConfig = {
            eventSubgroupId: parseInt(segmentsTable.getAttribute("value")),
            customTitle: customTitle,
            segments: []
        }
        for (let row of tableRows) {
            const segConfig = {
                name: row.cells[0].textContent.replace(/\s\[\d+\]$/, ""),
                segmentId: row.cells[1].textContent,
                repeat: parseInt(row.cells[2].textContent),
                enabled: row.cells[3].querySelector('input').checked
            }
            segData.push(segConfig);
        }
        eventSgConfig.segments = segData;
        console.log("eventSgConfig", eventSgConfig);
        const jsonSgConfig = JSON.stringify(eventSgConfig);
        common.settingsStore.set("configOverride", jsonSgConfig);
        //debugger
    }
    
}

export async function main() {
    common.initInteractionListeners();  
    const eventsListDiv = document.getElementById("eventsList");
    const penListDiv = document.getElementById("penList");
    const pointsViewDiv = document.getElementById("pointsView");  
    //const pointsResultsDiv = document.getElementById("pointsResults")
    const pointsViewRefresh = document.getElementById("refreshButton") 
    const allEventConfigs = await zen.getEventConfig(dbSegmentConfig)
    console.log("allEventConfigs", allEventConfigs)
    const customTitleDiv = document.getElementById("customTitle");
    customTitleDiv.addEventListener("change", saveConfig);
    let eventData = [];
    for (let eventConfig of allEventConfigs) {
        const sauceEvent = await common.rpc.getEvent(eventConfig.eventId)
        eventData.push(sauceEvent)
    }
    eventData.sort((a,b) => {
        return a.eventStart > b.eventStart;
    })
    console.log("eventData", eventData)
    let selectEvents = "<select id='selectEvent'><option value='-1'>Select an event</option>"
    const optionIds = new Set();
    for (let event of eventData) {
        if (!optionIds.has(event.id)) {
            optionIds.add(event.id)
            const eventStartTime = new Date(event.eventStart)
            const eventText = eventStartTime.toLocaleTimeString(undefined, {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short'
            }) + " - " + event.name;
            selectEvents += `<option value=${event.id}>${eventText}</option>`
        }
    }
    selectEvents += "</select>"    
    eventsListDiv.innerHTML = selectEvents;
    eventsListDiv.addEventListener("change", async function() {
        penListDiv.innerHTML = "";
        //pointsResultsDiv.innerHTML = "";
        const selectEvent = document.getElementById("selectEvent");
        const eventDetails = eventData.find(x => x.id == selectEvent.value)
        //debugger
        eventDetails.eventSubgroups.sort((a,b) => {
            if (a.subgroupLabel > b.subgroupLabel) return 1;
            if (a.subgroupLabel < b.subgroupLabel) return -1;
            return 0;
        })
        let selectPenList = "<select id='selectPen'><option value='-1'>Select a pen</option>"
        for (let pen of eventDetails.eventSubgroups) {
            //debugger
            const sgConfig = allEventConfigs.find(x => x.eventSubgroupId == pen.id)
            if (sgConfig) {
                const rangeAccessLabel = pen.rangeAccessLabel ? `(${pen.rangeAccessLabel})` : "";
                selectPenList += `<option value='${pen.id}'>${pen.subgroupLabel} ${rangeAccessLabel}</option>`
            }
        }
        selectPenList += "</select>"
        penListDiv.innerHTML = selectPenList;
        penListDiv.addEventListener("change", function() {
            showSegments(allEventConfigs)
        })
        const watching = await common.rpc.getAthleteData("watching")
    if (watching) {
        const selectPen = document.getElementById("selectPen");
        const eventSubgroupId = watching.state.eventSubgroupId;
        if (eventSubgroupId > 0) {
            const sg = await common.rpc.getEventSubgroup(eventSubgroupId)
            //debugger
            selectPen.value = sg.id
            const penList = document.getElementById("penList");
            const event = new Event('change')
            penList.dispatchEvent(event)
        } else {
            const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
            if (signedUp.length > 0) {
                const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
                selectPen.value = sg.id
                const penList = document.getElementById("penList");
                const event = new Event('change')
                penList.dispatchEvent(event)
            }
            //debugger
        }
    }
    })
    const watching = await common.rpc.getAthleteData("watching")
    if (watching) {
        const selectEvent = document.getElementById("selectEvent");
        const eventSubgroupId = watching.state.eventSubgroupId;
        if (eventSubgroupId > 0) {
            const sg = await common.rpc.getEventSubgroup(eventSubgroupId)
            //debugger
            selectEvent.value = sg.eventId
            const eventsList = document.getElementById("eventsList");
            const event = new Event('change')
            eventsList.dispatchEvent(event)
        } else {
            const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
            if (signedUp.length > 0) {
                const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
                selectEvent.value = sg.eventId
                const eventsList = document.getElementById("eventsList");
                const event = new Event('change')
                eventsList.dispatchEvent(event)
            }
            //debugger
        }
    }
    //debugger
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        } 
        if (changed.has('fontScale')) {
            changeFontScale();
        }
        if (changed.has('badgeScale')) {
            changeBadgeScale();
        }
        settings = common.settingsStore.get();
    });
    //changeBadgeScale();
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
