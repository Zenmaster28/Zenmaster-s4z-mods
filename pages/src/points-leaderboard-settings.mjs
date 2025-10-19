import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
//zen.buildPointsForm();
//zen.buildSegmentsTable()
let sgStartTime;
let dbSegmentConfig = await zen.openSegmentConfigDB();
import {settingsMain} from './points-leaderboard.mjs';
settingsMain();
common.settingsStore.set("formatsChanged", false);
common.settingsStore.set("preview", false);
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
    <span title="Score FTS once per segment for the whole event">FTS per event/ZRL style </span><input type="checkbox" id="ftsPerEvent" title="Score FTS once per segment for the whole event">
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
    <span id="savedFormatsSpan" style="visibility:hidden" class="scoreLabel">Load:</span>
    <select id="savedFormats" style="visibility: hidden;">
        <option value="-1"></option>
    </select>
    <input type="text" id="formatName" size="10" style="visibility:hidden" spellcheck="false">
    <input type="button" id="buttonSaveFormat" value="&#x1F4BE;" class="zenButton" style="visibility:hidden" title="Save">
    <input type="button" id="buttonDeleteFormat" value="&#x274C;" class="zenButton" style="visibility:hidden" title="Delete">        
    <input type="button" id="buttonImportExport" style="visibility:hidden" class="zenButton" value="&#x21B9;" title="Import/Export">
    <hr>
