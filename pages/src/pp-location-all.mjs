import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './elevation-segments.mjs';
import * as map from '/pages/src/map.mjs';


let activePPs = [];
let ppIndex = 0;
let debounceTimer;
let timer;
let mapTimer;
let routeTimer;
let courseId = 6;
let courseSelect;
let allPPs;
let ppCourses;
let viewMode = "route";
let routeHighlights = [];
let currentRouteHighlight;
const doc = document.documentElement;
const content = document.getElementById("content");
const elProfiles = document.getElementById("elProfiles")
let mapDiv = document.getElementById("mapDiv");
const mapRouteView = document.getElementById("mapRouteView");
const mapCourses = document.getElementById("mapCourses");
const L = sauce.locale;
const imperial = !!common.storage.get('/imperialUnits');
L.setImperial(imperial);
const worldList = await common.getWorldList();
const routeList = await common.rpc.getRoutes();
common.settingsStore.set("profileHeight", 100)

/*
const warningDiv = document.getElementById("warningDiv");
warningDiv?.addEventListener("click", () => {
    console.log("warningDiv clicked")
});
warningDiv?.querySelector('.close-btn').addEventListener("click", function (e) {
    e.stopPropagation();
    warningDiv.classList.add("hidden");
})
*/
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
    profileHeight: 100,
    routeProfile: true,
    showElevationMaxLine: true,
    autoCenter: true,
    showSegmentStart: true,
    showLapMarker: true,
    fontScale: 1.0,
    showLoopSegments: false,
    pinSize: "1",
    lineType: "solid",
    lineTypeFinish: "[5, 10]",
    lineSize: 1.0,
    pinColor: "#ff430e",
    pinColorTeamMember: "#ff430e",
    pinColorMarked: "#9cb7ec",
    pinColorFollowing: "#ff0080",
    colorPinsByCat: false,
    showSegmentFinish: false,
    minSegmentLength: 500,
    showNextSegment: false,
    showNextSegmentFinish: false,
    showMyPin: true,
    setAthleteSegmentData: true,
    showCompletedLaps: true,
    overrideDistance: 0,
    overrideLaps: 0,
    yAxisMin: 200,
    singleLapView: false,
    profileZoom: false,
    zoomNextSegment: false,
    zoomSegmentOnlyWithinApproach: false,
    zoomNextSegmentApproach: 100,
    zoomFinalKm: false,
    zoomSlider: false,
    forwardDistance: 5000,
    behindDistance: 500,
    showTeamMembers: false,
    showMarkedRiders: false,
    showFollowing: false,
    showAllRiders: true,
    colorScheme: "sauce",
    lineTextColor: "#ffffff",
    showRobopacers: false,
    showRobopacersGap: false,
    showLeaderSweep: false,
    gradientOpacity: 0.7,
    pinName: "Default",
    useCustomPin: false,
    showAllArches: false,
    showGroups: false,
    showLineAhead: false,
    distanceAhead: 1000,
    aheadLineColor: "#ff8000",
    aheadLineType: "solid",
    showNextPowerup: false,
    disablePenRouting: false,
    zoomRemainingRoute: false,
    dataTransparency: 0.8,
    showCurrentAltitude: false,
    showRouteMaxElevation: false,
    showXaxis: false,
    xAxisIncrements: 0,
    xAxisInverse: false,
    teamMemberFilter: "",
    showEmphasisRiders: false,
    emphasisRiders: "",
    showDistanceGap: true,
    showTimeGap: true,
    emphasisOpacity: 0.5,
    minRange: 0,
    maxRange: 6
});

const settings = common.settingsStore.get();
doc.style.setProperty('--dataTransparency', common.settingsStore.get('dataTransparency'));

let watchdog;
let inGame;
let zwiftMap;
let elProfile;
let routeSegments = [];
let zwiftSegmentsRequireStartEnd;
let zwiftIgnoreSegments;
let currentRoute;
let allRoutes;
/*
function arraysEqual(arr1, arr2) {
    if (arr1 && arr2)
    {
        return arr1.every((value, index) => value === arr2[index]);
    }
}  
*/
function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}
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
    /*
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
    */
    return zm;
}

