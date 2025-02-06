import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
//zen.buildPointsForm();
//zen.buildSegmentsTable()
let sgStartTime;
let dbSegmentConfig = await zen.openSegmentConfigDB();
import {settingsMain} from './points-leaderboard.mjs';
settingsMain();
document.body.classList.remove("transparent-bg");
const scoreFormatDiv = document.getElementById("scoreFormats");
scoreFormatDiv.innerHTML += `
    <b>Score Formats</b></br>
    <span class="scoreLabel">FTS:</span> 
    <input disabled type="text" id="ftsScoreFormat" size="18" title="Examples are 10..1 which would score 10 for 1st, 9 for 2nd etc.  Comma separated values such as 15,11,9 would score as 15 for 1st, 11 for 2nd, 9 for 3rd.  Formats can be combined like 20,15,10,7..1" placeholder="Select event first">
    <select disabled id="ftsStep" title="The amount to decrease points per rider when using ..  ie. 50..1 with -2 would score as 50, 48, 46 etc.">
        <option value="1">-1</option>
        <option value="2">-2</option>
        <option value="3">-3</option>
        <option value="4">-4</option>
        <option value="5">-5</option>
    </select>
    <input disabled type="text" id="ftsBonus" size="18" title="Add any podium bonus points here. ie. 5,3,1 would award 5 extra points for 1st, 3 for 2nd, 1 for 3rd" placeholder="Bonus points (if any)">
    <br>
    <span class="scoreLabel">FAL:</span> 
    <input disabled type="text" id="falScoreFormat" size="18" title="Examples are 10..1 which would score 10 for 1st, 9 for 2nd etc.  Comma separated values such as 15,11,9 would score as 15 for 1st, 11 for 2nd, 9 for 3rd.  Formats can be combined like 20,15,10,7..1" placeholder="Select event first">
    <select disabled id="falStep" title="The amount to decrease points per rider when using ..  ie. 50..1 with -2 would score as 50, 48, 46 etc.">
        <option value="1">-1</option>
        <option value="2">-2</option>
        <option value="3">-3</option>
        <option value="4">-4</option>
        <option value="5">-5</option>
    </select>
    <input disabled type="text" id="falBonus" size="18" title="Add any podium bonus points here. ie. 5,3,1 would award 5 extra points for 1st, 3 for 2nd, 1 for 3rd" placeholder="Bonus points (if any)">
    <br>
    <span class="scoreLabel">FIN:</span> 
    <input disabled type="text" id="finScoreFormat" size="18" title="Examples are 10..1 which would score 10 for 1st, 9 for 2nd etc.  Comma separated values such as 15,11,9 would score as 15 for 1st, 11 for 2nd, 9 for 3rd.  Formats can be combined like 20,15,10,7..1" placeholder="Select event first">
    <select disabled id="finStep" title="The amount to decrease points per rider when using ..  ie. 50..1 with -2 would score as 50, 48, 46 etc.">
        <option value="1">-1</option>
        <option value="2">-2</option>
        <option value="3">-3</option>
        <option value="4">-4</option>
        <option value="5">-5</option>
    </select>
    <input disabled type="text" id="finBonus" size="18" title="Add any podium bonus points here. ie. 5,3,1 would award 5 extra points for 1st, 3 for 2nd, 1 for 3rd" placeholder="Bonus points (if any)">
    <br>
    <hr>
`


