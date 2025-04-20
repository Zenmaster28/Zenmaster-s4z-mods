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
doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
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

async function processResults(eventSubgroupId, dbResults, sgConfig) {
    let eventResults = [];
    
    let segmentData = sgConfig.segments;   
    let eventRacers = (await zen.getKnownRacers(dbSegments, eventSubgroupId)).map(x => x.athleteId)
    eventRacers = [...new Set(eventRacers)]
    //segmentData = segmentData.routeSegments.filter(x => x.type != "custom" && !x.name.includes("Finish"));
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


async function scoreResults(eventResults, currentEventConfig) {
    if (!currentEventConfig) {
        return [];
    }
    let racerScores = [];
    let perEventResults = [];
    let uniqueSegmentIds;
    const femaleOnly = document.getElementById("femaleOnly").checked
    //let scoreFormat = "fts";
    //let scoreFormat = settings.FTSorFAL;
    let scoreFormats = ["FTS"];
    let segmentRepeat;
    console.log("Event config", currentEventConfig)
    //debugger
    let segmentScores = [];
    if (currentEventConfig.ftsPerEvent) {
        uniqueSegmentIds = getUniqueValues(currentEventConfig.segments, "segmentId")
        for (let segment of uniqueSegmentIds) {
            //console.log(segment, eventResults)
            const thisSegmentResults = eventResults.filter(x => x.segmentId == segment)
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
    for (let segRes of eventResults) {
        //console.log(segRes)
        //let points = 10;  
        //debugger 
        let segResPerEvent = currentEventConfig.ftsPerEvent ? perEventResults.find(x => x.segmentId == segRes.segmentId) : [];
        let segmentPointBreakdown = {
            name: segRes.name,
            repeat: segRes.repeat,
            segmentId: segRes.segmentId,
            fts: [],
            fal: []
        }
        if (currentEventConfig) {
            segmentRepeat = currentEventConfig.segments.find(x => x.segmentId == segRes.segmentId && x.repeat == segRes.repeat)
            //debugger
            if (!segmentRepeat.enabled) {
                console.log("NOT scoring", segmentRepeat.name, "repeat", segmentRepeat.repeat)
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
                    if (femaleOnly) {
                        segRes.fts = segRes.fts.filter(x => x.gender == "female")
                    }
                    scores = currentEventConfig.ftsScoreFormat;
                    scoreStep = currentEventConfig.ftsStep;
                    const ftsBonus = currentEventConfig.ftsBonus;
                    if (ftsBonus !== "") {
                        bonusScores = zen.getScoreFormat(ftsBonus, 1)
                    }
                } else if (scoreFormat == "fal") {
                    if (femaleOnly) {
                        segRes.fal = segRes.fal.filter(x => x.gender == "female")
                    }
                    scores = currentEventConfig.falScoreFormat;
                    scoreStep = currentEventConfig.falStep;
                    const falBonus = currentEventConfig.falBonus;
                    if (falBonus !== "") {
                        bonusScores = zen.getScoreFormat(falBonus, 1)
                    }
                }
                let scorePoints = zen.getScoreFormat(scores, scoreStep);        
                let pointsCounter = scorePoints.length
                
                
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
                                    segmentPointBreakdown.fts.push({
                                        athleteId: segRes[scoreFormat][i].athleteId,
                                        name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                        points: scoreToAdd
                                    })
                                    //console.log("ftsScoringResults", ftsScoringResults);
                                }
                                //points--;
                            }
                        } else  {
                            //TODO - check if scores from this segment match the scoring fts results
                            //debugger
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
                                } else {
                                    scoreToAdd = scorePoints[i]
                                    if (i < bonusScores.length) {
                                        //console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                        scoreToAdd += bonusScores[i];
                                    }
                                }
                                if (scoreFormat == "fts") {
                                    let ftsScore = segResPerEvent.fts[i];
                                    if (ftsScore) {
                                        ftsScore.ftsPoints = scoreToAdd;
                                        ftsScoringResults.push(ftsScore);
                                    }
                                    segmentPointBreakdown.fts.push({
                                        athleteId: segRes[scoreFormat][i]?.athleteId,
                                        name: segRes[scoreFormat][i]?.firstName + " " + segRes[scoreFormat][i]?.lastName,
                                        points: scoreToAdd
                                    })
                                    //console.log("ftsScoringResults", ftsScoringResults);
                                }
                                //points--;
                            }
                        }
                    } else {                
                        if (segRes[scoreFormat].length > 0 && segRes[scoreFormat][i]) {
                            let prevScore = racerScores.find(x => x.athleteId == segRes[scoreFormat][i].athleteId)

                            if (!prevScore) {
                                //debugger
                                let scoreToAdd = scorePoints[i]
                                if (i < bonusScores.length) {
                                    console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
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
                                if (scoreFormat == "fts") {
                                    segmentPointBreakdown.fts.push({
                                        athleteId: segRes[scoreFormat][i].athleteId,
                                        name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                        points: scoreToAdd
                                    })
                                } else {
                                    segmentPointBreakdown.fal.push({
                                        athleteId: segRes[scoreFormat][i].athleteId,
                                        name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                        points: scoreToAdd
                                    })
                                }
                            } else {
                                let scoreToAdd = scorePoints[i]
                                if (i < bonusScores.length) {
                                    console.log("Adding", bonusScores[i], "bonus", scoreFormat, "points to",segRes[scoreFormat][i].firstName, " ", segRes[scoreFormat][i].lastName )
                                    scoreToAdd += bonusScores[i];
                                }
                                if (scoreFormat == "fts") {
                                    prevScore.ftsPointTotal += scoreToAdd;
                                    prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                } else {
                                    prevScore.falPointTotal += scoreToAdd;
                                    prevScore.pointTotal = prevScore.ftsPointTotal + prevScore.falPointTotal;
                                }
                                if (scoreFormat == "fts") {
                                    segmentPointBreakdown.fts.push({
                                        athleteId: segRes[scoreFormat][i].athleteId,
                                        name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                        points: scoreToAdd
                                    })
                                } else {
                                    segmentPointBreakdown.fal.push({
                                        athleteId: segRes[scoreFormat][i].athleteId,
                                        name: segRes[scoreFormat][i].firstName + " " + segRes[scoreFormat][i].lastName,
                                        points: scoreToAdd
                                    })
                                }
                            }
                        }
                        //points--;
                    }
                }
            }
        }
        segmentScores.push(segmentPointBreakdown)
    }
    const finScores = currentEventConfig.finScoreFormat;
    const finScoreStep = currentEventConfig.finStep;
    let scorePoints =[];
    let bonusScores = [];
    if (finScores) {
        const finBonus = currentEventConfig.finBonus;
        if (finBonus !== "") {
            bonusScores = zen.getScoreFormat(finBonus, 1);
            console.log("FIN bonus points",bonusScores)
        }
        scorePoints = zen.getScoreFormat(finScores, finScoreStep); 
        console.log("FIN score points",scorePoints)
    }
    let res = await common.rpc.getEventSubgroupResults(currentEventConfig.eventSubgroupId);
    raceResults = [...res];
    /*
    res.forEach(result => {
        const exists = raceResults.some(r => r.profileId === result.profileId);
        if (!exists) {
            //console.log("Adding final race result for ", result)
            raceResults.push(result)
        }
    });
    */
    if (raceResults.length > 0) {
        console.log("raceResults",raceResults)
        const femaleOnly = document.getElementById("femaleOnly").checked;
        if (femaleOnly) {
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
                    console.log("Adding", bonusScores[racerResult.rank - 1], "bonus FIN points to",racer.name )
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
    console.log("Racer scores",racerScores)  
    return [racerScores, segmentScores];
}

function evaluateVisibility(scoreType, currentEventConfig) {
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
    if (scoreType == "FIN" && (currentEventConfig.finScoreFormat == "" || raceResults.length == 0)) {
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

async function displayResults(racerScores, segmentScores, sgConfig, eventResults) {
    //console.log("Scores to process:", racerScores)
    //let scoreFormat = settings.FTSorFAL;
    const pointsResultsDiv = document.getElementById("pointsResults")
    const selectedView = document.querySelector('input[name="radioView"]:checked');
    //debugger
    if (selectedView.value == "racer") {
        //pointsResultsDiv.innerHTML = "";
        let tableOutput = `<table id='pointsTable'><thead><th>Rank</th><th>Name</th><th ${evaluateVisibility('FAL',sgConfig)}>FAL</th><th ${evaluateVisibility('FTS',sgConfig)}>FTS</th><th ${evaluateVisibility('FIN',sgConfig)}>FIN</th><th>Total</th></thead><tbody>`;
        let rank = 1;
        let maxRacers = settings.maxRacersToDisplay;
        if (maxRacers == 0 || maxRacers == null) {
            maxRacers = Infinity;
        }
        //console.log("Max racers to display:", maxRacers)
        for (let racer of racerScores) {
            if (rank > maxRacers) {
                break;
            };
            if (racer.pointTotal == 0) {
                break;
            }
            let teamBadge = "";
            
            const athlete = await common.rpc.getAthleteData(racer.athleteId)
            if (settings.showTeamBadges && athlete?.o101?.teamBadge) {
                teamBadge = athlete.o101.teamBadge;
            } else if (settings.showTeamBadges && athlete?.athlete.team) {
                teamBadge = common.teamBadge(athlete.athlete.team)
            }
            const sanitizedName = racer.name.replace(/\s*[\(\[].*?[\)\]]\s*/g, '').trim();
            //tableOutput += isWatching ? "<tr class=watching>" : isMarked ? "<tr class=marked>" : isTeamMate ? "<tr class=teammate>" : "<tr>"
            tableOutput += "<tr class='shown'>"
            tableOutput += `<td>${rank}</td><td><span id="riderName">${sanitizedName}</span><div id="info-item-team">${teamBadge}</div></td><td ${evaluateVisibility('FAL',sgConfig)}>${racer.falPointTotal}</td><td ${evaluateVisibility('FTS',sgConfig)}>${racer.ftsPointTotal}</td><td ${evaluateVisibility('FIN',sgConfig)}>${racer.finPoints}</td><td>${racer.pointTotal}</td></tr>`
            tableOutput += `<tr class='hidden'><td><td colspan='5'><table class="table-racers">`;
            for (let segScore of segmentScores) {
                //debugger
                const falScore = segScore.fal.find(x => x.athleteId == racer.athleteId);
                const ftsScore = segScore.fts.find(x => x.athleteId == racer.athleteId);
                tableOutput += `<tr><td>${segScore.name} [${segScore.repeat}]</td><td>FAL: ${falScore?.points || 0}</td><td>FTS: ${ftsScore?.points || 0}</td></tr>`
            }
            tableOutput += `</td></tr></table>`
            rank++;
        }
        tableOutput += "</table>"  
        pointsResultsDiv.innerHTML = tableOutput;        
    } else {
        //debugger
        let tableOutput = `<table id='pointsTable'><tr class="shown">`
        for (let segment of segmentScores) {
            tableOutput += `<td></td><td>${segment.name} [${segment.repeat}]</td></tr>`
            //debugger
            tableOutput += `<tr class="hidden"><td></td><td><table class="table-segments"><tr><th colspan='3'>FTS</th><th colspan='3'>FAL</th>`
            const maxRows = Math.max(segment.fal.length, segment.fts.length);
            const thisSegment = eventResults.find(x => x.segmentId == segment.segmentId && x.repeat == segment.repeat)
            
            for (let i = 0; i < maxRows; i++) {
                //TODO - include segment times
                const thisRacerFTS = thisSegment.fts.find(x => x.athleteId == segment.fts[i]?.athleteId) || []
                const thisRacerFAL = thisSegment.fal.find(x => x.athleteId == segment.fal[i]?.athleteId) || []                  
                const ftsName = segment.fts[i]?.name || "n/a";
                const ftsTime = thisRacerFTS.elapsed ? formatTime(thisRacerFTS.elapsed, 3) : "n/a";
                const ftsPoints = segment.fts[i]?.points || "n/a";
                const falName = segment.fal[i]?.name || "n/a";
                //const falDiff = (thisRacerFAL.falDiff / 1000).toFixed(3) || "n/a";
                const falDiff = (thisRacerFAL.falDiff / 1000) || "n/a";
                const falPoints = segment.fal[i]?.points || "n/a";
                tableOutput += `<tr><td>${ftsName}</td><td>${ftsTime}</td><td>${ftsPoints}</td><td>${falName}</td><td>${i == 0 ? "" : isNaN(falDiff) ? "" : "+"}${isNaN(falDiff) ? "n/a" : formatTime(falDiff,3)}</td><td>${falPoints}</td></tr>`
            }
            tableOutput += `</table></td></tr>`
        }
        tableOutput += "</table>"
        pointsResultsDiv.innerHTML = tableOutput;
    }
    const pointsTable = document.getElementById("pointsTable")
    pointsTable.addEventListener("click", function(event) {
        const clickedRow = event.target.closest("tr");
        if (!clickedRow) return; // Do nothing if not a row        
        const nextRow = clickedRow.nextElementSibling;
        if (nextRow && nextRow.classList.contains("hidden")) {
            // Toggle hidden/shown
            nextRow.classList.toggle("hidden");
            nextRow.classList.toggle("shown");
        } else if (nextRow && nextRow.classList.contains("shown")) {
            nextRow.classList.toggle("shown");
            nextRow.classList.toggle("hidden");
        }
    });
}

function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}
function changeBadgeScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--badge-scale', common.settingsStore.get('badgeScale') || 0.7);  
}

async function showResults(allEventConfigs) {
    const pointsViewDiv = document.getElementById("pointsView");
    pointsViewDiv.style.visibility = "visible"
    const penSelect = document.getElementById("selectPen");
    const eventSubgroupId = parseInt(penSelect.value);
    let dbResults = await zen.getSegmentResults(dbSegments, eventSubgroupId)
    console.log("dbResults", dbResults)
    const sgConfig = allEventConfigs.find(x => x.eventSubgroupId == eventSubgroupId)
    //debugger
    let eventResults = await processResults(eventSubgroupId, dbResults, sgConfig)
    console.log("eventResults", eventResults)
    let [racerScores, segmentScores] = await scoreResults(eventResults, sgConfig)
    racerScores.sort((a,b) => {
        return b.pointTotal - a.pointTotal;
    })
    await displayResults(racerScores, segmentScores, sgConfig, eventResults)
    //debugger
}

export async function main() {
    common.initInteractionListeners();  
    const eventsListDiv = document.getElementById("eventsList");
    const penListDiv = document.getElementById("penList");
    const pointsViewDiv = document.getElementById("pointsView");  
    const pointsResultsDiv = document.getElementById("pointsResults")
    const pointsViewRefresh = document.getElementById("refreshButton") 
    const allEventConfigs = await zen.getEventConfig(dbSegmentConfig)
    console.log("allEventConfigs", allEventConfigs)
    pointsViewDiv.addEventListener("change", function() {
        showResults(allEventConfigs)
    });
    pointsViewRefresh.addEventListener("click", function() {
        showResults(allEventConfigs)
    })
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
        pointsResultsDiv.innerHTML = "";
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
            showResults(allEventConfigs)
        })
    })
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
