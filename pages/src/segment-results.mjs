import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';

let o101enabled = false;
let o101path = await zen.geto101();
if (o101path) {
    try {
        await zen.initTeamColors(o101path);
        o101enabled = true;
    } catch {
        o101enabled = false;
    }
    
}

const doc = document.documentElement;
const L = sauce.locale;
let refresh = Date.now() - 15000;
let refreshRate;
let segTimer = 0;
let activeSegment;
let activeSegmentName;
let activeSegmentMarkLine;
let approachingRefresh = null;
let inSegmentRefresh;
let segmentBests = [];
let noPB = false;
let lastStatus;
let segNameDiv = document.getElementById('segName');
let infoLeftDiv = document.getElementById('infoLeft');
let infoRightDiv = document.getElementById('infoRight');
let segmentDiv = document.getElementById("segmentResults");
let eventData = [];
let eventStartTime = Date.now();



function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}

//Onno name formatters (fmtFullName, fmtFirstName, fmtLastName, stripSpamFromName)

function fmtName(info) {
    const firstName = fmtFirstName(info, 1);
    return (firstName.length > 0)
        ? fmtFirstName(info, 1) + '.' + fmtLastName(info)
        : fmtLastName(info);
}

function fmtFullName(info) {
    return fmtFirstName(info) + ' ' + fmtLastName(info);
}

function fmtFirstName(info, maxLength) {
    let first = info != null && info.athlete != null && Object.hasOwn(info.athlete, 'firstName') ? info.athlete.firstName : '';
    if (first == null) first = 'A';

    if (maxLength == null) {
        first = first.replace(/[^A-Za-z]/g, '');
    } else {
        first = first.replace(/[^A-Za-z]/g, '').substring(0,1).toUpperCase();
    }
    
    if (first.length>1) {
        first = first.substring(0,1).toUpperCase() + first.substring(1).toLowerCase()
    } else {
        first = first.substring(0,1).toUpperCase();
    }

    return first;
}

function fmtLastName(info) {
    let last = info != null && info.lastName != null && Object.hasOwn(info, 'lastName') ? info.lastName : '';

    if (last == null) last = 'A';

    if (last.length>0) {
        last = stripSpamFromName(last);

        if (last.length>1) {
            last = last.substring(0,1).toUpperCase() + last.substring(1).toLowerCase()
        } else {
            last = last.substring(0,1).toUpperCase();
        }

        const lastParts = last.split(' ');
        last = '';
        for (let i = 0; i < lastParts.length; i++) {
            let lastPart = lastParts[i].replace(/[^A-Za-z]/g, '');
            if (lastPart.length>=1) {
                lastPart = lastPart.substring(0,1).toUpperCase() + lastPart.substring(1).toLowerCase()
            }
            last += lastPart + ' ';
        }
    }

    return last.trim();
}

function stripSpamFromName(value) {
    const spamChars = ['[','(','/','|',',','#','-','Team','TEAM','team','Year','YEAR','year'];

    for (let i = 0; i < spamChars.length; i++) {
        if (value.indexOf(spamChars[i])>0) {
            const nameParts = value.split(spamChars[i]);
            value = nameParts[0];
        }
    }

    return value;
}

async function getSegmentBests(segmentId, athleteId) {
    let segmentBests = await common.rpc.getSegmentResults(segmentId, {athleteId: athleteId, from: Date.now() - 86400000 * 90,})
    if (segmentBests) {
        return segmentBests;
    }
    else {
        return [];
    }
}

common.settingsStore.setDefault({
    resultsCount: 50,
    showTeamBadge: true,
    timePrecision: 3,
    fontScale: 1,
    nameFormat: "raw",
    nextSegmentThreshold: 500,
    lastSegmentThreshold: 30,
    approachingInfo: true,
    departingInfo: true,
    inSegmentInfo: true,
    transparentNoData: true,    
    FTSorFAL: "FTS",
    includeTime: true,
    femaleOnly: false
});

common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

