import * as common from '/pages/src/common.mjs';
import * as map from './map.mjs';
import * as elevation from './elevation-segments.mjs';
import * as data from '/shared/sauce/data.mjs';
import * as zen from './segments-xCoord.mjs';


const doc = document.documentElement;

common.settingsStore.setDefault({
    // v0.13.0...
    profileOverlay: true,
    mapStyle: 'default',
    tiltShift: false,
    tiltShiftAmount: 80,
    sparkle: false,
    solidBackground: false,
    transparency: 0,
    backgroundColor: '#00ff00',
    fields: 1,
    autoHeading: true,
    quality: 50,
    verticalOffset: 0,
    fpsLimit: 30,
    // v0.13.1...
    zoomPriorityTilt: true,
    // v1.0.0
    profileHeight: 20,
    routeProfile: true,
    showElevationMaxLine: true,
    autoCenter: true,
    // v1.1+
    disableChat: false,
    showMap: true,
    showAllArches: false,
    sortBy: "time",
    sortOrder: "asc",
    showResults: true
});
doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
const settings = common.settingsStore.get();
const url = new URL(location);
const courseSelect = document.querySelector('#titlebar select[name="course"]');
const segmentSelect = document.querySelector('#titlebar select[name="segment"]');
const statsDiv = document.getElementById("stats");
const demoState = {};

let worldList;
let segmentsList;
let watchdog;
let inGame;
let zwiftMap;
let elProfile;
let courseId = Number(url.searchParams.get('course')) || 6;
let urlSegment = url.searchParams.get('segment')
let segmentId = urlSegment ? BigInt(urlSegment) : undefined;
let urlAthlete = url.searchParams.get('athlete')
let currentRoute;

function qualityScale(raw) {
    raw = raw || 1;
    const min = 0.2;
    return Math.min(2, (raw / 100) * (1 - min) + min);
}


function getSetting(key, def) {
    const v = settings[key];
    return v === undefined ? def : v;
}


function createZwiftMap() {
    const opacity = 1 - 1 / (100 / (settings.transparency || 0));
    const autoCenter = getSetting('autoCenter', true);
    const zm = new map.SauceZwiftMap({
        el: document.querySelector('.map'),
        worldList,
        zoom: settings.zoom,
        autoHeading: autoCenter && getSetting('autoHeading', true),
        autoCenter,
        style: settings.mapStyle,
        opacity,
        tiltShift: settings.tiltShift && ((settings.tiltShiftAmount || 0) / 100),
        sparkle: settings.sparkle,
        quality: qualityScale(settings.quality || 80),
        verticalOffset: settings.verticalOffset / 100,
        fpsLimit: settings.fpsLimit || 30,
        zoomPriorityTilt: getSetting('zoomPriorityTilt', true),
        preferRoute: settings.routeProfile !== false,
        zoomCenter: settings.zoomCenter || false,
        overrideDistance: settings.overrideDistance || 0,
        overrideLaps: settings.overrideLaps || 0
    });
    
    function autoCenterHandler(en) {
        if (en) {
            zm.setDragOffset([0, 0]);
        }
        zm.setAutoCenter(en);
        zm.setAutoHeading(!en ? false : !!settings.autoHeading);
        settings.autoCenter = en;
        common.settingsStore.set(null, settings);
    }

    function autoHeadingHandler(en) {
        zm.setAutoHeading(en);
        if (en) {
            zm.setHeadingOffset(0);
        }
        settings.autoHeading = en;
        common.settingsStore.set(null, settings);
    }
    zm.addEventListener('drag', ev => {
        if (ev.drag) {
            const dragging = !!(ev.drag && (ev.drag[0] || ev.drag[1]));
            if (dragging && settings.autoCenter !== false) {
                //autoCenterBtn.classList.remove('primary');
                //autoCenterBtn.classList.add('outline');
            }
        } else if (ev.heading) {
            if (autoHeadingBtn.classList.contains('primary')) {
                //autoHeadingBtn.classList.remove('primary');
                //autoHeadingBtn.classList.add('outline');
            }
        }
    });

    return zm;
}


