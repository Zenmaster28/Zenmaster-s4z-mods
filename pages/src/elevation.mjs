import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './elevation-segments.mjs';
import * as fields from '/pages/src/fields.mjs';


//common.enableSentry();

const doc = document.documentElement;
const L = sauce.locale;
const imperial = !!common.storage.get('/imperialUnits');
L.setImperial(imperial);

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
    pinColorMarked: "#9cb7ec",
    showSegmentFinish: false,
    minSegmentLength: 500,
    showNextSegment: true,
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
    xAxisInverse: false
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

function arraysEqual(arr1, arr2) {
    if (arr1 && arr2)
    {
        return arr1.every((value, index) => value === arr2[index]);
    }
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

function createElevationProfile({worldList}) {
    const el = document.querySelector('.elevation-profile');
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
    const pinColorMarked = settings.pinColorMarked;typeof(settings.colorScheme) == "undefined" ? common.settingsStore.set("colorScheme", "sauce") : null
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
    const showNextSegmentFinish = settings.showNextSegmentFinish
    typeof(settings.invertSegmentText) == "undefined" ? common.settingsStore.set("invertSegmentText", "false") : null;
    const invertSegmentText = settings.invertSegmentText;
    typeof(settings.invertSegmentBool) == "undefined" ? common.settingsStore.set("invertSegmentBool", false) : null;
    const invertSegmentBool = settings.invertSegmentBool;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showNextSegmentFinish, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, behindDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showRobopacersGap, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, pinName, useCustomPin, customPin, zoomSegmentOnlyWithinApproach, showAllArches, showGroups, showLineAhead, distanceAhead, aheadLineColor, aheadLineType, showNextPowerup, disablePenRouting, zoomRemainingRoute, showCurrentAltitude, showRouteMaxElevation, showXaxis, xAxisIncrements, xAxisInverse, invertSegmentBool});
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
}