function getSegmentStatus(arr, number, nextSegmentThreshold) {
    arr.sort((a, b) => a.markLine - b.markLine);
    //number = 32000
    const segmentStatus = {};
    for (let i = 0; i < arr.length; i++)
    {
        if (arr[i].markLine > number) {
            if (i == 0)
            {
                segmentStatus.prevSegmentIndex = null;
                segmentStatus.nextSegmentIndex = i;                
                arr[i].markLine - number < nextSegmentThreshold ? segmentStatus.status = "Approaching" : segmentStatus.status = "other";
            }
             else {
                segmentStatus.prevSegmentIndex = i - 1;
                segmentStatus.nextSegmentIndex = i;                
                if (arr[i].id == arr[i - 1].id && !arr[i - 1].name.includes("Finish"))    // if the previous and next markLines have the same id, we are in a segment.  Also check the previous one isn't a Finish for routes that repeat the same segment back to back            
                { 
                    segmentStatus.status = "inSegment";
                    
                } else if (arr[i].markLine - number < nextSegmentThreshold && arr[i].name != "Finish") // if within the threshold distance for showing the next segment, status is Approaching
                {                    
                    segmentStatus.status = "Approaching";
                } else if (Date.now() - inSegmentRefresh < settings.lastSegmentThreshold * 1000) // if not insegment or approaching and the time since refreshing insegment is in the time limit, status is Departing
                {                
                    segmentStatus.status = "Departing";
                } else if (arr[i].name == "Finish") {                    
                    segmentStatus.status = "Finishing"                
                } else {                           
                    segmentStatus.status = "other";
                }

            } 
            
            return segmentStatus;
        }
    }    
    segmentStatus.prevSegmentIndex = arr.length - 1;
    segmentStatus.nextSegmentIndex = null;
    if (Date.now() - inSegmentRefresh < settings.lastSegmentThreshold * 1000) // if not insegment or approaching and the time since refreshing insegment is in the time limit, status is Departing
    {                
        segmentStatus.status = "Departing";
    } else {          
        segmentStatus.status = "other";
    }    
    return segmentStatus;
}


function splitNameAndTeam(name) {
    if (!name || !name.match) {
        return [name];
    }
    const m = name.match(/\[(?<t1>.*?)\]|\((?<t2>.*?)\)/);
    if (!m) {
        return [name];
    }
    const team = m.groups.t1 || m.groups.t2;
    if (!team) {
        return [name];
    }
    name = [
        name.substr(0, m.index).trim(),
        name.substr(m.index + m[0].length).trim()
    ].filter(x => x).join(' ');
    return [name, team];
}

function getScoreFormat() {
    let scoreFormat = settings.scoreFormat;
    let scoreList = [];
    if (scoreFormat != null)
    {
        let scores = scoreFormat.split(',');        
        for (let score of scores)
        {
            if (score.includes(".."))
            {
                let scoreSeq = score.split("..")
                for (let i = scoreSeq[0]; i > scoreSeq[1] - 1 ; i--)
                {
                    scoreList.push(parseInt(i));
                }
            }
            else
            {
                scoreList.push(parseInt(score));
            }
        }
        return scoreList;
    }
    return -1;
}

