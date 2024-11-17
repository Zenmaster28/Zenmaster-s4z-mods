import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
let allKnownRacers = [];
let segmentResults = [];
let raceResults = [];
let lastKnownSG = {
    eventSubgroupId: 0,
    eventSubgroupStart: 0
};
let lastKnownSegmentData;
let refresh = Date.now() - 30000;
const doc = document.documentElement;
doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  

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
    FTSorFAL: "fts"
});
/*
common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});
*/
let settings = common.settingsStore.get();
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

async function getKnownRacers(watching) {    
    // todo - deal with sg = 0 after race is over
    let eventSubgroupId;
    let segmentData;
    if (watching.state.eventSubgroupId == 0 && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        segmentData = watching.segmentData;
    }
    const eventJoined = await common.rpc.getEventSubgroupEntrants(eventSubgroupId, {joined: true})
    const uniqueSegmentIds = getUniqueValues(segmentData.routeSegments, "id")
    for (let segId of uniqueSegmentIds) {
        const resultsLive = await common.rpc.getSegmentResults(segId, {live: true});    
        var eventRes = resultsLive.filter(x => x.eventSubgroupId == eventSubgroupId);           
        if (eventRes.length > 0)  
        {
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
   console.log("Known racer count: " + allKnownRacers.length, allKnownRacers)
   //debugger
}

async function getAllSegmentResults(watching) {
    // todo - save last known route segments before sg -> 0
    let eventSubgroupId;
    let segmentData;
    if (watching.state.eventSubgroupId == 0 && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        segmentData = watching.segmentData;
    }
    let eventRacers = allKnownRacers.filter(x => x.eventSubgroupId === eventSubgroupId).map(x => x.athleteId); // make sure we only get racers from this eventsubgroup
    //debugger
    let sg = await common.rpc.getEventSubgroup(eventSubgroupId)    
    let eventStartTime;
    if (sg) { 
        eventStartTime = sg.eventSubgroupStart;
        lastKnownSG.eventSubgroupStart = eventStartTime
        if (watching.state.eventSubgroupId) {
            lastKnownSegmentData = watching.segmentData;
            console.log("Setting last known segment data", lastKnownSegmentData)
        }
    } else {
        eventStartTime = lastKnownSG.eventSubgroupStart
    }
    const uniqueSegmentIds = getUniqueValues(segmentData.routeSegments, "id")
    for (let segId of uniqueSegmentIds) {
        const resultsFull = await common.rpc.getSegmentResults(segId);    
        var eventRes = resultsFull.filter(x => x.ts > eventStartTime);           
        if (eventRes.length > 0)  // don't bother getting the full leaderboard if no live results for the event yet
        {
            //const results = await common.rpc.getSegmentResults(firstSegment.id);
            //const filteredEventRes = eventRes.filter(event => allKnownRacers.includes(event.athleteId));
            const filteredEventRes = eventRes.filter(event => eventRacers.includes(event.athleteId)); 
            //console.log(filteredEventRes)
            filteredEventRes.forEach(result => {                
                const exists = segmentResults.some(r => r.id === result.id);
                if (!exists) {
                    result.eventSubgroupId = eventSubgroupId;
                    result.segmentId = segId;
                    //console.log("Adding new result for ", result)
                    segmentResults.push(result)
                }
            })
            //debugger     
        }
    }
    //console.log(segmentResults)
}

async function getRaceResults(watching) {
    // todo - deal with sg = 0 after race is over
    let eventSubgroupId;
    if (watching.state.eventSubgroupId == 0 && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
    }
    let res = await common.rpc.getEventSubgroupResults(eventSubgroupId);
    res.forEach(result => {
        const exists = raceResults.some(r => r.profileId === result.profileId);
        if (!exists) {
            console.log("Adding final race result for ", result)
            raceResults.push(result)
        }
    })
}

function processResults(watching) {
    let eventResults = [];
    //let eventSubgroupId = watching.state.eventSubgroupId;
    let eventSubgroupId;
    let segmentData;
    if (watching.state.eventSubgroupId == 0 && lastKnownSG.eventSubgroupId > 0) {
        eventSubgroupId = lastKnownSG.eventSubgroupId;
        segmentData = lastKnownSegmentData;
        console.log("Using last known segment data")
    } else {
        eventSubgroupId = watching.state.eventSubgroupId;
        segmentData = watching.segmentData;
        console.log("Using watching segment data")
    }
    console.log("Segment data is", segmentData)
    let eventRacers = allKnownRacers.filter(x => x.eventSubgroupId === eventSubgroupId).map(x => x.athleteId); // make sure we only get racers from this eventsubgroup
    segmentData = segmentData.routeSegments.filter(x => x.type != "custom" && !x.name.includes("Finish"));
    for (let segment of segmentData) {
        let segRes = segmentResults.filter(x => x.segmentId == segment.id).sort((a, b) => {return a.worldTime - b.worldTime})
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
        let repeatData = {
            name: segment.name,
            segmentId: segment.id,            
            repeat: segment.repeat,
            fts: ftsRes,
            fal: falRes
        }
        eventResults.push(repeatData)
        
    }    
    return eventResults;    
}

function scoreResults(eventResults) {
    let racerScores = [];
    //let scoreFormat = "fts";
    let scoreFormat = settings.FTSorFAL;
    //debugger
    for (let segRes of eventResults) {
        
        //let points = 10;        
        let scorePoints = getScoreFormat();        
        let pointsCounter = scorePoints.length
        //debugger
        //console.log("Scoring ", pointsCounter, "racers as", scorePoints)
        for (let i = 0; i < pointsCounter; i++) {
            if (racerScores.length > 0) {
                //debugger
            }
            if (segRes[scoreFormat].length > 0 && segRes[scoreFormat][i]) {
            let prevScore = racerScores.find(x => x.athleteId == segRes[scoreFormat][i].athleteId)

            if (!prevScore) {
                //debugger
                let score = {
                    athleteId: segRes[scoreFormat][i].athleteId,
                    name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                    pointTotal: scorePoints[i]
                }
                racerScores.push(score)
            } else {
                prevScore.pointTotal += scorePoints[i]
            }
            //points--;
        }
        }
    }
    return racerScores;
}

function displayResults(racerScores) {

    let scoreFormat = settings.FTSorFAL;
    const pointsResultsDiv = document.getElementById("pointsResults")
    pointsResultsDiv.innerHTML = "";
    let tableOutput = "<table><thead><th>Rank</th><th>Name</th><th>Points (" + scoreFormat + ")</th></thead><tbody>";
    let rank = 1;
    for (let racer of racerScores) {
        tableOutput += `<tr><td>${rank}</td><td>${racer.name}</td><td>${racer.pointTotal}</td></tr>`
        rank++;
    }
    tableOutput += "</table>"
    pointsResultsDiv.innerHTML = tableOutput;
}

async function getLeaderboard(watching) {
    if (watching.state.eventSubgroupId != 0 || lastKnownSG.eventSubgroupId > 0) {
        if ((Date.now() - refresh) > 20000) {
            //console.log("not in an event")
            refresh = Date.now();
            if (watching.state.eventSubgroupId == 0) {
                console.log("We were in an event but no longer are...")
                if (raceResults.find(x => x.profileId == watching.athleteId)) {
                    console.log("We are in the race results!")
                } else {
                    console.log("Not in race results, left the event early?")
                }

            }
            await getKnownRacers(watching)
            await getAllSegmentResults(watching)
            await getRaceResults(watching)
            let eventResults = processResults(watching);
            console.log(eventResults)
            let racerScores = scoreResults(eventResults);
            console.log(racerScores.sort((a, b) => {
                return b.pointTotal - a.pointTotal;
            }))
            displayResults(racerScores)
            if (raceResults.length > 0) {
                console.log("Race results", raceResults)
            }   
            if (watching.state.eventSubgroupId > 0) {
                lastKnownSG.eventSubgroupId = watching.state.eventSubgroupId
            }
            //debugger
        }
    } else {
        
    }
};
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
    return [10,9,8,7,6,5,4,3,2,1];
}
function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}

export async function main() {
    common.initInteractionListeners();  
    common.subscribe('athlete/watching', getLeaderboard);    
    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        } 
        if (changed.has('fontScale')) {
            changeFontScale();
        }
        settings = common.settingsStore.get();
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