`
let currentSg;
let currentSgEntrants;
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
const self = await common.rpc.getAthlete("self")
const selfTeam = self.team || "";
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
const formatName = document.getElementById("formatName")
const savedFormatsSelect = document.getElementById("savedFormats");
const buttonSaveFormat = document.getElementById("buttonSaveFormat");
const buttonDeleteFormat = document.getElementById("buttonDeleteFormat");
const buttonImportExport = document.getElementById("buttonImportExport");
const cbPreview = document.getElementById("cbPreview");
const teamMatesDiv = document.getElementById("teamMates");
const nonTeammatesDiv = document.getElementById("nonTeammates");
const teamNamesSetting = document.getElementById("teamNames");
const highlightTeammateSetting = document.getElementById("highlightTeammate");
const ftsPerEvent = document.getElementById("ftsPerEvent");
let allCats = false;

async function loadSavedScoreFormats(action) {    
    const zenScoreFormats = zen.scoreFormats;
    const dbScoreFormats = await zen.getSavedScoreFormats(dbSegmentConfig);
    const scoreFormats = [...zenScoreFormats, ...dbScoreFormats]
    scoreFormats.sort((a,b) => a.name.localeCompare(b.name));
    console.log("merged score formats", scoreFormats)    
    savedFormatsSelect.options.length = 1;
    for (let format of scoreFormats) {
        const opt = document.createElement("option")
        opt.value = format.name
        opt.text = format.name
        savedFormatsSelect.appendChild(opt)
    }
    if (action == "delete") {
        savedFormatsSelect.value = -1;
        formatName.value = "";
        buttonSaveFormat.title = `Save`
        buttonDeleteFormat.title = `Delete`
    } else if (action == "save") {
        savedFormatsSelect.value = formatName.value;
        buttonSaveFormat.title = `Save '${formatName.value}'`
        buttonDeleteFormat.title = `Delete '${formatName.value}'`
    }
    return scoreFormats;
}
teamNamesSetting.addEventListener("change", function() {
    getTeammates(true);
});
highlightTeammateSetting.addEventListener("change", function() {
    if (this.checked) {
        teamMatesDiv.style.visibility = "";   
        getTeammates(true);     
    } else {
        teamMatesDiv.style.visibility = "hidden";
        nonTeammatesDiv.style.visibility = "hidden";
    }
});
let scoreFormats = await loadSavedScoreFormats();
savedFormatsSelect.addEventListener("change", function() {
    const selectedformatName = scoreFormats.find(x => x.name == savedFormatsSelect.value)
    ftsScoreFormatDiv.value = selectedformatName.fts;
    ftsStepDiv.value = parseInt(selectedformatName.ftsStep);
    ftsBonusDiv.value = selectedformatName.ftsBonus;
    falScoreFormatDiv.value = selectedformatName.fal;
    falStepDiv.value = parseInt(selectedformatName.falStep);
    falBonusDiv.value = selectedformatName.falBonus;
    finScoreFormatDiv.value = selectedformatName.fin;
    finStepDiv.value = parseInt(selectedformatName.finStep);
    finBonusDiv.value = selectedformatName.finBonus;
    formatName.value = selectedformatName.name;
    buttonSaveFormat.title = `Save '${formatName.value}'`
    buttonDeleteFormat.title = `Delete '${formatName.value}'`
    ftsPerEvent.checked = selectedformatName.ftsPerEvent;
    saveConfig();
});
buttonSaveFormat.addEventListener("click", function() {
    if (formatName.value != "") {
        const newFormat = {
            name: formatName.value,
            fts: ftsScoreFormatDiv.value,
            ftsStep: ftsStepDiv.value,
            ftsBonus: ftsBonusDiv.value,
            fal: falScoreFormatDiv.value,
            falStep: falStepDiv.value,
            falBonus: falBonusDiv.value,
            fin: finScoreFormatDiv.value,
            finStep: finStepDiv.value,
            finBonus: finBonusDiv.value,
            ftsPerEvent: ftsPerEvent.checked
        };
        console.log("newFormat",newFormat);
        const transaction = dbSegmentConfig.transaction("scoringConfig", "readwrite");
        const store = transaction.objectStore("scoringConfig")
        const request = store.put(newFormat);
        request.onsuccess = async function () {                    
            console.log("Scoring format saved:", formatName.value, newFormat);  
            scoreFormats = await loadSavedScoreFormats("save");       
        };
        request.onerror = function (event) {
            console.error("Failed to save scoring format:", event.target.error);
        };

    } else {
        console.log("enter a name");
    }
});
buttonDeleteFormat.addEventListener("click", function() {
    if (formatName.value != "") {
        const transaction = dbSegmentConfig.transaction("scoringConfig", "readwrite");
        const store = transaction.objectStore("scoringConfig");
        const request = store.delete(formatName.value);
        request.onsuccess = async function () {
            console.log(`Deleted entry with name: ${formatName.value}`);
            scoreFormats = await loadSavedScoreFormats("delete"); 
        };
    
        request.onerror = function () {
            console.error("Error deleting entry:", request.error);
        };
    } else {
        console.log("Format name is empty")
    }
});
buttonImportExport.addEventListener("click", function() {
    window.open("points-leaderboard-import-export.html?width=1150&height=500&child-window", "_blank")
})
formatName.addEventListener("input", function() {
    const matchingOption = Array.from(savedFormatsSelect.options).find(option => option.value == formatName.value)
    if (matchingOption && matchingOption.value != "-1") {
        console.log("found a matching option!", matchingOption)
        savedFormatsSelect.value = matchingOption.value;
        buttonSaveFormat.title = `Save '${formatName.value}'`
        buttonDeleteFormat.title = `Delete '${formatName.value}'`
        //debugger
    } else {
        savedFormatsSelect.value = "-1"
        buttonSaveFormat.title = `Save '${formatName.value}'`
        buttonDeleteFormat.title = `Delete`
    }
})

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
    teamMatesDiv.innerHTML = "";
    nonTeammatesDiv.innerHTML = "";
    nonTeammatesDiv.style.visibility = "hidden";
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
            const allSameRoute = eventInfo.eventSubgroups.every(
                (obj, _, arr) => obj.routeId === arr[0].routeId && obj.laps === arr[0].laps
            );
            if (allSameRoute && eventInfo.eventSubgroups.length > 1) {
                const optAll = document.createElement('option');
                optAll.textContent = "All categories"
                optAll.value = -2
                penSelect.appendChild(optAll)
            } else {
                console.log("Differing routes or only one category so excluding All Categories option for", eventInfo.name)
            }
            for (let sg of eventInfo.eventSubgroups) {
                const optPen = document.createElement('option')
                optPen.value = sg.id;
                optPen.textContent = sg.subgroupLabel;
                penSelect.appendChild(optPen)
            }
            penListDiv.appendChild(penSelect)
        }        
        penSelect.addEventListener('change', async function() {
            let penValue = this.value;
            allCats = false;
            if (penValue == -2) {
                allCats = true;
                penValue = this.options[2].value
            }
            //console.log("penValue", penValue, "allCats", allCats)
            //sg = eventInfo.eventSubgroups.find(x => x.id == penValue)
            currentSg = eventInfo.eventSubgroups.find(x => x.id == penValue)
            if (currentSg) {                            
                const currentEventConfig = await zen.getEventConfig(dbSegmentConfig, currentSg.id)                            
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
                    sampleScoring.innerHTML = await showSampleScoring(currentEventConfig);
                    ftsPerEvent.checked = currentEventConfig.ftsPerEvent;
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
                    ftsPerEvent.checked = false;
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
                savedFormatsSelect.style.visibility = "";
                savedFormatsSpan.style.visibility = "";
                buttonSaveFormat.style.visibility = "";
                buttonDeleteFormat.style.visibility = "";
                buttonImportExport.style.visibility = "";                
                formatName.style.visibility = "";
                const routeData = await zen.processRoute(currentSg.courseId, currentSg.routeId, currentSg.laps, currentSg.distanceInMeters, false, false, false)
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
                ftsPerEvent.addEventListener('change', saveConfig);
            }    
            const settings = common.settingsStore.get();
            if (settings.highlightTeammate && settings.teamNames != "") {
                const sgEntrants = await common.rpc.getEventSubgroupEntrants(currentSg.id);
                currentSgEntrants = sgEntrants;
                getTeammates();
            }
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
                        console.log("selecting pen for current user")
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
cbPreview.addEventListener('change', function() {
    if (this.checked) {
        common.settingsStore.set("preview", true)
    } else {
        common.settingsStore.set("preview", false)
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
async function getTeammates(noToggle = false) {
    //console.log("noToggle", noToggle)
    if (!currentSg) {
        console.log("no sg set")
        return;
    }
    const settings = common.settingsStore.get();
    if (!currentSgEntrants) {
        const sgEntrants = await common.rpc.getEventSubgroupEntrants(currentSg.id);
        currentSgEntrants = sgEntrants;
    }
    const sgEntrants = [...currentSgEntrants];
    const sgTeammates = sgEntrants.filter(x => zen.isTeammate(x, settings.teamNames, selfTeam))
    const nonTeammates = sgEntrants.filter(x => !zen.isTeammate(x, settings.teamNames, selfTeam))
    sgTeammates.sort((a,b) => a.athlete.sanitizedFullname.localeCompare(b.athlete.sanitizedFullname));
    nonTeammates.sort((a,b) => a.athlete.sanitizedFullname.localeCompare(b.athlete.sanitizedFullname));
    console.log("sgTeammates", sgTeammates, "nonTeammates", nonTeammates)
    teamMatesDiv.innerHTML = "<center>Teammates: " + sgTeammates.length + "</center>";
    let tableOut = `<table><tr>`
    for (let tm of sgTeammates) {
        const teamBadge = tm.athlete.team ? common.teamBadge(tm.athlete.team) : "";
        tableOut += `<td>${tm.athlete.sanitizedFullname}</td><td>${teamBadge}</td><td>${tm.athlete.id}</td></tr>`
    }
    tableOut += "</table>"
    teamMatesDiv.innerHTML += tableOut;
    teamMatesDiv.innerHTML += "<hr><center><span id='otherEntrants'>&#x21CA;&nbsp;&nbsp;Other entrants: " + nonTeammates.length + "&nbsp;&nbsp;&#x21CA;</span></center>";
    const otherEntrants = document.getElementById('otherEntrants');
       
    otherEntrants.addEventListener('click', function() { 
        let tableOutOther = `<table><tr>`
        console.log("nonTeammates", nonTeammates)
        for (let tm of nonTeammates) {
            const teamBadge = tm.athlete.team ? common.teamBadge(tm.athlete.team) : "";
            tableOutOther += `<td>${tm.athlete.sanitizedFullname}</td><td>${teamBadge}</td><td>${tm.athlete.id}</td></tr>`
        }
        tableOutOther += "</table>"     
        nonTeammatesDiv.innerHTML = tableOutOther;  
        //console.log("noToggle", noToggle) 
        if (nonTeammatesDiv.style.visibility == "hidden") {
            if (!noToggle) {
                nonTeammatesDiv.style.visibility = "";
                otherEntrants.innerHTML = "&#x21C8;&nbsp;&nbsp;Other entrants: " + nonTeammates.length + "&nbsp;&nbsp;&#x21C8;";
            }               
        } else {
            if (!noToggle) {
                nonTeammatesDiv.style.visibility = "hidden";
                otherEntrants.innerHTML = "&#x21CA;&nbsp;&nbsp;Other entrants: " + nonTeammates.length + "&nbsp;&nbsp;&#x21CA;";
            }
        }
    });
    if (!noToggle) {
        //console.log("!noToggle")
        
    } else {
        //console.log("noToggle")
        const event = new Event('click')
        otherEntrants.dispatchEvent(event)
    }
    noToggle = false;
}
function saveConfig() {
    //console.log("Saving eventConfig")
    const segmentsTable = document.getElementById('segmentsTable');
    const sampleScoring = document.getElementById('sampleScoring');
    const penOptions = document.getElementById('penSelect');
    sampleScoring.innerHTML = "Sample Scoring";
    if (segmentsTable) {
        const tableRows = segmentsTable.querySelectorAll('tr')
        const segData = [];
        const penValues = [];
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
        if (allCats) {
            Array.from(penOptions.options).forEach(option => {
                if (option.value != -1 && option.value != -2) {
                    penValues.push(parseInt(option.value))
                }
            })
        } else {
            penValues.push(parseInt(penOptions.value))
        }
        //debugger
        for (let pen of penValues) {
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
                eventSubgroupId: pen,
                segments: segData,
                ts: sgStartTime,
                allCats: allCats,
                eventSubgroupIds: penValues,
                ftsPerEvent: document.getElementById('ftsPerEvent').checked
            }
            const transaction = dbSegmentConfig.transaction("segmentConfig", "readwrite");
            const store = transaction.objectStore("segmentConfig")
            const request = store.put(eventConfig);
            request.onsuccess = function () {                    
                console.log("Event config saved:", eventConfig.eventSubgroupId, eventConfig);
                showSampleScoring(eventConfig).then(result => {
                    sampleScoring.innerHTML = result;
                })
            };
            request.onerror = function (event) {
                console.error("Failed to save event config:", event.target.error);
            };
        }
    } else {
        console.log("No segments defined / no pen selected")
    }
    //debugger
}
async function showSampleScoring(eventConfig) {
    const scoreKeys = ["falScoreFormat", "ftsScoreFormat", "finScoreFormat"];
    let regex = /[a-z]\.\./i; //dot notation format
    if (scoreKeys.some(key => regex.test(eventConfig[key]))) {
        const sgEntrants = (await common.rpc.getEventSubgroupEntrants(eventConfig.eventSubgroupId)).length;
        scoreKeys.forEach(key => {
            eventConfig[key] = eventConfig[key].replace(regex, `${sgEntrants}..`);
        });
    }
    regex = /[a-z]\:/i; //matlab format
    if (scoreKeys.some(key => regex.test(eventConfig[key]))) {
        const sgEntrants = (await common.rpc.getEventSubgroupEntrants(eventConfig.eventSubgroupId)).length;
        scoreKeys.forEach(key => {
            eventConfig[key] = eventConfig[key].replace(regex, `${sgEntrants}:`);
        });
    }
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
common.settingsStore.addEventListener('changed', async ev => {
        const changed = ev.data.changed;
        if (changed.has('formatsChanged') && changed.get('formatsChanged')) {
            scoreFormats = await loadSavedScoreFormats("save");
            common.settingsStore.set("formatsChanged", false)
        }
        if (changed.has('preview') && !changed.get('preview')) {
            cbPreview.checked = false;
        }
});