async function doApproach(routeSegments,segIdx, currentLocation,watching) {    
    document.body.classList.remove("transparent-bg");
    activeSegment = routeSegments[segIdx].id;
    activeSegmentName = routeSegments[segIdx].displayName ?? routeSegments[segIdx].name;
    activeSegmentMarkLine = routeSegments[segIdx].markLine;
    activeSegmentMarkLine - currentLocation < 200 ? refreshRate = 1000 : refreshRate = 10000;  // refresh at 1s intervals for 200 meters before segment, then 10s.    
    if (settings.approachingInfo)
    {
        infoLeftDiv.innerHTML = "Start: " + (routeSegments[segIdx].markLine - currentLocation).toFixed(0) + "m"; 
         if (typeof(segmentBests) == "undefined")
         {
            segmentBests = [];
         }         
        if (segmentBests.length == 0 && !noPB)
        {        
            //console.log("Getting PB")                
            segmentBests = await getSegmentBests(activeSegment, watching.athleteId) ?? []; // only get segment bests once per Approach  
            //console.log(segmentBests)            
            if (segmentBests.length == 0)
            {                
                //console.log("No PB found")
                noPB = true;
            }             
        }
        let pb;        
        segmentBests.length > 0 ? pb = formatTime(segmentBests[0].elapsed) : pb = "---";
        infoRightDiv.innerHTML = "PB: "  + pb;
    } else {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
    }      
    if (Date.now() - refresh > refreshRate)
    {
        refresh = Date.now();
        if (segTimer > 0) {clearInterval(segTimer)};        
        let segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
        let eventResults = segmentResults.filter(x => x.eventSubgroupId === watching.state.eventSubgroupId);        
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;                
        if (watching.state.eventSubgroupId != 0)
        {
            if (eventData.length == 0)
            {
                //console.log("getting event data")
                eventData = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            inEvent = true;
        }        
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = segmentName + '\u2640 \u21E2';
        } else {
            segNameDiv.innerHTML = segmentName + ' \u21E2';
        }
        buildTable(eventResults,watching);
        
        approachingRefresh = Date.now();                            
    }
}

async function doInSegment(routeSegments,segIdx, currentLocation, watching) {
    document.body.classList.remove("transparent-bg");
    if (segTimer == 0)
    {
        segTimer = setInterval(segmentTimer,1000);
        //console.log(segTimer)
    }
    activeSegment = routeSegments[segIdx].id;
    activeSegmentName = routeSegments[segIdx].displayName ?? routeSegments[segIdx].name;
    activeSegmentMarkLine = routeSegments[segIdx].markLine;    
    let distanceFromSegmentEnd = activeSegmentMarkLine - currentLocation;
    if (distanceFromSegmentEnd < 50)
    {
        refreshRate = 400;
    }
    else if (distanceFromSegmentEnd < 200)
    {
        refreshRate = 1000
    }  
    else {
        refreshRate = 5000
    }
    if (settings.inSegmentInfo)
    {
        infoLeftDiv.textContent = "Finish: " + watching.segmentData.nextSegment.distanceToGo + " " + watching.segmentData.nextSegment.distanceToGoUnits;
        
    } else {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
    }      
    if (Date.now() - refresh > refreshRate)
    {
        refresh = Date.now();
        //console.log("Refreshing insegment")
        if (!noPB)
        {
            segmentBests.length != 0 ? segmentBests.length = 0 : ""; // clear the PB for departure check
        }
        let segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
        let eventResults = segmentResults.filter(x => x.eventSubgroupId === watching.state.eventSubgroupId);        
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;                
        if (watching.state.eventSubgroupId != 0)
        {
            if (eventData.length == 0)
            {
                //console.log("getting event data")
                eventData = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            inEvent = true;
        }        
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + '\u2640 \u21E2';
        } else {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + ' \u21E2';
        }
        buildTable(eventResults,watching);
        
        inSegmentRefresh = Date.now();                            
    }
}