function createElevationProfile({worldList}, divId) {
    //const el = document.querySelector('.elevation-profile');
    const el = document.getElementById(divId);
    //debugger
    if (settings.profileHeight) {
        el.style.setProperty('--profile-height', settings.profileHeight / 100);
    }
    if (settings.editedSegments && settings.editedSegments.length > 0) {
        common.settingsStore.set("editedSegments", null)
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
    typeof(settings.showFollowing) == "undefined" ? common.settingsStore.set("showFollowing", false) : null;
    const showFollowing = settings.showFollowing;
    typeof(settings.pinColorTeamMember) == "undefined" ? common.settingsStore.set("pinColorTeamMember", pinColor) : null;
    const pinColorTeamMember = settings.pinColorTeamMember;
    typeof(settings.colorPinsByCat) == "undefined" ? common.settingsStore.set("colorPinsByCat", false) : null;
    const colorPinsByCat = settings.colorPinsByCat;
    const showSegmentFinish = settings.showSegmentFinish !== false;
    typeof(settings.showAllArches) == "undefined" ? common.settingsStore.set("showAllArches", false) : null;
    const showAllArches = settings.showAllArches;
    const minSegmentLength = settings.minSegmentLength ? settings.minSegmentLength : 500;
    const showNextSegment = false;    
    const setAthleteSegmentData = false;
    typeof(settings.showCompletedLaps) == "undefined" ? common.settingsStore.set("showCompletedLaps", false) : null;
    const showCompletedLaps = false;  
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
    typeof(settings.zoomSegmentOnlyWithinApproach) == "undefined" ? common.settingsStore.set("zoomSegmentOnlyWithinApproach", false) : null;
    const zoomSegmentOnlyWithinApproach = settings.zoomSegmentOnlyWithinApproach;
    typeof(settings.zoomNextSegmentApproach) == "undefined" ? common.settingsStore.set("zoomNextSegmentApproach", 100) : null;
    const zoomNextSegmentApproach = settings.zoomNextSegmentApproach;
    typeof(settings.zoomFinalKm) == "undefined" ? common.settingsStore.set("zoomFinalKm", false) : null;
    const zoomFinalKm = settings.zoomFinalKm;
    typeof(settings.zoomSlider) == "undefined" ? common.settingsStore.set("zoomSlider", false) : null;
    const zoomSlider = settings.zoomSlider;
    typeof(settings.forwardDistance) == "undefined" ? common.settingsStore.set("forwardDistance", 5000) : null;
    const forwardDistance = settings.forwardDistance;
    typeof(settings.behindDistance) == "undefined" ? common.settingsStore.set("behindDistance", 500) : null;
    const behindDistance = settings.behindDistance;
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
    typeof(settings.showRobopacersGap) == "undefined" ? common.settingsStore.set("showRobopacersGap", false) : null;
    const showRobopacersGap = settings.showRobopacersGap;
    typeof(settings.showLeaderSweep) == "undefined" ? common.settingsStore.set("showLeaderSweep", false) : null;
    const showLeaderSweep = settings.showLeaderSweep;
    typeof(settings.pinColorMarked) == "undefined" ? common.settingsStore.set("pinColorMarked", "#9cb7ec") : null;
    const pinColorMarked = settings.pinColorMarked;
    typeof(settings.pinColorFollowing) == "undefined" ? common.settingsStore.set("pinColorFollowing", "#ff0080") : null;
    const pinColorFollowing = settings.pinColorFollowing;
    typeof(settings.colorScheme) == "undefined" ? common.settingsStore.set("colorScheme", "sauce") : null
    const colorScheme = settings.colorScheme;typeof(settings.lineTextColor) == "undefined" ? common.settingsStore.set("lineTextColor", "#ffffff") : null;
    const lineTextColor = settings.lineTextColor;
    typeof(settings.gradientOpacity) == "undefined" ? common.settingsStore.set("gradientOpacity", 0.7) : null;
    const gradientOpacity = settings.gradientOpacity;
    typeof(settings.pinName) == "undefined" ? common.settingsStore.set("pinName", "Default") : null;
    const pinName = settings.pinName;
    typeof(settings.useCustomPin) == "undefined" ? common.settingsStore.set("useCustomPin", false) : null;
    const useCustomPin = settings.useCustomPin;
    typeof(settings.customPin) == "undefined" ? common.settingsStore.set("customPin", "") : null;
    const customPin = settings.customPin;
    typeof(settings.showGroups) == "undefined" ? common.settingsStore.set("showGroups", false) : null;
    const showGroups = settings.showGroups;
    typeof(settings.showLineAhead) == "undefined" ? common.settingsStore.set("showLineAhead", false) : null;
    const showLineAhead = settings.showLineAhead;
    typeof(settings.distanceAhead) == "undefined" ? common.settingsStore.set("distanceAhead", 1000) : null;
    const distanceAhead = settings.distanceAhead;
    typeof(settings.aheadLineColor) == "undefined" ? common.settingsStore.set("aheadLineColor", "#ff8000") : null;
    const aheadLineColor = settings.aheadLineColor;
    typeof(settings.aheadLineType) == "undefined" ? common.settingsStore.set("aheadLineType", 'solid') : null;
    const aheadLineType = settings.aheadLineType;
    typeof(settings.showNextPowerup) == "undefined" ? common.settingsStore.set("showNextPowerup", false) : null;
    const showNextPowerup = settings.showNextPowerup;
    typeof(settings.disablePenRouting) == "undefined" ? common.settingsStore.set("disablePenRouting", false) : null;
    const disablePenRouting = settings.disablePenRouting;
    typeof(settings.zoomRemainingRoute) == "undefined" ? common.settingsStore.set("zoomRemainingRoute", false) : null;
    const zoomRemainingRoute = settings.zoomRemainingRoute;
    typeof(settings.dataTransparency) == "undefined" ? common.settingsStore.set("dataTransparency", 0.8) : null;
    typeof(settings.showCurrentAltitude) == "undefined" ? common.settingsStore.set("showCurrentAltitude", false) : null;
    const showCurrentAltitude = settings.showCurrentAltitude;
    typeof(settings.showRouteMaxElevation) == "undefined" ? common.settingsStore.set("showRouteMaxElevation", false) : null;
    const showRouteMaxElevation = settings.showRouteMaxElevation;
    typeof(settings.showXaxis) == "undefined" ? common.settingsStore.set("showXaxis", false) : null;
    const showXaxis = settings.showXaxis;
    typeof(settings.xAxisIncrements) == "undefined" ? common.settingsStore.set("xAxisIncrements", 0) : null;
    const xAxisIncrements = settings.xAxisIncrements
    typeof(settings.xAxisInverse) == "undefined" ? common.settingsStore.set("xAxisInverse", false) : null;
    const xAxisInverse = settings.xAxisInverse
    typeof(settings.showNextSegmentFinish) == "undefined" ? common.settingsStore.set("showNextSegmentFinish", false) : null;
    const showNextSegmentFinish = false;
    typeof(settings.invertSegmentText) == "undefined" ? common.settingsStore.set("invertSegmentText", "false") : null;
    const invertSegmentText = settings.invertSegmentText;
    typeof(settings.invertSegmentBool) == "undefined" ? common.settingsStore.set("invertSegmentBool", false) : null;
    const invertSegmentBool = settings.invertSegmentBool;
    const teamMemberFilter = settings.teamMemberFilter || "";
    const showDistanceGap = settings.showDistanceGap || false;
    const showTimeGap = settings.showTimeGap || false;
    const emphasisRiders = settings.emphasisRiders || "";
    typeof(settings.showEmphasisRiders) == "undefined" ? common.settingsStore.set("showEmphasisRiders", false) : null;
    const showEmphasisRiders = settings.showEmphasisRiders;
    typeof(settings.emphasisOpacity) == "undefined" ? common.settingsStore.set("emphasisOpacity", 0.5) : null;
    const emphasisOpacity = settings.emphasisOpacity;
    typeof(settings.minRange) === "undefined" ? common.settingsStore.set("minRange", 0) : null;
    const minRange = settings.minRange;
    typeof(settings.maxRange) === "undefined" ? common.settingsStore.set("maxRange", 6) : null;
    const maxRange = settings.maxRange;
    const options = {
        el,
        worldList,
        preferRoute,
        showMaxLine,
        showLapMarker,
        showSegmentStart,
        showLoopSegments,
        pinSize,
        lineType,
        lineTypeFinish,
        lineSize,
        pinColor,
        showSegmentFinish,
        minSegmentLength,
        showNextSegment,
        showNextSegmentFinish,
        showMyPin,
        setAthleteSegmentData,
        showCompletedLaps,
        overrideDistance,
        overrideLaps,
        yAxisMin,
        singleLapView,
        profileZoom,
        forwardDistance,
        behindDistance,
        showTeamMembers,
        showMarkedRiders,
        showFollowing,
        pinColorMarked,
        pinColorFollowing,
        showAllRiders,
        colorScheme,
        lineTextColor,
        showRobopacers,
        showRobopacersGap,
        showLeaderSweep,
        gradientOpacity,
        zoomNextSegment,
        zoomNextSegmentApproach,
        zoomFinalKm,
        zoomSlider,
        pinName,
        useCustomPin,
        customPin,
        zoomSegmentOnlyWithinApproach,
        showAllArches,
        showGroups,
        showLineAhead,
        distanceAhead,
        aheadLineColor,
        aheadLineType,
        showNextPowerup,
        disablePenRouting,
        zoomRemainingRoute,
        showCurrentAltitude,
        showRouteMaxElevation,
        showXaxis,
        xAxisIncrements,
        xAxisInverse,
        invertSegmentBool,
        pinColorTeamMember,
        colorPinsByCat,
        teamMemberFilter,
        emphasisRiders,
        showEmphasisRiders,
        showDistanceGap,
        showTimeGap,
        emphasisOpacity
    };

    //return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showNextSegmentFinish, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, behindDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showRobopacersGap, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, pinName, useCustomPin, customPin, zoomSegmentOnlyWithinApproach, showAllArches, showGroups, showLineAhead, distanceAhead, aheadLineColor, aheadLineType, showNextPowerup, disablePenRouting, zoomRemainingRoute, showCurrentAltitude, showRouteMaxElevation, showXaxis, xAxisIncrements, xAxisInverse, invertSegmentBool, pinColorTeamMember, colorPinsByCat});
    return new elevation.SauceElevationProfile(options);
}


function setWatching(id) {
    console.info("Now watching:", id);
    elProfile.setWatching(id);
    if (elProfile) {
        elProfile.setWatching(id);
    }
}
function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
    //doc.style.setProperty('--profile-height', 1);
}