function createElevationProfile() {
    const el = document.querySelector('.elevation-profile');
    if (settings.profileHeight) {
        el.style.setProperty('--profile-height', settings.profileHeight / 100);
    }
    const preferRoute = settings.routeProfile !== false;
    const showMaxLine = settings.showElevationMaxLine !== false;
    const showLapMarker = settings.showLapMarker !== false;
    const showSegmentStart = settings.showSegmentStart !== false;   
    const showLoopSegments = settings.showLoopSegments !== false; 
    const pinSize = settings.pinSize ? settings.pinSize : 1;
    const lineType = settings.lineType ? settings.lineType : "solid";
    const lineTypeFinish = settings.lineTypeFinish ? settings.lineTypeFinish : "[5, 10]";
    const lineSize = settings.lineSize ? settings.lineSize : 1.0;
    const pinColor = settings.pinColor ? settings.pinColor : "#ff430e";
    const showSegmentFinish = settings.showSegmentFinish !== false;    
    typeof(settings.showAllArches) == "undefined" ? common.settingsStore.set("showAllArches", false) : null;
    const showAllArches = settings.showAllArches;
    const minSegmentLength = settings.minSegmentLength ? settings.minSegmentLength : 500;
    const showNextSegment = settings.showNextSegment !== false;    
    const setAthleteSegmentData = settings.setAthleteSegmentData !== false;
    typeof(settings.showCompletedLaps) == "undefined" ? common.settingsStore.set("showCompletedLaps", true) : null;
    const showCompletedLaps = settings.showCompletedLaps;  
    typeof(settings.overrideDistance) == "undefined" ? common.settingsStore.set("overrideDistance", 0) : null 
    const overrideDistance = settings.overrideDistance;
    typeof(settings.overrideLaps) == "undefined" ? common.settingsStore.set("overrideLaps", 0) : null;
    const overrideLaps = settings.overrideLaps;    
    typeof(settings.yAxisMin) == "undefined" ? common.settingsStore.set("yAxisMin", 200) : null;
    const yAxisMin = settings.yAxisMin;
    typeof(settings.singleLapView) == "undefined" ? common.settingsStore.set("singleLapView", false) : null;
    const singleLapView = settings.singleLapView !== false;
    typeof(settings.profileZoom) == "undefined" ? common.settingsStore.set("profileZoom", false) : null;
    const profileZoom = settings.profileZoom;
    typeof(settings.zoomNextSegment) == "undefined" ? common.settingsStore.set("zoomNextSegment", false) : null;
    const zoomNextSegment = settings.zoomNextSegment;
    typeof(settings.zoomNextSegmentApproach) == "undefined" ? common.settingsStore.set("zoomNextSegmentApproach", 100) : null;
    const zoomNextSegmentApproach = settings.zoomNextSegmentApproach;
    typeof(settings.zoomFinalKm) == "undefined" ? common.settingsStore.set("zoomFinalKm", false) : null;
    const zoomFinalKm = settings.zoomFinalKm;
    typeof(settings.zoomSlider) == "undefined" ? common.settingsStore.set("zoomSlider", false) : null;
    const zoomSlider = settings.zoomSlider;
    typeof(settings.forwardDistance) == "undefined" ? common.settingsStore.set("forwardDistance", 5000) : null;
    const forwardDistance = settings.forwardDistance;
    typeof(settings.showMyPin) == "undefined" ? common.settingsStore.set("showMyPin", true) : null;
    const showMyPin = settings.showMyPin;
    typeof(settings.showTeamMembers) == "undefined" ? common.settingsStore.set("showTeamMembers", false) : null;
    const showTeamMembers =  settings.showTeamMembers;
    typeof(settings.showMarkedRiders) == "undefined" ? common.settingsStore.set("showMarkedRiders", false) : null;
    const showMarkedRiders = settings.showMarkedRiders;
    typeof(settings.showAllRiders) == "undefined" ? common.settingsStore.set("showAllRiders", true) : null;
    const showAllRiders = settings.showAllRiders;
    typeof(settings.showRobopacers) == "undefined" ? common.settingsStore.set("showRobopacers", false) : null;
    const showRobopacers = settings.showRobopacers;
    typeof(settings.showLeaderSweep) == "undefined" ? common.settingsStore.set("showLeaderSweep", false) : null;
    const showLeaderSweep = settings.showLeaderSweep;
    typeof(settings.pinColorMarked) == "undefined" ? common.settingsStore.set("pinColorMarked", "#9cb7ec") : null;
    const pinColorMarked = settings.pinColorMarked;typeof(settings.colorScheme) == "undefined" ? common.settingsStore.set("colorScheme", "sauce") : null
    const colorScheme = settings.colorScheme;typeof(settings.lineTextColor) == "undefined" ? common.settingsStore.set("lineTextColor", "#ffffff") : null;
    const lineTextColor = settings.lineTextColor;
    typeof(settings.gradientOpacity) == "undefined" ? common.settingsStore.set("gradientOpacity", 0.7) : null;
    const gradientOpacity = settings.gradientOpacity;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, showAllArches});    
}