export async function main() {
    common.initInteractionListeners();   
    
    const editSegmentsButton = document.getElementById("editSegmentsButton")
    editSegmentsButton.addEventListener("click", function() {
        editSegments();
    });
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
    const worldList = await common.getWorldList();    
    elProfile = settings.profileOverlay && createElevationProfile({worldList});
    const urlQuery = new URLSearchParams(location.search);
    
    if (urlQuery.has('preview')) {
        const center = urlQuery.get('center');
        const [course, road] = urlQuery.get('preview').split(',');
        const routeId = urlQuery.get('route');        
        //await zwiftMap.setCourse(+course || 6);
        if (elProfile) {
            let routeInfo = await common.getRoute(routeId);
            let routeCourse = routeInfo.courseId;
            await elProfile.setCourse(+routeCourse || 13);
            //await elProfile.setRoute(routeId);
        }
        if (center) {
            //zwiftMap.setCenter(center.split(',').map(Number));
        }
        if (routeId) {
            
            
        } else {
            //zwiftMap.setActiveRoad(+road || 0);
        }
        if (elProfile) {
            if (routeId) {
                await elProfile.setRoute(+routeId);
            } else {
                elProfile.setRoad(+road || 0);
            }
        }
    } else {
        await initialize();        
        //await getSegmentsOnRoute(elProfile.routeId);
        //elProfile.getSegmentsOnRoute();
        
        common.subscribe('watching-athlete-change', async athleteId => {
            console.log("Watching athlete changed to ", athleteId)
            if (!inGame) {                
                await initialize();
            } else {
                console.log("Setting watching athlete to ", athleteId)
                setWatching(athleteId);
                //location.reload();
            }
        });
        
        setInterval(() => {
            //inGame = performance.now() - watchdog < 10000;
        }, 3333);
        if (settings.showGroups) {
            common.subscribe('athlete/watching', ad => {
                //fieldRenderer.fps = 5;
                let states = [];
                ad.state.isGroup = true;
                states.push(ad.state)
                //debugger
                elProfile.renderAthleteStates(states);

                if (ad.segmentData) { // ugh
                    if (ad.segmentData.nextSegment.distanceToGo) { // double ugh
                        
                        if (ad.segmentData.nextSegment.distanceToGoUnits == "m" && fieldRenderer.fps != 5) {
                            //console.log("fps set to 5")
                            fieldRenderer.fps = 5;
                        } else if (ad.segmentData.nextSegment.distanceToGoUnits == "km" && fieldRenderer.fps != 1) {
                            //console.log("fps set to 1")
                            fieldRenderer.fps = 1;
                        }
                    }
                }
                if (ad.remainingType == "event" && ad.remainingMetric == "distance") {
                    elProfile.remainingDistance = ad.remaining;
                    elProfile.remainingMetric = ad.remainingType;
                    elProfile.remainingType = ad.remainingType
                } else {
                    elProfile.remainingDistance = null;
                    elProfile.remainingType = null;
                    elProfile.remainingMetric = null;
                }
                fieldRenderer.setData(ad);
                fieldRenderer.render();                       
            });
            common.subscribe('groups', async groups => {
                //console.log("Groups around ", groups.length)
                //debugger
                if (!inGame) {
                    console.log("Not inGame, initializing")   
                    await initialize();
                }
                let states = [];
                let ts = Date.now()
                for (let group of groups) {
                    let infinite = group.gap < 0 ? -Infinity : Infinity
                    let groupMinimum = {
                        gapDistance: infinite
                    };
                    //debugger
                    for (let athlete of group.athletes) {
                        if (group.watching) {
                            //console.log("continuing after watching")
                            continue;
                            //groupMinimum = group.athletes.find(x => x.watching)
                            
                        } else if (group.gap < 0) { // group is in front so we want least negative gapDistance for the back of the group
                            //debugger
                            //console.log("Group is in front")
                            if (athlete.gapDistance > groupMinimum.gapDistance) {                                
                                groupMinimum = athlete;
                            }
                        } else { // group is behind so we want lease positive gapDistance for the front of the group
                            //debugger
                            //console.log("Group is behind")
                            //debugger
                            if (athlete.gapDistance < groupMinimum.gapDistance) {                                
                                groupMinimum = athlete;
                            }
                        }
                        groupMinimum.state.isGroup = true;  
                        groupMinimum.state.groupSize = group.athletes.length;
                        groupMinimum.state.groupSpeed = group.speed;
                        groupMinimum.state.groupPower = group.power;
                        groupMinimum.state.groupWeight = group.weight;
                        groupMinimum.state.groupGapEst = group.isGapEst;
                        groupMinimum.state.groupSize = group.athletes.length;
                        groupMinimum.state.groupTS = ts;
                        groupMinimum.state.gapTime = groupMinimum.gap;
                        groupMinimum.state.gapDistance = groupMinimum.gapDistance;
                    }
                    if (typeof(groupMinimum.state) != "undefined") {
                        states.push(groupMinimum.state)
                    }
                }
                //debugger
                states = states.filter(x => x.isGroup)
                elProfile.groups = groups;
                elProfile.groupTS = ts;
                if (states.length > 0)  {                     
                    elProfile.renderAthleteStates(states);
                }
            });
        } else {
            common.subscribe('athlete/watching', ad => {
                //fieldRenderer.fps = 5;
                if (ad.segmentData) { // ugh
                    if (ad.segmentData.nextSegment.distanceToGo) { // double ugh
                        
                        if (ad.segmentData.nextSegment.distanceToGoUnits == "m" && fieldRenderer.fps != 5) {
                            //console.log("fps set to 5")
                            fieldRenderer.fps = 5;
                        } else if (ad.segmentData.nextSegment.distanceToGoUnits == "km" && fieldRenderer.fps != 1) {
                            //console.log("fps set to 1")
                            fieldRenderer.fps = 1;
                        }
                    }
                }
                if (ad.remainingType == "event" && ad.remainingMetric == "distance") {
                    elProfile.remainingDistance = ad.remaining;
                    elProfile.remainingMetric = ad.remainingType;
                    elProfile.remainingType = ad.remainingType
                } else {
                    elProfile.remainingDistance = null;
                    elProfile.remainingType = null;
                    elProfile.remainingMetric = null;
                }
                fieldRenderer.setData(ad);
                fieldRenderer.render();                       
            });
            common.subscribe('states', async states => {
                if (!inGame) {                
                    await initialize();
                }
                if (!elProfile.watchingId) {
                    console.log("watching not set.")
                    await initialize();
                }
                watchdog = performance.now();
                //elProfile.renderAthleteStates(states);
                if (elProfile) {                                      
                    elProfile.renderAthleteStates(states);
                }
            });
        }
    }
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        const propsSetroute = [
            'lineType',
            'lineTypeFinish',
            'lineSize',
            'lineTextColor',
            'showLapMarker',
            'showSegmentFinish',
            'minSegmentLength',
            'showSegmentStart',
            'showLoopSegments',
            'showCompletedLaps',
            'fontScale',
            'colorScheme',
            'yAxisMin',
            'gradientOpacity',
            'overrideDistance',
            'overrideLaps',
            'showAllArches',
            'showLineAhead'
        ];
        const props = [
            'pinSize',
            'pinColor',
            'pinColorMarked',
            'showNextSegment',
            'showMyPin',
            'setAthleteSegmentData',
            'forwardDistance',
            'behindDistance',
            'showTeamMembers',
            'showMarkedRiders',
            'showAllRiders',
            'showRobopacers',
            'showLeaderSweep',
            'zoomNextSegmentApproach',
            'zoomFinalKm',
            'zoomSlider',
            'pinName',
            'useCustomPin',
            'customPin',
            'distanceAhead',
            'aheadLineType',
            'aheadLineColor',
            'debugXcoord',
            'debugXcoordDistance',
            'debugPinPlacement',
            'debugPinRoad',
            'debugPinRP',
            'debugPinDistance',
            'showNextPowerup',
            'zoomRemainingRoute',
            'showCurrentAltitude',
            'showRouteMaxElevation',
            'showRobopacersGap',
            'showNextSegmentFinish'
        ]
        //console.log(changed);
        if (changed.has('editedSegments')) {
            let editedSegments = JSON.parse(changed.get('editedSegments'))
            elProfile.editedSegments = editedSegments;            
            elProfile.setRoute(elProfile.routeId)            
        }
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
                        changed.has('fontScale') ||                        
                        changed.has('singleLapView') ||
                        changed.has('showGroups') ||
                        changed.has('disablePenRouting') ||
                        changed.has('showXaxis')
                    )
                {                    
                    location.reload();
        } else if (changed.has('profileZoom')) {
            elProfile.profileZoom = changed.get('profileZoom')
            if (!changed.get('profileZoom')) {
                location.reload()                
            }
        } else if (changed.has('zoomNextSegment')) {
            elProfile.zoomNextSegment = changed.get('zoomNextSegment')
            if (!changed.get('zoomNextSegment')) {
                location.reload()
            }
        } else if (changed.has('zoomSegmentOnlyWithinApproach')) {
            elProfile.zoomSegmentOnlyWithinApproach = changed.get('zoomSegmentOnlyWithinApproach')
            if (!changed.get('zoomSegmentOnlyWithinApproach')) {
                location.reload()
            }
        }  else if (changed.has('dataTransparency')) {
            doc.style.setProperty('--dataTransparency', common.settingsStore.get('dataTransparency'));
        } else if (changed.has('xAxisIncrements') || changed.has("xAxisInverse")) {
            if (changed.has('xAxisIncrements')) {
                elProfile.xAxisIncrements = changed.get('xAxisIncrements')
            } else {
                elProfile.xAxisInverse = changed.get('xAxisInverse')   
            }
            let min;
            let max;
            const profileDatazoom = elProfile.chart.getOption().dataZoom;
            if (profileDatazoom.length > 0) {
                min = profileDatazoom[0].startValue;
                max = profileDatazoom[0].endValue;
            } else {
                min = 0;
                max = elProfile.routeDistances.at(-1);
            }
            elProfile.scaleXaxis(min, max)
        } else if (changed.has('invertSegmentText')) {
            const invertBool = changed.get('invertSegmentText') === "true";
            common.settingsStore.set('invertSegmentBool', invertBool);
            elProfile['invertSegmentBool'] = invertBool;
            elProfile.setRoute(elProfile.routeId);
        }
        props.forEach(property => {
            if (changed.has(property)) {                
                elProfile[property] = changed.get(property);                
            }            
        });
        propsSetroute.forEach(property => {
            if (changed.has(property)) {                
                elProfile[property] = changed.get(property);
                elProfile.setRoute(elProfile.routeId);
            }
        });
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}

setBackground();