async function initialize() {
    zwiftMap = createZwiftMap();
    allPPs = await common.rpc.getOnlinePacerBots();
    allPPs.sort((a,b) => a.wkg - b.wkg);
    ppCourses = Map.groupBy(allPPs, x => x.courseId);
    await updateCourses(ppCourses);
    courseSelect = document.getElementById("courseSelect");
    courseId = parseInt(courseSelect.value);
    await setupMapView();    
    await setupRouteView();    
    changePPView();
    
}
//function renderPPlocation(athleteId, elProfile, ppName) {
function renderPPlocation(pp) {
    let state = [];
    let ppState = common.rpc.getPlayerState(pp.athleteId); 
    let elProfile = pp.elProfile; 
    //debugger
    const ppWkg = `${pp.wkg.toFixed(1)} w/kg`
    ppState.then(result => {
        state.push(result);    
        elProfile.watchingId = pp.athleteId;  
        elProfile.renderAthleteStates(state);
        let routeInfo = elProfile.routeInfo.routeFullData 
        let routeTitle = `${pp.fullName} ${ppWkg} (${state[0].pacerBotGroupSize}) on ${routeInfo.name}`
        //debugger
        const routeTitleData = {
            title: {
                show: true,
                top: '10%',
                text: routeTitle,                
                textStyle: {                    
                    fontSize: elProfile.em(0.3 * elProfile.fontScale),
                },
            },
        };
        elProfile.chart.setOption(routeTitleData)
    });    
}
async function setupRouteView() {
    const selectedView = document.querySelector('input[name="ppView"]:checked');       
    
    if (selectedView?.value === "map") {
        viewMode = "map";
    }
    activePPs = allPPs.filter(x => x.wkg.toFixed(1) >= settings.minRange && x.wkg.toFixed(1) <= settings.maxRange);
    for (let pp of allPPs) {
        const fullName = `${pp.firstName.replaceAll(' ', '')}.${pp.lastName.replaceAll(' ', '')}`;
        pp.fullName = fullName;
        const ppRoute = routeList.find(x => x.id === pp.routeId);
        pp.routeName = ppRoute?.name || "Unknown route";
        
    }
    document.querySelectorAll(".pp-location").forEach(el => el.remove());
    for (let pp of allPPs) {
        //debugger
        const newElDiv = `<div id=${pp.fullName} class="pp-location ${viewMode === "map" || 
            (pp.wkg.toFixed(1) < settings.minRange || pp.wkg.toFixed(1) > settings.maxRange) ? 'hidden' : ''}" data-wkg="${pp.wkg}"></div>`
        elProfiles.innerHTML += newElDiv;
        //debugger
    }
    for (let pp of allPPs) {
        //debugger
        const elProfilePP = settings.profileOverlay && createElevationProfile({worldList}, pp.fullName);
        
        await elProfilePP.setCourse(pp.courseId);
        let newRouteId = pp.routeId;
        if (pp.routeId <= 0) {
            newRouteId = pp.routeId >>> 0;
        }
        //let routeInfo = await common.getRoute(newRouteId);
        let routeInfo = routeList.find(x => x.id === newRouteId);
        await elProfilePP.setRoute(newRouteId);
        const routeTitle = {
            title: {
                show: true,
                top: '10%',
                text: routeInfo.name,                
                textStyle: {                    
                    fontSize: elProfilePP.em(0.3 * elProfilePP.fontScale),
                },
            },
        };
        elProfilePP.chart.setOption(routeTitle)
        pp.elProfile = elProfilePP;
        //renderPPlocation(pp.athleteId, elProfilePP, pp.fullName)
        renderPPlocation(pp);
    }

}
async function setupMapView() {
    //debugger
    const selectedView = document.querySelector('input[name="ppView"]:checked');       
    
    if (selectedView?.value === "map") {
        viewMode = "map";
    } else {
        viewMode = "route";
    }
    await zwiftMap.setZoom(0.2);
    await zwiftMap.setCourse(courseId);
    if (viewMode === "map") {
        document.getElementById("mapDiv")?.classList.remove("hidden");
    } else {
        document.getElementById("mapDiv")?.classList.add("hidden");
    }
}

