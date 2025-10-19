import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
let dbSegments = await zen.openSegmentsDB();
let dbSegmentConfig = await zen.openSegmentConfigDB();
let dbTeams = await zen.openTeamsDB();
await zen.cleanupSegmentsDB(dbSegments);
await zen.cleanupSegmentsDB(dbSegments, {live: true});
await zen.cleanupSegmentConfigDB(dbSegmentConfig);
let allKnownRacers = [];
let allKnownRacersStatus = new Map();
let settings = common.settingsStore.get();
let raceResults = [];
let lastKnownSG = {
    eventSubgroupId: 0,
    eventSubgroupStart: 0
};
let sgEntrantsList = [];
let lastKnownSegmentData;
let currentEventConfig;
let watchingTeam;
let refresh = Date.now() - 2000000;
let lastAllCatRefresh = Date.now() - 2000000;
let lastSegmentTS = Date.now() - 2000000;
let lastRotationTS = Date.now() - 2000000;
let busyVerifying = false;
let lastVerification = Date.now() - 2000000;
let ftsScoringResults = [];
const doc = document.documentElement;
doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
let allPointsTableVisible = true;
let rotateTableInterval = settings.rotateInterval * 1000 || 10000;
const pointsResultsDiv = document.getElementById("pointsResults");
const lastSegmentPointsResultsDiv = document.getElementById("lastSegmentPointsResults");
if (pointsResultsDiv) {
    console.log("Adding resize and scroll listeners")
    pointsResultsDiv.addEventListener('scroll', showTeamMateRows);
    lastSegmentPointsResultsDiv.addEventListener('scroll', showTeamMateRows);
    window.addEventListener('resize', showTeamMateRows);
    
}
const lastSegmentImportantScoresDiv = document.getElementById("lastSegmentImportantScores");
const importantScoresDiv = document.getElementById("importantScores");
const pointsTitleDiv = document.getElementById("pointsTitle");
function rotateVisibleTable(options) {
    
    if (settings.rotateTotalLast) {
        showTeamMateRows();
        lastRotationTS = Date.now();
        //console.log("Rotating table at ", new Date())
        if (options.forceLast) {
            allPointsTableVisible = false;
        } else {
            allPointsTableVisible = !allPointsTableVisible;
        }
        pointsResultsDiv.style.display = allPointsTableVisible ? "" : "none";
        lastSegmentPointsResultsDiv.style.display = allPointsTableVisible ? "none" : "";
        pointsTitleDiv.style.display = allPointsTableVisible ? "none" : "";
        lastSegmentImportantScoresDiv.style.display = allPointsTableVisible ? "none" : "";
        importantScoresDiv.style.display = allPointsTableVisible ? "" : "none";
    } else {
        //console.log("Rotation disabled")
        pointsResultsDiv.style.display = "";
        lastSegmentPointsResultsDiv.style.display = "none";   
        pointsTitleDiv.style.display = "none";   
        lastSegmentImportantScoresDiv.style.display = "none";  
        importantScoresDiv.style.display = "";
    }
}
//let rotationInterval = setInterval(rotateVisibleTable, rotateTableInterval);

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
    badgeScale: 0.7,
    femaleOnly: false,
    lineSpacing: 1.2,
    showTeamScore: false,
    useCustomTeams: false,
    solidBackground: false,
    backgroundColor: '#00ff00',
    stickyWatching: true,
    stickyTeammate: true,
    stickyMarked: true,
    showUnknownTeam: false
});
/*
common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});
*/

if (settings.preview) {
    console.log("clearing preview setting")
    settings.preview = false;
    common.settingsStore.set("preview", false);
}
changelineSpacing();
setBackground();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

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
        return seconds.toString().padStart(1, "0") + "." + ms;
    }
}

async function getKnownRacersV2(watching, currentEventConfig) {
    let eventSubgroupId;
    let segmentData;
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        //segmentData = watching.segmentData;
        //debugger
        segmentData = currentEventConfig.segments;
    }
    const prevSegmentResults = await zen.getSegmentResults(dbSegments, eventSubgroupId, {live: true})
    const eventJoined = await common.rpc.getEventSubgroupEntrants(eventSubgroupId, {joined: true})
    const uniqueSegmentIds = getUniqueValues(segmentData, "segmentId")
    //debugger
    if (prevSegmentResults.length > 0) {
        //debugger
    }
    for (let segId of uniqueSegmentIds) {
        const resultsLive = await common.rpc.getSegmentResults(segId, {live: true});    
        let eventRes = resultsLive.filter(x => x.eventSubgroupId == eventSubgroupId);           
        if (eventRes.length > 0)  
        {
            //debugger
            let missingLiveResults = [];
            for (let res of eventRes) {
                if (!prevSegmentResults.find(x => res.id == x.id)) {
                    missingLiveResults.push(res)
                    prevSegmentResults.push(res)
                }
            }
            if (missingLiveResults.length > 0) {
                //console.log("Adding", missingLiveResults.length, "new results to the live db")
                await zen.storeSegmentResults(dbSegments, missingLiveResults, {live: true})
            }
            //console.log("Found segment results", eventRes)
            //const results = await common.rpc.getSegmentResults(firstSegment.id);
            //let knownRacers = new Set(eventRes.map(d => d.athleteId))
            //let knownRacers = eventRes.map(d => ({ athleteId: d.athleteId, eventSubgroupId: d.eventSubgroupId }));
            let knownRacers = prevSegmentResults.map(d => ({ athleteId: d.athleteId, eventSubgroupId: d.eventSubgroupId }));
            //debugger
            for (let racer of knownRacers)
            {
                //if (!allKnownRacers.includes(racer))
                if (!allKnownRacers.find(x => x.athleteId == racer.athleteId) && eventJoined.find(x => x.id == racer.athleteId)) // make sure they aren't already a known racer and verify they are in the list of riders that joined the pen
                {
                    allKnownRacers.push(racer);
                } else if (!eventJoined.find(x => x.id == racer.athleteId)) {
                    console.log("Found a racer that wasn't in the joined pen list? ", racer)
                }
            }        
        }
    }
}