async function doDeparting(routeSegments,segIdx, currentLocation, watching) {
    if (segTimer > 0)
    {
        clearInterval(segTimer);
        segTimer = 0;
        noPB = false;
        segmentBests = [];
    }
    document.body.classList.remove("transparent-bg");
    activeSegment = routeSegments[segIdx].id;
    activeSegmentName = routeSegments[segIdx].displayName ?? routeSegments[segIdx].name;
    activeSegmentMarkLine = routeSegments[segIdx].markLine;    
    let distanceFromSegment = currentLocation - activeSegmentMarkLine;
    if (distanceFromSegment < 50)
    {
        refreshRate = 400;
    }
    else if (distanceFromSegment < 500)
    {
        refreshRate = 2000;
    } 
    else {
        refreshRate = 10000;
    }    
    //console.log("Distance after segment: " + (currentLocation - activeSegmentMarkLine) + " Refresh rate: " + refreshRate)
    if (Date.now() - refresh > refreshRate)
    {
        refresh = Date.now();                
        let segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
        let eventResults = segmentResults.filter(x => x.eventSubgroupId === watching.state.eventSubgroupId);        
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;        
        
        if (watching.state.eventSubgroupId != 0)
        {
            if (eventData.length == 0)
            {
                eventData = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            inEvent = true;
        }  
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + '\u2640';
        } else {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName;
        }      
        
        if (settings.departingInfo)
        {
            if (segmentBests.length == 0)
            {        
                //console.log("Getting PB")                
                segmentBests = await getSegmentBests(activeSegment, watching.athleteId); 
                if (segmentBests.length > 0 ) {
                    segmentBests.sort((a,b) => {
                        return b.worldTime - a.worldTime;
                    })  
                    
                    if (Date.now() - segmentBests[0].ts > 30000)    
                    {                    
                        segmentBests.length = 0; // we refreshed too soon after crossing the line
                    }
                }
            }
            let lasttime;
            segmentBests.length > 0 ? lasttime = formatTime(segmentBests[0].elapsed) : lasttime = "---";
            infoRightDiv.innerHTML = "Last: " + lasttime;
            let rank = "---";
            if (settings.FTSorFAL == "FAL")
            {                
                eventResults.sort((a, b) => {
                    return a.worldTime - b.worldTime;
                })
            }                              
            for (let i = 0; i < eventResults.length; i++)
            {                                       
                if (watching.athleteId == eventResults[i].athleteId)
                {
                    rank = i + 1;
                    break;
                }
            }            
            infoLeftDiv.innerHTML = settings.FTSorFAL + " Rank: " + rank; 
        } else {
            infoLeftDiv.innerHTML = "";
            infoRightDiv.innerHTML = "";
        }   
        
        buildTable(eventResults,watching);
       
    }
}

function buildTable(eventResults,watching) {   
    if (settings.femaleOnly) {
        eventResults = eventResults.filter(x => x.gender == "female")
    } 
    let scoreFormat = getScoreFormat();
    let firstAL    
    if (settings.FTSorFAL == "FAL")
    {        
        eventResults.sort((a, b) => {
            return a.worldTime - b.worldTime;
        });
        eventResults.length > 0 ? firstAL = eventResults[0].worldTime - eventStartTime : firstAL = 0;
    }
    let resultsTable = document.createElement('table');    
    
    for (let rank = 0; rank < settings.resultsCount; rank++)
    {        
        if (rank >= eventResults.length)
        {
            continue;
        }  
        let tr = document.createElement('tr');            
        let td = document.createElement('td');  
        if (scoreFormat != -1) 
        {
            if (rank < scoreFormat.length)
            {
                td.innerHTML = scoreFormat[rank];
            }
            else
            {
                td.innerHTML = 0;
            }
        }
        else
        {
            td.innerHTML = rank + 1;                        
        }
        tr.appendChild(td);
        td = document.createElement('td');
        let nameTeam = splitNameAndTeam(eventResults[rank].lastName);
        let lastName;
        settings.nameFormat == "O101" ? lastName = fmtLastName(eventResults[rank]) : lastName = nameTeam[0];        
        let teamBadge = "";
        if (nameTeam[1] && settings.showTeamBadge)
        {            
            //teamBadge = common.teamBadge(nameTeam[1]);
            o101enabled ? teamBadge = zen.fmtTeamBadgeV2(nameTeam[1]) : teamBadge = common.teamBadge(nameTeam[1]);
        }              
        
        td.innerHTML = eventResults[rank].firstName + " " + lastName + " " + teamBadge;                        
        tr.appendChild(td);
        td = document.createElement('td');
        if (settings.FTSorFAL == "FAL")
        {   
            if (settings.includeTime)
            {
                if (rank > 0) {td.textContent = "+"}
                td.textContent += formatTime((eventResults[rank].worldTime - eventStartTime - firstAL) / 1000);
            }
        }
        else {
            settings.includeTime ? td.innerHTML = formatTime(eventResults[rank].elapsed,settings.timePrecision) : td.innerHTML = "";
        }
        tr.appendChild(td)
        if (watching.athleteId === eventResults[rank].athleteId)
        {            
            tr.className = "watching";
        }
        
        resultsTable.appendChild(tr);            
    }
    segmentDiv.innerHTML = "";
    segmentDiv.appendChild(resultsTable)
}