function setWatching(id) {
    console.info("Now watching:", id);
    zwiftMap.setWatching(id);
    if (elProfile) {
        elProfile.setWatching(id);
    }
}


async function initialize() {
    const ad = await common.rpc.getAthleteData('self');
    inGame = !!ad && ad.age < 15000;
    if (!inGame) {
        if (!demoState.intervalId) {
            demoState.intervalId = true; // lock
            console.info("User not active: Starting demo mode...");
            if (elProfile) {
                elProfile.clear();
            }
            const randomCourseId = worldList[worldList.length * Math.random() | 0].courseId;
            let heading = 0;
            demoState.transitionDurationSave = zwiftMap.getTransitionDuration();
            demoState.zoomSave = zwiftMap.zoom;
            zwiftMap.setZoom(0.2, {disableEvent: true});
            await zwiftMap.setCourse(randomCourseId);
            if (demoState.intervalId === true) {  // could have been cancelled during await
                zwiftMap.setHeading(heading += 5);
                zwiftMap.setTransitionDuration(1100);
                demoState.intervalId = setInterval(() => {
                    zwiftMap.setHeading(heading += 5);
                }, 1000);
            }
        }
        return;
    } else if (demoState.intervalId) {
        console.info("User detected in game: Ending demo mode.");
        clearInterval(demoState.intervalId);
        demoState.intervalId = null;
        zwiftMap.setTransitionDuration(demoState.transitionDurationSave);
        zwiftMap.setZoom(demoState.zoomSave, {disableEvent: true});
    }
    zwiftMap.setAthlete(ad.athleteId);
    if (elProfile) {
        elProfile.setAthlete(ad.athleteId);
    }
    if (!ad.watching) {
        const watching = await common.rpc.getAthleteData('watching');
        if (watching) {
            setWatching(watching.athleteId);
        }
    } else {
        setWatching(ad.athleteId);
    }
    if (ad.state) {
        zwiftMap.incPause();
        try {
            await zwiftMap.renderAthleteStates([ad.state]);
        } finally {
            zwiftMap.decPause();
        }
        if (elProfile) {
            await elProfile.renderAthleteStates([ad.state]);
        }
    }
}


function centerMap(positions, options) {
    const xMin = data.min(positions.map(x => x[0]));
    const yMin = data.min(positions.map(x => x[1]));
    const xMax = data.max(positions.map(x => x[0]));
    const yMax = data.max(positions.map(x => x[1]));
    zwiftMap.setDragOffset([0, 0]);    
    zwiftMap.setBounds([xMin, yMax], [xMax, yMin], options);
}