async function verifyRacers() {    
    busyVerifying = true;
    const racers2Verify = [...allKnownRacers];
    console.log("Verifying racers", racers2Verify)
    const now = Date.now();
    let lastRPCCheck = now - 5000;
    for (let racer of racers2Verify) {
        const racerStatus = allKnownRacersStatus.get(racer.athleteId);
        if (racerStatus && now - racerStatus.lastSeenTS > 60000) {
            console.log("Racer", racer.athleteId, "hasn't been seen in 60 seconds, checking status via RPC playerState") 
            if (Date.now() - lastRPCCheck < 3500) {
                console.log("Waiting 3.5 seconds before checking playerState for", racer.athleteId)
                await zen.sleep(3500);
            }
            const racerState = await common.rpc.getPlayerState(racer.athleteId);
            lastRPCCheck = Date.now();
            if (!racerState) {
                console.log("no playerState for", racer.athleteId)
                racerStatus.noPlayerState = true;
            } else if (racerState.eventSubgroupId != racer.eventSubgroupId || !racerState.eventSubgroupId) {
                const racerLeft = await common.rpc.getAthlete(racer.athleteId);
                if (raceResults.find(x => x.profileId == racer.athleteId)) {
                    racerStatus.finishedEvent = true;
                    racerStatus.noPlayerState = false;
                    console.log("racer has finished the event!", racerLeft?.id, racerLeft?.sanitizedFullname);
                } else {
                    racerStatus.leftEvent = true;
                    racerStatus.noPlayerState = false;
                    console.log("racer appears to have left the event!", racerLeft?.id, racerLeft?.sanitizedFullname)
                }
            } else {
                //debugger
                racerStatus.lastSeenTS = Date.now();
                racerStatus.noPlayerState = false;
                console.log("Racer", racer.athleteId, "confirmed still in the event via playerState")
            }
        } else if (racerStatus && now - racerStatus.lastSeenTS <= 60000) {
            //console.log("Racer", racer.athleteId, "has been seen recently, skipping RPC check")
        } else {
            if (Date.now() - lastRPCCheck < 3500) {
                console.log("Waiting 3.5 seconds before checking playerState for", racer.athleteId)
                await zen.sleep(3500);
            }
            const racerState = await common.rpc.getPlayerState(racer.athleteId);
            lastRPCCheck = Date.now();
            const newRacerStatus = racerState ? {
                athleteId: racer.athleteId,
                eventSubgroupId: racerState.eventSubgroupId,
                lastSeenTS: Date.now() - 600000,
                leftEvent: false,
                lateJoin: false,
                finishedEvent: false,
                noPlayerState: false
            } : {
                athleteId: racer.athleteId,
                eventSubgroupId: 0,
                lastSeenTS: Date.now() - 600000,
                leftEvent: false,
                lateJoin: false,
                finishedEvent: false,
                noPlayerState: true
            };
            if (!racerState) {
                console.log("no playerState for", racer.athleteId)
                newRacerStatus.noPlayerState = true;
            } else if (racerState.eventSubgroupId != racer.eventSubgroupId) {
                const racerLeft = await common.rpc.getAthlete(racer.athleteId);
                console.log("racer appears to have left the event!", racerLeft?.id, racerLeft?.sanitizedFullname)
                newRacerStatus.leftEvent = true;
                newRacerStatus.noPlayerState = false;
            } else {
                console.log("Racer", racer.athleteId, "confirmed still in the event via playerState")
                newRacerStatus.lastSeenTS = Date.now();
                newRacerStatus.noPlayerState = false;
            }
            allKnownRacersStatus.set(racer.athleteId, newRacerStatus);
        }
        
    }
    busyVerifying = false;
    lastVerification = Date.now();
}

async function getKnownRacers(watching) {    
    // todo - deal with sg = 0 after race is over
    let eventSubgroupId;
    let segmentData;
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        //segmentData = watching.segmentData;
        segmentData = currentEventConfig.segments;
    }
    const eventJoined = await common.rpc.getEventSubgroupEntrants(eventSubgroupId, {joined: true})
    const uniqueSegmentIds = getUniqueValues(segmentData, "segmentId")
    for (let segId of uniqueSegmentIds) {
        const resultsLive = await common.rpc.getSegmentResults(segId, {live: true});    
        var eventRes = resultsLive.filter(x => x.eventSubgroupId == eventSubgroupId);           
        if (eventRes.length > 0)  
        {
            //console.log("Found segment results", eventRes)
            //const results = await common.rpc.getSegmentResults(firstSegment.id);
            //let knownRacers = new Set(eventRes.map(d => d.athleteId))
            let knownRacers = eventRes.map(d => ({ athleteId: d.athleteId, eventSubgroupId: d.eventSubgroupId }));
            //debugger
            for (let racer of knownRacers)
            {
                //if (!allKnownRacers.includes(racer))
                if (!allKnownRacers.find(x => x.athleteId == racer.athleteId) && eventJoined.find(x => x.id == racer.athleteId)) // make sure they aren't already a known racer and verify they are in the list of riders that joined the pen
                {
                    allKnownRacers.push(racer);
                } else if (!eventJoined.find(x => x.id == racer.athleteId)) {
                    console.log("Found a racer that wasn't in the joined pen list? ", racer)
                }
            }        
        }
    }
    const savedKnownRacers = await zen.storeKnownRacers(dbSegments, allKnownRacers)
    //console.log("Saved known racers in IndexedDB", savedKnownRacers)
    //console.log("Known racer count from getKnownRacers: " + allKnownRacers.length, allKnownRacers)
   //debugger
}

async function monitorAllCats(eventSubgroupId, currentEventConfig) {
    if (Date.now() - lastAllCatRefresh > 15000) {
        console.log("Monitoring all cats")
        const eventSubgroupIds = currentEventConfig.eventSubgroupIds
        const uniqueSegmentIds = getUniqueValues(currentEventConfig.segments, "segmentId")
        for (let segId of uniqueSegmentIds) {
            const resultsFull = await common.rpc.getSegmentResults(segId);
            const resultsLive = await common.rpc.getSegmentResults(segId, {live:true})
            //console.log("Got the segment results for", segId)
            for (let sgId of eventSubgroupIds) {
                if (sgId == eventSubgroupId) {
                    continue;
                }
                //console.log("Monitoring", sgId)
                const sg = await common.rpc.getEventSubgroup(sgId);            
                const prevLiveResults = await zen.getSegmentResults(dbSegments, sgId, {live: true})
                const eventSubgroupStart = sg.eventSubgroupStart;
                //console.log("prevLiveResults", prevLiveResults)
                //TODO: don't get the eventJoined on every refresh.  Ensure you get it after the event starts and then save it.
                const sgEntrants = sgEntrantsList.find(x => x.eventSubgroupId == sgId);
                let eventJoined;
                if (sgEntrants) {
                    //console.log("Found previous entrants for", sgId)
                    eventJoined = sgEntrants.entrants;
                } else {
                    eventJoined = await common.rpc.getEventSubgroupEntrants(sgId, {joined: true});
                    if (Date.now() - eventSubgroupStart > 60000) {
                        //console.log("Pushing entrants to sgEntrantsList for", sgId)
                        sgEntrantsList.push({
                            eventSubgroupId: sgId,
                            ts: Date.now(),
                            entrants: eventJoined
                        })
                    } else {
                        //console.log("Waiting until 1 min after start before saving entrants for", sgId, Date.now() - eventSubgroupStart)
                        //debugger
                    }
                }
                //console.log("eventJoined", eventJoined)
                const eventRes = resultsLive.filter(x => x.eventSubgroupId == sgId)
                //console.log("eventRes", eventRes)
                let missingLiveResults = [];
                for (let res of eventRes) {
                    if (!prevLiveResults.find(x => res.id == x.id)) {
                        missingLiveResults.push(res)
                        prevLiveResults.push(res)
                    }
                }
                if (missingLiveResults.length > 0) {
                    const savedLiveResultsCount = await zen.storeSegmentResults(dbSegments, missingLiveResults, {live: true})
                    //console.log("Saved Live results", savedLiveResultsCount)
                }
                const knownRacersFromResults = prevLiveResults.map(d => ({ athleteId: d.athleteId, eventSubgroupId: d.eventSubgroupId }));
                //console.log("knownRacersFromResults", knownRacersFromResults)
                const sgKnownRacers = [];
                for (let racer of knownRacersFromResults) {
                    if (eventJoined.find(x => x.id == racer.athleteId)) {
                        sgKnownRacers.push(racer.athleteId)
                    } else {
                        console.log("Found a racer that wasn't in the joined pen list? ", racer)
                    }
                }
                //console.log("sgKnownRacers", sgKnownRacers)
                const resultsToStore = [];
                const resultsAfterStartTime = resultsFull.filter(x => x.ts > sg.eventSubgroupStart)
                //console.log("resultAfterStartTime", resultsAfterStartTime)
                const resultsForRacers = resultsAfterStartTime.filter(result => sgKnownRacers.includes(result.athleteId))
                //console.log("resultsForRacers", resultsForRacers)
                resultsForRacers.forEach(result => {
                    result.eventSubgroupId = sgId;
                    result.segmentId = segId;
                    resultsToStore.push(result)
                })
                //console.log("resultsToStore", resultsToStore)
                const savedResultsCount = await zen.storeSegmentResults(dbSegments, resultsToStore);                
                //console.log("Saved full results", savedResultsCount)
            }
            //console.log("Done processing", segId)
        }
        console.log("Done processing all cats")
        lastAllCatRefresh = Date.now();
    }
}

