import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
let dbSegments = await zen.openSegmentsDB();
let dbSegmentConfig = await zen.openSegmentConfigDB();
await zen.cleanupSegmentsDB(dbSegments);
await zen.cleanupSegmentsDB(dbSegments, {live: true});
await zen.cleanupSegmentConfigDB(dbSegmentConfig);

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
let activeSegmentRepeat;
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
let allKnownRacers = [];
let routeInfo = false;
let inProgress = false;
let allRacerRefresh = Date.now() - 25000;
let teamColors;
let eventJoined= [];
let eventJoinedRefresh = Date.now() - 60000;
let lastKnownSG = {
    eventSubgroupId: 0,
    eventSubgroupStart: 0,
    segmentsNeeded: false,
    segments: []
};
let postEventUpdates = false;
let tsLastSegment = Date.now() - 60000;
async function getTeamColors() {
    try {
        teamColors = await fetch("/mods/o101_s4z_mods/pages/src/o101/teamcolors.json").then((response) => response.json());
    } catch {
        console.log("Didn't get the o101 teamcolors.json, will use default team badge")
    }
}
//await getTeamColors();
//let eventResults = [];
changelineSpacing();


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
function changelineSpacing() {
    const doc = document.documentElement;
    doc.style.setProperty('--line-spacing', common.settingsStore.get('lineSpacing') || 1.2);  
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

function tsToTime(ts) {
    let date = new Date(ts);
    return date.toLocaleTimeString("default");
}

function tsToDateTime(ts) {
    let date = new Date(ts);
    return date.toLocaleString("default"), date.toUTCString();
}

common.settingsStore.setDefault({
    resultsCount: 50,
    showTeamBadge: true,
    badgeScale: 0.7,
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
    femaleOnly: false,
    lineSpacing: 1.2
});

common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

function changeBadgeScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--badge-scale', common.settingsStore.get('badgeScale') || 0.7);  
}

function getSegmentStatus(arr, number, nextSegmentThreshold) {
    arr.sort((a, b) => a.markLine - b.markLine);
    //debugger
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
        //console.log("other other")               
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

async function getFullSegmentResults(dbSegments, eventSubgroupId, activeSegment, watching) {
    const prevSegmentResults = !eventSubgroupId ? [] :  await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: false})
    let segmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment)   
    //console.log("Previous saved results count", segmentResults.length, activeSegment)         
    const prevIds = new Set(segmentResults.map(res => res.id))
    const allSegmentResults = await common.rpc.getSegmentResults(activeSegment)
    
    let startTime = Date.now() - (watching.state.time * 1000);
    let segmentResultsSinceStart = allSegmentResults.filter(x => x.ts > startTime && allKnownRacers.includes(x.athleteId));
    for (let res of segmentResultsSinceStart) {
        if (!prevIds.has(res.id)) {
            segmentResults.push(res)
        }
    }
    //console.log("Full saved results count:", segmentResults.length, activeSegment)
    return segmentResults;
}

