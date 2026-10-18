import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './elevation-segments.mjs';



let activePPs = [];
let ppIndex = 0;
let debounceTimer;
const doc = document.documentElement;
const content = document.getElementById("content");
const L = sauce.locale;
const imperial = !!common.storage.get('/imperialUnits');
L.setImperial(imperial);
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
    emphasisOpacity: 0.5
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
/*
function qualityScale(raw) {
    raw = raw || 1;
    const min = 0.2;
    return Math.min(2, (raw / 100) * (1 - min) + min);
}

function getSetting(key, def) {
    const v = settings[key];
    return v === undefined ? def : v;
}

function editSegments() { 
           
    let segmentData = elProfile.routeInfo.markLines ? elProfile.routeInfo.markLines.filter(x => !x.name.includes("Finish") || x.type == "custom") : [];
    //let segmentData = elProfile.routeSegments.filter(x => !x.name.includes("Finish"))
    //debugger
    //console.log(segmentData)
    segmentData.sort((a, b) => {
        return a.markLine - b.markLine;
    });     
    let outData = [];
    for (let seg of segmentData) {
        let newSeg = {
            "Name": seg.name,
            "id": seg.id,
            "Repeat": seg.repeat,
            "displayName": seg.displayName ?? null
        }
        outData.push(newSeg)
    }    
    let jsonSegments = JSON.stringify(outData)
    let jsonEncoded = encodeURIComponent(jsonSegments)
    let editWindow = window.open("elevation-edit-segments.html?data=" + jsonEncoded, "_blank");    
}
*/
function createElevationProfile({worldList}, divId) {
    //const el = document.querySelector('.elevation-profile');
    const el = document.getElementById(divId);
    //debugger
    if (settings.profileHeight) {
        //el.style.setProperty('--profile-height', settings.profileHeight / 100);
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


async function initialize() {
    const ad = await common.rpc.getAthleteData('self');
    //const ad = await common.rpc.getAthleteData('watching');
    console.log("Initializing...", ad)
    inGame = !!ad;
    /*
    if (!inGame) {
        console.info("User not active, starting demo mode...");
        elProfile.setCourse(6);
        if (elProfile) {
            elProfile.setCourse(6);
        }
        return;
    }
    
    //zwiftMap.setAthlete(ad.athleteId);
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
        //elProfile.incPause();
        try {
            //await zwiftMap.renderAthleteStates([ad.state]);
        } finally {
            //elProfile.decPause();
        }
        if (elProfile) {                       
            await elProfile.renderAthleteStates([ad.state]);
        }
    }
    */
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


export async function main() {
    common.initInteractionListeners();   
    
    try {
        activePPs = await common.rpc.getOnlinePacerBots();
        activePPs.sort((a,b) => a.wkg - b.wkg)
        for (let pp of activePPs) {
            const fullName = `${pp.firstName.replaceAll(' ', '')}.${pp.lastName.replaceAll(' ', '')}`;
            pp.fullName = fullName;
        }
    } catch (err) {
        console.warn("getOnlinePacerBots() requires Sauce v2.4.0-alpha4 or later")
    }
    console.log("activePPs", activePPs)
    /*
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
            return ['ev', 'game-laps', 'progress', 'rt', 'el', 'grade', 'altitude', 'zl'].includes(type);
        })
    });
    */
    const worldList = await common.getWorldList();   
    const elProfiles = document.getElementById("content")
    for (let pp of activePPs) {
        const newElDiv = `<div id=${pp.fullName} class="pp-location"></div>`
        elProfiles.innerHTML += newElDiv;
        //debugger
    }
    for (let pp of activePPs) {
        //debugger
        const elProfilePP = settings.profileOverlay && createElevationProfile({worldList}, pp.fullName);
        
        await elProfilePP.setCourse(pp.courseId);
        let newRouteId = pp.routeId;
        if (pp.routeId <= 0) {
            newRouteId = pp.routeId >>> 0;
        }
        let routeInfo = await common.getRoute(newRouteId);
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
    let timer = setInterval(function() {
        console.log("Updating: " + activePPs[ppIndex].fullName);
        //renderPPlocation(activePPs[ppIndex].athleteId, activePPs[ppIndex].elProfile, activePPs[ppIndex].fullName);    
        renderPPlocation(activePPs[ppIndex]);
        if (ppIndex < activePPs.length - 1) {        
            ppIndex++;            
        } else {
            ppIndex = 0;
        }  
    }, 4000); 

    
    
    
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        const debounceSettings = [
            "minSegmentLength",
            "gradientOpacity",
            "fontScale",
            "lineSize",
            "yAxisMin"
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