function segmentTimer() {    
    if (settings.approachingInfo) 
    {
        approachingRefresh != null ? infoRightDiv.textContent = "Time: " + formatTime((Date.now() - approachingRefresh) / 1000, 0).replace(".",""): infoRightDiv.textContent = "";
    }
    else
    {
        infoRightDiv.textContent = ""
    }
}

async function getSegmentResults(watching) {
    refreshRate = 5000;
    const doc = document.documentElement;        
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);
    if (!watching.state.eventSubgroupId && settings.FTSorFAL == "FAL")
    {
        //FAL disabled outside of events
        if (settings.transparentNoData) 
        {
            document.body.classList = "transparent-bg"
        }
    } 
    else if (watching.segmentData)
    {   
        let routeSegments = watching.segmentData.routeSegments;
        if (routeSegments.length > 0)
        {
            let currentLocation = watching.segmentData.currentPosition;
            routeSegments = routeSegments.filter(x => x.type != "custom")
            let segmentStatus = getSegmentStatus(routeSegments, currentLocation, settings.nextSegmentThreshold);
            //console.log(segmentStatus)
            if (segmentStatus.status != lastStatus) {
                //console.log("Resetting after status change from: " + lastStatus + " to " + segmentStatus.status)
                noPB = false;
                segmentBests.length = 0;
            }
            lastStatus = segmentStatus.status;
            switch(segmentStatus.status) {
                case "Approaching" : 
                    await doApproach(routeSegments,segmentStatus.nextSegmentIndex, currentLocation,watching);
                    break;
                case "inSegment" :
                    await doInSegment(routeSegments,segmentStatus.nextSegmentIndex, currentLocation,watching);
                    break;
                case "Departing" :
                    await doDeparting(routeSegments,segmentStatus.prevSegmentIndex, currentLocation,watching);
                    break;
            }
            if (segmentStatus.status == "other" || segmentStatus.status == "Finishing")  
            {   
                if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
                segmentStatus.prevSegmentIndex == null ? activeSegment = null : activeSegment = routeSegments[segmentStatus.prevSegmentIndex].id;
                segmentStatus.prevSegmentIndex == null ? activeSegmentName = null : activeSegmentName = routeSegments[segmentStatus.prevSegmentIndex].name;
                segmentStatus.prevSegmentIndex == null ? activeSegmentMarkLine = null : activeSegmentMarkLine = routeSegments[segmentStatus.prevSegmentIndex].markLine;
                infoLeftDiv.innerHTML = "";
                infoRightDiv.innerHTML = "";
                segNameDiv.innerHTML = "";
                segmentDiv.innerHTML = "";
                segmentBests.length = 0;
                noPB = false;
                if (segTimer != null)
                {
                    clearInterval(segTimer);
                    segTimer = 0;                    
                }
            }   
        }
        else
        {
            infoLeftDiv.innerHTML = "";
            infoRightDiv.innerHTML = "";
            segNameDiv.innerHTML = "";
            segmentDiv.innerHTML = "";
        }
            
    }
}


const formatTime = (milliseconds,timePrecision) => {
    milliseconds = milliseconds * 1000;
    const ms = milliseconds.toString().substr(-3).slice(0,timePrecision);    
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
        return seconds.toString().padStart(2, "0") + "." + ms;
    }
}



export async function main() {
    common.initInteractionListeners();      
    
    
    common.subscribe('athlete/watching', getSegmentResults);    
    common.subscribe('watching-athlete-change', async athleteId => {
        //console.log("Watching athlete changed")        
        if (segTimer != null)
        {
            clearInterval(segTimer);
            segTimer = 0;
            
        }
        noPB = false;
        segmentBests = [];
        approachingRefresh = null;
        inSegmentRefresh = null;
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
    });
}
setBackground();
