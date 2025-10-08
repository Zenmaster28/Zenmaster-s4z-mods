import * as common from '/pages/src/common.mjs';
import * as map from './map.mjs';
import * as elevation from './elevation-segments.mjs';
import * as fields from '/pages/src/fields.mjs';
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
    showAllArches: false
});

const settings = common.settingsStore.get();
const url = new URL(location);
const courseSelect = document.querySelector('#titlebar select[name="course"]');
const routeSelect = document.querySelector('#titlebar select[name="route"]');
const lapsSelect = document.getElementById("laps");
const distanceSelect = document.getElementById("customDistance")
const eventsListDiv = document.getElementById("eventsList");
const eventIdDiv = document.getElementById("eventId");
const penListDiv = document.getElementById('penList');
const demoState = {};

let worldList;
let routesList;
let portalClimbs = [];
let watchdog;
let inGame;
let zwiftMap;
let elProfile;
let courseId = Number(url.searchParams.get('course')) || 6;
let routeId = Number(url.searchParams.get('route')) || undefined;
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
    const autoCenterBtn = document.querySelector('.map-controls .button.toggle-auto-center');
    const autoHeadingBtn = document.querySelector('.map-controls .button.toggle-auto-heading');

    function autoCenterHandler(en) {
        if (en) {
            zm.setDragOffset([0, 0]);
        }
        zm.setAutoCenter(en);
        zm.setAutoHeading(!en ? false : !!settings.autoHeading);
        autoCenterBtn.classList.toggle('primary', !!en);
        autoCenterBtn.classList.remove('outline');
        autoHeadingBtn.classList.toggle('disabled', !en);
        settings.autoCenter = en;
        common.settingsStore.set(null, settings);
    }

    function autoHeadingHandler(en) {
        zm.setAutoHeading(en);
        if (en) {
            zm.setHeadingOffset(0);
        }
        autoHeadingBtn.classList.remove('outline');
        autoHeadingBtn.classList.toggle('primary', !!en);
        settings.autoHeading = en;
        common.settingsStore.set(null, settings);
    }

    autoCenterBtn.classList.toggle('primary', settings.autoCenter !== false);
    autoCenterBtn.addEventListener('click', () =>
        autoCenterHandler(!autoCenterBtn.classList.contains('primary')));
    autoHeadingBtn.classList.toggle('disabled', settings.autoCenter === false);
    autoHeadingBtn.classList.toggle('primary', settings.autoHeading !== false);
    autoHeadingBtn.addEventListener('click', () =>
        autoHeadingHandler(!autoHeadingBtn.classList.contains('primary')));

    zm.addEventListener('drag', ev => {
        if (ev.drag) {
            const dragging = !!(ev.drag && (ev.drag[0] || ev.drag[1]));
            if (dragging && settings.autoCenter !== false) {
                autoCenterBtn.classList.remove('primary');
                autoCenterBtn.classList.add('outline');
            }
        } else if (ev.heading) {
            if (autoHeadingBtn.classList.contains('primary')) {
                autoHeadingBtn.classList.remove('primary');
                autoHeadingBtn.classList.add('outline');
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
    typeof(settings.disablePenRouting) == "undefined" ? common.settingsStore.set("disablePenRouting", false) : null;
    const disablePenRouting = settings.disablePenRouting;
    typeof(settings.showXaxis) == "undefined" ? common.settingsStore.set("showXaxis", false) : null;
    const showXaxis = settings.showXaxis;
    typeof(settings.xAxisIncrements) == "undefined" ? common.settingsStore.set("xAxisIncrements", 0) : null;
    const xAxisIncrements = settings.xAxisIncrements;
    typeof(settings.xAxisInverse) == "undefined" ? common.settingsStore.set("xAxisInverse", false) : null;
    const xAxisInverse = settings.xAxisInverse;
    typeof(settings.invertSegmentText) == "undefined" ? common.settingsStore.set("invertSegmentText", "false") : null;
    const invertSegmentText = settings.invertSegmentText;
    typeof(settings.invertSegmentBool) == "undefined" ? common.settingsStore.set("invertSegmentBool", false) : null;
    const invertSegmentBool = settings.invertSegmentBool;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, showAllArches, disablePenRouting, showXaxis, xAxisIncrements, xAxisInverse, invertSegmentBool});
    //return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, colorScheme, showSegmentStart});
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
async function applyRoute() {
    //console.log("applying route")
    //console.log("zoomCenter is " + zoomCenter)
    if (routeId != null) {
        url.searchParams.set('route', routeId);
    } else {
        url.searchParams.delete('route');
    }
    history.replaceState({}, '', url);
    while (_routeHighlights.length) {
        _routeHighlights.pop().elements.forEach(x => x.remove());
    }
    routeSelect.replaceChildren();
    const isPortal = courseId == 999 ? true : false;
    if (!isPortal) {
        routeSelect.insertAdjacentHTML('beforeend', `<option value disabled selected>Routes (${routesList.filter(x => x.courseId == courseId).length})</option>`);  
    } else {
        routeSelect.insertAdjacentHTML('beforeend', `<option value disabled selected>Climbs (${portalClimbs.length})</option>`);  
    }
    //console.log(routesList)  
    for (const x of routesList) {
        if (x.courseId !== courseId) {
            continue;
        }
        routeSelect.insertAdjacentHTML('beforeend', `
            <option ${x.id === routeId ? 'selected' : ''}
                    value="${x.id}">${common.stripHTML(x.name)} 
                    (${common.stripHTML(((x.distanceInMeters + (x.leadinDistanceInMeters ?? 0)) / 1000).toFixed(1))}km / 
                    ${common.stripHTML((x.ascentInMeters + (x.leadinAscentInMeters ?? 0)).toFixed(0))}m)</option>`);
    }
    
    if (isPortal) {
        portalClimbs.sort((a, b) => a.portalName > b.portalName)
        for (let portal of portalClimbs) {
            routeSelect.insertAdjacentHTML('beforeend', `<option ${portal.id === routeId ? 'selected' : ''} 
                value="${portal.id}"> ${portal.portalName}</option>`);
        }
    }
    if (routeId != null) { 
        //const route = await zen.getModifiedRoute(routeId, elProfile.disablePenRouting);
        
        if (elProfile && !isPortal) {
            if (settings.overrideDistance > 0 || settings.overrideLaps > 0) {
                await elProfile.setRoute(+routeId, {laps: settings.overrideLaps, eventSubgroupId: -1, distance: settings.overrideDistance})                
            } else {
                await elProfile.setRoute(+routeId, {eventSubgroupId: -1});
            }
        } else if (isPortal) {
            const portalRoad = await common.getRoad('portal', routeId);
            await elProfile.setSegment(portalRoad);
            distanceSelect.value = parseInt(portalRoad.distances.at(-1));
        }
        let path;
        const distance = parseInt(distanceSelect.value) || 0
        //const fullRoute = await zen.processRoute(courseId, routeId, 1, distance, elProfile.showLoopSegments, elProfile.showAllArches, elProfile.disablePenRouting)
        //const route = fullRoute.routeFullData
        let route;
        if (!isPortal) {
            route = elProfile.route
        } else {
            route = await common.getRoad('portal', routeId);
        }
        //debugger
        if (zwiftMap.overrideDistance > 0) {
            let idx = common.binarySearchClosest(route.distances, zwiftMap.overrideDistance)
            path = route.curvePath;
            path.nodes = path.nodes.slice(0, idx + 1)
        } else {
            path = route.curvePath;
            if (parseInt(lapsSelect.value) > 1 && route.lapFiller.curvePath?.nodes?.length > 0) {
                //debugger
                path.extend(route.lapFiller.curvePath)
            }
        }
        //debugger
        _routeHighlights.push(
            zwiftMap.addHighlightPath(path, `route-1-${route.id}`, {width: 5, color: '#0004'}),
            zwiftMap.addHighlightPath(path, `route-2-${route.id}`, {width: 1.2, color: 'black'}),
            zwiftMap.addHighlightPath(path, `route-3-${route.id}`, {width: 0.5, color: 'gold'}),
        );
        centerMap(route.curvePath.flatten(1/3));
        //debugger
        
        if (route.supportedLaps) {
            lapsSelect.disabled = false;
        } else {            
            lapsSelect.disabled = true;
        }
        if (isPortal) {
            lapsSelect.disabled = true;
            distanceSelect.disabled = true;
        } else {
            distanceSelect.disabled = false;
        }
        if (settings.showXaxis) {
            document.getElementById("rightPanel").style.bottom = "30px"
        }
    } else {
        zwiftMap.setVerticalOffset(0);
        zwiftMap.setDragOffset([0, 0]);
        zwiftMap.setZoom(0.3);
        lapsSelect.disabled = false;
        distanceSelect.disabled = false;
        if (elProfile) {
            elProfile.clear();
        }
    }
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
    portalClimbs = await common.getRoads("portal");
    const isPortal = courseId == 999 ? true : false;
    if (portalClimbs[0].portalName) {
        courseSelect.insertAdjacentHTML('beforeend', `<option value="999" ${isPortal ? 'selected' : ''}>Portal Climbs</option>`);
    }
    if (courseId != null) {
        const mapBackground = document.querySelector('.map-background');
        const surfacesLow = document.querySelector(".surfaces.low");
        const gutters = document.querySelector(".gutters");
        if (!isPortal) {
            await zwiftMap.setCourse(courseId);
            mapBackground.style.visibility = "";
            surfacesLow.style.visibility = "";
            gutters.style.visibility = "";
            if (elProfile) {
                await elProfile.setCourse(courseId);
            }
        } else {
            await zwiftMap.setCourse(6);            
            mapBackground.style.visibility = "hidden";
            surfacesLow.style.visibility = "hidden";
            gutters.style.visibility = "hidden";
        }
    }    
}


export async function main() {
    common.initInteractionListeners();
    common.setBackground(settings);
    const fieldsEl = document.querySelector('#content .fields');
    const fieldRenderer = new common.Renderer(fieldsEl, {fps: 1});
    const mapping = [];
    const defaults = {
        f1: 'grade',
        f2: 'altitude',
    };
    const numFields = common.settingsStore.get('fields');
    for (let i = 0; i < (isNaN(numFields) ? 1 : numFields); i++) {
        const id = `f${i + 1}`;
        fieldsEl.insertAdjacentHTML('afterbegin', `
            <div class="field" data-field="${id}">
                <div class="key"></div><div class="value"></div><abbr class="unit"></abbr>
            </div>
        `);
        mapping.push({id, default: defaults[id] || 'time-elapsed'});
    }
    fieldRenderer.addRotatingFields({
        mapping,
        fields: fields.fields.filter(({id}) => {
            const type = id.split('-')[0];
            return ['ev', 'game-laps', 'progress', 'rt', 'el', 'grade', 'altitude'].includes(type);
        })
    });
    routeSelect.addEventListener('change', async ev => {
        routeId = Number(routeSelect.value);
        
        distanceSelect.value = "";
        zwiftMap.overrideLaps = 1;
        elProfile.overrideDistance = 0;
        elProfile.overrideLaps = 1;
        zwiftMap.overrideDistance = 0;
        eventsSelect.value = -1;
        penListDiv.innerHTML = "";
        eventText.value = "";
        lapsSelect.value = 1;        
        common.settingsStore.set("overrideDistance", 0)
        common.settingsStore.set("overrideLaps", 1)
        await applyRoute();
        if (lapsSelect.value > 0 && courseId != 999) {
            distanceSelect.value = parseInt(elProfile.routeDistances.at(-1))
        }
    });
    courseSelect.addEventListener('change', async ev => {
        const id = Number(courseSelect.value);
        if (id === courseId) {
            console.debug("debounce course change");
            return;
        }
        courseId = id;
        routeId = undefined;
        distanceSelect.value = "";
        lapsSelect.value = 1;
        eventsSelect.value = -1;
        penListDiv.innerHTML = "";
        eventText.value = "";
        elProfile.overrideLaps = 1;
        zwiftMap.overrideLaps = 1;
        elProfile.overrideDistance = 0;
        zwiftMap.overrideDistance = 0;
        await applyCourse();
        await applyRoute();
    });
    lapsSelect.addEventListener('change', async ev => {        
        common.settingsStore.set("overrideLaps", lapsSelect.value)
        if (lapsSelect.value >= 1) {
            distanceSelect.value = "";
            common.settingsStore.set("overrideDistance", "")
            zwiftMap.overrideLaps = lapsSelect.value;
            zwiftMap.overrideDistance = null;
            elProfile.overrideLaps = lapsSelect.value;
            elProfile.overrideDistance = null;
        }
        await applyRoute(); 
        distanceSelect.value = parseInt(elProfile.routeDistances.at(-1))
        //debugger      
    });
    distanceSelect.addEventListener('change', async ev => {        
        if (!elProfile.route.supportedLaps && distanceSelect.value > elProfile.route.distances.at(-1)) {   
            if (courseId != 999) {         
                distanceSelect.value = parseInt(elProfile.route.distances.at(-1));
            }
            
        } else {
            common.settingsStore.set("overrideDistance", distanceSelect.value)
            if (distanceSelect.value > 0) {
                lapsSelect.value = "";
                common.settingsStore.set("overrideLaps", "")
                elProfile.overrideDistance = distanceSelect.value;   
                zwiftMap.overrideDistance = distanceSelect.value;  
            }           
            await applyRoute();   
        }     
    });
    [worldList, routesList] = await Promise.all([common.getWorldList(), common.getRouteList()]);
    routesList = Array.from(routesList).sort((a, b) => a.name < b.name ? -1 : 1);
    let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
    newRoutes.forEach(newRoute => {
        const exists = routesList.some(route => route.id === newRoute.id);
        if (!exists) {
            newRoute.courseId = common.worldToCourseIds[newRoute.worldId]
            //console.log("Adding route: " + newRoute.name + " to " + common.worldToNames[newRoute.worldId])            
            routesList.push(newRoute);
        }
    });
    routesList.sort((a, b) => a.name < b.name ? -1 : 1);  
    worldList = worldList.filter(x => x.name)
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
    const allEvents = await common.rpc.getCachedEvents();
    const eventsSelect = document.createElement('select')
    eventsSelect.id = "eventsSelect"
    eventsSelect.style.maxWidth = '17em';
    const optChoose = document.createElement('option')
    optChoose.textContent = "Click to select an event to view";
    optChoose.value = -1;
    eventsSelect.appendChild(optChoose);
    let eventInfo;
    for (let event of allEvents) {
        const eventStartTime = new Date(event.eventStart)
        const opt = document.createElement('option')
        opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
        }) + " - " + event.name;
        opt.value = event.id
        eventsSelect.appendChild(opt)
    }
    eventsListDiv.appendChild(eventsSelect);
    const eventText = document.createElement('input');
    eventText.type = "text";
    eventText.id = "eventText";
    eventText.title = "Enter an event ID (from the URL on Zwiftpower) to find an event not in the list"
    eventText.style.width = "8em"
    eventText.placeholder = "or event ID"
    //eventsListDiv.appendChild(eventText);
    eventIdDiv.appendChild(eventText)
    eventText.addEventListener("change", async function() {
        const eventTextDiv = document.getElementById("eventText");
        let eventIdSearch = eventTextDiv.value;
        if (eventIdSearch != "") {
            eventIdSearch = parseInt(eventIdSearch)
            //const eventDetails = await common.rpc.getEvent(eventIdSearch);
            let eventDetails;
            try {
                eventDetails = await common.rpc.getEvent(eventIdSearch);
                //return await this.fetchJSON(`/api/profiles/${id}`, options);
            } catch(e) {
                console.log("EventId not found", eventIdSearch)                        
            }
            if (eventDetails) {
                const eventStartTime = new Date(eventDetails.eventStart)
                const eventsSelect = document.getElementById("eventsSelect")
                const opt = document.createElement('option')
                opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short'
                }) + " - " + eventDetails.name;
                opt.value = eventDetails.id
                eventsSelect.appendChild(opt)
                eventsSelect.value = eventDetails.id
                const event = new Event('change')
                eventsSelect.dispatchEvent(event)
            }
        }
    });
    eventsSelect.addEventListener('change', async function() {        
        if (this.value != -1) {
            penListDiv.innerHTML = "";
            eventInfo = await common.rpc.getEvent(parseInt(this.value))
            eventInfo.eventSubgroups.sort((a,b) => {
                if (a.subgroupLabel > b.subgroupLabel) return 1;
                if (a.subgroupLabel < b.subgroupLabel) return -1;
                return 0;
            })
            //debugger
            const penSelect = document.createElement('select');
            penSelect.id = "penSelect"
            if (eventInfo) {                
                //console.log(eventInfo)                
                const optText = document.createElement('option');
                optText.textContent = "Select a pen"
                optText.value = -1
                penSelect.appendChild(optText)
                for (let sg of eventInfo.eventSubgroups) {
                    const zrsRange = sg.rangeAccessLabel ? ` (${sg.rangeAccessLabel})` : "";
                    const optPen = document.createElement('option')
                    optPen.value = sg.id;
                    optPen.textContent = sg.subgroupLabel + zrsRange;
                    penSelect.appendChild(optPen)
                }
                penListDiv.appendChild(penSelect)
                //eventsListDiv.appendChild(penSelect)
            }
            penSelect.addEventListener('change', async function() {
                const sg = eventInfo.eventSubgroups.find(x => x.id == this.value)
                if (sg) {                            
                    console.log(sg)
                    courseId = sg.courseId
                    routeId = sg.routeId
                    distanceSelect.value = "";
                    common.settingsStore.set("overrideDistance", "")
                    common.settingsStore.set("overrideLaps", 1)
                    lapsSelect.value = 1;
                    await applyCourse();       
                    await applyRoute();
                    distanceSelect.value = parseInt(elProfile.routeDistances.at(-1))
                    if (sg.distanceInMeters > 0) {
                        //console.log("Applying custom distance", sg.distanceInMeters)
                        distanceSelect.value = sg.distanceInMeters;
                        common.settingsStore.set("overrideDistance", sg.distanceInMeters)
                        zwiftMap.overrideLaps = 1;
                        elProfile.overrideDistance = sg.distanceInMeters;
                        elProfile.overrideLaps = 1;
                        zwiftMap.overrideDistance = sg.overrideDistance;
                        const event = new Event('change')
                        distanceSelect.dispatchEvent(event)
                    } else if (sg.laps > 1) {
                        //console.log("applying laps", sg.laps)
                        lapsSelect.value = sg.laps
                        common.settingsStore.set("overrideLaps", sg.laps)
                        zwiftMap.overrideLaps = sg.laps;
                        elProfile.overrideDistance = 0;
                        elProfile.overrideLaps = sg.laps;
                        zwiftMap.overrideDistance = 0;
                        const event = new Event('change')
                        lapsSelect.dispatchEvent(event)
                        //debugger
                    }
                }
                //debugger
            })
            
        }
    });
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
        lapsSelect.value = settings.overrideLaps || 1;
        distanceSelect.value = settings.overrideDistance || "";        
        await applyCourse();       
        await applyRoute();
        if (lapsSelect.value > 0) {
            distanceSelect.value = parseInt(elProfile.routeDistances.at(-1))
        }
        
    } else {
        let settingsSaveTimeout;        
        zwiftMap.addEventListener('zoom', ev => {
            clearTimeout(settingsSaveTimeout);
            settings.zoom = Number(ev.zoom.toFixed(2));
            settingsSaveTimeout = setTimeout(() => common.settingsStore.set(null, settings), 100);
        });
        await initialize();
        common.subscribe('watching-athlete-change', async athleteId => {
            if (!inGame) {
                await initialize();
            } else {
                setWatching(athleteId);
                
            }
            
        });
        common.subscribe('athlete/watching', ad => {
            fieldRenderer.setData(ad);
            fieldRenderer.render();
            if (ad.state.routeId != currentRoute) {
                if (!currentRoute) {
                    currentRoute = zwiftMap.routeId;
                } else if (settings.zoomCenter) {                    
                    
                    centerMap(zwiftMap.route.curvePath.flatten(1/3))
                    currentRoute = zwiftMap.routeId
                }
            }
        });
        setInterval(() => {
            if (inGame && performance.now() - watchdog > 10000) {
                console.warn("Watchdog triggered by inactivity");
                inGame = false;
                initialize();
            }
        }, 3333);
        common.subscribe('states', async states => {
            if (!inGame) {
                await initialize();
            }
            watchdog = performance.now();
            zwiftMap.renderAthleteStates(states);
            if (elProfile) {
                elProfile.renderAthleteStates(states);
            }
        });
        common.subscribe('chat', chat => {
            if (settings.disableChat) {
                return;
            }
            if (chat.muted) {
                console.debug("Ignoring muted chat message");
                return;
            }
            const ent = zwiftMap.getEntity(chat.from);
            if (ent) {
                ent.addChatMessage(chat);
            }
        });
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
                        changed.has('showAllArches') ||
                        changed.has('disablePenRouting') ||
                        changed.has('showXaxis') ||
                        changed.has('xAxisIncrements') ||
                        changed.has('xAxisInverse')
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
            elProfile.overrideDistance = changed.get('overrideDistance')
            applyRoute();
        } else if (changed.has('invertSegmentText')) {
            const invertBool = changed.get('invertSegmentText') === "true";
            common.settingsStore.set('invertSegmentBool', invertBool);
            location.reload();
        }
    });
    
}


export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