async function getAllSegmentResults(watching, currentEventConfig) {
    let eventSubgroupId;
    let segmentData;    
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        segmentData = currentEventConfig.segments;
    }
    let eventRacers = allKnownRacers.filter(x => x.eventSubgroupId === eventSubgroupId).map(x => x.athleteId); // make sure we only get racers from this eventsubgroup    
    //console.log("Known racer count: ", eventRacers.length, "Event participants:", watching.eventParticipants, "racersStatus:", allKnownRacersStatus.size)
    //console.log(allKnownRacersStatus)
    let sg = await common.rpc.getEventSubgroup(eventSubgroupId)    
    let eventStartTime;
    if (sg) { 
        eventStartTime = sg.eventSubgroupStart;
        lastKnownSG.eventSubgroupStart = eventStartTime
        if (watching.state.eventSubgroupId) {
            lastKnownSegmentData = currentEventConfig.segments;
        }
    } else {
        eventStartTime = lastKnownSG.eventSubgroupStart
    }
    const uniqueSegmentIds = getUniqueValues(segmentData, "segmentId")
    let resultsToStore = [];
    for (let segId of uniqueSegmentIds) {
        const resultsFull = await common.rpc.getSegmentResults(segId);    
        let eventRes = resultsFull.filter(x => x.ts > eventStartTime);      
        //console.log("Found segment results from full leaderboard", eventRes)     
        if (eventRes.length > 0)  // don't bother getting the full leaderboard if no live results for the event yet
        {            
            const filteredEventRes = eventRes.filter(event => eventRacers.includes(event.athleteId)); 
            //console.log(filteredEventRes)
            filteredEventRes.forEach(result => {   
                result.eventSubgroupId = eventSubgroupId;
                result.segmentId = segId;
                resultsToStore.push(result)                   
            })
            //debugger     
        }
    }
    //debugger
    //console.log("resultsToStore", resultsToStore)
    const savedResultsCount = await zen.storeSegmentResults(dbSegments, resultsToStore);    
    //console.log("New saved results:", savedResultsCount)
    //console.log("segment results:",segmentResults)
    //console.log("results to store:", resultsToStore)
}

async function getRaceResults(watching) {
    let eventSubgroupId;
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
    }
    let res = await common.rpc.getEventSubgroupResults(eventSubgroupId);
    raceResults = [...res];
    /*
    res.forEach(result => {
        const exists = raceResults.some(r => r.profileId === result.profileId);
        if (!exists) {
            console.log("Adding final race result for ", result)
            raceResults.push(result)
        }
    })
    */
}

async function processResults(watching, dbResults, currentEventConfig) {
    let eventResults = [];
    //let eventSubgroupId = watching.state.eventSubgroupId;
    let eventSubgroupId;
    let segmentData;
    if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
        //console.log("Using last known segment data")
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        //segmentData = watching.segmentData;
        segmentData = currentEventConfig.segments;
        //console.log("Using watching segment data")
    }
    //console.log("Segment data is", segmentData)
    //let eventRacers = allKnownRacers.filter(x => x.eventSubgroupId === eventSubgroupId).map(x => x.athleteId); // make sure we only get racers from this eventsubgroup
    //let v2Racers = await getKnownRacersV2(watching)
    let eventRacers = (await zen.getKnownRacers(dbSegments, eventSubgroupId)).map(x => x.athleteId)
    eventRacers = [...new Set(eventRacers)]
    segmentData = segmentData.filter(x => x.type != "custom" && !x.name.includes("Finish"));
    for (let segment of segmentData) {
        //let segRes = segmentResults.filter(x => x.segmentId == segment.id).sort((a, b) => {return a.worldTime - b.worldTime})
        let segRes = dbResults.filter(x => x.segmentId == segment.segmentId).sort((a, b) => {return a.worldTime - b.worldTime})
        //console.log(segRes)
        //debugger
        let repeatResults = [];
        //for (let racer of allKnownRacers) {
        for (let racer of eventRacers) {
            let racerResults = segRes.filter(x => x.athleteId == racer)
            if (racerResults.length >= segment.repeat) {
                repeatResults.push(racerResults[segment.repeat - 1])
            }
        }
        let falRes = repeatResults.slice().sort((a, b) => {
            return a.ts - b.ts;
        });
        let ftsRes = repeatResults.slice().sort ((a, b) => {
            return a.elapsed - b.elapsed
        });
        for (let res of falRes) {
            res.falDiff = res.ts - falRes[0].ts;
        }
        for (let res of ftsRes) {
            res.ftsDiff = res.elapsed - ftsRes[0].elapsed;
        }
        let repeatData = {
            name: segment.name,
            segmentId: segment.segmentId,            
            repeat: segment.repeat,
            fts: ftsRes,
            fal: falRes
        }
        eventResults.push(repeatData)
        
    }
    return eventResults;    
}

