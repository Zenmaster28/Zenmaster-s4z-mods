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
let customRouteComplete = false;
let spawnDistance = 0;
let badManifestCounter = 0;
const varianceOptions = [25, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const currIntersectionDiv = document.getElementById("currentIntersection");
const intersectionsDiv = document.getElementById("intersectionsDiv");
const nextRoadIntersectionDiv = document.getElementById("nextRoadIntersection");

function updateConnStatus(s) {
    console.log("Updating game connection status", s)
    if (!s) {
        s = {connected: false, state: 'disabled'};
    }    
    const gcStatus = document.getElementById("gcStatus")
    const gcState = s.state == "connected" ? "&#x2705;" : s.state == "waiting" ? "waiting" : "&#x274C;"
    gcStatus.innerHTML = `Game connection: ${gcState}`
}

function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}
function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {        
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}


export async function main() {
    common.initInteractionListeners(); 
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1); 
    updateConnStatus(await common.rpc.getGameConnectionStatus());
    const selfData = await common.rpc.getAthleteData('self'); 
    if (selfData && selfData.zenCustomRoute?.ts != customRouteManifest.ts) {
        console.log("Updating custom route intersections from watching data", selfData.zenCustomRoute);
        customRouteIntersections = await zen.getManifestIntersections(selfData.zenCustomRoute.manifest, selfData.zenCustomRoute.courseId)
        customRouteIntersections = customRouteIntersections.filter(x => x.roadExit);
        console.log("new customRouteIntersections", customRouteIntersections)
        exitIntersections = [];
        customRouteManifest = selfData.zenCustomRoute;
        customRouteData = await zen.buildRouteData(selfData.zenCustomRoute, selfData.zenCustomRoute.courseId);
        customRouteData.manifestIntersections = [];
        let i = -1;
        const epsilon = 1e-4;
        console.log("customrouteData.manifest", customRouteData.manifest)
        
        for (let m of customRouteData.manifest) {
            let foundInt = false;
            i++;
            for (let int of customRouteIntersections) {
                if (int.assigned) {
                    continue;
                }
                const target = m.reverse ? m.start : m.end;
                const intExit = m.reverse ? int.m_roadTime1 : int.m_roadTime2;
                //if (Math.abs(int.option.exitTime - target) < epsilon) { //should probably be checking roadId and direction too
                if (Math.abs(intExit - target) < epsilon) {
                    int.assigned = true;
                    int.idx = i;
                    customRouteData.manifestIntersections.push(int);
                    foundInt = true;
                    break;                    
                }
            }
            if (!foundInt) {
                //console.log(m)
                //debugger
                customRouteData.manifestIntersections.push(null)
            }
        }        
        customRouteIntersections = customRouteData.manifestIntersections.filter(x => x != null)
        console.log("customRouteIntersections", customRouteIntersections)
        console.log("customrouteData", customRouteData)

    }
    common.subscribe('status', updateConnStatus, {source: 'gameConnection', persistent: true});
    common.subscribe('athlete/self', processWatching);
    common.settingsStore.addEventListener('changed', ev => {
            const changed = ev.data.changed; 
            settings = common.settingsStore.get()
            if (changed.has('fontScale')) {
                changeFontScale();
            };
            if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
                setBackground();
            }
    })
}

async function getAllIntersections(courseId) {
    const worldList = await common.getWorldList();                
    const worldId = (worldList.find(x => x.courseId == courseId)).worldId;
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
    const ahead = reverse ? roadIntersections.filter(x => x.reverse.length > 0 && x.m_roadTime1 <= rp) : roadIntersections.filter(x => x.forward.length > 0 && x.m_roadTime2 >= rp);
    //maybe someday skip intersections that only runners can choose
    if (ahead.length > 0) {
        return ahead[0];
    } else if (courseRoadsById[roadIntersections[0].m_roadId].looped) {
        return roadIntersections[0]; //we are on a looped road and after the last intersection before the 0/1 line, return the first intersection after that line
    } else {
        return null;
    }
}
let _processWatchingBusy;
async function processWatching(watching) {
    if (_processWatchingBusy) {
        return;
    }
    _processWatchingBusy = true;
    try {
        return await _processWatching.apply(this, arguments);
    } finally {
        _processWatchingBusy = false;
    }
}