const _routeHighlights = [];
async function applySegment() {
    //console.log("applying segment")    
    
    if (segmentId != null) {
        url.searchParams.set('segment', segmentId);
    } else {
        url.searchParams.delete('segment');
    }
    history.replaceState({}, '', url);
    while (_routeHighlights.length) {
        _routeHighlights.pop().elements.forEach(x => x.remove());
    }
    segmentSelect.replaceChildren();
    segmentSelect.insertAdjacentHTML('beforeend', `<option value disabled selected>Segments (${segmentsList.filter(x => common.worldToCourseIds[x.worldId] == courseId).length})</option>`);  
    //console.log(segmentsList)  
    for (const x of segmentsList) {        
        if (common.worldToCourseIds[x.worldId] !== courseId) {
            continue;
        }        
        segmentSelect.insertAdjacentHTML('beforeend', `
            <option ${x.id == segmentId ? 'selected' : ''}
                    value="${x.id}">${common.stripHTML(x.name)} (${common.stripHTML((x.distance).toFixed(0))}m) </option>`);
    }
    if (segmentId != null) {        
        const segment = await zen.getSegmentPath(segmentId);
        console.log(segment)
        let path;
        //debugger
        if (zwiftMap.overrideDistance > 0) {
            let idx = common.binarySearchClosest(route.distances, zwiftMap.overrideDistance)
            path = segment.curvePath;
            path.nodes = path.nodes.slice(0, idx + 1)
        } else {
            path = segment.curvePath;
        }
        //debugger
        _routeHighlights.push(
            zwiftMap.addHighlightPath(path, `route-1-${segment.id}`, {width: 5, color: '#0004'}),
            zwiftMap.addHighlightPath(path, `route-2-${segment.id}`, {width: 1.2, color: 'black'}),
            zwiftMap.addHighlightPath(path, `route-3-${segment.id}`, {width: 0.5, color: 'gold'}),
        );
        let padding = 0.2;
        if (segment.distance < 1000) {
            padding = 0.8
        } else if (segment.distance >= 1000 && segment.distance < 2500) {
            padding = 0.6
        }
        centerMap(segment.curvePath.flatten(1/3), {padding: padding});
        //debugger    
        await elProfile.setSegment(segment)
        const segmentInfoDiv = document.getElementById("segmentInfo");
        const athleteTimesDiv = document.getElementById("athleteTimes")
        athleteTimesDiv.innerHTML = ""
        segmentInfoDiv.innerHTML = `<h1 style="font-size:calc(var(--font-scale) * 1.5em);">${segment.name} (${segment.distance.toFixed(0)}m)</h1><hr>`
        //segmentInfoDiv.innerHTML += segment.name + "<br>Distance: " + segment.distance.toFixed(0) + "m<hr>"
        if (settings.showResults) {
            let segmentBests = await getSegmentBests(segment.id)
            if (settings.sortBy == "date") {
                segmentBests.sort((a,b) => {
                    if (settings.sortOrder == "desc") { 
                        return b.ts - a.ts
                    } else {
                        return a.ts - b.ts
                    }
                })
            } else if (settings.sortOrder == "desc") {
                segmentBests.sort((a,b) => {
                    return b.elapsed - a.elapsed
                })
            }
            if (segmentBests.length > 0) {
                let tableOutput = "<table id='resultsTable'><tr><th><b>Time</th><th><b>Power (w)</th><th><b>Weight (kg)</th><th><b>Date</th></tr>"
                for (let r of segmentBests) {
                    tableOutput += `<tr><td>${zen.formatTime(r.elapsed * 1000)}</td><td>${r.avgPower}</td><td>${r.weight}</td><td>${zen.formatTs(r.ts)}</td></tr>`
                }
                athleteTimesDiv.innerHTML = tableOutput
            } else {
                athleteTimesDiv.innerHTML = "No recent results found"
            }
        }
        let segmentRoutes = await getSegmentRoutes(segment, courseId)
        athleteTimesDiv.innerHTML += "<hr><b>Routes that pass through this segment (click on the route to view details)</b><br>"
        //console.log(segmentRoutes)
        if (segmentRoutes.length > 0) {
            segmentRoutes.sort((a,b) => {
                if (a.name < b.name) {
                    return -1
                }
                if (a.name > b.name) {
                    return 1
                }
                return 0
            })
            for (let rte of segmentRoutes) {
                athleteTimesDiv.innerHTML += `<a href=route-preview-v2.html?course=${rte.courseId}&route=${rte.id} 
                target=routepreview>${rte.name} (${(rte.distanceInMeters / 1000).toFixed(1)}km / ${rte.ascentInMeters.toFixed(0)}m)</a><br>`
            }
        }
    }  else {
        zwiftMap.setVerticalOffset(0);
        zwiftMap.setDragOffset([0, 0]);
        zwiftMap.setZoom(0.3);
        if (elProfile) {
            elProfile.clear();
        }
        document.getElementById("segmentInfo").innerHTML = "<br><br><br><br><center>Choose a segment from the dropdown list."
    }
}