async function scoreResults(eventResults, currentEventConfig, lastSegment=false) {
    if (!currentEventConfig) {
        return [];
    }
    let racerScores = [];
    //let scoreFormat = "fts";
    //let scoreFormat = settings.FTSorFAL;
    let scoreFormats = ["FTS"];
    let segmentRepeat;
    let uniqueSegmentIds;
    let perEventResults = [];
    //console.log("Event config", currentEventConfig)
    //console.log(eventResults)
    if (!lastSegment) {
        ftsScoringResults.length = 0;
    } else {
        console.log("ftsScoringResults", ftsScoringResults);
    }
    if (currentEventConfig.ftsPerEvent) {
        uniqueSegmentIds = getUniqueValues(currentEventConfig.segments, "segmentId")
        for (let segment of uniqueSegmentIds) {
            //console.log(segment, eventResults)
            const thisSegmentResults = eventResults[0] ? eventResults.filter(x => x.segmentId == segment) : []
            if (thisSegmentResults.length > 0) {
                const ftsResults = thisSegmentResults.flatMap(x => x.fts);
                ftsResults.sort((a,b) => a.elapsed - b.elapsed);
                perEventResults.push({
                    name: thisSegmentResults[0].name,
                    repeat: 1,
                    segmentId: thisSegmentResults[0].segmentId,
                    fts: ftsResults
                })
            }
        }
        console.log("Per event results", perEventResults)
    }
    //debugger
    for (let segRes of eventResults) {
        //debugger
        let segResPerEvent = [];
        let customScoring = false;
        if (currentEventConfig.ftsPerEvent) {
            segResPerEvent = perEventResults.find(x => x.segmentId == segRes.segmentId);
        }
        if (currentEventConfig) {
            segmentRepeat = segRes ? currentEventConfig.segments.find(x => x.segmentId == segRes.segmentId && x.repeat == segRes.repeat) : []
            const overrideConfig = settings.configOverride ? JSON.parse(settings.configOverride) : null;
            if (overrideConfig?.eventSubgroupId == currentEventConfig.eventSubgroupId) {
                customScoring = true;
                const thisSegmentConfig = overrideConfig.segments.find(x => x.segmentId == segmentRepeat.segmentId && x.repeat == segmentRepeat.repeat);
                if (thisSegmentConfig) {
                    segmentRepeat.enabled = thisSegmentConfig.enabled;
                }
                //debugger
            }
            if (!segmentRepeat.enabled) {
                console.log("NOT scoring", segmentRepeat.name, "repeat", segmentRepeat.repeat, "custom scoring?", customScoring)
                continue; 
            }
            scoreFormats = segmentRepeat.scoreFormat.split(",");
        //}
            for (let scoreFormat of scoreFormats) {
                //console.log("Scoring",scoreFormat)
                scoreFormat = scoreFormat.toLowerCase();
                let scores;
                let scoreStep;
                let bonusScores = [];
                if (scoreFormat == "fts") {
                    if (settings.femaleOnly) {
                        console.log("Getting female only FTS results")
                        if (currentEventConfig.ftsPerEvent) {
                            console.log("Using per event FTS results")
                            //debugger
                            //perEventResults.fts = perEventResults.fts.filter(x => x.gender == "female");
                            segResPerEvent.fts = segResPerEvent.fts.filter(x => x.gender == "female");
                            console.log("female only per event FTS results", segResPerEvent.fts)
                        } else {
                            console.log("Using per segment FTS results")
                            segRes.fts = segRes.fts.filter(x => x.gender == "female")
                            console.log("female only per segment FTS results", segRes.fts)
                        }
                    }
                    scores = currentEventConfig.ftsScoreFormat;
                    scoreStep = currentEventConfig.ftsStep;
                    const ftsBonus = currentEventConfig.ftsBonus;
                    if (ftsBonus !== "") {
                        bonusScores = zen.getScoreFormat(ftsBonus, 1)
                    }
                } else if (scoreFormat == "fal") {                    
                    if (settings.femaleOnly) {
                        console.log("Getting female only FAL results")
                        segRes.fal = segRes.fal.filter(x => x.gender == "female")
                        console.log("female only FAL results", segRes.fal)
                    }
                    scores = currentEventConfig.falScoreFormat;
                    scoreStep = currentEventConfig.falStep;
                    const falBonus = currentEventConfig.falBonus;
                    if (falBonus !== "") {
                        bonusScores = zen.getScoreFormat(falBonus, 1)
                    }
                }
                let regex = /[a-z]\.\./i; //dot notation format
                const eventRacers = allKnownRacers.filter(x => x.eventSubgroupId == currentEventConfig.eventSubgroupId)
                if (regex.test(scores)) {
                    scores = scores.replace(regex, `${eventRacers.length}..`)
                }
                regex = /[a-z]\:/i; //matlab format
                if (regex.test(scores)) {
                    scores = scores.replace(regex, `${eventRacers.length}:`)
                }
                let scorePoints = zen.getScoreFormat(scores, scoreStep);        
                let pointsCounter = scorePoints.length
                
                const ties = zen.findTies(segRes[scoreFormat], scoreFormat)
                if (ties.length > 0) {
                    //found a tie, adjust the scoring to reflect the tie
                    //console.log(`Found one or more ${scoreFormat} ties!`, ties)
                    for (let tie of ties) {                                
                        scorePoints[tie.idxTie] = scorePoints[tie.idxTiedWith]
                        //console.log(segRes[scoreFormat][tie.idxTie], segRes[scoreFormat][tie.idxTiedWith])
                    }
                    //debugger
                }
                //debugger
                //console.log("Scoring ", pointsCounter, "racers as", scorePoints)
                for (let i = 0; i < pointsCounter; i++) {  
                    if (currentEventConfig.ftsPerEvent && scoreFormat == "fts") {                        
                        if (segRes.repeat == 1) {
                            //console.log("segRes", segRes, "segResPerEvent", segResPerEvent)
                            if (segResPerEvent[scoreFormat].length > 0 && segResPerEvent[scoreFormat][i]) {
                                let prevScore = racerScores.find(x => x.athleteId == segResPerEvent[scoreFormat][i].athleteId)
                                let scoreToAdd;
                                if (!prevScore) {
                                    //debugger
                                    scoreToAdd = scorePoints[i]
                                    if (i < bonusScores.length) {
                                        //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                        scoreToAdd += bonusScores[i];
                                    }
                                    let score = {
                                        athleteId: segResPerEvent[scoreFormat][i].athleteId,
                                        name: segResPerEvent[scoreFormat][i].firstName + " " + segResPerEvent[scoreFormat][i].lastName,
                                        ftsPointTotal: scoreToAdd,
                                        falPointTotal: 0
                                    } 
                                    score.pointTotal = score.ftsPointTotal + score.falPointTotal;
                                    if (score.pointTotal > 0) {
                                        racerScores.push(score);
                                    }
                                } else {
                                    scoreToAdd = scorePoints[i]
                                    if (i < bonusScores.length) {
                                        //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                        scoreToAdd += bonusScores[i];
                                    }
                                    if (scoreFormat == "fts") {
                                        prevScore.ftsPointTotal += scoreToAdd;
                                        prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                    } else {
                                        prevScore.falPointTotal += scoreToAdd;
                                        prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                    }
                                }
                                if (scoreFormat == "fts") {
                                    let ftsScore = segResPerEvent.fts[i];
                                    if (ftsScore) {
                                        ftsScore.ftsPoints = scoreToAdd;
                                        ftsScoringResults.push(ftsScore);
                                    }
                                    //console.log("ftsScoringResults", ftsScoringResults);
                                }
                                //points--;
                            }
                        } else if (lastSegment) {
                            //TODO - check if scores from this segment match the scoring fts results
                            //debugger
                            const checkScoreId = ftsScoringResults.find(x => x.id == segResPerEvent.fts[i]?.id);
                            if (checkScoreId && segResPerEvent[scoreFormat].length > 0 && segResPerEvent[scoreFormat][i]) {
                                console.log("Found a scoring FTS result", checkScoreId);
                                let prevScore = racerScores.find(x => x.athleteId == segResPerEvent[scoreFormat][i].athleteId)
                                let scoreToAdd;
                                if (!prevScore) {
                                    //debugger
                                    scoreToAdd = checkScoreId.ftsPoints;
                                    if (i < bonusScores.length) {
                                        //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                        scoreToAdd += bonusScores[i];
                                    }
                                    let score = {
                                        athleteId: segResPerEvent[scoreFormat][i].athleteId,
                                        name: segResPerEvent[scoreFormat][i].firstName + " " + segResPerEvent[scoreFormat][i].lastName,
                                        ftsPointTotal: scoreToAdd,
                                        falPointTotal: 0
                                    } 
                                    score.pointTotal = score.ftsPointTotal + score.falPointTotal;
                                    if (score.pointTotal > 0) {
                                        racerScores.push(score);
                                    }
                                } else {
                                    scoreToAdd = checkScoreId.ftsPoints;
                                    if (i < bonusScores.length) {
                                        //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                        scoreToAdd += bonusScores[i];
                                    }
                                    if (scoreFormat == "fts") {
                                        prevScore.ftsPointTotal += scoreToAdd;
                                        prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                    } else {
                                        prevScore.falPointTotal += scoreToAdd;
                                        prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                    }
                                }                                
                                //points--;
                            }
                        }
                    } else {
                        if (segRes[scoreFormat].length > 0 && segRes[scoreFormat][i]) {
                            let prevScore = racerScores.find(x => x.athleteId == segRes[scoreFormat][i].athleteId)
                            let scoreToAdd;
                            if (!prevScore) {
                                //debugger
                                scoreToAdd = scorePoints[i]
                                if (i < bonusScores.length) {
                                    //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                    scoreToAdd += bonusScores[i];
                                }
                                let score = scoreFormat == "fts" ? {
                                    athleteId: segRes[scoreFormat][i].athleteId,
                                    name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                    ftsPointTotal: scoreToAdd,
                                    falPointTotal: 0
                                } : {
                                    athleteId: segRes[scoreFormat][i].athleteId,
                                    name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                    ftsPointTotal: 0,
                                    falPointTotal: scoreToAdd
                                }
                                score.pointTotal = score.ftsPointTotal + score.falPointTotal;
                                if (score.pointTotal > 0) {
                                    racerScores.push(score);
                                }
                            } else {
                                scoreToAdd = scorePoints[i]
                                if (i < bonusScores.length) {
                                    //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                    scoreToAdd += bonusScores[i];
                                }
                                if (scoreFormat == "fts") {
                                    prevScore.ftsPointTotal += scoreToAdd;
                                    prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                } else {
                                    prevScore.falPointTotal += scoreToAdd;
                                    prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                }
                            }                            
                            //points--;
                        }
                    }
                }
            }
        }
    }
    let finScores = currentEventConfig.finScoreFormat;
    const finScoreStep = currentEventConfig.finStep;
    let scorePoints =[];
    let bonusScores = [];
    if (finScores) {
        const finBonus = currentEventConfig.finBonus;
        if (finBonus !== "") {
            bonusScores = zen.getScoreFormat(finBonus, 1);
            //console.log("FIN bonus points",bonusScores)
        }
        let regex = /[a-z]\.\./i; //dot notation format
        const eventRacers = allKnownRacers.filter(x => x.eventSubgroupId == currentEventConfig.eventSubgroupId)
        if (regex.test(finScores)) {
            finScores = finScores.replace(regex, `${eventRacers.length}..`)
        }
        regex = /[a-z]\:/i; //matlab format
        if (regex.test(finScores)) {
            finScores = finScores.replace(regex, `${eventRacers.length}:`)
        }
        scorePoints = zen.getScoreFormat(finScores, finScoreStep);  
        //console.log("FIN score points",scorePoints)
    }
    //debugger
    if (raceResults.length > 0) {
        if (settings.femaleOnly) {
            raceResults = raceResults.filter(x => x.athlete.gender == "female");
            let newRank = 1;
            for (let result of raceResults) {
                result.rank = newRank;
                newRank++;
            }
            console.log("female race results", raceResults)
        }
        for (let result of raceResults) {
            const findRacer = racerScores.find(x => x.athleteId == result.profileId) // make sure race result has an entry in racerScores
            if (!findRacer) {
                //console.log("Creating missing racerScores entry for finisher",result.profileData.firstName.trim(), result.profileData.lastName.trim())
                const newEntry = {
                    athleteId: result.profileId,
                    falPointTotal: 0,
                    finPoints: 0,
                    ftsPointTotal: 0,
                    name: result.profileData.firstName.trim() + " " + result.profileData.lastName.trim(),
                    pointTotal: 0
                }
                racerScores.push(newEntry)
            }
        }
    }
    for (let racer of racerScores) {
        if (raceResults.length > 0) {            
            const racerResult = raceResults.find(x => x.profileId == racer.athleteId)
            //debugger
            let pointsCounter = scorePoints.length;
            let bonusPointsCounter = bonusScores.length;
            if (racerResult) {
                if (racerResult.rank <= pointsCounter) {
                    racer.finPoints = scorePoints[racerResult.rank - 1];
                } else {
                    racer.finPoints = 0;
                }
                if (racerResult.rank <= bonusPointsCounter) {
                    //console.log("Adding", bonusScores[racerResult.rank - 1], "bonus FIN points to",racer.name )
                    racer.finPoints += bonusScores[racerResult.rank - 1];
                }
                //debugger
            } else {
                racer.finPoints = 0;
            }
                //racer.finPoints = scorePoints[i];
            
            //debugger
        } else {
            racer.finPoints = 0;
        }
        racer.pointTotal = racer.ftsPointTotal + racer.falPointTotal + racer.finPoints;
    }  
    //console.log("Racer scores",racerScores)  
    return racerScores;
}

