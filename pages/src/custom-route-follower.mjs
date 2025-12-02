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
const currIntersectionDiv = document.getElementById("currentIntersection")
const intersectionsDiv = document.getElementById("intersectionsDiv")
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
        for (let m of customRouteManifest) {
            //debugger
        }
        buildIntersectionsTable();
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

async function processWatching(watching) {
    if (Date.now() - gcRefresh > 10000) {
        updateConnStatus(await common.rpc.getGameConnectionStatus());
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
        customRouteIntersections = await zen.getManifestIntersections(watching.zenCustomRoute.manifest, watching.zenCustomRoute.courseId);
        customRouteIntersections = customRouteIntersections.filter(x => x.roadExit);
        console.log("new customRouteIntersections", customRouteIntersections)
        customRouteManifest = watching.zenCustomRoute;
        buildIntersectionsTable();
    }
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
    /*
    if (roadIntersections) {
        currentIntersection = roadIntersections.intersections.find(int => 
            rp >= Math.min(int.m_roadTime1, int.m_roadTime2) &&
            rp <= Math.max(int.m_roadTime1, int.m_roadTime2)
        ); //m_roadTime1 is almost always less than m_roadTime2 but not always
        if (watching.state.reverse && currentIntersection?.reverse.length > 0 ||
            !watching.state.reverse && currentIntersection?.forward.length > 0 ) {
            validIntersection = true;
        }
    }
    */
    
    //debugger
    if (validIntersection) {
        //console.log("currentIntersection",currentIntersection)
        //debugger
        let options;
        let optionsText;
        //let showIntersection = true;
        let direction = watching.state.turning ? watching.state.turning : "Straight";
        options = watching.state.reverse ? currentIntersection.reverse : currentIntersection.forward;
        if (options.length > 0) {
            const left = options.find(opt => opt.option.alt == 263);
            const straight = options.find(opt => opt.option.alt == 265);
            const right = options.find(opt => opt.option.alt == 262);
            optionsText = `Left: ${left?.option?.turnText || "n/a"}<br>
                    Straight: ${straight?.option?.turnText || "n/a"}<br>
                    Right: ${right?.option?.turnText || "n/a"}<br>
                `
            
        }        
        //if (showIntersection) {
        if (lastKnownIntersection && currentIntersection.m_markerId != lastKnownIntersection) {
            const lastRouteIntersection = customRouteIntersections.find(int => int.m_markerId == lastKnownIntersection && !int.found)
            if (lastRouteIntersection) {
                lastRouteIntersection.found = true // we left the intersection, mark it found and reset the flag
                foundRouteIntersection = false;
                buildIntersectionsTable();
            }
            //console.log("Went directly from one intersection to another...")                
        }
        currIntersectionDiv.innerHTML = `<hr>In an intersection! ${currentIntersection.m_markerId}<br>
            Turning: ${direction}<br>
            ${optionsText}<br>
        `
        const nextRouteIntersection = customRouteIntersections.find(int => !int.found)
        if (nextRouteIntersection && currentIntersection.m_markerId == nextRouteIntersection.m_markerId) {
            //found the next intersection on the route
            const turnDir = nextRouteIntersection.option.alt == 263 ? "Left" : nextRouteIntersection.option.alt == 262 ? "Right" : "Straight"
            currIntersectionDiv.innerHTML += `This is the next intersection on the route, we should be going ${turnDir}`
            if (turnDir.toLowerCase() != direction.toLowerCase()) {
                //debugger
                console.log("Turning ", turnDir)
                await common.rpc[turnComands[turnDir]]([]);
            }
            foundRouteIntersection = true
            lastKnownIntersection = currentIntersection.m_markerId;
        } else {
            //debugger
            currIntersectionDiv.innerHTML += `This isn't a route intersection, we should be staying on this road`
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
        if (watching.state.roadId == nextIntersection.m_roadId) {
            const distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
            const row = document.querySelector('#intersectionsTable tbody tr:not(.passedIntersection):not(:has(th))');
            row.className = "currentIntersection"
            const nextDistanceDiv = row.querySelector('td:nth-child(2) .nextDistance');
            nextDistanceDiv.innerHTML = `&nbsp(${distanceToNextIntersection}m)`
        } else {
            const row = document.querySelector('#intersectionsTable tbody tr:not(.passedIntersection):not(:has(th))');
            const nextDistanceDiv = row.querySelector('td:nth-child(2) .nextDistance');
            nextDistanceDiv.innerHTML = "";
        }
        
    } else {
        //currIntersectionDiv.innerHTML = "NOT in an intersection.<br>"
        currIntersectionDiv.innerHTML = "";
        if (foundRouteIntersection) {
            const nextRouteIntersection = customRouteIntersections.find(int => !int.found)
            nextRouteIntersection.found = true // we left the intersection, mark it found and reset the flag
            foundRouteIntersection = false
            buildIntersectionsTable();
        }
        //const foundIntersections = customRouteIntersections.filter(x => x.found)
        //currIntersectionDiv.innerHTML += `Found ${foundIntersections.length} of ${customRouteIntersections.length} intersections.`
        const nextIntersection = customRouteIntersections.find(x => !x.found);
        const distanceToNextIntersection = getDistanceToIntersection(watching, nextIntersection, rp, true);
        //console.log(`Next intersection: ${distanceToNextIntersection}m`)
        const row = document.querySelector('#intersectionsTable tbody tr:not(.passedIntersection):not(:has(th))');
        const nextDistanceDiv = row.querySelector('td:nth-child(2) .nextDistance');
        nextDistanceDiv.innerHTML = `&nbsp(${distanceToNextIntersection}m)`
        //row.cells[0].innerHTML += ` (${distanceToNextIntersection}m)`
        //debugger
        //console.log("nextIntersection", nextIntersection)
        
    }
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