async function getSegmentRoutes(segment, courseId) {
    const routeList = await common.getRouteList(courseId)
    let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
    newRoutes = newRoutes.filter(x => common.worldToCourseIds[x.worldId] == courseId)
    newRoutes.forEach(newRoute => {
        const exists = routeList.some(route => route.id === newRoute.id);
        if (!exists) {
            newRoute.courseId = common.worldToCourseIds[newRoute.worldId]
            //console.log("Adding route: " + newRoute.name + " to " + common.worldToNames[newRoute.worldId])            
            routeList.push(newRoute);
        }
    });
    let zwiftSegmentsRequireStartEnd = await fetch("data/segRequireStartEnd.json").then((response) => response.json());
    let requireStartEnd = zwiftSegmentsRequireStartEnd.includes(segment.id)
    //debugger
    let filteredRoutes
    if (requireStartEnd) {
        if (segment.reverse) {
            filteredRoutes = routeList.filter(route => 
                route.manifest.some(roadSeg => roadSeg.roadId === segment.roadId && 
                    roadSeg.reverse == segment.reverse &&
                    roadSeg.end >= segment.roadStart &&
                    roadSeg.start <= segment.roadFinish
                )
            );
        } else {
            filteredRoutes = routeList.filter(route => 
                route.manifest.some(roadSeg => roadSeg.roadId === segment.roadId &&                 
                    roadSeg.start <= segment.roadStart &&
                    roadSeg.end >= segment.roadFinish
                )
            );
        }
    } else {
        if (segment.reverse) {
            filteredRoutes = routeList.filter(route => 
                route.manifest.some(roadSeg => roadSeg.roadId === segment.roadId &&
                    roadSeg.reverse == segment.reverse &&
                    ((roadSeg.end >= segment.roadStart &&
                        roadSeg.start <= segment.roadStart) ||
                    (roadSeg.start <= segment.roadFinish &&
                        roadSeg.end >= segment.roadFinish
                    ))
                )
            );
        } else {
            filteredRoutes = routeList.filter(route => 
                route.manifest.some(roadSeg => roadSeg.roadId === segment.roadId &&  
                    !roadSeg.reverse &&
                    ((roadSeg.start <= segment.roadStart &&
                        roadSeg.end >= segment.roadStart) ||
                    (roadSeg.start <= segment.roadFinish &&
                        roadSeg.end >= segment.roadFinish
                    ))
                )
            );
        }
    }    
    //console.log(filteredRoutes);
    return filteredRoutes;
}


async function getSegmentBests(id) {
    let athleteId = await common.rpc.getAthlete("self")
    if (urlAthlete) {        
        athleteId = urlAthlete
        console.log("using athlete from URL", urlAthlete)
    } else {
        athleteId = athleteId.id
    }
    let segmentBests = await common.rpc.getSegmentResults(id, {athleteId: athleteId, from: Date.now() - 86400000 * 90,})
    if (segmentBests) {
        return segmentBests;
    }
    else {
        return [];
    }
}

async function getCourseSegments(courseId) {
    [worldList, segmentsList] = await Promise.all([common.getWorldList(), common.rpc.getSegments(courseId)]);    
    segmentsList = Array.from(segmentsList).sort((a, b) => a.name < b.name ? -1 : 1); 
    segmentsList = segmentsList.filter(x => x.distance > 50 && !x.name.toLowerCase().includes("loop") && x.roadStart !== x.roadFinish && !x.name.toLowerCase().includes("crit") && !x.name.toLowerCase().includes("uci"))    // get rid of invalid short segments and looped segments
    return [worldList,segmentsList];
}

async function applyCourse() {
    //console.log("applying course")    
    if (courseId != null) {
        url.searchParams.set('course', courseId);
    } else {
        url.searchParams.delete('course');
    }
    history.replaceState({}, '', url);
    courseSelect.replaceChildren();
    for (const x of worldList) {
        courseSelect.insertAdjacentHTML('beforeend', `
            <option ${x.courseId === courseId ? 'selected' : ''}
                    value="${x.courseId}">${common.stripHTML(x.name)}</option>`);
    }
    if (courseId != null) {
        await zwiftMap.setCourse(courseId);
        if (elProfile) {
            await elProfile.setCourse(courseId);
        }
    }     
    document.getElementById("segmentInfo").innerHTML = ""
    document.getElementById("athleteTimes").innerHTML = ""
}