function evaluateVisibility(scoreType, ignoreFIN = false) {
    if (!currentEventConfig) {
        return "style=display:none";
    }
    if (settings.onlyTotalPoints) {
        return "style=display:none";
    }
    if (!currentEventConfig.segments.some(segment => segment.scoreFormat.includes(scoreType)) && scoreType != "FIN") {
        //console.log("No segments with a score of type",scoreType)
        return "style=display:none";
    }
    if (scoreType == "FIN" && (currentEventConfig.finScoreFormat == "" || raceResults.length == 0 || ignoreFIN)) {
        //console.log("No score format for FIN")
        return "style=display:none";
    }
    if (scoreType == "FTS" && currentEventConfig.ftsScoreFormat == "") {
        //console.log("No score format for FTS")
        return "style=display:none";
    }
    if (scoreType == "FAL" && currentEventConfig.falScoreFormat == "") {
        //console.log("No score format for FAL")
        return "style=display:none";
    }
    //debugger
}

async function buildPointsTable(racerScores, athletes, lastSegmentName = "", ignoreFIN = false) {
    pointsTitleDiv.innerHTML = lastSegmentName;
    const pointsTableId = lastSegmentName == "" ? "pointsTable" : "pointsTableLast"
    let tableFinalOutput = `<table id=${pointsTableId}><thead><th>Rank</th><th>Name</th><th ${evaluateVisibility('FAL')}>FAL</th><th ${evaluateVisibility('FTS')}>FTS</th><th ${evaluateVisibility('FIN', ignoreFIN)}>FIN</th><th>Total</th></thead><tbody>`;
    let tableOutput = "";
    let rank = 1;
    let teamRank = 1;
    let maxRacers = settings.maxRacersToDisplay;
    if (maxRacers == 0 || maxRacers == null) {
        maxRacers = Infinity;
    }
    //console.log("Max racers to display:", maxRacers)
    const allTeamScores = [];
    const customTeams = settings.useCustomTeams ? await zen.getExistingTeams(dbTeams) : [];
    const teamAssignments = settings.useCustomTeams ? await zen.getTeamAssignments(dbTeams) : [];
    const teamScore = {
        ftsPoints: 0,
        falPoints: 0,
        finPoints: 0,
        totalPoints: 0
    }
    for (let racer of racerScores) {
        if (rank > maxRacers) {
            break;
        };
        if (racer.pointTotal == 0) {
            break;
        }
        let teamBadge = "";
        
        //const athlete = await common.rpc.getAthleteData(racer.athleteId)
        const athlete = athletes.find(x => x?.athleteId == racer.athleteId);
        if (settings.showTeamBadges && athlete?.o101?.teamBadge) {
            teamBadge = athlete.o101.teamBadge;
        } else if (settings.showTeamBadges && athlete?.athlete.team) {
            teamBadge = common.teamBadge(athlete.athlete.team)
        }
        const sanitizedName = racer.name.replace(/\s*[\(\[].*?[\)\]]\s*/g, '').trim();
        let isWatching = false;
        let isMarked = false;
        //let teamTest = athlete?.athlete.team ? zen.isTeammate(athlete, settings.teamNames) : false;
        //console.log("teamTest", teamTest, athlete?.athlete.team)
        let isTeamMate = false;
        if (athlete?.watching) {
            isWatching = true;
        } else if (settings.highlightMarked && athlete?.athlete.marked) {
            isMarked = true;
        }
        if (settings.highlightTeammate) {
            isTeamMate = athlete ? zen.isTeammate(athlete, settings.teamNames, watchingTeam) : false;
        }
        if (settings.showTeamScore && (isTeamMate || isWatching)) {
            teamScore.ftsPoints += racer.ftsPointTotal;
            teamScore.falPoints += racer.falPointTotal;
            teamScore.finPoints += racer.finPoints;
            teamScore.totalPoints += racer.pointTotal;
        }
        if (settings.useCustomTeams) {
            //console.log("Checking custom teams")
            const customTeam = teamAssignments.find(x => x.athleteId == racer.athleteId)
            let customTeamName = customTeam ? (customTeams.find(x => x.id == parseInt(customTeam.team))).team : "";
            if (!customTeamName) {
                customTeamName = athlete?.athlete?.team || null;
            }
            teamBadge = customTeam ? common.teamBadge(customTeamName) : teamBadge;
            let currentTeamScore = allTeamScores.find(x => x.name == customTeamName);
            
            if (currentTeamScore) {
                //console.log("Found previous score for", customTeamName, currentTeamScore)
                //console.log("Adding racer scores of ", racer)
                currentTeamScore.ftsPoints += racer.ftsPointTotal;
                currentTeamScore.falPoints += racer.falPointTotal;
                currentTeamScore.finPoints += racer.finPoints;
                currentTeamScore.totalPoints += racer.pointTotal;
                //console.log("Scores after changes", currentTeamScore)
            } else {
                //console.log("Adding new team score for", customTeamName)  
                
                const newTeamScore = {
                    name: customTeamName || "Unknown",
                    ftsPoints: racer.ftsPointTotal,
                    falPoints: racer.falPointTotal,
                    finPoints: racer.finPoints,
                    totalPoints: racer.pointTotal
                };
                //console.log("New team score for", customTeamName, newTeamScore)
                if (newTeamScore.name == "Unknown") {
                    const unknownTeam = allTeamScores.find(x => x.name == "Unknown")
                    if (unknownTeam) {
                        //console.log("Unknown team before", unknownTeam)
                        //console.log("new team score", newTeamScore)
                        unknownTeam.ftsPoints += newTeamScore.ftsPoints;
                        unknownTeam.falPoints += newTeamScore.falPoints;
                        unknownTeam.finPoints += newTeamScore.finPoints;
                        unknownTeam.totalPoints += newTeamScore.totalPoints;
                    } else {
                        //console.log("Creating new team", newTeamScore)
                        allTeamScores.push(newTeamScore);
                    }
                    //console.log("Unknown team after", unknownTeam)
                } else {
                    allTeamScores.push(newTeamScore);
                }
                
            
            }
            if (lastSegmentName == "") {
                //console.log("allTeamScores", allTeamScores);
            } else {
                //console.log("allTeamScores for segment", lastSegmentName, allTeamScores)
            }
        }
        const racerStatus = allKnownRacersStatus.get(racer.athleteId);
        let status = "";
        if (racerStatus && racerStatus.leftEvent) {
            //status = " (Left Event)"
        } else if (racerStatus && racerStatus.noPlayerState) {
            //status = " (No playerState)"
        }
        tableOutput += isWatching ? "<tr class=watching>" : isTeamMate ? "<tr class=teammate>" : isMarked ? "<tr class=marked>" : "<tr>"
        tableOutput += `<td>${rank}</td><td><span id="riderName"><a href="/pages/profile.html?id=${racer.athleteId}&windowType=profile" target="profile">${sanitizedName}${status}</a></span><div id="info-item-team">${teamBadge}</div></td><td ${evaluateVisibility('FAL')}>${racer.falPointTotal}</td><td ${evaluateVisibility('FTS')}>${racer.ftsPointTotal}</td><td ${evaluateVisibility('FIN', ignoreFIN)}>${racer.finPoints}</td><td>${racer.pointTotal}</td></tr>`
        rank++;
    }  
    if (settings.useCustomTeams && lastSegmentName == "") {
        console.log("Event Team scores after all racers", allTeamScores)
    } else {
        console.log("Team scores after all racers for segment",lastSegmentName, allTeamScores)
    }
    if (settings.useCustomTeams) {        
        if (settings.showTeamScore) {
            teamScore.name = "My team"
            allTeamScores.push(teamScore)
        }
        allTeamScores.sort((a,b) => b.totalPoints - a.totalPoints)
        for (let teamScore of allTeamScores) {
            if (teamScore.name == "Unknown" && !settings.showUnknownTeam) {
                continue;
            }
            let teamScoreOutput = `<tr><td>${teamRank}</td><td><div id="info-item-team-l">${common.teamBadge(teamScore.name)}</div></td><td ${evaluateVisibility('FAL')}>${teamScore.falPoints}</td><td ${evaluateVisibility('FTS')}>${teamScore.ftsPoints}</td><td ${evaluateVisibility('FIN', ignoreFIN)}>${teamScore.finPoints}</td><td>${teamScore.totalPoints}</td></tr>`;
            tableFinalOutput += teamScoreOutput;
            teamRank++;
        }
    } else if (settings.showTeamScore) {
        let teamScoreOutput = `<tr class=teammate><td></td><td>Team<div id="info-item-team">${common.teamBadge(watchingTeam)}</div></td><td ${evaluateVisibility('FAL')}>${teamScore.falPoints}</td><td ${evaluateVisibility('FTS')}>${teamScore.ftsPoints}</td><td ${evaluateVisibility('FIN', ignoreFIN)}>${teamScore.finPoints}</td><td>${teamScore.totalPoints}</td></tr>`;
        tableFinalOutput += teamScoreOutput;
    }
    tableOutput += "</table>"    
    tableFinalOutput += tableOutput;
    if (settings.preview) {
        common.settingsStore.set("preview", false);
    }
    return tableFinalOutput;
}