async function _processWatching(watching) {    
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
        const epsilon = 1e-4;
        for (let m of customRouteData.manifest) {
            let foundInt = false;
            i++;
            for (let int of exitCustomRouteIntersections) {
                if (int.assigned) {
                    continue;
                }
                const target = m.reverse ? m.start : m.end;
                const intExit = m.reverse ? int.m_roadTime1 : int.m_roadTime2;
                //if (Math.abs(int.option.exitTime - target) < epsilon) { //should probably be checking roadId and direction too
                if (Math.abs(intExit - target) < epsilon) {
                //if (Math.abs(int.option.exitTime - target) < epsilon) { //should probably be checking roadId and direction too
                    int.assigned = true;
                    int.idx = i;
                    customRouteData.manifestIntersections.push(int);
                    foundInt = true;
                    break;                    
                }
            }
            if (!foundInt) {
                customRouteData.manifestIntersections.push(null)
            }
        }
        customRouteIntersections = customRouteData.manifestIntersections.filter(x => x != null)
        console.log("customRouteIntersections", customRouteIntersections)
        console.log("customrouteData", customRouteData)
        spawnDistance = null;
        customRouteComplete = false;
    }
    if (!spawnDistance) {
        //don't calc this if not at the start of the route
        //consider sending this back to athleteData entry in case of reload
        if (watching.state.eventDistance < 200 && watching.state.roadId == customRouteData.manifest[0].roadId) {
            const rp = (watching.state.roadTime - 5000) / 1e6;
            const manifestStart = watching.state.reverse ? customRouteData.manifest[0].end : customRouteData.manifest[0].start;
            const low = Math.min(rp, manifestStart);
            const high = Math.max(rp, manifestStart);            
            const thisRoad = courseRoadsById[watching.state.roadId];
            spawnDistance = (thisRoad.curvePath.distanceBetweenRoadPercents(low, high, 4e-2) / 100) - watching.state.eventDistance;
            if (watching.state.reverse && rp > manifestStart) {
                spawnDistance = spawnDistance * -1;
            } else if (!watching.state.reverse && rp < manifestStart) {
                spawnDistance = spawnDistance * -1;
            }
            console.log("rp", rp, "manifestStart", manifestStart, "spawnDistance", spawnDistance)
        } else {
            //check if found in athleteData
            spawnDistance = 0.1; // just so this doesn't constantly get triggered
        }
    }
    if (customRouteComplete || !customRouteData) {
        return;
    }
    let manifestIdx = null;
    const distanceTarget = watching.state.eventDistance + spawnDistance;
    for (let variance of varianceOptions) {        
        manifestIdx = customRouteData.manifestDistances.find(x => (x.start - variance) <= distanceTarget && 
            (x.end + variance) >= distanceTarget && 
            x.roadId == watching.state.roadId && 
            x.reverse == watching.state.reverse); 
        if (manifestIdx) {
            break;
        }
    }

    if (!manifestIdx) {
        nextRoadIntersectionDiv.innerHTML = "";
        badManifestCounter++;
        currIntersectionDiv.innerHTML = `Uh-oh! We might be lost... ${badManifestCounter}`; 
        return;
    }
    currIntersectionDiv.innerHTML = "";    
    const prevIntersections = customRouteIntersections.filter(x => x.idx < manifestIdx.i)
    const nextIntersections = customRouteIntersections.filter(x => x.idx >= manifestIdx.i)
    
    for (let p of prevIntersections) {
        if (!p.found) {
            p.found = true;
        }        
    }
    for (let n of nextIntersections) {
        if (n.found) {
            n.found = false;
        }
    }
        
    const rp = (watching.state.roadTime - 5000) / 1e6;
    let currentIntersection;
    let validIntersection = false;
    
    const roadIntersections = intersectionsById[watching.state.roadId];
    
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
    if (validIntersection) {
        let options;
        let optionsText;        
        let direction = watching.state.turning ? watching.state.turning : "Straight";
        options = watching.state.reverse ? currentIntersection.reverse : currentIntersection.forward;

        if (options.length > 1) {
            const nextRouteIntersection = customRouteIntersections.find(int => !int.found)            
            if (nextRouteIntersection && currentIntersection.m_markerId == nextRouteIntersection.m_markerId && nextRouteIntersection.idx == manifestIdx.i) {
                //found the next intersection on the route                
                const turnDir = nextRouteIntersection.option.alt == 263 ? "Left" : nextRouteIntersection.option.alt == 262 ? "Right" : "Straight"                
                if (turnDir.toLowerCase() != direction.toLowerCase()) {
                    console.log("Turning ", turnDir)
                    await common.rpc[turnComands[turnDir]]([]);
                }
            
                
            } else {
                let intOptions = [];
                if (watching.state.reverse) {
                    intOptions = currentIntersection.reverse
                } else {
                    intOptions = currentIntersection.forward
                }
                const thisRoadOption = intOptions.find(opt => opt.option.road == watching.state.roadId)
                
                const turnDir = thisRoadOption?.option.alt == 263 ? "Left" : thisRoadOption?.option.alt == 262 ? "Right" : "Straight"
                if (turnDir.toLowerCase() != direction.toLowerCase()) {
                    console.log("Turning ", turnDir)
                    await common.rpc[turnComands[turnDir]]([]);
                }
                
            }
        }
    } 
    //const nextIntersection = customRouteIntersections.find(x => !x.found);
    const nextIntersection = customRouteIntersections.find(x => x.idx == manifestIdx.i);
    const nextRoadIntersection = getNextRoadIntersection(rp, roadIntersections.intersections, watching.state.reverse);
    let distanceToNextIntersection;
    let nextOption;
    let optionsText = "";
    //debugger
    if (nextRoadIntersection) {  
        if (nextRoadIntersection.m_markerId == nextIntersection?.m_markerId && nextIntersection.idx == manifestIdx.i) {
            //get distance to option exit
            distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
            nextOption = nextIntersection.option;
        } else {
            //get distance to option that stays on the road
            distanceToNextIntersection = getDistanceToIntersection(watching, nextRoadIntersection, rp, true);
            if (watching.state.reverse) {
                if (nextRoadIntersection.reverse.length > 1) {
                    nextOption = nextRoadIntersection.reverse.find(x => x.option.road == watching.state.roadId);
                    if (nextOption) {
                        nextOption = nextOption.option;
                    }
                } else {
                    nextOption = nextRoadIntersection.reverse[0]
                    if (nextOption) {
                        nextOption = nextOption.option;
                    }
                }
            } else {
                if (nextRoadIntersection.forward.length > 1) {
                    nextOption = nextRoadIntersection.forward.find(x => x.option.road == watching.state.roadId);
                    if (nextOption) {
                        nextOption = nextOption.option;
                    }
                } else {
                    nextOption = nextRoadIntersection.forward[0]
                    if (nextOption) {
                        nextOption = nextOption.option;
                    }
                }
            }
        }          
        const options = watching.state.reverse ? nextRoadIntersection.reverse : nextRoadIntersection.forward;
        const left = options.find(opt => opt.option.alt == 263);
        const straight = options.find(opt => opt.option.alt == 265);
        const right = options.find(opt => opt.option.alt == 262);
        
        if (left) {
            let optClass = "";
            if (nextOption?.alt == 263) {
                optClass = "nextOption";
            }
            optionsText += `<div class="${optClass}"<font size='+2'>&#x21B0;</font> ${left.option?.turnText}</div>`;
        }
        if (straight) {
            let optClass = "";
            if (nextOption?.alt == 265) {
                optClass = "nextOption";
            }
            optionsText += `<div class="${optClass}"<font size='+2'>&#x2191;</font> ${straight.option?.turnText}</div>`;
        }
        if (right) {
            let optClass = "";
            if (nextOption?.alt == 262) {
                optClass = "nextOption";
            }
            optionsText += `<div class="${optClass}"<font size='+2'>&#x21B1;</font> ${right.option?.turnText}</div>`;
        }
        if (!nextIntersection) {
            //no more intersections on the route.
            const distanceToFinish = parseInt(customRouteData.distances.at(-1) - watching.state.eventDistance);
            if (distanceToFinish < distanceToNextIntersection) {
                let routeFinish = `Finish: `;
                
                if (distanceToFinish >= 1000) {
                    routeFinish += `${(distanceToFinish / 1000).toFixed(2)}km`
                } else if (distanceToFinish >= 0) {
                    routeFinish += `${distanceToFinish}m`;
                } else {
                    routeFinish = "Route complete."
                    customRouteComplete = true;
                }
                nextRoadIntersectionDiv.innerHTML = routeFinish;
                nextOption = null;
            }
        }
        
    } else {
        console.log("no more intersections on this road")
    }
    if (nextOption) {
        nextRoadIntersectionDiv.innerHTML = optionsText;
        const nextOptionDiv = document.querySelector('.nextOption');
        if (nextOptionDiv) {
            const distanceOutput = distanceToNextIntersection < 1000 ? ` (${distanceToNextIntersection}m)` : ` (${parseFloat(distanceToNextIntersection / 1000).toFixed(2)}km)`
            nextOptionDiv.innerHTML += distanceOutput;
        }
    }
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