const eventsListDiv = document.getElementById("eventsList");
const allEvents = await common.rpc.getCachedEvents();
const eventsSelect = document.createElement('select')
eventsSelect.id = "eventsSelect"
eventsSelect.style.maxWidth = '27em';
const optChoose = document.createElement('option')
optChoose.textContent = "Click to select an event to configure";
optChoose.value = -1;
eventsSelect.appendChild(optChoose);
let eventInfo;
for (let event of allEvents) {
    const eventStartTime = new Date(event.eventStart)
    const opt = document.createElement('option')
    opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    }) + " - " + event.name;
    opt.value = event.id
    eventsSelect.appendChild(opt)
}
eventsListDiv.appendChild(eventsSelect)
const eventText = document.createElement('input');
eventText.type = "text";
eventText.id = "eventText";
eventText.title = "Enter an event ID (from the URL on Zwiftpower) to find an event not in the list"
eventText.style.width = "8em"
eventText.placeholder = "or event ID"
eventsListDiv.appendChild(eventText);
eventText.addEventListener("change", async function() {
    const eventTextDiv = document.getElementById("eventText");
    let eventIdSearch = eventTextDiv.value;
    if (eventIdSearch != "") {
        eventIdSearch = parseInt(eventIdSearch)
        //const eventDetails = await common.rpc.getEvent(eventIdSearch);
        let eventDetails;
        try {
            eventDetails = await common.rpc.getEvent(eventIdSearch);
            //return await this.fetchJSON(`/api/profiles/${id}`, options);
        } catch(e) {
            console.log("EventId not found", eventIdSearch)                        
        }
        if (eventDetails) {
            const eventStartTime = new Date(eventDetails.eventStart)
            const eventsSelect = document.getElementById("eventsSelect")
            const opt = document.createElement('option')
            opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short'
            }) + " - " + eventDetails.name;
            opt.value = eventDetails.id
            eventsSelect.appendChild(opt)
            eventsSelect.value = eventDetails.id
            const event = new Event('change')
            eventsSelect.dispatchEvent(event)
        }
    }
})
const watching = await common.rpc.getAthleteData("watching")