async function displayResults(racerScores, lastSegmentScores, lastSegmentName) {
    //console.log("Scores to process:", racerScores)
    //let scoreFormat = settings.FTSorFAL;
    let customTitle = "";
    const overrideConfig = settings.configOverride ? JSON.parse(settings.configOverride) : null;
    if (overrideConfig && overrideConfig.eventSubgroupId == currentEventConfig.eventSubgroupId) {
        customTitle = overrideConfig.customTitle || "";
        document.getElementById("customTitle").style.display = "block";
        document.getElementById("customTitle").innerText = customTitle;
    }
    const eventSubgroupId = currentEventConfig.eventSubgroupId;
    
    const lastSegmentPointsResultsDiv = document.getElementById("lastSegmentPointsResults");
    
    const athleteIds = racerScores.map(x => x.athleteId);
    const athletes = await common.rpc.getAthletesData(athleteIds);
    //pointsResultsDiv.innerHTML = "";
    const tableFinalOutput = await buildPointsTable(racerScores, athletes);
    const tableLastSegmentOutput = await buildPointsTable(lastSegmentScores, athletes, lastSegmentName, true);
    //const tableLastSegmentOutput = "";
    pointsResultsDiv.innerHTML = tableFinalOutput;
    lastSegmentPointsResultsDiv.innerHTML = tableLastSegmentOutput;
    //showTeamMateRows({lastSegment: false});
    //showTeamMateRows({lastSegment: true});
    showTeamMateRows();
    
}