export async function main() {
    common.initInteractionListeners();
    common.setBackground(settings);
    segmentSelect.addEventListener('change', async ev => {        
        segmentId = BigInt(segmentSelect.value);
        await applySegment();
    });
    courseSelect.addEventListener('change', async ev => {
        const id = Number(courseSelect.value);
        if (id === courseId) {
            console.debug("debounce course change");
            return;
        }
        courseId = id;
        segmentId = undefined;
        [worldList, segmentsList] = await getCourseSegments(courseId)
        elProfile.clear();
        await applyCourse();        
        await applySegment();
        
    });  
    
    [worldList, segmentsList] = await getCourseSegments(courseId)
    
    zwiftMap = createZwiftMap();
    window.zwiftMap = zwiftMap;  // DEBUG
    window.MapEntity = map.MapEntity;
    if (settings.profileOverlay) {
        const point = zwiftMap.addPoint([0, 0], 'circle');
        point.toggleHidden(true);
        elProfile = createElevationProfile();
        elProfile.chart.on('updateAxisPointer', ev => {
            const pos = elProfile.curvePath.nodes[ev.dataIndex]?.end;
            point.toggleHidden(!pos);
            if (pos) {
                point.setPosition(pos);
            }
        });
    };    
    if (courseId != null) {
        if (!settings.showMap) {            
            document.getElementById("mapDiv").style.visibility = "hidden"
        }
        doc.classList.add('explore');
        doc.querySelector('#titlebar').classList.add('always-visible');
        zwiftMap.setZoom(0.3);
        zwiftMap.setTiltShift(0);
        zwiftMap.setVerticalOffset(0);
        zwiftMap._mapTransition.setDuration(500);
        await applyCourse();       
        await applySegment();
        
    } else {
        let settingsSaveTimeout;        
        zwiftMap.addEventListener('zoom', ev => {
            clearTimeout(settingsSaveTimeout);
            settings.zoom = Number(ev.zoom.toFixed(2));
            settingsSaveTimeout = setTimeout(() => common.settingsStore.set(null, settings), 100);
        });
        await initialize();
        
        setInterval(() => {
            if (inGame && performance.now() - watchdog > 10000) {
                console.warn("Watchdog triggered by inactivity");
                inGame = false;
                initialize();
            }
        }, 3333);
        
        if (settings.zoomCenter) {
            centerMap(zwiftMap.route.curvePath.flatten(1/3))
        }
    }
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        //console.log(changed);
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {
            setBackground();
        } else if (changed.has('profileHeight')) {
            if (elProfile) {
                elProfile.el.style.setProperty('--profile-height', changed.get('profileHeight') / 100);
                elProfile.chart.resize();
            }
        } else if (changed.has('profileOverlay') || 
                        changed.has('fields') ||
                        changed.has('routeProfile') || 
                        changed.has('showElevationMaxLine') || 
                        changed.has('showSegmentStart') || 
                        changed.has('showLapMarker') ||
                        changed.has('showLoopSegments') ||
                        //changed.has('pinSize') ||
                        changed.has('lineType') ||
                        changed.has('lineTypeFinish') ||
                        changed.has('lineSize') || 
                        changed.has('lineTextColor') ||
                        changed.has('showSegmentFinish') ||
                        changed.has('minSegmentLength') ||
                        changed.has('fontScale')||
                        //changed.has('overrideDistance') ||
                        changed.has('overrideLaps') ||
                        changed.has('yAxisMin') ||
                        changed.has('colorScheme') ||
                        changed.has('showMap') ||
                        changed.has('gradientOpacity') ||
                        changed.has('showAllArches')
                    )
                {
                    //console.log(changed);
                    location.reload();
        } else if(changed.has('pinSize'))
        {   
            elProfile.pinSize = changed.get('pinSize');            
        } else if (changed.has('pinColor'))
        {
            //console.log(changed)
            elProfile.pinColor = changed.get('pinColor');
        } else if (changed.has('showNextSegment'))
        {
            elProfile.showNextSegment = changed.get('showNextSegment')
        } else if (changed.has('showOnlyMyPin'))
        {
            //console.log(changed);            
            elProfile.showOnlyMyPin = changed.get('showOnlyMyPin')
        } else if (changed.has('zoomSlider')) {
            elProfile.zoomSlider = changed.get('zoomSlider')
        } else if (changed.has('overrideDistance')) {
            elProfile.overrideDistance = changed.get('overrideDistnace')
            applySegment();
        } 
    });
    
}


export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