async function doApproach(routeSegments,segIdx, currentLocation,watching, eventSubgroupId) {
    if (routeSegments[segIdx].exclude) {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
        segNameDiv.innerHTML = "";
        segmentDiv.innerHTML = "";
        if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
        return null;
    }
    document.body.classList.remove("transparent-bg");
    activeSegment = routeSegments[segIdx].id;
    activeSegmentName = routeSegments[segIdx].displayName ?? routeSegments[segIdx].name;
    activeSegmentMarkLine = routeSegments[segIdx].markLine;
    activeSegmentRepeat = routeSegments[segIdx].repeat;
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
            segmentBests = await getSegmentBests(activeSegment, watching.athleteId) ?? []; // only get segment bests once per Approach  
            if (segmentBests.length == 0)
            {
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
        let segmentResults;
        let eventResults = [];   
        let liveResults = false;
        let prevSegmentResults;
        if (activeSegmentRepeat == 1 || !eventSubgroupId) {  
            prevSegmentResults = !eventSubgroupId ? [] : await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
            prevSegmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment)
            segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
            segmentResults = segmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //segmentResults = segmentResults.filter(x => x.eventSubgroupId === 0);
            //console.log("segmentResults after filter", segmentResults)
            
            eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === 0);
            //debugger
            const prevIds = new Set(prevSegmentResults.map(res => res.id))
            for (let res of segmentResults) {
                if (!prevIds.has(res.id)) {
                    eventResults.push(res)
                }
            }
            liveResults = true;
        } else {
            segmentResults = await getFullSegmentResults(dbSegments, eventSubgroupId, activeSegment, watching)
            for (let racer of allKnownRacers) {
                let racerResults = segmentResults.filter(x => x.athleteId == racer);
                if (racerResults) {
                    racerResults.sort((a, b) => {
                        return a.worldTime - b.worldTime;
                    })
                    if (racerResults.length >= activeSegmentRepeat) {
                        let repeatResult = racerResults[activeSegmentRepeat - 1]
                        let resultCheck = eventResults.find(x => x.id == repeatResult.id)
                        if (!resultCheck) {
                            eventResults.push(repeatResult)
                        }
                    }
                }
            }
        }
        segmentResults.forEach(result => {   
            result.eventSubgroupId = eventSubgroupId;
            result.segmentId = activeSegment; 
        });
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;  
        let segRepeat = "";   
        if (eventSubgroupId)
        {
            if (eventData.length == 0)
            {
                eventData = await common.rpc.getEventSubgroup(eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            segRepeat = "[" + routeSegments[segIdx].repeat + "] " + settings.FTSorFAL
            inEvent = true;
        } 
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = segmentName + segRepeat + '\u2640 \u21E2';
        } else {
            segNameDiv.innerHTML = segmentName + segRepeat + ' \u21E2';
        }
        await buildTable(eventResults,watching);
        const savedResultsCount =  !eventSubgroupId ? 0 : await zen.storeSegmentResults(dbSegments, segmentResults, {live: liveResults});        
        approachingRefresh = Date.now();                            
    }
}

async function doInSegment(routeSegments,segIdx, currentLocation, watching, eventSubgroupId) {
    if (routeSegments[segIdx].exclude) {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
        segNameDiv.innerHTML = "";
        segmentDiv.innerHTML = "";
        if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
        return null;
    }
    document.body.classList.remove("transparent-bg");
    if (segTimer == 0)
    {
        segTimer = setInterval(segmentTimer,1000);
    }
    tsLastSegment = Date.now();
    activeSegment = routeSegments[segIdx].id;
    activeSegmentName = routeSegments[segIdx].displayName ?? routeSegments[segIdx].name;
    activeSegmentMarkLine = routeSegments[segIdx].markLine; 
    activeSegmentRepeat = routeSegments[segIdx].repeat;     
    let distanceFromSegmentEnd = activeSegmentMarkLine - currentLocation;
    if (distanceFromSegmentEnd < 200)
    {
        refreshRate = 1000;
    }
    else if (distanceFromSegmentEnd < 500)
    {
        refreshRate = 3000
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
        let segmentResults;
        let eventResults = [];
        let liveResults = false;
        let prevSegmentResults;
        if (!noPB)
        {
            segmentBests.length != 0 ? segmentBests.length = 0 : ""; // clear the PB for departure check
        }
        if (activeSegmentRepeat == 1 || !eventSubgroupId) {
            prevSegmentResults = !eventSubgroupId ? [] : await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
            prevSegmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment)
            segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
            segmentResults = segmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //segmentResults = segmentResults.filter(x => x.eventSubgroupId === 0);
            eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === 0);
            const prevIds = new Set(prevSegmentResults.map(res => res.id))
            for (let res of segmentResults) {
                if (!prevIds.has(res.id)) {
                    eventResults.push(res)
                }
            }
            liveResults = true;
        } else {
            segmentResults = await getFullSegmentResults(dbSegments, eventSubgroupId, activeSegment, watching)
            for (let racer of allKnownRacers) {
                let racerResults = segmentResults.filter(x => x.athleteId == racer);

                if (racerResults) {
                    racerResults.sort((a, b) => {
                        return a.worldTime - b.worldTime;
                    })
                    if (racerResults.length >= activeSegmentRepeat) {
                        let repeatResult = racerResults[activeSegmentRepeat - 1]
                        let resultCheck = eventResults.find(x => x.id == repeatResult.id)
                        if (!resultCheck) {
                            eventResults.push(repeatResult)
                        }
                    }
                }
            }
        }
        segmentResults.forEach(result => {   
            result.eventSubgroupId = eventSubgroupId;
            result.segmentId = activeSegment; 
        });
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;     
        let segRepeat = "";           
        if (eventSubgroupId)
        {
            if (eventData.length == 0)
            {
                eventData = await common.rpc.getEventSubgroup(eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            segRepeat = "[" + routeSegments[segIdx].repeat + "] " + settings.FTSorFAL
            inEvent = true;
        }        
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat + '\u2640 \u21E2';
        } else {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat + ' \u21E2';
        }
        await buildTable(eventResults,watching);        
        inSegmentRefresh = Date.now();          
        const savedResultsCount = !eventSubgroupId ? 0 : await zen.storeSegmentResults(dbSegments, segmentResults, {live: liveResults});                  
    }
}