function isRowVisible(row, div) {
    const rect = row.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    return rect.bottom > divRect.top && rect.top < divRect.bottom;
}

function showTeamMateRows() {
    //console.log("lastSegment?", options.lastSegment)
    //const pointsDivName = options.lastSegment ? "lastSegmentPointsResults" : "pointsResults";
    //console.log("pointsDivName", pointsDivName)
    let pointsTable = document.getElementById("pointsTable");
    let importantScores = document.getElementById("importantScores")
    let pointsDiv = document.getElementById("pointsResults");
    
    if (pointsDiv.style.display == "none") {
        pointsTable = document.getElementById("pointsTableLast");
        importantScores = document.getElementById("lastSegmentImportantScores")
        pointsDiv = document.getElementById("lastSegmentPointsResults");
    }
    
    //const importantScoresDivName = options.lastSegment ? "lastSegmentImportantScores" : "importantScores";
    //const importantScores = document.getElementById(importantScoresDivName)
    let importantClasses = '';
    if (settings.stickyWatching) {
        importantClasses = 'tr.watching,'
    }
    if (settings.stickyMarked) {
        importantClasses += 'tr.marked,'
    }
    if (settings.stickyTeammate) {
        importantClasses += 'tr.teammate'
    }
    let teammateRows = [];
    if (importantClasses != "" && pointsTable) {
        importantClasses = importantClasses.replace(/,$/, '');
        teammateRows = Array.from(pointsTable.querySelectorAll(importantClasses));        
    }
    const hiddenTeammates = teammateRows.filter(row => !isRowVisible(row, pointsDiv));
    //console.log("hiddenTeamates", hiddenTeammates)
    let teamMateTableOutput;
    if (hiddenTeammates.length == 0) {
        importantScores.innerHTML = 0;
    } else {
        teamMateTableOutput = "<table id='stickyTable'>";        
        
        for (let teamMate of hiddenTeammates) {
            teamMateTableOutput += `<tr class=${teamMate.classList[0]}>`;
            for (let cell of teamMate.cells) {
                teamMateTableOutput += `<td style=display:${cell.style.display}>${cell.innerHTML}</td>`;
            }
            teamMateTableOutput += "</tr>";
        }
        teamMateTableOutput += "</table>";
    }
    importantScores.innerHTML = teamMateTableOutput || "";
}

function getPreviewData() {
    const pointsResultsDiv = document.getElementById("pointsResults")
    if (settings.preview) {
        const sampleData = zen.sampleNames;        
        sampleData.sort(() => Math.random() - 0.5);
        let racerScores = [];
        let rank = 1;
        for (let athlete of sampleData) {
            const falPointTotal = Math.floor(Math.random() * (20)) + 1;
            const ftsPointTotal = Math.floor(Math.random() * (20)) + 1;
            const finPoints = 21 - rank;
            const racer = {
                athleteId: rank,
                falPointTotal: falPointTotal,
                finPoints: finPoints,
                ftsPointTotal: ftsPointTotal,
                name: athlete.name,
                team: athlete.team,
                pointTotal: falPointTotal + ftsPointTotal + finPoints
            }  
            racerScores.push(racer);
            rank++;
        }  
        let tableOutput = `<table id='pointsTable'><thead><th>Rank</th><th>Name</th><th>FTS</th><th>FAL</th><th>FIN</th><th>Total</th></thead><tbody>`;
        rank = 1;       
               
        racerScores.sort((a, b) => {
            return b.pointTotal - a.pointTotal;
        });
        for (let racer of racerScores) {
            const teamBadge = common.teamBadge(racer.team);
            tableOutput += "<tr>"
            tableOutput += `<td>${rank}</td><td><span id="riderName">${racer.name}</span><div id="info-item-team">${teamBadge}</div></td><td>${racer.ftsPointTotal}</td><td>${racer.falPointTotal}</td><td>${racer.finPoints}</td><td>${racer.pointTotal}</td></tr>`
            rank++;
        }
        tableOutput += "</table>"
        pointsResultsDiv.innerHTML = tableOutput;
    } else {
        pointsResultsDiv.innerHTML = "";
    }

}

