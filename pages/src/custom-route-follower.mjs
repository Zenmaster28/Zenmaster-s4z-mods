import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
const doc = document.documentElement;
let customRouteIntersections = [];
let customRouteManifest = [];
let exitIntersections = [];
let settings = common.settingsStore.get();
const turnComands = {
    "Right": "turnRight",
    "Left": "turnLeft",
    "Straight": "goStraight"
}
let gcRefresh = Date.now() - 100000
let courseId;
let allIntersections;
let intersectionsById;
let inIntersection = false;
let courseRoads = [];
let courseRoadsById;
let lastKnownIntersection;
let foundRouteIntersection = false;
let customRouteData;
let spawnDistance = 0;
let badManifestCounter = 0;
const currIntersectionDiv = document.getElementById("currentIntersection");
const intersectionsDiv = document.getElementById("intersectionsDiv");
const nextRoadIntersectionDiv = document.getElementById("nextRoadIntersection");
//debugger

function updateConnStatus(s) {
    if (!s) {
        s = {connected: false, state: 'disabled'};
    }    
    const gcStatus = document.getElementById("gcStatus")
    //gcStatus.textContent = s.state;
    const gcState = s.state == "connected" ? "&#x2705;" : s.state == "waiting" ? "waiting" : "&#x274C;"
    gcStatus.innerHTML = `Game connection: ${gcState}`
    //debugger
}

function buildIntersectionsTable() {
    if (customRouteIntersections.length == 0) {
        return;
    }
    //customRouteIntersections[0].found = true;
    //customRouteIntersections[1].found = true;
    const foundIntersections = customRouteIntersections.filter(x => x.found)
    console.log("Building table from", customRouteIntersections, " and", foundIntersections)
    let intTable = `<table id="intersectionsTable"><tr><th></th><th></th></tr>`
    let i = 1;
    for (let int of customRouteIntersections) {
        const turnDir = int.option.alt == 263 ? "&#x2190;" : int.option.alt == 262 ? "&#x2192;" : "&#x2191;"
        const display = int.option.turnText == '' ? 'none' : 'table-row';
        const textDisplay = i <= foundIntersections.length ? "class='passedIntersection'" : ""
        intTable += `<tr ${textDisplay} style=display:${display}><td>${turnDir}</td><td >${int.option.turnText}<div class='nextDistance'></div></td></tr>`
        i++;
    }
    intTable += `</table>`
    intersectionsDiv.innerHTML = intTable;
}

function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}

export async function main() {
    common.initInteractionListeners(); 
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1); 
    updateConnStatus(await common.rpc.getGameConnectionStatus());
    const selfData = await common.rpc.getAthleteData('self'); 
    if (selfData && selfData.zenCustomRoute?.ts != customRouteManifest.ts) {
        console.log("Updating custom route intersections from watching data", selfData.zenCustomRoute);
        //customRouteIntersections = selfData.zenCustomRoute.intersections;
        //debugger
        customRouteIntersections = await zen.getManifestIntersections(selfData.zenCustomRoute.manifest, selfData.zenCustomRoute.courseId)
        customRouteIntersections = customRouteIntersections.filter(x => x.roadExit);
        console.log("new customRouteIntersections", customRouteIntersections)
        exitIntersections = [];        
        //buildIntersectionsTable();
    }
    //common.subscribe('status', updateConnStatus, {source: 'gameConnection', persistent: true});
    common.subscribe('athlete/watching', processWatching);
    common.settingsStore.addEventListener('changed', ev => {
            const changed = ev.data.changed; 
            settings = common.settingsStore.get()
            if (changed.has('fontScale')) {
                changeFontScale();
            }
    })
}

async function getAllIntersections(courseId) {
    const worldId = common.courseToWorldIds[courseId]
    const allIntersections = await fetch(`data/worlds/${worldId}/roadIntersections.json`).then(response => response.json());
    return allIntersections;
}

async function getAllRoads(courseId) {
    return await common.getRoads(courseId);
}