async function changePPView() {
    const initialView = viewMode;
    const selectedView = document.querySelector('input[name="ppView"]:checked');       
    
    viewMode = selectedView?.value === "map" ? "map" : "route";
    if (viewMode === "route") {
        console.log("Route view selected")
        document.getElementById("mapDiv")?.classList.add("hidden");
        
        document.querySelectorAll(".pp-location").forEach(el => {
            if (el.dataset.wkg >= settings.minRange && el.dataset.wkg <= settings.maxRange) {
                el.classList.remove("hidden")
            }
        });
        clearInterval(routeTimer);
        clearInterval(mapTimer);
        if (initialView != "route") {
            for (let pp of activePPs) {
                renderPPlocation(pp);
            }
        }
        routeTimer = setInterval(function() {
            console.log("Updating: " + activePPs[ppIndex].fullName);
            //renderPPlocation(activePPs[ppIndex].athleteId, activePPs[ppIndex].elProfile, activePPs[ppIndex].fullName);    
            renderPPlocation(activePPs[ppIndex]);
            if (ppIndex < activePPs.length - 1) {        
                ppIndex++;            
            } else {
                ppIndex = 0;
            }  
        }, 4000); 
    } else {
        console.log("Map view selected")        
        clearInterval(routeTimer);
        clearInterval(mapTimer);
        document.querySelectorAll(".pp-location").forEach(el => el.classList.add("hidden"));
        await zwiftMap.setCourse(courseId);
        zwiftMap.setZoom(0.2);        
        document.getElementById("mapDiv")?.classList.remove("hidden");
        await updatePPmap();
        
        
        mapTimer = setInterval(async function() {            
            await updatePPmap();
        }, 3000);
        //debugger
    }
    
};
async function updateCourses(ppCourses) {
    
    //debugger
    let courseSelectOutput = `<select id="courseSelect">`
    ppCourses.forEach(course =>  {
        const thisCourse = worldList.find(x => x.courseId === course[0].courseId)
        courseSelectOutput += `<option value="${thisCourse.courseId}">${thisCourse.name}</option>`
    });

    courseSelectOutput += `</select>`
    mapCourses.innerHTML = courseSelectOutput
    courseSelect = document.getElementById("courseSelect");
    courseSelect.addEventListener("change", async () => {
        courseId = parseInt(courseSelect.value);
        await updatePPmap();
    });
}
async function updatePPmap() {
    console.log("Updating locations")
    
    const mapPPs = await common.rpc.getOnlinePacerBots();
    const ppCourses = Map.groupBy(mapPPs, x => x.courseId);
    //debugger
    if (!ppCourses.get(courseId)) {
        updateCourses(ppCourses);
        courseSelect = document.getElementById("courseSelect");
        courseId = parseInt(courseSelect.value);
        await changePPView();
    }
    
    const coursePPs = ppCourses.get(courseId)
    //debugger
   
   //activePPs = allPPs.filter(x => x.wkg.toFixed(1) >= settings.minRange && x.wkg.toFixed(1) <= settings.maxRange);
   
    const activeMapPPs = coursePPs.filter(x => x.wkg.toFixed(1) >= settings.minRange && x.wkg.toFixed(1) <= settings.maxRange);
    //activePPs = allPPs.filter(x => x.wkg.toFixed(1) >= settings.minRange && x.wkg.toFixed(1) <= settings.maxRange);
    for (let pp of activeMapPPs) {
        const fullName = `${pp.firstName.replaceAll(' ', '')}.${pp.lastName.replaceAll(' ', '')}`;
        pp.fullName = fullName;
        const ppRoute = routeList.find(x => x.id === pp.routeId);
        pp.routeName = ppRoute?.name || "Unknown route";
        
    }
    zwiftMap._ents.forEach(x => x.togglePin());
    zwiftMap._ents.clear();
    document.querySelectorAll(".ppMarker").forEach(pp => pp.remove());
    for (let pp of activeMapPPs) {
        let point;
        if (zwiftMap.rotateCoordinates) {
            //point = [pp.y * -1, pp.x]
            point = [pp.x, pp.y]
        } else {
            point = [pp.x, pp.y]
        };
        //debugger
        let ppPoint = zwiftMap.addPoint(point, "ppMarker");
        const ppHTML = `<div class="ppData" data-routeId="${pp.routeId}">${pp.fullName} ${pp.wkg.toFixed(1)} W/kg<br>${pp.routeName}<br>Group size: ${pp.pacerBotGroupSize}</div>`
        ppPoint.setPinHTML(ppHTML);
        ppPoint.togglePin()
        
    }
    document.querySelectorAll(".pin-content").forEach(pin => pin.addEventListener("mouseenter", (e) => {
            const ppData = [...e.target.children].find(pin => pin.classList.contains("ppData"))
            const thisRouteId = ppData.dataset.routeid;
            const ppEl = allPPs.find(x => x.elProfile?.routeId == thisRouteId);
            const path = ppEl.elProfile.curvePath;
            if (currentRouteHighlight != thisRouteId) {
                routeHighlights.push(
                    zwiftMap.addHighlightPath(path, `route-1-${thisRouteId}`, {width: 5, color: '#0004'}),
                    zwiftMap.addHighlightPath(path, `route-2-${thisRouteId}`, {width: 1.2, color: 'black'}),
                    zwiftMap.addHighlightPath(path, `route-3-${thisRouteId}`, {width: 0.5, color: 'gold'})
                );
                currentRouteHighlight = thisRouteId;
            }
        })
    );
    document.querySelectorAll(".pin-content").forEach(pin => pin.addEventListener("mouseleave", (e) => {
        while (routeHighlights.length) {
            routeHighlights.pop().elements.forEach(x => x.remove());
        }
    }));
}
export async function main() {
    changeFontScale();

    common.initInteractionListeners();       
    mapRouteView.addEventListener("change", async function () {
        await changePPView()
    });
    
    try {
        allPPs = await common.rpc.getOnlinePacerBots();
        /*
        activePPs = allPPs.filter(x => 
            (settings.show1x && x.wkg < 2.0) ||
            (settings.show2x && x.wkg >= 2.0 && x.wkg < 3.0) ||
            (settings.show3x && x.wkg >= 3.0)
        );
        */
       //debugger
        activePPs = allPPs.filter(x => x.wkg >= settings.minRange && x.wkg <= settings.maxRange);
        activePPs.sort((a,b) => a.wkg - b.wkg)
        for (let pp of activePPs) {
            const fullName = `${pp.firstName.replaceAll(' ', '')}.${pp.lastName.replaceAll(' ', '')}`;
            pp.fullName = fullName;
        }
    } catch (err) {
        console.warn("getOnlinePacerBots() requires Sauce v2.4.0-alpha4 or later")
        elProfiles.innerHTML = `This window requires Sauce v2.4.0-alpha4 or later. &#x1F61E;`
    }
    console.log("activePPs", activePPs)
    
    initialize();
    //await changePPView();
    
    
    
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        const debounceSettings = [
            "minSegmentLength",
            "gradientOpacity",
            "fontScale",
            "lineSize",
            "yAxisMin",
            "minRange",
            "maxRange"
        ]
        
        let reloadRequired = true;
        debounceSettings.forEach(setting => {            
            if (changed.has(setting)) {
                reloadRequired = false;
            }
        })
        if (reloadRequired) {
            location.reload();
        } else {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                location.reload();
            }, 1000)
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}

setBackground();