async function updateRacerStatus(states) {
    if (lastKnownSG.eventSubgroupId == 0) {
        return; // wait until watching rider is in an event
    };
    for (let state of states) {
        let racerStatus = allKnownRacersStatus.get(state.athleteId);
        if (!racerStatus && state.eventSubgroupId == lastKnownSG.eventSubgroupId) {
            racerStatus = {
                athleteId: state.athleteId,
                eventSubgroupId: state.eventSubgroupId,
                lastSeenTS: Date.now(),
                leftEvent: false,
                lateJoin: false,
                finishedEvent: false,
                noPlayerState: false
            };
            allKnownRacersStatus.set(state.athleteId, racerStatus);
        } else if (racerStatus) {
            racerStatus.lastSeenTS = Date.now();
        }

    }
}

async function getLeaderboard(watching) {
    if (watching.state.eventSubgroupId != 0 || lastKnownSG.eventSubgroupId > 0) {        
        let refreshRate = 20000;
        if (watching.segmentData?.routeSegments) {
            const segmentFinishLines = watching.segmentData.routeSegments.filter(segment => segment.name.includes("Finish") && !segment.finishArchOnly);
            if (segmentFinishLines.length > 0) {
                const proximityThreshold = 200;
                const currentPosition = watching.segmentData.currentPosition;
                let closestSegment = null;
                let minDistance = Infinity;
                for (const segment of segmentFinishLines) {
                    const distance = segment.markLine - currentPosition;
                    //console.log("distance", distance)
                    if (Math.abs(distance) < minDistance) {
                        minDistance = Math.abs(distance);
                    }
                }
                //console.log("minDistance", minDistance, "proximityThreshold", proximityThreshold)
                if (Math.abs(minDistance) < proximityThreshold) {
                    refreshRate = 5000;
                    if (Date.now() - lastRotationTS > rotateTableInterval) {
                        rotateVisibleTable({forceLast: true})
                    }
                    //console.log("Refreshing every 5s due to segment finish proximity");
                } else if (Date.now() - lastRotationTS > rotateTableInterval) {
                    rotateVisibleTable({forceLast: false})
                }
            }
        }
        
        if ((Date.now() - refresh) > refreshRate) {
            //console.log("not in an event")
            refresh = Date.now();
            settings = common.settingsStore.get();
            if (settings.lastKnownSG?.eventSubgroupId != lastKnownSG.eventSubgroupId) {
                //console.log("Saving last knownSG")
                common.settingsStore.set("lastKnownSG", lastKnownSG)
                settings = common.settingsStore.get();
                //console.log(settings)
            }
            if (watching.athlete.team) {
                watchingTeam = watching.athlete.team;
                //console.log("Watching team is",watchingTeam)
            } else {
                watchingTeam = "";
            }
            /*
            if (watching.state.eventSubgroupId == 0) {
                //console.log("We were in an event but no longer are...")
                if (raceResults.find(x => x.profileId == watching.athleteId)) {
                    //console.log("We are in the race results!")
                } else {
                    //console.log("Not in race results, left the event early?")
                }

            }
            */
            let eventSubgroupId;
            if (!watching.state.eventSubgroupId && lastKnownSG.eventSubgroupId > 0) {
                eventSubgroupId = lastKnownSG.eventSubgroupId;
            } else {
                eventSubgroupId = watching.state.eventSubgroupId;
            }
            currentEventConfig = await zen.getEventConfig(dbSegmentConfig, eventSubgroupId)
            await getKnownRacersV2(watching, currentEventConfig)
            await getAllSegmentResults(watching, currentEventConfig)
            await getRaceResults(watching, currentEventConfig)
            
            let dbResults = await zen.getSegmentResults(dbSegments, eventSubgroupId)
            //console.log("DB results:",dbResults)
            let eventResults = await processResults(watching, dbResults, currentEventConfig);
            //console.log("event segment results",eventResults)
            const lastSegmentWithResults = [eventResults.filter(x => x.fal.length > 0 || x.fts.length > 0).at(-1)] 
            console.log("lastSegmentWithResults", lastSegmentWithResults)
            const lastSegmentName = lastSegmentWithResults[0] ? `${lastSegmentWithResults[0].name} [${lastSegmentWithResults[0].repeat}]` : "";           
            //console.log("segmentsWithResults", segmentsWithResults)
            let racerScores = await scoreResults(eventResults, currentEventConfig, false);
            racerScores.sort((a, b) => {
                return b.pointTotal - a.pointTotal;
            });
            let lastSegmentScores = await scoreResults(lastSegmentWithResults, currentEventConfig, true);
            console.log("lastSegmentScores", lastSegmentScores)
            lastSegmentScores.forEach(score => {
                score.finPoints = 0; // don't include FIN points for the last segment display
                score.pointTotal = score.ftsPointTotal + score.falPointTotal;
            })
            lastSegmentScores.sort((a, b) => {
                return b.pointTotal - a.pointTotal;
            });
            //console.log("lastSegmentScores", lastSegmentScores)
            await displayResults(racerScores, lastSegmentScores, lastSegmentName)
            if (raceResults.length > 0) {
                console.log("Race results", raceResults)
            } 
            if (watching.state.eventSubgroupId > 0) {
                lastKnownSG.eventSubgroupId = watching.state.eventSubgroupId
            }
            if (currentEventConfig.allCats) {
                //console.log("Monitoring all cats")
                await monitorAllCats(eventSubgroupId, currentEventConfig)
            }
            //debugger
        }
        if (Date.now() - lastVerification > 30000 && !busyVerifying && allKnownRacers.length > 0) {
            //console.log("Verifying racers")
            verifyRacers();
        }
    } else {
        
    }
};
function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}
function changelineSpacing() {
    const doc = document.documentElement;
    doc.style.setProperty('--line-spacing', common.settingsStore.get('lineSpacing') || 1.2);  
}
function changeBadgeScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--badge-scale', common.settingsStore.get('badgeScale') || 0.7);  
}

export async function main() {
    common.initInteractionListeners();  
    common.subscribe('athlete/watching', getLeaderboard);    
    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        if (raceResults.length > 0) {
            raceResults = [];
        }
    });
    common.subscribe('states', updateRacerStatus);

    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        //console.log(changed)
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        } 
        if (changed.has('fontScale')) {
            changeFontScale();
        }
        if (changed.has('badgeScale')) {
            changeBadgeScale();
        }
        if (changed.has('preview')) {
            getPreviewData();
        }
        if (changed.has('lineSpacing')) {
            changelineSpacing();
        }
        if (changed.has('rotateInterval')) {
            rotateTableInterval =  changed.get('rotateInterval') * 1000;
        }
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has('configOverride')) {
            const newConfig = JSON.parse(common.settingsStore.get('configOverride'));
            console.log("Event override changed ", newConfig)
        }
        settings = common.settingsStore.get();
    });
    changeBadgeScale();
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