async function doDeparting(routeSegments,segIdx, currentLocation, watching, eventSubgroupId) {
    if (routeSegments[segIdx].exclude) {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
        segNameDiv.innerHTML = "";
        segmentDiv.innerHTML = "";
        if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
        return null;
    }
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
    activeSegmentRepeat = routeSegments[segIdx].repeat;    
    let distanceFromSegment = currentLocation - activeSegmentMarkLine;
    if (distanceFromSegment < 200)
    {
        refreshRate = 1000;
    }
    else if (distanceFromSegment < 500)
    {
        refreshRate = 2000;
    } 
    else {
        refreshRate = 10000;
    }
    //console.log("Refresh rate:", refreshRate, "diff", Date.now() - refresh)
    if (Date.now() - refresh > refreshRate)
    {
        refresh = Date.now(); 
        let segmentResults;
        let eventResults = [];
        let liveResults = false;
        let prevSegmentResults;
        if (activeSegmentRepeat == 1 || !eventSubgroupId) {
            prevSegmentResults = !eventSubgroupId ? [] : await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
            prevSegmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment)
            segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
            segmentResults = segmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //segmentResults = segmentResults.filter(x => x.eventSubgroupId === 0);
            eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            //eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === 0);
            const prevIds = new Set(prevSegmentResults.map(res => res.id))
            for (let res of segmentResults) {
                if (!prevIds.has(res.id)) {
                    eventResults.push(res)
                }
            }
            liveResults = true;
        } else {
            segmentResults = await getFullSegmentResults(dbSegments, eventSubgroupId, activeSegment, watching)
            for (let racer of allKnownRacers) {
                let racerResults = segmentResults.filter(x => x.athleteId == racer);

                if (racerResults) {
                    racerResults.sort((a, b) => {
                        return a.worldTime - b.worldTime;
                    })
                    if (racerResults.length >= activeSegmentRepeat) {
                        let repeatResult = racerResults[activeSegmentRepeat - 1]
                        let resultCheck = eventResults.find(x => x.id == repeatResult.id)
                        if (!resultCheck) {                            
                            eventResults.push(repeatResult)
                        }
                    }
                }
            }
        }
        segmentResults.forEach(result => {   
            result.eventSubgroupId = eventSubgroupId;
            result.segmentId = activeSegment; 
        });
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;        
        let segRepeat = "";
        if (eventSubgroupId)
        {
            if (eventData.length == 0)
            {
                eventData = await common.rpc.getEventSubgroup(eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            segRepeat = "[" + routeSegments[segIdx].repeat + "] " + settings.FTSorFAL
            inEvent = true;
        }        
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat + '\u2640';
        } else {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat;
        }
        if (settings.departingInfo)
        {
            if (segmentBests.length == 0)
            {
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
            } else {
                eventResults.sort((a, b) => {
                    return a.elapsed - b.elapsed;
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
        await buildTable(eventResults,watching);
        const savedResultsCount = !eventSubgroupId ? 0 : await zen.storeSegmentResults(dbSegments, segmentResults, {live: liveResults});
    }
}

async function doPostEvent(routeSegments,segIdx, eventSubgroupId, watching) {
    if (routeSegments.at(segIdx).exclude) {
        infoLeftDiv.innerHTML = "";
        infoRightDiv.innerHTML = "";
        segNameDiv.innerHTML = "";
        segmentDiv.innerHTML = "";
        if (settings.transparentNoData) {document.body.classList = "transparent-bg"};
        return null;
    }
    if (segTimer > 0)
    {
        clearInterval(segTimer);
        segTimer = 0;
        noPB = false;
        segmentBests = [];
    }
    
    document.body.classList.remove("transparent-bg");
    activeSegment = routeSegments.at(segIdx).id;
    activeSegmentName = routeSegments.at(segIdx).displayName ?? routeSegments.at(segIdx).name;
    activeSegmentMarkLine = routeSegments.at(segIdx).markLine;
    activeSegmentRepeat = routeSegments.at(segIdx).repeat; 
    if (Date.now() - tsLastSegment < 15000) {
        refreshRate = 1000;        
    } else if (Date.now() - tsLastSegment < 30000) {
        refreshRate = 5000;
    } else {
        refreshRate = 10000;
    }
    //console.log("Refresh rate:", refreshRate, "diff", Date.now() - refresh)
    if (Date.now() - refresh > refreshRate)
    {
        refresh = Date.now(); 
        let segmentResults;
        let eventResults = [];
        let liveResults = false;
        let prevSegmentResults;
        if (activeSegmentRepeat == 1) {
            prevSegmentResults = !eventSubgroupId ? [] : await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
            prevSegmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment)
            //console.log("PostEvent: prevSegmentResults count (live)", prevSegmentResults.length, prevSegmentResults)
            segmentResults = await common.rpc.getSegmentResults(activeSegment,{live:true})
            segmentResults = segmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === eventSubgroupId);
            const prevIds = new Set(prevSegmentResults.map(res => res.id))
            for (let res of segmentResults) {
                if (!prevIds.has(res.id)) {
                    eventResults.push(res)
                }
            }
            liveResults = true;
        } else {
            prevSegmentResults = !eventSubgroupId ? [] :  await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: false})
            segmentResults = prevSegmentResults.filter(x => x.segmentId == activeSegment);
            const prevIds = new Set(segmentResults.map(res => res.id))
            const allSegmentResults = await common.rpc.getSegmentResults(activeSegment)
            
            //let startTime = Date.now() - (watching.state.time * 1000);
            let segmentResultsSinceStart = allSegmentResults.filter(x => x.ts > eventStartTime && allKnownRacers.includes(x.athleteId));
            for (let res of segmentResultsSinceStart) {
                if (!prevIds.has(res.id)) {
                    segmentResults.push(res)
                }
            }
            for (let racer of allKnownRacers) {
                let racerResults = segmentResultsSinceStart.filter(x => x.athleteId == racer);

                if (racerResults) {
                    racerResults.sort((a, b) => {
                        return a.worldTime - b.worldTime;
                    })
                    if (racerResults.length >= activeSegmentRepeat) {
                        let repeatResult = racerResults[activeSegmentRepeat - 1]
                        let resultCheck = eventResults.find(x => x.id == repeatResult.id)
                        if (!resultCheck) {
                            eventResults.push(repeatResult)
                        }
                    }
                }
            }
        } 
        segmentResults.forEach(result => {   
            result.eventSubgroupId = eventSubgroupId;
            result.segmentId = activeSegment; 
        });       
        let segmentName = activeSegmentName.replace(" Finish","")        
        let inEvent = false;        
        let segRepeat = "";
        if (eventSubgroupId)
        {
            if (eventData.length == 0)
            {
                eventData = await common.rpc.getEventSubgroup(eventSubgroupId);
                if (eventData) {
                    eventStartTime = eventData.eventSubgroupStartWT;
                } else {
                    eventData = [];
                }
            }
            segRepeat = "[" + routeSegments.at(segIdx).repeat + "] " + settings.FTSorFAL
            inEvent = true;
        }        
        if (settings.femaleOnly) {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat + '\u2640';
        } else {
            segNameDiv.innerHTML = '\u21e0 ' + segmentName + segRepeat;
        }
        if (settings.departingInfo)
        {
            if (segmentBests.length == 0)
            {
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
            } else {
                eventResults.sort((a, b) => {
                    return a.elapsed - b.elapsed;
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
        
        await buildTable(eventResults,watching);
        const savedResultsCount = await zen.storeSegmentResults(dbSegments, segmentResults, {live: liveResults});
    }
}

async function buildTable(eventResults,watching) {
    if (settings.femaleOnly) {
        eventResults = eventResults.filter(x => x.gender == "female")
    }
    let settingsScoreFormat = settings.scoreFormat;
    let scoreFormat = zen.getScoreFormat(settingsScoreFormat, 1);
    let firstAL    
    if (settings.FTSorFAL == "FAL")
    {        
        eventResults.sort((a, b) => {
            return a.worldTime - b.worldTime;
        });
        eventResults.length > 0 ? firstAL = eventResults[0].ts - eventStartTime : firstAL = 0;
    } else {
        eventResults.sort((a, b) => {
            return a.elapsed - b.elapsed;
        });
    }
    let resultsTable = document.createElement('table');
    const athleteIds = eventResults.slice(0, settings.resultsCount).map(x => x.athleteId);
    const athletes = await common.rpc.getAthletesData(athleteIds);
    for (let rank = 0; rank < settings.resultsCount; rank++)
    {        
        if (rank >= eventResults.length)
        {
            continue;
        }  
        const athleteId = eventResults[rank].athleteId
        const athlete = athletes.find(x => x?.athleteId == athleteId);
        let tr = document.createElement('tr');            
        let td = document.createElement('td');  
        if (scoreFormat.length == 1 && scoreFormat[0] == 0) {
            td.innerHTML = rank + 1;                        
        } else {
            if (rank < scoreFormat.length)
            {
                td.innerHTML = scoreFormat[rank];
            }
            else
            {
                td.innerHTML = 0;
            }
        }        
        tr.appendChild(td);
        td = document.createElement('td');
        let nameTeam = splitNameAndTeam(eventResults[rank].lastName);
        let lastName;
        let firstName;
        settings.nameFormat == "O101" ? lastName = fmtLastName(eventResults[rank]) : lastName = nameTeam[0];        
        let teamBadge = "";
        //const athlete = await common.rpc.getAthleteData(racer.athleteId)
        if (settings.showTeamBadge && athlete?.o101?.teamBadge) {
            teamBadge = athlete.o101.teamBadge;
            //console.log("using o101 team badge")
        } else if (settings.showTeamBadge && athlete?.athlete?.team) {
            teamBadge = common.teamBadge(athlete.athlete.team)
            //console.log("using sauce team badge")
        }  
        if (settings.nameFormat == "FirstLast") {
            firstName = athlete ? athlete.athlete.firstName : eventResults[rank].firstName.charAt(0) + "."
            //debugger
        } else {
            firstName = eventResults[rank].firstName.charAt(0) + "."
        }
        let profileLink = "<a href='/pages/profile.html?id=" + athleteId + "&windowType=profile' target='profile'>"        
        td.innerHTML = profileLink + firstName + "&nbsp;" + lastName + "</a>&nbsp;<div id='info-item-team'>" + teamBadge + "</div>";
        tr.appendChild(td);
        td = document.createElement('td');
        if (settings.FTSorFAL == "FAL")
        {   
            if (settings.includeTime)
            {
                if (rank > 0) {td.textContent = "+"}                
                td.textContent += formatTime((eventResults[rank].ts - eventStartTime - firstAL) / 1000);
                //let ts = tsToTime(eventResults[rank].ts)
                //td.textContent = ts;
            }
        }
        else {
            settings.includeTime ? td.innerHTML = formatTime(eventResults[rank].elapsed,settings.timePrecision) : td.innerHTML = "";
        }
        tr.appendChild(td)
        if (watching.athleteId === eventResults[rank].athleteId)
        {            
            tr.className = "watching";
        } else if (settings.highlightTeammate && athlete?.team?.trim() == watching.athlete.team?.trim() && watching.athlete.team) {
            tr.className = "teammate"
        } else if (settings.highlightMarked && athlete?.marked) {
            tr.className = "marked"
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

async function getKnownRacers(eventSubgroupId, watching) {
    allRacerRefresh = Date.now();
    //let firstSegment = routeInfo.segments[0];
    const prevSegmentResults = !eventSubgroupId ? [] : await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
    const prevResultsRacers = new Set(prevSegmentResults.map(res => res.athleteId))
    //console.log("Previous segment results racers", prevResultsRacers)
    const uniqueSegmentIds = getUniqueValues(routeInfo.segments, "id")
    for (let segId of uniqueSegmentIds) {
        const resultsLive = await common.rpc.getSegmentResults(segId, {live: true});    
        const eventRes = resultsLive.filter(x => x.eventSubgroupId == eventSubgroupId);  
        const savedResultsCount =  !eventSubgroupId ? 0 : await zen.storeSegmentResults(dbSegments, eventRes, {live: true});
        if (eventRes.length > 0)  // don't bother getting the full leaderboard if no live results for the event yet
        {
            //const results = await common.rpc.getSegmentResults(firstSegment.id);
            const knownRacers = new Set(eventRes.map(d => d.athleteId))
            for (let racer of knownRacers)
            {
                //debugger
                if (!allKnownRacers.includes(racer))
                {
                    if (eventJoined.find(x => x.id == racer)) {
                        allKnownRacers.push(racer);
                    } else {
                        console.log("Found a racer in results that isn't on the eventJoined list!", racer)
                    }
                }
            }        
        }
        let segmentResults = await getFullSegmentResults(dbSegments, eventSubgroupId, segId, watching)
        segmentResults.forEach(result => {   
            result.eventSubgroupId = eventSubgroupId;
            result.segmentId = segId; 
        });
        const savedResultsCountAll = !eventSubgroupId ? 0 : await zen.storeSegmentResults(dbSegments, segmentResults, {live: false});
        
    }
    
   //console.log("Known racer count from segment results: ",allKnownRacers.length)
}

async function getSegmentResults(watching) {    
    refreshRate = 5000;
    const doc = document.documentElement;
    let eventSubgroupId;
    //debugger
    if (watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId != watching.state.eventSubgroupId) {
        lastKnownSG.eventSubgroupId = watching.state.eventSubgroupId;
        lastKnownSG.segmentsNeeded = true;
    }
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        postEventUpdates = true;
        //console.log("Using last known eventSubgroupId", lastKnownSG.eventSubgroupId)
        //TODO: show last segment results after the event if it ends at a segment.
    } else {
        postEventUpdates = false;
        eventSubgroupId = watching.state.eventSubgroupId;
    }
    
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);    
    if ((!routeInfo || watching.state.routeId != routeInfo.routeFullData.id) && !inProgress)
    {
        console.log("Getting segments on route")
        inProgress = true;  
        let eventSettings;      
        if (eventSubgroupId) 
        {
            let sg = await common.rpc.getEventSubgroup(eventSubgroupId)                       
            if (sg?.distanceInMeters) {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId, 0, sg.distanceInMeters) 
            } else if (sg?.laps > 1) {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId, sg.laps ) 
            } else {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId) 
            }                     
        } else {
            routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId)             
        }
        routeInfo.sg = eventSubgroupId
        console.log(routeInfo) 
        console.log(watching.segmentData)  
        common.settingsStore.set("routeInfo", routeInfo)
        const settings = common.settingsStore.get();
        eventSettings = Object.keys(settings).reduce((result, key) => {
            if (key.startsWith("eventSegData")) {                
                
                //result[key] = settings[key];
                let keyData = key.split("|");
                if (keyData[1] == routeInfo.sg) {
                    let markLines = routeInfo.markLines;
                    if (markLines.length > 0) {
                        for (let markline of routeInfo.markLines) {
                            if (keyData[2] == markline.id && keyData[3] == markline.repeat) {
                                const settings = common.settingsStore.get();                                
                                (settings[key]) ? markline.exclude = false : markline.exclude = true;
                                //console.log("Setting repeat " + markline.repeat + " to " + markline.exclude)
                                //debugger
                            }
                        }
                    }
                }
            }
            //return result;
            }, {}); 
        //debugger        
        
        
        inProgress = false;
    } else if (!eventSubgroupId && settings.FTSorFAL == "FAL") {
        //FAL disabled outside of events
        if (settings.transparentNoData) 
        {
            document.body.classList = "transparent-bg"
        }
    } else if (routeInfo.segments) {   
        let routeSegments;
        if (watching.segmentData && watching.segmentData.routeSegments) {
            routeSegments = watching.segmentData.routeSegments
            let excludes = routeInfo.markLines.filter(x => x.exclude)
            if (excludes.length > 0) {
                for (let ex of excludes) {
                    let segMatch = routeSegments.find(x => x.id == ex.id && x.name == ex.name && x.repeat == ex.repeat)
                    segMatch.exclude = true;
                }
            }
        } else {
            routeSegments = routeInfo.markLines;
        }
        //debugger
        if (Date.now() - eventJoinedRefresh > 60000 && eventSubgroupId) {
            eventJoinedRefresh = Date.now();
            //console.log("Refreshing the event joined list")
            eventJoined = await common.rpc.getEventSubgroupEntrants(eventSubgroupId, {joined: true});
            //console.log("Found", eventJoined.length,"racers", eventJoined)
            allKnownRacers = allKnownRacers.filter(racer => {
                if (!eventJoined.find(x => x.id === racer)) {
                    //console.log("Found a known racer that isn't on the eventJoined list, removing", racer);
                    return false; // Exclude this racer from the new array
                }
                return true; // Keep this racer in the new array
            });
            
        }
        if (Date.now() - allRacerRefresh > 30000 && eventSubgroupId) {
            //TODO: gather full results in background for saving
            getKnownRacers(eventSubgroupId, watching);
        }
        if (routeSegments.length > 0)        {
            //let currentLocation = zen.getxCoord(watching, routeInfo); 
            let currentLocation = watching.segmentData.currentPosition;           
            //let segmentStatus = getSegmentStatus(routeSegments, currentLocation, settings.nextSegmentThreshold); 
            routeSegments = routeSegments.filter(x => x.type != "custom" && !x.finishArchOnly) 
            let segmentStatus = {};
            //console.log("postEventUpdates", postEventUpdates, "tsLastSegment", tsLastSegment, "settings.lastSegmentThreshold", settings.lastSegmentThreshold)
            if (postEventUpdates && (Date.now() - tsLastSegment < settings.lastSegmentThreshold * 1000)) {
                //console.log("postEventUpdates: Date.now() - tsLastSegment", Date.now() - tsLastSegment, "lastSegmentThreshold * 1000", settings.lastSegmentThreshold * 1000)
                segmentStatus.status = "postEventUpdates"
            } else if (postEventUpdates && Date.now() - tsLastSegment > settings.lastSegmentThreshold * 1000) {
                //console.log("Resetting postEventUpdates status and clearing lastknownsg")
                postEventUpdates = false;
                lastKnownSG.eventSubgroupId = 0
                lastKnownSG.segments = [];
                segmentStatus.status = "other"
            } else {
                segmentStatus = getSegmentStatus(routeSegments, currentLocation, settings.nextSegmentThreshold); 
                //console.log(segmentStatus)           
                if (segmentStatus.status != lastStatus) {
                    //console.log("Resetting after status change from: " + lastStatus + " to " + segmentStatus.status)
                    noPB = false;
                    segmentBests.length = 0;
                }
                lastStatus = segmentStatus.status;
            }
            if (lastKnownSG.segmentsNeeded) {
                console.log("Updating lastKnownSG.segments")
                lastKnownSG.segments = [...routeSegments]
                lastKnownSG.segmentsNeeded = false;
            }
            //console.log(segmentStatus)
            //debugger
            switch(segmentStatus.status) {
                case "Approaching" : 
                    await doApproach(routeSegments,segmentStatus.nextSegmentIndex, currentLocation,watching, eventSubgroupId);
                    break;
                case "inSegment" :
                    await doInSegment(routeSegments,segmentStatus.nextSegmentIndex, currentLocation,watching, eventSubgroupId);
                    break;
                case "Departing" :
                    await doDeparting(routeSegments,segmentStatus.prevSegmentIndex, currentLocation,watching, eventSubgroupId);
                    break;
                case "postEventUpdates" :
                    await doPostEvent(lastKnownSG.segments, -1, eventSubgroupId, watching);
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


const formatTime = (milliseconds,timePrecision = 3) => {
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
const newformatTime = (milliseconds, timePrecision = 3) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Truncate milliseconds without rounding
    const msString = ms.toString().padStart(3, '0').slice(0, timePrecision);

    // Build the time string dynamically
    let timeString = '';
    if (hours > 0) timeString += `${hours}:`;
    if (minutes > 0 || hours > 0) timeString += `${minutes.toString().padStart(hours > 0 ? 2 : 1, '0')}:`;
    timeString += `${seconds.toString().padStart((minutes > 0 || hours > 0) ? 2 : 1, '0')}`;

    if (timePrecision > 0) {
        timeString += `.${msString.padEnd(timePrecision, '0')}`;
    }

    return timeString;
};



export async function main() {
    common.initInteractionListeners();      
    
    
    common.subscribe('athlete/watching', getSegmentResults);    
    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        if (segTimer != null)
        {
            clearInterval(segTimer);
            segTimer = 0;
            
        }
        noPB = false;
        segmentBests = [];
        approachingRefresh = null;
        inSegmentRefresh = null;
        eventJoinedRefresh = Date.now() - 100000; // force an event participant refresh
        allRacerRefresh = Date.now() - 100000;
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has('badgeScale')) {
            changeBadgeScale();
        }
        if (changed.has('lineSpacing')) {
            changelineSpacing();
        }
        let eventSegmentChanged = [...changed.entries()].filter(([key, value]) => key.startsWith("eventSegData"));
        if (eventSegmentChanged.length > 0) {
            let seg = eventSegmentChanged[0][0].split("|")
            console.log("segment status changed")
            let matchingMarklines = routeInfo.markLines.filter(x => x.id == seg[2] && x.repeat == seg[3]);
            for (let markline of matchingMarklines) {
                (eventSegmentChanged[0][1]) ? markline.exclude = false : markline.exclude = true;
            }
            //debugger
            console.log(routeInfo.markLines)
        };
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();

export function showSampleScoring(settingsScoreFormat, scoreType) {
    const scoreFormat = zen.getScoreFormat(settingsScoreFormat, 1)    
    const maxScoring = scoreFormat.length
    let sampleOutput = `Sample Scoring<br><table><tr><th>Rank</th><th>Score</th>`;
    for (let i = 0; i < maxScoring; i++) {
        sampleOutput += `<tr><td>${i + 1}</td><td>${(scoreFormat[i] || 0)}</td></tr>`
    }
    sampleOutput += "</table>"
    return sampleOutput;
}