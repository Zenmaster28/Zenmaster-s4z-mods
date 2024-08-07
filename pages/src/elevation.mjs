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
    showTeamMembers: false,
    showMarkedRiders: false,
    showAllRiders: true,
    colorScheme: "sauce",
    lineTextColor: "#ffffff",
    showRobopacers: false,
    showLeaderSweep: false,
    gradientOpacity: 0.7,
    pinName: "Default",
    useCustomPin: false,
    showAllArches: false
});

const settings = common.settingsStore.get();


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
    typeof(settings.pinName) == "undefined" ? common.settingsStore.set("pinName", "Default") : null;
    const pinName = settings.pinName;
    typeof(settings.useCustomPin) == "undefined" ? common.settingsStore.set("useCustomPin", false) : null;
    const useCustomPin = settings.useCustomPin;
    typeof(settings.customPin) == "undefined" ? common.settingsStore.set("customPin", "") : null;
    const customPin = settings.customPin;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, pinName, useCustomPin, customPin, zoomSegmentOnlyWithinApproach, showAllArches});
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
    //console.log("Initializing...", ad)
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
            return ['ev', 'game-laps', 'progress', 'rt', 'el', 'grade', 'altitude'].includes(type);
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
            if (!inGame) {                
                await initialize();
            } else {
                setWatching(athleteId);
                //location.reload();
            }
        });
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
            fieldRenderer.setData(ad);
            fieldRenderer.render();                       
        });
        setInterval(() => {
            inGame = performance.now() - watchdog < 10000;
        }, 3333);
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
            'showAllArches'
        ];
        const props = [
            'pinSize',
            'pinColor',
            'pinColorMarked',
            'showNextSegment',
            'showMyPin',
            'setAthleteSegmentData',
            'forwardDistance',
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
            'customPin'
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
                        changed.has('singleLapView')                        
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