function getDistanceToIntersection(watching, nextIntersection, rp, toEnd) {
    if (!nextIntersection) {
        return;
    }
    const thisRoad = courseRoadsById[watching.state.roadId];
    const reverse = watching.state.reverse;
    let target;
    if (toEnd) {
        target = reverse ? nextIntersection.m_roadTime1 : nextIntersection.m_roadTime2;
    } else {
        target = reverse ? nextIntersection.m_roadTime2 : nextIntersection.m_roadTime1;
    }
    const min = rp < target ? rp : target;
    const max = rp > target ? rp : target;
    let nextIntDistance;
    if (thisRoad.looped) {
        let crossLine = false;
        if (reverse) {
            let tempDist = 0;
            if (target > rp) {
                crossLine = true;
                tempDist = thisRoad.curvePath.distanceBetweenRoadPercents(0, rp, 4e-2) / 100;
                tempDist += thisRoad.curvePath.distanceBetweenRoadPercents(target, 1, 4e-2) / 100;
            }
            nextIntDistance = tempDist;
        } else {
            let tempDist = 0;
            if (target < rp) { //looped road and we have to cross 0/1 going forward
                crossLine = true
                tempDist = thisRoad.curvePath.distanceBetweenRoadPercents(rp, 1, 4e-2) / 100;
                tempDist += thisRoad.curvePath.distanceBetweenRoadPercents(0, target, 4e-2) / 100;
            }
            nextIntDistance = tempDist;
        }
        if (!crossLine) {
            nextIntDistance = thisRoad.curvePath.distanceBetweenRoadPercents(min, max, 4e-2) / 100;
        }
    } else {
        nextIntDistance = thisRoad.curvePath.distanceBetweenRoadPercents(min, max, 4e-2) / 100;
    }
    return parseInt(nextIntDistance);
}
function getNextRoadIntersection(rp, roadIntersections, reverse) {
    if (reverse) {
        roadIntersections.sort((a,b) => b.m_roadTime2 - a.m_roadTime2);
    } else {
        roadIntersections.sort((a,b) => a.m_roadTime1 - b.m_roadTime1);
    }
    //const behind = reverse ? roadIntersections.filter(x => x.m_roadTime1 > rp) : roadIntersections.filter(x => x.m_roadTime2 < rp);
    const ahead = reverse ? roadIntersections.filter(x => x.reverse.length > 0 && x.m_roadTime1 <= rp) : roadIntersections.filter(x => x.forward.length > 0 && x.m_roadTime2 >= rp);
    if (ahead.length > 0) {
        return ahead[0];
    } else if (courseRoadsById[roadIntersections[0].m_roadId].looped) {
        return roadIntersections[0]; //we are on a looped road and after the last intersection before the 0/1 line, return the first intersection after that line
    } else {
        return null;
    }
}
async function processWatching(watching) {
    if (Date.now() - gcRefresh > 10000) {
        updateConnStatus(await common.rpc.getGameConnectionStatus());
        gcRefresh = Date.now();
    }    
    if (!allIntersections) {
        allIntersections = await getAllIntersections(watching.state.courseId);
        intersectionsById = Object.fromEntries(allIntersections.map(x => [x.id, x]));
    }
    if (courseRoads.length == 0) {
        courseRoads = await getAllRoads(watching.state.courseId);
        courseRoadsById = Object.fromEntries(courseRoads.map(x => [x.id, x]));
    }
    if (watching.zenCustomRoute?.ts != customRouteManifest.ts) {
        console.log("Updating custom route intersections from watching data", watching.zenCustomRoute);
        let allCustomRouteIntersections = await zen.getManifestIntersections(watching.zenCustomRoute.manifest, watching.zenCustomRoute.courseId);
        let exitCustomRouteIntersections = allCustomRouteIntersections.filter(x => x.roadExit);
        console.log("new customRouteIntersections", exitCustomRouteIntersections)
        customRouteManifest = watching.zenCustomRoute;
        customRouteData = await zen.buildRouteData(watching.zenCustomRoute, watching.state.courseId);
        customRouteData.manifestIntersections = [];
        let i = -1;
        for (let m of customRouteData.manifest) {
            let foundInt = false;
            i++;
            for (let int of exitCustomRouteIntersections) {
                if (int.assigned) {
                    continue;
                }
                if (int.option.exitTime == (m.reverse ? m.start : m.end)) {
                    int.assigned = true;
                    int.idx = i;
                    customRouteData.manifestIntersections.push(int);
                    foundInt = true;
                    //debugger
                    break;                    
                }
            }
            if (!foundInt) {
                customRouteData.manifestIntersections.push(null)
            }
        }
        customRouteIntersections = customRouteData.manifestIntersections.filter(x => x != null)
        
        //buildIntersectionsTable();
        console.log("customRouteIntersections", customRouteIntersections)
        console.log("customrouteData", customRouteData)
        spawnDistance = null;
    }
    if (!spawnDistance) {
        //don't calc this if not at the start of the route
        if (watching.state.eventDistance < 100 && watching.state.roadId == customRouteData.manifest[0].roadId) {
            const rp = (watching.state.roadTime - 5000) / 1e6;
            const manifestStart = watching.state.reverse ? customRouteData.manifest[0].end : customRouteData.manifest[0].start;
            const low = Math.min(rp, manifestStart);
            const high = Math.max(rp, manifestStart);
            const thisRoad = await common.getRoad(watching.state.courseId, watching.state.roadId);
            spawnDistance = thisRoad.curvePath.distanceBetweenRoadPercents(low, high, 4e-2) / 100;
            //debugger
            console.log("rp", rp, "manifestStart", manifestStart, "spawnDistance", spawnDistance)
        } else {
            spawnDistance = 0.1; // just so this doesn't constantly get triggered
        }
    }
    //const currentPosition = findRoutePosition(watching.state);
    const variance = 200; //since the spawnpoint may not be exactly where we calculated the route
    const manifestIdx = customRouteData.manifestDistances.find(x => (x.start - variance) <= (watching.state.eventDistance + spawnDistance) && 
            (x.end + variance) >= (watching.state.eventDistance + spawnDistance) && x.roadId == watching.state.roadId)
    if (!manifestIdx) {
        //debugger
        nextRoadIntersectionDiv.innerHTML = "";
        badManifestCounter++;
        currIntersectionDiv.innerHTML = `!unknown manifest! ${badManifestCounter}`; 
        //debugger       
        return;
    }
    currIntersectionDiv.innerHTML = "";
    //const currentManifestInt = customRouteData.manifestIntersections[manifestIdx.i]
    const prevIntersections = customRouteIntersections.filter(x => x.idx < manifestIdx.i)
    const nextIntersections = customRouteIntersections.filter(x => x.idx >= manifestIdx.i)
    let rebuildTable = false;
    for (let p of prevIntersections) {
        if (!p.found) {
            p.found = true;
            rebuildTable = true;
        }        
    }
    for (let p of nextIntersections) {
        if (p.found) {
            p.found = false;
            rebuildTable = true;
        }
    }
    if (rebuildTable) {
        //buildIntersectionsTable();
    }
    //console.log("currentPosition", currentPosition)
    const rp = (watching.state.roadTime - 5000) / 1e6;
    let currentIntersection;
    let validIntersection = false;
    //const roadIntersections = allIntersections.find(int => int.id == watching.state.roadId)
    const roadIntersections = intersectionsById[watching.state.roadId];
    if (!roadIntersections) {
        inIntersection = false;
        //return;
    }
    for (let int of roadIntersections.intersections) {
        //m_roadTime1 is almost always less than m_roadTime2 but not always
        const t1 = int.m_roadTime1;
        const t2 = int.m_roadTime2;
        const low = t1 < t2 ? t1 : t2;
        const high = t1 > t2 ? t1 : t2;

        if (rp >= low && rp <= high) {
            currentIntersection = int;
            break;
        }
    }
    if (!currentIntersection) {
        //not in an intersection
        inIntersection = false;
        validIntersection = false;
        //return;
    } else {
        validIntersection = watching.state.reverse ? currentIntersection.reverse.length > 0 : currentIntersection.forward.length > 0;
    }
    
    
    //debugger
    if (validIntersection) {
        //console.log("currentIntersection",currentIntersection)
        //debugger
        let options;
        let optionsText;
        //let showIntersection = true;
        let direction = watching.state.turning ? watching.state.turning : "Straight";
        options = watching.state.reverse ? currentIntersection.reverse : currentIntersection.forward;

        if (options.length > 1) {
            const left = options.find(opt => opt.option.alt == 263);
            const straight = options.find(opt => opt.option.alt == 265);
            const right = options.find(opt => opt.option.alt == 262);
            optionsText = `Left: ${left?.option?.turnText || "n/a"}<br>
                    Straight: ${straight?.option?.turnText || "n/a"}<br>
                    Right: ${right?.option?.turnText || "n/a"}<br>
                `
                        
            /*
            currIntersectionDiv.innerHTML = `<hr>In an intersection! ${currentIntersection.m_markerId}<br>
                Turning: ${direction}<br>
                ${optionsText}<br>
            `
            */
            const nextRouteIntersection = customRouteIntersections.find(int => !int.found)
            if (nextRouteIntersection && currentIntersection.m_markerId == nextRouteIntersection.m_markerId) {
                //found the next intersection on the route
                const turnDir = nextRouteIntersection.option.alt == 263 ? "Left" : nextRouteIntersection.option.alt == 262 ? "Right" : "Straight"
                //currIntersectionDiv.innerHTML += `This is the next intersection on the route, we should be going ${turnDir}`
                if (turnDir.toLowerCase() != direction.toLowerCase()) {
                    //debugger
                    console.log("Turning ", turnDir)
                    await common.rpc[turnComands[turnDir]]([]);
                }
                foundRouteIntersection = true
                lastKnownIntersection = currentIntersection.m_markerId;
            } else {
                //debugger
                //currIntersectionDiv.innerHTML += `This isn't a route intersection, we should be staying on this road`
                let intOptions = [];
                if (watching.state.reverse) {
                    intOptions = currentIntersection.reverse
                } else {
                    intOptions = currentIntersection.forward
                }
                const thisRoadOption = intOptions.find(opt => opt.option.road == watching.state.roadId)
                //debugger
                const turnDir = thisRoadOption?.option.alt == 263 ? "Left" : thisRoadOption?.option.alt == 262 ? "Right" : "Straight"
                if (turnDir.toLowerCase() != direction.toLowerCase()) {
                    //debugger
                    console.log("Turning ", turnDir)
                    await common.rpc[turnComands[turnDir]]([]);
                }
                //debugger
            }
            const nextIntersection = customRouteIntersections.find(x => !x.found);
            const nextRoadIntersection = getNextRoadIntersection(rp, roadIntersections.intersections, watching.state.reverse);
            let distanceToNextIntersection;
            let nextOption;
            if (nextRoadIntersection) {
                //console.log("nextRoadIntersection", nextRoadIntersection);
                if (nextRoadIntersection.m_markerId == nextIntersection.m_markerId) {
                    //get distance to option exit
                    distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
                    nextOption = nextIntersection.option;
                } else {
                    //get distance to option that stays on the road
                    distanceToNextIntersection = getDistanceToIntersection(watching, nextRoadIntersection, rp, true);
                    //debugger
                    const nextOptionFind = watching.state.reverse ? 
                        nextRoadIntersection.reverse.find(x => x.option.road == watching.state.roadId) :
                        nextRoadIntersection.forward.find(x => x.option.road == watching.state.roadId);
                    if (nextOptionFind && nextOptionFind.option) {
                        nextOption = nextOptionFind.option;
                    }
                }
            } else {
                console.log("no more intersections on this road")
                debugger
                //no more intersections on this route
            }
            //const distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
            //console.log(`Next intersection: ${distanceToNextIntersection}m`)
            if (nextOption) {
                //const turnDir = nextOption.alt == 263 ? "<font size='+2'>&#x21B0;</font>" : nextOption.alt == 262 ? "<font size='+2'>&#x21B1;</font>" : "<font size='+2'>&#x2191;</font>"
                //let nextIntOutput = `${turnDir} ${nextOption.turnText} (${distanceToNextIntersection}m)`
                //nextRoadIntersectionDiv.innerHTML = nextIntOutput;
            }
            
        }
    } //else {
        
        //currIntersectionDiv.innerHTML = "NOT in an intersection.<br>"
        //currIntersectionDiv.innerHTML = "";
        /*
        if (foundRouteIntersection) {
            const nextRouteIntersection = customRouteIntersections.find(int => !int.found)
            //nextRouteIntersection.found = true // we left the intersection, mark it found and reset the flag
            foundRouteIntersection = false
            //buildIntersectionsTable();
        }
        */

        //change this to show all options for next intersection with distance countdown to the proper choice.

        const nextIntersection = customRouteIntersections.find(x => !x.found);
        const nextRoadIntersection = getNextRoadIntersection(rp, roadIntersections.intersections, watching.state.reverse);
        let distanceToNextIntersection;
        let nextOption;
        let optionsText = "";
        if (nextRoadIntersection) {  
            if (nextRoadIntersection.m_markerId == nextIntersection.m_markerId) {
                //get distance to option exit
                distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
                nextOption = nextIntersection.option;
            } else {
                //get distance to option that stays on the road
                distanceToNextIntersection = getDistanceToIntersection(watching, nextRoadIntersection, rp, true);
                if (watching.state.reverse) {
                    if (nextRoadIntersection.reverse.length > 1) {
                        nextOption = (nextRoadIntersection.reverse.find(x => x.option.road == watching.state.roadId)).option
                    } else {
                        nextOption = (nextRoadIntersection.reverse[0]).option
                    }
                } else {
                    if (nextRoadIntersection.forward.length > 1) {
                        nextOption = (nextRoadIntersection.forward.find(x => x.option.road == watching.state.roadId)).option
                    } else {
                        nextOption = (nextRoadIntersection.forward[0]).option
                    }
                }
                /*
                nextOption = watching.state.reverse ? 
                    (nextRoadIntersection.reverse.find(x => x.option.road == watching.state.roadId)).option :
                    (nextRoadIntersection.forward.find(x => x.option.road == watching.state.roadId)).option;
                */
            }          
            const options = watching.state.reverse ? nextRoadIntersection.reverse : nextRoadIntersection.forward;
            const left = options.find(opt => opt.option.alt == 263);
            const straight = options.find(opt => opt.option.alt == 265);
            const right = options.find(opt => opt.option.alt == 262);
            
            if (left) {
                let optClass = "";
                if (nextOption.alt == 263) {
                    optClass = "nextOption";
                    //set style to highlight this
                }
                optionsText += `<div class="${optClass}"<font size='+2'>&#x21B0;</font> ${left.option?.turnText}</div>`;
            }
            if (straight) {
                let optClass = "";
                if (nextOption.alt == 265) {
                    optClass = "nextOption";
                    //set style to highlight this
                }
                optionsText += `<div class="${optClass}"<font size='+2'>&#x2191;</font> ${straight.option?.turnText}</div>`;
            }
            if (right) {
                let optClass = "";
                if (nextOption.alt == 262) {
                    optClass = "nextOption";
                    //set style to highlight this
                }
                optionsText += `<div class="${optClass}"<font size='+2'>&#x21B1;</font> ${right.option?.turnText}</div>`;
            }

            
        } else {
            console.log("no more intersections on this road")
            //no more intersections on this route
        }
        //const distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
        //console.log(`Next intersection: ${distanceToNextIntersection}m`)
        if (nextOption) {
            nextRoadIntersectionDiv.innerHTML = optionsText;
            const nextOptionDiv = document.querySelector('.nextOption');
            if (nextOptionDiv) {
                //const distDiv = nextOptionDiv.querySelector('.dist');
                //const turnDir = nextOption.alt == 263 ? "<font size='+2'>&#x21B0;</font>" : nextOption.alt == 262 ? "<font size='+2'>&#x21B1;</font>" : "<font size='+2'>&#x2191;</font>"
                //distDiv.innerHTML = ` (${distanceToNextIntersection}m)`
                const distanceOutput = distanceToNextIntersection < 1000 ? ` (${distanceToNextIntersection}m)` : ` (${parseFloat(distanceToNextIntersection / 1000).toFixed(2)}km)`
                nextOptionDiv.innerHTML += distanceOutput;
                //nextOptionDiv.innerHTML += ` (${distanceToNextIntersection}m)`
                //debugger
                //console.log(nextOptionDiv.innerHTML)
                //debugger
            }
            //const turnDir = nextOption.alt == 263 ? "<font size='+2'>&#x21B0;</font>" : nextOption.alt == 262 ? "<font size='+2'>&#x21B1;</font>" : "<font size='+2'>&#x2191;</font>"
            //let nextIntOutput = `${turnDir} ${nextOption.turnText} (${distanceToNextIntersection}m)`
            //nextRoadIntersectionDiv.innerHTML = nextIntOutput;
            
        }
        /*
        const row = document.querySelector('#intersectionsTable tbody tr:not(.passedIntersection):not(:has(th))');
        const nextDistanceDiv = row?.querySelector('td:nth-child(2) .nextDistance');
        if (nextDistanceDiv) {
            nextDistanceDiv.innerHTML = `&nbsp(${distanceToNextIntersection}m)`
        }
        */
        //row.cells[0].innerHTML += ` (${distanceToNextIntersection}m)`
        //debugger
        //console.log("nextIntersection", nextIntersection)
        
    //}
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
