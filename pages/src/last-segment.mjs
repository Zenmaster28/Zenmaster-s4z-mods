import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';

//common.enableSentry();

const doc = document.documentElement;
const L = sauce.locale;
let refresh = Date.now() - 5000;

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
    // v0.13.0...
    
});

const settings = common.settingsStore.get();

function getNextPrevSegment(arr, number) {
    // Sort the array based on the roadindex property
    
    arr.sort((a, b) => a.markLine - b.markLine);
    let finishSegments = arr.filter(x => x.name.includes("Finish"))    
    // Find the first object with a roadindex greater than the given number
    for (let i = 0; i < finishSegments.length; i++) {        
        if (finishSegments[i].markLine > number) {
            let next = finishSegments[i];
            let prev;            
            i > 0 ? finishSegments[i - 1].id != finishSegments[i].id ? prev = finishSegments[i - 1] : prev = finishSegments[i - 2] : prev = [];
            return [next,prev];
        }        
    }
    if (number > finishSegments[finishSegments.length - 1].markLine)
    {
        let next = [];
        let prev = finishSegments[finishSegments.length - 1];
        return [next,prev]
    }    
    return -1;
}


async function getSegment(course, segmentId) {
    let segments = await common.rpc.getSegments(course);    
    let segment = segments.find(x => x.id === segmentId);
    return segment;
}



async function getSegmentResults(watching) {
    let refreshRate = 5000;
    let infoDiv = document.getElementById('segmentInfo');
    let ftsDiv = document.getElementById("ftsResults");
    let falDiv = document.getElementById("falResults");
    
    if (watching.segmentData)
    {
        let routeSegments = watching.segmentData.routeSegments;
        let currentLocation = watching.segmentData.currentPosition;
        let segmentsNextPrev = getNextPrevSegment(routeSegments,currentLocation);
        if (segmentsNextPrev[1].name)
        {
    
            currentLocation - segmentsNextPrev[1].markLine < 1000 ? refreshRate = 1000 : refreshRate = 5000;  // refresh at 1s intervals for 1000 meters after segment, then 5s.    
            if (Date.now() - refresh > refreshRate)
            {
                refresh = Date.now();                
                let prevSegmentResults = await common.rpc.getSegmentResults(segmentsNextPrev[1].id,{live:true})
                let eventResults = prevSegmentResults.filter(x => x.eventSubgroupId === watching.state.eventSubgroupId);                
                if (segmentsNextPrev[1].name)
                {
                    let segmentName = segmentsNextPrev[1].name.replace(" Finish","")
                    infoDiv.innerHTML = "Previous Segment: " + segmentName;                    
                    let inEvent = false;
                    let eventStartTime;
                    if (watching.state.eventSubgroupId != 0)
                    {
                        let eventData = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId);
                        eventStartTime = eventData.eventSubgroupStartWT;
                        inEvent = true;
                    }                   
                    ftsDiv.innerHTML = "";
                    falDiv.innerHTML = "";
                    let ftsTable = document.createElement('table'); 
                    let falTable = document.createElement('table');
                    
                    for (let rank = 0; rank < 20; rank++)
                    {                    
                        if (rank >= eventResults.length)
                        {
                            continue;
                        }                     
                        let tr = document.createElement('tr');            
                        let td = document.createElement('td');
                        td.innerHTML = rank + 1;
                        tr.appendChild(td);
                        td = document.createElement('td');
                        td.innerHTML = eventResults[rank].firstName + " " + eventResults[rank].lastName;
                        tr.appendChild(td);
                        td = document.createElement('td');
                        td.innerHTML = formatTime(eventResults[rank].elapsed);
                        tr.appendChild(td)
                        ftsTable.appendChild(tr);            
                    }
                    ftsDiv.appendChild(ftsTable)                    
                    if (inEvent)
                    {
                        let falResults = eventResults.sort((a, b) => {
                            return a.worldTime - b.worldTime;
                        })
                        for (let rank = 0; rank < 20; rank++)
                        {
                            if (rank >= falResults.length)
                            {
                                continue;
                            }
                            let tr = document.createElement('tr');            
                            let td = document.createElement('td');
                            td.innerHTML = rank + 1;
                            tr.appendChild(td);
                            td = document.createElement('td');
                            td.innerHTML = falResults[rank].firstName + " " + falResults[rank].lastName;
                            tr.appendChild(td);
                            td = document.createElement('td');
                            td.innerHTML = formatTime((falResults[rank].worldTime - eventStartTime) / 1000);
                            tr.appendChild(td)
                            falTable.appendChild(tr);            
                        }
                        falDiv.appendChild(falTable)
                    }
                    else
                    {
                        falDiv.innerHTML = "FAL disabled outside of events"
                    }
                }                            
            }
        }
        else
        {
            infoDiv.innerHTML = "Waiting for first segment results"
            falDiv.innerHTML = "";
            ftsDiv.innerHTML = "";
        }
    }
    else
    {
        infoDiv.innerHTML = "Waiting for segment data"
        falDiv.innerHTML = "";
        ftsDiv.innerHTML = "";
    }
}

async function getSegmentBests(segmentId, athleteId) {
    let segmentBests = await common.rpc.getSegmentResults(segmentId, {athleteId: athleteId, from: Date.now() - 86400000 * 90,})
    return segmentBests;
}

const formatTime = milliseconds => {
    milliseconds = milliseconds * 1000;
    const ms = milliseconds.toString().substr(-3);
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    
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
}
setBackground();