const penListDiv = document.getElementById('penList');
const segmentsSaveDiv = document.getElementById('segmentsSave');
const segmentsTableDiv = document.getElementById('segmentsList');
const segmentsHeaderDiv = document.getElementById('segmentsHeader');
const ftsScoreFormatDiv = document.getElementById('ftsScoreFormat');
const ftsStepDiv = document.getElementById('ftsStep');
const ftsBonusDiv = document.getElementById('ftsBonus');
const falScoreFormatDiv = document.getElementById('falScoreFormat');
const falStepDiv = document.getElementById('falStep');
const falBonusDiv = document.getElementById('falBonus');
const finScoreFormatDiv = document.getElementById('finScoreFormat');
const finStepDiv = document.getElementById('finStep');
const finBonusDiv = document.getElementById('finBonus');
const eventTextDiv = document.getElementById('eventText'); 
const sampleScoring = document.getElementById('sampleScoring');
sampleScoring.innerHTML = "Sample Scoring";           
eventsSelect.addEventListener('change', async function() {
    segmentsTableDiv.innerHTML = "";
    penListDiv.innerHTML = "";
    segmentsSaveDiv.innerHTML = "";
    segmentsHeaderDiv.innerHTML = "";
    ftsScoreFormatDiv.value = "";
    falScoreFormatDiv.value = "";
    finScoreFormatDiv.value = "";
    eventTextDiv.value = "";
    ftsBonusDiv.value = "";
    falBonusDiv.value = "";
    finBonusDiv.value = "";
    ftsStepDiv.value = 1;
    falStepDiv.value = 1;
    finStepDiv.value = 1;
    sampleScoring.innerHTML = "Sample Scoring";
    if (this.value != -1) {
        eventInfo = await common.rpc.getEvent(parseInt(this.value))
        eventInfo.eventSubgroups.sort((a,b) => {
            if (a.subgroupLabel > b.subgroupLabel) return 1;
            if (a.subgroupLabel < b.subgroupLabel) return -1;
            return 0;
        })
        //debugger
        const penSelect = document.createElement('select');
        penSelect.id = "penSelect"
        if (eventInfo) {
            sgStartTime = eventInfo.ts;
            console.log(eventInfo)
            
            const optText = document.createElement('option');
            optText.textContent = "Select a pen"
            optText.value = -1
            penSelect.appendChild(optText)
            for (let sg of eventInfo.eventSubgroups) {
                const optPen = document.createElement('option')
                optPen.value = sg.id;
                optPen.textContent = sg.subgroupLabel;
                penSelect.appendChild(optPen)
            }
            penListDiv.appendChild(penSelect)
        }
        penSelect.addEventListener('change', async function() {
            const sg = eventInfo.eventSubgroups.find(x => x.id == this.value)
            if (sg) {                            
                const currentEventConfig = await zen.getEventConfig(dbSegmentConfig, sg.id)                            
                console.log(currentEventConfig)
                if (currentEventConfig) {
                    ftsScoreFormatDiv.value = currentEventConfig.ftsScoreFormat;
                    falScoreFormatDiv.value = currentEventConfig.falScoreFormat;
                    finScoreFormatDiv.value = currentEventConfig.finScoreFormat;
                    ftsStepDiv.value = currentEventConfig.ftsStep;
                    falStepDiv.value = currentEventConfig.falStep;
                    finStepDiv.value = currentEventConfig.finStep;
                    ftsBonusDiv.value = currentEventConfig.ftsBonus;
                    falBonusDiv.value = currentEventConfig.falBonus;
                    finBonusDiv.value = currentEventConfig.finBonus;
                    const sampleScoring = document.getElementById('sampleScoring');
                    sampleScoring.innerHTML = "Sample Scoring";
                    sampleScoring.innerHTML = showSampleScoring(currentEventConfig);
                } else {
                    ftsScoreFormatDiv.value = "";    
                    falScoreFormatDiv.value = "";
                    finScoreFormatDiv.value = "";
                    ftsBonusDiv.value = "";
                    falBonusDiv.value = "";
                    finBonusDiv.value = "";
                    ftsStepDiv.value = 1;
                    falStepDiv.value = 1;
                    finStepDiv.value = 1;
                    const sampleScoring = document.getElementById('sampleScoring');
                    sampleScoring.innerHTML = "Sample Scoring";
                }                            
                ftsScoreFormatDiv.disabled = false;
                ftsScoreFormatDiv.placeholder = "";                            
                falScoreFormatDiv.disabled = false;
                falScoreFormatDiv.placeholder = "";                            
                finScoreFormatDiv.disabled = false;
                finScoreFormatDiv.placeholder = "";
                ftsBonusDiv.disabled = false;      
                falBonusDiv.disabled = false;
                finBonusDiv.disabled = false;
                ftsStepDiv.disabled = false;
                falStepDiv.disabled = false;
                finStepDiv.disabled = false;
                const routeData = await zen.processRoute(sg.courseId, sg.routeId, sg.laps, sg.distanceInMeters, false, false, false)
                let segmentData = routeData.markLines                            
                segmentData = segmentData.filter(x => x.type != "custom" && !x.name.includes("Finish"));
                segmentData.sort((a,b) => {
                    if (a.markLine > b.markLine) {
                        return 1
                    } else {
                        return -1
                    }
                });
                const segmentsTable = await zen.buildPointsTable(segmentData, currentEventConfig)                    
                segmentsTableDiv.innerHTML = "";
                segmentsSaveDiv.innerHTML = "";
                eventTextDiv.value = "";
                segmentsHeaderDiv.innerHTML = "<h2>" + routeData.routeFullData.name + " in " + common.courseToNames[routeData.routeFullData.courseId]
                segmentsTableDiv.appendChild(segmentsTable)
                ftsScoreFormatDiv.addEventListener('change', saveConfig);
                ftsStepDiv.addEventListener('change', saveConfig);
                ftsBonusDiv.addEventListener('change', saveConfig);
                falScoreFormatDiv.addEventListener('change', saveConfig);
                falStepDiv.addEventListener('change', saveConfig);
                falBonusDiv.addEventListener('change', saveConfig);
                finScoreFormatDiv.addEventListener('change', saveConfig);
                finStepDiv.addEventListener('change', saveConfig);
                finBonusDiv.addEventListener('change', saveConfig);
                const segTable = document.getElementById('segmentsTable')
                segTable.addEventListener('change', saveConfig);
            }
            //debugger
        })
        if (watching) {
            const eventSubgroupId = watching.state.eventSubgroupId;
            if (eventSubgroupId > 0) {
                const validOption = Array.from(penSelect.options).some(option => option.value == eventSubgroupId)
                if (validOption) {
                    penSelect.value = eventSubgroupId
                    const event = new Event('change')
                    penSelect.dispatchEvent(event)
                }
            } else {
                const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
                if (signedUp.length > 0) {
                    //debugger
                    //console.log("Selecting pen")
                    const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
                    console.log(sg)
                    const validOption = Array.from(penSelect.options).some(option => option.value == sg.id)
                    if (validOption) {
                        penSelect.value = sg.id
                        const event = new Event('change')
                        penSelect.dispatchEvent(event)
                    }
                }
            }
            //debugger
        }
    }
});
if (watching) {
    const eventSubgroupId = watching.state.eventSubgroupId;
    if (eventSubgroupId > 0) {
        const sg = await common.rpc.getEventSubgroup(eventSubgroupId)
        eventsSelect.value = sg.eventId
        const event = new Event('change')
        eventsSelect.dispatchEvent(event)
    } else {
        const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
        if (signedUp.length > 0) {
            const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
            eventsSelect.value = sg.eventId
            const event = new Event('change')
            eventsSelect.dispatchEvent(event)
        }
        //debugger
    }
    //debugger
}
function saveConfig() {
    //console.log("Saving eventConfig")
    const segmentsTable = document.getElementById('segmentsTable');
    const sampleScoring = document.getElementById('sampleScoring');
    sampleScoring.innerHTML = "Sample Scoring";
    if (segmentsTable) {
        const tableRows = segmentsTable.querySelectorAll('tr')
        const segData = [];
        for (let row of tableRows) {
            const segConfig = {
                name: row.cells[0].textContent.replace(/\s\[\d+\]$/, ""),
                segmentId: row.cells[1].textContent,
                repeat: parseInt(row.cells[2].textContent),
                enabled: row.cells[3].querySelector('input').checked,
                scoreFormat: row.cells[4].querySelector('select').value
            }
            segData.push(segConfig);
        }
        const eventConfig = {
            ftsScoreFormat: document.getElementById('ftsScoreFormat').value,
            ftsStep: document.getElementById('ftsStep').value,
            ftsBonus: document.getElementById('ftsBonus').value,
            falScoreFormat: document.getElementById('falScoreFormat').value,
            falStep: document.getElementById('falStep').value,
            falBonus: document.getElementById('falBonus').value,
            finScoreFormat: document.getElementById('finScoreFormat').value,
            finStep: document.getElementById('finStep').value,
            finBonus: document.getElementById('finBonus').value,
            eventId: parseInt(document.getElementById('eventsSelect').value),
            eventSubgroupId: parseInt(document.getElementById('penSelect').value),
            segments: segData,
            ts: sgStartTime
        }
        const transaction = dbSegmentConfig.transaction("segmentConfig", "readwrite");
        const store = transaction.objectStore("segmentConfig")
        const request = store.put(eventConfig);
        request.onsuccess = function () {                    
            console.log("Event config saved:", eventConfig.eventSubgroupId, eventConfig);                        
            sampleScoring.innerHTML = showSampleScoring(eventConfig);
        };
        request.onerror = function (event) {
            console.error("Failed to save event config:", event.target.error);
        };
    } else {
        console.log("No segments defined / no pen selected")
    }
    //debugger
}
function showSampleScoring(eventConfig) {
    const falScoreFormat = zen.getScoreFormat(eventConfig.falScoreFormat, eventConfig.falStep)
    const falBonus = zen.getScoreFormat(eventConfig.falBonus, 1)
    const ftsScoreFormat = zen.getScoreFormat(eventConfig.ftsScoreFormat, eventConfig.ftsStep)
    const ftsBonus = zen.getScoreFormat(eventConfig.ftsBonus, 1)
    const finScoreFormat = zen.getScoreFormat(eventConfig.finScoreFormat, eventConfig.finStep)
    const finBonus = zen.getScoreFormat(eventConfig.finBonus, 1)
    const maxScoring = Math.max(falScoreFormat.length, ftsScoreFormat.length, finScoreFormat.length)
    let sampleOutput = "Sample Scoring<br><table><tr><th>Rank</th><th>FTS</th><th>FAL</th><th>FIN</th></tr>";
    for (let i = 0; i < maxScoring; i++) {
        sampleOutput += `<tr><td>${i + 1}</td><td>${(ftsScoreFormat[i] || 0) + (ftsBonus[i] || 0)}</td><td>${(falScoreFormat[i] || 0) + (falBonus[i] || 0)}</td><td>${(finScoreFormat[i] || 0) + (finBonus[i] || 0)}</td></tr>`
    }
    sampleOutput += "</table>"
    return sampleOutput;
}